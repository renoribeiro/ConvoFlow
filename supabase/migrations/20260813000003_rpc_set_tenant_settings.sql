-- =============================================================================
-- RPC set_tenant_settings — Gerente/Gestor conseguem salvar preferências da Loja
-- =============================================================================
-- BUG (achado em 2026-08-13, ao ligar a aba Atendimento em produção):
--
--   public.tenants NÃO tem nenhuma policy de UPDATE. As quatro existentes são:
--     "Super admins can manage all tenants"  (ALL,    is_super_admin())
--     "Super admins can view all tenants"    (SELECT)
--     "Users can view own tenant"            (SELECT)
--     "tenants_account_manager_read"         (SELECT)
--
--   Ou seja: só superadmin escreve. Para gerente e gestor o UPDATE casa ZERO
--   linhas — e um UPDATE que não casa nada, sob RLS, não é erro: o PostgREST
--   devolve 204 sem erro nenhum. O front achava que tinha salvado, mostrava
--   toast de sucesso, e o valor sumia no próximo refresh.
--
--   Isso já afetava silenciosamente WhatsAppApiSettings (que grava
--   tenants.settings direto) desde sempre; a aba Atendimento só tornou o
--   problema visível.
--
-- POR QUE UMA RPC E NÃO UMA POLICY DE UPDATE:
--   Uma policy `FOR UPDATE USING (id = get_current_user_tenant_id())` liberaria
--   a LINHA inteira. Um gestor poderia então escrever plan_type,
--   manual_access_granted, subscription_status, trial_ends_at e
--   store_slots_extra — ou seja, se dar acesso pago sozinho, furando a trava de
--   Conta. Column-level GRANT resolveria, mas é frágil e some em qualquer
--   `GRANT ALL` futuro.
--
--   Esta função SECURITY DEFINER escreve exclusivamente a coluna `settings`.
--   Nenhuma outra coluna é alcançável por ela, por construção.
--
-- Merge é raso (`||`), igual ao que o updateTenantSettings do front fazia.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_tenant_settings(
  p_tenant_id uuid,
  p_patch     jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_role     text;
  v_allowed  boolean;
  v_settings jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Informe a Conta.' USING ERRCODE = '22023';
  END IF;

  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'As configurações precisam ser um objeto JSON.' USING ERRCODE = '22023';
  END IF;

  SELECT role INTO v_role
    FROM public.profiles
   WHERE user_id = auth.uid();

  -- Atendente opera a Loja, não a configura (mesma regra da capability
  -- store.admin no front). Sem perfil, nada feito.
  IF v_role IS NULL OR v_role NOT IN ('superadmin', 'gerente', 'gestor') THEN
    RAISE EXCEPTION 'Apenas Gerente ou Gestor pode alterar as configurações da Conta.'
      USING ERRCODE = '42501';
  END IF;

  v_allowed :=
       public.is_super_admin()
    OR p_tenant_id = public.get_current_user_tenant_id()
    OR (public.is_account_manager_safe() AND public.is_tenant_in_my_descendants(p_tenant_id));

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Sem permissão para alterar as configurações desta Conta.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.tenants
     SET settings   = COALESCE(settings, '{}'::jsonb) || p_patch,
         updated_at = now()
   WHERE id = p_tenant_id
  RETURNING settings INTO v_settings;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta % não encontrada.', p_tenant_id USING ERRCODE = 'P0002';
  END IF;

  RETURN v_settings;
END;
$function$;

COMMENT ON FUNCTION public.set_tenant_settings(uuid, jsonb) IS
  'Merge raso em tenants.settings. Única via de escrita de preferências por Conta para Gerente/Gestor — tenants não tem policy de UPDATE para eles, e escrever direto vira no-op silencioso. Alcança apenas a coluna settings.';

REVOKE ALL ON FUNCTION public.set_tenant_settings(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_tenant_settings(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_tenant_settings(uuid, jsonb) TO authenticated;

-- =============================================================================
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.set_tenant_settings(uuid, jsonb);
-- =============================================================================
