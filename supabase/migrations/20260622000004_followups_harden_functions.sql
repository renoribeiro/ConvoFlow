-- Follow-up upgrade — Fase 0 (hardening): fecha brechas apontadas pelo
-- security advisor nas funções (re)criadas nesta fase.
--
-- 1) flip_overdue_followups: SECURITY DEFINER que atualiza linhas de TODAS as
--    contas. O Supabase concede EXECUTE a anon/authenticated por default
--    privileges, então REVOKE FROM PUBLIC não basta. É um job de manutenção do
--    cron — revogamos explicitamente de anon/authenticated.
REVOKE EXECUTE ON FUNCTION public.flip_overdue_followups() FROM anon, authenticated;

-- 2) get_followup_stats: SECURITY DEFINER que recebe p_tenant_id arbitrário.
--    Sem checagem, qualquer usuário autenticado leria contagens de outra conta.
--    Adiciona guarda de autorização (mesma conta ou super admin) e fixa search_path.
CREATE OR REPLACE FUNCTION public.get_followup_stats(p_tenant_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    result JSON;
BEGIN
    IF NOT public.is_super_admin()
       AND p_tenant_id IS DISTINCT FROM public.get_current_user_tenant_id() THEN
        RAISE EXCEPTION 'Not authorized for this tenant';
    END IF;

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

-- 3) notify_overdue_followups: fixa search_path (estava mutable).
ALTER FUNCTION public.notify_overdue_followups() SET search_path TO '';
