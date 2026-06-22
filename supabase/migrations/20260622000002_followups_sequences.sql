-- Follow-up upgrade — Fase 0 (2/3): sequências (modo Automático / cadência).
--
-- Inspirado em HubSpot Sequences / Salesforce Cadences, adaptado ao WhatsApp-first
-- e à janela de 24h da Meta. Uma sequência é um molde de passos; inscrever um
-- contato gera uma enrollment que o followup-processor avança passo a passo,
-- pausando automaticamente quando o contato responde (reply-detection — Fase 3).
--
-- Tipos de passo neste MVP: 'whatsapp' (disparo automático via provider) e
-- 'manual_task' (gera um follow-up atribuído ao operador e pausa a cadência até
-- a conclusão).

-- ── Definição da sequência ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.followup_sequences (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text,
  is_active     boolean NOT NULL DEFAULT true,
  stop_on_reply boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ── Passos da sequência ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.followup_sequence_steps (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sequence_id       uuid NOT NULL REFERENCES public.followup_sequences(id) ON DELETE CASCADE,
  step_order        integer NOT NULL,        -- 1-based, ordem de execução
  action_type       text NOT NULL CHECK (action_type IN ('whatsapp','manual_task')),
  -- Intervalo desde o passo anterior (para o passo 1, desde a inscrição).
  delay_amount      integer NOT NULL DEFAULT 0,
  delay_unit        text NOT NULL DEFAULT 'days' CHECK (delay_unit IN ('minutes','hours','days')),
  -- Conteúdo para action_type='whatsapp'
  message_body      text,
  template_name     text,
  template_language text DEFAULT 'pt_BR',
  template_params   jsonb,
  -- Conteúdo para action_type='manual_task'
  task_title        text,
  task_priority     text DEFAULT 'medium' CHECK (task_priority IN ('high','medium','low')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sequence_id, step_order)
);

-- ── Inscrições (um contato dentro de uma sequência) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.followup_sequence_enrollments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sequence_id           uuid NOT NULL REFERENCES public.followup_sequences(id) ON DELETE CASCADE,
  contact_id            uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  whatsapp_instance_id  uuid REFERENCES public.whatsapp_instances(id),
  assigned_to           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status                text NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active','completed','stopped_reply','stopped_manual')),
  current_step          integer NOT NULL DEFAULT 1,   -- próximo step_order a executar
  next_run_at           timestamptz,                  -- quando o próximo passo deve rodar
  -- Quando um passo manual_task pausa a cadência, guardamos o follow-up gerado;
  -- a cadência só avança quando esse follow-up é concluído.
  waiting_on_followup_id uuid REFERENCES public.individual_followups(id) ON DELETE SET NULL,
  enrolled_at           timestamptz NOT NULL DEFAULT now(),
  stopped_at            timestamptz,
  stopped_reason        text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- FK tardia: individual_followups.sequence_enrollment_id → enrollments.id
-- (a coluna foi criada na migração 1/3, antes desta tabela existir).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'individual_followups_sequence_enrollment_fk'
  ) THEN
    ALTER TABLE public.individual_followups
      ADD CONSTRAINT individual_followups_sequence_enrollment_fk
      FOREIGN KEY (sequence_enrollment_id)
      REFERENCES public.followup_sequence_enrollments(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── Índices ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fseq_tenant       ON public.followup_sequences(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fsteps_sequence    ON public.followup_sequence_steps(sequence_id, step_order);
CREATE INDEX IF NOT EXISTS idx_fsenr_due          ON public.followup_sequence_enrollments(next_run_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_fsenr_contact      ON public.followup_sequence_enrollments(tenant_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_fsenr_sequence     ON public.followup_sequence_enrollments(sequence_id);

-- ── Triggers de updated_at ───────────────────────────────────────────────────
CREATE TRIGGER update_followup_sequences_updated_at
  BEFORE UPDATE ON public.followup_sequences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_followup_sequence_steps_updated_at
  BEFORE UPDATE ON public.followup_sequence_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_followup_sequence_enrollments_updated_at
  BEFORE UPDATE ON public.followup_sequence_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── RLS (mesmo padrão de individual_followups) ───────────────────────────────
ALTER TABLE public.followup_sequences            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followup_sequence_steps       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followup_sequence_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant access followup_sequences" ON public.followup_sequences
  FOR ALL USING (tenant_id = public.get_current_user_tenant_id());
CREATE POLICY "super admin followup_sequences" ON public.followup_sequences
  FOR ALL USING (public.is_super_admin());

CREATE POLICY "tenant access followup_sequence_steps" ON public.followup_sequence_steps
  FOR ALL USING (tenant_id = public.get_current_user_tenant_id());
CREATE POLICY "super admin followup_sequence_steps" ON public.followup_sequence_steps
  FOR ALL USING (public.is_super_admin());

CREATE POLICY "tenant access followup_sequence_enrollments" ON public.followup_sequence_enrollments
  FOR ALL USING (tenant_id = public.get_current_user_tenant_id());
CREATE POLICY "super admin followup_sequence_enrollments" ON public.followup_sequence_enrollments
  FOR ALL USING (public.is_super_admin());

GRANT ALL PRIVILEGES ON public.followup_sequences            TO authenticated;
GRANT ALL PRIVILEGES ON public.followup_sequence_steps       TO authenticated;
GRANT ALL PRIVILEGES ON public.followup_sequence_enrollments TO authenticated;
