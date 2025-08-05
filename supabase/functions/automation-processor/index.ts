import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AutomationTrigger {
  type: string;
  data: Record<string, any>;
  contact_id?: string;
  message_id?: string;
}

interface AutomationFlow {
  id: string;
  name: string;
  active: boolean;
  trigger_type: string;
  trigger_config: Record<string, any>;
  steps: any[];
}

interface AutomationExecution {
  id: string;
  flow_id: string;
  contact_id: string;
  status: string;
  current_step: number;
  execution_data: Record<string, any>;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { trigger }: { trigger: AutomationTrigger } = await req.json();

    console.log('Processing automation trigger:', trigger);

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
      console.log('No active flows found for trigger type:', trigger.type);
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
        if (await shouldExecuteTrigger(flow.trigger_config, trigger.data)) {
          console.log(`Triggering flow: ${flow.name} (${flow.id})`);

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
            console.error(`Error creating execution for flow ${flow.id}:`, executionError);
            continue;
          }

          triggeredExecutions.push({
            flow_id: flow.id,
            flow_name: flow.name,
            execution_id: execution.id
          });

          // Iniciar execução do primeiro step
          await executeNextStep(supabaseClient, execution.id);
        }
      } catch (error) {
        console.error(`Error processing flow ${flow.id}:`, error);
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

  } catch (error) {
    console.error('Error processing automation trigger:', error);
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
  triggerConfig: Record<string, any>,
  triggerData: Record<string, any>
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
  } catch (error) {
    console.error('Error evaluating trigger condition:', error);
    return false;
  }
}

// Função para executar o próximo step de uma automação
async function executeNextStep(
  supabaseClient: any,
  executionId: string
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
      console.error('Execution not found or not in valid state:', executionError);
      return false;
    }

    // Parsear steps
    let steps;
    try {
      steps = typeof execution.automation_flows.steps === 'string' 
        ? JSON.parse(execution.automation_flows.steps)
        : execution.automation_flows.steps;
    } catch (error) {
      console.error('Error parsing steps:', error);
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
    if (execution.current_step >= steps.length) {
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
    const currentStep = steps[execution.current_step];
    
    // Criar log do step
    const { data: stepLog, error: stepLogError } = await supabaseClient
      .from('automation_step_logs')
      .insert({
        execution_id: executionId,
        step_id: currentStep.id,
        step_type: currentStep.type,
        step_config: currentStep.config,
        status: 'running',
        input_data: execution.execution_data
      })
      .select()
      .single();

    if (stepLogError) {
      console.error('Error creating step log:', stepLogError);
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
      execution.contact_id,
      execution.execution_data
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
        .update({ current_step: execution.current_step + 1 })
        .eq('id', executionId);

      // Executar próximo step recursivamente (com delay para evitar stack overflow)
      setTimeout(() => executeNextStep(supabaseClient, executionId), 1000);
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
  } catch (error) {
    console.error('Error executing step:', error);
    
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
  supabaseClient: any,
  stepType: string,
  stepConfig: Record<string, any>,
  contactId: string,
  executionData: Record<string, any>
): Promise<boolean> {
  try {
    console.log(`Executing step type: ${stepType}`, stepConfig);

    switch (stepType) {
      case 'send_message':
        return await scheduleSendMessage(supabaseClient, stepConfig, contactId);
      
      case 'change_funnel_stage':
        return await changeFunnelStage(supabaseClient, stepConfig, contactId);
      
      case 'schedule_followup':
        return await scheduleFollowup(supabaseClient, stepConfig, contactId);
      
      case 'add_tag':
        return await addContactTag(supabaseClient, stepConfig, contactId);
      
      case 'delay':
        // Para delays, apenas retornar true (implementação real precisaria de agendamento)
        console.log('Delay step executed (simulated)');
        return true;
      
      default:
        console.error('Unknown step type:', stepType);
        return false;
    }
  } catch (error) {
    console.error(`Error executing step type ${stepType}:`, error);
    return false;
  }
}

// Função para agendar envio de mensagem
async function scheduleSendMessage(
  supabaseClient: any,
  stepConfig: Record<string, any>,
  contactId: string
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
      console.error('No message content found');
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
      console.error('Error scheduling message:', error);
      return false;
    }
    
    console.log('Message scheduled successfully');
    return true;
  } catch (error) {
    console.error('Error in scheduleSendMessage:', error);
    return false;
  }
}

// Função para alterar estágio do funil
async function changeFunnelStage(
  supabaseClient: any,
  stepConfig: Record<string, any>,
  contactId: string
): Promise<boolean> {
  try {
    const { error } = await supabaseClient
      .from('contacts')
      .update({ 
        funnel_stage_id: stepConfig.stage_id,
        updated_at: new Date().toISOString()
      })
      .eq('id', contactId);
    
    if (error) {
      console.error('Error changing funnel stage:', error);
      return false;
    }
    
    console.log('Funnel stage changed successfully');
    return true;
  } catch (error) {
    console.error('Error in changeFunnelStage:', error);
    return false;
  }
}

// Função para agendar follow-up
async function scheduleFollowup(
  supabaseClient: any,
  stepConfig: Record<string, any>,
  contactId: string
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
      console.error('Error scheduling followup:', error);
      return false;
    }
    
    console.log('Followup scheduled successfully');
    return true;
  } catch (error) {
    console.error('Error in scheduleFollowup:', error);
    return false;
  }
}

// Função para adicionar tag ao contato
async function addContactTag(
  supabaseClient: any,
  stepConfig: Record<string, any>,
  contactId: string
): Promise<boolean> {
  try {
    const tagName = stepConfig.tag_name;
    
    if (!tagName) {
      console.error('No tag name provided');
      return false;
    }
    
    // Buscar tags existentes
    const { data: contact } = await supabaseClient
      .from('contacts')
      .select('tags')
      .eq('id', contactId)
      .single();
    
    if (!contact) {
      console.error('Contact not found');
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
        console.error('Error adding tag:', error);
        return false;
      }
    }
    
    console.log('Tag added successfully');
    return true;
  } catch (error) {
    console.error('Error in addContactTag:', error);
    return false;
  }
}

console.log('Automation processor function started');