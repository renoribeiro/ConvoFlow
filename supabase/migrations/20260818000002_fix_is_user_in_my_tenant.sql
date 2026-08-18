-- =============================================================================
-- is_user_in_my_tenant — o Gestor volta a enxergar a própria equipe
-- =============================================================================
-- BUG (achado em 2026-08-18):
--
--   A função terminava assim:
--       RETURN v_target_role = 'user'::public.user_role AND ...
--
--   'user' é cargo de DUAS renomeações atrás. A migração 20260716000002 (§1)
--   converteu todo mundo (`UPDATE profiles SET role='gestor' WHERE role='user'`)
--   e a constraint `profiles_role_modern_only` passou a proibir o valor. Ou
--   seja: NENHUMA linha do banco tem role='user', a comparação nunca é
--   verdadeira, e a função devolve FALSE para todo mundo, sempre.
--
--   É o mesmo defeito que matou cinco policies por meses em 20260813000006 e
--   que derrubou o `can_manage_profile` — helper deixado comparando nome de
--   cargo legado depois de uma renomeação.
--
-- O QUE ESTAVA QUEBRADO POR CAUSA DISSO (três policies):
--   profiles_enterprise_tenant_select    → o Gestor não via NINGUÉM da Loja
--                                          dele, só a si mesmo (via
--                                          users_own_profile). A tela de Equipe
--                                          listaria uma pessoa só.
--   profiles_enterprise_tenant_update    → o Gestor não editava atendente nenhum
--   user_activity_log_enterprise_tenant  → nem o histórico de atividade deles
--
-- A REGRA, agora explícita: o Gestor alcança os ATENDENTES da própria Loja.
--
--   Não inclui 'gestor' de propósito. A própria linha dele já vem por
--   `users_own_profile`, e a Loja aceita no máximo um Gestor
--   (enforce_store_membership_limits) — incluir o cargo só abriria a porta para
--   um Gestor editar outro se algum dia o dado ficasse sujo. Mesmo recorte do
--   `ensureCanManage` em supabase/functions/manage-user/index.ts.
--
--   O chamador passa a exigir status='active', igual a
--   get_current_user_tenant_id() e is_enterprise_safe(): perfil suspenso não
--   enxerga equipe.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_user_in_my_tenant(target_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_my_tenant     uuid;
  v_target_tenant uuid;
  v_target_role   public.user_role;
BEGIN
  IF target_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT tenant_id INTO v_my_tenant
    FROM public.profiles
   WHERE user_id = auth.uid()
     AND status = 'active'
   LIMIT 1;

  IF v_my_tenant IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT tenant_id, role INTO v_target_tenant, v_target_role
    FROM public.profiles
   WHERE id = target_id
   LIMIT 1;

  RETURN v_target_role = 'atendente'::public.user_role
     AND v_target_tenant IS NOT NULL
     AND v_target_tenant = v_my_tenant;
END;
$function$;

COMMENT ON FUNCTION public.is_user_in_my_tenant(uuid) IS
  'True quando o perfil alvo é um ATENDENTE da mesma Loja do chamador ativo. Usada por profiles_enterprise_tenant_select/update e user_activity_log_enterprise_tenant. Comparava contra o cargo legado ''user'', que não existe desde a hierarquia V2 — devolvia FALSE para todo mundo (corrigido em 20260818000002).';

-- =============================================================================
-- ROLLBACK (volta ao comportamento quebrado — só se algo pior aparecer):
--   CREATE OR REPLACE FUNCTION public.is_user_in_my_tenant(target_id uuid)
--   RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
--   AS $$
--   DECLARE v_my_tenant uuid; v_target_tenant uuid; v_target_role public.user_role;
--   BEGIN
--     SELECT tenant_id INTO v_my_tenant FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
--     IF v_my_tenant IS NULL THEN RETURN FALSE; END IF;
--     SELECT tenant_id, role INTO v_target_tenant, v_target_role FROM public.profiles WHERE id = target_id LIMIT 1;
--     RETURN v_target_role = 'user'::public.user_role AND v_target_tenant = v_my_tenant;
--   END; $$;
-- =============================================================================
