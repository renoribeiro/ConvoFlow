-- =============================================================================
-- 20260909000002_camila_conta_propria_gerente
--
-- OPERACAO PONTUAL, NAO E MUDANCA DE SCHEMA. Roda UMA vez, em 2026-09-09.
-- Aplicada em producao pelo MCP, dentro de BEGIN/COMMIT, depois de um ensaio
-- identico terminado em ROLLBACK que passou por todas as guardas.
--
-- O QUE FAZ
--   A Camila Santarosa era GESTOR da Loja EncaixaRH, que ficava pendurada na
--   Conta "Mario Acioli". Ela passa a ser GERENTE de uma Conta propria, e a
--   EncaixaRH passa a ser Loja dessa Conta.
--
--   Mesmo login, mesmo e-mail, mesmo `user_id`, mesmo perfil (mesmo `id`).
--   Nenhum dado da Loja se move: as 144 conversas, 145 contatos e 2.234
--   mensagens continuam com `tenant_id` = EncaixaRH.
--
-- PRE-REQUISITO: a migracao 20260909000001. Sem ela a Camila abriria a
--   EncaixaRH no seletor e veria a tela VAZIA - o RLS das tabelas operacionais
--   olha o `tenant_id` do proprio perfil, nao a Loja escolhida no seletor.
--
-- DECISOES
--   parent_id -> NULL. Dona de Conta e raiz da arvore de perfis. Deixar
--     apontando para o Mario a manteria dentro do `descendant_profile_ids` dele
--     e faria a Conta nova dela aparecer no `is_tenant_in_my_descendants` dele.
--     Os outros tres gerentes ja tem `parent_id` nulo.
--   slug -> 'camila-santarosa-2478dce2'. O slug 'camila-santarosa' e UNIQUE e
--     ja pertence a Loja EncaixaRH. O sufixo e o prefixo do id do perfil dela,
--     no mesmo formato de 'mario-acioli-b29f1afd'.
--   nome -> 'Camila Santarosa'. Conta leva o nome do dono, Loja leva a marca -
--     e a convencao que "Mario Acioli" / "EncaixaRH" ja seguia.
--   kind e manual_access_granted vao EXPLICITOS: os defaults do schema
--     ('store' e false) estao os dois errados para uma Conta liberada.
--   A EncaixaRH mantem `manual_access_granted = true` na propria linha. Nao faz
--     efeito hoje (a cobranca sobe para a Conta), mas e a rede de seguranca se
--     um dia ela ficar orfa - ver `src/lib/access/tenantAccess.ts`.
--
-- ORDEM (evita as armadilhas de cascata)
--   (a) cria a Conta      - `profiles.tenant_id` -> `tenants` e ON DELETE
--                           CASCADE, entao a linha destino tem de existir antes.
--   (b) move o perfil     - UM UNICO UPDATE: o CHECK
--                           `profiles_tenant_required_for_non_superadmin` nao
--                           admite instante com `tenant_id` nulo.
--   (c) reparenta a Loja  - o gatilho `enforce_store_slot_capacity` confere as
--                           vagas da Conta nova (5 incluidas, 0 usadas).
--   (d) audita a liberacao manual em `tenant_access_events`.
-- =============================================================================

DO $part2$
DECLARE
  k_camila_profile CONSTANT uuid := '2478dce2-c829-41a6-952d-f6d27db73d78';
  k_camila_user    CONSTANT uuid := '88ae5e44-4a91-4149-a9e1-fb4b2479e5b6';
  k_camila_email   CONSTANT text := 'camila@encaixarh.com.br';
  k_encaixarh      CONSTANT uuid := '2165be9f-b6bb-49fb-ba6a-1dec6840c45a';
  k_mario_account  CONSTANT uuid := 'af2c0ef5-6339-4b8e-aeb9-bdcfce7d519a';
  k_yuri_user      CONSTANT uuid := '91673c65-11f8-4eb4-b797-ab8acfd7b955';
  k_nova_conta     CONSTANT uuid := 'c1a9d2f0-7e64-4b8a-9f31-5d0c8e2b6a47';
  k_nova_slug      CONSTANT text := 'camila-santarosa-2478dce2';

  v_role text; v_status text; v_tenant uuid; v_user uuid; v_email text; v_n int;
  v_kind text; v_name text; v_parent uuid; v_unlocked boolean; v_source text;
BEGIN
  -- ==== GUARDA 1: o perfil da Camila e exatamente o esperado ================
  SELECT p.role::text, p.status, p.tenant_id, p.user_id
    INTO v_role, v_status, v_tenant, v_user
    FROM public.profiles p WHERE p.id = k_camila_profile;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ABORTADO: perfil % nao existe.', k_camila_profile;
  END IF;
  IF v_user IS DISTINCT FROM k_camila_user THEN
    RAISE EXCEPTION 'ABORTADO: user_id do perfil e %, esperado %.', v_user, k_camila_user;
  END IF;
  IF v_role <> 'gestor' THEN
    RAISE EXCEPTION 'ABORTADO: cargo atual e "%", esperado "gestor". Alguem ja mexeu.', v_role;
  END IF;
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'ABORTADO: status atual e "%", esperado "active".', v_status;
  END IF;
  IF v_tenant IS DISTINCT FROM k_encaixarh THEN
    RAISE EXCEPTION 'ABORTADO: tenant atual do perfil e %, esperado EncaixaRH %.', v_tenant, k_encaixarh;
  END IF;

  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = k_camila_user;
  IF v_email IS DISTINCT FROM k_camila_email THEN
    RAISE EXCEPTION 'ABORTADO: e-mail do login e "%", esperado "%".', v_email, k_camila_email;
  END IF;

  SELECT count(*) INTO v_n FROM public.profiles WHERE user_id = k_camila_user;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'ABORTADO: o login dela tem % perfis, esperado exatamente 1.', v_n;
  END IF;

  -- ==== GUARDA 2: EncaixaRH e exatamente a Loja esperada ====================
  SELECT t.name, t.kind, t.parent_tenant_id INTO v_name, v_kind, v_parent
    FROM public.tenants t WHERE t.id = k_encaixarh;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ABORTADO: tenant % nao existe.', k_encaixarh;
  END IF;
  IF v_name <> 'EncaixaRH' THEN
    RAISE EXCEPTION 'ABORTADO: nome da Loja e "%", esperado "EncaixaRH".', v_name;
  END IF;
  IF v_kind <> 'store' THEN
    RAISE EXCEPTION 'ABORTADO: kind da Loja e "%", esperado "store".', v_kind;
  END IF;
  IF v_parent IS DISTINCT FROM k_mario_account THEN
    RAISE EXCEPTION 'ABORTADO: pai atual da Loja e %, esperado a Conta do Mario %.', v_parent, k_mario_account;
  END IF;

  -- ==== GUARDA 3: a Conta nova ainda nao existe ============================
  IF EXISTS (SELECT 1 FROM public.tenants WHERE id = k_nova_conta OR slug = k_nova_slug) THEN
    RAISE EXCEPTION 'ABORTADO: id ou slug da Conta nova ja existe.';
  END IF;

  -- ==== (a) a Conta ========================================================
  INSERT INTO public.tenants
    (id, name, slug, kind, parent_tenant_id, status,
     manual_access_granted, manual_access_granted_by, manual_access_granted_at,
     store_slots_included, store_slots_extra)
  VALUES
    (k_nova_conta, 'Camila Santarosa', k_nova_slug, 'account', NULL, 'active',
     TRUE, k_yuri_user, now(),
     5, 0);

  -- ==== (b) o perfil dela ==================================================
  UPDATE public.profiles
     SET role      = 'gerente'::public.user_role,
         tenant_id = k_nova_conta,
         parent_id = NULL
   WHERE id = k_camila_profile;

  -- ==== (c) a Loja muda de Conta ===========================================
  UPDATE public.tenants
     SET parent_tenant_id = k_nova_conta
   WHERE id = k_encaixarh;

  -- ==== (d) auditoria ======================================================
  INSERT INTO public.tenant_access_events (tenant_id, action, source, actor_user_id, note)
  VALUES (k_nova_conta, 'granted', 'manual', k_yuri_user,
          'Conta propria da Camila Santarosa (conversao de gestor da EncaixaRH para gerente). Liberacao manual na Conta para nao cobrar.');

  -- ==== CONFERENCIA ========================================================
  SELECT p.role::text, p.tenant_id, p.parent_id, p.user_id, p.status
    INTO v_role, v_tenant, v_parent, v_user, v_status
    FROM public.profiles p WHERE p.id = k_camila_profile;

  IF v_role <> 'gerente' OR v_tenant <> k_nova_conta OR v_parent IS NOT NULL
     OR v_user <> k_camila_user OR v_status <> 'active' THEN
    RAISE EXCEPTION 'ABORTADO: perfil ficou errado (cargo=%, tenant=%, parent=%, user=%, status=%).',
      v_role, v_tenant, v_parent, v_user, v_status;
  END IF;

  SELECT t.kind, t.parent_tenant_id INTO v_kind, v_parent
    FROM public.tenants t WHERE t.id = k_encaixarh;
  IF v_kind <> 'store' OR v_parent IS DISTINCT FROM k_nova_conta THEN
    RAISE EXCEPTION 'ABORTADO: EncaixaRH ficou errada (kind=%, parent=%).', v_kind, v_parent;
  END IF;

  SELECT count(*) INTO v_n FROM public.tenants WHERE parent_tenant_id = k_mario_account;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'ABORTADO: a Conta do Mario ainda tem % Loja(s).', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.conversations WHERE tenant_id = k_encaixarh;
  IF v_n <> 144 THEN RAISE EXCEPTION 'ABORTADO: conversas da EncaixaRH viraram %, esperado 144.', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.contacts WHERE tenant_id = k_encaixarh;
  IF v_n <> 145 THEN RAISE EXCEPTION 'ABORTADO: contatos da EncaixaRH viraram %, esperado 145.', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.messages WHERE tenant_id = k_encaixarh;
  IF v_n <> 2234 THEN RAISE EXCEPTION 'ABORTADO: mensagens da EncaixaRH viraram %, esperado 2234.', v_n; END IF;

  -- ==== PAYWALL: ela tem de resolver LIBERADA nas duas linhas ==============
  -- O gerente NAO tem bypass de paywall desde 2026-08-19 (useTenantAccess.ts),
  -- entao a liberacao manual na Conta e o que sustenta o acesso dela.
  -- tenant_access_state le auth.uid(); a identidade e trocada aqui para isso.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', k_camila_user, 'role', 'authenticated')::text, true);

  SELECT s.unlocked, s.source INTO v_unlocked, v_source
    FROM public.tenant_access_state(k_nova_conta) s;
  IF v_unlocked IS NOT TRUE THEN
    RAISE EXCEPTION 'ABORTADO: a Conta nova resolveu TRANCADA (source=%). Ela cairia no paywall.', v_source;
  END IF;

  SELECT s.unlocked, s.source INTO v_unlocked, v_source
    FROM public.tenant_access_state(k_encaixarh) s;
  IF v_unlocked IS NOT TRUE THEN
    RAISE EXCEPTION 'ABORTADO: a EncaixaRH resolveu TRANCADA (source=%).', v_source;
  END IF;

  PERFORM set_config('request.jwt.claims', '', true);
END
$part2$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260909000002','camila_conta_propria_gerente')
ON CONFLICT (version) DO NOTHING;
