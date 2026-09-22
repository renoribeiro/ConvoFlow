-- =============================================================================
-- 20260922000001_rls_gerente_writes_child_store_chatbots
--
-- O QUE MUDA
--   Um GERENTE passa a CRIAR, EDITAR e APAGAR chatbots das Lojas filhas da
--   Conta dele: o bot em si e as quatro tabelas do construtor visual
--   (nos, conexoes, variaveis, gatilhos). Ate aqui ele so LIA (20260909000001),
--   entao o editor abria com o fluxo inteiro na tela e recusava o Salvar.
--
-- O DEFEITO
--   Medido em 2026-09-22 como a Camila (gerente da Conta "Camila Santarosa",
--   trabalhando dentro da Loja EncaixaRH pelo seletor de Loja), ao salvar o
--   fluxo "Filtragem de Leads":
--     42501 new row violates row-level security policy for table "chatbot_nodes"
--
--   `useSaveFlow` grava `tenant_id = tenant.id`, e `tenant.id` e a Loja ATIVA
--   no seletor (TenantContext), nao a Conta do perfil. A unica policy de
--   escrita dessas tabelas, "Users can access own tenant <tabela>", exige
--   `tenant_id = get_current_user_tenant_id()`, que para a Camila e a CONTA.
--   Loja != Conta -> WITH CHECK falso -> 42501.
--
--   E exatamente o mesmo defeito da 20260909000004 (messages / conversations /
--   contacts / tags) e da 20260917000001 (quick_replies). O chatbot ficou de
--   fora das duas.
--
-- POR QUE O BOT VAI PARA A LOJA, E NAO PARA A CONTA
--   O chatbot dispara a partir de uma `whatsapp_instance`, e as instancias sao
--   da Loja. Um bot gravado na Conta nunca casaria com a instancia da Loja e
--   nunca rodaria. O proprio motor (evolution-webhook / meta-webhook) busca o
--   bot por `tenant_id` da instancia que recebeu a mensagem.
--
-- POR QUE DELETE ENTRA AQUI
--   Nao e opcional: salvar um fluxo APAGA o que saiu do canvas. `useSaveFlow`
--   faz delete dos nos/conexoes/variaveis removidos antes do upsert, e
--   `useUpdateTriggers` troca os gatilhos por delete-all + insert. Sem DELETE,
--   o gerente conseguiria acrescentar mas nunca remover um no - e o fluxo
--   salvo divergiria em silencio do que ele ve na tela (o DELETE recusado pelo
--   RLS nao levanta erro: ele apaga zero linhas).
--   Em `chatbots`, DELETE e o botao de apagar o bot, que a tela ja oferece a
--   qualquer cargo da Loja. Nada de historico de cliente pende dai: o CASCADE
--   alcanca so as tabelas do proprio bot (nos, conexoes, variaveis, gatilhos e
--   sessoes). `messages` e `conversations` nao referenciam chatbot algum.
--
-- ESCOPO - de proposito estreito
--   CINCO tabelas: chatbots, chatbot_nodes, chatbot_edges, chatbot_variables,
--   chatbot_triggers. Somente gerente, somente Loja filha direta, pelo mesmo
--   helper `gerente_child_store_ids()` (subconsulta NAO correlacionada,
--   InitPlan uma vez por comando - ver 20260909000001).
--
--   `chatbot_sessions` fica DE FORA: sessao e estado de execucao do bot, nao
--   autoria. Quem escreve nela e o motor (service_role). O unico ponto em que
--   uma pessoa escreve e o botao "Encerrar atendimento do bot" no inbox, e
--   `useEndChatbotSession` ja trata a recusa do gerente com mensagem propria
--   (SESSION_END_FORBIDDEN_MESSAGE). Mexer nisso e outra decisao.
--
-- REDE DE SEGURANCA
--   `docs/teste_rls_chatbot_gerente.sql` - prova nas cinco tabelas que o
--   gerente escreve na Loja filha e NAO escreve na Loja de outra Conta, e que
--   gestor/atendente seguem presos a propria Loja.
--
-- Aplicacao: este arquivo inteiro no SQL Editor (ou pelo MCP). O bloco DO e um
-- comando so: ou entra tudo, ou nada (armadilha 4 do CLAUDE.md).
-- NAO rodar `supabase db push` neste projeto.
-- =============================================================================

DO $mig$
DECLARE
  v_tabelas text[] := ARRAY['chatbots','chatbot_nodes','chatbot_edges',
                            'chatbot_variables','chatbot_triggers'];
  v_tbl     text;
  v_total   int;
BEGIN
  -- Guarda 1: o helper que as policies usam.
  IF to_regprocedure('public.gerente_child_store_ids()') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: public.gerente_child_store_ids() nao existe. Rode a 20260909000001 antes.';
  END IF;

  -- Guarda 2: a leitura tem de existir antes, nas cinco. Escrever numa tabela
  -- que ele nao enxerga seria um estado sem sentido.
  FOREACH v_tbl IN ARRAY v_tabelas LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policy pol
        JOIN pg_class c     ON c.oid = pol.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = v_tbl
         AND pol.polname = 'gerente_reads_child_store_data'
    ) THEN
      RAISE EXCEPTION 'ABORTADO: falta gerente_reads_child_store_data em %. Rode a 20260909000001 antes.', v_tbl;
    END IF;
  END LOOP;

  FOREACH v_tbl IN ARRAY v_tabelas LOOP
    EXECUTE format('DROP POLICY IF EXISTS gerente_inserts_child_store_data ON public.%I;', v_tbl);
    EXECUTE format($sql$
      CREATE POLICY gerente_inserts_child_store_data ON public.%I
        FOR INSERT TO authenticated
        WITH CHECK (tenant_id IN (SELECT public.gerente_child_store_ids()));
    $sql$, v_tbl);

    EXECUTE format('DROP POLICY IF EXISTS gerente_updates_child_store_data ON public.%I;', v_tbl);
    EXECUTE format($sql$
      CREATE POLICY gerente_updates_child_store_data ON public.%I
        FOR UPDATE TO authenticated
        USING      (tenant_id IN (SELECT public.gerente_child_store_ids()))
        WITH CHECK (tenant_id IN (SELECT public.gerente_child_store_ids()));
    $sql$, v_tbl);

    EXECUTE format('DROP POLICY IF EXISTS gerente_deletes_child_store_data ON public.%I;', v_tbl);
    EXECUTE format($sql$
      CREATE POLICY gerente_deletes_child_store_data ON public.%I
        FOR DELETE TO authenticated
        USING (tenant_id IN (SELECT public.gerente_child_store_ids()));
    $sql$, v_tbl);
  END LOOP;

  -- Conferencia: 3 policies novas em cada uma das 5 tabelas.
  SELECT count(*) INTO v_total
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = ANY (v_tabelas)
     AND policyname IN ('gerente_inserts_child_store_data',
                        'gerente_updates_child_store_data',
                        'gerente_deletes_child_store_data');

  IF v_total <> 15 THEN
    RAISE EXCEPTION 'ABORTADO: conferencia final falhou; esperava 15 policies gerente_*, achei %.', v_total;
  END IF;

  INSERT INTO supabase_migrations.schema_migrations (version, name)
  VALUES ('20260922000001', 'rls_gerente_writes_child_store_chatbots')
  ON CONFLICT (version) DO NOTHING;

  RAISE NOTICE 'chatbots + 4 tabelas do construtor: escrita do gerente liberada nas Lojas filhas.';
END
$mig$;
