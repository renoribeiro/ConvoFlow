-- =============================================================================
-- Fase 1 (b) — Atribuir Bruno (Loja própria) e Mario (Superadmin)
-- =============================================================================
-- Após a Migration C (isolate_yuri_reno_tenants), descobrimos que existiam dois
-- profiles adicionais no "Super Admin Tenant" que não estavam mapeados no plano:
--   - bbrunomoura29@gmail.com  (era role=user, virou loja na Migration B)
--   - mario@sourelevante.com.br (era role=user, virou loja na Migration B)
--
-- Decisão do usuário (2026-05-13):
--   - Bruno vira Loja independente (tenant próprio "Loja - Bruno Moura").
--   - Mario vira Superadmin (tenant_id = NULL).
--
-- Após essa migration, o Super Admin Tenant fica sem nenhum profile e é deletado.
-- =============================================================================

DO $$
DECLARE
  v_new_bruno_tenant_id uuid;
  v_old_super_tenant_id constant uuid := '55741cc1-8b57-4755-81d6-ebb90b81a2ca';
  v_bruno_user_id       uuid;
  v_mario_user_id       uuid;
BEGIN
  SELECT id INTO v_bruno_user_id FROM auth.users WHERE email = 'bbrunomoura29@gmail.com' LIMIT 1;
  SELECT id INTO v_mario_user_id FROM auth.users WHERE email = 'mario@sourelevante.com.br' LIMIT 1;

  IF v_bruno_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário bbrunomoura29@gmail.com não encontrado';
  END IF;
  IF v_mario_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário mario@sourelevante.com.br não encontrado';
  END IF;

  -- Criar tenant pra Bruno (Loja independente)
  INSERT INTO public.tenants (name, slug, status, plan_type, parent_tenant_id)
  VALUES ('Loja - Bruno Moura', 'loja-bruno-moura', 'active'::tenant_status, 'basic', NULL)
  RETURNING id INTO v_new_bruno_tenant_id;

  RAISE NOTICE 'Novo tenant criado para Bruno: %', v_new_bruno_tenant_id;

  -- Bruno: já é role=loja, move pro tenant próprio
  UPDATE public.profiles
  SET tenant_id = v_new_bruno_tenant_id
  WHERE user_id = v_bruno_user_id;

  -- Mario: vira superadmin com tenant_id NULL
  UPDATE public.profiles
  SET role = 'superadmin'::public.user_role,
      tenant_id = NULL
  WHERE user_id = v_mario_user_id;

  -- Deletar Super Admin Tenant se ficou vazio
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE tenant_id = v_old_super_tenant_id) THEN
    DELETE FROM public.tenants WHERE id = v_old_super_tenant_id;
    RAISE NOTICE 'Super Admin Tenant removido.';
  ELSE
    RAISE NOTICE 'Super Admin Tenant ainda tem profiles — NÃO removido.';
  END IF;
END
$$;
