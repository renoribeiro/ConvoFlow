import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createLogger } from '../_shared/logger.ts';
import { corsHeaders } from '../_shared/validation.ts';
import { buildSendMessageJobData, normalizeTagName } from '../_shared/automation-actions.ts';

interface AutomationTrigger {
  type: string;
  // tenant_id is REQUIRED to enforce isolation. service_role bypasses RLS,
  // so the handler relies on this field to scope automation_flows lookup
  // and to populate tenant_id on the executions it creates.
  tenant_id: string;
  data: Record<string, unknown>;
  contact_id?: string;
  message_id?: string;
}

interface AutomationFlow {
  id: string;
  name: string;
  active: boolean;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  steps: any[]; // Kept as any for flexibility, but could be strictly typed if schema is known
}

interface AutomationExecution {
  id: string;
  flow_id: string;
  contact_id: string;
  status: string;
  current_step: number;
  execution_data: Record<string, unknown>;
  automation_flows: AutomationFlow;
}

interface StepConfig {
  type?: string;
  message_template_id?: string;
  custom_message?: string;
  stage_id?: string;
  delay_hours?: number;
  followup_type?: string;
  message?: string;
  tag_name?: string;
  keywords?: string[];
  exact_match?: boolean;
  from_stage?: string;
  to_stage?: string;
  source?: string;
  // schedule_followup extras
  followup_mode?: string;     // 'manual' | 'scheduled'
  followup_task?: string;     // título da tarefa (task NOT NULL no schema)
  followup_priority?: string; // 'high' | 'medium' | 'low'
  [key: string]: unknown;
}

// Tipos de follow-up aceitos pelo CHECK de individual_followups.type.
const FOLLOWUP_TYPES = ['call', 'email', 'whatsapp', 'meeting', 'visit', 'task', 'other'];

interface AutomationStep {
  id: string;
  type: string;
  config: StepConfig;
}

serve(async (req) => {
  const logger = createLogger(req);

  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing Supabase configuration');
    }

    const supabaseClient = createClient(supabaseUrl, supabaseKey);

    const { trigger }: { trigger: AutomationTrigger } = await req.json();

    if (!trigger || !trigger.type || !trigger.tenant_id) {
      logger.warn('Rejected automation trigger: missing required fields', {
        hasTrigger: !!trigger,
        hasType: !!trigger?.type,
        hasTenantId: !!trigger?.tenant_id,
      });
      return new Response(
        JSON.stringify({ error: 'trigger.type and trigger.tenant_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logger.info('Processing automation trigger', {
      triggerType: trigger.type,
      tenantId: trigger.tenant_id,
    });

    // Buscar fluxos ativos com o tipo de gatilho correspondente.
    // Scope explicitly by tenant_id — service_role bypasses RLS, so we
    // MUST filter here to avoid cross-tenant flow execution.
    const { data: flows, error: flowsError } = await supabaseClient
      .from('automation_flows')
      .select('*')
      .eq('tenant_id', trigger.tenant_id)
      .eq('active', true)
      .eq('trigger_type', trigger.type);

    if (flowsError) {
      throw new Error(`Error fetching flows: ${flowsError.message}`);
    }

    if (!flows || flows.length === 0) {
      logger.info('No active flows found for trigger type', { type: trigger.type });
      return new Response(
        JSON.stringify({ message: 'No active flows found', triggered_flows: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const triggeredExecutions = [];

    // Processar cada fluxo
    for (const flow of flows) {
      try {
        // Verificar se o gatilho deve ser executado baseado na configuração
        if (await shouldExecuteTrigger(flow.trigger_config, trigger.data, logger)) {
          logger.info('Triggering flow', { flowName: flow.name, flowId: flow.id });

          // Criar nova execução
          const { data: execution, error: executionError } = await supabaseClient
            .from('automation_executions')
            .insert({
              tenant_id: trigger.tenant_id,
              flow_id: flow.id,
              contact_id: trigger.contact_id,
              trigger_data: trigger.data,
              status: 'pending',
              current_step: 0,
              execution_data: {}
            })
            .select()
            .single();

          if (executionError) {
            logger.error(`Error creating execution for flow ${flow.id}`, { error: executionError });
            continue;
          }

          triggeredExecutions.push({
            flow_id: flow.id,
            flow_name: flow.name,
            execution_id: execution.id
          });

          // Iniciar execução do primeiro step
          await executeNextStep(supabaseClient, execution.id, logger);
        }
      } catch (error: any) {
        logger.error(`Error processing flow ${flow.id}`, { error: error.message });
      }
    }

    return new Response(
      JSON.stringify({
        message: 'Automation triggers processed',
        triggered_flows: triggeredExecutions.length,
        executions: triggeredExecutions
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    logger.error('Error processing automation trigger', { error: error.message });
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

// Função para verificar se um gatilho deve ser executado
async function shouldExecuteTrigger(
  triggerConfig: StepConfig,
  triggerData: Record<string, any>,
  logger: any
): Promise<boolean> {
  try {
    // Para gatilho de mensagem recebida
    if (triggerConfig.keywords && Array.isArray(triggerConfig.keywords)) {
      const messageText = (triggerData.message || '').toLowerCase();
      const exactMatch = triggerConfig.exact_match || false;
      
      // Se não há palavras-chave definidas, executar sempre
      if (triggerConfig.keywords.length === 0) {
        return true;
      }
      
      // Verificar se alguma palavra-chave corresponde
      for (const keyword of triggerConfig.keywords) {
        const keywordLower = keyword.toLowerCase();
        
        if (exactMatch) {
          if (messageText === keywordLower) {
            return true;
          }
        } else {
          if (messageText.includes(keywordLower)) {
            return true;
          }
        }
      }
      
      return false;
    }
    
    // Para gatilho de mudança de estágio
    if (triggerConfig.from_stage || triggerConfig.to_stage) {
      if (triggerConfig.from_stage && triggerData.from_stage !== triggerConfig.from_stage) {
        return false;
      }
      if (triggerConfig.to_stage && triggerData.to_stage !== triggerConfig.to_stage) {
        return false;
      }
    }
    
    // Para gatilho de novo contato
    if (triggerConfig.source && triggerData.source !== triggerConfig.source) {
      return false;
    }
    
    // Para outros tipos de gatilho, executar sempre por padrão
    return true;
  } catch (error: any) {
    logger.error('Error evaluating trigger condition', { error: error.message });
    return false;
  }
}

// Função para executar o próximo step de uma automação
async function executeNextStep(
  supabaseClient: SupabaseClient,
  executionId: string,
  logger: any
): Promise<boolean> {
  try {
    // Buscar dados da execução
    const { data: execution, error: executionError } = await supabaseClient
      .from('automation_executions')
      .select(`
        *,
        automation_flows!inner(*)
      `)
      .eq('id', executionId)
      .in('status', ['pending', 'running'])
      .single();

    if (executionError || !execution) {
      logger.error('Execution not found or not in valid state', { executionId, error: executionError });
      return false;
    }

    const executionData = execution as unknown as AutomationExecution;

    // Parsear steps
    let steps: AutomationStep[];
    try {
      steps = typeof executionData.automation_flows.steps === 'string' 
        ? JSON.parse(executionData.automation_flows.steps)
        : executionData.automation_flows.steps;
    } catch (error: any) {
      logger.error('Error parsing steps', { error: error.message });
      await supabaseClient
        .from('automation_executions')
        .update({ 
          status: 'failed', 
          error_message: 'Invalid steps configuration' 
        })
        .eq('id', executionId);
      return false;
    }

    // Verificar se há mais steps para executar
    if (executionData.current_step >= steps.length) {
      await supabaseClient
        .from('automation_executions')
        .update({ 
          status: 'completed', 
          completed_at: new Date().toISOString() 
        })
        .eq('id', executionId);
      return true;
    }

    // Obter step atual
    const currentStep = steps[executionData.current_step];
    
    // Criar log do step
    const { data: stepLog, error: stepLogError } = await supabaseClient
      .from('automation_step_logs')
      .insert({
        execution_id: executionId,
        step_id: currentStep.id,
        step_type: currentStep.type,
        step_config: currentStep.config,
        status: 'running',
        input_data: executionData.execution_data
      })
      .select()
      .single();

    if (stepLogError) {
      logger.error('Error creating step log', { error: stepLogError });
    }

    // Atualizar status da execução
    await supabaseClient
      .from('automation_executions')
      .update({ status: 'running' })
      .eq('id', executionId);

    // Executar o step baseado no tipo
    const stepResult = await executeStepByType(
      supabaseClient,
      currentStep.config.type || currentStep.type,
      currentStep.config,
      executionData.contact_id,
      executionData.execution_data,
      logger
    );

    // Atualizar log do step
    if (stepLog) {
      await supabaseClient
        .from('automation_step_logs')
        .update({
          status: stepResult ? 'completed' : 'failed',
          completed_at: new Date().toISOString(),
          output_data: stepResult ? { success: true } : { success: false }
        })
        .eq('id', stepLog.id);
    }

    if (stepResult) {
      // Avançar para próximo step
      await supabaseClient
        .from('automation_executions')
        .update({ current_step: executionData.current_step + 1 })
        .eq('id', executionId);

      // Executar próximo step diretamente (sem setTimeout que não é confiável em Deno Edge Functions)
      await executeNextStep(supabaseClient, executionId, logger);
    } else {
      // Marcar execução como falha
      await supabaseClient
        .from('automation_executions')
        .update({ 
          status: 'failed', 
          error_message: 'Step execution failed' 
        })
        .eq('id', executionId);
    }

    return stepResult;
  } catch (error: any) {
    logger.error('Error executing step', { error: error.message });
    
    // Marcar execução como falha
    await supabaseClient
      .from('automation_executions')
      .update({ 
        status: 'failed', 
        error_message: error.message 
      })
      .eq('id', executionId);
    
    return false;
  }
}

// Função para executar steps por tipo
async function executeStepByType(
  supabaseClient: SupabaseClient,
  stepType: string,
  stepConfig: StepConfig,
  contactId: string,
  executionData: Record<string, unknown>,
  logger: any
): Promise<boolean> {
  try {
    logger.info(`Executing step type: ${stepType}`, { config: stepConfig });

    switch (stepType) {
      case 'send_message':
        return await scheduleSendMessage(supabaseClient, stepConfig, contactId, logger);
      
      case 'change_funnel_stage':
        return await changeFunnelStage(supabaseClient, stepConfig, contactId, logger);
      
      case 'schedule_followup':
        return await scheduleFollowup(supabaseClient, stepConfig, contactId, logger);
      
      case 'add_tag':
        return await addContactTag(supabaseClient, stepConfig, contactId, logger);
      
      case 'delay':
        // Para delays, apenas retornar true (implementação real precisaria de agendamento)
        logger.info('Delay step executed (simulated)');
        return true;
      
      default:
        logger.error('Unknown step type', { stepType });
        return false;
    }
  } catch (error: any) {
    logger.error(`Error executing step type ${stepType}`, { error: error.message });
    return false;
  }
}

// Função para enviar mensagem via job_queue.
//
// O envio NÃO é feito aqui: enfileiramos um job 'send_message' em `job_queue`
// (via RPC enqueue_job), que é consumido pelo `job-worker`. O worker resolve a
// instância por `instance_key`, instancia o provider via ProviderFactory
// (Evolution/WAHA/Meta Cloud) e faz o gate autoritativo da janela de 24h.
// O payload precisa casar EXATAMENTE com `processSendMessage` do job-worker:
// { instanceName (= instance_key), phone, message, contactId }.
async function scheduleSendMessage(
  supabaseClient: SupabaseClient,
  stepConfig: StepConfig,
  contactId: string,
  logger: any
): Promise<boolean> {
  try {
    // 1. Resolver o conteúdo: template aprovado ou mensagem personalizada.
    let messageContent = '';
    if (stepConfig.message_template_id) {
      const { data: template } = await supabaseClient
        .from('message_templates')
        .select('content')
        .eq('id', stepConfig.message_template_id)
        .maybeSingle();
      if (template) {
        messageContent = template.content;
      }
    } else if (stepConfig.custom_message) {
      messageContent = stepConfig.custom_message;
    }

    if (!messageContent) {
      logger.error('send_message: nenhum conteúdo de mensagem encontrado', { contactId });
      return false;
    }

    // 2. Resolver o contato → tenant, telefone e instância associada.
    //    service_role ignora RLS; precisamos do tenant_id explícito para o job.
    const { data: contact, error: contactErr } = await supabaseClient
      .from('contacts')
      .select('tenant_id, phone, whatsapp_instance_id')
      .eq('id', contactId)
      .maybeSingle();

    if (contactErr || !contact?.tenant_id || !contact?.phone) {
      logger.error('send_message: contato sem tenant_id/telefone — abortando', {
        contactId,
        error: contactErr?.message,
      });
      return false;
    }
    if (!contact.whatsapp_instance_id) {
      logger.error('send_message: contato sem instância de WhatsApp associada', { contactId });
      return false;
    }

    // 3. Resolver a instância → instance_key (o job-worker busca por instance_key, não por UUID).
    const { data: instance, error: instErr } = await supabaseClient
      .from('whatsapp_instances')
      .select('id, instance_key, provider')
      .eq('id', contact.whatsapp_instance_id)
      .maybeSingle();

    if (instErr || !instance?.instance_key) {
      logger.error('send_message: instância não encontrada para o contato', {
        contactId,
        instanceId: contact.whatsapp_instance_id,
        error: instErr?.message,
      });
      return false;
    }

    // 4. Gate proativo de 24h para instâncias oficiais (Meta Cloud API): evita
    //    enfileirar um job fadado ao erro. O job-worker reverifica antes do envio.
    //    Fail-open em erro de RPC (a Meta rejeita com 131047 se realmente fora da janela).
    if ((instance.provider ?? 'evolution') === 'official') {
      const { data: withinWindow, error: windowError } = await supabaseClient.rpc(
        'is_within_service_window',
        { p_instance_id: instance.id, p_phone: contact.phone }
      );
      if (windowError) {
        logger.warn('send_message: is_within_service_window falhou — fail-open', {
          instanceId: instance.id,
          error: windowError.message,
        });
      } else if (withinWindow === false) {
        logger.warn('send_message: bloqueado — fora da janela de 24h (instância oficial)', {
          contactId,
          instanceId: instance.id,
        });
        return false;
      }
    }

    // 5. Enfileirar o job. enqueue_job é SECURITY DEFINER e popula tenant_id na linha.
    const { error: enqueueError } = await supabaseClient.rpc('enqueue_job', {
      p_tenant_id: contact.tenant_id,
      p_job_type: 'send_message',
      p_job_data: buildSendMessageJobData({
        instanceKey: instance.instance_key,
        phone: contact.phone,
        message: messageContent,
        contactId,
      }),
      p_priority: 5,
    });

    if (enqueueError) {
      logger.error('send_message: falha ao enfileirar job', { error: enqueueError.message });
      return false;
    }

    logger.info('send_message enfileirado no job_queue', {
      contactId,
      instanceKey: instance.instance_key,
      messageLength: messageContent.length,
    });
    return true;
  } catch (error: any) {
    logger.error('Error in scheduleSendMessage', { error: error.message });
    return false;
  }
}

// Função para alterar estágio do funil
async function changeFunnelStage(
  supabaseClient: SupabaseClient,
  stepConfig: StepConfig,
  contactId: string,
  logger: any
): Promise<boolean> {
  try {
    const { error } = await supabaseClient
      .from('contacts')
      .update({ 
        current_stage_id: stepConfig.stage_id,
        updated_at: new Date().toISOString()
      })
      .eq('id', contactId);
    
    if (error) {
      logger.error('Error changing funnel stage', { error });
      return false;
    }
    
    logger.info('Funnel stage changed successfully');
    return true;
  } catch (error: any) {
    logger.error('Error in changeFunnelStage', { error: error.message });
    return false;
  }
}

// Função para agendar follow-up.
//
// Insere na tabela CONSOLIDADA individual_followups (a antiga `followups` nunca
// existiu no banco — este step estava silenciosamente quebrado). Suporta dois
// modos:
//   - 'scheduled': cria um envio agendado (mode='scheduled', status='scheduled')
//     que o followup-processor dispara via provider na data, respeitando a
//     janela de 24h da Meta. Padrão quando há mensagem + tipo whatsapp.
//   - 'manual': cria uma tarefa para o operador (mode='manual', status='pending').
async function scheduleFollowup(
  supabaseClient: SupabaseClient,
  stepConfig: StepConfig,
  contactId: string,
  logger: any
): Promise<boolean> {
  try {
    // Resolve a conta (tenant) e a instância a partir do contato — service_role
    // ignora RLS, então precisamos do tenant_id explícito para isolar a inserção.
    const { data: contact, error: contactErr } = await supabaseClient
      .from('contacts')
      .select('tenant_id, whatsapp_instance_id, name')
      .eq('id', contactId)
      .maybeSingle();

    if (contactErr || !contact?.tenant_id) {
      logger.error('schedule_followup: contato sem tenant_id — abortando', {
        contactId,
        error: contactErr?.message,
      });
      return false;
    }

    const delayHours = stepConfig.delay_hours ?? 24;
    const rawType = (stepConfig.followup_type || 'whatsapp').toLowerCase();
    const followupType = FOLLOWUP_TYPES.includes(rawType) ? rawType : 'whatsapp';
    const message = (stepConfig.message || '').trim();
    const priority = ['high', 'medium', 'low'].includes(stepConfig.followup_priority || '')
      ? (stepConfig.followup_priority as string)
      : 'medium';

    // Modo: explícito > inferido. Com mensagem + whatsapp ⇒ envio agendado.
    const mode =
      stepConfig.followup_mode === 'manual' || stepConfig.followup_mode === 'scheduled'
        ? stepConfig.followup_mode
        : message && followupType === 'whatsapp'
          ? 'scheduled'
          : 'manual';

    const due = new Date();
    due.setHours(due.getHours() + delayHours);
    const dueIso = due.toISOString();

    // task é NOT NULL — usa título explícito, senão um rótulo derivado.
    const task =
      (stepConfig.followup_task || '').trim() ||
      (message ? `Follow-up automático: ${message.slice(0, 80)}` : 'Follow-up automático');

    const row: Record<string, unknown> = {
      tenant_id: contact.tenant_id,
      contact_id: contactId,
      whatsapp_instance_id: contact.whatsapp_instance_id ?? null,
      task,
      due_date: dueIso,
      priority,
      type: followupType,
      mode,
      status: mode === 'scheduled' ? 'scheduled' : 'pending',
      source: 'automation',
      created_by_automation: true,
    };

    if (mode === 'scheduled') {
      row.scheduled_at = dueIso;
      row.message_body = message;
    } else if (message) {
      row.notes = message;
    }

    const { error } = await supabaseClient.from('individual_followups').insert(row);

    if (error) {
      logger.error('Error scheduling followup', { error });
      return false;
    }

    logger.info('Followup scheduled successfully', { mode, type: followupType });
    return true;
  } catch (error: any) {
    logger.error('Error in scheduleFollowup', { error: error.message });
    return false;
  }
}

// Função para adicionar tag ao contato.
//
// As tags NÃO ficam num array em `contacts` (essa coluna não existe). Elas vivem
// na tabela `tags` (UNIQUE(tenant_id, name)) e são vinculadas ao contato pela
// junction `contact_tags` (PK composta (contact_id, tag_id)). Resolvemos/criamos
// a tag por nome dentro da conta e vinculamos de forma idempotente.
async function addContactTag(
  supabaseClient: SupabaseClient,
  stepConfig: StepConfig,
  contactId: string,
  logger: any
): Promise<boolean> {
  try {
    const tagName = normalizeTagName(stepConfig.tag_name);
    if (!tagName) {
      logger.error('add_tag: nome da tag não informado');
      return false;
    }

    // Resolver o tenant do contato — tags são por conta.
    const { data: contact, error: contactErr } = await supabaseClient
      .from('contacts')
      .select('tenant_id')
      .eq('id', contactId)
      .maybeSingle();

    if (contactErr || !contact?.tenant_id) {
      logger.error('add_tag: contato sem tenant_id — abortando', {
        contactId,
        error: contactErr?.message,
      });
      return false;
    }

    // Resolver a tag existente ou criá-la (upsert por UNIQUE(tenant_id, name) — race-safe).
    const { data: tag, error: tagErr } = await supabaseClient
      .from('tags')
      .upsert({ tenant_id: contact.tenant_id, name: tagName }, { onConflict: 'tenant_id,name' })
      .select('id')
      .single();

    if (tagErr || !tag?.id) {
      logger.error('add_tag: falha ao resolver/criar a tag', { error: tagErr?.message });
      return false;
    }

    // Vincular via junction (idempotente — ignora se o vínculo já existe).
    const { error: linkErr } = await supabaseClient
      .from('contact_tags')
      .upsert(
        { contact_id: contactId, tag_id: tag.id },
        { onConflict: 'contact_id,tag_id', ignoreDuplicates: true }
      );

    if (linkErr) {
      logger.error('add_tag: falha ao vincular a tag ao contato', { error: linkErr.message });
      return false;
    }

    logger.info('add_tag: tag vinculada ao contato', { contactId, tagName });
    return true;
  } catch (error: any) {
    logger.error('Error in addContactTag', { error: error.message });
    return false;
  }
}
