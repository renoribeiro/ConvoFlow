-- =============================================================================
-- teste_rotacao_concorrencia.sql — a prova de DUAS SESSÕES do rodízio
-- (migração 20260915000001_conversation_rotation, passo 3 da atribuição).
--
-- O QUE PROVA
--   Duas mensagens de dois contatos NOVOS chegando no mesmo instante NÃO caem
--   na mesma pessoa. Sem serialização isso aconteceria: nenhuma transação vê o
--   crédito não commitado da outra. Com o pg_advisory_xact_lock por Loja, a
--   segunda espera a primeira COMMITAR e só então escolhe — e escolhe a OUTRA
--   pessoa.
--
-- POR QUE NÃO ESTÁ NA SUÍTE PRINCIPAL
--   teste_rotacao_conversas.sql roda numa transação só (BEGIN...ROLLBACK).
--   Concorrência exige duas conexões. dblink precisaria da senha do banco
--   (2F003 medido em 2026-09-14), então a prova é feita por DUAS chamadas
--   simultâneas à API REST, contra uma fixture COMMITADA e apagada no fim.
--
-- RESULTADO MEDIDO EM 2026-09-14 (produção, fixture 66666666-, 50/50)
--   hold = 1,5 s (menor que o lock_timeout de 3 s das funções):
--     A: start=13:46:32.983 end=13:46:32.995 waited_ms=12.5   owner=Ana   commit=13:46:34.498
--     B: start=13:46:33.216 end=13:46:34.504 waited_ms=1288.3 owner=Bruno commit=13:46:36.006
--   B começou 232 ms depois de A, ficou BLOQUEADA no INSERT até 6 ms depois do
--   COMMIT de A, e escolheu a outra pessoa. Serialização e proporção provadas.
--
--   hold = 4 s (MAIOR que o lock_timeout, de propósito):
--     A: waited_ms=29.1   owner=Ana
--     B: waited_ms=3012.5 owner=<null>
--   B esperou os 3 s do lock_timeout, recebeu 55P03, o handler capturou, a
--   MENSAGEM FOI GRAVADA e a conversa ficou sem responsável (estado inócuo;
--   a próxima mensagem do contato escolhe de novo). É a rede de segurança da
--   seção "A MENSAGEM DO CLIENTE NUNCA SE PERDE" funcionando numa transação
--   presa de verdade. Em produção uma transação segura o lock por milissegundos.
--
-- COMO RODAR (3 passos, papel postgres no SQL Editor + um terminal)
--   1. Rode o bloco PASSO 1 abaixo (fixture + função-sonda). Ele COMMITA.
--   2. No terminal, dispare as duas chamadas ao mesmo tempo (a chave anon está
--      em .env como VITE_SUPABASE_ANON_KEY; a URL é o projeto):
--
--        URL=https://pqjkuwyshybxldzpfbbs.supabase.co/rest/v1/rpc/rotation_probe_tmp
--        curl -s -X POST $URL -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"p_n":1,"p_hold":1.5}' &
--        sleep 0.2
--        curl -s -X POST $URL -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"p_n":2,"p_hold":1.5}' &
--        wait
--
--      (PowerShell: use dois Start-Job com Invoke-RestMethod, mesmo corpo.)
--      Esperado: owners DIFERENTES e waited_ms da segunda ≈ hold da primeira.
--   3. Rode o bloco PASSO 3 (apaga a sonda e a fixture). SEMPRE, mesmo se o
--      passo 2 falhou — a fixture é dado real enquanto existir.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PASSO 1 — fixture COMMITADA + função-sonda temporária
-- -----------------------------------------------------------------------------
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.tenants WHERE id::text LIKE '66666666-%')
     OR EXISTS (SELECT 1 FROM auth.users WHERE id::text LIKE '66666666-%') THEN
    RAISE EXCEPTION 'ABORTADO: fixture 66666666- já existe. Rode o PASSO 3 antes.';
  END IF;
  IF to_regprocedure('public.rotation_pick(uuid)') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: a migração 20260915000001 ainda não foi aplicada.';
  END IF;
END $$;
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
  ('66666666-0000-4000-8000-00000000000c','authenticated','authenticated','fix-c-ana@fixture.invalid',   now(), now()),
  ('66666666-0000-4000-8000-00000000000d','authenticated','authenticated','fix-c-bruno@fixture.invalid', now(), now());
INSERT INTO public.tenants (id, name, slug, kind, status, settings) VALUES
  ('66666666-0000-4000-8000-000000000002','FIXTURE Loja C (concorrência)','fixture-loja-c','store','active',
   '{"rotation_enabled": true, "rotation_timing": "immediate"}');
INSERT INTO public.profiles (id, user_id, tenant_id, role, status, first_name, last_name) VALUES
  ('66666666-0000-4000-8000-0000000000fc','66666666-0000-4000-8000-00000000000c','66666666-0000-4000-8000-000000000002','atendente','active','FIX','Ana'),
  ('66666666-0000-4000-8000-0000000000fd','66666666-0000-4000-8000-00000000000d','66666666-0000-4000-8000-000000000002','atendente','active','FIX','Bruno');
INSERT INTO public.whatsapp_instances (id, tenant_id, name, instance_key) VALUES
  ('66666666-aaaa-4000-8000-000000000002','66666666-0000-4000-8000-000000000002','FIX C','fix-key-c');
INSERT INTO public.contacts (id, tenant_id, whatsapp_instance_id, phone, name) VALUES
  ('66666666-cccc-4000-8000-000000000001','66666666-0000-4000-8000-000000000002','66666666-aaaa-4000-8000-000000000002','5551966660001','FIX C1'),
  ('66666666-cccc-4000-8000-000000000002','66666666-0000-4000-8000-000000000002','66666666-aaaa-4000-8000-000000000002','5551966660002','FIX C2');
SET LOCAL session_replication_role = origin;
SELECT public.rotation_rebalance('66666666-0000-4000-8000-000000000002');   -- Ana 50 / Bruno 50

-- Sonda: insere a mensagem inbound do contato N da fixture (como o webhook
-- faria: sem pessoa logada), segura a transação por p_hold segundos e devolve
-- os carimbos. Recusa qualquer contato fora da fixture.
CREATE OR REPLACE FUNCTION public.rotation_probe_tmp(p_n int, p_hold numeric DEFAULT 1.5)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE t0 timestamptz; t1 timestamptz; v_conv uuid; v_owner uuid; v_contact uuid;
BEGIN
  v_contact := ('66666666-cccc-4000-8000-' || lpad(to_hex(p_n), 12, '0'))::uuid;
  IF NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = v_contact AND tenant_id = '66666666-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'só a fixture';
  END IF;
  PERFORM set_config('request.jwt.claims', '', true);
  t0 := clock_timestamp();
  INSERT INTO public.messages (tenant_id, whatsapp_instance_id, contact_id, direction, message_type, content, status)
  VALUES ('66666666-0000-4000-8000-000000000002', '66666666-aaaa-4000-8000-000000000002', v_contact, 'inbound', 'text', 'PROBE ' || p_n, 'received')
  RETURNING conversation_id INTO v_conv;
  t1 := clock_timestamp();
  SELECT assigned_profile_id INTO v_owner FROM public.conversations WHERE id = v_conv;
  PERFORM pg_sleep(p_hold);
  RETURN format('n=%s start=%s end=%s waited_ms=%s owner=%s commit=%s',
                p_n, t0, t1, round(extract(epoch FROM (t1 - t0)) * 1000, 1), v_owner, clock_timestamp());
END $$;
GRANT EXECUTE ON FUNCTION public.rotation_probe_tmp(int, numeric) TO anon, authenticated;
COMMIT;

-- -----------------------------------------------------------------------------
-- PASSO 2 — no terminal (ver cabeçalho). Depois, opcionalmente, confira aqui:
-- -----------------------------------------------------------------------------
-- SELECT c.contact_id, p.last_name AS dono, c.assigned_by
--   FROM public.conversations c LEFT JOIN public.profiles p ON p.id = c.assigned_profile_id
--  WHERE c.tenant_id = '66666666-0000-4000-8000-000000000002';
-- Esperado: dois donos DIFERENTES, assigned_by NULL nos dois (automático).

-- -----------------------------------------------------------------------------
-- PASSO 3 — limpeza (sempre)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rotation_probe_tmp(int, numeric);
DO $$
DECLARE n_msg int; n_conv int; n_ct int; n_rot int; n_prof int; n_inst int; n_ten int; n_users int;
BEGIN
  DELETE FROM public.messages              WHERE tenant_id = '66666666-0000-4000-8000-000000000002'; GET DIAGNOSTICS n_msg   = ROW_COUNT;
  DELETE FROM public.conversations         WHERE tenant_id = '66666666-0000-4000-8000-000000000002'; GET DIAGNOSTICS n_conv  = ROW_COUNT;
  DELETE FROM public.contacts              WHERE tenant_id = '66666666-0000-4000-8000-000000000002'; GET DIAGNOSTICS n_ct    = ROW_COUNT;
  DELETE FROM public.conversation_rotation WHERE tenant_id = '66666666-0000-4000-8000-000000000002'; GET DIAGNOSTICS n_rot   = ROW_COUNT;
  DELETE FROM public.whatsapp_instances    WHERE tenant_id = '66666666-0000-4000-8000-000000000002'; GET DIAGNOSTICS n_inst  = ROW_COUNT;
  DELETE FROM public.profiles              WHERE tenant_id = '66666666-0000-4000-8000-000000000002'; GET DIAGNOSTICS n_prof  = ROW_COUNT;
  DELETE FROM public.tenants               WHERE id = '66666666-0000-4000-8000-000000000002';        GET DIAGNOSTICS n_ten   = ROW_COUNT;
  DELETE FROM auth.users                   WHERE id::text LIKE '66666666-%';                         GET DIAGNOSTICS n_users = ROW_COUNT;
  RAISE NOTICE 'limpo: msg=% conv=% contatos=% rot=% inst=% perfis=% tenants=% users=%',
    n_msg, n_conv, n_ct, n_rot, n_inst, n_prof, n_ten, n_users;
END $$;
SELECT (SELECT count(*) FROM public.tenants WHERE id::text LIKE '66666666-%') AS tenants_restantes,
       (SELECT count(*) FROM auth.users     WHERE id::text LIKE '66666666-%') AS users_restantes,
       (SELECT count(*) FROM pg_proc WHERE proname = 'rotation_probe_tmp')   AS sonda_restante;
-- Esperado: 0 / 0 / 0.
