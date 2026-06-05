/**
 * process-campaign-dispatch
 *
 * Cron-driven (and manually invokable) campaign dispatch worker.
 * verify_jwt = false — called by pg_cron with anon bearer; authenticates
 * internally via SUPABASE_SERVICE_ROLE_KEY (same pattern as job-worker).
 *
 * Per-invocation budget: ~50 s. Executions left pending are retried on the
 * next minute tick.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createLogger } from '../_shared/logger.ts'
import { corsHeaders, DataSanitizer } from '../_shared/validation.ts'
import { ProviderFactory } from '../_shared/provider-factory.ts'

// ─── Types ──────────────────────────────────────────────────────────────────

interface Campaign {
  id: string
  tenant_id: string
  whatsapp_instance_id: string
  name: string
  status: string
  message_type: 'text' | 'image' | 'video' | 'document' | 'audio'
  message_template: string | null
  message_templates: string[] | null
  enable_message_randomization: boolean
  media_url: string | null
  media_caption: string | null
  delay_between_messages: number | null
  min_delay_seconds: number | null
  max_delay_seconds: number | null
  respect_business_hours: boolean
  business_hours_start: string | null  // 'HH:MM:SS'
  business_hours_end: string | null
  daily_send_limit: number | null
  timezone: string | null
}

interface CampaignExecution {
  id: string
  campaign_id: string
  tenant_id: string
  contact_id: string | null
  contact_identifier: string   // phone
  contact_name: string | null
  message_text: string | null
  status: string
  attempts: number
  provider_message_id: string | null
  error_message: string | null
}

// ─── Spintax + variable substitution ────────────────────────────────────────

/**
 * Substitute {var} / {{var}} placeholders then evaluate {opt1|opt2} spintax.
 * Supports both single-brace {name} and double-brace {{name}} forms.
 */
function processSpintax(text: string, variables: Record<string, string> = {}): string {
  let result = text

  // 1. Double braces {{var}}
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
  }

  // 2. Single braces {var} — only exact key matches (not pipes)
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
  }

  // 3. Spintax {opt1|opt2} — must contain a pipe
  const spintaxRegex = /{([^{}]*\|[^{}]*)}/g
  result = result.replace(spintaxRegex, (_match, options: string) => {
    const choices = options.split('|')
    return choices[Math.floor(Math.random() * choices.length)]
  })

  return result
}

function buildVariables(name: string, phone: string, email: string): Record<string, string> {
  const firstName = (name || '').split(/\s+/)[0] || name
  return {
    name,
    first_name: firstName,
    phone,
    email,
    // Portuguese aliases for backward compat
    nome: name,
    primeiro_nome: firstName,
    telefone: phone,
  }
}

// ─── Business-hours check ────────────────────────────────────────────────────

function isWithinBusinessHours(campaign: Campaign): boolean {
  if (!campaign.respect_business_hours) return true
  if (!campaign.business_hours_start || !campaign.business_hours_end) return true

  const tz = campaign.timezone || 'America/Sao_Paulo'
  const now = new Date()

  // Convert "now" to the campaign's timezone, extract HH:MM
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(now)
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10)
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10)
  const currentMinutes = hour * 60 + minute

  const [startH, startM] = campaign.business_hours_start.split(':').map(Number)
  const [endH, endM] = campaign.business_hours_end.split(':').map(Number)
  const startMinutes = startH * 60 + startM
  const endMinutes = endH * 60 + endM

  return currentMinutes >= startMinutes && currentMinutes < endMinutes
}

// ─── Daily limit check ───────────────────────────────────────────────────────

async function getDailySentCount(supabase: SupabaseClient, campaignId: string, tz: string): Promise<number> {
  // Count executions with a terminal "sent" status today (in campaign timezone)
  // We use UTC date range converted from the campaign's local midnight.
  const now = new Date()
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz || 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const localDate = formatter.format(now) // 'YYYY-MM-DD'

  // Query sent_at within local calendar day boundaries (UTC strings).
  // Postgres compares timestamptz against these UTC ISO strings correctly.
  // Tolerance of up to ±1 day-boundary hour is acceptable for limit enforcement.
  const { count } = await supabase
    .from('campaign_executions')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .in('status', ['sent', 'delivered', 'read', 'replied'])
    .gte('sent_at', `${localDate}T00:00:00`)
    .lt('sent_at', `${localDate}T23:59:59.999`)

  return count ?? 0
}

// ─── Inter-send delay ────────────────────────────────────────────────────────

function resolveDelay(campaign: Campaign): number {
  if (campaign.min_delay_seconds != null && campaign.max_delay_seconds != null) {
    const min = campaign.min_delay_seconds * 1000
    const max = campaign.max_delay_seconds * 1000
    return Math.floor(Math.random() * (max - min + 1)) + min
  }
  if (campaign.delay_between_messages != null) {
    return campaign.delay_between_messages * 1000
  }
  return 1500 // default 1.5 s
}

// ─── Extract provider message ID from raw response ───────────────────────────

function extractMessageId(result: any): string | null {
  if (!result) return null
  // Evolution: result.key.id
  if (result.key?.id) return result.key.id
  // Meta: result.messages[0].id
  if (Array.isArray(result.messages) && result.messages[0]?.id) return result.messages[0].id
  // WAHA / generic
  if (result.id) return String(result.id)
  if (result.messageId) return String(result.messageId)
  return null
}

// ─── Main handler ────────────────────────────────────────────────────────────

serve(async (req) => {
  const logger = createLogger(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const BUDGET_MS = 50_000  // 50 s total budget
    const startTime = Date.now()

    let processed = 0
    let sent = 0
    let failed = 0

    // ── Step 1: Promote due scheduled campaigns ──────────────────────────────
    // Attempt the optional RPC first; fall back to a direct UPDATE if it does
    // not exist. The COALESCE(started_at, now()) semantic is approximated by
    // always setting started_at — campaigns only transition scheduled→active
    // once so overwriting started_at here is harmless.
    const now = new Date().toISOString()
    const { error: promoteError } = await supabase.rpc('promote_scheduled_campaigns')
    if (promoteError) {
      logger.warn('RPC promote_scheduled_campaigns unavailable — using direct update', {
        error: promoteError.message,
      })
      await supabase
        .from('mass_message_campaigns')
        .update({ status: 'active', started_at: now })
        .eq('status', 'scheduled')
        .lte('scheduled_at', now)
        .is('paused_at', null)
        .is('cancelled_at', null)
    }

    logger.info('Campaign dispatch worker started', { budget_ms: BUDGET_MS })

    // ── Step 2: Fetch a batch of due pending executions ─────────────────────
    // Two-step: get active campaign IDs first, then get pending executions.
    const { data: activeCampaignIds } = await supabase
      .from('mass_message_campaigns')
      .select('id')
      .eq('status', 'active')
      .is('paused_at', null)
      .is('cancelled_at', null)

    if (!activeCampaignIds || activeCampaignIds.length === 0) {
      logger.info('No active campaigns, nothing to dispatch')
      return new Response(JSON.stringify({ processed: 0, sent: 0, failed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const campaignIdList = activeCampaignIds.map((r: any) => r.id)

    const { data: executions, error: execError } = await supabase
      .from('campaign_executions')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString())
      .in('campaign_id', campaignIdList)
      .order('scheduled_at', { ascending: true })
      .limit(50)

    if (execError) {
      throw new Error(`Failed to fetch executions: ${execError.message}`)
    }

    if (!executions || executions.length === 0) {
      logger.info('No pending executions due right now')
      return new Response(JSON.stringify({ processed: 0, sent: 0, failed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    logger.info(`Fetched ${executions.length} pending executions`)

    // ── Step 3: Group by campaign, load campaigns once ──────────────────────
    const uniqueCampaignIds = [...new Set(executions.map((e: CampaignExecution) => e.campaign_id))]

    const campaignMap = new Map<string, Campaign>()
    const instanceMap = new Map<string, any>()   // campaign_id → instance row
    const dailySentMap = new Map<string, number>() // campaign_id → count today
    const skippedCampaigns = new Set<string>()

    for (const cid of uniqueCampaignIds) {
      const { data: campaign, error: campErr } = await supabase
        .from('mass_message_campaigns')
        .select('*')
        .eq('id', cid)
        .single()

      if (campErr || !campaign) {
        logger.warn(`Cannot load campaign ${cid}`, { error: campErr?.message })
        skippedCampaigns.add(cid)
        continue
      }

      // Business hours check
      if (!isWithinBusinessHours(campaign as Campaign)) {
        logger.info(`Skipping campaign ${cid} — outside business hours`)
        skippedCampaigns.add(cid)
        continue
      }

      // Load WhatsApp instance
      const { data: instanceRow, error: instErr } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('id', campaign.whatsapp_instance_id)
        .single()

      if (instErr || !instanceRow) {
        logger.warn(`Cannot load instance for campaign ${cid}`, { error: instErr?.message })
        skippedCampaigns.add(cid)
        continue
      }

      // Daily limit check
      if (campaign.daily_send_limit != null) {
        const todayCount = await getDailySentCount(
          supabase,
          cid,
          campaign.timezone || 'America/Sao_Paulo',
        )
        dailySentMap.set(cid, todayCount)
        if (todayCount >= campaign.daily_send_limit) {
          logger.info(`Campaign ${cid} reached daily limit (${todayCount}/${campaign.daily_send_limit})`)
          skippedCampaigns.add(cid)
          continue
        }
      }

      campaignMap.set(cid, campaign as Campaign)
      instanceMap.set(cid, instanceRow)
    }

    // ── Step 4: Process executions ──────────────────────────────────────────
    const touchedCampaigns = new Set<string>()

    for (const exec of executions as CampaignExecution[]) {
      // Budget check — leave at least 3 s for cleanup RPCs
      if (Date.now() - startTime > BUDGET_MS - 3000) {
        logger.info('Budget nearly exhausted — stopping dispatch loop early')
        break
      }

      const { campaign_id } = exec

      if (skippedCampaigns.has(campaign_id)) continue

      const campaign = campaignMap.get(campaign_id)
      const instanceRow = instanceMap.get(campaign_id)

      if (!campaign || !instanceRow) {
        skippedCampaigns.add(campaign_id)
        continue
      }

      // Daily limit enforcement (decrement as we send)
      if (campaign.daily_send_limit != null) {
        const count = dailySentMap.get(campaign_id) ?? 0
        if (count >= campaign.daily_send_limit) {
          logger.info(`Campaign ${campaign_id} hit daily limit mid-batch`)
          skippedCampaigns.add(campaign_id)
          continue
        }
      }

      processed++

      // 4a. Mark as processing (updated_at stamps the lock so a crashed run's
      // rows can be reclaimed by promote_scheduled_campaigns on a later tick).
      await supabase
        .from('campaign_executions')
        .update({ status: 'processing', updated_at: new Date().toISOString() })
        .eq('id', exec.id)

      // 4b. Resolve phone and contact info
      let phone = exec.contact_identifier
      let contactName = exec.contact_name || ''
      let contactEmail = ''

      if (exec.contact_id) {
        const { data: contact } = await supabase
          .from('contacts')
          .select('phone, name, email')
          .eq('id', exec.contact_id)
          .maybeSingle()

        if (contact) {
          phone = contact.phone || phone
          contactName = contact.name || contactName
          contactEmail = contact.email || ''
        }
      }

      // Strip non-numeric from phone for safety
      phone = phone.replace(/\D/g, '')

      if (!phone) {
        await supabase.from('campaign_executions').update({
          status: 'failed',
          failed_at: new Date().toISOString(),
          error_message: 'No valid phone number for recipient',
          attempts: exec.attempts + 1,
        }).eq('id', exec.id)
        failed++
        processed--
        continue
      }

      // 4c. Pick message template
      let rawMessage: string
      if (
        campaign.enable_message_randomization &&
        Array.isArray(campaign.message_templates) &&
        campaign.message_templates.length > 0
      ) {
        const idx = Math.floor(Math.random() * campaign.message_templates.length)
        rawMessage = campaign.message_templates[idx]
      } else {
        rawMessage = campaign.message_template || exec.message_text || ''
      }

      // 4d. Substitute variables then run spintax
      const variables = buildVariables(
        contactName || phone,
        phone,
        contactEmail,
      )
      const finalText = processSpintax(rawMessage, variables)

      // For media campaigns, caption follows same substitution path
      const finalCaption = campaign.media_caption
        ? processSpintax(campaign.media_caption, variables)
        : ''

      // 4e. Send via provider
      try {
        const provider = await ProviderFactory.getProvider(instanceRow, supabase)

        let result: any

        if (campaign.message_type === 'text') {
          result = await provider.sendMessage(phone, finalText)
        } else {
          // image | video | document | audio
          const mediaUrl = campaign.media_url
          if (!mediaUrl) {
            throw new Error(`Campaign ${campaign_id} has no media_url for message_type=${campaign.message_type}`)
          }
          // Caption: use finalText if non-empty, else finalCaption
          const caption = finalText.trim() || finalCaption
          result = await provider.sendMedia(phone, mediaUrl, {
            caption,
            mediaType: campaign.message_type as 'image' | 'video' | 'document' | 'audio',
          })
        }

        const msgId = extractMessageId(result)

        await supabase.from('campaign_executions').update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          provider_message_id: msgId,
          error_message: null,
        }).eq('id', exec.id)

        sent++
        touchedCampaigns.add(campaign_id)

        // Mirror the campaign message into the Conversas thread, tagged by origin, so the
        // conversation shows it came from a campaign. Non-fatal: never affect the send result.
        // supabase-js does not throw on DB errors — it returns { error } — so check it explicitly.
        if (exec.contact_id) {
          const msgContent = campaign.message_type === 'text'
            ? finalText
            : (finalText.trim() || finalCaption)
          const { error: mirrorErr } = await supabase.from('messages').insert({
            contact_id: exec.contact_id,
            tenant_id: exec.tenant_id,
            whatsapp_instance_id: instanceRow.id,
            direction: 'outbound',
            message_type: campaign.message_type ?? 'text',
            content: msgContent,
            evolution_message_id: msgId,
            status: 'sent',
            source: 'campaign',
            campaign_id: campaign.id,
          })
          if (mirrorErr) {
            logger.warn('Campaign message mirror insert failed', {
              campaign: campaign_id,
              error: mirrorErr.message,
            })
          }
        }

        // Bump daily count
        if (campaign.daily_send_limit != null) {
          dailySentMap.set(campaign_id, (dailySentMap.get(campaign_id) ?? 0) + 1)
        }

        logger.info('Execution sent', {
          executionId: exec.id,
          campaign: campaign_id,
          phone: DataSanitizer.sanitizePhoneNumber(phone),
          messageType: campaign.message_type,
          msgId,
        })
      } catch (sendErr: any) {
        const attempts = exec.attempts + 1
        const maxAttempts = 3

        logger.warn('Execution send failed', {
          executionId: exec.id,
          campaign: campaign_id,
          attempts,
          error: sendErr.message,
        })

        if (attempts >= maxAttempts) {
          await supabase.from('campaign_executions').update({
            status: 'failed',
            failed_at: new Date().toISOString(),
            attempts,
            error_message: sendErr.message,
          }).eq('id', exec.id)
          failed++
        } else {
          // Retry on next invocation — back to pending
          await supabase.from('campaign_executions').update({
            status: 'pending',
            attempts,
            error_message: sendErr.message,
          }).eq('id', exec.id)
        }

        touchedCampaigns.add(campaign_id)
        // Continue — one failure must not abort the batch
      }

      // Inter-send delay (skip on last item or if budget too tight)
      if (Date.now() - startTime < BUDGET_MS - 5000) {
        const delayMs = resolveDelay(campaign)
        await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, 4000)))
      }
    }

    // ── Step 5: Recompute metrics and finalize ───────────────────────────────
    for (const cid of touchedCampaigns) {
      try {
        await supabase.rpc('recompute_campaign_metrics', { p_campaign_id: cid })
      } catch (rpcErr: any) {
        logger.warn('recompute_campaign_metrics failed', { campaign: cid, error: rpcErr.message })
      }
    }

    try {
      await supabase.rpc('finalize_completed_campaigns')
    } catch (rpcErr: any) {
      logger.warn('finalize_completed_campaigns failed', { error: rpcErr.message })
    }

    const duration = Date.now() - startTime
    logger.info('Campaign dispatch finished', { processed, sent, failed, duration_ms: duration })

    return new Response(JSON.stringify({ processed, sent, failed, duration_ms: duration }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error: any) {
    const logger2 = createLogger(req)
    logger2.error('Campaign dispatch worker error', { error: error.message })
    return new Response(JSON.stringify({ error: error.message, success: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
