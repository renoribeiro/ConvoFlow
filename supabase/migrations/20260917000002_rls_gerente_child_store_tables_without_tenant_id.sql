-- =============================================================================
-- 20260917000002_rls_gerente_child_store_tables_without_tenant_id
--
-- O QUE MUDA
--   Um GERENTE passa a alcancar, nas Lojas filhas da Conta dele, as tabelas
--   que NAO tem `tenant_id` e se ligam a Loja por uma tabela-mae:
--
--     contact_tags            -> contacts.tenant_id          SELECT+INSERT+DELETE
--     campaign_messages       -> mass_message_campaigns      SELECT
--     campaign_dispatch_queue -> mass_message_campaigns      SELECT
--     webhook_logs            -> whatsapp_instances          SELECT
--
-- O DEFEITO
--   Medido em 2026-09-17 como a Camila (gerente, dentro da Loja EncaixaRH):
--   "Erro ao atualizar etiquetas do lead" ao aplicar uma etiqueta num
--   contato. A 20260909000001 liberou a leitura do gerente em 35 tabelas e a
--   20260909000004 a escrita em 4 - mas as duas partiram da lista de tabelas
--   COM `tenant_id`. `contact_tags` nao tem a coluna: a policy dela passa por
--   `contacts` e compara com `get_current_user_tenant_id()`, que para a Camila
--   e a CONTA. O contato e da LOJA -> EXISTS falso -> nem le, nem grava.
--
--   A varredura (pg_policies x information_schema.columns) achou as outras
--   tres na mesma situacao. Nelas o sintoma e tela vazia, nao erro: o gerente
--   abre o detalhe de uma campanha da Loja e nao ve os envios; abre os logs
--   de webhook de um numero da Loja e nao ve nada. `follow_up_steps` tambem
--   apareceu, mas pende de `follow_up_sequences`, tabela MORTA (ver rodape da
--   20260909000001) - fica de fora.
--
-- FORMA DA POLICY
--   Mesmo formato da policy propria de cada tabela (EXISTS na tabela-mae),
--   trocando `= get_current_user_tenant_id()` por
--   `IN (SELECT gerente_child_store_ids())`. O EXISTS e correlacionado por
--   natureza (e assim que a policy original ja funciona); a subconsulta do
--   helper dentro dele continua NAO correlacionada e vira InitPlan.
--
-- ESCOPO
--   Escrita SO em contact_tags, e so INSERT e DELETE: e o que o modal
--   "Etiquetar lead" faz (delta: insere as marcadas, apaga as desmarcadas).
--   Tirar uma etiqueta de um lead nao e apagar historico. As outras tres
--   ficam somente leitura - quem escreve nelas e o worker (service_role).
--
-- Aplicacao: este arquivo inteiro no SQL Editor (ou pelo MCP). Bloco DO unico.
-- NAO rodar `supabase db push` neste projeto.
-- =============================================================================

DO $mig$
DECLARE
  v_missing text[];
BEGIN
  IF to_regprocedure('public.gerente_child_store_ids()') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: public.gerente_child_store_ids() nao existe. Rode a 20260909000001 antes.';
  END IF;

  -- Guarda: as tabelas-mae precisam estar liberadas para leitura do gerente;
  -- senao o EXISTS nunca acha a linha e a policy nova e letra morta.
  SELECT array_agg(t ORDER BY t) INTO v_missing
    FROM unnest(ARRAY['contacts','mass_message_campaigns','whatsapp_instances']) AS t
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
        AND policyname = 'gerente_reads_child_store_data');
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'ABORTADO: falta gerente_reads_child_store_data em %. Rode a 20260909000001 antes.', v_missing;
  END IF;

  -- ---- contact_tags: ler, adicionar, remover ----
  DROP POLICY IF EXISTS gerente_reads_child_store_data ON public.contact_tags;
  CREATE POLICY gerente_reads_child_store_data ON public.contact_tags
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.contacts c
                    WHERE c.id = contact_tags.contact_id
                      AND c.tenant_id IN (SELECT public.gerente_child_store_ids())));

  DROP POLICY IF EXISTS gerente_inserts_child_store_data ON public.contact_tags;
  CREATE POLICY gerente_inserts_child_store_data ON public.contact_tags
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.contacts c
                         WHERE c.id = contact_tags.contact_id
                           AND c.tenant_id IN (SELECT public.gerente_child_store_ids())));

  DROP POLICY IF EXISTS gerente_deletes_child_store_data ON public.contact_tags;
  CREATE POLICY gerente_deletes_child_store_data ON public.contact_tags
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.contacts c
                    WHERE c.id = contact_tags.contact_id
                      AND c.tenant_id IN (SELECT public.gerente_child_store_ids())));

  -- ---- campaign_messages / campaign_dispatch_queue: so leitura ----
  DROP POLICY IF EXISTS gerente_reads_child_store_data ON public.campaign_messages;
  CREATE POLICY gerente_reads_child_store_data ON public.campaign_messages
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.mass_message_campaigns mc
                    WHERE mc.id = campaign_messages.campaign_id
                      AND mc.tenant_id IN (SELECT public.gerente_child_store_ids())));

  DROP POLICY IF EXISTS gerente_reads_child_store_data ON public.campaign_dispatch_queue;
  CREATE POLICY gerente_reads_child_store_data ON public.campaign_dispatch_queue
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.mass_message_campaigns mc
                    WHERE mc.id = campaign_dispatch_queue.campaign_id
                      AND mc.tenant_id IN (SELECT public.gerente_child_store_ids())));

  -- ---- webhook_logs: so leitura ----
  DROP POLICY IF EXISTS gerente_reads_child_store_data ON public.webhook_logs;
  CREATE POLICY gerente_reads_child_store_data ON public.webhook_logs
    FOR SELECT TO authenticated
    USING (webhook_logs.whatsapp_instance_id IS NOT NULL
           AND EXISTS (SELECT 1 FROM public.whatsapp_instances wi
                        WHERE wi.id = webhook_logs.whatsapp_instance_id
                          AND wi.tenant_id IN (SELECT public.gerente_child_store_ids())));

  -- Conferencia: 6 policies novas no lugar.
  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname = 'public'
         AND policyname LIKE 'gerente\_%\_child\_store\_data' ESCAPE '\'
         AND ((tablename = 'contact_tags' AND cmd IN ('SELECT','INSERT','DELETE'))
           OR (tablename IN ('campaign_messages','campaign_dispatch_queue','webhook_logs') AND cmd = 'SELECT'))) <> 6 THEN
    RAISE EXCEPTION 'ABORTADO: conferencia final falhou; esperava 6 policies gerente_* novas.';
  END IF;

  INSERT INTO supabase_migrations.schema_migrations (version, name)
  VALUES ('20260917000002', 'rls_gerente_child_store_tables_without_tenant_id')
  ON CONFLICT (version) DO NOTHING;

  RAISE NOTICE 'gerente: contact_tags (ler/adicionar/remover) + campaign_messages, campaign_dispatch_queue, webhook_logs (ler) nas Lojas filhas.';
END
$mig$;
