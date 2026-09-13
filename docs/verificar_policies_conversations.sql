-- =============================================================================
-- Impressão digital das policies de conversations e messages
-- =============================================================================
-- SOMENTE LEITURA. Rode ANTES e DEPOIS de aplicar
-- supabase/migrations/20260913000001_conversations_assignment.sql e compare:
--
--   1) a linha `assinatura` do primeiro SELECT tem de ser IDÊNTICA nas duas
--      rodadas — é um md5 do texto completo (nome, comando, papéis, USING e
--      WITH CHECK) de todas as policies das duas tabelas, em ordem fixa;
--   2) o segundo SELECT imprime cada policy por extenso, para conferir a olho
--      e para colar no relatório.
--
-- O que se espera (estado de 2026-09-09, ver CLAUDE.md e as migrações
-- 20260831000005 / 20260909000001 / 20260909000004):
--
--   conversations — 7 policies
--     "Users can view conversations from their tenant"    SELECT
--     "Users can insert conversations for their tenant"   INSERT
--     "Users can update conversations from their tenant"  UPDATE
--     "Users can delete conversations from their tenant"  DELETE
--     gerente_reads_child_store_data                      SELECT
--     gerente_inserts_child_store_data                    INSERT
--     gerente_updates_child_store_data                    UPDATE
--   messages — 5 policies
--     "Super admins can access all messages"              ALL
--     "Users can access own tenant messages"              ALL
--     gerente_reads_child_store_data                      SELECT
--     gerente_inserts_child_store_data                    INSERT
--     gerente_updates_child_store_data                    UPDATE
--   CONJUNTO — 12
--
-- Medido em 2026-09-13, ANTES da migração: conversations 7, messages 5,
-- CONJUNTO 12, assinatura do conjunto 89dec63b7d096a5dd735b8f55bcdb3cd.
--
-- A migração 20260913000001 NÃO cria, apaga nem altera policy. Se a assinatura
-- mudar entre as duas rodadas, alguma outra coisa mexeu — pare e investigue.
-- =============================================================================

-- 1) Assinatura (uma linha por tabela + uma do conjunto)
WITH p AS (
  SELECT tablename,
         policyname,
         cmd,
         permissive,
         array_to_string(roles, ',') AS roles,
         coalesce(qual, '')          AS qual,
         coalesce(with_check, '')    AS with_check
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('conversations', 'messages')
),
por_tabela AS (
  SELECT tablename,
         count(*) AS n_policies,
         md5(string_agg(
           policyname || '|' || cmd || '|' || permissive || '|' || roles || '|' || qual || '|' || with_check,
           E'\n' ORDER BY policyname, cmd)) AS assinatura
    FROM p
   GROUP BY tablename
)
SELECT tablename, n_policies, assinatura FROM por_tabela
UNION ALL
SELECT 'CONJUNTO', sum(n_policies)::int, md5(string_agg(assinatura, '|' ORDER BY tablename))
  FROM por_tabela
ORDER BY 1;

-- 2) Texto completo, para conferir a olho e para o relatório
SELECT tablename,
       policyname,
       cmd,
       array_to_string(roles, ',') AS roles,
       qual                        AS "USING",
       with_check                  AS "WITH CHECK"
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('conversations', 'messages')
 ORDER BY tablename, policyname, cmd;
