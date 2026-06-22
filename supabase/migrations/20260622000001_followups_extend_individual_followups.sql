-- Follow-up upgrade — Fase 0 (1/3): estende individual_followups.
--
-- Objetivo: transformar o follow-up de um simples "to-do" num sistema com 3 modos
-- de execução (manual, agendado, sequência), atribuição a operador, tags, envio
-- via provider (Evolution/WAHA/Meta), recorrência real e "em atraso" calculado no
-- banco. Migração NÃO-destrutiva: todo o CRUD atual continua funcionando.
--
-- Contexto: a tabela legada `followups` (referenciada pelo automation-processor)
-- nunca foi criada no banco — não há dualidade real de dados a migrar, apenas
-- código a repontar (ver Fase 1). Consolidamos tudo em individual_followups.

-- ── Novas colunas ────────────────────────────────────────────────────────────
ALTER TABLE public.individual_followups
  ADD COLUMN IF NOT EXISTS mode                   text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS assigned_to            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tags                   text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS source                 text,
  -- Envio (modo agendado / passo de sequência whatsapp)
  ADD COLUMN IF NOT EXISTS message_body           text,
  ADD COLUMN IF NOT EXISTS template_name          text,
  ADD COLUMN IF NOT EXISTS template_language      text DEFAULT 'pt_BR',
  ADD COLUMN IF NOT EXISTS template_params        jsonb,
  ADD COLUMN IF NOT EXISTS scheduled_at           timestamptz,
  ADD COLUMN IF NOT EXISTS last_sent_at           timestamptz,
  ADD COLUMN IF NOT EXISTS provider_message_id    text,
  ADD COLUMN IF NOT EXISTS attempts               integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_message          text,
  -- Ciclo de vida
  ADD COLUMN IF NOT EXISTS completed_at           timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at           timestamptz,
  -- Recorrência (campos `recurring*` já existem — adicionamos fim/intervalo + linkagem)
  ADD COLUMN IF NOT EXISTS recurring_interval     integer,        -- "a cada N" (modo custom)
  ADD COLUMN IF NOT EXISTS recurring_end_date     timestamptz,
  ADD COLUMN IF NOT EXISTS parent_followup_id     uuid REFERENCES public.individual_followups(id) ON DELETE SET NULL,
  -- Sequência (FK para enrollments adicionada na migração 2/3)
  ADD COLUMN IF NOT EXISTS sequence_enrollment_id uuid,
  ADD COLUMN IF NOT EXISTS sequence_step_order    integer,
  ADD COLUMN IF NOT EXISTS created_by_automation  boolean NOT NULL DEFAULT false;

-- ── Constraints (drop + recreate para idempotência) ──────────────────────────
-- Status expandido: pending, scheduled, in_progress, completed, cancelled, overdue.
ALTER TABLE public.individual_followups DROP CONSTRAINT IF EXISTS individual_followups_status_check;
ALTER TABLE public.individual_followups
  ADD CONSTRAINT individual_followups_status_check
  CHECK (status IN ('pending','scheduled','in_progress','completed','cancelled','overdue'));

-- Tipos de tarefa ampliados para cobrir os já usados na UI.
ALTER TABLE public.individual_followups DROP CONSTRAINT IF EXISTS individual_followups_type_check;
ALTER TABLE public.individual_followups
  ADD CONSTRAINT individual_followups_type_check
  CHECK (type IN ('call','email','whatsapp','meeting','visit','task','other'));

-- Modo de execução.
ALTER TABLE public.individual_followups DROP CONSTRAINT IF EXISTS individual_followups_mode_check;
ALTER TABLE public.individual_followups
  ADD CONSTRAINT individual_followups_mode_check
  CHECK (mode IN ('manual','scheduled','sequence'));

-- Recorrência: adiciona 'custom' (a cada N dias).
ALTER TABLE public.individual_followups DROP CONSTRAINT IF EXISTS individual_followups_recurring_type_check;
ALTER TABLE public.individual_followups
  ADD CONSTRAINT individual_followups_recurring_type_check
  CHECK (recurring_type IS NULL OR recurring_type IN ('daily','weekly','monthly','custom'));

-- ── Índices ───────────────────────────────────────────────────────────────────
-- Fila de trabalho / smart views (por conta, status e vencimento).
CREATE INDEX IF NOT EXISTS idx_individual_followups_tenant_status_due
  ON public.individual_followups(tenant_id, status, due_date);
-- Filtro por operador atribuído.
CREATE INDEX IF NOT EXISTS idx_individual_followups_assigned
  ON public.individual_followups(tenant_id, assigned_to);
-- Busca eficiente de envios agendados vencidos pelo followup-processor.
CREATE INDEX IF NOT EXISTS idx_individual_followups_due_send
  ON public.individual_followups(scheduled_at)
  WHERE mode = 'scheduled' AND status = 'scheduled';
-- Linkagem com a inscrição de sequência.
CREATE INDEX IF NOT EXISTS idx_individual_followups_enrollment
  ON public.individual_followups(sequence_enrollment_id);

-- ── Estatísticas (atualiza para o status expandido) ──────────────────────────
CREATE OR REPLACE FUNCTION public.get_followup_stats(p_tenant_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'total', COUNT(*),
        'pending', COUNT(*) FILTER (WHERE status = 'pending'),
        'scheduled', COUNT(*) FILTER (WHERE status = 'scheduled'),
        'in_progress', COUNT(*) FILTER (WHERE status = 'in_progress'),
        'completed', COUNT(*) FILTER (WHERE status = 'completed'),
        'cancelled', COUNT(*) FILTER (WHERE status = 'cancelled'),
        'completed_today', COUNT(*) FILTER (
            WHERE status = 'completed'
            AND DATE(COALESCE(completed_at, updated_at)) = CURRENT_DATE
        ),
        'overdue', COUNT(*) FILTER (
            WHERE status = 'overdue'
            OR (status IN ('pending','in_progress') AND due_date < NOW())
        )
    )
    INTO result
    FROM public.individual_followups
    WHERE tenant_id = p_tenant_id;

    RETURN result;
END;
$$;
