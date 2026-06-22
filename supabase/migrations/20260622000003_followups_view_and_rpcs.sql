-- Follow-up upgrade — Fase 0 (3/3): view de status efetivo, RPC de "overdue" no
-- banco e correção da função de notificação quebrada.

-- ── View com status efetivo (overdue calculado no banco, não no cliente) ─────
-- effective_status reflete "em atraso" sem precisar esperar o cron flipar o
-- status físico: útil para a UI ler em tempo real. security_invoker=true faz a
-- RLS de individual_followups valer para quem consulta a view.
CREATE OR REPLACE VIEW public.v_followups
WITH (security_invoker = true) AS
SELECT
  f.*,
  CASE
    WHEN f.status IN ('completed','cancelled') THEN f.status
    WHEN f.status IN ('pending','in_progress') AND f.due_date < now() THEN 'overdue'
    ELSE f.status
  END AS effective_status
FROM public.individual_followups f;

GRANT SELECT ON public.v_followups TO authenticated, anon;

-- ── RPC: flip de "overdue" no banco ──────────────────────────────────────────
-- Chamada a cada minuto pelo followup-processor. Marca como 'overdue' as tarefas
-- (manual / sequência) vencidas. NÃO toca em envios agendados (mode='scheduled',
-- status='scheduled'), que são disparados pelo próprio processor.
CREATE OR REPLACE FUNCTION public.flip_overdue_followups()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE public.individual_followups
     SET status = 'overdue', updated_at = now()
   WHERE status IN ('pending','in_progress')
     AND due_date < now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.flip_overdue_followups() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.flip_overdue_followups() TO service_role;

-- ── Correção: notify_overdue_followups referenciava a tabela inexistente
-- `followups`. Repontamos para individual_followups. (Não reagendamos cron aqui;
-- o flip de overdue já roda no followup-processor. Notificações in-app são fase
-- posterior.) Mantida idempotente e segura para chamada manual.
CREATE OR REPLACE FUNCTION public.notify_overdue_followups()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    overdue_count INTEGER;
    current_uid UUID := auth.uid();
BEGIN
    IF current_uid IS NULL THEN
        RETURN; -- sem usuário no contexto (ex.: cron) — nada a notificar
    END IF;

    SELECT COUNT(*) INTO overdue_count
    FROM public.individual_followups f
    JOIN public.profiles p ON p.id = f.assigned_to
    WHERE p.user_id = current_uid
      AND (f.status = 'overdue'
           OR (f.status IN ('pending','in_progress') AND f.due_date < NOW()));

    IF overdue_count > 0 THEN
        PERFORM public.create_notification(
            current_uid,
            'Follow-ups em atraso',
            'Você tem ' || overdue_count || ' follow-up' ||
            CASE WHEN overdue_count > 1 THEN 's' ELSE '' END || ' em atraso',
            'warning',
            '/dashboard/followups',
            'Ver follow-ups',
            jsonb_build_object('overdue_count', overdue_count)
        );
    END IF;
END;
$$;
