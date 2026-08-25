-- =============================================================================
-- RECONSTRUÍDA em 2026-08-24 a partir do estado vivo do banco.
-- =============================================================================
-- Esta versão existia no ledger (`20250805120251`) sem nenhum arquivo local.
-- Extraída do catálogo do PostgreSQL em 2026-08-24. NÃO é o texto original.
--
-- ⚠️ É a forma de HOJE, não a de 2025-08-05. As migrações posteriores que
-- moldaram estas tabelas (tenant_id, o valor 'variable_captured' no CHECK de
-- trigger_type, os tipos de passo por variável) já estão embutidas aqui. Num
-- rebuild elas rodam depois e viram no-op.
--
-- O único CREATE destas três tabelas no repositório estava em
-- `20250103000001_automation_flows.sql`, arquivado porque recria o motor SQL
-- legado que a `20260623000001` apagou de propósito. Ou seja: as tabelas de
-- Automação não tinham CREATE em nenhum arquivo executável. Este fecha isso.
--
-- Só as TABELAS. O motor de execução mora nas Edge Functions
-- (`automation-processor`), não em SQL — foi essa a decisão da 20260623000001.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.automation_flows (
  id             uuid DEFAULT gen_random_uuid() NOT NULL,
  name           character varying(255) NOT NULL,
  description    text,
  active         boolean DEFAULT false,
  trigger_type   character varying(100) NOT NULL,
  trigger_config jsonb DEFAULT '{}'::jsonb,
  steps          jsonb DEFAULT '[]'::jsonb,
  created_at     timestamp with time zone DEFAULT now(),
  updated_at     timestamp with time zone DEFAULT now(),
  created_by     uuid,
  tenant_id      uuid
);

DO $$ BEGIN
  ALTER TABLE public.automation_flows ADD CONSTRAINT automation_flows_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.automation_flows ADD CONSTRAINT automation_flows_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.automation_flows ADD CONSTRAINT automation_flows_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- 'variable_captured' entrou pela 20260624000001_variable_automations.
DO $$ BEGIN
  ALTER TABLE public.automation_flows ADD CONSTRAINT valid_trigger_type
    CHECK ((trigger_type)::text = ANY ((ARRAY['message_received','contact_created','funnel_stage_changed',
      'scheduled_time','tag_added','webhook_received','variable_captured'])::text[]));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_automation_flows_active       ON public.automation_flows USING btree (active);
CREATE INDEX IF NOT EXISTS idx_automation_flows_created_by   ON public.automation_flows USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_automation_flows_tenant_id    ON public.automation_flows USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_automation_flows_trigger_type ON public.automation_flows USING btree (trigger_type);

CREATE TABLE IF NOT EXISTS public.automation_executions (
  id             uuid DEFAULT gen_random_uuid() NOT NULL,
  flow_id        uuid,
  contact_id     uuid,
  trigger_data   jsonb DEFAULT '{}'::jsonb,
  status         character varying(50) DEFAULT 'pending'::character varying,
  current_step   integer DEFAULT 0,
  execution_data jsonb DEFAULT '{}'::jsonb,
  started_at     timestamp with time zone DEFAULT now(),
  completed_at   timestamp with time zone,
  error_message  text,
  tenant_id      uuid
);

DO $$ BEGIN
  ALTER TABLE public.automation_executions ADD CONSTRAINT automation_executions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.automation_executions ADD CONSTRAINT automation_executions_flow_id_fkey
    FOREIGN KEY (flow_id) REFERENCES public.automation_flows(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.automation_executions ADD CONSTRAINT automation_executions_contact_id_fkey
    FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.automation_executions ADD CONSTRAINT automation_executions_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.automation_executions ADD CONSTRAINT valid_status
    CHECK ((status)::text = ANY ((ARRAY['pending','running','completed','failed','cancelled'])::text[]));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_automation_executions_contact_id ON public.automation_executions USING btree (contact_id);
CREATE INDEX IF NOT EXISTS idx_automation_executions_flow_id    ON public.automation_executions USING btree (flow_id);
CREATE INDEX IF NOT EXISTS idx_automation_executions_started_at ON public.automation_executions USING btree (started_at);
CREATE INDEX IF NOT EXISTS idx_automation_executions_status     ON public.automation_executions USING btree (status);
CREATE INDEX IF NOT EXISTS idx_automation_executions_tenant_id  ON public.automation_executions USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS public.automation_step_logs (
  id            uuid DEFAULT gen_random_uuid() NOT NULL,
  execution_id  uuid,
  step_id       character varying(100) NOT NULL,
  step_type     character varying(50) NOT NULL,
  step_config   jsonb DEFAULT '{}'::jsonb,
  status        character varying(50) DEFAULT 'pending'::character varying,
  input_data    jsonb DEFAULT '{}'::jsonb,
  output_data   jsonb DEFAULT '{}'::jsonb,
  error_message text,
  started_at    timestamp with time zone DEFAULT now(),
  completed_at  timestamp with time zone,
  tenant_id     uuid
);

DO $$ BEGIN
  ALTER TABLE public.automation_step_logs ADD CONSTRAINT automation_step_logs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.automation_step_logs ADD CONSTRAINT automation_step_logs_execution_id_fkey
    FOREIGN KEY (execution_id) REFERENCES public.automation_executions(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.automation_step_logs ADD CONSTRAINT automation_step_logs_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.automation_step_logs ADD CONSTRAINT valid_step_status
    CHECK ((status)::text = ANY ((ARRAY['pending','running','completed','failed','skipped'])::text[]));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- 'variable_condition' entrou pela 20260624000001_variable_automations.
DO $$ BEGIN
  ALTER TABLE public.automation_step_logs ADD CONSTRAINT valid_step_type
    CHECK ((step_type)::text = ANY ((ARRAY['trigger','condition','action','delay','send_message',
      'change_funnel_stage','schedule_followup','add_tag','remove_tag','webhook_call',
      'update_contact','variable_condition'])::text[]));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_automation_step_logs_execution_id ON public.automation_step_logs USING btree (execution_id);
CREATE INDEX IF NOT EXISTS idx_automation_step_logs_status       ON public.automation_step_logs USING btree (status);
CREATE INDEX IF NOT EXISTS idx_automation_step_logs_step_type    ON public.automation_step_logs USING btree (step_type);
CREATE INDEX IF NOT EXISTS idx_automation_step_logs_tenant_id    ON public.automation_step_logs USING btree (tenant_id);

ALTER TABLE public.automation_flows      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_step_logs  ENABLE ROW LEVEL SECURITY;
