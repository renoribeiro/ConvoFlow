-- =============================================================================
-- 20260909000006_fix_bug_reports_child_store_clause
--
-- CONSERTA CODIGO MORTO. Nao amplia permissao nenhuma de proposito: devolve a
-- permissao que as tres policies do bucket `bug-reports` JA DIZIAM conceder e
-- nunca concederam.
--
-- O BUG
--   As tres policies (`bug_reports_tenant_select`, `_insert`, `_delete`)
--   carregam esta clausula de Loja filha:
--
--     EXISTS (SELECT 1 FROM tenants t
--              WHERE t.id::text = (storage.foldername(t.name))[1]
--                AND t.parent_tenant_id = get_current_user_tenant_id())
--
--   O argumento esta errado: `t.name` e o NOME DO TENANT, nao o caminho do
--   objeto. `storage.foldername('EncaixaRH')` devolve `{}`, entao `[1]` e NULL,
--   a comparacao e NULL e o EXISTS NUNCA casa - para ninguem, desde sempre.
--   Medido em 2026-09-09, como a Camila:
--       clausula como esta -> false      com o `name` do objeto -> true
--
--   Efeito pratico: um gerente nunca conseguiu anexar (nem ver, nem remover)
--   print de bug report de uma Loja filha.
--
-- POR QUE ALTERAR EM VEZ DE ACRESCENTAR UMA POLICY AO LADO
--   Uma policy que nunca casa e pior do que policy nenhuma: quem le o schema
--   depois assume que a permissao existe. As tres sao ALTERADAS no lugar.
--
-- O CONSERTO
--   A clausula quebrada da lugar a `public.gerente_child_store_ids()`, o mesmo
--   helper das 20260909000001/4/5 - uma fonte da verdade so para "Loja filha
--   da minha Conta", ja auditada e coberta pela suite de isolamento.
--   Nao repetimos a expressao de `foldername` com o argumento certo: repetir e
--   como o bug nasceu.
--
--   De quebra, `is_super_admin()` e `get_current_user_tenant_id()` passam a ir
--   embrulhados em `(SELECT ...)`, virando InitPlan avaliado uma vez por
--   comando em vez de uma vez por linha.
--
-- OS TRES VERBOS SAO NECESSARIOS - `BugReportButton.tsx` usa os tres:
--   INSERT  sobe o anexo em `<tenant_id>/<user_id>/<ts>-<arquivo>`
--   SELECT  gera a URL assinada do anexo (`createSignedUrl`)
--   DELETE  remove o anexo quando a gravacao da linha falha depois do upload
--           (o `remove([uploadedPath])` do tratamento de erro)
--   Por isso o DELETE entra aqui, diferente das outras migracoes deste dia,
--   onde ele foi deixado de fora de proposito: la seria permissao nova, aqui
--   e desfazer o proprio upload.
-- =============================================================================

DO $mig$
DECLARE
  v_expr    CONSTANT text :=
    $e$(bucket_id = 'bug-reports'::text) AND (
          (SELECT public.is_super_admin())
          OR ((storage.foldername(name))[1] = ((SELECT public.get_current_user_tenant_id()))::text)
          OR ((storage.foldername(name))[1] IN (SELECT s::text FROM public.gerente_child_store_ids() s))
        )$e$;
  v_pol     text;
  v_faltando text[];
  v_mortas   int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'gerente_child_store_ids'
  ) THEN
    RAISE EXCEPTION 'ABORTADO: helper gerente_child_store_ids() nao existe. Rode a 20260909000001 antes.';
  END IF;

  -- Guarda 1: as tres policies tem de existir com estes nomes.
  SELECT array_agg(x ORDER BY x) INTO v_faltando
    FROM unnest(ARRAY['bug_reports_tenant_select',
                      'bug_reports_tenant_insert',
                      'bug_reports_tenant_delete']) AS x
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_policy pol
       JOIN pg_class c ON c.oid = pol.polrelid
      WHERE c.relname = 'objects' AND pol.polname = x);
  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'ABORTADO: policies ausentes: %. Nada foi alterado.', v_faltando;
  END IF;

  -- Guarda 2: a premissa. So faz sentido consertar se a expressao MORTA ainda
  -- estiver la. Se alguem ja arrumou, este script nao tem o que fazer.
  SELECT count(*) INTO v_mortas
    FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
   WHERE c.relname = 'objects'
     AND pol.polname IN ('bug_reports_tenant_select','bug_reports_tenant_insert','bug_reports_tenant_delete')
     AND coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')
       || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') LIKE '%foldername(t.name)%';
  IF v_mortas <> 3 THEN
    RAISE EXCEPTION 'ABORTADO: esperava 3 policies com a expressao morta, achei %. Confira antes.', v_mortas;
  END IF;

  FOREACH v_pol IN ARRAY ARRAY['bug_reports_tenant_select','bug_reports_tenant_delete'] LOOP
    EXECUTE format('ALTER POLICY %I ON storage.objects USING (%s)', v_pol, v_expr);
  END LOOP;

  EXECUTE format('ALTER POLICY %I ON storage.objects WITH CHECK (%s)',
                 'bug_reports_tenant_insert', v_expr);

  -- Confere que nao sobrou nenhuma expressao morta.
  SELECT count(*) INTO v_mortas
    FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
   WHERE c.relname = 'objects'
     AND pol.polname IN ('bug_reports_tenant_select','bug_reports_tenant_insert','bug_reports_tenant_delete')
     AND coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')
       || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') LIKE '%foldername(t.name)%';
  IF v_mortas <> 0 THEN
    RAISE EXCEPTION 'ABORTADO: ainda restam % policies com a expressao morta.', v_mortas;
  END IF;

  RAISE NOTICE 'bug-reports: 3 policies corrigidas.';
END
$mig$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260909000006','fix_bug_reports_child_store_clause')
ON CONFLICT (version) DO NOTHING;
