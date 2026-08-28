-- =============================================================================
-- ⑦ Indice composto em conversations  (preventivo)
-- =============================================================================
--
-- Par do arquivo supabase/migrations/20260828000001_idx_conversations_tenant_
-- archived_last_message.sql. Os dois precisam ficar equivalentes, inclusive no
-- INSERT do ledger.
--
-- O QUE FAZ: cria o indice que casa com o recorte exato da lista de Conversas —
--   WHERE tenant_id = $1 AND is_archived = $2 ORDER BY last_message_at DESC
--
-- O QUE **NAO** FAZ: nao muda nada hoje. Com 131 conversas o planejador vai
-- continuar escolhendo seq scan, e esta certo. Nao se assuste ao rodar o EXPLAIN
-- depois e ver "Seq Scan" — e o comportamento esperado nesse tamanho.
--
-- POR QUE ENTAO: medido em 2026-08-28, a lista le 375 blocos para devolver 20
-- linhas. A maior parte disso e a policy de RLS sendo reavaliada por linha (item
-- ④ do ranking, que e outra conversa). Mas a ORDENACAO por last_message_at, sem
-- indice que a cubra junto com os filtros, vira sort de tabela inteira quando a
-- Loja tiver dezenas de milhares de conversas — e isso acontece a cada 30 s por
-- aba aberta. Criar agora custa milissegundos; criar depois, com a tabela
-- grande, custa uma janela de manutencao.
--
-- CUSTO / TRAVA: CREATE INDEX comum pega ACCESS EXCLUSIVE, mas sao 131 linhas —
-- alguns milissegundos. Nao vale a pena usar CONCURRENTLY nesse tamanho (e
-- CONCURRENTLY nao pode rodar dentro de bloco DO nem de transacao, o que
-- quebraria o padrao transacional deste arquivo).
--
-- REVERSIVEL: DROP INDEX IF EXISTS public.idx_conversations_tenant_archived_last_message;
-- =============================================================================


-- =============================================================================
-- ANTES (somente leitura)
-- =============================================================================

SELECT indexname, pg_size_pretty(pg_relation_size(indexname::regclass)) AS tamanho
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'conversations'
ORDER BY indexname;

-- Esperado hoje: 5 indices, nenhum chamado idx_conversations_tenant_archived_last_message


-- =============================================================================
-- APLICAR — bloco DO unico (guardas + escrita + ledger + conferencia)
-- =============================================================================

DO $idx$
DECLARE
  v_tem_tabela boolean;
  v_ja_existe  boolean;
  v_criado     boolean;
BEGIN
  -- GUARDA 1 — a tabela e as colunas existem com os nomes esperados?
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='conversations' AND column_name='tenant_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='conversations' AND column_name='is_archived'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='conversations' AND column_name='last_message_at'
  ) INTO v_tem_tabela;

  IF NOT v_tem_tabela THEN
    RAISE EXCEPTION
      'ABORTADO: public.conversations nao tem as tres colunas esperadas '
      '(tenant_id, is_archived, last_message_at). Schema mudou — revise o script.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public'
      AND indexname='idx_conversations_tenant_archived_last_message'
  ) INTO v_ja_existe;

  IF v_ja_existe THEN
    RAISE NOTICE 'Indice ja existe. Nada a criar (idempotente).';
  ELSE
    CREATE INDEX idx_conversations_tenant_archived_last_message
      ON public.conversations (tenant_id, is_archived, last_message_at DESC);
    RAISE NOTICE 'Indice criado.';
  END IF;

  -- GUARDA 2 — confirmar que ele existe MESMO antes de gravar o ledger.
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public'
      AND indexname='idx_conversations_tenant_archived_last_message'
  ) INTO v_criado;

  IF NOT v_criado THEN
    RAISE EXCEPTION 'ABORTADO: o indice nao existe depois do CREATE. Nada gravado.';
  END IF;

  -- Ledger: quem roda este script no SQL Editor tambem registra o historico,
  -- para o arquivo em supabase/migrations/ e o banco nao divergirem.
  INSERT INTO supabase_migrations.schema_migrations (version, name)
  VALUES ('20260828000001', 'idx_conversations_tenant_archived_last_message')
  ON CONFLICT (version) DO NOTHING;

  RAISE NOTICE 'OK. Indice presente e ledger atualizado.';
END
$idx$;


-- =============================================================================
-- DEPOIS — conferir (somente leitura)
-- =============================================================================

SELECT 'indice' AS item,
       CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FALTA' END AS situacao
FROM pg_indexes
WHERE schemaname='public'
  AND indexname='idx_conversations_tenant_archived_last_message'
UNION ALL
SELECT 'ledger',
       CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FALTA' END
FROM supabase_migrations.schema_migrations
WHERE version = '20260828000001';

-- Os dois precisam dizer 'ok'.
--
-- NAO espere ver o indice sendo usado agora:
--
--   SELECT indexrelname, idx_scan FROM pg_stat_user_indexes
--   WHERE relname='conversations';
--
-- idx_scan vai ficar em 0 para o indice novo enquanto a tabela for pequena.
-- Isso e o correto. Ele passa a ser escolhido quando a Loja crescer.
