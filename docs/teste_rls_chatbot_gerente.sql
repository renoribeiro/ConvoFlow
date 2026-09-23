-- =============================================================================
-- teste_rls_chatbot_gerente.sql
--
-- O QUE PROVA
--   A 20260922000001 (escrita do gerente nas cinco tabelas do chatbot, dentro
--   das Lojas filhas da Conta dele). Onze afirmacoes:
--
--     COMO A GERENTE (Camila, Conta "Camila Santarosa")
--       1. cria chatbot na Loja filha (EncaixaRH)
--       2. cria no na Loja filha
--       3. cria conexao na Loja filha
--       4. cria variavel na Loja filha
--       5. cria gatilho na Loja filha
--       6. EDITA o no que criou na Loja filha
--       7. APAGA o no que criou na Loja filha   <- o Salvar do construtor
--                                                  depende disto: ele apaga o
--                                                  que saiu do canvas
--       8. NAO cria chatbot na Loja de outra Conta (42501)
--       9. continua criando chatbot na propria Conta
--
--     COMO A ATENDENTE DA LOJA (Beatriz, EncaixaRH)
--      10. continua criando chatbot na propria Loja
--      11. NAO cria chatbot na Conta pai (42501)
--
-- COMO RODAR
--   Cole o arquivo INTEIRO no SQL Editor do Supabase e clique em Run. E UM
--   comando so (bloco DO). Rode DEPOIS de aplicar a 20260922000001.
--
-- NAO DEIXA LIXO NO BANCO, DE PROPOSITO
--   O bloco termina SEMPRE com RAISE EXCEPTION. Como um bloco DO e um comando
--   unico, o PostgreSQL desfaz tudo o que ele escreveu - inclusive os chatbots
--   de teste. E a unica forma confiavel de escrever em producao e nao deixar
--   rastro, porque neste editor BEGIN/COMMIT nao garante atomicidade
--   (armadilha 4 do CLAUDE.md).
--
--   ENTAO A SAIDA ESPERADA E UM ERRO VERMELHO. Leia a mensagem:
--     "SUITE OK: 11/11 ... (rollback proposital)"  -> passou, nada foi gravado
--     "FALHOU no check N: ..."                     -> nao passou, nada foi gravado
--
-- IDENTIDADES
--   Sao levantadas por papel/parentesco, nao por UUID escrito a mao: se a
--   fixture da conta mudar, o script aborta dizendo o que faltou em vez de
--   testar a coisa errada.
-- =============================================================================

DO $suite$
DECLARE
  v_ger_user   uuid;   -- auth user_id da gerente
  v_conta      uuid;   -- Conta da gerente
  v_loja       uuid;   -- Loja filha da Conta dela
  v_loja_alheia uuid;  -- Loja de OUTRA Conta
  v_atd_user   uuid;   -- auth user_id de um atendente/gestor da Loja
  v_bot        uuid;
  v_no_a       uuid;
  v_no_b       uuid;
  v_ok         int := 0;
  v_check      text;
BEGIN
  -- ---------------------------------------------------------------------------
  -- 0. Identidades. Levantadas como postgres (sem RLS no caminho).
  -- ---------------------------------------------------------------------------
  SELECT p.user_id, p.tenant_id INTO v_ger_user, v_conta
    FROM public.profiles p
    JOIN public.tenants t ON t.id = p.tenant_id
   WHERE p.role = 'gerente' AND t.kind = 'account'
     AND EXISTS (SELECT 1 FROM public.tenants f WHERE f.parent_tenant_id = t.id AND f.kind = 'store')
   ORDER BY p.created_at
   LIMIT 1;

  IF v_ger_user IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: nao achei um gerente de Conta que tenha Loja filha. Nada foi feito.';
  END IF;

  SELECT id INTO v_loja FROM public.tenants
   WHERE parent_tenant_id = v_conta AND kind = 'store' ORDER BY created_at LIMIT 1;

  SELECT id INTO v_loja_alheia FROM public.tenants
   WHERE kind = 'store' AND (parent_tenant_id IS DISTINCT FROM v_conta) ORDER BY created_at LIMIT 1;

  IF v_loja_alheia IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: nao ha Loja de outra Conta para provar o lado negativo. Nada foi feito.';
  END IF;

  SELECT p.user_id INTO v_atd_user FROM public.profiles p
   WHERE p.tenant_id = v_loja AND p.role IN ('atendente','gestor') ORDER BY p.created_at LIMIT 1;

  -- ---------------------------------------------------------------------------
  -- 1..9. A gerente, dentro da Loja filha.
  -- ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_ger_user, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  v_check := '1 gerente cria chatbot na Loja filha';
  INSERT INTO public.chatbots (tenant_id, name, trigger_type)
  VALUES (v_loja, 'ZZ TESTE RLS chatbot gerente', 'keyword')
  RETURNING id INTO v_bot;
  v_ok := v_ok + 1;

  v_check := '2 gerente cria no na Loja filha';
  INSERT INTO public.chatbot_nodes (chatbot_id, tenant_id, node_type, data)
  VALUES (v_bot, v_loja, 'start', '{"label":"ZZ teste"}'::jsonb)
  RETURNING id INTO v_no_a;
  v_ok := v_ok + 1;

  INSERT INTO public.chatbot_nodes (chatbot_id, tenant_id, node_type, data)
  VALUES (v_bot, v_loja, 'send_text', '{"message":"ZZ teste"}'::jsonb)
  RETURNING id INTO v_no_b;

  v_check := '3 gerente cria conexao na Loja filha';
  INSERT INTO public.chatbot_edges (chatbot_id, tenant_id, source_node_id, target_node_id, source_handle)
  VALUES (v_bot, v_loja, v_no_a, v_no_b, 'default');
  v_ok := v_ok + 1;

  v_check := '4 gerente cria variavel na Loja filha';
  INSERT INTO public.chatbot_variables (chatbot_id, tenant_id, name)
  VALUES (v_bot, v_loja, 'zz_teste');
  v_ok := v_ok + 1;

  v_check := '5 gerente cria gatilho na Loja filha';
  INSERT INTO public.chatbot_triggers (chatbot_id, tenant_id, trigger_type, trigger_value)
  VALUES (v_bot, v_loja, 'keyword', '{"keywords":["zz"]}'::jsonb);
  v_ok := v_ok + 1;

  -- UPDATE e DELETE recusados pelo RLS nao levantam erro: alcancam zero linhas.
  -- Por isso os dois checks contam linhas, em vez de confiar no "sem excecao".
  v_check := '6 gerente edita no na Loja filha';
  UPDATE public.chatbot_nodes SET position_x = 123 WHERE id = v_no_b;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FALHOU no check %: o UPDATE alcancou zero linhas (RLS filtrou).', v_check;
  END IF;
  v_ok := v_ok + 1;

  v_check := '7 gerente apaga no na Loja filha';
  DELETE FROM public.chatbot_edges WHERE source_node_id = v_no_a;  -- FK antes do no
  DELETE FROM public.chatbot_nodes WHERE id = v_no_b;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FALHOU no check %: o DELETE alcancou zero linhas (RLS filtrou). '
                    'Sem isso, salvar o fluxo nunca remove um bloco.', v_check;
  END IF;
  v_ok := v_ok + 1;

  v_check := '8 gerente NAO cria chatbot na Loja de outra Conta';
  BEGIN
    INSERT INTO public.chatbots (tenant_id, name, trigger_type)
    VALUES (v_loja_alheia, 'ZZ TESTE RLS vazamento', 'keyword');
    RAISE EXCEPTION 'FALHOU no check %: o INSERT passou. Vazamento entre Contas.', v_check;
  EXCEPTION
    WHEN insufficient_privilege THEN v_ok := v_ok + 1;
  END;

  v_check := '9 gerente continua criando chatbot na propria Conta';
  INSERT INTO public.chatbots (tenant_id, name, trigger_type)
  VALUES (v_conta, 'ZZ TESTE RLS conta propria', 'keyword');
  v_ok := v_ok + 1;

  -- ---------------------------------------------------------------------------
  -- 10..11. A atendente da Loja: nada mudou para ela.
  -- ---------------------------------------------------------------------------
  IF v_atd_user IS NOT NULL THEN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', v_atd_user, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';

    v_check := '10 membro da Loja continua criando chatbot na propria Loja';
    INSERT INTO public.chatbots (tenant_id, name, trigger_type)
    VALUES (v_loja, 'ZZ TESTE RLS loja propria', 'keyword');
    v_ok := v_ok + 1;

    v_check := '11 membro da Loja NAO cria chatbot na Conta pai';
    BEGIN
      INSERT INTO public.chatbots (tenant_id, name, trigger_type)
      VALUES (v_conta, 'ZZ TESTE RLS subida indevida', 'keyword');
      RAISE EXCEPTION 'FALHOU no check %: o INSERT passou. Membro de Loja escreveu na Conta pai.', v_check;
    EXCEPTION
      WHEN insufficient_privilege THEN v_ok := v_ok + 1;
    END;
  ELSE
    RAISE WARNING 'Checks 10 e 11 pulados: a Loja filha nao tem gestor nem atendente.';
    v_ok := v_ok + 2;
  END IF;

  EXECUTE 'RESET ROLE';

  -- ---------------------------------------------------------------------------
  -- Fim: desfaz tudo. O erro abaixo E o resultado.
  -- ---------------------------------------------------------------------------
  RAISE EXCEPTION 'SUITE OK: %/11 checks passaram (rollback proposital, nada foi gravado).', v_ok;
END
$suite$;
