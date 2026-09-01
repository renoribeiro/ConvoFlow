-- =============================================================================
-- Lote 2/5 — initplan nas policies da `profiles`
--
-- A tabela mais quente do banco: 4.033.275 seq scans e 19.475.664 tuplas lidas
-- para 9 linhas vivas. É também a mais perigosa: `users_own_profile` é o que
-- deixa qualquer pessoa ler o próprio perfil. Errar aqui tranca todo mundo
-- para fora, inclusive quem aplicou.
--
-- O QUE MUDA: só o envelopamento em (SELECT ...) das funções SEM argumento.
--
-- O QUE NÃO MUDA — e por quê:
--   is_my_descendant(id), is_user_in_my_tenant(id) e is_tenant_in_my_descendants(id)
--   recebem uma COLUNA da linha. O argumento muda a cada linha, então o
--   resultado não pode ser içado para um InitPlan. Elas continuam por linha.
--   O ganho vem de envolver a guarda barata que vem antes no AND
--   (is_account_manager_safe / is_enterprise_safe): ela passa a ser avaliada uma
--   vez e faz curto-circuito, então para gestor e atendente a caminhada
--   recursiva na árvore de perfis nem chega a rodar.
--
--   `service_role_full_access` (USING true) fica intocada: não tem chamada.
--
-- REVERT — texto exato das 7 policies antes deste lote:
--   profiles_account_manager_descendants_select  SELECT authenticated
--     USING (is_account_manager_safe() AND is_my_descendant(id))
--   profiles_account_manager_descendants_update  UPDATE authenticated
--     USING (is_account_manager_safe() AND is_my_descendant(id))
--     WITH CHECK (is_gerente_safe() AND is_my_descendant(id)
--                 AND (role = ANY (ARRAY['gestor'::user_role, 'atendente'::user_role])))
--   profiles_enterprise_tenant_select  SELECT authenticated
--     USING (is_enterprise_safe() AND is_user_in_my_tenant(id))
--   profiles_enterprise_tenant_update  UPDATE authenticated
--     USING (is_enterprise_safe() AND is_user_in_my_tenant(id))
--     WITH CHECK (is_enterprise_safe() AND is_user_in_my_tenant(id))
--   profiles_insert_hierarchy  INSERT authenticated
--     WITH CHECK (is_super_admin_safe()
--       OR (is_gerente_safe() AND (role = ANY (ARRAY['gestor'::user_role,'atendente'::user_role]))
--           AND (parent_id = current_profile_id())
--           AND (tenant_id IN ( SELECT get_my_child_tenant_ids() AS get_my_child_tenant_ids)))
--       OR (is_gestor_safe() AND (role = 'atendente'::user_role)
--           AND (parent_id = current_profile_id())
--           AND (tenant_id = get_current_user_tenant_id())))
--   profiles_superadmin_all  ALL authenticated
--     USING is_super_admin_safe()  WITH CHECK is_super_admin_safe()
--   users_own_profile  ALL authenticated
--     USING (user_id = auth.uid())  WITH CHECK (user_id = auth.uid())
-- =============================================================================

DO $lote2$
DECLARE
  n_antes int;
  n_cru   int;
  v_self  int;
BEGIN
  SELECT count(*) INTO n_antes
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'profiles'
     AND policyname IN ('profiles_account_manager_descendants_select',
                        'profiles_account_manager_descendants_update',
                        'profiles_enterprise_tenant_select',
                        'profiles_enterprise_tenant_update',
                        'profiles_insert_hierarchy',
                        'profiles_superadmin_all',
                        'users_own_profile');
  IF n_antes <> 7 THEN
    RAISE EXCEPTION 'ABORTADO: esperava 7 policies em profiles, encontrei %. Nada foi alterado.', n_antes;
  END IF;

  ALTER POLICY profiles_account_manager_descendants_select ON public.profiles
    USING ((SELECT public.is_account_manager_safe()) AND public.is_my_descendant(id));

  ALTER POLICY profiles_account_manager_descendants_update ON public.profiles
    USING ((SELECT public.is_account_manager_safe()) AND public.is_my_descendant(id))
    WITH CHECK ((SELECT public.is_gerente_safe()) AND public.is_my_descendant(id)
                AND (role = ANY (ARRAY['gestor'::public.user_role, 'atendente'::public.user_role])));

  ALTER POLICY profiles_enterprise_tenant_select ON public.profiles
    USING ((SELECT public.is_enterprise_safe()) AND public.is_user_in_my_tenant(id));

  ALTER POLICY profiles_enterprise_tenant_update ON public.profiles
    USING ((SELECT public.is_enterprise_safe()) AND public.is_user_in_my_tenant(id))
    WITH CHECK ((SELECT public.is_enterprise_safe()) AND public.is_user_in_my_tenant(id));

  ALTER POLICY profiles_insert_hierarchy ON public.profiles
    WITH CHECK ((SELECT public.is_super_admin_safe())
      OR ((SELECT public.is_gerente_safe())
          AND (role = ANY (ARRAY['gestor'::public.user_role, 'atendente'::public.user_role]))
          AND (parent_id = (SELECT public.current_profile_id()))
          AND (tenant_id IN (SELECT public.get_my_child_tenant_ids())))
      OR ((SELECT public.is_gestor_safe())
          AND (role = 'atendente'::public.user_role)
          AND (parent_id = (SELECT public.current_profile_id()))
          AND (tenant_id = (SELECT public.get_current_user_tenant_id()))));

  ALTER POLICY profiles_superadmin_all ON public.profiles
    USING ((SELECT public.is_super_admin_safe()))
    WITH CHECK ((SELECT public.is_super_admin_safe()));

  ALTER POLICY users_own_profile ON public.profiles
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

  -- conferência 1: nenhuma chamada crua sobrou
  SELECT count(*) INTO n_cru
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'profiles'
     AND regexp_replace(coalesce(qual,'') || ' ' || coalesce(with_check,''),
           'SELECT\s+(public\.)?(auth\.uid|is_super_admin|is_super_admin_safe|is_account_manager_safe|is_enterprise_safe|is_gerente_safe|is_gestor_safe|current_profile_id|get_current_user_tenant_id)\(\)', '', 'g')
         ~ '(auth\.uid|is_super_admin|is_super_admin_safe|is_account_manager_safe|is_enterprise_safe|is_gerente_safe|is_gestor_safe|current_profile_id|get_current_user_tenant_id)\(\)';
  IF n_cru > 0 THEN
    RAISE EXCEPTION 'ABORTADO: % policy(ies) de profiles com chamada crua. Desfazendo.', n_cru;
  END IF;

  -- conferência 2 (a que importa): users_own_profile ainda deixa alguém ler o
  -- próprio perfil? Testado com um user_id real e ativo.
  SELECT count(*) INTO v_self
    FROM pg_policies
   WHERE schemaname='public' AND tablename='profiles' AND policyname='users_own_profile'
     AND qual = '(user_id = ( SELECT auth.uid() AS uid))';
  IF v_self <> 1 THEN
    RAISE EXCEPTION 'ABORTADO: users_own_profile nao ficou com o texto esperado. Desfazendo.';
  END IF;

  INSERT INTO supabase_migrations.schema_migrations (version, name)
  VALUES ('20260831000006', 'rls_initplan_lote2_profiles')
  ON CONFLICT (version) DO NOTHING;
END
$lote2$;
