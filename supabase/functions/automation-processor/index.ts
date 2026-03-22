import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createLogger } from '../_shared/logger.ts';
import { corsHeaders } from '../_shared/validation.ts';

interface AutomationTrigger {
  type: string;
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
  [key: string]: unknown;
}

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

    logger.info('Processing automation trigger', { triggerType: trigger.type });

    // Buscar fluxos ativos com o tipo de gatilho correspondente
    const { data: flows, error: flowsError } = await supabaseClient
      .from('automation_flows')
      .select('*')
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

// Função para agendar envio de mensagem
async function scheduleSendMessage(
  supabaseClient: SupabaseClient,
  stepConfig: StepConfig,
  contactId: string,
  logger: any
): Promise<boolean> {
  try {
    let messageContent = '';
    
    // Verificar se há template ou mensagem personalizada
    if (stepConfig.message_template_id) {
      const { data: template } = await supabaseClient
        .from('message_templates')
        .select('content')
        .eq('id', stepConfig.message_template_id)
        .single();
      
      if (template) {
        messageContent = template.content;
      }
    } else if (stepConfig.custom_message) {
      messageContent = stepConfig.custom_message;
    }
    
    if (!messageContent) {
      logger.error('No message content found');
      return false;
    }
    
    // Agendar mensagem
    const { error } = await supabaseClient
      .from('scheduled_messages')
      .insert({
        contact_id: contactId,
        message_content: messageContent,
        scheduled_for: new Date().toISOString(),
        message_type: 'automation',
        status: 'pending'
      });
    
    if (error) {
      logger.error('Error scheduling message', { error });
      return false;
    }
    
    logger.info('Message scheduled successfully');
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

// Função para agendar follow-up
async function scheduleFollowup(
  supabaseClient: SupabaseClient,
  stepConfig: StepConfig,
  contactId: string,
  logger: any
): Promise<boolean> {
  try {
    const delayHours = stepConfig.delay_hours || 24;
    const followupType = stepConfig.followup_type || 'whatsapp';
    const message = stepConfig.message || '';
    
    const scheduledFor = new Date();
    scheduledFor.setHours(scheduledFor.getHours() + delayHours);
    
    const { error } = await supabaseClient
      .from('followups')
      .insert({
        contact_id: contactId,
        type: followupType,
        message: message,
        scheduled_for: scheduledFor.toISOString(),
        status: 'scheduled',
        created_by_automation: true
      });
    
    if (error) {
      logger.error('Error scheduling followup', { error });
      return false;
    }
    
    logger.info('Followup scheduled successfully');
    return true;
  } catch (error: any) {
    logger.error('Error in scheduleFollowup', { error: error.message });
    return false;
  }
}

// Função para adicionar tag ao contato
async function addContactTag(
  supabaseClient: SupabaseClient,
  stepConfig: StepConfig,
  contactId: string,
  logger: any
): Promise<boolean> {
  try {
    const tagName = stepConfig.tag_name;
    
    if (!tagName) {
      logger.error('No tag name provided');
      return false;
    }
    
    // Buscar tags existentes
    const { data: contact } = await supabaseClient
      .from('contacts')
      .select('tags')
      .eq('id', contactId)
      .single();
    
    if (!contact) {
      logger.error('Contact not found');
      return false;
    }
    
    const existingTags = contact.tags || [];
    
    // Adicionar nova tag se não existir
    if (!existingTags.includes(tagName)) {
      const { error } = await supabaseClient
        .from('contacts')
        .update({ 
          tags: [...existingTags, tagName],
          updated_at: new Date().toISOString()
        })
        .eq('id', contactId);
      
      if (error) {
        logger.error('Error adding tag', { error });
        return false;
      }
    }
    
    logger.info('Tag added successfully');
    return true;
  } catch (error: any) {
    logger.error('Error in addContactTag', { error: error.message });
    return false;
  }
}
