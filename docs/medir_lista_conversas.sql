-- =============================================================================
-- Custo da query da lista de Conversas — antes e depois das colunas de
-- responsável (migração 20260913000001 + front com ASSIGNMENT_COLUMNS)
-- =============================================================================
-- SOMENTE LEITURA. Mesmo método da medição de 2026-08-28 ("375 blocos para
-- devolver 20 linhas", docs/aplicar_indice_conversations.sql): blocos de
-- buffer por chamada, lidos de pg_stat_statements para a query que o
-- PostgREST monta a partir de `useConversations`.
--
-- Como a query nova pede três colunas a mais, o PostgREST gera um TEXTO
-- diferente e o pg_stat_statements guarda as duas versões em linhas
-- separadas. É isso que permite comparar ANTES e DEPOIS numa rodada só:
--
--   - `versao = 'antiga'`  → sem `assigned_profile_id` no SELECT (front velho)
--   - `versao = 'nova'`    → com `assigned_profile_id` (front novo)
--
-- O número que interessa é `blocos_por_chamada`. Nenhuma policy mudou e a
-- query continua `WHERE tenant_id = $1 AND is_archived = $2 ORDER BY
-- last_message_at DESC LIMIT 20`, então a expectativa é que as duas versões
-- fiquem na MESMA faixa (as três colunas são uuid/timestamptz na mesma linha;
-- não há join nem subconsulta nova). Uma diferença grande para cima na versão
-- nova é regressão — pare e investigue o plano (bloco 2).
--
-- Se `versao = 'nova'` não aparecer: o front novo ainda não foi publicado, ou
-- ninguém abriu a lista depois da publicação. Se `antiga` não aparecer: o
-- pg_stat_statements foi zerado depois do deploy. Nos dois casos, espere uso.
-- =============================================================================

-- 1) Blocos por chamada, por versão da query
SELECT CASE WHEN query ILIKE '%assigned_profile_id%' THEN 'nova' ELSE 'antiga' END AS versao,
       calls,
       round(mean_exec_time::numeric, 2)                                    AS ms_medio,
       round((shared_blks_hit + shared_blks_read)::numeric / GREATEST(calls, 1), 1) AS blocos_por_chamada,
       rows / GREATEST(calls, 1)                                             AS linhas_por_chamada,
       left(regexp_replace(query, '\s+', ' ', 'g'), 160)                     AS inicio_da_query
  FROM pg_stat_statements
 WHERE query ILIKE '%from "public"."conversations"%'
   AND query ILIKE '%"is_archived"%'
   AND query ILIKE '%order by%last_message_at%'
   AND query ILIKE '%limit%'
   -- A contagem das pílulas (head:true) não traz linhas — fica de fora.
   AND query NOT ILIKE '%count(%'
 ORDER BY versao, calls DESC;

-- 2) Plano da versão nova, sob RLS de um usuário real da Loja.
--    Preencha os dois valores e rode DENTRO de uma transação que termina em
--    ROLLBACK (SET LOCAL só vale até o fim dela). Precisa do papel postgres.
--
-- BEGIN;
-- SET LOCAL ROLE authenticated;
-- SELECT set_config('request.jwt.claims',
--   '{"sub":"<auth.users.id de um atendente da Loja>","role":"authenticated"}', true);
-- EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
-- SELECT id, contact_id, last_message_at, unread_count, is_archived, created_at,
--        updated_at, tenant_id,
--        last_message_content, last_message_direction, last_message_status, last_message_type,
--        assigned_profile_id, assigned_at, assigned_by
--   FROM public.conversations
--  WHERE tenant_id = '<uuid da Loja>'
--    AND is_archived = false
--  ORDER BY last_message_at DESC
--  LIMIT 20;
-- ROLLBACK;
--
-- Lê-se na última linha: "Buffers: shared hit=N". É o mesmo N de
-- `blocos_por_chamada` (o embed de contacts do PostgREST soma um pouco por
-- cima; compare sempre a mesma forma com ela mesma).
