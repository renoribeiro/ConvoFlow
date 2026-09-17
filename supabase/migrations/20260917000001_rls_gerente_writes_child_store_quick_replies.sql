-- =============================================================================
-- 20260917000001_rls_gerente_writes_child_store_quick_replies
--
-- O QUE MUDA
--   Um GERENTE passa a CRIAR, EDITAR e APAGAR respostas rapidas das Lojas
--   filhas da Conta dele. Ate aqui ele so LIA (20260909000001).
--
-- O DEFEITO
--   Medido em 2026-09-17 como a Camila (gerente da Conta "Camila Santarosa",
--   trabalhando dentro da Loja EncaixaRH pelo seletor de Loja): ao salvar uma
--   mensagem enviada como resposta rapida,
--     42501 new row violates row-level security policy for table "quick_replies"
--
--   `useQuickReplies.criar` grava `tenant_id = tenant.id`, e `tenant.id` e a
--   Loja ATIVA no seletor (TenantContext), nao a Conta do perfil. A unica
--   policy de escrita da tabela, `quick_replies_tenant_all`, exige
--   `tenant_id = get_current_user_tenant_id()`, que para a Camila e a CONTA.
--   Loja != Conta -> WITH CHECK falso -> 42501.
--
--   E o mesmo defeito da 20260909000004, que liberou a escrita do gerente em
--   messages / conversations / contacts / tags e deixou quick_replies de fora.
--
-- POR QUE A RESPOSTA VAI PARA A LOJA, E NAO PARA A CONTA
--   Quem consome a biblioteca sao os atendentes e gestores DA LOJA, cujo
--   `get_current_user_tenant_id()` e a propria Loja. Uma resposta gravada na
--   Conta ficaria invisivel para eles. O modal ja diz: "Fica disponivel para
--   toda a Loja".
--
-- POR QUE DELETE ENTRA AQUI (e nao entrou na 20260909000004)
--   La, DELETE foi negado porque apagar conversa/contato/mensagem e destruir
--   historico do cliente. Resposta rapida e um trecho de texto reutilizavel,
--   sem historico pendurado nela (nenhuma FK aponta para a tabela), e a tela
--   de Configuracoes oferece "Apagar" com confirmacao para qualquer cargo da
--   Loja. Negar so ao gerente, que administra a Loja, seria um botao que abre
--   e falha - o mesmo sintoma que esta migracao conserta.
--
-- ESCOPO
--   UMA tabela: quick_replies. Somente gerente, somente Loja filha direta,
--   pelo mesmo helper `gerente_child_store_ids()` (subconsulta NAO
--   correlacionada, InitPlan uma vez por comando - ver 20260909000001).
--
-- REDE DE SEGURANCA
--   docs/teste_isolamento_rls.sql atualizado na mesma entrega: quick_replies
--   sai do grupo "NAO escreve na Loja filha" e entra no grupo que escreve,
--   com INSERT/UPDATE/DELETE aceitos na Loja filha e recusados na Loja de
--   outra Conta.
--
-- Aplicacao: este arquivo inteiro no SQL Editor (ou pelo MCP). O bloco DO e um
-- comando so: ou entra tudo, ou nada (armadilha 4 do CLAUDE.md).
-- NAO rodar `supabase db push` neste projeto.
-- =============================================================================

DO $mig$
BEGIN
  -- Guarda 1: a leitura tem de existir antes. Escrever numa Loja que ele nao
  -- enxerga seria um estado sem sentido.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
      JOIN pg_class c     ON c.oid = pol.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'quick_replies'
       AND pol.polname = 'gerente_reads_child_store_data'
  ) THEN
    RAISE EXCEPTION 'ABORTADO: falta gerente_reads_child_store_data em quick_replies. Rode a 20260909000001 antes.';
  END IF;

  -- Guarda 2: o helper que a policy usa.
  IF to_regprocedure('public.gerente_child_store_ids()') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: public.gerente_child_store_ids() nao existe. Rode a 20260909000001 antes.';
  END IF;

  DROP POLICY IF EXISTS gerente_inserts_child_store_data ON public.quick_replies;
  CREATE POLICY gerente_inserts_child_store_data ON public.quick_replies
    FOR INSERT TO authenticated
    WITH CHECK (tenant_id IN (SELECT public.gerente_child_store_ids()));

  DROP POLICY IF EXISTS gerente_updates_child_store_data ON public.quick_replies;
  CREATE POLICY gerente_updates_child_store_data ON public.quick_replies
    FOR UPDATE TO authenticated
    USING      (tenant_id IN (SELECT public.gerente_child_store_ids()))
    WITH CHECK (tenant_id IN (SELECT public.gerente_child_store_ids()));

  DROP POLICY IF EXISTS gerente_deletes_child_store_data ON public.quick_replies;
  CREATE POLICY gerente_deletes_child_store_data ON public.quick_replies
    FOR DELETE TO authenticated
    USING (tenant_id IN (SELECT public.gerente_child_store_ids()));

  -- Conferencia: as 3 policies novas + a de leitura, todas no lugar.
  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'quick_replies'
         AND policyname IN ('gerente_reads_child_store_data',
                            'gerente_inserts_child_store_data',
                            'gerente_updates_child_store_data',
                            'gerente_deletes_child_store_data')) <> 4 THEN
    RAISE EXCEPTION 'ABORTADO: conferencia final falhou; esperava 4 policies gerente_* em quick_replies.';
  END IF;

  INSERT INTO supabase_migrations.schema_migrations (version, name)
  VALUES ('20260917000001', 'rls_gerente_writes_child_store_quick_replies')
  ON CONFLICT (version) DO NOTHING;

  RAISE NOTICE 'quick_replies: escrita (INSERT+UPDATE+DELETE) do gerente liberada nas Lojas filhas.';
END
$mig$;
