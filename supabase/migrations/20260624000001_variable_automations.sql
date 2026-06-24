-- Migration: Automações dirigidas por variáveis + persistência de variáveis no contato
--
-- Contexto: o chatbot v2 coleta variáveis (nó "Fazer Pergunta" → save_to_variable),
-- mas elas só viviam em chatbot_sessions.variables (efêmero por sessão). Para que as
-- automações possam reagir/decidir/usar essas variáveis de forma confiável, persistimos
-- as variáveis coletadas no próprio contato (contacts.custom_fields) e habilitamos:
--   • novo trigger 'variable_captured' em automation_flows
--   • novos step_type 'update_contact' e 'variable_condition' em automation_step_logs
--
-- As configs dos novos steps/trigger vivem nos JSONB livres (automation_flows.steps e
-- trigger_config), então não há mudança estrutural além dos CHECKs e da nova coluna.

-- 1. Persistência de variáveis por contato ------------------------------------------
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.contacts.custom_fields IS
  'Variáveis personalizadas do contato (ex.: coletadas pelo chatbot). Usadas por automações para interpolação {variavel} e gatilhos/condições.';

-- Índice GIN para futuras consultas por chave/valor de variável.
CREATE INDEX IF NOT EXISTS idx_contacts_custom_fields
  ON public.contacts USING gin (custom_fields);

-- 2. Novo trigger_type: 'variable_captured' -----------------------------------------
ALTER TABLE public.automation_flows
  DROP CONSTRAINT IF EXISTS valid_trigger_type;

ALTER TABLE public.automation_flows
  ADD CONSTRAINT valid_trigger_type CHECK (
    trigger_type IN (
      'message_received',
      'contact_created',
      'funnel_stage_changed',
      'scheduled_time',
      'tag_added',
      'webhook_received',
      'variable_captured'
    )
  );

-- 3. Novos step_type: 'update_contact', 'variable_condition' -------------------------
ALTER TABLE public.automation_step_logs
  DROP CONSTRAINT IF EXISTS valid_step_type;

ALTER TABLE public.automation_step_logs
  ADD CONSTRAINT valid_step_type CHECK (
    step_type IN (
      'trigger', 'condition', 'action', 'delay',
      'send_message', 'change_funnel_stage', 'schedule_followup',
      'add_tag', 'remove_tag', 'webhook_call',
      'update_contact', 'variable_condition'
    )
  );
