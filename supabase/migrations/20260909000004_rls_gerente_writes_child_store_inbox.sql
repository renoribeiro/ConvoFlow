-- =============================================================================
-- 20260909000004_rls_gerente_writes_child_store_inbox
--
-- O QUE MUDA
--   A migracao 20260909000001 deu ao gerente LEITURA das Lojas filhas. Faltou
--   a escrita, e sem ela o gerente ABRE a conversa e NAO consegue responder.
--
--   Pior que "nao registra": em `ChatWindow.handleSendMessage` a gravacao da
--   mensagem vem ANTES da chamada ao provedor. O INSERT barrado pelo RLS cai
--   no `catch` e o `adapter.sendText()` nunca roda — ou seja, o cliente do
--   outro lado NAO recebe nada. Medido em 2026-09-09 como a Camila:
--   `42501 new row violates row-level security policy for table "messages"`.
--
-- ESCOPO - quatro tabelas, dois comandos
--   Escrita SO em: messages, conversations, contacts, tags.
--   As outras 31 tabelas da 20260909000001 seguem SOMENTE LEITURA.
--   SO INSERT e UPDATE. **DELETE nao foi concedido de proposito**: responder
--   cliente nao exige apagar nada, e apagar conversa/contato de uma Loja e
--   destrutivo. Se um dia precisar, e outra migracao e outra decisao.
--
-- POR QUE `conversations` ENTRA MESMO SEM A TELA ESCREVER NELA DIRETO
--   Tres gatilhos de `messages` mexem em `conversations` e NENHUM e
--   SECURITY DEFINER, entao rodam sob o RLS de quem chamou:
--     - handle_message_conversation      (BEFORE INSERT) SELECT + INSERT
--     - update_conversation_on_message   (AFTER INSERT)  INSERT ... ON CONFLICT
--                                                        DO UPDATE
--     - sync_conversation_last_message   (AFTER UPDATE OF status) UPDATE
--   Com `ON CONFLICT DO UPDATE`, uma linha invisivel ao RLS faz o comando
--   ERRAR, nao passar batido. Sem INSERT **e** UPDATE em `conversations` o
--   proprio INSERT em `messages` falharia dentro do gatilho.
--
-- WITH CHECK
--   No INSERT, impede gravar numa Loja que nao e dela.
--   No UPDATE, impede empurrar a linha para fora (trocar o `tenant_id` para
--   outra Loja ou para a Conta). USING escolhe quais linhas ela alcanca;
--   WITH CHECK decide como a linha pode ficar. Os dois sao necessarios.
--
-- DESEMPENHO
--   Mesma forma da 20260909000001: subconsulta NAO correlacionada, resolvida
--   como InitPlan/hashed SubPlan uma vez por comando.
-- =============================================================================

DO $mig$
DECLARE
  v_tbl     text;
  v_missing text[];
  -- A LISTA E A SUPERFICIE DE AUDITORIA. Nao acrescente sem decidir junto.
  v_tables  text[] := ARRAY['messages', 'conversations', 'contacts', 'tags'];
BEGIN
  SELECT array_agg(t ORDER BY t) INTO v_missing
    FROM unnest(v_tables) AS t
   WHERE NOT EXISTS (
     SELECT 1
       FROM pg_attribute a
       JOIN pg_class c     ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = t
        AND c.relkind = 'r'
        AND a.attname = 'tenant_id'
        AND NOT a.attisdropped
   );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'ABORTADO: sem tenant_id ou inexistentes: %. Nada foi criado.', v_missing;
  END IF;

  -- Guarda: a leitura tem de existir antes. Escrever numa Loja que ela nao
  -- enxerga seria um estado sem sentido.
  SELECT array_agg(t ORDER BY t) INTO v_missing
    FROM unnest(v_tables) AS t
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_policy pol
       JOIN pg_class c     ON c.oid = pol.polrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t
        AND pol.polname = 'gerente_reads_child_store_data'
   );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'ABORTADO: falta a policy de leitura em %. Rode a 20260909000001 antes.', v_missing;
  END IF;

  FOREACH v_tbl IN ARRAY v_tables LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS gerente_inserts_child_store_data ON public.%I', v_tbl);
    EXECUTE format(
      'CREATE POLICY gerente_inserts_child_store_data ON public.%I '
      'FOR INSERT TO authenticated '
      'WITH CHECK (tenant_id IN (SELECT public.gerente_child_store_ids()))', v_tbl);

    EXECUTE format(
      'DROP POLICY IF EXISTS gerente_updates_child_store_data ON public.%I', v_tbl);
    EXECUTE format(
      'CREATE POLICY gerente_updates_child_store_data ON public.%I '
      'FOR UPDATE TO authenticated '
      'USING (tenant_id IN (SELECT public.gerente_child_store_ids())) '
      'WITH CHECK (tenant_id IN (SELECT public.gerente_child_store_ids()))', v_tbl);
  END LOOP;

  RAISE NOTICE 'Escrita (INSERT+UPDATE) liberada em % tabelas.', array_length(v_tables, 1);
END
$mig$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260909000004','rls_gerente_writes_child_store_inbox')
ON CONFLICT (version) DO NOTHING;
