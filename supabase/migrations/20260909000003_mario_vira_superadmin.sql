-- =============================================================================
-- 20260909000003_mario_vira_superadmin
--
-- OPERACAO PONTUAL, NAO E MUDANCA DE SCHEMA. Roda UMA vez, em 2026-09-09.
-- Aplicada em producao pelo MCP, dentro de BEGIN/COMMIT, depois de um ensaio
-- identico terminado em ROLLBACK.
--
-- O QUE FAZ
--   O Mario Acioli era GERENTE da Conta "Mario Acioli", cuja unica Loja
--   (EncaixaRH) saiu na migracao 20260909000002. Ele vira SUPERADMIN, sem
--   Conta - o mesmo formato dos outros tres superadmins (`tenant_id` e
--   `parent_id` nulos, status active).
--
-- PRE-REQUISITO: a migracao 20260909000002. A guarda abaixo confere isso
--   diretamente: se a EncaixaRH ainda estiver na Conta dele, aborta. Tirar o
--   dono antes de a Loja mudar de Conta deixaria a Loja sem ninguem.
--
-- POR QUE UM UNICO UPDATE, e nao "zera o tenant_id primeiro"
--   O CHECK `profiles_tenant_required_for_non_superadmin` e
--       (role = 'superadmin' OR tenant_id IS NOT NULL)
--   e vale por linha, na hora. Um UPDATE separado colocando `tenant_id = NULL`
--   com o cargo ainda em 'gerente' VIOLA o constraint e falha.
--
--   A intencao de "zerar o tenant_id primeiro" era nao repetir a armadilha do
--   ON DELETE CASCADE de `profiles.tenant_id` -> `tenants`. Ela continua
--   cumprida: ao fim deste comando o perfil dele nao aponta para tenant nenhum,
--   entao nenhum DELETE futuro na Conta "Mario Acioli" pode leva-lo junto.
--
-- EFEITO COLATERAL ESPERADO
--   Superadmin NAO enxerga as telas operacionais (LOJA_ONLY_SEGMENTS em
--   `DashboardLayout.tsx`: conversas, contatos, funil, chatbots, campanhas,
--   follow-ups, automacao, numeros). Ele ganha alcance de plataforma e PERDE
--   essas telas - inclusive na propria Conta antiga. Medido: como ele, o RLS
--   entrega 0 conversas e os 6 tenants.
-- =============================================================================

DO $part3$
DECLARE
  k_mario_profile CONSTANT uuid := 'b29f1afd-ae64-4669-9fdd-b2df9395587f';
  k_mario_user    CONSTANT uuid := 'f6b2099e-d4a1-4711-8d35-de7f74943dfa';
  k_mario_email   CONSTANT text := 'mario@sourelevante.com.br';
  k_mario_account CONSTANT uuid := 'af2c0ef5-6339-4b8e-aeb9-bdcfce7d519a';
  k_encaixarh     CONSTANT uuid := '2165be9f-b6bb-49fb-ba6a-1dec6840c45a';
  k_camila_conta  CONSTANT uuid := 'c1a9d2f0-7e64-4b8a-9f31-5d0c8e2b6a47';
  v_role text; v_status text; v_tenant uuid; v_user uuid; v_email text;
  v_parent uuid; v_n int;
BEGIN
  -- ==== GUARDA 1: o perfil do Mario e exatamente o esperado ================
  SELECT p.role::text, p.status, p.tenant_id, p.user_id, p.parent_id
    INTO v_role, v_status, v_tenant, v_user, v_parent
    FROM public.profiles p WHERE p.id = k_mario_profile;

  IF NOT FOUND THEN RAISE EXCEPTION 'ABORTADO: perfil % nao existe.', k_mario_profile; END IF;
  IF v_user IS DISTINCT FROM k_mario_user THEN
    RAISE EXCEPTION 'ABORTADO: user_id e %, esperado %.', v_user, k_mario_user; END IF;
  IF v_role <> 'gerente' THEN
    RAISE EXCEPTION 'ABORTADO: cargo atual e "%", esperado "gerente".', v_role; END IF;
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'ABORTADO: status atual e "%", esperado "active".', v_status; END IF;
  IF v_tenant IS DISTINCT FROM k_mario_account THEN
    RAISE EXCEPTION 'ABORTADO: tenant atual e %, esperado %.', v_tenant, k_mario_account; END IF;

  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = k_mario_user;
  IF v_email IS DISTINCT FROM k_mario_email THEN
    RAISE EXCEPTION 'ABORTADO: e-mail e "%", esperado "%".', v_email, k_mario_email; END IF;

  SELECT count(*) INTO v_n FROM public.profiles WHERE user_id = k_mario_user;
  IF v_n <> 1 THEN RAISE EXCEPTION 'ABORTADO: o login dele tem % perfis.', v_n; END IF;

  -- ==== GUARDA 2: intertravamento com a 20260909000002 =====================
  SELECT t.parent_tenant_id INTO v_parent FROM public.tenants t WHERE t.id = k_encaixarh;
  IF v_parent IS DISTINCT FROM k_camila_conta THEN
    RAISE EXCEPTION 'ABORTADO: EncaixaRH nao esta na Conta da Camila (pai=%). Rode a 20260909000002 antes.', v_parent; END IF;

  SELECT count(*) INTO v_n FROM public.tenants WHERE parent_tenant_id = k_mario_account;
  IF v_n <> 0 THEN RAISE EXCEPTION 'ABORTADO: a Conta do Mario ainda tem % Loja(s).', v_n; END IF;

  -- ==== ESCRITA: um unico UPDATE (ver cabecalho) ===========================
  UPDATE public.profiles
     SET role      = 'superadmin'::public.user_role,
         tenant_id = NULL
   WHERE id = k_mario_profile;

  -- ==== CONFERENCIA ========================================================
  SELECT p.role::text, p.tenant_id, p.parent_id, p.user_id, p.status
    INTO v_role, v_tenant, v_parent, v_user, v_status
    FROM public.profiles p WHERE p.id = k_mario_profile;
  IF v_role <> 'superadmin' OR v_tenant IS NOT NULL OR v_parent IS NOT NULL
     OR v_user <> k_mario_user OR v_status <> 'active' THEN
    RAISE EXCEPTION 'ABORTADO: perfil ficou errado (cargo=%, tenant=%, parent=%, status=%).',
      v_role, v_tenant, v_parent, v_status; END IF;

  -- Todos os superadmins tem de ter a mesma forma.
  SELECT count(*) INTO v_n FROM public.profiles
   WHERE role = 'superadmin'::public.user_role
     AND (tenant_id IS NOT NULL OR status <> 'active');
  IF v_n <> 0 THEN RAISE EXCEPTION 'ABORTADO: % superadmin(s) fora do formato.', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.profiles WHERE tenant_id = k_mario_account;
  IF v_n <> 0 THEN RAISE EXCEPTION 'ABORTADO: a Conta do Mario ainda tem % perfil(is).', v_n; END IF;

  -- A Camila e a Loja dela nao podem ter sido tocadas de raspao.
  SELECT p.role::text, p.tenant_id INTO v_role, v_tenant
    FROM public.profiles p WHERE p.id = '2478dce2-c829-41a6-952d-f6d27db73d78';
  IF v_role <> 'gerente' OR v_tenant IS DISTINCT FROM k_camila_conta THEN
    RAISE EXCEPTION 'ABORTADO: a Camila mudou (cargo=%, tenant=%).', v_role, v_tenant; END IF;

  SELECT count(*) INTO v_n FROM public.conversations WHERE tenant_id = k_encaixarh;
  IF v_n <> 144 THEN RAISE EXCEPTION 'ABORTADO: conversas da EncaixaRH viraram %.', v_n; END IF;
END
$part3$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260909000003','mario_vira_superadmin')
ON CONFLICT (version) DO NOTHING;

-- =============================================================================
-- PENDENTE, DE PROPOSITO: a Conta "Mario Acioli" (af2c0ef5-...) ficou vazia -
-- zero Lojas, zero perfis. NAO foi apagada; a decisao e do dono do projeto.
-- Inventario e recomendacao em `docs/RUNBOOK_camila_conta_propria.md`.
-- =============================================================================
