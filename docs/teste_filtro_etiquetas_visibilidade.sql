-- =============================================================================
-- teste_filtro_etiquetas_visibilidade.sql — rede de segurança do filtro por
-- etiqueta da lista de Conversas (2026-09-21).
--
-- O QUE PROVA
--   O filtro por etiqueta do modal "Filtros" vira, no PostgREST, um segundo
--   embed de contact_tags com `!inner` (alias etiquetas_filtro) e um `in` no
--   caminho `contacts.etiquetas_filtro.tag_id`. Isso é um JOIN por baixo da
--   policy de SELECT de `conversations` — ele só pode TIRAR linha, nunca pôr.
--   Este arquivo afirma exatamente isso, para cada nível de visibilidade ×
--   cargo, com o SQL equivalente ao que o PostgREST gera (EXISTS aninhado,
--   RLS aplicado a conversations, contacts e contact_tags):
--
--     T1. filtrar por uma etiqueta que TODOS os contatos têm devolve o MESMO
--         conjunto que a lista sem filtro — o filtro não acrescenta nada;
--     T2. filtrar por uma etiqueta que só o contato da conversa ESCONDIDA tem
--         devolve zero para o atendente restrito (e 1 para gestor/gerente);
--     T3. a contagem (count com o mesmo predicado) bate com a lista — é a
--         paridade lista × pílula, no banco;
--     T4. uma etiqueta de OUTRA Conta (mesmo nome, id diferente) não casa
--         com nada — etiqueta é da Loja;
--     T5. a lista de etiquetas que o modal oferece (`tags WHERE tenant_id =
--         Loja`) tem só as da Loja, inclusive para o gerente, que por RLS
--         lê as da Conta E das Lojas.
--
--   Cargos: superadmin (0 conversas, sem policy — como sempre), gerente da
--   Conta pai (lê a Loja filha pela gerente_reads_child_store_data), gestor
--   e atendente da Loja.
--
-- SEGURANÇA — por que dá para rodar contra produção
--   BEGIN ... ROLLBACK incondicional. UUIDs de fixture com prefixo 88888888-
--   (os outros testes usam 11111111-, 22222222-, 33333333-, 44444444-,
--   55555555-, 66666666- e 77777777-). Guarda de colisão antes de semear.
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
  IF EXISTS (SELECT 1 FROM public.tenants WHERE id::text LIKE '88888888-%')
     OR EXISTS (SELECT 1 FROM auth.users WHERE id::text LIKE '88888888-%')
     OR EXISTS (SELECT 1 FROM public.tags WHERE id::text LIKE '88888888-%') THEN
    RAISE EXCEPTION 'ABORTADO: UUID de fixture colide com dado real. Nada foi feito.';
  END IF;
  IF to_regprocedure('public.conversation_visibility_level()') IS NULL
     OR to_regprocedure('public.gerente_child_store_ids()') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: migrações 20260914000001 / 20260909000001 ausentes.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contact_tags'
                    AND policyname = 'gerente_reads_child_store_data') THEN
    RAISE EXCEPTION 'ABORTADO: falta a policy de contact_tags da 20260917000002.';
  END IF;
END
$guard$;

-- -----------------------------------------------------------------------------
-- 1. Semeadura (triggers e FK suspensos)
-- -----------------------------------------------------------------------------
SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
  ('88888888-0000-4000-8000-00000000000a','authenticated','authenticated','fix-t-gerente@fixture.invalid', now(), now()),
  ('88888888-0000-4000-8000-00000000000b','authenticated','authenticated','fix-t-gestor@fixture.invalid',  now(), now()),
  ('88888888-0000-4000-8000-00000000000c','authenticated','authenticated','fix-t-ana@fixture.invalid',     now(), now()),
  ('88888888-0000-4000-8000-00000000000d','authenticated','authenticated','fix-t-bruno@fixture.invalid',   now(), now());

INSERT INTO public.tenants (id, name, slug, kind, parent_tenant_id, status, subscription_status) VALUES
  ('88888888-0000-4000-8000-000000000001','FIXTURE Conta T','fixture-conta-t','account', NULL,'active','active'),
  ('88888888-0000-4000-8000-000000000002','FIXTURE Loja T', 'fixture-loja-t', 'store','88888888-0000-4000-8000-000000000001','active',NULL);

INSERT INTO public.profiles (id, user_id, tenant_id, role, parent_id, status, first_name, last_name) VALUES
  ('88888888-0000-4000-8000-0000000000f0','88888888-0000-4000-8000-000000000000','88888888-0000-4000-8000-000000000001','superadmin', NULL,'active','FIX','Super'),
  ('88888888-0000-4000-8000-0000000000fa','88888888-0000-4000-8000-00000000000a','88888888-0000-4000-8000-000000000001','gerente',    NULL,'active','FIX','Gerente'),
  ('88888888-0000-4000-8000-0000000000fb','88888888-0000-4000-8000-00000000000b','88888888-0000-4000-8000-000000000002','gestor',   '88888888-0000-4000-8000-0000000000fa','active','FIX','Gestor'),
  ('88888888-0000-4000-8000-0000000000fc','88888888-0000-4000-8000-00000000000c','88888888-0000-4000-8000-000000000002','atendente','88888888-0000-4000-8000-0000000000fb','active','FIX','Ana'),
  ('88888888-0000-4000-8000-0000000000fd','88888888-0000-4000-8000-00000000000d','88888888-0000-4000-8000-000000000002','atendente','88888888-0000-4000-8000-0000000000fb','active','FIX','Bruno');

INSERT INTO public.whatsapp_instances (id, tenant_id, name, instance_key) VALUES
  ('88888888-aaaa-4000-8000-000000000002','88888888-0000-4000-8000-000000000002','FIX instancia T','fix-key-t');

INSERT INTO public.contacts (id, tenant_id, phone, name) VALUES
  ('88888888-cccc-4000-8000-000000000001','88888888-0000-4000-8000-000000000002','5511980000001','FIX owned'),
  ('88888888-cccc-4000-8000-000000000002','88888888-0000-4000-8000-000000000002','5511980000002','FIX unowned'),
  ('88888888-cccc-4000-8000-000000000003','88888888-0000-4000-8000-000000000002','5511980000003','FIX others'),
  ('88888888-cccc-4000-8000-000000000004','88888888-0000-4000-8000-000000000002','5511980000004','FIX participated'),
  ('88888888-cccc-4000-8000-000000000005','88888888-0000-4000-8000-000000000002','5511980000005','FIX handed_off');

INSERT INTO public.conversations (id, tenant_id, contact_id, whatsapp_instance_id, unread_count, last_message_at, assigned_profile_id, assigned_at, assigned_by) VALUES
  ('88888888-dddd-4000-8000-000000000001','88888888-0000-4000-8000-000000000002','88888888-cccc-4000-8000-000000000001','88888888-aaaa-4000-8000-000000000002',1,'2026-09-01 10:00+00','88888888-0000-4000-8000-0000000000fc','2026-09-01 10:00+00','88888888-0000-4000-8000-0000000000fc'),
  ('88888888-dddd-4000-8000-000000000002','88888888-0000-4000-8000-000000000002','88888888-cccc-4000-8000-000000000002','88888888-aaaa-4000-8000-000000000002',1,'2026-09-01 10:00+00',NULL,NULL,NULL),
  ('88888888-dddd-4000-8000-000000000003','88888888-0000-4000-8000-000000000002','88888888-cccc-4000-8000-000000000003','88888888-aaaa-4000-8000-000000000002',1,'2026-09-01 10:00+00','88888888-0000-4000-8000-0000000000fd','2026-09-01 10:00+00','88888888-0000-4000-8000-0000000000fd'),
  ('88888888-dddd-4000-8000-000000000004','88888888-0000-4000-8000-000000000002','88888888-cccc-4000-8000-000000000004','88888888-aaaa-4000-8000-000000000002',1,'2026-09-01 10:00+00','88888888-0000-4000-8000-0000000000fd','2026-09-01 10:00+00','88888888-0000-4000-8000-0000000000fd'),
  ('88888888-dddd-4000-8000-000000000005','88888888-0000-4000-8000-000000000002','88888888-cccc-4000-8000-000000000005','88888888-aaaa-4000-8000-000000000002',1,'2026-09-01 10:00+00','88888888-0000-4000-8000-0000000000fd','2026-09-01 10:00+00','88888888-0000-4000-8000-0000000000fc');

INSERT INTO public.conversation_participants (conversation_id, profile_id, first_at) VALUES
  ('88888888-dddd-4000-8000-000000000004','88888888-0000-4000-8000-0000000000fc','2026-09-01 09:00+00');

-- Etiquetas: "Quente" em TODOS os contatos da Loja; "Frio" só no contato da
-- conversa do Bruno (a que o atendente restrito não vê); e uma "Quente" da
-- CONTA pai, com o mesmo nome e outro id, em ninguém.
INSERT INTO public.tags (id, tenant_id, name, color) VALUES
  ('88888888-eeee-4000-8000-000000000001','88888888-0000-4000-8000-000000000002','FIX Quente','#ef4444'),
  ('88888888-eeee-4000-8000-000000000002','88888888-0000-4000-8000-000000000002','FIX Frio',  '#3b82f6'),
  ('88888888-eeee-4000-8000-000000000009','88888888-0000-4000-8000-000000000001','FIX Quente','#ef4444');

INSERT INTO public.contact_tags (contact_id, tag_id)
SELECT k.id, '88888888-eeee-4000-8000-000000000001' FROM public.contacts k WHERE k.id::text LIKE '88888888-cccc-%';
INSERT INTO public.contact_tags (contact_id, tag_id) VALUES
  ('88888888-cccc-4000-8000-000000000003','88888888-eeee-4000-8000-000000000002');

SET LOCAL session_replication_role = origin;

-- -----------------------------------------------------------------------------
-- 2. Infra dos checks
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _tag_results (
  seq serial, nivel text, cargo text, check_kind text, expected text, actual text, status text
) ON COMMIT DROP;
GRANT ALL ON _tag_results TO authenticated;
GRANT ALL ON SEQUENCE _tag_results_seq_seq TO authenticated;

CREATE FUNCTION pg_temp.afirma(p_nivel text, p_cargo text, p_check text, p_expected text, p_actual text)
RETURNS void LANGUAGE sql AS $f$
  INSERT INTO _tag_results(nivel, cargo, check_kind, expected, actual, status)
  VALUES (p_nivel, p_cargo, p_check, p_expected, p_actual,
          CASE WHEN p_expected = p_actual THEN 'ok' ELSE 'FAIL' END);
$f$;

CREATE FUNCTION pg_temp.como(p_sub uuid) RETURNS void LANGUAGE sql AS $f$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
$f$;

-- O SQL equivalente ao que o PostgREST executa para
--   conversations?select=id,contacts!inner(id,etiquetas_filtro:contact_tags!inner(tag_id))
--                 &tenant_id=eq.LOJA&is_archived=eq.false
--                 &contacts.etiquetas_filtro.tag_id=in.(...)
-- Cada tabela passa pelo próprio RLS do chamador.
CREATE FUNCTION pg_temp.lista_com_etiqueta(p_loja uuid, p_tags uuid[]) RETURNS SETOF uuid
LANGUAGE sql AS $f$
  SELECT c.id
    FROM public.conversations c
   WHERE c.tenant_id = p_loja
     AND c.is_archived = false
     AND EXISTS (SELECT 1 FROM public.contacts k
                  WHERE k.id = c.contact_id
                    AND EXISTS (SELECT 1 FROM public.contact_tags ct
                                 WHERE ct.contact_id = k.id
                                   AND ct.tag_id = ANY (p_tags)));
$f$;

-- -----------------------------------------------------------------------------
-- 3. A bateria
-- -----------------------------------------------------------------------------
DO $bateria$
DECLARE
  LOJA   constant uuid := '88888888-0000-4000-8000-000000000002';
  SUPER  constant uuid := '88888888-0000-4000-8000-000000000000';
  GER    constant uuid := '88888888-0000-4000-8000-00000000000a';
  GES    constant uuid := '88888888-0000-4000-8000-00000000000b';
  ANA    constant uuid := '88888888-0000-4000-8000-00000000000c';
  C3     constant uuid := '88888888-dddd-4000-8000-000000000003';
  QUENTE constant uuid := '88888888-eeee-4000-8000-000000000001';
  FRIO   constant uuid := '88888888-eeee-4000-8000-000000000002';
  QUENTE_DA_CONTA constant uuid := '88888888-eeee-4000-8000-000000000009';
  nivel text; cargo record;
  visiveis uuid[]; filtradas uuid[]; n int; exp_frio int; n_tags int;
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

      -- T1. etiqueta que todos têm: mesmo conjunto — o filtro não acrescenta.
      SELECT coalesce(array_agg(x ORDER BY x), '{}') INTO filtradas FROM pg_temp.lista_com_etiqueta(LOJA, ARRAY[QUENTE]) AS x;
      PERFORM pg_temp.afirma(nivel, cargo.nome, 'T1. etiqueta em todos: filtro == lista sem filtro',
                             visiveis::text, filtradas::text);

      -- T2. etiqueta só na conversa do Bruno: entra SÓ se a policy já deixava.
      exp_frio := CASE WHEN C3 = ANY (visiveis) THEN 1 ELSE 0 END;
      SELECT count(*) INTO n FROM pg_temp.lista_com_etiqueta(LOJA, ARRAY[FRIO]);
      PERFORM pg_temp.afirma(nivel, cargo.nome, 'T2. etiqueta só na conversa escondida: entra só se a policy deixa',
                             exp_frio::text, n::text);
      -- ...e o gabarito de produto, para não depender só de "visiveis":
      PERFORM pg_temp.afirma(nivel, cargo.nome, 'T2b. gabarito: atendente restrito 0, gestor/gerente 1, superadmin 0',
                             CASE WHEN cargo.nome IN ('gestor','gerente') THEN '1'
                                  WHEN cargo.nome = 'atendente' AND nivel = 'all' THEN '1'
                                  ELSE '0' END,
                             n::text);

      -- T3. contagem com o mesmo predicado == tamanho da lista filtrada
      --     (é a pílula batendo com a lista).
      PERFORM pg_temp.afirma(nivel, cargo.nome, 'T3. count(mesmo predicado) == lista filtrada',
                             cardinality(filtradas)::text,
                             (SELECT count(*) FROM pg_temp.lista_com_etiqueta(LOJA, ARRAY[QUENTE]))::text);

      -- T4. várias etiquetas = QUALQUER uma (OR): Quente ∪ Frio == Quente (todos).
      SELECT coalesce(array_agg(x ORDER BY x), '{}') INTO filtradas FROM pg_temp.lista_com_etiqueta(LOJA, ARRAY[QUENTE, FRIO]) AS x;
      PERFORM pg_temp.afirma(nivel, cargo.nome, 'T4. duas etiquetas = qualquer uma: união, sem duplicar',
                             visiveis::text, filtradas::text);

      -- T5. etiqueta de OUTRA Conta (mesmo nome) não casa com nada.
      SELECT count(*) INTO n FROM pg_temp.lista_com_etiqueta(LOJA, ARRAY[QUENTE_DA_CONTA]);
      PERFORM pg_temp.afirma(nivel, cargo.nome, 'T5. etiqueta da Conta pai (mesmo nome) não casa com conversa da Loja', '0', n::text);

      -- T6. a lista do modal (tags WHERE tenant_id = Loja) tem só as 2 da Loja,
      --     mesmo para o gerente, que por RLS também lê a da Conta.
      SELECT count(*) INTO n_tags FROM public.tags WHERE tenant_id = LOJA;
      PERFORM pg_temp.afirma(nivel, cargo.nome, 'T6. modal oferece só as etiquetas da Loja aberta', '2', n_tags::text);
      RESET ROLE;
    END LOOP;
  END LOOP;

  RESET ROLE;
  UPDATE public.tenants SET settings = NULL WHERE id = LOJA;
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
FROM _tag_results;

ROLLBACK;
