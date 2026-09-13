-- =============================================================================
-- Teste do responsável por conversa (migração 20260913000001)
-- =============================================================================
-- Prova, contra o banco de verdade e SEM deixar rastro (BEGIN ... ROLLBACK
-- incondicional), as cinco afirmações do passo 1:
--
--   1. REGRESSÃO QUE MAIS DOERIA: um atendente continua ENVIANDO mensagem numa
--      conversa que está com OUTRA pessoa. O INSERT em `messages` passa, os
--      três triggers de `conversations` passam, e o responsável não muda.
--   2. Guarda de concorrência: dois "Assumir" na mesma conversa — o primeiro
--      pega, o segundo atualiza ZERO linhas e a conversa continua com o
--      primeiro. É a semântica do UPDATE ... WHERE assigned_profile_id IS NULL.
--   3. Sino: transferir para alguém grava UMA notificação para o `user_id`
--      dessa pessoa, com o título do nó transfer_agent; assumir para si NÃO
--      grava nada.
--   4. Diretório: um atendente enxerga, via tenant_team_directory(), o gestor e
--      o colega da própria Loja e o gerente da Conta acima — e NÃO enxerga a
--      Loja vizinha nem o superadmin. E só id/nome/sobrenome/avatar saem.
--   5. Visibilidade INALTERADA: o atendente continua lendo TODAS as conversas
--      da Loja, inclusive as que estão com outra pessoa.
--
-- Mesmo esqueleto de docs/teste_isolamento_rls.sql: semeadura com
-- session_replication_role = replica (sem disparar webhook/automação), e as
-- afirmações com = origin, sob SET LOCAL ROLE authenticated + claims JWT.
--
-- COMO RODAR: conexão com papel `postgres` (o MCP read-only não consegue
-- SET ROLE authenticated). Rode DEPOIS da migração 20260913000001. O resultado
-- é o placar do fim: "SUITE VERDE" com 0 falhas.
--
-- UUIDs de fixture usam o prefixo 33333333- para não colidir com os do
-- teste_isolamento_rls.sql (11111111-/22222222-) nem com dado real (há guarda).
-- =============================================================================

BEGIN;

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tenants
              WHERE id IN ('33333333-0000-4000-8000-000000000001',
                           '33333333-0000-4000-8000-000000000002',
                           '33333333-0000-4000-8000-000000000003')) THEN
    RAISE EXCEPTION 'ABORTADO: UUID de fixture colide com tenant real. Nada foi feito.';
  END IF;
  IF to_regprocedure('public.tenant_team_directory(uuid)') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: a migração 20260913000001 ainda não foi aplicada.';
  END IF;
END
$guard$;

-- -----------------------------------------------------------------------------
-- 1. Semeadura (triggers e FK suspensos)
-- -----------------------------------------------------------------------------
SET LOCAL session_replication_role = replica;

INSERT INTO public.tenants (id, name, slug, kind, parent_tenant_id, status, subscription_status) VALUES
  ('33333333-0000-4000-8000-000000000001','FIXTURE Conta R','fixture-conta-r','account', NULL,'active','active'),
  ('33333333-0000-4000-8000-000000000002','FIXTURE Loja R', 'fixture-loja-r', 'store','33333333-0000-4000-8000-000000000001','active',NULL),
  ('33333333-0000-4000-8000-000000000003','FIXTURE Loja S', 'fixture-loja-s', 'store','33333333-0000-4000-8000-000000000001','active',NULL);

-- Perfis: superadmin, gerente da Conta, gestor + 2 atendentes da Loja R, 1 atendente da Loja S.
--   profiles.id termina em f?, auth user_id termina em 0?.
INSERT INTO public.profiles (id, user_id, tenant_id, role, parent_id, status, first_name, last_name) VALUES
  ('33333333-0000-4000-8000-0000000000f0','33333333-0000-4000-8000-000000000000','33333333-0000-4000-8000-000000000001','superadmin', NULL,'active','FIX','Super'),
  ('33333333-0000-4000-8000-0000000000fa','33333333-0000-4000-8000-00000000000a','33333333-0000-4000-8000-000000000001','gerente',    NULL,'active','FIX','Gerente'),
  ('33333333-0000-4000-8000-0000000000fb','33333333-0000-4000-8000-00000000000b','33333333-0000-4000-8000-000000000002','gestor',   '33333333-0000-4000-8000-0000000000fa','active','FIX','Gestor'),
  ('33333333-0000-4000-8000-0000000000fc','33333333-0000-4000-8000-00000000000c','33333333-0000-4000-8000-000000000002','atendente','33333333-0000-4000-8000-0000000000fb','active','FIX','Ana'),
  ('33333333-0000-4000-8000-0000000000fd','33333333-0000-4000-8000-00000000000d','33333333-0000-4000-8000-000000000002','atendente','33333333-0000-4000-8000-0000000000fb','active','FIX','Bruno'),
  ('33333333-0000-4000-8000-0000000000fe','33333333-0000-4000-8000-00000000000e','33333333-0000-4000-8000-000000000003','atendente','33333333-0000-4000-8000-0000000000fa','active','FIX','Vizinho');

INSERT INTO public.whatsapp_instances (id, tenant_id, name, instance_key) VALUES
  ('33333333-aaaa-4000-8000-000000000002','33333333-0000-4000-8000-000000000002','FIX instancia R','fix-key-r');

INSERT INTO public.contacts (id, tenant_id, phone, name) VALUES
  ('33333333-cccc-4000-8000-000000000001','33333333-0000-4000-8000-000000000002','5511900000001','FIX Cliente Um'),
  ('33333333-cccc-4000-8000-000000000002','33333333-0000-4000-8000-000000000002','5511900000002','FIX Cliente Dois');

-- conv1 já está com o Bruno (fd). conv2 está sem responsável.
INSERT INTO public.conversations (id, tenant_id, contact_id, whatsapp_instance_id, assigned_profile_id, assigned_at, assigned_by) VALUES
  ('33333333-dddd-4000-8000-000000000001','33333333-0000-4000-8000-000000000002','33333333-cccc-4000-8000-000000000001','33333333-aaaa-4000-8000-000000000002','33333333-0000-4000-8000-0000000000fd', now(), '33333333-0000-4000-8000-0000000000fd'),
  ('33333333-dddd-4000-8000-000000000002','33333333-0000-4000-8000-000000000002','33333333-cccc-4000-8000-000000000002','33333333-aaaa-4000-8000-000000000002', NULL, NULL, NULL);

SET LOCAL session_replication_role = origin;

CREATE TEMP TABLE _resp_results (
  n serial,
  afirmacao text, esperado text, obtido text, status text
) ON COMMIT DROP;

-- As afirmações rodam como `authenticated`; sem isto o INSERT no placar falha.
GRANT ALL ON _resp_results TO authenticated;
GRANT ALL ON SEQUENCE _resp_results_n_seq TO authenticated;

CREATE FUNCTION pg_temp.afirma(p_afirmacao text, p_esperado text, p_obtido text) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO _resp_results(afirmacao, esperado, obtido, status)
  VALUES (p_afirmacao, p_esperado, p_obtido, CASE WHEN p_esperado = p_obtido THEN 'ok' ELSE 'FAIL' END);
$$;

-- Identidades (auth.users.id)
--   Ana    (atendente, Loja R) : 33333333-0000-4000-8000-00000000000c
--   Bruno  (atendente, Loja R) : 33333333-0000-4000-8000-00000000000d
CREATE FUNCTION pg_temp.como(p_sub uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
                    json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
$$;

-- -----------------------------------------------------------------------------
-- 2. As afirmações. Numa função temporária (SECURITY INVOKER) chamada como
--    `authenticated`, para rodar sob RLS — igual ao teste_isolamento_rls.sql.
-- -----------------------------------------------------------------------------
CREATE FUNCTION pg_temp.suite() RETURNS void LANGUAGE plpgsql AS $t$
DECLARE
  n int;
  v_holder uuid;
  v_txt text;
BEGIN
  PERFORM pg_temp.como('33333333-0000-4000-8000-00000000000c');

  -- 5. Visibilidade inalterada: Ana lê as duas conversas, inclusive a do Bruno.
  SELECT count(*) INTO n FROM public.conversations
   WHERE tenant_id = '33333333-0000-4000-8000-000000000002';
  PERFORM pg_temp.afirma('5. atendente lê TODAS as conversas da Loja (inclusive a de outra pessoa)', '2', n::text);

  -- 1. A REGRESSÃO QUE MAIS DOERIA: Ana envia mensagem na conversa do Bruno.
  INSERT INTO public.messages (tenant_id, whatsapp_instance_id, contact_id, direction, message_type, content, status, is_from_bot)
  VALUES ('33333333-0000-4000-8000-000000000002', '33333333-aaaa-4000-8000-000000000002',
          '33333333-cccc-4000-8000-000000000001', 'outbound', 'text', 'FIX resposta da Ana', 'sent', false);
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.afirma('1a. atendente INSERE mensagem em conversa que está com outra pessoa', '1', n::text);

  SELECT count(*) INTO n FROM public.messages
   WHERE contact_id = '33333333-cccc-4000-8000-000000000001' AND content = 'FIX resposta da Ana';
  PERFORM pg_temp.afirma('1b. a mensagem ficou gravada e legível', '1', n::text);

  -- Os triggers de messages atualizaram a conversa (prévia) SEM mexer no responsável.
  SELECT assigned_profile_id, last_message_content INTO v_holder, v_txt
    FROM public.conversations WHERE id = '33333333-dddd-4000-8000-000000000001';
  PERFORM pg_temp.afirma('1c. a prévia da conversa foi atualizada pelo trigger', 'FIX resposta da Ana', coalesce(v_txt, '<null>'));
  PERFORM pg_temp.afirma('1d. o responsável NÃO mudou ao enviar mensagem', '33333333-0000-4000-8000-0000000000fd', coalesce(v_holder::text, '<null>'));

  -- 2. Concorrência: Ana assume a conv2 (sem responsável) com a guarda.
  UPDATE public.conversations
     SET assigned_profile_id = '33333333-0000-4000-8000-0000000000fc',
         assigned_at = now(),
         assigned_by = '33333333-0000-4000-8000-0000000000fc'
   WHERE id = '33333333-dddd-4000-8000-000000000002'
     AND tenant_id = '33333333-0000-4000-8000-000000000002'
     AND assigned_profile_id IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.afirma('2a. primeiro "Assumir" atualiza 1 linha', '1', n::text);

  -- 3b. Assumir para si NÃO gera notificação.
  SELECT count(*) INTO n FROM public.notifications
   WHERE user_id = '33333333-0000-4000-8000-00000000000c' AND title = 'Conversa transferida';
  PERFORM pg_temp.afirma('3b. assumir para si não grava notificação', '0', n::text);

  -- Agora como Bruno: tenta assumir a mesma conv2 com a mesma guarda.
  PERFORM pg_temp.como('33333333-0000-4000-8000-00000000000d');
  UPDATE public.conversations
     SET assigned_profile_id = '33333333-0000-4000-8000-0000000000fd',
         assigned_at = now(),
         assigned_by = '33333333-0000-4000-8000-0000000000fd'
   WHERE id = '33333333-dddd-4000-8000-000000000002'
     AND tenant_id = '33333333-0000-4000-8000-000000000002'
     AND assigned_profile_id IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.afirma('2b. segundo "Assumir" (outra pessoa) atualiza 0 linhas', '0', n::text);

  SELECT assigned_profile_id INTO v_holder FROM public.conversations WHERE id = '33333333-dddd-4000-8000-000000000002';
  PERFORM pg_temp.afirma('2c. a conversa continua com quem assumiu primeiro (Ana)', '33333333-0000-4000-8000-0000000000fc', coalesce(v_holder::text, '<null>'));

  -- 3a. Transferência: Ana (que está com a conv2) transfere para o Bruno.
  PERFORM pg_temp.como('33333333-0000-4000-8000-00000000000c');
  UPDATE public.conversations
     SET assigned_profile_id = '33333333-0000-4000-8000-0000000000fd',
         assigned_at = now(),
         assigned_by = '33333333-0000-4000-8000-0000000000fc'
   WHERE id = '33333333-dddd-4000-8000-000000000002'
     AND tenant_id = '33333333-0000-4000-8000-000000000002';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.afirma('3a-i. transferir atualiza 1 linha (sem guarda IS NULL)', '1', n::text);

  -- A notificação é lida sob RLS pelo próprio Bruno (notifications_select_own).
  PERFORM pg_temp.como('33333333-0000-4000-8000-00000000000d');
  SELECT count(*) INTO n FROM public.notifications
   WHERE user_id = '33333333-0000-4000-8000-00000000000d'
     AND title = 'Conversa transferida'
     AND action_url = '/dashboard/conversations?contact=33333333-cccc-4000-8000-000000000002'
     AND (metadata ->> 'conversation_id') = '33333333-dddd-4000-8000-000000000002';
  PERFORM pg_temp.afirma('3a-ii. quem recebeu tem UMA notificação "Conversa transferida" com a URL da conversa', '1', n::text);

  -- 4. Diretório, como Ana (atendente).
  PERFORM pg_temp.como('33333333-0000-4000-8000-00000000000c');
  SELECT string_agg(first_name || ' ' || last_name, ', ' ORDER BY last_name) INTO v_txt
    FROM public.tenant_team_directory();
  PERFORM pg_temp.afirma('4a. atendente vê gestor, colegas da Loja e o gerente da Conta — não o vizinho nem o superadmin',
                         'FIX Ana, FIX Bruno, FIX Gerente, FIX Gestor', coalesce(v_txt, '<vazio>'));

  SELECT count(*) INTO n FROM public.tenant_team_directory('33333333-0000-4000-8000-000000000003');
  PERFORM pg_temp.afirma('4b. atendente pedindo a Loja vizinha recebe vazio', '0', n::text);

  -- 4c. Diretório expõe SÓ as quatro colunas (id, first_name, last_name, avatar_url).
  SELECT string_agg(a.attname, ',' ORDER BY a.attnum) INTO v_txt
    FROM pg_proc p
    JOIN pg_type t ON t.oid = p.prorettype
    JOIN pg_attribute a ON a.attrelid = t.typrelid AND a.attnum > 0 AND NOT a.attisdropped
   WHERE p.oid = 'public.tenant_team_directory(uuid)'::regprocedure;
  PERFORM pg_temp.afirma('4c. diretório devolve só id, first_name, last_name, avatar_url', 'id,first_name,last_name,avatar_url', coalesce(v_txt, '<?>'));

  -- 4d. Gerente pedindo a Loja filha recebe o time da Loja (+ ele mesmo, que é gerente da Conta acima).
  PERFORM pg_temp.como('33333333-0000-4000-8000-00000000000a');
  SELECT count(*) INTO n FROM public.tenant_team_directory('33333333-0000-4000-8000-000000000002');
  PERFORM pg_temp.afirma('4d. gerente pedindo a Loja filha recebe gestor + 2 atendentes + ele mesmo', '4', n::text);

  -- 4e. Ainda como atendente, profiles continua fechado (o diretório NÃO abriu a tabela).
  PERFORM pg_temp.como('33333333-0000-4000-8000-00000000000c');
  SELECT count(*) INTO n FROM public.profiles WHERE tenant_id = '33333333-0000-4000-8000-000000000002';
  PERFORM pg_temp.afirma('4e. RLS de profiles inalterado: atendente lê só o próprio perfil', '1', n::text);
END
$t$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.suite();
RESET ROLE;

-- -----------------------------------------------------------------------------
-- 3. Placar
-- -----------------------------------------------------------------------------
SELECT n, status, afirmacao, esperado, obtido FROM _resp_results ORDER BY n;

SELECT count(*) FILTER (WHERE status = 'ok')   AS passou,
       count(*) FILTER (WHERE status = 'FAIL') AS falhou,
       CASE WHEN count(*) FILTER (WHERE status = 'FAIL') = 0
            THEN 'SUITE VERDE' ELSE 'SUITE VERMELHA' END AS placar
  FROM _resp_results;

ROLLBACK;
