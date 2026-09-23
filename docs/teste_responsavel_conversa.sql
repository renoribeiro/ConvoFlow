-- =============================================================================
-- Teste do responsável por conversa (migração 20260913000001)
-- =============================================================================
-- Prova, contra o banco de verdade e SEM deixar rastro, as cinco afirmações
-- do passo 1:
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
-- PARAMETRIZADO PELO NÍVEL DE VISIBILIDADE (passo 2, migração 20260914000001)
--   As cinco afirmações rodam DUAS vezes, com `tenants.settings.atendente_visibility`
--   da Loja R em 'all' e em 'own'. Só a afirmação 5 muda de gabarito:
--     - 'all' → a Ana lê as 2 conversas (o comportamento de sempre, e o padrão
--               quando nada foi gravado);
--     - 'own' → a Ana lê 0 antes de responder (a conv1 é do Bruno e a conv2 não
--               tem dono — 'own' esconde as duas).
--   1a–1d valem IGUAIS nos dois níveis: escrever continua livre (os triggers de
--   escrituração são SECURITY DEFINER) e quem responde vira PARTICIPANTE — por
--   isso, em 'own', a Ana passa a ler a conv1 logo depois de responder (5b).
--   O único acréscimo de fluxo é "2-pre": a Ana responde na conv2 ANTES de
--   assumi-la. Em 'own' isso é o que a torna visível (e assumível); em 'all'
--   não muda nenhum gabarito. Entre as duas fases a fixture volta ao estado
--   semeado (mensagens, participação, notificações e responsáveis).
--
-- COMO FUNCIONA — e por que TERMINA EM ERRO DE PROPÓSITO
--   Tudo vive dentro de UM bloco DO. No SQL Editor do Supabase, BEGIN/ROLLBACK
--   não garante nada e tabela temporária não sobrevive entre comandos
--   (CLAUDE.md, armadilha 4). Um bloco DO é um comando só: quando ele termina
--   com RAISE EXCEPTION, o PostgreSQL desfaz TUDO que o bloco fez — fixtures,
--   mensagem, notificação. O placar vem no texto da exceção.
--
--   Ou seja: o resultado esperado é um ERRO (em vermelho) cujo texto começa
--   com "SUITE VERDE". Se começar com "SUITE VERMELHA", leia as linhas FAIL.
--   Em qualquer dos dois casos nada ficou gravado.
--
-- COMO RODAR: SQL Editor do Supabase (papel postgres), DEPOIS das migrações
-- 20260913000001 e 20260914000001. Cole o arquivo inteiro e rode.
--
-- UUIDs de fixture usam o prefixo 33333333- para não colidir com os do
-- teste_isolamento_rls.sql (11111111-/22222222-) nem com dado real (há guarda).
-- =============================================================================

DO $suite$
DECLARE
  n         int;
  v_holder  uuid;
  v_txt     text;
  v_placar  text;
  v_linhas  text;
  n_ok      int;
  n_fail    int;
  nivel     text;
  tag       text;
BEGIN
  -- ---------------------------------------------------------------------------
  -- 0. Guardas
  -- ---------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM public.tenants
              WHERE id IN ('33333333-0000-4000-8000-000000000001',
                           '33333333-0000-4000-8000-000000000002',
                           '33333333-0000-4000-8000-000000000003')) THEN
    RAISE EXCEPTION 'ABORTADO: UUID de fixture colide com tenant real. Nada foi feito.';
  END IF;
  IF to_regprocedure('public.tenant_team_directory(uuid)') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: a migração 20260913000001 ainda não foi aplicada.';
  END IF;
  IF to_regprocedure('public.conversation_visibility_level()') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: a migração 20260914000001 ainda não foi aplicada.';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users
              WHERE id IN ('33333333-0000-4000-8000-00000000000c',
                           '33333333-0000-4000-8000-00000000000d')) THEN
    RAISE EXCEPTION 'ABORTADO: UUID de fixture colide com usuário real do Auth. Nada foi feito.';
  END IF;

  -- Placar e ajudantes (temporários; somem com o rollback do fim).
  -- A coluna chama-se `seq`, não `n`: `n` é variável deste bloco e o plpgsql
  -- recusaria a ambiguidade no SELECT do placar.
  CREATE TEMP TABLE _resp_results (
    seq serial, afirmacao text, esperado text, obtido text, status text
  );
  GRANT ALL ON _resp_results TO authenticated;
  GRANT ALL ON SEQUENCE _resp_results_seq_seq TO authenticated;

  CREATE FUNCTION pg_temp.afirma(p_afirmacao text, p_esperado text, p_obtido text) RETURNS void
  LANGUAGE sql AS $f$
    INSERT INTO _resp_results(afirmacao, esperado, obtido, status)
    VALUES (p_afirmacao, p_esperado, p_obtido, CASE WHEN p_esperado = p_obtido THEN 'ok' ELSE 'FAIL' END);
  $f$;

  -- Troca de identidade (auth.users.id) — vale até o fim da transação.
  CREATE FUNCTION pg_temp.como(p_sub uuid) RETURNS void LANGUAGE sql AS $f$
    SELECT set_config('request.jwt.claims',
                      json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  $f$;

  -- ---------------------------------------------------------------------------
  -- 1. Semeadura (triggers e FK suspensos)
  -- ---------------------------------------------------------------------------
  -- Fatia 1 do Instagram (20260922000002): contacts.external_id virou NOT NULL e
  -- quem preenche é a trigger trg_contacts_set_external_id. Sob
  -- session_replication_role = replica ela NÃO dispara, e a semeadura morria com
  -- 23502. ENABLE ALWAYS liga SÓ essa trigger, SÓ dentro desta transação (o
  -- 23502. ENABLE ALWAYS liga SÓ essa trigger; o RAISE do fim desfaz.
  ALTER TABLE public.contacts ENABLE ALWAYS TRIGGER trg_contacts_set_external_id;
  SET LOCAL session_replication_role = replica;

  -- Ana e Bruno precisam existir no Auth: `notifications.user_id` tem FK para
  -- auth.users e o trigger do sino roda com as FKs LIGADAS (replica só vale
  -- para a semeadura). Medido em 2026-09-13: sem estas duas linhas a afirmação
  -- 3a-ii falhava com "obtido: 0" — o trigger recusava a FK, avisava e seguia.
  -- Em replica o trigger on_auth_user_created não dispara, então não nasce
  -- perfil duplicado. Some tudo no rollback do fim.
  INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
    ('33333333-0000-4000-8000-00000000000c','authenticated','authenticated','fix-ana@fixture.invalid',   now(), now()),
    ('33333333-0000-4000-8000-00000000000d','authenticated','authenticated','fix-bruno@fixture.invalid', now(), now());

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

  -- ---------------------------------------------------------------------------
  -- 2. As afirmações, sob RLS (papel authenticated + claims JWT), em cada nível
  -- ---------------------------------------------------------------------------
  FOREACH nivel IN ARRAY ARRAY['all', 'own'] LOOP
  tag := '[' || nivel || '] ';

  -- Fixture de volta ao estado semeado (como postgres) e o nível da Loja R.
  RESET ROLE;
  DELETE FROM public.messages WHERE content = 'FIX resposta da Ana' OR content = 'FIX pre-assumir da Ana';
  DELETE FROM public.conversation_participants WHERE conversation_id::text LIKE '33333333-dddd-%';
  DELETE FROM public.notifications WHERE user_id::text LIKE '33333333-0000-4000-8000-%';
  UPDATE public.conversations
     SET assigned_profile_id = '33333333-0000-4000-8000-0000000000fd', assigned_by = '33333333-0000-4000-8000-0000000000fd',
         assigned_at = now(), last_message_content = NULL, last_message_direction = NULL
   WHERE id = '33333333-dddd-4000-8000-000000000001';
  UPDATE public.conversations
     SET assigned_profile_id = NULL, assigned_by = NULL, assigned_at = NULL,
         last_message_content = NULL, last_message_direction = NULL
   WHERE id = '33333333-dddd-4000-8000-000000000002';
  DELETE FROM public.notifications WHERE user_id::text LIKE '33333333-0000-4000-8000-%';
  UPDATE public.tenants SET settings = jsonb_build_object('atendente_visibility', nivel)
   WHERE id = '33333333-0000-4000-8000-000000000002';

  SET LOCAL ROLE authenticated;

  -- Ana (atendente, Loja R), que NÃO é a responsável pela conv1.
  PERFORM pg_temp.como('33333333-0000-4000-8000-00000000000c');

  -- 5. Visibilidade: em 'all' a Ana lê as duas conversas, inclusive a do Bruno
  --    (= antes do passo 2). Em 'own' ela não lê nenhuma antes de responder.
  SELECT count(*) INTO n FROM public.conversations
   WHERE tenant_id = '33333333-0000-4000-8000-000000000002';
  PERFORM pg_temp.afirma(tag || '5. atendente lê as conversas da Loja que o nível permite',
                         CASE nivel WHEN 'all' THEN '2' ELSE '0' END, n::text);

  -- 1. A REGRESSÃO QUE MAIS DOERIA: Ana envia mensagem na conversa do Bruno.
  INSERT INTO public.messages (tenant_id, whatsapp_instance_id, contact_id, direction, message_type, content, status, is_from_bot)
  VALUES ('33333333-0000-4000-8000-000000000002', '33333333-aaaa-4000-8000-000000000002',
          '33333333-cccc-4000-8000-000000000001', 'outbound', 'text', 'FIX resposta da Ana', 'sent', false);
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.afirma(tag || '1a. atendente INSERE mensagem em conversa que está com outra pessoa', '1', n::text);

  SELECT count(*) INTO n FROM public.messages
   WHERE contact_id = '33333333-cccc-4000-8000-000000000001' AND content = 'FIX resposta da Ana';
  PERFORM pg_temp.afirma(tag || '1b. a mensagem ficou gravada e legível', '1', n::text);

  -- Os triggers de messages atualizaram a conversa (prévia) SEM mexer no responsável.
  SELECT assigned_profile_id, last_message_content INTO v_holder, v_txt
    FROM public.conversations WHERE id = '33333333-dddd-4000-8000-000000000001';
  PERFORM pg_temp.afirma(tag || '1c. a prévia da conversa foi atualizada pelo trigger', 'FIX resposta da Ana', coalesce(v_txt, '<null>'));
  PERFORM pg_temp.afirma(tag || '1d. o responsável NÃO mudou ao enviar mensagem', '33333333-0000-4000-8000-0000000000fd', coalesce(v_holder::text, '<null>'));

  -- 5b. (passo 2) Quem respondeu vira participante: em 'own' a conv1 do Bruno
  --     passa a ser visível para a Ana depois de 1a. Em 'all' já era.
  SELECT count(*) INTO n FROM public.conversations WHERE id = '33333333-dddd-4000-8000-000000000001';
  PERFORM pg_temp.afirma(tag || '5b. depois de responder, atendente lê a conversa do colega (participante)', '1', n::text);

  -- 2-pre. (passo 2) A Ana responde na conv2 ANTES de assumir. Em 'own' é o que
  --        a torna visível; em 'all' não muda gabarito nenhum.
  INSERT INTO public.messages (tenant_id, whatsapp_instance_id, contact_id, direction, message_type, content, status, is_from_bot)
  VALUES ('33333333-0000-4000-8000-000000000002', '33333333-aaaa-4000-8000-000000000002',
          '33333333-cccc-4000-8000-000000000002', 'outbound', 'text', 'FIX pre-assumir da Ana', 'sent', false);
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.afirma(tag || '2-pre. atendente responde na conversa sem responsável antes de assumir', '1', n::text);

  -- 2. Concorrência: Ana assume a conv2 (sem responsável) com a guarda.
  UPDATE public.conversations
     SET assigned_profile_id = '33333333-0000-4000-8000-0000000000fc',
         assigned_at = now(),
         assigned_by = '33333333-0000-4000-8000-0000000000fc'
   WHERE id = '33333333-dddd-4000-8000-000000000002'
     AND tenant_id = '33333333-0000-4000-8000-000000000002'
     AND assigned_profile_id IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.afirma(tag || '2a. primeiro "Assumir" atualiza 1 linha', '1', n::text);

  -- 3b. Assumir para si NÃO gera notificação.
  SELECT count(*) INTO n FROM public.notifications
   WHERE user_id = '33333333-0000-4000-8000-00000000000c' AND title = 'Conversa transferida';
  PERFORM pg_temp.afirma(tag || '3b. assumir para si não grava notificação', '0', n::text);

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
  PERFORM pg_temp.afirma(tag || '2b. segundo "Assumir" (outra pessoa) atualiza 0 linhas', '0', n::text);

  -- 2c é lida como BRUNO. Em 'all' ele vê a conversa (com a Ana); em 'own' ele
  -- nem a enxerga — é da Ana e ele não participou. A leitura como Ana (2c-bis)
  -- é o que afirma o significado original nos dois níveis.
  SELECT assigned_profile_id INTO v_holder FROM public.conversations WHERE id = '33333333-dddd-4000-8000-000000000002';
  PERFORM pg_temp.afirma(tag || '2c. a conversa continua com quem assumiu primeiro (Ana) — lida pelo Bruno',
                         CASE nivel WHEN 'all' THEN '33333333-0000-4000-8000-0000000000fc' ELSE '<null>' END,
                         coalesce(v_holder::text, '<null>'));
  PERFORM pg_temp.como('33333333-0000-4000-8000-00000000000c');
  SELECT assigned_profile_id INTO v_holder FROM public.conversations WHERE id = '33333333-dddd-4000-8000-000000000002';
  PERFORM pg_temp.afirma(tag || '2c-bis. ...e lida pela própria Ana, em qualquer nível', '33333333-0000-4000-8000-0000000000fc', coalesce(v_holder::text, '<null>'));

  -- 3a. Transferência: Ana (que está com a conv2) transfere para o Bruno.
  PERFORM pg_temp.como('33333333-0000-4000-8000-00000000000c');
  UPDATE public.conversations
     SET assigned_profile_id = '33333333-0000-4000-8000-0000000000fd',
         assigned_at = now(),
         assigned_by = '33333333-0000-4000-8000-0000000000fc'
   WHERE id = '33333333-dddd-4000-8000-000000000002'
     AND tenant_id = '33333333-0000-4000-8000-000000000002';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.afirma(tag || '3a-i. transferir atualiza 1 linha (sem guarda IS NULL)', '1', n::text);

  -- A notificação é lida sob RLS pelo próprio Bruno (notifications_select_own).
  PERFORM pg_temp.como('33333333-0000-4000-8000-00000000000d');
  SELECT count(*) INTO n FROM public.notifications
   WHERE user_id = '33333333-0000-4000-8000-00000000000d'
     AND title = 'Conversa transferida'
     AND action_url = '/dashboard/conversations?contact=33333333-cccc-4000-8000-000000000002'
     AND (metadata ->> 'conversation_id') = '33333333-dddd-4000-8000-000000000002';
  PERFORM pg_temp.afirma(tag || '3a-ii. quem recebeu tem UMA notificação "Conversa transferida" com a URL da conversa', '1', n::text);

  -- 4. Diretório, como Ana (atendente).
  PERFORM pg_temp.como('33333333-0000-4000-8000-00000000000c');
  SELECT string_agg(first_name || ' ' || last_name, ', ' ORDER BY last_name) INTO v_txt
    FROM public.tenant_team_directory();
  PERFORM pg_temp.afirma(tag || '4a. atendente vê gestor, colegas da Loja e o gerente da Conta — não o vizinho nem o superadmin',
                         'FIX Ana, FIX Bruno, FIX Gerente, FIX Gestor', coalesce(v_txt, '<vazio>'));

  SELECT count(*) INTO n FROM public.tenant_team_directory('33333333-0000-4000-8000-000000000003');
  PERFORM pg_temp.afirma(tag || '4b. atendente pedindo a Loja vizinha recebe vazio', '0', n::text);

  -- 4c. Diretório expõe SÓ as quatro colunas (id, first_name, last_name, avatar_url).
  --     RETURNS TABLE não vira tipo composto no catálogo; a forma certa de
  --     perguntar é pg_get_function_result (corrigido em 2026-09-13).
  SELECT pg_get_function_result('public.tenant_team_directory(uuid)'::regprocedure) INTO v_txt;
  PERFORM pg_temp.afirma(tag || '4c. diretório devolve só id, first_name, last_name, avatar_url',
                         'TABLE(id uuid, first_name text, last_name text, avatar_url text)', coalesce(v_txt, '<?>'));

  -- 4d. Gerente pedindo a Loja filha recebe o time da Loja (+ ele mesmo, que é gerente da Conta acima).
  PERFORM pg_temp.como('33333333-0000-4000-8000-00000000000a');
  SELECT count(*) INTO n FROM public.tenant_team_directory('33333333-0000-4000-8000-000000000002');
  PERFORM pg_temp.afirma(tag || '4d. gerente pedindo a Loja filha recebe gestor + 2 atendentes + ele mesmo', '4', n::text);

  -- 4e. Ainda como atendente, profiles continua fechado (o diretório NÃO abriu a tabela).
  PERFORM pg_temp.como('33333333-0000-4000-8000-00000000000c');
  SELECT count(*) INTO n FROM public.profiles WHERE tenant_id = '33333333-0000-4000-8000-000000000002';
  PERFORM pg_temp.afirma(tag || '4e. RLS de profiles inalterado: atendente lê só o próprio perfil', '1', n::text);

  RESET ROLE;
  END LOOP;

  -- ---------------------------------------------------------------------------
  -- 3. Placar — e o rollback de propósito
  -- ---------------------------------------------------------------------------
  SELECT count(*) FILTER (WHERE status = 'ok'),
         count(*) FILTER (WHERE status = 'FAIL')
    INTO n_ok, n_fail
    FROM _resp_results;

  SELECT string_agg(
           format('%s %s  %s%s', lpad(seq::text, 3, ' '), rpad(status, 4, ' '), afirmacao,
                  CASE WHEN status = 'FAIL' THEN format('  [esperado: %s | obtido: %s]', esperado, obtido) ELSE '' END),
           E'\n' ORDER BY seq)
    INTO v_linhas
    FROM _resp_results;

  v_placar := CASE WHEN n_fail = 0 THEN 'SUITE VERDE' ELSE 'SUITE VERMELHA' END
              || format(' — %s ok / %s falhas', n_ok, n_fail);

  -- A exceção é o que DESFAZ tudo. Não é erro: é o resultado.
  RAISE EXCEPTION E'%\n%\n\n(Tudo desfeito: nenhuma fixture, mensagem ou notificação ficou gravada.)',
    v_placar, v_linhas;
END
$suite$;
