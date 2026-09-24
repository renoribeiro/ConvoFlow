-- =============================================================================
-- teste_filtro_responsavel_visibilidade.sql — rede de segurança do filtro por
-- responsável da lista de Conversas (2026-09-21).
--
-- O QUE PROVA
--   O filtro por atendente do modal "Filtros" (só gestor/gerente) e as pílulas
--   "Minhas" / "Sem responsável" viram, no PostgREST, um predicado na PRÓPRIA
--   linha de conversations: `assigned_profile_id=in.(...)` e
--   `assigned_profile_id=is.null`. É um WHERE por baixo da policy de SELECT —
--   ele só pode TIRAR linha, nunca pôr. Este arquivo afirma exatamente isso,
--   para cada nível de visibilidade × cargo, com o SQL equivalente ao que o
--   PostgREST gera (RLS aplicado a conversations):
--
--     T1. `in (todos os donos)` ∪ `is null` == a lista sem filtro — os dois
--         predicados PARTICIONAM o visível; o filtro não acrescenta nada;
--     T2. filtrar pelo Bruno (dono das conversas que o atendente restrito não
--         vê) devolve só o que a policy já deixava ver; gabarito de produto:
--         gestor/gerente 3, atendente 'all' 3, restrito 2, superadmin 0;
--     T3. a contagem (count com o mesmo predicado) bate com a lista — é a
--         paridade lista × pílula, no banco;
--     T4. filtrar por si mesmo == pílula "Minhas" == {a conversa da Ana};
--     T5. `is null` == pílula "Sem responsável" ⊆ visível;
--     T6. várias pessoas = QUALQUER uma (OR): união, sem duplicar;
--     T7. o diretório que o seletor oferece (tenant_team_directory) tem só o
--         time da Loja mais o gerente da Conta pai — 4 pessoas — e o id de
--         cada um é o mesmo profiles.id gravado em assigned_profile_id;
--     T8. (gestor/gerente) dono que SAIU do time — Bruno suspenso — some do
--         diretório, mas continua em loja_ineligible_owners com o motivo
--         'suspended' e 3 conversas, e o filtro por ele continua devolvendo
--         as 3: é o que faz "Bruno (suspenso)" aparecer no seletor.
--
--   Cargos: superadmin (0 conversas, sem policy — como sempre), gerente da
--   Conta pai (lê a Loja filha pela gerente_reads_child_store_data), gestor
--   e atendente da Loja.
--
-- SEGURANÇA — por que dá para rodar contra produção
--   BEGIN ... ROLLBACK incondicional. UUIDs de fixture com prefixo 99999999-
--   (os outros testes usam 11111111- a 88888888-). Guarda de colisão antes de
--   semear.
--
-- COMO RODAR
--   Papel `postgres` (SQL Editor ou o MCP de escrita). O MCP read-only não
--   serve: não consegue SET ROLE authenticated. Medido em 2026-09-21: verde.
-- =============================================================================

BEGIN;

-- Fatia 1 do Instagram (20260922000002): contacts.external_id virou NOT NULL e
-- quem preenche é a trigger trg_contacts_set_external_id. Sob
-- session_replication_role = replica ela NÃO dispara, e a semeadura morria com
-- 23502. ENABLE ALWAYS liga SÓ essa trigger, SÓ dentro desta transação (o
-- ROLLBACK desfaz) — a semeadura passa a obedecer a mesma regra da produção.
ALTER TABLE public.contacts ENABLE ALWAYS TRIGGER trg_contacts_set_external_id;

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tenants WHERE id::text LIKE '99999999-%')
     OR EXISTS (SELECT 1 FROM auth.users WHERE id::text LIKE '99999999-%')
     OR EXISTS (SELECT 1 FROM public.profiles WHERE id::text LIKE '99999999-%') THEN
    RAISE EXCEPTION 'ABORTADO: UUID de fixture colide com dado real. Nada foi feito.';
  END IF;
  IF to_regprocedure('public.conversation_visibility_level()') IS NULL
     OR to_regprocedure('public.gerente_child_store_ids()') IS NULL
     OR to_regprocedure('public.tenant_team_directory(uuid)') IS NULL
     OR to_regprocedure('public.loja_ineligible_owners(uuid)') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: migrações 20260914000001 / 20260909000001 / 20260913000001 / 20260915000001 ausentes.';
  END IF;
END
$guard$;

-- -----------------------------------------------------------------------------
-- 1. Semeadura (triggers e FK suspensos)
-- -----------------------------------------------------------------------------
SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
  ('99999999-0000-4000-8000-00000000000a','authenticated','authenticated','fix-r-gerente@fixture.invalid', now(), now()),
  ('99999999-0000-4000-8000-00000000000b','authenticated','authenticated','fix-r-gestor@fixture.invalid',  now(), now()),
  ('99999999-0000-4000-8000-00000000000c','authenticated','authenticated','fix-r-ana@fixture.invalid',     now(), now()),
  ('99999999-0000-4000-8000-00000000000d','authenticated','authenticated','fix-r-bruno@fixture.invalid',   now(), now());

INSERT INTO public.tenants (id, name, slug, kind, parent_tenant_id, status, subscription_status) VALUES
  ('99999999-0000-4000-8000-000000000001','FIXTURE Conta R','fixture-conta-r','account', NULL,'active','active'),
  ('99999999-0000-4000-8000-000000000002','FIXTURE Loja R', 'fixture-loja-r', 'store','99999999-0000-4000-8000-000000000001','active',NULL);

INSERT INTO public.profiles (id, user_id, tenant_id, role, parent_id, status, first_name, last_name) VALUES
  ('99999999-0000-4000-8000-0000000000f0','99999999-0000-4000-8000-000000000000','99999999-0000-4000-8000-000000000001','superadmin', NULL,'active','FIX','Super'),
  ('99999999-0000-4000-8000-0000000000fa','99999999-0000-4000-8000-00000000000a','99999999-0000-4000-8000-000000000001','gerente',    NULL,'active','FIX','Gerente'),
  ('99999999-0000-4000-8000-0000000000fb','99999999-0000-4000-8000-00000000000b','99999999-0000-4000-8000-000000000002','gestor',   '99999999-0000-4000-8000-0000000000fa','active','FIX','Gestor'),
  ('99999999-0000-4000-8000-0000000000fc','99999999-0000-4000-8000-00000000000c','99999999-0000-4000-8000-000000000002','atendente','99999999-0000-4000-8000-0000000000fb','active','FIX','Ana'),
  ('99999999-0000-4000-8000-0000000000fd','99999999-0000-4000-8000-00000000000d','99999999-0000-4000-8000-000000000002','atendente','99999999-0000-4000-8000-0000000000fb','active','FIX','Bruno');

INSERT INTO public.whatsapp_instances (id, tenant_id, name, instance_key) VALUES
  ('99999999-aaaa-4000-8000-000000000002','99999999-0000-4000-8000-000000000002','FIX instancia R','fix-key-r');

INSERT INTO public.contacts (id, tenant_id, phone, name) VALUES
  ('99999999-cccc-4000-8000-000000000001','99999999-0000-4000-8000-000000000002','5511990000001','FIX owned'),
  ('99999999-cccc-4000-8000-000000000002','99999999-0000-4000-8000-000000000002','5511990000002','FIX unowned'),
  ('99999999-cccc-4000-8000-000000000003','99999999-0000-4000-8000-000000000002','5511990000003','FIX others'),
  ('99999999-cccc-4000-8000-000000000004','99999999-0000-4000-8000-000000000002','5511990000004','FIX participated'),
  ('99999999-cccc-4000-8000-000000000005','99999999-0000-4000-8000-000000000002','5511990000005','FIX handed_off');

-- C1 da Ana; C2 sem dono; C3, C4 e C5 do Bruno (C4 com a Ana participante,
-- C5 passada adiante pela Ana). É a mesma geometria dos outros testes.
INSERT INTO public.conversations (id, tenant_id, contact_id, whatsapp_instance_id, unread_count, last_message_at, assigned_profile_id, assigned_at, assigned_by) VALUES
  ('99999999-dddd-4000-8000-000000000001','99999999-0000-4000-8000-000000000002','99999999-cccc-4000-8000-000000000001','99999999-aaaa-4000-8000-000000000002',1,'2026-09-01 10:00+00','99999999-0000-4000-8000-0000000000fc','2026-09-01 10:00+00','99999999-0000-4000-8000-0000000000fc'),
  ('99999999-dddd-4000-8000-000000000002','99999999-0000-4000-8000-000000000002','99999999-cccc-4000-8000-000000000002','99999999-aaaa-4000-8000-000000000002',1,'2026-09-01 10:00+00',NULL,NULL,NULL),
  ('99999999-dddd-4000-8000-000000000003','99999999-0000-4000-8000-000000000002','99999999-cccc-4000-8000-000000000003','99999999-aaaa-4000-8000-000000000002',1,'2026-09-01 10:00+00','99999999-0000-4000-8000-0000000000fd','2026-09-01 10:00+00','99999999-0000-4000-8000-0000000000fd'),
  ('99999999-dddd-4000-8000-000000000004','99999999-0000-4000-8000-000000000002','99999999-cccc-4000-8000-000000000004','99999999-aaaa-4000-8000-000000000002',1,'2026-09-01 10:00+00','99999999-0000-4000-8000-0000000000fd','2026-09-01 10:00+00','99999999-0000-4000-8000-0000000000fd'),
  ('99999999-dddd-4000-8000-000000000005','99999999-0000-4000-8000-000000000002','99999999-cccc-4000-8000-000000000005','99999999-aaaa-4000-8000-000000000002',1,'2026-09-01 10:00+00','99999999-0000-4000-8000-0000000000fd','2026-09-01 10:00+00','99999999-0000-4000-8000-0000000000fc');

INSERT INTO public.conversation_participants (conversation_id, profile_id, first_at) VALUES
  ('99999999-dddd-4000-8000-000000000004','99999999-0000-4000-8000-0000000000fc','2026-09-01 09:00+00');

SET LOCAL session_replication_role = origin;

-- -----------------------------------------------------------------------------
-- 2. Infra dos checks
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _owner_results (
  seq serial, nivel text, cargo text, check_kind text, expected text, actual text, status text
) ON COMMIT DROP;
GRANT ALL ON _owner_results TO authenticated;
GRANT ALL ON SEQUENCE _owner_results_seq_seq TO authenticated;

CREATE FUNCTION pg_temp.afirma(p_nivel text, p_cargo text, p_check text, p_expected text, p_actual text)
RETURNS void LANGUAGE sql AS $f$
  INSERT INTO _owner_results(nivel, cargo, check_kind, expected, actual, status)
  VALUES (p_nivel, p_cargo, p_check, p_expected, p_actual,
          CASE WHEN p_expected = p_actual THEN 'ok' ELSE 'FAIL' END);
$f$;

CREATE FUNCTION pg_temp.como(p_sub uuid) RETURNS void LANGUAGE sql AS $f$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
$f$;

-- O SQL equivalente ao que o PostgREST executa para
--   conversations?select=id&tenant_id=eq.LOJA&is_archived=eq.false
--                 &assigned_profile_id=in.(...)        (p_ids)
--                 &assigned_profile_id=is.null         (p_sem)
-- A tabela passa pelo RLS do chamador.
CREATE FUNCTION pg_temp.lista_por_responsavel(p_loja uuid, p_ids uuid[], p_sem boolean) RETURNS SETOF uuid
LANGUAGE sql AS $f$
  SELECT c.id
    FROM public.conversations c
   WHERE c.tenant_id = p_loja
     AND c.is_archived = false
     AND (p_ids IS NULL OR c.assigned_profile_id = ANY (p_ids))
     AND (NOT p_sem OR c.assigned_profile_id IS NULL);
$f$;

-- -----------------------------------------------------------------------------
-- 3. A bateria
-- -----------------------------------------------------------------------------
DO $bateria$
DECLARE
  LOJA   constant uuid := '99999999-0000-4000-8000-000000000002';
  SUPER  constant uuid := '99999999-0000-4000-8000-000000000000';
  GER    constant uuid := '99999999-0000-4000-8000-00000000000a';
  GES    constant uuid := '99999999-0000-4000-8000-00000000000b';
  ANA    constant uuid := '99999999-0000-4000-8000-00000000000c';
  P_ANA   constant uuid := '99999999-0000-4000-8000-0000000000fc';
  P_BRUNO constant uuid := '99999999-0000-4000-8000-0000000000fd';
  P_GES   constant uuid := '99999999-0000-4000-8000-0000000000fb';
  P_GER   constant uuid := '99999999-0000-4000-8000-0000000000fa';
  C1     constant uuid := '99999999-dddd-4000-8000-000000000001';
  nivel text; cargo record;
  visiveis uuid[]; filtradas uuid[]; particao uuid[]; n int; exp int; n_dir int; n_dir_ok int;
BEGIN
  FOREACH nivel IN ARRAY ARRAY['all','unassigned','own'] LOOP
    RESET ROLE;
    UPDATE public.tenants SET settings = jsonb_build_object('atendente_visibility', nivel) WHERE id = LOJA;

    FOR cargo IN SELECT * FROM (VALUES ('superadmin', SUPER), ('gerente', GER), ('gestor', GES), ('atendente', ANA)) AS v(nome, sub) LOOP
      SET LOCAL ROLE authenticated;
      PERFORM pg_temp.como(cargo.sub);

      -- O que a policy deixa ver, sem filtro nenhum (a lista de hoje).
      SELECT coalesce(array_agg(id ORDER BY id), '{}') INTO visiveis
        FROM public.conversations WHERE tenant_id = LOJA AND is_archived = false;

      -- T1. `in (todos os donos)` ∪ `is null` == lista sem filtro: partição.
      SELECT coalesce(array_agg(x ORDER BY x), '{}') INTO particao FROM (
        SELECT x FROM pg_temp.lista_por_responsavel(LOJA, ARRAY[P_ANA, P_BRUNO], false) AS x
        UNION
        SELECT x FROM pg_temp.lista_por_responsavel(LOJA, NULL, true) AS x
      ) u;
      PERFORM pg_temp.afirma(nivel, cargo.nome, 'T1. in(donos) U is.null == lista sem filtro (o filtro não acrescenta)',
                             visiveis::text, particao::text);
      -- ...e os dois lados são disjuntos (uma conversa tem um dono ou nenhum).
      SELECT count(*) INTO n FROM (
        SELECT x FROM pg_temp.lista_por_responsavel(LOJA, ARRAY[P_ANA, P_BRUNO], false) AS x
        INTERSECT
        SELECT x FROM pg_temp.lista_por_responsavel(LOJA, NULL, true) AS x
      ) i;
      PERFORM pg_temp.afirma(nivel, cargo.nome, 'T1b. in(donos) e is.null são disjuntos', '0', n::text);

      -- T2. filtrar pelo Bruno: entra SÓ o que a policy já deixava ver.
      SELECT count(*) INTO exp FROM public.conversations
       WHERE id = ANY (visiveis) AND assigned_profile_id = P_BRUNO;
      SELECT count(*) INTO n FROM pg_temp.lista_por_responsavel(LOJA, ARRAY[P_BRUNO], false);
      PERFORM pg_temp.afirma(nivel, cargo.nome, 'T2. filtrar pelo Bruno: entra só o que a policy deixa',
                             exp::text, n::text);
      -- ...e o gabarito de produto, para não depender só de "visiveis":
      PERFORM pg_temp.afirma(nivel, cargo.nome, 'T2b. gabarito: gestor/gerente 3, atendente all 3, restrito 2 (participante + passou adiante), superadmin 0',
                             CASE WHEN cargo.nome IN ('gestor','gerente') THEN '3'
                                  WHEN cargo.nome = 'atendente' AND nivel = 'all' THEN '3'
                                  WHEN cargo.nome = 'atendente' THEN '2'
                                  ELSE '0' END,
                             n::text);

      -- T3. contagem com o mesmo predicado == tamanho da lista filtrada
      --     (é a pílula batendo com a lista), nos três recortes.
      SELECT coalesce(array_agg(x ORDER BY x), '{}') INTO filtradas FROM pg_temp.lista_por_responsavel(LOJA, ARRAY[P_BRUNO], false) AS x;
      PERFORM pg_temp.afirma(nivel, cargo.nome, 'T3. count(in Bruno) == lista filtrada',
                             cardinality(filtradas)::text,
                             (SELECT count(*) FROM pg_temp.lista_por_responsavel(LOJA, ARRAY[P_BRUNO], false))::text);
      SELECT coalesce(array_agg(x ORDER BY x), '{}') INTO filtradas FROM pg_temp.lista_por_responsavel(LOJA, NULL, true) AS x;
      PERFORM pg_temp.afirma(nivel, cargo.nome, 'T3b. count(is.null) == lista filtrada',
                             cardinality(filtradas)::text,
                             (SELECT count(*) FROM pg_temp.lista_por_responsavel(LOJA, NULL, true))::text);

      -- T4. filtrar por si mesmo == pílula "Minhas". Para a Ana é {C1} em
      --     qualquer nível; para gestor/gerente, que não têm conversa, é vazio.
      SELECT coalesce(array_agg(x ORDER BY x), '{}') INTO filtradas
        FROM pg_temp.lista_por_responsavel(LOJA, ARRAY[(SELECT p.id FROM public.profiles p WHERE p.user_id = cargo.sub)], false) AS x;
      PERFORM pg_temp.afirma(nivel, cargo.nome, 'T4. filtrar por mim == "Minhas" (Ana: {C1}; os outros: vazio)',
                             CASE WHEN cargo.nome = 'atendente' THEN ARRAY[C1]::text ELSE '{}' END,
                             filtradas::text);

      -- T5. `is null` == pílula "Sem responsável" ⊆ visível.
      SELECT count(*) INTO exp FROM public.conversations
       WHERE id = ANY (visiveis) AND assigned_profile_id IS NULL;
      SELECT count(*) INTO n FROM pg_temp.lista_por_responsavel(LOJA, NULL, true);
      PERFORM pg_temp.afirma(nivel, cargo.nome, 'T5. is.null == "Sem responsável" dentro do visível', exp::text, n::text);
      PERFORM pg_temp.afirma(nivel, cargo.nome, 'T5b. gabarito: 1 para todo mundo, exceto atendente em own (0) e superadmin (0)',
                             CASE WHEN cargo.nome = 'superadmin' THEN '0'
                                  WHEN cargo.nome = 'atendente' AND nivel = 'own' THEN '0'
                                  ELSE '1' END,
                             n::text);

      -- T6. duas pessoas = QUALQUER uma (OR): Ana ∪ Bruno == visível menos sem dono.
      SELECT coalesce(array_agg(id ORDER BY id), '{}') INTO particao FROM public.conversations
       WHERE id = ANY (visiveis) AND assigned_profile_id IS NOT NULL;
      SELECT coalesce(array_agg(x ORDER BY x), '{}') INTO filtradas FROM pg_temp.lista_por_responsavel(LOJA, ARRAY[P_ANA, P_BRUNO], false) AS x;
      PERFORM pg_temp.afirma(nivel, cargo.nome, 'T6. duas pessoas = qualquer uma: união, sem duplicar', particao::text, filtradas::text);

      -- T7. o diretório do seletor: Ana, Bruno, Gestor e o Gerente da Conta pai
      --     (4), e cada id é um profiles.id que casa com assigned_profile_id.
      --     O superadmin não é da Loja nem gerente dela: a RPC devolve nada.
      --     (Comparado com os ids literais, e não com um SELECT em profiles:
      --     esse SELECT passaria pelo RLS de profiles do chamador, que para
      --     o atendente devolve só ele mesmo, e o check mediria a coisa errada.)
      SELECT count(*), count(*) FILTER (WHERE d.id = ANY (ARRAY[P_ANA, P_BRUNO, P_GES, P_GER]))
        INTO n_dir, n_dir_ok
        FROM public.tenant_team_directory(LOJA) d;
      PERFORM pg_temp.afirma(nivel, cargo.nome, 'T7. seletor oferece o time da Loja + gerente da Conta (4); superadmin 0',
                             CASE WHEN cargo.nome = 'superadmin' THEN '0' ELSE '4' END, n_dir::text);
      PERFORM pg_temp.afirma(nivel, cargo.nome, 'T7b. todo id do seletor é um profiles.id (o que assigned_profile_id guarda)',
                             n_dir::text, n_dir_ok::text);
      RESET ROLE;
    END LOOP;
  END LOOP;

  -- T8. Dono que saiu do time: Bruno suspenso. Some do diretório; entra em
  --     loja_ineligible_owners com o motivo; o filtro por ele segue devolvendo
  --     as 3 conversas para quem administra. Só gestor e gerente (a RPC de
  --     indisponíveis devolve nada para quem não administra).
  RESET ROLE;
  UPDATE public.tenants SET settings = NULL WHERE id = LOJA;
  UPDATE public.profiles SET status = 'suspended' WHERE id = P_BRUNO;
  FOR cargo IN SELECT * FROM (VALUES ('gerente', GER), ('gestor', GES)) AS v(nome, sub) LOOP
    SET LOCAL ROLE authenticated;
    PERFORM pg_temp.como(cargo.sub);
    SELECT count(*) INTO n FROM public.tenant_team_directory(LOJA) d WHERE d.id = P_BRUNO;
    PERFORM pg_temp.afirma('bruno suspenso', cargo.nome, 'T8. Bruno saiu do diretório', '0', n::text);
    SELECT count(*) INTO n FROM public.loja_ineligible_owners(LOJA) o
     WHERE o.profile_id = P_BRUNO AND o.reason = 'suspended' AND o.n_conversations = 3;
    PERFORM pg_temp.afirma('bruno suspenso', cargo.nome, 'T8b. Bruno está em loja_ineligible_owners: suspended, 3 conversas', '1', n::text);
    SELECT count(*) INTO n FROM pg_temp.lista_por_responsavel(LOJA, ARRAY[P_BRUNO], false);
    PERFORM pg_temp.afirma('bruno suspenso', cargo.nome, 'T8c. filtrar pelo Bruno (suspenso) continua devolvendo as 3', '3', n::text);
    RESET ROLE;
  END LOOP;
  -- ...e o atendente não recebe a lista de indisponíveis (a seção nem existe para ele).
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.como(ANA);
  SELECT count(*) INTO n FROM public.loja_ineligible_owners(LOJA);
  PERFORM pg_temp.afirma('bruno suspenso', 'atendente', 'T8d. atendente não recebe indisponíveis', '0', n::text);
  RESET ROLE;
END
$bateria$;

-- -----------------------------------------------------------------------------
-- 4. Placar
-- -----------------------------------------------------------------------------
SELECT count(*) FILTER (WHERE status='ok')   AS passou,
       count(*) FILTER (WHERE status='FAIL') AS falhou,
       CASE WHEN count(*) FILTER (WHERE status='FAIL') = 0
            THEN 'SUITE VERDE' ELSE 'SUITE VERMELHA' END AS placar,
       coalesce(string_agg(nivel || ' / ' || cargo || ' / ' || check_kind
                           || ' [esperado ' || expected || ', obtido ' || actual || ']', '; ' ORDER BY seq)
                FILTER (WHERE status='FAIL'), '-') AS falhas
FROM _owner_results;

ROLLBACK;
