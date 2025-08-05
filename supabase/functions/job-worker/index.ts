import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Job {
  id: string
  tenant_id: string
  job_type: string
  job_data: any
  current_attempts: number
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log('🔄 Job worker started...')

    // Process jobs for a limited time (9 minutes to stay under 10min limit)
    const maxProcessingTime = 9 * 60 * 1000 // 9 minutes
    const startTime = Date.now()

    let jobsProcessed = 0
    let successCount = 0
    let errorCount = 0

    while (Date.now() - startTime < maxProcessingTime) {
      try {
        // Get next job from queue
        const { data: jobs, error: dequeueError } = await supabase.rpc('dequeue_next_job', {
          p_job_types: ['send_message', 'campaign_message', 'follow_up_message', 'chatbot_response']
        })

        if (dequeueError) {
          console.error('Error dequeuing job:', dequeueError)
          await new Promise(resolve => setTimeout(resolve, 5000)) // Wait 5s before retry
          continue
        }

        if (!jobs || jobs.length === 0) {
          console.log('No jobs in queue, waiting...')
          await new Promise(resolve => setTimeout(resolve, 10000)) // Wait 10s for new jobs
          continue
        }

        const job: Job = jobs[0]
        console.log(`📋 Processing job ${job.id} (${job.job_type}) - Attempt ${job.current_attempts}`)

        try {
          await processJob(supabase, job)
          
          // Mark job as completed
          await supabase.rpc('complete_job', {
            p_job_id: job.id,
            p_success: true
          })

          successCount++
          console.log(`✅ Job ${job.id} completed successfully`)

        } catch (jobError: any) {
          console.error(`❌ Job ${job.id} failed:`, jobError.message)
          
          // Mark job as failed
          await supabase.rpc('complete_job', {
            p_job_id: job.id,
            p_success: false,
            p_error_message: jobError.message
          })

          errorCount++
        }

        jobsProcessed++

        // Small delay between jobs to prevent overwhelming
        await new Promise(resolve => setTimeout(resolve, 1000))

      } catch (error: any) {
        console.error('Error in job processing loop:', error.message)
        await new Promise(resolve => setTimeout(resolve, 5000))
      }
    }

    console.log(`🏁 Job worker finished. Processed: ${jobsProcessed}, Success: ${successCount}, Errors: ${errorCount}`)

    return new Response(JSON.stringify({
      success: true,
      jobsProcessed,
      successCount,
      errorCount,
      duration: Date.now() - startTime
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error('Job worker error:', error.message)
    
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})

async function processJob(supabase: any, job: Job) {
  const { job_type, job_data, tenant_id } = job

  switch (job_type) {
    case 'send_message':
      await processSendMessage(supabase, job_data, tenant_id)
      break
      
    case 'campaign_message':
      await processCampaignMessage(supabase, job_data, tenant_id)
      break
      
    case 'follow_up_message':
      await processFollowUpMessage(supabase, job_data, tenant_id)
      break
      
    case 'chatbot_response':
      await processChatbotResponse(supabase, job_data, tenant_id)
      break
      
    default:
      throw new Error(`Unknown job type: ${job_type}`)
  }
}

async function processSendMessage(supabase: any, jobData: any, tenantId: string) {
  const { instanceName, phone, message, contactId } = jobData

  // Get Evolution API settings for tenant
  const { data: tenant } = await supabase
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .single()

  if (!tenant?.settings?.evolutionApi) {
    throw new Error('Evolution API not configured for tenant')
  }

  const { serverUrl, apiKey } = tenant.settings.evolutionApi

  // Send message via Evolution API
  const response = await fetch(`${serverUrl}/message/sendText/${instanceName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': apiKey,
    },
    body: JSON.stringify({
      number: phone,
      text: message,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Evolution API Error: ${errorText}`)
  }

  const result = await response.json()

  // Save message to database
  if (contactId) {
    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('id')
      .eq('instance_key', instanceName)
      .eq('tenant_id', tenantId)
      .single()

    if (instance) {
      await supabase.from('messages').insert({
        contact_id: contactId,
        tenant_id: tenantId,
        whatsapp_instance_id: instance.id,
        direction: 'outbound',
        message_type: 'text',
        content: message,
        evolution_message_id: result.key?.id,
        status: 'sent',
      })
    }
  }

  console.log(`📤 Message sent to ${phone} via ${instanceName}`)
}

async function processCampaignMessage(supabase: any, jobData: any, tenantId: string) {
  const { campaignId, contactId, messageText, instanceName } = jobData

  // Get contact info
  const { data: contact } = await supabase
    .from('contacts')
    .select('phone, name')
    .eq('id', contactId)
    .single()

  if (!contact) {
    throw new Error('Contact not found')
  }

  // Process spintax variations in message
  const finalMessage = processSpintax(messageText, {
    nome: contact.name || contact.phone,
    telefone: contact.phone,
  })

  try {
    // Send the message
    await processSendMessage(supabase, {
      instanceName,
      phone: contact.phone,
      message: finalMessage,
      contactId,
    }, tenantId)

    // Update campaign execution status
    await supabase
      .from('campaign_executions')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
      .eq('campaign_id', campaignId)
      .eq('contact_id', contactId)

    // Update campaign stats
    await supabase.rpc('increment_campaign_sent_count', {
      p_campaign_id: campaignId
    })

  } catch (error) {
    // Update campaign execution status
    await supabase
      .from('campaign_executions')
      .update({
        status: 'failed',
        failed_at: new Date().toISOString(),
        error_message: error.message,
      })
      .eq('campaign_id', campaignId)
      .eq('contact_id', contactId)

    throw error
  }
}

async function processFollowUpMessage(supabase: any, jobData: any, tenantId: string) {
  const { sequenceId, stepId, contactId, instanceName } = jobData

  // Get follow-up step details
  const { data: step } = await supabase
    .from('follow_up_steps')
    .select('message_text, message_type, media_url')
    .eq('id', stepId)
    .single()

  if (!step) {
    throw new Error('Follow-up step not found')
  }

  // Get contact info
  const { data: contact } = await supabase
    .from('contacts')
    .select('phone, name')
    .eq('id', contactId)
    .single()

  if (!contact) {
    throw new Error('Contact not found')
  }

  // Process message with variables
  const finalMessage = processSpintax(step.message_text, {
    nome: contact.name || contact.phone,
    telefone: contact.phone,
  })

  // Send the message
  await processSendMessage(supabase, {
    instanceName,
    phone: contact.phone,
    message: finalMessage,
    contactId,
  }, tenantId)

  console.log(`📨 Follow-up message sent to ${contact.phone}`)
}

async function processChatbotResponse(supabase: any, jobData: any, tenantId: string) {
  console.log('Processing chatbot response:', jobData);
  
  try {
    // Get chatbot details
    const { data: chatbot, error: chatbotError } = await supabase
      .from('chatbots')
      .select('*')
      .eq('id', jobData.chatbotId)
      .single();

    if (chatbotError || !chatbot) {
      throw new Error(`Chatbot not found: ${chatbotError?.message}`);
    }

    // Get contact details
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', jobData.contactId)
      .single();

    if (contactError || !contact) {
      throw new Error(`Contact not found: ${contactError?.message}`);
    }

    // Process variables in the message template
    const { data: processedMessage, error: processError } = await supabase
      .rpc('process_chatbot_variables', {
        p_message_template: chatbot.response_message,
        p_contact_id: contact.id,
        p_incoming_message: jobData.incomingMessage
      });

    if (processError) {
      throw new Error(`Variable processing failed: ${processError.message}`);
    }

    // Process spintax in the processed message
    const finalMessage = processSpintax(processedMessage || chatbot.response_message);

    console.log('Sending chatbot response:', {
      chatbotName: chatbot.name,
      contactPhone: contact.phone,
      message: finalMessage
    });

    // Send message using processSendMessage
    await processSendMessage(supabase, {
      instanceName: jobData.instanceName,
      phone: contact.phone,
      message: finalMessage,
      contactId: contact.id
    }, tenantId);

    // Mark message as sent by bot in database
    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('id')
      .eq('instance_key', jobData.instanceName)
      .single();

    if (instance) {
      await supabase
        .from('messages')
        .insert({
          contact_id: contact.id,
          tenant_id: tenantId,
          whatsapp_instance_id: instance.id,
          direction: 'outbound',
          message_type: chatbot.response_type || 'text',
          content: finalMessage,
          status: 'sent',
          is_from_bot: true
        });
    }

    console.log(`🤖 Chatbot response sent to ${contact.phone}`);

  } catch (error) {
    console.error('Error processing chatbot response:', error);
    throw error;
  }
}

// Simple spintax processor for message variations
function processSpintax(text: string, variables: Record<string, string> = {}): string {
  let result = text

  // Replace variables first
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value)
  }

  // Process spintax {option1|option2|option3}
  const spintaxRegex = /{([^}]+)}/g
  result = result.replace(spintaxRegex, (match, options) => {
    const choices = options.split('|')
    return choices[Math.floor(Math.random() * choices.length)]
  })

  return result
}