-- =============================================================================
-- Desnormaliza a última mensagem na linha da conversa (5/5 — sincronia pós-INSERT)
--
-- PROBLEMA QUE ESTE ARQUIVO RESOLVE
-- A prévia desnormalizada é escrita por update_conversation_on_message, que é
-- AFTER INSERT. Só que dois campos da última mensagem ainda mudam DEPOIS que ela
-- entrou, sempre por UPDATE vindo dos webhooks (evolution-webhook, waha-webhook,
-- meta-webhook):
--
--   1. o status caminha 'sent' → 'delivered' → 'read'. Sem isto, o ✓✓ da lista
--      congelaria no valor do momento da inserção até chegar mensagem nova;
--   2. mensagem APAGADA pelo cliente vira `status='deleted'` junto com
--      `content='[Mensagem apagada]'`, no mesmo UPDATE. Sem isto, a lista
--      continuaria exibindo o texto original de uma mensagem que já não existe.
--
-- Dentro do chat aberto nada disso muda: ali a leitura é direto em `messages`.
--
-- POR QUE O GATILHO CONTINUA SENDO "UPDATE OF status"
-- A intenção é sincronizar o texto QUANDO O STATUS MUDA — que é exatamente o
-- caso da mensagem apagada —, não a cada edição de conteúdo. Disparar em
-- qualquer UPDATE de `content` alargaria o gatilho sem necessidade e faria a
-- trigger competir com escritas que não têm nada a ver com a prévia.
--
-- POR QUE UM TRIGGER SEPARADO
-- update_conversation_on_message NÃO é alterada aqui. Ela faz
-- `last_message_at = NEW.created_at` incondicionalmente — fazê-la disparar em
-- UPDATE rebobinaria o horário da conversa e incrementaria não lidas sempre que
-- uma mensagem ANTIGA fosse atualizada. Este trigger é outro, com função
-- própria, escopo mínimo: duas colunas.
--
-- A GUARDA
-- `last_message_at = NEW.created_at` é o que impede o estrago. Sem ela, a
-- confirmação de entrega (ou o apagamento) de uma mensagem de três dias atrás
-- sobrescreveria status e texto da mensagem mais recente da conversa. Como
-- update_conversation_on_message grava `last_message_at` com exatamente o
-- `created_at` da mensagem que entrou, a igualdade só é verdadeira enquanto
-- AQUELA ainda for a última.
-- Efeitos colaterais da guarda, ambos corretos:
--   * conversa com last_message_at NULL nunca casa (NULL = x é NULL), e de fato
--     não tem prévia para sincronizar;
--   * duas mensagens com created_at idêntico no microssegundo casariam juntas —
--     na prática não acontece, e o valor gravado seria o mesmo de qualquer forma.
--
-- PRIVILÉGIOS
-- Sem SECURITY DEFINER, igual a update_conversation_on_message. Os três
-- webhooks que mexem em status usam a service role (RLS não se aplica), e
-- `conversations` tem policy de UPDATE por Conta para o caso de vir de um
-- usuário autenticado. `search_path` fixo em '' com tudo qualificado, que é o
-- padrão das funções novas deste esquema.
--
-- Idempotente: CREATE OR REPLACE na função, DROP IF EXISTS + CREATE no trigger.
-- =============================================================================

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
