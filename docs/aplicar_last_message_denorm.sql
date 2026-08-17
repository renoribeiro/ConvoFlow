-- =============================================================================
-- ConvoFlow — desnormalizar a última mensagem na conversa (projeto pqjkuwyshybxldzpfbbs)
--
-- Rodar de uma vez no SQL Editor do Supabase. É transacional: ou entra tudo, ou
-- não entra nada. Idempotente: rodar duas vezes não quebra nada.
--
-- O que resolve: a lista de conversas fazia uma query por conversa só para
-- montar a prévia (21 idas ao servidor por página de 20, repetidas a cada 10s
-- pelo polling). Depois disto, é 1 query por página.
--
-- Equivale a:
--   supabase/migrations/20260817000001_conversations_last_message_denorm.sql
--   supabase/migrations/20260817000002_messages_contact_created_at_index.sql
--   supabase/migrations/20260817000003_update_conversation_on_message_last_message.sql
--   supabase/migrations/20260817000004_backfill_conversations_last_message.sql
--   supabase/migrations/20260817000005_sync_conversation_last_message.sql
--
-- Ordem importa: colunas → índice → trigger → backfill → trigger de sincronia (o
-- backfill usa o índice e precisa das colunas; as triggers precisam das colunas
-- para a próxima mensagem).
--
-- Pode rodar ANTES ou DEPOIS do deploy do frontend, em qualquer ordem: o front
-- detecta a ausência das colunas e mostra a lista sem prévia em vez de quebrar.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1/5 — Colunas desnormalizadas
--
-- Todas NULL-áveis de propósito: conversa sem mensagem fica com as quatro em
-- NULL, e o front continua tratando isso como "Aguardando".
-- Nenhuma política de RLS é alterada — as políticas de `conversations` valem por
-- linha (tenant_id), então colunas novas já nascem protegidas.
-- ---------------------------------------------------------------------------
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS last_message_content   text NULL,
  ADD COLUMN IF NOT EXISTS last_message_direction text NULL,
  ADD COLUMN IF NOT EXISTS last_message_status    text NULL,
  ADD COLUMN IF NOT EXISTS last_message_type      text NULL;

-- `messages.direction` carrega 'incoming' como sinônimo histórico de 'inbound'.
-- No front a união é 'inbound' | 'outbound' e todo leitor testa `!== 'inbound'`:
-- um 'incoming' guardado aqui viraria "mensagem nossa" e a conversa sumiria da
-- fila de trabalho. Esta coluna só aceita o vocabulário normalizado.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'conversations_last_message_direction_check'
      AND conrelid = 'public.conversations'::regclass
  ) THEN
    ALTER TABLE public.conversations
      ADD CONSTRAINT conversations_last_message_direction_check
      CHECK (
        last_message_direction IS NULL
        OR last_message_direction IN ('inbound', 'outbound')
      );
  END IF;
END $$;

COMMENT ON COLUMN public.conversations.last_message_content IS
  'Conteúdo da última mensagem. Escrito por update_conversation_on_message no INSERT e ressincronizado por sync_conversation_last_message quando o status muda (caso da mensagem apagada). NULL = conversa sem mensagem, ou mensagem sem texto (mídia sem legenda). Só alimenta a prévia da lista.';
COMMENT ON COLUMN public.conversations.last_message_direction IS
  'Direção da última mensagem, já normalizada para ''inbound'' | ''outbound'' (o banco aceita ''incoming'' em messages.direction; aqui não). NULL = conversa sem mensagem, e o front trata isso como "Aguardando".';
COMMENT ON COLUMN public.conversations.last_message_status IS
  'Status da última mensagem (sent/delivered/read/...). Escrito por update_conversation_on_message no INSERT e mantido em dia por sync_conversation_last_message conforme o status evolui. Alimenta o ícone de confirmação na lista.';
COMMENT ON COLUMN public.conversations.last_message_type IS
  'Tipo da última mensagem (text/image/audio/...). Define o rótulo da prévia ("📷 Imagem", "🎤 Áudio", ...).';

-- ---------------------------------------------------------------------------
-- 2/5 — Índice composto em messages
--
-- Existiam idx_messages_contact_id e idx_messages_created_at SEPARADOS: buscar
-- a última mensagem de um contato varria um e ordenava depois. O composto
-- resolve a ordenação dentro do próprio índice.
--
-- Em base pequena (é o caso) criar dentro da transação é indolor. Em base com
-- milhões de mensagens, tirar daqui e rodar CREATE INDEX CONCURRENTLY fora de
-- transação.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_messages_contact_created_at
  ON public.messages (contact_id, created_at DESC);

COMMENT ON INDEX public.idx_messages_contact_created_at IS
  'Última mensagem de um contato sem sort: (contact_id, created_at DESC). Usado pelo backfill da desnormalização e pela paginação de mensagens do chat.';

-- ---------------------------------------------------------------------------
-- 3/5 — Trigger existente passa a escrever as quatro colunas
--
-- NÃO é uma trigger nova: é a mesma update_conversation_on_message
-- (trigger_update_conversation_on_message, AFTER INSERT em messages), com
-- colunas a mais nos dois ramos do upsert. A base é a definição que estava
-- rodando em produção, obtida com pg_get_functiondef().
--
-- Preservado ao pé da letra: last_message_at, unread_count, a limpeza de
-- sla_muted_at/sla_muted_by em mensagem do cliente e updated_at.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_conversation_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO public.conversations (
    tenant_id, contact_id, whatsapp_instance_id, last_message_at, unread_count,
    last_message_content, last_message_direction, last_message_status, last_message_type
  )
  VALUES (
    NEW.tenant_id, NEW.contact_id, NEW.whatsapp_instance_id, NEW.created_at,
    CASE WHEN NEW.direction IN ('inbound','incoming') THEN 1 ELSE 0 END,
    NEW.content,
    CASE WHEN NEW.direction IN ('inbound','incoming') THEN 'inbound' ELSE 'outbound' END,
    NEW.status,
    NEW.message_type
  )
  ON CONFLICT (tenant_id, contact_id) DO UPDATE SET
    last_message_at = NEW.created_at,
    unread_count = CASE WHEN NEW.direction IN ('inbound','incoming')
                        THEN conversations.unread_count + 1
                        ELSE conversations.unread_count END,
    -- Mensagem do cliente reabre a pendência: volta a sinalizar.
    sla_muted_at = CASE WHEN NEW.direction IN ('inbound','incoming')
                        THEN NULL
                        ELSE conversations.sla_muted_at END,
    sla_muted_by = CASE WHEN NEW.direction IN ('inbound','incoming')
                        THEN NULL
                        ELSE conversations.sla_muted_by END,
    -- Prévia da lista. Acompanha last_message_at sempre: quem manda em qual
    -- mensagem "é a última" é a mesma linha que acabou de entrar, então as
    -- cinco colunas nunca divergem entre si.
    last_message_content = NEW.content,
    last_message_direction = CASE WHEN NEW.direction IN ('inbound','incoming')
                                  THEN 'inbound'
                                  ELSE 'outbound' END,
    last_message_status = NEW.status,
    last_message_type = NEW.message_type,
    updated_at = NOW();
  RETURN NEW;
END; $function$;

COMMENT ON FUNCTION public.update_conversation_on_message() IS
  'Mantém conversations.last_message_at/unread_count a cada mensagem, limpa o silenciamento de SLA (sla_muted_at/_by) quando a mensagem é do cliente (inbound) e desnormaliza a prévia da última mensagem (last_message_content/_direction/_status/_type), normalizando ''incoming'' para ''inbound''. Trigger AFTER INSERT em public.messages.';

-- ---------------------------------------------------------------------------
-- 4/5 — Backfill das conversas que já existem
--
-- A trigger só atua em mensagem nova. Sem isto, toda conversa antiga ficaria sem
-- prévia até alguém escrever de novo.
--
-- LATERAL em vez de subconsulta correlacionada: uma passada em conversations e,
-- por linha, um acesso direto ao índice criado acima.
--
-- Conversa sem NENHUMA mensagem não é tocada (o JOIN LATERAL a descarta) e fica
-- com as quatro colunas em NULL — que é o estado que o front lê como "sem
-- prévia" e mantém em "Aguardando".
--
-- `updated_at` não é mexido de propósito: backfill não é atividade da conversa.
--
-- Deve imprimir um NOTICE com a contagem de linhas atualizadas.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_linhas integer;
BEGIN
  WITH ultima AS (
    SELECT c.id AS conversation_id,
           m.content,
           m.direction,
           m.status,
           m.message_type
      FROM public.conversations c
      JOIN LATERAL (
        SELECT msg.content, msg.direction, msg.status, msg.message_type
          FROM public.messages msg
         WHERE msg.contact_id = c.contact_id
           AND msg.tenant_id  = c.tenant_id
         ORDER BY msg.created_at DESC
         LIMIT 1
      ) m ON true
  )
  UPDATE public.conversations c
     SET last_message_content   = u.content,
         last_message_direction = CASE WHEN u.direction IN ('inbound','incoming')
                                       THEN 'inbound'
                                       ELSE 'outbound' END,
         last_message_status    = u.status,
         last_message_type      = u.message_type
    FROM ultima u
   WHERE c.id = u.conversation_id;

  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  RAISE NOTICE 'Backfill da última mensagem: % conversa(s) atualizada(s).', v_linhas;
END $$;

-- ---------------------------------------------------------------------------
-- 5/5 — A última mensagem continua mudando depois de gravada
--
-- A prévia é escrita no INSERT da mensagem, mas dois campos ainda mudam depois,
-- sempre por UPDATE vindo dos webhooks:
--   1. o status caminha 'sent' → 'delivered' → 'read'. Sem isto o ✓✓ da lista
--      congelaria no valor do momento da inserção até chegar mensagem nova;
--   2. mensagem APAGADA vira status='deleted' junto com
--      content='[Mensagem apagada]', no mesmo UPDATE. Sem isto a lista
--      continuaria exibindo o texto de uma mensagem que já não existe.
-- (No chat aberto nada disso muda: ali a leitura é direto em `messages`.)
--
-- O gatilho continua sendo UPDATE OF status de propósito: a intenção é
-- sincronizar o texto QUANDO O STATUS MUDA — o caso da mensagem apagada —, não a
-- cada edição de conteúdo.
--
-- É um trigger SEPARADO, com função própria. update_conversation_on_message NÃO
-- é alterada: ela grava `last_message_at = NEW.created_at` incondicionalmente, e
-- fazê-la disparar em UPDATE rebobinaria o horário da conversa e incrementaria
-- não lidas a cada atualização de mensagem antiga.
--
-- A GUARDA — `last_message_at = NEW.created_at` — é o que impede o estrago: a
-- confirmação de entrega (ou o apagamento) de uma mensagem de três dias atrás
-- não pode sobrescrever status e texto da mensagem mais recente. A igualdade só
-- é verdadeira enquanto aquela mensagem ainda for a última da conversa.
-- ---------------------------------------------------------------------------

-- Nomes antigos, de quando esta função só sincronizava status. Só existem se uma
-- versão anterior deste passo chegou a rodar; a renomeação não pode deixar os
-- dois gatilhos escrevendo na mesma linha.
DROP TRIGGER IF EXISTS trg_sync_conversation_last_message_status ON public.messages;
DROP FUNCTION IF EXISTS public.sync_conversation_last_message_status();

CREATE OR REPLACE FUNCTION public.sync_conversation_last_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  UPDATE public.conversations
     SET last_message_status  = NEW.status,
         last_message_content = NEW.content
   WHERE tenant_id  = NEW.tenant_id
     AND contact_id = NEW.contact_id
     -- Só sincroniza se esta ainda for a última mensagem da conversa.
     AND last_message_at = NEW.created_at;
  RETURN NEW;
END; $function$;

COMMENT ON FUNCTION public.sync_conversation_last_message() IS
  'Mantém conversations.last_message_status e last_message_content em dia depois que a mensagem já entrou: o status caminha sent/delivered/read por UPDATE dos webhooks, e mensagem apagada troca status e texto no mesmo UPDATE. Só escreve quando conversations.last_message_at é igual ao created_at da mensagem atualizada, ou seja, quando ela ainda é a última. Trigger AFTER UPDATE OF status em public.messages: o texto acompanha a mudança de status, não qualquer edição de conteúdo.';

DROP TRIGGER IF EXISTS trg_sync_conversation_last_message ON public.messages;

CREATE TRIGGER trg_sync_conversation_last_message
AFTER UPDATE OF status ON public.messages
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.sync_conversation_last_message();

-- ---------------------------------------------------------------------------
-- Registra as cinco no ledger, para o histórico não ficar mais fora de
-- sincronia do que já está.
-- ---------------------------------------------------------------------------
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES
  ('20260817000001', 'conversations_last_message_denorm'),
  ('20260817000002', 'messages_contact_created_at_index'),
  ('20260817000003', 'update_conversation_on_message_last_message'),
  ('20260817000004', 'backfill_conversations_last_message'),
  ('20260817000005', 'sync_conversation_last_message')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- =============================================================================
-- VERIFICAÇÃO — rodar depois, deve devolver 6 linhas com "ok"
-- =============================================================================
-- SELECT 'colunas' AS item,
--        count(*)::text || ' de 4' AS valor,
--        CASE WHEN count(*) = 4 THEN 'ok' ELSE 'FALTA' END AS status
--   FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='conversations'
--    AND column_name IN ('last_message_content','last_message_direction',
--                        'last_message_status','last_message_type')
-- UNION ALL
-- SELECT 'check de direcao',
--        coalesce(max(conname),'-'),
--        CASE WHEN count(*)=1 THEN 'ok' ELSE 'FALTA' END
--   FROM pg_constraint
--  WHERE conname='conversations_last_message_direction_check'
--    AND conrelid='public.conversations'::regclass
-- UNION ALL
-- SELECT 'indice composto',
--        coalesce(max(indexname),'-'),
--        CASE WHEN count(*)=1 THEN 'ok' ELSE 'FALTA' END
--   FROM pg_indexes
--  WHERE schemaname='public' AND indexname='idx_messages_contact_created_at'
-- UNION ALL
-- SELECT 'trigger desnormaliza',
--        CASE WHEN pg_get_functiondef(p.oid) LIKE '%last_message_content%'
--             THEN 'contem last_message_content' ELSE 'versao antiga' END,
--        CASE WHEN pg_get_functiondef(p.oid) LIKE '%last_message_content%'
--             THEN 'ok' ELSE 'FALTA' END
--   FROM pg_proc p
--  WHERE p.proname='update_conversation_on_message' AND p.pronamespace='public'::regnamespace
-- UNION ALL
-- SELECT 'trigger de sincronia',
--        coalesce(max(t.tgname)::text,'-'),
--        CASE WHEN count(*)=1 THEN 'ok' ELSE 'FALTA' END
--   FROM pg_trigger t
--  WHERE t.tgrelid='public.messages'::regclass
--    AND t.tgname='trg_sync_conversation_last_message'
--    AND NOT t.tgisinternal
-- UNION ALL
-- SELECT 'backfill',
--        count(*) FILTER (WHERE c.last_message_direction IS NOT NULL)::text
--          || ' de ' || count(*) FILTER (WHERE EXISTS (
--               SELECT 1 FROM public.messages m
--                WHERE m.contact_id = c.contact_id AND m.tenant_id = c.tenant_id))::text
--          || ' conversas com mensagem',
--        CASE WHEN count(*) FILTER (WHERE c.last_message_direction IS NOT NULL)
--                 = count(*) FILTER (WHERE EXISTS (
--                     SELECT 1 FROM public.messages m
--                      WHERE m.contact_id = c.contact_id AND m.tenant_id = c.tenant_id))
--             THEN 'ok' ELSE 'FALTA' END
--   FROM public.conversations c;
-- =============================================================================
