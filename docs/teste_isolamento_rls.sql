-- =============================================================================
-- teste_isolamento_rls.sql - rede de seguranca para mexer em RLS.
--
-- O QUE FAZ
--   Semeia DUAS organizacoes falsas (Conta + Loja em cada uma) e 7 perfis
--   cobrindo os quatro cargos, com dados nas tabelas que carregam tenant_id.
--   Depois vira o papel para `authenticated`, troca a identidade pelo
--   request.jwt.claims e afirma, para cada identidade e cada tabela:
--     - ve exatamente as linhas da propria Conta/Loja        (SELECT proprio)
--     - ve ZERO linhas da outra organizacao                  (SELECT alheio)
--     - nao consegue alterar nem apagar linha alheia         (UPDATE/DELETE alheio)
--     - nao consegue inserir linha com tenant_id alheio      (INSERT alheio recusado)
--   Cobre tambem a dimensao de cargo na tabela `tenants`:
--     - Gerente le a propria Conta E a Loja filha
--     - membro de Loja NAO le a Conta pai
--     - superadmin le tudo
--
-- MUDANCA DE 2026-09-09 - o que "correto" passou a significar
--   A migracao 20260909000001 deu ao GERENTE leitura dos dados operacionais das
--   Lojas filhas da Conta dele (policy `gerente_reads_child_store_data`, so
--   SELECT). Antes disso o seletor de Loja do gerente abria a tela VAZIA.
--
--   Isso muda o gabarito de UMA relacao especifica, e so dela. A suite foi
--   ajustada para afirmar o comportamento NOVO, nao para deixar de reclamar:
--     - gerente LE os dados da propria Loja filha        (era 0, agora 2)
--     - gerente continua vendo ZERO de Loja de OUTRA Conta
--     - gestor e atendente seguem presos a propria Loja, inalterados
--     - membro de Loja continua SEM ler a Conta pai - agora afirmado tambem
--       nas tabelas operacionais, nao so em `tenants`
--
-- SEGUNDA MUDANCA, no mesmo dia: a ESCRITA (20260909000004)
--   So a leitura deixava a gerente ABRIR a conversa e nao conseguir responder
--   - e o `handleSendMessage` grava ANTES de chamar o provedor, entao o
--   cliente do outro lado nao recebia nada. A escrita foi liberada em QUATRO
--   tabelas da caixa de entrada: messages, conversations, contacts, tags.
--   Somente INSERT e UPDATE; DELETE nao foi concedido.
--
--   Por isso o check por tabela tem duas caras, e isso e a fronteira:
--     - nas 4 liberadas      -> 'ESCREVE na Loja filha'      (espera 2)
--     - nas outras 2 (e nas  -> 'NAO escreve na Loja filha'  (espera 0)
--       outras 31 do sistema)
--   E, em TODAS elas, 'NAO escreve na Loja de outra Conta' continua esperando
--   zero: o que a mudanca abriu foi a Loja filha, nao a vizinhanca.
--
--   O que impede as duas mudancas de vazarem PARA BAIXO: a Conta pai entrou
--   na lista de `foreign_tenants` de gestor e atendente, entao a suite afirma
--   que um membro de Loja continua sem ler nem escrever na Conta acima dele.
--
-- SEGURANCA - por que da para rodar isto contra producao
--   O script inteiro vive dentro de BEGIN ... ROLLBACK, e o ROLLBACK e
--   incondicional: passando ou falhando, o banco volta exatamente ao que era.
--   Medido em 2026-08-31: nenhum residuo de fixture, e a policy sabotada pelo
--   modo de auto-teste volta sozinha ao texto original.
--
--   A semeadura roda com session_replication_role = replica, para nao disparar
--   os triggers de webhook / automacao / refresh de materialized view. As
--   AFIRMACOES rodam com session_replication_role = origin, entao RLS e FK
--   valem normalmente - senao o teste nao testaria nada.
--
-- COMO RODAR
--   Precisa de uma conexao com papel `postgres`. O MCP read-only nao serve:
--   `supabase_read_only_user` nao consegue SET ROLE authenticated.
--
-- MODO AUTO-TESTE (prova que a suite sabe falhar)
--   Descomente o bloco SABOTAGEM da secao 5. Ele afrouxa as policies de
--   ESCRITA (`gerente_inserts/updates_child_store_data`) em `contacts`,
--   trocando o vinculo de parentesco por "qualquer Loja" - o vazamento que
--   esta entrega poderia ter introduzido: um gerente ESCREVENDO na Loja de
--   OUTRA Conta.
--   Tudo DENTRO da transacao; o ROLLBACK devolve as policies ao texto original.
--   Esperado: fase 1 verde, fase 2 vermelha com falhas so em `contacts`.
--   Medido em 2026-09-09: 228 ok / 0 falhas  ->  224 ok / 4 falhas.
--   (a suite cobre 6 tabelas e faz 228 checks)
--
-- COMO LER O RESULTADO
--   A coluna `placar` resume cada fase. Em caso de falha, `expected` vs `actual`
--   diz se foi vazamento (viu demais) ou bloqueio indevido (viu menos).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Guarda: os UUIDs da fixture nao podem colidir com dado real.
-- -----------------------------------------------------------------------------
DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.tenants
     WHERE id IN ('11111111-0000-4000-8000-000000000001',
                  '11111111-0000-4000-8000-000000000002',
                  '22222222-0000-4000-8000-000000000001',
                  '22222222-0000-4000-8000-000000000002')
  ) THEN
    RAISE EXCEPTION 'ABORTADO: UUID de fixture colide com tenant real. Nada foi feito.';
  END IF;
END
$guard$;

-- -----------------------------------------------------------------------------
-- 1. Semeadura (triggers e FK suspensos)
-- -----------------------------------------------------------------------------
SET LOCAL session_replication_role = replica;

INSERT INTO public.tenants (id, name, slug, kind, parent_tenant_id, status, subscription_status) VALUES
  ('11111111-0000-4000-8000-000000000001','FIXTURE Conta A','fixture-conta-a','account', NULL,'active','active'),
  ('11111111-0000-4000-8000-000000000002','FIXTURE Loja A','fixture-loja-a','store','11111111-0000-4000-8000-000000000001','active',NULL),
  ('22222222-0000-4000-8000-000000000001','FIXTURE Conta B','fixture-conta-b','account', NULL,'active','active'),
  ('22222222-0000-4000-8000-000000000002','FIXTURE Loja B','fixture-loja-b','store','22222222-0000-4000-8000-000000000001','active',NULL);

INSERT INTO public.profiles (id, user_id, tenant_id, role, parent_id, status, first_name) VALUES
  ('99999999-0000-4000-8000-0000000000f0','99999999-0000-4000-8000-000000000000','11111111-0000-4000-8000-000000000001','superadmin', NULL,'active','FIX super'),
  ('11111111-0000-4000-8000-0000000000fa','11111111-0000-4000-8000-00000000000a','11111111-0000-4000-8000-000000000001','gerente',    NULL,'active','FIX A ger'),
  ('11111111-0000-4000-8000-0000000000fb','11111111-0000-4000-8000-00000000000b','11111111-0000-4000-8000-000000000002','gestor','11111111-0000-4000-8000-0000000000fa','active','FIX A ges'),
  ('11111111-0000-4000-8000-0000000000fc','11111111-0000-4000-8000-00000000000c','11111111-0000-4000-8000-000000000002','atendente','11111111-0000-4000-8000-0000000000fb','active','FIX A atd'),
  ('22222222-0000-4000-8000-0000000000fa','22222222-0000-4000-8000-00000000000a','22222222-0000-4000-8000-000000000001','gerente',    NULL,'active','FIX B ger'),
  ('22222222-0000-4000-8000-0000000000fb','22222222-0000-4000-8000-00000000000b','22222222-0000-4000-8000-000000000002','gestor','22222222-0000-4000-8000-0000000000fa','active','FIX B ges'),
  ('22222222-0000-4000-8000-0000000000fc','22222222-0000-4000-8000-00000000000c','22222222-0000-4000-8000-000000000002','atendente','22222222-0000-4000-8000-0000000000fb','active','FIX B atd');

-- Dois registros por tabela em CADA um dos quatro tenants.
INSERT INTO public.contacts (tenant_id, phone, name)
SELECT t.id, '55119' || lpad((row_number() over ())::text, 8, '0'), 'FIX contato'
FROM (SELECT id FROM public.tenants WHERE slug LIKE 'fixture-%') t, generate_series(1,2) g;

INSERT INTO public.conversations (tenant_id, contact_id)
SELECT c.tenant_id, c.id FROM public.contacts c WHERE c.name = 'FIX contato';

-- Uma instancia REAL por tenant. Nao use um id inventado aqui: a semeadura
-- roda com session_replication_role = replica e nao checa FK, mas qualquer
-- UPDATE posterior em `messages` revalida `messages_whatsapp_instance_id_fkey`
-- e estoura 23503. Isso ficou escondido enquanto o RLS filtrava as linhas para
-- zero (UPDATE sem linha nao checa FK); apareceu em 2026-09-09, quando o
-- gerente ganhou escrita e o UPDATE passou a alcancar a linha de verdade.
INSERT INTO public.whatsapp_instances (id, tenant_id, name, instance_key)
SELECT ('aaaaaaaa-0000-4000-8000-00000000000' || row_number() over (ORDER BY t.id))::uuid,
       t.id, 'FIX instancia', 'fix-key-' || t.id
FROM (SELECT id FROM public.tenants WHERE slug LIKE 'fixture-%') t;

INSERT INTO public.messages (tenant_id, whatsapp_instance_id, contact_id, direction, message_type, content)
SELECT c.tenant_id, i.id, c.id, 'inbound', 'text', 'FIX msg'
FROM public.contacts c
JOIN public.whatsapp_instances i ON i.tenant_id = c.tenant_id AND i.name = 'FIX instancia'
WHERE c.name = 'FIX contato';

INSERT INTO public.quick_replies (tenant_id, name, content)   -- unique (tenant_id, name)
SELECT t.id, 'FIX qr ' || g, 'x'
FROM (SELECT id FROM public.tenants WHERE slug LIKE 'fixture-%') t, generate_series(1,2) g;

INSERT INTO public.lead_tracking (tenant_id)
SELECT t.id FROM (SELECT id FROM public.tenants WHERE slug LIKE 'fixture-%') t, generate_series(1,2) g;

INSERT INTO public.tags (tenant_id, name)
SELECT t.id, 'FIX tag ' || g
FROM (SELECT id FROM public.tenants WHERE slug LIKE 'fixture-%') t, generate_series(1,2) g;

SET LOCAL session_replication_role = origin;

-- -----------------------------------------------------------------------------
-- 2. Matriz de casos
--     own_tenants     = tenants cujas linhas a identidade DEVE ver
--     foreign_tenants = tenants cujas linhas ela NAO PODE ver (sempre 0)
--   Excecao: superadmin ve tudo em contacts/messages/quick_replies, porque essas
--   tres tem policy is_super_admin*. `conversations` e `lead_tracking` NAO tem -
--   isso e deliberado (privacidade de atendimento), nao um buraco a tapar.
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _rls_cases (
  scenario text, jwt_sub uuid, tbl text, own_tenants uuid[], foreign_tenants uuid[]
) ON COMMIT DROP;

CREATE TEMP TABLE _rls_results (
  seq serial, phase text, scenario text, tbl text, check_kind text,
  expected int, actual int, status text
) ON COMMIT DROP;

GRANT ALL ON _rls_cases, _rls_results TO authenticated;
GRANT ALL ON SEQUENCE _rls_results_seq_seq TO authenticated;

-- own_tenants / foreign_tenants agora vem prontos como ARRAY na propria matriz,
-- porque o GERENTE deixou de ter um unico tenant proprio: desde 20260909000001
-- ele responde pela Conta E pelas Lojas filhas dela.
--
-- Repare no que entrou em `foreign_tenants` de gestor e atendente: a CONTA PAI
-- da propria organizacao. Nao e detalhe - e a afirmacao de que a leitura nova
-- so desce do gerente para a Loja, e nunca sobe da Loja para a Conta.
INSERT INTO _rls_cases
SELECT i.scenario, i.jwt_sub, t.tbl,
       CASE WHEN i.scenario='superadmin' AND t.tbl IN ('contacts','messages','quick_replies','tags')
            THEN ARRAY['11111111-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000002',
                       '22222222-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000002']::uuid[]
            ELSE i.own_tenants END,
       CASE WHEN i.scenario='superadmin' AND t.tbl IN ('contacts','messages','quick_replies','tags')
            THEN ARRAY[]::uuid[] ELSE i.foreign_tenants END
FROM (VALUES
  -- cenario        jwt_sub                                        own_tenants (ve)                                     foreign_tenants (NAO ve)
  ('superadmin', '99999999-0000-4000-8000-000000000000'::uuid, ARRAY['11111111-0000-4000-8000-000000000001']::uuid[],                                        ARRAY['22222222-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000002']::uuid[]),
  -- Gerente: Conta + Loja filha. A Loja filha e a mudanca de 2026-09-09.
  ('A gerente',  '11111111-0000-4000-8000-00000000000a'::uuid, ARRAY['11111111-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000002']::uuid[], ARRAY['22222222-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000002']::uuid[]),
  -- Gestor/atendente: SO a propria Loja. A Conta pai e alheia.
  ('A gestor',   '11111111-0000-4000-8000-00000000000b'::uuid, ARRAY['11111111-0000-4000-8000-000000000002']::uuid[],                                        ARRAY['11111111-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000002']::uuid[]),
  ('A atendente','11111111-0000-4000-8000-00000000000c'::uuid, ARRAY['11111111-0000-4000-8000-000000000002']::uuid[],                                        ARRAY['11111111-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000002']::uuid[]),
  ('B gerente',  '22222222-0000-4000-8000-00000000000a'::uuid, ARRAY['22222222-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000002']::uuid[], ARRAY['11111111-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000002']::uuid[]),
  ('B gestor',   '22222222-0000-4000-8000-00000000000b'::uuid, ARRAY['22222222-0000-4000-8000-000000000002']::uuid[],                                        ARRAY['22222222-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000002']::uuid[]),
  ('B atendente','22222222-0000-4000-8000-00000000000c'::uuid, ARRAY['22222222-0000-4000-8000-000000000002']::uuid[],                                        ARRAY['22222222-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000002']::uuid[])
) AS i(scenario, jwt_sub, own_tenants, foreign_tenants)
CROSS JOIN (VALUES ('contacts'),('conversations'),('messages'),('quick_replies'),('lead_tracking'),('tags')) AS t(tbl);

-- -----------------------------------------------------------------------------
-- 3. A bateria, como funcao, para poder rodar mais de uma vez (fase intacta e
--    fase sabotada). SECURITY INVOKER: chamada por `authenticated`, roda sob RLS.
-- -----------------------------------------------------------------------------
CREATE FUNCTION pg_temp.chk(p_phase text) RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE c record; n_own int; n_foreign int; n_written int; ins_ok boolean;
BEGIN
  FOR c IN SELECT * FROM _rls_cases ORDER BY scenario, tbl LOOP
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', c.jwt_sub, 'role','authenticated')::text, true);

    EXECUTE format('SELECT count(*) FROM public.%I WHERE tenant_id = ANY($1)', c.tbl)
      INTO n_own USING c.own_tenants;
    INSERT INTO _rls_results(phase,scenario,tbl,check_kind,expected,actual,status)
    VALUES (p_phase,c.scenario,c.tbl,'SELECT proprio',2*array_length(c.own_tenants,1),n_own,
            CASE WHEN n_own = 2*array_length(c.own_tenants,1) THEN 'ok' ELSE 'FAIL' END);

    IF coalesce(array_length(c.foreign_tenants,1),0) > 0 THEN
      EXECUTE format('SELECT count(*) FROM public.%I WHERE tenant_id = ANY($1)', c.tbl)
        INTO n_foreign USING c.foreign_tenants;
      INSERT INTO _rls_results(phase,scenario,tbl,check_kind,expected,actual,status)
      VALUES (p_phase,c.scenario,c.tbl,'SELECT alheio',0,n_foreign,
              CASE WHEN n_foreign = 0 THEN 'ok' ELSE 'FAIL' END);

      -- Um erro aqui (FK, por ex.) so acontece se a linha alheia foi ALCANCADA:
      -- ou seja, ja e falha de isolamento. Por isso vira 999, nao excecao.
      BEGIN
        EXECUTE format('WITH u AS (UPDATE public.%I SET tenant_id=tenant_id WHERE tenant_id = ANY($1) RETURNING 1) SELECT count(*) FROM u', c.tbl)
          INTO n_written USING c.foreign_tenants;
      EXCEPTION WHEN others THEN n_written := 999;
      END;
      INSERT INTO _rls_results(phase,scenario,tbl,check_kind,expected,actual,status)
      VALUES (p_phase,c.scenario,c.tbl,'UPDATE alheio',0,n_written,
              CASE WHEN n_written = 0 THEN 'ok' ELSE 'FAIL' END);

      BEGIN
        EXECUTE format('WITH d AS (DELETE FROM public.%I WHERE tenant_id = ANY($1) RETURNING 1) SELECT count(*) FROM d', c.tbl)
          INTO n_written USING c.foreign_tenants;
      EXCEPTION WHEN others THEN n_written := 999;
      END;
      INSERT INTO _rls_results(phase,scenario,tbl,check_kind,expected,actual,status)
      VALUES (p_phase,c.scenario,c.tbl,'DELETE alheio',0,n_written,
              CASE WHEN n_written = 0 THEN 'ok' ELSE 'FAIL' END);
    END IF;

    -- INSERT so nas tabelas sem FK obrigatoria complicada.
    IF c.tbl IN ('contacts','quick_replies','lead_tracking','tags')
       AND coalesce(array_length(c.foreign_tenants,1),0) > 0 THEN
      ins_ok := false;
      BEGIN
        CASE c.tbl
          WHEN 'contacts'      THEN INSERT INTO public.contacts (tenant_id,phone,name) VALUES (c.foreign_tenants[1],'5511'||floor(random()*1e9)::text,'FIX invasor');
          WHEN 'quick_replies' THEN INSERT INTO public.quick_replies (tenant_id,name,content) VALUES (c.foreign_tenants[1],'FIX inv '||p_phase||' '||c.scenario,'x');
          WHEN 'lead_tracking' THEN INSERT INTO public.lead_tracking (tenant_id) VALUES (c.foreign_tenants[1]);
          WHEN 'tags'          THEN INSERT INTO public.tags (tenant_id,name) VALUES (c.foreign_tenants[1],'FIX inv '||p_phase||' '||c.scenario);
        END CASE;
        ins_ok := true;   -- entrou = vazamento de escrita
      EXCEPTION WHEN insufficient_privilege OR check_violation THEN
        ins_ok := false;  -- recusado = correto
      END;
      INSERT INTO _rls_results(phase,scenario,tbl,check_kind,expected,actual,status)
      VALUES (p_phase,c.scenario,c.tbl,'INSERT alheio recusado',0,CASE WHEN ins_ok THEN 1 ELSE 0 END,
              CASE WHEN ins_ok THEN 'FAIL' ELSE 'ok' END);
    END IF;
  END LOOP;

  -- ---------------------------------------------------------------------------
  -- Dimensao de cargo, na tabela `tenants`
  -- ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', '{"sub":"11111111-0000-4000-8000-00000000000a","role":"authenticated"}', true);
  SELECT count(*) INTO n_own FROM public.tenants
   WHERE id = ANY(ARRAY['11111111-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000002']::uuid[]);
  INSERT INTO _rls_results(phase,scenario,tbl,check_kind,expected,actual,status)
  VALUES (p_phase,'A gerente','tenants','le a Conta + a Loja filha',2,n_own, CASE WHEN n_own=2 THEN 'ok' ELSE 'FAIL' END);

  SELECT count(*) INTO n_foreign FROM public.tenants
   WHERE id = ANY(ARRAY['22222222-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000002']::uuid[]);
  INSERT INTO _rls_results(phase,scenario,tbl,check_kind,expected,actual,status)
  VALUES (p_phase,'A gerente','tenants','nao le Conta/Loja de B',0,n_foreign, CASE WHEN n_foreign=0 THEN 'ok' ELSE 'FAIL' END);

  PERFORM set_config('request.jwt.claims', '{"sub":"11111111-0000-4000-8000-00000000000b","role":"authenticated"}', true);
  SELECT count(*) INTO n_foreign FROM public.tenants WHERE id = '11111111-0000-4000-8000-000000000001';
  INSERT INTO _rls_results(phase,scenario,tbl,check_kind,expected,actual,status)
  VALUES (p_phase,'A gestor','tenants','NAO le a Conta pai',0,n_foreign, CASE WHEN n_foreign=0 THEN 'ok' ELSE 'FAIL' END);

  SELECT count(*) INTO n_own FROM public.tenants WHERE id = '11111111-0000-4000-8000-000000000002';
  INSERT INTO _rls_results(phase,scenario,tbl,check_kind,expected,actual,status)
  VALUES (p_phase,'A gestor','tenants','le a propria Loja',1,n_own, CASE WHEN n_own=1 THEN 'ok' ELSE 'FAIL' END);

  PERFORM set_config('request.jwt.claims', '{"sub":"99999999-0000-4000-8000-000000000000","role":"authenticated"}', true);
  SELECT count(*) INTO n_own FROM public.tenants WHERE slug LIKE 'fixture-%';
  INSERT INTO _rls_results(phase,scenario,tbl,check_kind,expected,actual,status)
  VALUES (p_phase,'superadmin','tenants','le todos os tenants',4,n_own, CASE WHEN n_own=4 THEN 'ok' ELSE 'FAIL' END);

  PERFORM set_config('request.jwt.claims', '{"sub":"11111111-0000-4000-8000-00000000000b","role":"authenticated"}', true);
  SELECT count(*) INTO n_foreign FROM public.profiles
   WHERE tenant_id = ANY(ARRAY['22222222-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000002']::uuid[]);
  INSERT INTO _rls_results(phase,scenario,tbl,check_kind,expected,actual,status)
  VALUES (p_phase,'A gestor','profiles','nao le perfis de B',0,n_foreign, CASE WHEN n_foreign=0 THEN 'ok' ELSE 'FAIL' END);

  -- ---------------------------------------------------------------------------
  -- Dimensao NOVA (2026-09-09): Gerente x Loja filha, tabela por tabela.
  --
  -- A matriz acima ja cobre isto pelos totais, mas totais nao dizem QUAL lado
  -- quebrou. Estes quatro checks nomeados por tabela existem para que a saida
  -- de uma falha aponte direto para a afirmacao violada.
  -- ---------------------------------------------------------------------------
  FOR c IN SELECT unnest(ARRAY['contacts','conversations','messages',
                               'quick_replies','lead_tracking','tags']) AS tbl LOOP

    -- (1) O gerente LE a Loja filha. Este e o comportamento novo.
    PERFORM set_config('request.jwt.claims',
      '{"sub":"11111111-0000-4000-8000-00000000000a","role":"authenticated"}', true);
    EXECUTE format('SELECT count(*) FROM public.%I WHERE tenant_id = $1', c.tbl)
      INTO n_own USING '11111111-0000-4000-8000-000000000002'::uuid;
    INSERT INTO _rls_results(phase,scenario,tbl,check_kind,expected,actual,status)
    VALUES (p_phase,'A gerente',c.tbl,'LE a Loja filha',2,n_own,
            CASE WHEN n_own = 2 THEN 'ok' ELSE 'FAIL' END);

    -- (2) ...e SO a dele. Loja de outra Conta continua invisivel.
    EXECUTE format('SELECT count(*) FROM public.%I WHERE tenant_id = $1', c.tbl)
      INTO n_foreign USING '22222222-0000-4000-8000-000000000002'::uuid;
    INSERT INTO _rls_results(phase,scenario,tbl,check_kind,expected,actual,status)
    VALUES (p_phase,'A gerente',c.tbl,'NAO le Loja de outra Conta',0,n_foreign,
            CASE WHEN n_foreign = 0 THEN 'ok' ELSE 'FAIL' END);

    -- (3) ESCRITA na Loja filha. Desde 20260909000004 o gerente escreve em
    --     QUATRO tabelas da caixa de entrada (messages, conversations,
    --     contacts, tags) e continua SEM escrever nas outras 31. As duas
    --     expectativas convivem aqui de proposito: e a fronteira exata.
    BEGIN
      EXECUTE format('WITH u AS (UPDATE public.%I SET tenant_id=tenant_id WHERE tenant_id=$1 RETURNING 1) SELECT count(*) FROM u', c.tbl)
        INTO n_written USING '11111111-0000-4000-8000-000000000002'::uuid;
    EXCEPTION WHEN others THEN n_written := 999;
    END;
    IF c.tbl IN ('messages','conversations','contacts','tags') THEN
      INSERT INTO _rls_results(phase,scenario,tbl,check_kind,expected,actual,status)
      VALUES (p_phase,'A gerente',c.tbl,'ESCREVE na Loja filha',2,n_written,
              CASE WHEN n_written = 2 THEN 'ok' ELSE 'FAIL' END);
    ELSE
      INSERT INTO _rls_results(phase,scenario,tbl,check_kind,expected,actual,status)
      VALUES (p_phase,'A gerente',c.tbl,'NAO escreve na Loja filha',0,n_written,
              CASE WHEN n_written = 0 THEN 'ok' ELSE 'FAIL' END);
    END IF;

    -- (3b) ...e a escrita para NA FRONTEIRA DA CONTA. Vale para as 6 tabelas:
    --      nas 4 liberadas prova que o vinculo de parentesco esta na policy;
    --      nas outras 2 prova que continuam fechadas dos dois lados.
    BEGIN
      EXECUTE format('WITH u AS (UPDATE public.%I SET tenant_id=tenant_id WHERE tenant_id=$1 RETURNING 1) SELECT count(*) FROM u', c.tbl)
        INTO n_written USING '22222222-0000-4000-8000-000000000002'::uuid;
    EXCEPTION WHEN others THEN n_written := 999;
    END;
    INSERT INTO _rls_results(phase,scenario,tbl,check_kind,expected,actual,status)
    VALUES (p_phase,'A gerente',c.tbl,'NAO escreve na Loja de outra Conta',0,n_written,
            CASE WHEN n_written = 0 THEN 'ok' ELSE 'FAIL' END);

    -- (3c) O WITH CHECK do INSERT, nas duas tabelas sem FK complicada.
    --      Aceita na Loja filha, recusa na Loja alheia.
    IF c.tbl IN ('contacts','tags') THEN
      ins_ok := false;
      BEGIN
        IF c.tbl = 'contacts' THEN
          INSERT INTO public.contacts (tenant_id,phone,name)
          VALUES ('11111111-0000-4000-8000-000000000002','5511'||floor(random()*1e9)::text,'FIX invasor');
        ELSE
          INSERT INTO public.tags (tenant_id,name)
          VALUES ('11111111-0000-4000-8000-000000000002','FIX invasor '||p_phase);
        END IF;
        ins_ok := true;
      EXCEPTION WHEN others THEN ins_ok := false;
      END;
      INSERT INTO _rls_results(phase,scenario,tbl,check_kind,expected,actual,status)
      VALUES (p_phase,'A gerente',c.tbl,'INSERT na Loja filha aceito',1,CASE WHEN ins_ok THEN 1 ELSE 0 END,
              CASE WHEN ins_ok THEN 'ok' ELSE 'FAIL' END);

      ins_ok := false;
      BEGIN
        IF c.tbl = 'contacts' THEN
          INSERT INTO public.contacts (tenant_id,phone,name)
          VALUES ('22222222-0000-4000-8000-000000000002','5511'||floor(random()*1e9)::text,'FIX invasor');
        ELSE
          INSERT INTO public.tags (tenant_id,name)
          VALUES ('22222222-0000-4000-8000-000000000002','FIX invasor B '||p_phase);
        END IF;
        ins_ok := true;   -- entrou = vazamento
      EXCEPTION WHEN others THEN ins_ok := false;
      END;
      INSERT INTO _rls_results(phase,scenario,tbl,check_kind,expected,actual,status)
      VALUES (p_phase,'A gerente',c.tbl,'INSERT em Loja de outra Conta recusado',0,CASE WHEN ins_ok THEN 1 ELSE 0 END,
              CASE WHEN ins_ok THEN 'FAIL' ELSE 'ok' END);
    END IF;

    -- (4) A porta abriu so para baixo: a Loja continua sem ler a Conta pai.
    PERFORM set_config('request.jwt.claims',
      '{"sub":"11111111-0000-4000-8000-00000000000b","role":"authenticated"}', true);
    EXECUTE format('SELECT count(*) FROM public.%I WHERE tenant_id = $1', c.tbl)
      INTO n_foreign USING '11111111-0000-4000-8000-000000000001'::uuid;
    INSERT INTO _rls_results(phase,scenario,tbl,check_kind,expected,actual,status)
    VALUES (p_phase,'A gestor',c.tbl,'NAO le a Conta pai',0,n_foreign,
            CASE WHEN n_foreign = 0 THEN 'ok' ELSE 'FAIL' END);
  END LOOP;

  -- Trava anti-lockout: mexer em users_own_profile tranca todo mundo para fora,
  -- inclusive quem aplicou. Cada identidade TEM de continuar lendo o proprio perfil.
  FOR c IN SELECT DISTINCT scenario, jwt_sub FROM _rls_cases LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub',c.jwt_sub,'role','authenticated')::text, true);
    SELECT count(*) INTO n_own FROM public.profiles WHERE user_id = c.jwt_sub;
    INSERT INTO _rls_results(phase,scenario,tbl,check_kind,expected,actual,status)
    VALUES (p_phase,c.scenario,'profiles','le o PROPRIO perfil',1,n_own, CASE WHEN n_own=1 THEN 'ok' ELSE 'FAIL' END);
  END LOOP;
END
$fn$;
GRANT EXECUTE ON FUNCTION pg_temp.chk(text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. Fase 1 - as policies como estao hoje
-- -----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('1-intacto');
RESET ROLE;
DELETE FROM public.contacts WHERE name = 'FIX invasor';
DELETE FROM public.tags WHERE name LIKE 'FIX invasor%';

-- -----------------------------------------------------------------------------
-- 5. SABOTAGEM (descomente para provar que a suite sabe falhar)
--    Desfeita pelo ROLLBACK junto com todo o resto.
--
--    O alvo e `contacts`, nas TRES policies (leitura, INSERT e UPDATE). Elas
--    compartilham o mesmo helper `gerente_child_store_ids()`, entao um bug
--    nele atinge as tres de uma vez - e por isso a sabotagem fiel troca as
--    tres, e nao so a escrita. O erro simulado: esquecer o vinculo de
--    parentesco e aceitar "qualquer Loja".
--
--    UM DETALHE QUE MEDIMOS E VALE SABER (2026-09-09): sabotar SO a escrita
--    quase nao aparece. Um UPDATE com WHERE precisa enxergar a linha, entao a
--    policy de LEITURA tambem tem de liberar - com a leitura intacta, o
--    'UPDATE alheio' continua devolvendo 0 e o vazamento so escapa pelo
--    INSERT, que nao le nada. Ou seja: a leitura funciona como segunda tranca
--    da escrita. Bom para a seguranca, traicoeiro para quem testa.
--
--    Esperado: falhas SO em `contacts`, na leitura e na escrita alheia.
--    Medido em 2026-09-09: 228 ok / 0 falhas -> 221 ok / 7 falhas.
--
--    Repare no que a sabotagem NAO derruba: 'INSERT alheio recusado' da matriz
--    continua verde, porque ela tenta gravar na CONTA B (um account) e o
--    helper sabotado so devolve `kind='store'`. E 'DELETE alheio' segue verde
--    porque DELETE nunca foi concedido. Um unico check nunca cobre um
--    vazamento inteiro - por isso os nomeados existem.
--
--    CUIDADO AO INVENTAR OUTRA SABOTAGEM - falso negativo medido em 2026-09-09.
--    A primeira tentativa foi trocar o USING por
--        tenant_id IN (SELECT id FROM public.tenants WHERE kind = 'store')
--    e ela NAO vazou nada: a suite deu 218 ok / 0 falhas. O motivo e que essa
--    subconsulta roda como o USUARIO, sob o RLS de `tenants`, e o RLS de
--    `tenants` ja limita o gerente as Lojas filhas dele. A "sabotagem"
--    reproduzia o comportamento correto.
--    Licao: para sabotar de verdade e preciso furar o RLS - por isso a
--    funcao abaixo e SECURITY DEFINER. Uma sabotagem que passa nao prova que a
--    policy esta certa; pode so estar mal construida.
-- -----------------------------------------------------------------------------
-- CREATE FUNCTION public.__sabotage_todas_as_lojas() RETURNS SETOF uuid
-- LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $sab$
--   SELECT t.id FROM public.tenants t WHERE t.kind = 'store' AND public.is_gerente_safe();
-- $sab$;
-- GRANT EXECUTE ON FUNCTION public.__sabotage_todas_as_lojas() TO authenticated;
-- ALTER POLICY gerente_reads_child_store_data ON public.contacts
--   USING (tenant_id IN (SELECT public.__sabotage_todas_as_lojas()));
-- ALTER POLICY gerente_updates_child_store_data ON public.contacts
--   USING (tenant_id IN (SELECT public.__sabotage_todas_as_lojas()))
--   WITH CHECK (tenant_id IN (SELECT public.__sabotage_todas_as_lojas()));
-- ALTER POLICY gerente_inserts_child_store_data ON public.contacts
--   WITH CHECK (tenant_id IN (SELECT public.__sabotage_todas_as_lojas()));
-- SET LOCAL ROLE authenticated;
-- SELECT pg_temp.chk('2-sabotado');
-- RESET ROLE;

-- -----------------------------------------------------------------------------
-- 6. Placar
-- -----------------------------------------------------------------------------
SELECT phase,
       count(*) FILTER (WHERE status='ok')   AS passou,
       count(*) FILTER (WHERE status='FAIL') AS falhou,
       CASE WHEN count(*) FILTER (WHERE status='FAIL') = 0
            THEN 'SUITE VERDE' ELSE 'SUITE VERMELHA' END AS placar,
       coalesce(string_agg(DISTINCT tbl || ' / ' || check_kind, '; ')
                FILTER (WHERE status='FAIL'), '-') AS falhas
FROM _rls_results GROUP BY phase ORDER BY phase;

ROLLBACK;
