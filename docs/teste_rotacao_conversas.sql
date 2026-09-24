-- =============================================================================
-- teste_rotacao_conversas.sql — rede de segurança da migração
-- 20260915000001_conversation_rotation (passo 3 da atribuição).
--
-- O QUE FAZ
--   Semeia UMA organização falsa (Conta R + Loja R) com gerente, gestor e
--   atendentes (Ana, Bruno; Carla e Dani entram durante o teste), uma instância
--   de WhatsApp, um bot v2 publicado (só ligado quando o cenário pede) e 150
--   contatos, e afirma, cenário a cenário:
--
--   R0  com rotation_enabled ausente/false NADA muda: mensagem entra, conversa
--       nasce sem responsável, tabela de rodízio existe mas não é consultada.
--   R1  distribuição proporcional: 70/30 em 100 conversas dá EXATAMENTE 70/30;
--       70/30 em 10 dá 7/3 e em 7 dá 5/2 (o mais perto possível). Com três
--       pessoas, 50/30/20 em 10 dá 5/3/2 (R6b3).
--   R2  0 % nunca recebe — e a linha continua existindo (0 % ≠ removido).
--   R3  conversa com responsável NUNCA é reatribuída, inclusive cliente que
--       volta meses depois com o responsável em 0 % ou suspenso.
--   R4  rotation_timing = 'after_bot': sem bot publicado atribui na hora; com
--       bot publicado a primeira mensagem espera e a varredura pega depois de
--       90 s; sessão ativa espera e o fim da sessão (pelo motor) atribui; fim
--       da sessão por PESSOA não atribui (ação humana nunca dispara rodízio).
--   R5  o lock: durante a escolha a transação segura um advisory lock (a prova
--       de duas sessões está em docs/teste_rotacao_concorrencia.sql).
--   R6  entrar/sair reequilibra (divisão igual, 0 % preservado, resto para quem
--       entrou primeiro); aceitação de convite (trigger em auth.users) não é
--       bloqueada nem quando o reequilíbrio está sabotado para explodir.
--   R7  o escolhedor sabotado para explodir NÃO desfaz a mensagem: a linha de
--       messages existe e a conversa fica sem responsável.
--   R8  o sino NÃO toca em atribuição automática e TOCA em transferência por
--       pessoa.
--   R9  suspenso e 0 % ficam com o que têm; loja_ineligible_owners acha os dois
--       com motivo e quantidade; atendente recebe vazio.
--   R10 RLS e validação: atendente não lê a tabela; gestor/gerente leem; UPDATE
--       direto não passa; set_conversation_rotation recusa soma ≠ 100, pessoa
--       faltando, id não elegível, valor fora de 0..100 e chamador atendente.
--   R11 CHECK das três chaves em tenants.settings.
--   R12 rotation_includes_gestor entra e sai do rodízio pela chave.
--   R13 pessoa logada (auth.uid() presente) inserindo inbound = importação de
--       histórico: nunca atribui.
--
-- SEGURANÇA — por que dá para rodar contra produção
--   BEGIN ... ROLLBACK incondicional. UUIDs de fixture com prefixo 55555555-.
--   Guarda de colisão antes de semear. A varredura (R4) é chamada à mão, sem
--   esperar o cron. A sabotagem de R6/R7 substitui funções DENTRO da transação
--   e as restaura antes do fim — e o ROLLBACK desfaz tudo de qualquer jeito.
--
-- COMO RODAR
--   Papel `postgres` (SQL Editor ou o MCP de escrita), o arquivo inteiro de
--   uma vez. O placar sai no fim. Medido em 2026-09-15: ver o relatório do PR.
--
-- MODO AUTO-TESTE (prova que a suíte sabe falhar)
--   Descomente o bloco SABOTAGEM da seção 5: troca o escolhedor por "sempre a
--   primeira pessoa". Medido em 2026-09-14 contra produção: fase 1 = 95/95
--   verde; fase 2 = 13 vermelhos — R1c, R1d, R1e, R6b3, R9b, R12c (a proporção
--   e o gestor em 100 %) mais R0c, R4j, R5b, R9c–R9h, que são efeitos
--   colaterais de rodar a bateria pela segunda vez sobre o que a primeira
--   deixou (contagens acumuladas). R2b passa por coincidência: a "primeira
--   pessoa" é a Ana, que estava em 100 %.
-- =============================================================================

BEGIN;

-- Fatia 1 do Instagram (20260922000002): contacts.external_id virou NOT NULL e
-- quem preenche é a trigger trg_contacts_set_external_id. Sob
-- session_replication_role = replica ela NÃO dispara, e a semeadura morria com
-- 23502. ENABLE ALWAYS liga SÓ essa trigger, SÓ dentro desta transação (o
-- ROLLBACK desfaz) — a semeadura passa a obedecer a mesma regra da produção.
ALTER TABLE public.contacts ENABLE ALWAYS TRIGGER trg_contacts_set_external_id;

-- -----------------------------------------------------------------------------
-- 0. Guardas
-- -----------------------------------------------------------------------------
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tenants WHERE id::text LIKE '55555555-%') THEN
    RAISE EXCEPTION 'ABORTADO: UUID de fixture colide com tenant real. Nada foi feito.';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id::text LIKE '55555555-%') THEN
    RAISE EXCEPTION 'ABORTADO: UUID de fixture colide com usuário real do Auth. Nada foi feito.';
  END IF;
  IF to_regclass('public.conversation_rotation') IS NULL
     OR to_regprocedure('public.rotation_pick(uuid)') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: a migração 20260915000001 ainda não foi aplicada.';
  END IF;
END
$guard$;

-- -----------------------------------------------------------------------------
-- 1. Semeadura (triggers e FK suspensos)
-- -----------------------------------------------------------------------------
SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
  ('55555555-0000-4000-8000-00000000000a','authenticated','authenticated','fix-r-gerente@fixture.invalid', now(), now()),
  ('55555555-0000-4000-8000-00000000000b','authenticated','authenticated','fix-r-gestor@fixture.invalid',  now(), now()),
  ('55555555-0000-4000-8000-00000000000c','authenticated','authenticated','fix-r-ana@fixture.invalid',     now(), now()),
  ('55555555-0000-4000-8000-00000000000d','authenticated','authenticated','fix-r-bruno@fixture.invalid',   now(), now()),
  ('55555555-0000-4000-8000-00000000000e','authenticated','authenticated','fix-r-carla@fixture.invalid',   now(), now()),
  ('55555555-0000-4000-8000-00000000000f','authenticated','authenticated','fix-r-dani@fixture.invalid',    now(), now());

INSERT INTO public.tenants (id, name, slug, kind, parent_tenant_id, status, subscription_status) VALUES
  ('55555555-0000-4000-8000-000000000001','FIXTURE Conta R','fixture-conta-r','account', NULL,'active','active'),
  ('55555555-0000-4000-8000-000000000002','FIXTURE Loja R', 'fixture-loja-r', 'store','55555555-0000-4000-8000-000000000001','active',NULL);

-- created_at explícito: a ordem de entrada decide quem fica com o resto da divisão.
INSERT INTO public.profiles (id, user_id, tenant_id, role, parent_id, status, first_name, last_name, created_at) VALUES
  ('55555555-0000-4000-8000-0000000000fa','55555555-0000-4000-8000-00000000000a','55555555-0000-4000-8000-000000000001','gerente',   NULL,'active','FIX','Gerente','2026-01-01 10:00+00'),
  ('55555555-0000-4000-8000-0000000000fb','55555555-0000-4000-8000-00000000000b','55555555-0000-4000-8000-000000000002','gestor',   '55555555-0000-4000-8000-0000000000fa','active','FIX','Gestor','2026-01-01 10:01+00'),
  ('55555555-0000-4000-8000-0000000000fc','55555555-0000-4000-8000-00000000000c','55555555-0000-4000-8000-000000000002','atendente','55555555-0000-4000-8000-0000000000fb','active','FIX','Ana','2026-01-01 10:02+00'),
  ('55555555-0000-4000-8000-0000000000fd','55555555-0000-4000-8000-00000000000d','55555555-0000-4000-8000-000000000002','atendente','55555555-0000-4000-8000-0000000000fb','active','FIX','Bruno','2026-01-01 10:03+00');

INSERT INTO public.whatsapp_instances (id, tenant_id, name, instance_key) VALUES
  ('55555555-aaaa-4000-8000-000000000002','55555555-0000-4000-8000-000000000002','FIX instancia R','fix-key-r');

-- Bot v2 da instância: nasce DESPUBLICADO; R4 publica quando precisa.
INSERT INTO public.chatbots (id, tenant_id, whatsapp_instance_id, name, is_active, is_published, builder_version) VALUES
  ('55555555-bbbb-4000-8000-000000000001','55555555-0000-4000-8000-000000000002','55555555-aaaa-4000-8000-000000000002','FIX bot R', true, false, 2);

-- 150 contatos: 55555555-cccc-4000-8000-0000000000NN (hex).
INSERT INTO public.contacts (id, tenant_id, whatsapp_instance_id, phone, name)
SELECT ('55555555-cccc-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid,
       '55555555-0000-4000-8000-000000000002',
       '55555555-aaaa-4000-8000-000000000002',
       '55519' || lpad(n::text, 8, '0'),
       'FIX contato ' || n
  FROM generate_series(1, 150) n;

-- Uma conversa ANTIGA já com o Bruno (cliente que volta em R3).
INSERT INTO public.conversations (id, tenant_id, contact_id, whatsapp_instance_id, unread_count, last_message_at, assigned_profile_id, assigned_at, assigned_by) VALUES
  ('55555555-dddd-4000-8000-000000000001','55555555-0000-4000-8000-000000000002','55555555-cccc-4000-8000-000000000001','55555555-aaaa-4000-8000-000000000002',0,'2026-03-01 10:00+00','55555555-0000-4000-8000-0000000000fd','2026-03-01 10:00+00','55555555-0000-4000-8000-0000000000fd');
INSERT INTO public.messages (tenant_id, whatsapp_instance_id, contact_id, conversation_id, direction, message_type, content, status, created_at) VALUES
  ('55555555-0000-4000-8000-000000000002','55555555-aaaa-4000-8000-000000000002','55555555-cccc-4000-8000-000000000001','55555555-dddd-4000-8000-000000000001','inbound','text','FIX seed março','received','2026-03-01 10:00+00');

SET LOCAL session_replication_role = origin;

-- -----------------------------------------------------------------------------
-- 2. Infra dos checks
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _rot_results (
  seq serial, phase text, cenario text, check_kind text, expected text, actual text, status text
) ON COMMIT DROP;
GRANT ALL ON _rot_results TO authenticated;
GRANT ALL ON SEQUENCE _rot_results_seq_seq TO authenticated;

CREATE FUNCTION pg_temp.afirma(p_phase text, p_cenario text, p_check text, p_expected text, p_actual text) RETURNS void
LANGUAGE sql AS $f$
  INSERT INTO _rot_results(phase, cenario, check_kind, expected, actual, status)
  VALUES (p_phase, p_cenario, p_check, p_expected, p_actual,
          CASE WHEN p_expected = p_actual THEN 'ok' ELSE 'FAIL' END);
$f$;

-- Vira uma pessoa (JWT local à transação) — usar com SET LOCAL ROLE authenticated.
CREATE FUNCTION pg_temp.como(p_sub uuid) RETURNS void LANGUAGE sql AS $f$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
$f$;
-- Vira ninguém (webhook, RPC, cron): auth.uid() volta a NULL.
CREATE FUNCTION pg_temp.ninguem() RETURNS void LANGUAGE sql AS $f$
  SELECT set_config('request.jwt.claims', '', true);
$f$;

-- Preferências da Loja R (chamar com RESET ROLE).
CREATE FUNCTION pg_temp.prefs(p_enabled boolean, p_timing text DEFAULT 'immediate', p_gestor boolean DEFAULT false) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  UPDATE public.tenants
     SET settings = CASE WHEN p_enabled IS NULL THEN '{}'::jsonb
                         ELSE jsonb_build_object('rotation_enabled', p_enabled, 'rotation_timing', p_timing, 'rotation_includes_gestor', p_gestor) END
   WHERE id = '55555555-0000-4000-8000-000000000002';
END;
$f$;

-- O webhook: mensagem inbound do contato N, sem pessoa logada. Devolve o id da conversa.
CREATE FUNCTION pg_temp.chega(p_n int, p_content text DEFAULT 'FIX inbound') RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE v_contact uuid := ('55555555-cccc-4000-8000-' || lpad(to_hex(p_n), 12, '0'))::uuid; v_conv uuid;
BEGIN
  PERFORM pg_temp.ninguem();
  INSERT INTO public.messages (tenant_id, whatsapp_instance_id, contact_id, direction, message_type, content, status)
  VALUES ('55555555-0000-4000-8000-000000000002', '55555555-aaaa-4000-8000-000000000002', v_contact, 'inbound', 'text', p_content, 'received')
  RETURNING conversation_id INTO v_conv;
  RETURN v_conv;
END;
$f$;

-- Quem está com a conversa do contato N ('<null>' se ninguém).
CREATE FUNCTION pg_temp.dono(p_n int) RETURNS text LANGUAGE sql AS $f$
  SELECT coalesce(c.assigned_profile_id::text, '<null>')
    FROM public.conversations c
   WHERE c.tenant_id = '55555555-0000-4000-8000-000000000002'
     AND c.contact_id = ('55555555-cccc-4000-8000-' || lpad(to_hex(p_n), 12, '0'))::uuid;
$f$;

-- Placar de atribuições: "Ana=70,Bruno=30" (só quem recebeu ≥ 1).
CREATE FUNCTION pg_temp.placar(p_from int, p_to int) RETURNS text LANGUAGE sql AS $f$
  SELECT coalesce(string_agg(nome || '=' || n, ',' ORDER BY nome), '-')
    FROM (
      SELECT p.last_name AS nome, count(*) AS n
        FROM public.conversations c
        JOIN public.profiles p ON p.id = c.assigned_profile_id
       WHERE c.tenant_id = '55555555-0000-4000-8000-000000000002'
         AND c.contact_id IN (SELECT ('55555555-cccc-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid FROM generate_series(p_from, p_to) n)
       GROUP BY p.last_name
    ) x;
$f$;

-- Porcentagens gravadas: "Ana=70,Bruno=30" (inclui 0 %).
CREATE FUNCTION pg_temp.pcts() RETURNS text LANGUAGE sql AS $f$
  SELECT coalesce(string_agg(p.last_name || '=' || r.percent, ',' ORDER BY p.last_name), '-')
    FROM public.conversation_rotation r JOIN public.profiles p ON p.id = r.profile_id
   WHERE r.tenant_id = '55555555-0000-4000-8000-000000000002';
$f$;

-- Apaga conversas/mensagens dos contatos [from..to] para reaproveitar contatos.
CREATE FUNCTION pg_temp.limpa(p_from int, p_to int) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  DELETE FROM public.messages m
   WHERE m.tenant_id = '55555555-0000-4000-8000-000000000002'
     AND m.contact_id IN (SELECT ('55555555-cccc-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid FROM generate_series(p_from, p_to) n);
  DELETE FROM public.conversations c
   WHERE c.tenant_id = '55555555-0000-4000-8000-000000000002'
     AND c.contact_id IN (SELECT ('55555555-cccc-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid FROM generate_series(p_from, p_to) n);
END;
$f$;

-- Grava porcentagens como GESTOR pela RPC (o caminho da tela). Devolve 'ok' ou SQLSTATE+msg.
CREATE FUNCTION pg_temp.grava(p_json jsonb, p_sub uuid DEFAULT '55555555-0000-4000-8000-00000000000b') RETURNS text LANGUAGE plpgsql AS $f$
DECLARE v text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.como(p_sub);
  BEGIN
    PERFORM public.set_conversation_rotation('55555555-0000-4000-8000-000000000002', p_json);
    v := 'ok';
  EXCEPTION WHEN OTHERS THEN
    v := SQLSTATE || ' ' || SQLERRM;
  END;
  RESET ROLE;
  PERFORM pg_temp.ninguem();
  RETURN v;
END;
$f$;

-- -----------------------------------------------------------------------------
-- 3. A bateria
-- -----------------------------------------------------------------------------
CREATE FUNCTION pg_temp.bateria(p_phase text) RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  LOJA    constant uuid := '55555555-0000-4000-8000-000000000002';
  CONTA   constant uuid := '55555555-0000-4000-8000-000000000001';
  INST    constant uuid := '55555555-aaaa-4000-8000-000000000002';
  BOT     constant uuid := '55555555-bbbb-4000-8000-000000000001';
  GER     constant uuid := '55555555-0000-4000-8000-00000000000a';
  GES     constant uuid := '55555555-0000-4000-8000-00000000000b';
  ANA     constant uuid := '55555555-0000-4000-8000-00000000000c';
  BRUNO   constant uuid := '55555555-0000-4000-8000-00000000000d';
  P_GES   constant uuid := '55555555-0000-4000-8000-0000000000fb';
  P_ANA   constant uuid := '55555555-0000-4000-8000-0000000000fc';
  P_BRUNO constant uuid := '55555555-0000-4000-8000-0000000000fd';
  P_CARLA constant uuid := '55555555-0000-4000-8000-0000000000fe';
  P_DANI  constant uuid := '55555555-0000-4000-8000-0000000000ff';
  U_CARLA constant uuid := '55555555-0000-4000-8000-00000000000e';
  U_DANI  constant uuid := '55555555-0000-4000-8000-00000000000f';
  n int; v_txt text; v_conv uuid; v_uuid uuid; v_outro uuid; v_outro_user uuid; i int;
BEGIN
  RESET ROLE; PERFORM pg_temp.ninguem();

  -- ===================== R0. Desligado = nada muda =====================
  PERFORM pg_temp.prefs(NULL);                       -- settings = {}
  PERFORM public.rotation_rebalance(LOJA);           -- a tabela existe e está pronta...
  PERFORM pg_temp.afirma(p_phase, 'R0', 'R0a. tabela reconciliada: Ana e Bruno em 50/50 mesmo com o rodízio desligado', 'Ana=50,Bruno=50', pg_temp.pcts());
  v_conv := pg_temp.chega(2);
  PERFORM pg_temp.afirma(p_phase, 'R0', 'R0b. settings {}: mensagem entra e a conversa nasce SEM responsável', '<null>', pg_temp.dono(2));
  SELECT count(*) INTO n FROM public.messages WHERE conversation_id = v_conv;
  PERFORM pg_temp.afirma(p_phase, 'R0', 'R0c. ...e a mensagem está lá', '1', n::text);
  UPDATE public.tenants SET settings = NULL WHERE id = LOJA;
  v_conv := pg_temp.chega(3);
  PERFORM pg_temp.afirma(p_phase, 'R0', 'R0d. settings NULL: idem', '<null>', pg_temp.dono(3));
  PERFORM pg_temp.prefs(false);
  v_conv := pg_temp.chega(4);
  PERFORM pg_temp.afirma(p_phase, 'R0', 'R0e. rotation_enabled=false explícito: idem', '<null>', pg_temp.dono(4));
  SELECT coalesce(sum(credit), 0) INTO n FROM public.conversation_rotation WHERE tenant_id = LOJA;
  PERFORM pg_temp.afirma(p_phase, 'R0', 'R0f. nenhum crédito mexido com o rodízio desligado', '0', n::text);

  -- ===================== R1. Proporcional =====================
  PERFORM pg_temp.prefs(true);
  PERFORM pg_temp.afirma(p_phase, 'R1', 'R1a. gestor grava 70/30 pela RPC', 'ok',
    pg_temp.grava(jsonb_build_object(P_ANA::text, 70, P_BRUNO::text, 30)));
  PERFORM pg_temp.afirma(p_phase, 'R1', 'R1b. ...e ficou gravado', 'Ana=70,Bruno=30', pg_temp.pcts());
  FOR i IN 10..109 LOOP PERFORM pg_temp.chega(i); END LOOP;
  PERFORM pg_temp.afirma(p_phase, 'R1', 'R1c. 100 conversas novas com 70/30: EXATAMENTE 70 e 30', 'Ana=70,Bruno=30', pg_temp.placar(10, 109));
  -- Primeiras 10: o round-robin suave mantém a proporção em janela curta (7/3).
  PERFORM pg_temp.afirma(p_phase, 'R1', 'R1d. ...e já nas 10 primeiras a proporção é 7/3', 'Ana=7,Bruno=3', pg_temp.placar(10, 19));
  PERFORM pg_temp.afirma(p_phase, 'R1', 'R1e. ...e nas 7 primeiras, 5/2 (o mais perto de 70/30 que 7 permite)', 'Ana=5,Bruno=2', pg_temp.placar(10, 16));
  SELECT coalesce(sum(credit), 0) INTO n FROM public.conversation_rotation WHERE tenant_id = LOJA;
  PERFORM pg_temp.afirma(p_phase, 'R1', 'R1f. depois de 100 rodadas a soma dos créditos volta a zero (nada acumula sem limite)', '0', n::text);
  SELECT count(*) INTO n FROM public.conversations WHERE tenant_id = LOJA AND assigned_profile_id IS NOT NULL AND assigned_by IS NULL AND assigned_at IS NOT NULL
                                                    AND contact_id IN (SELECT ('55555555-cccc-4000-8000-' || lpad(to_hex(x), 12, '0'))::uuid FROM generate_series(10, 109) x);
  PERFORM pg_temp.afirma(p_phase, 'R1', 'R1g. atribuição automática grava assigned_by = NULL e assigned_at (a marca do automático)', '100', n::text);
  PERFORM pg_temp.limpa(10, 109);

  -- ===================== R2. 0 % nunca recebe =====================
  PERFORM pg_temp.afirma(p_phase, 'R2', 'R2a. gestor grava 100/0', 'ok',
    pg_temp.grava(jsonb_build_object(P_ANA::text, 100, P_BRUNO::text, 0)));
  FOR i IN 10..29 LOOP PERFORM pg_temp.chega(i); END LOOP;
  PERFORM pg_temp.afirma(p_phase, 'R2', 'R2b. 20 conversas com Bruno em 0 %: todas para a Ana', 'Ana=20', pg_temp.placar(10, 29));
  SELECT count(*) INTO n FROM public.conversation_rotation WHERE tenant_id = LOJA AND profile_id = P_BRUNO AND percent = 0;
  PERFORM pg_temp.afirma(p_phase, 'R2', 'R2c. a linha do Bruno continua existindo em 0 % (0 % não é removido)', '1', n::text);
  PERFORM pg_temp.limpa(10, 29);

  -- ===================== R3. Dono nunca é reatribuído =====================
  -- Contato 1 está com o Bruno desde março; Bruno em 0 %.
  v_conv := pg_temp.chega(1, 'FIX volta em setembro');
  PERFORM pg_temp.afirma(p_phase, 'R3', 'R3a. cliente de março volta, Bruno em 0 %: continua com o Bruno', P_BRUNO::text, pg_temp.dono(1));
  SELECT assigned_by::text INTO v_txt FROM public.conversations WHERE id = v_conv;
  PERFORM pg_temp.afirma(p_phase, 'R3', 'R3b. ...e assigned_by não foi mexido', P_BRUNO::text, v_txt);
  -- Bruno suspenso: continua com ele.
  UPDATE public.profiles SET status = 'suspended' WHERE id = P_BRUNO;
  v_conv := pg_temp.chega(1, 'FIX volta de novo');
  PERFORM pg_temp.afirma(p_phase, 'R3', 'R3c. Bruno suspenso, cliente volta: continua com o Bruno', P_BRUNO::text, pg_temp.dono(1));
  PERFORM pg_temp.afirma(p_phase, 'R3', 'R3d. ...e o reequilíbrio tirou o Bruno do rodízio (Ana 100)', 'Ana=100', pg_temp.pcts());
  UPDATE public.profiles SET status = 'active' WHERE id = P_BRUNO;
  PERFORM pg_temp.afirma(p_phase, 'R3', 'R3e. Bruno reativado volta ao rodízio em divisão igual', 'Ana=50,Bruno=50', pg_temp.pcts());

  -- ===================== R4. after_bot =====================
  PERFORM pg_temp.prefs(true, 'after_bot');
  -- (a) sem bot publicado, sem sessão: na hora
  v_conv := pg_temp.chega(30);
  PERFORM pg_temp.afirma(p_phase, 'R4', 'R4a. after_bot SEM bot publicado: atribui na hora (nunca espera bot que não existe)',
                         'sim', CASE WHEN pg_temp.dono(30) <> '<null>' THEN 'sim' ELSE 'não' END);
  -- (b) bot publicado: a primeira mensagem espera; a varredura pega depois de 90 s
  UPDATE public.chatbots SET is_published = true WHERE id = BOT;
  v_conv := pg_temp.chega(31);
  PERFORM pg_temp.afirma(p_phase, 'R4', 'R4b. after_bot COM bot publicado: a primeira mensagem espera (sem responsável)', '<null>', pg_temp.dono(31));
  SELECT public.rotation_sweep_after_bot() INTO n;
  PERFORM pg_temp.afirma(p_phase, 'R4', 'R4c. varredura antes de 90 s: não mexe', '0', n::text);
  PERFORM pg_temp.afirma(p_phase, 'R4', 'R4c2. ...continua sem responsável', '<null>', pg_temp.dono(31));
  UPDATE public.conversations SET last_message_at = now() - interval '2 minutes' WHERE id = v_conv;
  SELECT public.rotation_sweep_after_bot() INTO n;
  PERFORM pg_temp.afirma(p_phase, 'R4', 'R4d. varredura depois de 90 s sem sessão: atribui (bot não engatou)', '1', n::text);
  PERFORM pg_temp.afirma(p_phase, 'R4', 'R4d2. ...e a conversa tem responsável', 'sim', CASE WHEN pg_temp.dono(31) <> '<null>' THEN 'sim' ELSE 'não' END);
  -- (b2) segunda mensagem do mesmo contato sem sessão alguma: atribui (não é a primeira)
  v_conv := pg_temp.chega(32);
  PERFORM pg_temp.afirma(p_phase, 'R4', 'R4e. bot publicado, 1ª mensagem do contato 32: espera', '<null>', pg_temp.dono(32));
  v_conv := pg_temp.chega(32, 'FIX segunda');
  PERFORM pg_temp.afirma(p_phase, 'R4', 'R4f. 2ª mensagem sem sessão nenhuma: o bot não engatou, atribui', 'sim', CASE WHEN pg_temp.dono(32) <> '<null>' THEN 'sim' ELSE 'não' END);
  -- (c) sessão ativa: espera; o motor encerra → atribui na hora
  v_conv := pg_temp.chega(33);
  INSERT INTO public.chatbot_sessions (id, chatbot_id, contact_id, tenant_id, whatsapp_instance_id, status)
  VALUES ('55555555-eeee-4000-8000-000000000033', BOT, ('55555555-cccc-4000-8000-' || lpad(to_hex(33), 12, '0'))::uuid, LOJA, INST, 'active');
  v_conv := pg_temp.chega(33, 'FIX responde ao bot');
  PERFORM pg_temp.afirma(p_phase, 'R4', 'R4g. sessão ativa: a conversa espera', '<null>', pg_temp.dono(33));
  UPDATE public.conversations SET last_message_at = now() - interval '2 minutes' WHERE id = v_conv;
  SELECT public.rotation_sweep_after_bot() INTO n;
  PERFORM pg_temp.afirma(p_phase, 'R4', 'R4h. varredura respeita sessão ativa mesmo depois de 90 s', '0', n::text);
  UPDATE public.chatbot_sessions SET status = 'transferred', ended_at = now() WHERE id = '55555555-eeee-4000-8000-000000000033';
  PERFORM pg_temp.afirma(p_phase, 'R4', 'R4i. motor encerra a sessão (transfer_agent): atribui naquele instante', 'sim', CASE WHEN pg_temp.dono(33) <> '<null>' THEN 'sim' ELSE 'não' END);
  SELECT count(*) INTO n FROM public.notifications WHERE user_id IN (ANA, BRUNO) AND title = 'Conversa transferida';
  PERFORM pg_temp.afirma(p_phase, 'R4', 'R4j. ...sem sino (automático)', '0', n::text);
  -- (d) PESSOA encerra a sessão: não atribui (ação humana)
  v_conv := pg_temp.chega(34);
  INSERT INTO public.chatbot_sessions (id, chatbot_id, contact_id, tenant_id, whatsapp_instance_id, status)
  VALUES ('55555555-eeee-4000-8000-000000000034', BOT, ('55555555-cccc-4000-8000-' || lpad(to_hex(34), 12, '0'))::uuid, LOJA, INST, 'active');
  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(GES);
  UPDATE public.chatbot_sessions SET status = 'completed', ended_at = now() WHERE id = '55555555-eeee-4000-8000-000000000034' AND tenant_id = LOJA;
  GET DIAGNOSTICS n = ROW_COUNT;
  RESET ROLE; PERFORM pg_temp.ninguem();
  PERFORM pg_temp.afirma(p_phase, 'R4', 'R4k. gestor encerrou a sessão pelo botão (1 linha)', '1', n::text);
  PERFORM pg_temp.afirma(p_phase, 'R4', 'R4l. ...pessoa encerrando NÃO dispara o rodízio; a varredura cuida se ninguém responder', '<null>', pg_temp.dono(34));
  UPDATE public.chatbots SET is_published = false WHERE id = BOT;
  PERFORM pg_temp.prefs(true, 'immediate');
  PERFORM pg_temp.limpa(30, 34);
  DELETE FROM public.chatbot_sessions WHERE id::text LIKE '55555555-eeee-%';

  -- ===================== R5. O lock =====================
  -- A suíte inteira é UMA transação, então o lock tomado em R1 ainda está
  -- preso aqui: é exatamente a propriedade (solta só no COMMIT).
  v_uuid := public.rotation_pick(LOJA);
  SELECT count(*) INTO n FROM pg_locks
   WHERE locktype = 'advisory' AND pid = pg_backend_pid() AND granted AND objsubid = 1
     AND classid = (((hashtextextended('rotation:' || LOJA::text, 0) >> 32) & 4294967295))::oid
     AND objid   = ((hashtextextended('rotation:' || LOJA::text, 0) & 4294967295))::oid;
  PERFORM pg_temp.afirma(p_phase, 'R5', 'R5a. a transação que escolheu segura o advisory lock da Loja (solta no COMMIT)', '1', n::text);
  SELECT count(*) INTO n FROM pg_locks
   WHERE locktype = 'advisory' AND pid = pg_backend_pid() AND granted AND objsubid = 1
     AND classid = (((hashtextextended('rotation:' || CONTA::text, 0) >> 32) & 4294967295))::oid
     AND objid   = ((hashtextextended('rotation:' || CONTA::text, 0) & 4294967295))::oid;
  PERFORM pg_temp.afirma(p_phase, 'R5', 'R5b. ...e o lock é POR Loja: a chave de outra Conta não está presa', '0', n::text);
  -- desfaz o crédito da escolha avulsa
  UPDATE public.conversation_rotation SET credit = 0 WHERE tenant_id = LOJA;

  -- ===================== R6. Entrar/sair reequilibra =====================
  PERFORM pg_temp.afirma(p_phase, 'R6', 'R6a. ponto de partida 70/30', 'ok', pg_temp.grava(jsonb_build_object(P_ANA::text, 70, P_BRUNO::text, 30)));
  INSERT INTO public.profiles (id, user_id, tenant_id, role, parent_id, status, first_name, last_name)
  VALUES (P_CARLA, U_CARLA, LOJA, 'atendente', P_GES, 'active', 'FIX', 'Carla');
  PERFORM pg_temp.afirma(p_phase, 'R6', 'R6b. Carla entra: divisão igual, resto para quem entrou primeiro (Ana)', 'Ana=34,Bruno=33,Carla=33', pg_temp.pcts());
  -- Três pessoas, 50/30/20, dez conversas: 5/3/2 (R1 com três).
  PERFORM pg_temp.afirma(p_phase, 'R6', 'R6b2. gestor grava 50/30/20', 'ok', pg_temp.grava(jsonb_build_object(P_ANA::text, 50, P_BRUNO::text, 30, P_CARLA::text, 20)));
  FOR i IN 90..99 LOOP PERFORM pg_temp.chega(i); END LOOP;
  PERFORM pg_temp.afirma(p_phase, 'R6', 'R6b3. 10 conversas com 50/30/20: 5/3/2', 'Ana=5,Bruno=3,Carla=2', pg_temp.placar(90, 99));
  PERFORM pg_temp.limpa(90, 99);
  UPDATE public.profiles SET status = 'suspended' WHERE id = P_CARLA;
  PERFORM pg_temp.afirma(p_phase, 'R6', 'R6c. Carla suspensa: sai, os outros voltam a 50/50', 'Ana=50,Bruno=50', pg_temp.pcts());
  PERFORM pg_temp.afirma(p_phase, 'R6', 'R6d. gestor põe Ana em 0', 'ok', pg_temp.grava(jsonb_build_object(P_ANA::text, 0, P_BRUNO::text, 100)));
  UPDATE public.profiles SET status = 'active' WHERE id = P_CARLA;
  PERFORM pg_temp.afirma(p_phase, 'R6', 'R6e. Carla volta: 0 % da Ana é preservado, Bruno e Carla dividem', 'Ana=0,Bruno=50,Carla=50', pg_temp.pcts());
  UPDATE public.profiles SET status = 'deleted' WHERE id = P_BRUNO;
  PERFORM pg_temp.afirma(p_phase, 'R6', 'R6f. Bruno excluído: Carla fica com 100, Ana segue em 0', 'Ana=0,Carla=100', pg_temp.pcts());
  UPDATE public.profiles SET tenant_id = CONTA WHERE id = P_CARLA;
  PERFORM pg_temp.afirma(p_phase, 'R6', 'R6g. Carla movida de Loja: só sobrou a Ana em 0 — o rodízio não fica sem ninguém, Ana vai a 100', 'Ana=100', pg_temp.pcts());
  UPDATE public.profiles SET tenant_id = LOJA WHERE id = P_CARLA;
  UPDATE public.profiles SET status = 'active' WHERE id = P_BRUNO;
  PERFORM pg_temp.afirma(p_phase, 'R6', 'R6h. os dois de volta: 34/33/33', 'Ana=34,Bruno=33,Carla=33', pg_temp.pcts());
  DELETE FROM public.profiles WHERE id = P_CARLA;
  PERFORM pg_temp.afirma(p_phase, 'R6', 'R6i. DELETE do perfil (cascata do Auth): sai e os outros dividem', 'Ana=50,Bruno=50', pg_temp.pcts());
  -- Aceitação de convite: profile pending → on_auth_user_confirmed → active → rebalance
  INSERT INTO public.profiles (id, user_id, tenant_id, role, parent_id, status, first_name, last_name, invite_intent_active)
  VALUES (P_DANI, U_DANI, LOJA, 'atendente', P_GES, 'pending', 'FIX', 'Dani', true);
  PERFORM pg_temp.afirma(p_phase, 'R6', 'R6j. convidada pendente ainda não entra', 'Ana=50,Bruno=50', pg_temp.pcts());
  UPDATE auth.users SET email_confirmed_at = now(), last_sign_in_at = now() WHERE id = U_DANI;
  SELECT status INTO v_txt FROM public.profiles WHERE id = P_DANI;
  PERFORM pg_temp.afirma(p_phase, 'R6', 'R6k. aceitou o convite (trigger em auth.users): perfil ativo', 'active', v_txt);
  PERFORM pg_temp.afirma(p_phase, 'R6', 'R6l. ...e entrou no rodízio', 'Ana=34,Bruno=33,Dani=33', pg_temp.pcts());
  -- Sabotagem do reequilíbrio: aceitação de convite continua passando.
  DELETE FROM public.profiles WHERE id = P_DANI;
  UPDATE auth.users SET email_confirmed_at = NULL, last_sign_in_at = NULL WHERE id = U_DANI;
  INSERT INTO public.profiles (id, user_id, tenant_id, role, parent_id, status, first_name, last_name, invite_intent_active)
  VALUES (P_DANI, U_DANI, LOJA, 'atendente', P_GES, 'pending', 'FIX', 'Dani', true);
  CREATE OR REPLACE FUNCTION public.rotation_rebalance(p_tenant_id uuid) RETURNS boolean LANGUAGE plpgsql AS $sab$
  BEGIN RAISE EXCEPTION 'SABOTAGEM: reequilíbrio explodiu de propósito'; END; $sab$;
  BEGIN
    UPDATE auth.users SET email_confirmed_at = now(), last_sign_in_at = now() WHERE id = U_DANI;
    v_txt := 'passou';
  EXCEPTION WHEN OTHERS THEN v_txt := SQLSTATE || ' ' || SQLERRM;
  END;
  PERFORM pg_temp.afirma(p_phase, 'R6', 'R6m. com o reequilíbrio SABOTADO para explodir, a aceitação do convite NÃO é bloqueada', 'passou', v_txt);
  SELECT status INTO v_txt FROM public.profiles WHERE id = P_DANI;
  PERFORM pg_temp.afirma(p_phase, 'R6', 'R6n. ...e o perfil ficou ativo', 'active', v_txt);
  PERFORM pg_temp.restaura_rebalance();
  DELETE FROM public.profiles WHERE id = P_DANI;
  PERFORM public.rotation_rebalance(LOJA);
  PERFORM pg_temp.afirma(p_phase, 'R6', 'R6o. reequilíbrio restaurado e reconciliado', 'Ana=50,Bruno=50', pg_temp.pcts());

  -- ===================== R7. Escolhedor sabotado não perde mensagem =====================
  CREATE OR REPLACE FUNCTION public.rotation_pick(p_tenant_id uuid) RETURNS uuid LANGUAGE plpgsql AS $sab$
  BEGIN RAISE EXCEPTION 'SABOTAGEM: escolhedor explodiu de propósito'; END; $sab$;
  BEGIN
    v_conv := pg_temp.chega(40, 'FIX mensagem que não pode sumir');
    v_txt := 'passou';
  EXCEPTION WHEN OTHERS THEN v_txt := SQLSTATE || ' ' || SQLERRM;
  END;
  PERFORM pg_temp.afirma(p_phase, 'R7', 'R7a. com o escolhedor SABOTADO para explodir, o INSERT da mensagem NÃO falha', 'passou', v_txt);
  SELECT count(*) INTO n FROM public.messages WHERE content = 'FIX mensagem que não pode sumir';
  PERFORM pg_temp.afirma(p_phase, 'R7', 'R7b. ...a mensagem está gravada', '1', n::text);
  PERFORM pg_temp.afirma(p_phase, 'R7', 'R7c. ...e a conversa ficou sem responsável (estado inócuo)', '<null>', pg_temp.dono(40));
  PERFORM pg_temp.restaura_pick();
  v_conv := pg_temp.chega(41);
  PERFORM pg_temp.afirma(p_phase, 'R7', 'R7d. escolhedor restaurado volta a atribuir', 'sim', CASE WHEN pg_temp.dono(41) <> '<null>' THEN 'sim' ELSE 'não' END);
  PERFORM pg_temp.limpa(40, 41);

  -- ===================== R8. O sino =====================
  DELETE FROM public.notifications WHERE user_id::text LIKE '55555555-%';
  v_conv := pg_temp.chega(50);
  SELECT count(*) INTO n FROM public.notifications WHERE user_id IN (ANA, BRUNO) AND title = 'Conversa transferida';
  PERFORM pg_temp.afirma(p_phase, 'R8', 'R8a. atribuição automática: NENHUM sino', '0', n::text);
  -- O rodízio deu a conversa a alguém; o gestor passa para o OUTRO (senão não há transferência).
  SELECT assigned_profile_id INTO v_uuid FROM public.conversations WHERE id = v_conv;
  v_outro := CASE WHEN v_uuid = P_ANA THEN P_BRUNO ELSE P_ANA END;
  v_outro_user := CASE WHEN v_uuid = P_ANA THEN BRUNO ELSE ANA END;
  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(GES);
  UPDATE public.conversations SET assigned_profile_id = v_outro, assigned_by = P_GES, assigned_at = now() WHERE id = v_conv AND tenant_id = LOJA;
  GET DIAGNOSTICS n = ROW_COUNT;
  RESET ROLE; PERFORM pg_temp.ninguem();
  PERFORM pg_temp.afirma(p_phase, 'R8', 'R8b. gestor transfere para a outra pessoa (1 linha)', '1', n::text);
  SELECT count(*) INTO n FROM public.notifications WHERE user_id = v_outro_user AND title = 'Conversa transferida';
  PERFORM pg_temp.afirma(p_phase, 'R8', 'R8c. ...e o sino de quem recebeu TOCA (transferência por pessoa)', '1', n::text);
  -- Quem tinha a conversa toma de volta para si: sem sino (assigned_by = ela mesma).
  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(CASE WHEN v_uuid = P_ANA THEN ANA ELSE BRUNO END);
  UPDATE public.conversations SET assigned_profile_id = v_uuid, assigned_by = v_uuid, assigned_at = now() WHERE id = v_conv AND tenant_id = LOJA;
  RESET ROLE; PERFORM pg_temp.ninguem();
  SELECT count(*) INTO n FROM public.notifications WHERE user_id = CASE WHEN v_uuid = P_ANA THEN ANA ELSE BRUNO END AND title = 'Conversa transferida';
  PERFORM pg_temp.afirma(p_phase, 'R8', 'R8d. quem toma para si não recebe sino (regra do passo 1 intacta)', '0', n::text);
  PERFORM pg_temp.limpa(50, 50);

  -- ===================== R9. Suspenso / 0 % ficam com o que têm; o gestor acha =====================
  PERFORM pg_temp.afirma(p_phase, 'R9', 'R9a. 50/50', 'ok', pg_temp.grava(jsonb_build_object(P_ANA::text, 50, P_BRUNO::text, 50)));
  FOR i IN 60..69 LOOP PERFORM pg_temp.chega(i); END LOOP;
  PERFORM pg_temp.afirma(p_phase, 'R9', 'R9b. 10 conversas: 5/5', 'Ana=5,Bruno=5', pg_temp.placar(60, 69));
  UPDATE public.profiles SET status = 'suspended' WHERE id = P_BRUNO;
  SELECT count(*) INTO n FROM public.conversations WHERE tenant_id = LOJA AND assigned_profile_id = P_BRUNO;
  PERFORM pg_temp.afirma(p_phase, 'R9', 'R9c. Bruno suspenso continua com as 5 dele + a de março', '6', n::text);
  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(GES);
  SELECT string_agg(last_name || ':' || reason || ':' || n_conversations, ',' ORDER BY last_name) INTO v_txt FROM public.loja_ineligible_owners(LOJA);
  PERFORM pg_temp.afirma(p_phase, 'R9', 'R9d. gestor: loja_ineligible_owners acha o Bruno suspenso com 6 conversas', 'Bruno:suspended:6', coalesce(v_txt, '-'));
  PERFORM pg_temp.como(GER);
  SELECT string_agg(last_name || ':' || reason || ':' || n_conversations, ',' ORDER BY last_name) INTO v_txt FROM public.loja_ineligible_owners(LOJA);
  PERFORM pg_temp.afirma(p_phase, 'R9', 'R9e. gerente da Conta acima também acha', 'Bruno:suspended:6', coalesce(v_txt, '-'));
  PERFORM pg_temp.como(ANA);
  SELECT count(*) INTO n FROM public.loja_ineligible_owners(LOJA);
  PERFORM pg_temp.afirma(p_phase, 'R9', 'R9f. atendente recebe vazio (fora do alcance)', '0', n::text);
  RESET ROLE; PERFORM pg_temp.ninguem();
  UPDATE public.profiles SET status = 'active' WHERE id = P_BRUNO;
  PERFORM pg_temp.afirma(p_phase, 'R9', 'R9g. Bruno em 0 %', 'ok', pg_temp.grava(jsonb_build_object(P_ANA::text, 100, P_BRUNO::text, 0)));
  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(GES);
  SELECT string_agg(last_name || ':' || reason || ':' || n_conversations, ',' ORDER BY last_name) INTO v_txt FROM public.loja_ineligible_owners(LOJA);
  PERFORM pg_temp.afirma(p_phase, 'R9', 'R9h. Bruno em 0 % aparece como zero_percent com as 6', 'Bruno:zero_percent:6', coalesce(v_txt, '-'));
  RESET ROLE; PERFORM pg_temp.ninguem();
  PERFORM pg_temp.prefs(false);
  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(GES);
  SELECT count(*) INTO n FROM public.loja_ineligible_owners(LOJA);
  PERFORM pg_temp.afirma(p_phase, 'R9', 'R9i. com o rodízio desligado, 0 % não é motivo (só status/movido)', '0', n::text);
  RESET ROLE; PERFORM pg_temp.ninguem();
  PERFORM pg_temp.prefs(true);
  PERFORM pg_temp.limpa(60, 69);

  -- ===================== R10. RLS e validação =====================
  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(ANA);
  SELECT count(*) INTO n FROM public.conversation_rotation WHERE tenant_id = LOJA;
  PERFORM pg_temp.afirma(p_phase, 'R10', 'R10a. atendente não lê conversation_rotation', '0', n::text);
  SELECT count(*) INTO n FROM public.conversation_rotation_get(LOJA);
  PERFORM pg_temp.afirma(p_phase, 'R10', 'R10b. ...nem pela RPC (vazio, sem erro)', '0', n::text);
  PERFORM pg_temp.como(GES);
  SELECT count(*) INTO n FROM public.conversation_rotation WHERE tenant_id = LOJA;
  PERFORM pg_temp.afirma(p_phase, 'R10', 'R10c. gestor lê as 2 linhas da Loja', '2', n::text);
  SELECT string_agg(last_name || '=' || percent || '/' || role, ',' ORDER BY last_name) INTO v_txt FROM public.conversation_rotation_get(LOJA);
  PERFORM pg_temp.afirma(p_phase, 'R10', 'R10d. RPC devolve nome, cargo e porcentagem', 'Ana=100/atendente,Bruno=0/atendente', v_txt);
  BEGIN
    UPDATE public.conversation_rotation SET percent = 50 WHERE tenant_id = LOJA;
    v_txt := 'passou';
  EXCEPTION WHEN OTHERS THEN v_txt := SQLSTATE;
  END;
  PERFORM pg_temp.afirma(p_phase, 'R10', 'R10e. UPDATE direto pelo gestor é recusado (42501: só SELECT concedido, sem policy de escrita)', '42501', v_txt);
  PERFORM pg_temp.como(GER);
  SELECT count(*) INTO n FROM public.conversation_rotation WHERE tenant_id = LOJA;
  PERFORM pg_temp.afirma(p_phase, 'R10', 'R10f. gerente da Conta acima lê a Loja filha', '2', n::text);
  RESET ROLE; PERFORM pg_temp.ninguem();
  PERFORM pg_temp.afirma(p_phase, 'R10', 'R10g. soma 90 é recusada (22023)', '22023',
    left(pg_temp.grava(jsonb_build_object(P_ANA::text, 60, P_BRUNO::text, 30)), 5));
  PERFORM pg_temp.afirma(p_phase, 'R10', 'R10h. soma 110 é recusada (22023)', '22023',
    left(pg_temp.grava(jsonb_build_object(P_ANA::text, 60, P_BRUNO::text, 50)), 5));
  PERFORM pg_temp.afirma(p_phase, 'R10', 'R10i. pessoa faltando é recusada (22023)', '22023',
    left(pg_temp.grava(jsonb_build_object(P_ANA::text, 100)), 5));
  PERFORM pg_temp.afirma(p_phase, 'R10', 'R10j. id não elegível (gestor sem a chave) é recusado (22023)', '22023',
    left(pg_temp.grava(jsonb_build_object(P_ANA::text, 50, P_BRUNO::text, 30, P_GES::text, 20)), 5));
  PERFORM pg_temp.afirma(p_phase, 'R10', 'R10k. valor 150 é recusado (22023)', '22023',
    left(pg_temp.grava(jsonb_build_object(P_ANA::text, 150, P_BRUNO::text, -50)), 5));
  PERFORM pg_temp.afirma(p_phase, 'R10', 'R10l. decimal é recusado (22023)', '22023',
    left(pg_temp.grava(jsonb_build_object(P_ANA::text, 50.5, P_BRUNO::text, 49.5)), 5));
  PERFORM pg_temp.afirma(p_phase, 'R10', 'R10m. atendente chamando é recusado (42501)', '42501',
    left(pg_temp.grava(jsonb_build_object(P_ANA::text, 50, P_BRUNO::text, 50), ANA), 5));
  PERFORM pg_temp.afirma(p_phase, 'R10', 'R10n. gerente da Conta acima grava na Loja filha', 'ok',
    pg_temp.grava(jsonb_build_object(P_ANA::text, 50, P_BRUNO::text, 50), GER));
  PERFORM pg_temp.afirma(p_phase, 'R10', 'R10o. ...50/50 gravado', 'Ana=50,Bruno=50', pg_temp.pcts());

  -- ===================== R11. CHECK das chaves =====================
  BEGIN
    UPDATE public.tenants SET settings = '{"rotation_timing":"bogus"}'::jsonb WHERE id = LOJA; v_txt := 'aceitou';
  EXCEPTION WHEN OTHERS THEN v_txt := SQLSTATE; END;
  PERFORM pg_temp.afirma(p_phase, 'R11', 'R11a. rotation_timing inválido é recusado pela CHECK (23514)', '23514', v_txt);
  BEGIN
    UPDATE public.tenants SET settings = '{"rotation_enabled":"sim"}'::jsonb WHERE id = LOJA; v_txt := 'aceitou';
  EXCEPTION WHEN OTHERS THEN v_txt := SQLSTATE; END;
  PERFORM pg_temp.afirma(p_phase, 'R11', 'R11b. rotation_enabled não-booleano é recusado (23514)', '23514', v_txt);
  BEGIN
    UPDATE public.tenants SET settings = '{"rotation_includes_gestor":1}'::jsonb WHERE id = LOJA; v_txt := 'aceitou';
  EXCEPTION WHEN OTHERS THEN v_txt := SQLSTATE; END;
  PERFORM pg_temp.afirma(p_phase, 'R11', 'R11c. rotation_includes_gestor não-booleano é recusado (23514)', '23514', v_txt);
  PERFORM pg_temp.prefs(true);

  -- ===================== R12. Gestor no rodízio pela chave =====================
  PERFORM pg_temp.prefs(true, 'immediate', true);
  PERFORM pg_temp.afirma(p_phase, 'R12', 'R12a. chave ligada: gestor entra em divisão igual (34/33/33, gestor entrou por último)', 'Ana=34,Bruno=33,Gestor=33', pg_temp.pcts());
  PERFORM pg_temp.afirma(p_phase, 'R12', 'R12b. gestor pode receber 100 %', 'ok', pg_temp.grava(jsonb_build_object(P_ANA::text, 0, P_BRUNO::text, 0, P_GES::text, 100)));
  v_conv := pg_temp.chega(70);
  PERFORM pg_temp.afirma(p_phase, 'R12', 'R12c. ...e recebe a conversa', P_GES::text, pg_temp.dono(70));
  PERFORM pg_temp.prefs(true, 'immediate', false);
  PERFORM pg_temp.afirma(p_phase, 'R12', 'R12d. chave desligada: gestor sai; Ana e Bruno estavam em 0 — divisão igual entre os dois', 'Ana=50,Bruno=50', pg_temp.pcts());
  PERFORM pg_temp.limpa(70, 70);

  -- ===================== R13. Pessoa logada inserindo inbound (histórico) =====================
  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(GES);
  INSERT INTO public.messages (tenant_id, whatsapp_instance_id, contact_id, direction, message_type, content, status, created_at)
  VALUES (LOJA, INST, ('55555555-cccc-4000-8000-' || lpad(to_hex(80), 12, '0'))::uuid, 'inbound', 'text', 'FIX histórico importado', 'received', '2026-05-01 10:00+00');
  RESET ROLE; PERFORM pg_temp.ninguem();
  PERFORM pg_temp.afirma(p_phase, 'R13', 'R13a. inbound inserido por pessoa logada (importação): NÃO atribui', '<null>', pg_temp.dono(80));
  v_conv := pg_temp.chega(80, 'FIX agora pelo webhook');
  PERFORM pg_temp.afirma(p_phase, 'R13', 'R13b. a mesma conversa recebendo pelo webhook: atribui', 'sim', CASE WHEN pg_temp.dono(80) <> '<null>' THEN 'sim' ELSE 'não' END);
  PERFORM pg_temp.limpa(80, 80);

  RESET ROLE; PERFORM pg_temp.ninguem();
  PERFORM pg_temp.prefs(NULL);
END
$fn$;

-- Restauram as funções sabotadas em R6/R7 com o texto da migração.
CREATE FUNCTION pg_temp.restaura_rebalance() RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  EXECUTE (SELECT def FROM _rot_defs WHERE nome = 'rotation_rebalance');
END; $f$;
CREATE FUNCTION pg_temp.restaura_pick() RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  EXECUTE (SELECT def FROM _rot_defs WHERE nome = 'rotation_pick');
END; $f$;

-- Guarda o texto vivo das duas funções antes de qualquer sabotagem.
CREATE TEMP TABLE _rot_defs ON COMMIT DROP AS
SELECT 'rotation_rebalance' AS nome, pg_get_functiondef('public.rotation_rebalance(uuid)'::regprocedure) AS def
UNION ALL
SELECT 'rotation_pick', pg_get_functiondef('public.rotation_pick(uuid)'::regprocedure);

-- -----------------------------------------------------------------------------
-- 4. Fase 1 — como está
-- -----------------------------------------------------------------------------
SELECT pg_temp.bateria('1-intacto');

-- -----------------------------------------------------------------------------
-- 5. SABOTAGEM (descomente para provar que a suíte sabe falhar)
--    Troca o escolhedor por "sempre a primeira pessoa da tabela". Esperado
--    (medido em 2026-09-14): R1c/R1d/R1e (proporção), R6b3, R9b e R12c
--    vermelhos, mais os efeitos colaterais da segunda rodada (ver cabeçalho).
--    Desfeito pelo ROLLBACK junto com todo o resto.
-- -----------------------------------------------------------------------------
-- CREATE OR REPLACE FUNCTION public.rotation_pick(p_tenant_id uuid) RETURNS uuid
-- LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $sab$
--   SELECT r.profile_id FROM public.conversation_rotation r WHERE r.tenant_id = p_tenant_id ORDER BY r.created_at, r.profile_id LIMIT 1;
-- $sab$;
-- UPDATE _rot_defs SET def = pg_get_functiondef('public.rotation_pick(uuid)'::regprocedure) WHERE nome = 'rotation_pick';
-- SELECT pg_temp.bateria('2-sabotado');

-- -----------------------------------------------------------------------------
-- 6. Placar
-- -----------------------------------------------------------------------------
SELECT phase,
       count(*) FILTER (WHERE status='ok')   AS passou,
       count(*) FILTER (WHERE status='FAIL') AS falhou,
       CASE WHEN count(*) FILTER (WHERE status='FAIL') = 0
            THEN 'SUITE VERDE' ELSE 'SUITE VERMELHA' END AS placar,
       coalesce(string_agg(check_kind || ' [esperado ' || expected || ', obtido ' || actual || ']', '; ' ORDER BY seq)
                FILTER (WHERE status='FAIL'), '-') AS falhas
FROM _rot_results GROUP BY phase ORDER BY phase;

ROLLBACK;
