-- Fatia 1/5 do Instagram: o modelo de dados passa a caber um segundo canal.
--
-- ============================================================================
-- O QUE ESTA MIGRAÇÃO FAZ (e o que ela deliberadamente NÃO faz)
-- ============================================================================
--
-- FAZ:
--   * contacts ganha `channel` e `external_id`, com unicidade por
--     (tenant_id, channel, external_id). `phone` deixa de ser obrigatório.
--   * conversations ganha `channel`, indexado para contagem por canal.
--   * whatsapp_instances aceita provider = 'instagram'.
--   * A resolução de contato do caminho de entrada passa a ser por
--     canal + identificador, em vez de por telefone.
--
-- NÃO FAZ: nenhuma funcionalidade de Instagram. Nenhum webhook novo, nenhum
--   envio, nenhuma tela. Depois desta migração o produto se comporta
--   exatamente como antes — é esse o critério de aceite.
--
-- ============================================================================
-- POR QUE `external_id` E NÃO SÓ `phone`
-- ============================================================================
--
-- Um usuário do Instagram não tem telefone: ele tem um IGSID (Instagram-scoped
-- ID). E a própria Meta está trocando o telefone por identificador em outros
-- pontos. Telefone como identidade tem prazo de validade.
--
-- A identidade passa a ser (tenant_id, channel, external_id). Para o WhatsApp,
-- `external_id` É o telefone — a trigger `trg_contacts_set_external_id` garante
-- isso em INSERT e em UPDATE, então os dois NUNCA divergem e nada que hoje
-- procura por telefone deixa de achar o contato.
--
-- Contatos NÃO são mesclados entre canais: quem escreve no WhatsApp e quem
-- escreve no Instagram são duas linhas de `contacts`. Nada aqui tenta casar as
-- duas, e nada aqui impede que uma fatia futura faça isso de propósito.
--
-- ============================================================================
-- O QUE ACONTECE COM AS TRÊS CHAVES ANTIGAS DE `contacts`
-- ============================================================================
--
-- Hoje existem TRÊS objetos cobrindo o mesmo terreno:
--   1. contacts_tenant_id_phone_instance_key   UNIQUE (tenant_id, phone, whatsapp_instance_id)
--   2. contacts_tenant_phone_instance_uniq     UNIQUE (…) WHERE whatsapp_instance_id IS NOT NULL
--   3. contacts_tenant_phone_no_instance_uniq  UNIQUE (tenant_id, phone) WHERE whatsapp_instance_id IS NULL
--
-- AS TRÊS FICAM. Não são derrubadas aqui, por dois motivos:
--
--   a) Elas não atrapalham o Instagram. Nas três, `phone` entra na chave e o
--      Postgres trata NULL como distinto (NULLS DISTINCT, o padrão). Contato de
--      Instagram tem phone NULL, então nenhuma das três dispara para ele.
--
--   b) Elas são a rede de segurança da invariante nova. Se a trigger que
--      mantém external_id = phone falhar algum dia, são elas que continuam
--      impedindo dois contatos de WhatsApp com o mesmo telefone na mesma Conta.
--      Derrubar três restrições vivas do caminho quente para ganhar três
--      escritas de índice em uma tabela de 177 linhas é troca ruim.
--
-- Elas passam a ser REDUNDANTES para o WhatsApp (a chave nova é mais estrita:
-- proíbe o mesmo telefone em duas instâncias da mesma Conta, o que as antigas
-- permitiam). Isso NÃO muda comportamento, porque o código nunca usou essa
-- folga: `process_incoming_message` sempre resolveu o contato por
-- (tenant_id, phone), ignorando a instância. A chave nova só escreve no banco a
-- regra que o código já seguia. Medido antes de aplicar: ZERO linhas violam a
-- chave nova (nenhum par (tenant_id, phone) repetido em 177 contatos).
--
-- Derrubar as três é seguro num momento mais calmo, depois que a chave nova
-- tiver rodado em produção. Não é trabalho desta fatia.
--
-- ============================================================================
-- POR QUE O BACKFILL DESLIGA DUAS TRIGGERS
-- ============================================================================
--
-- `UPDATE contacts SET external_id = phone` dispararia:
--   * update_contacts_updated_at  (BEFORE UPDATE) → carimbaria `updated_at`
--     de TODOS os 177 contatos com a data de hoje. Isso é visível: a tela de
--     Contatos e qualquer ordenação por "atualizado em" mudariam de cara.
--   * trg_webhook_contact_updated (AFTER UPDATE)  → enfileiraria um evento de
--     webhook por linha. Hoje só existe 1 webhook ativo e ele assina apenas
--     'contact.created', então nada sairia — mas depender disso é sorte, não
--     projeto.
--
-- As duas são desligadas e religadas DENTRO do mesmo bloco DO. Como o bloco é
-- um comando só, um erro no meio desfaz inclusive o desligamento. A conferência
-- no fim do bloco aborta se qualquer uma não voltar habilitada.
--
-- As outras triggers de `contacts` não entram na conta: trg_automation_contact_created
-- e trg_webhook_contact_created são AFTER INSERT, e trg_automation_funnel_stage_changed
-- é AFTER UPDATE OF current_stage_id. Nenhuma dispara num UPDATE de external_id.
--
-- ============================================================================
-- ATOMICIDADE
-- ============================================================================
--
-- Tudo o que é perigoso — guardas, DDL, backfill, religar trigger e conferência
-- — mora num único bloco DO. No SQL Editor do Supabase, BEGIN/COMMIT não
-- garante atomicidade (ver docs/remover_lojas_orfas.sql); um bloco DO garante,
-- porque é um comando só. Nada de tabela temporária, nada de estado de sessão.
--
-- Idempotente: rodar de novo não faz nada e não falha.
--
-- Aplicada em produção em 2026-09-22.

-- ---------------------------------------------------------------------------
-- 1. Esquema + backfill, tudo em um comando só
-- ---------------------------------------------------------------------------
DO $mig$
DECLARE
  v_contacts_antes      bigint;
  v_conversations_antes bigint;
  v_messages_antes      bigint;
  v_dups                bigint;
  v_orfaos              bigint;
  v_trg_off             bigint;
BEGIN
  SELECT count(*) INTO v_contacts_antes      FROM public.contacts;
  SELECT count(*) INTO v_conversations_antes FROM public.conversations;
  SELECT count(*) INTO v_messages_antes      FROM public.messages;

  -- -------------------------------------------------------------------------
  -- GUARDA 1: a chave nova é mais estrita que a antiga. Se hoje existir o mesmo
  -- telefone duas vezes na mesma Conta (permitido pelas chaves antigas quando
  -- as instâncias diferem), o backfill produziria uma violação. Aborta ANTES de
  -- escrever qualquer coisa, dizendo quantos pares estão duplicados.
  -- -------------------------------------------------------------------------
  SELECT count(*) INTO v_dups FROM (
    SELECT tenant_id, phone
      FROM public.contacts
     WHERE phone IS NOT NULL
     GROUP BY tenant_id, phone
    HAVING count(*) > 1
  ) d;

  IF v_dups > 0 THEN
    RAISE EXCEPTION
      'ABORTADO: % par(es) (tenant_id, phone) duplicado(s) em contacts. A chave nova (tenant_id, channel, external_id) não aceita isso. Resolva os duplicados antes de aplicar. Nada foi alterado.',
      v_dups;
  END IF;

  -- -------------------------------------------------------------------------
  -- contacts.channel — DEFAULT constante, então o Postgres não reescreve a
  -- tabela e NENHUMA trigger de linha dispara. As 177 linhas existentes passam
  -- a valer 'whatsapp' sem um único UPDATE.
  -- -------------------------------------------------------------------------
  ALTER TABLE public.contacts
    ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'whatsapp';

  ALTER TABLE public.contacts
    ADD COLUMN IF NOT EXISTS external_id text;

  -- -------------------------------------------------------------------------
  -- Backfill de external_id. É o único passo que precisa de UPDATE, porque o
  -- valor vem de outra coluna. Daí o desligamento das duas triggers.
  -- -------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM public.contacts WHERE external_id IS NULL) THEN
    ALTER TABLE public.contacts DISABLE TRIGGER update_contacts_updated_at;
    ALTER TABLE public.contacts DISABLE TRIGGER trg_webhook_contact_updated;

    UPDATE public.contacts
       SET external_id = phone
     WHERE external_id IS NULL;

    ALTER TABLE public.contacts ENABLE TRIGGER update_contacts_updated_at;
    ALTER TABLE public.contacts ENABLE TRIGGER trg_webhook_contact_updated;
  END IF;

  -- -------------------------------------------------------------------------
  -- GUARDA 2: nenhum contato pode sair daqui sem identificador. Se sobrou algum
  -- NULL, o SET NOT NULL abaixo falharia com mensagem críptica — esta guarda
  -- falha com mensagem legível e desfaz tudo.
  -- -------------------------------------------------------------------------
  SELECT count(*) INTO v_orfaos FROM public.contacts WHERE external_id IS NULL;
  IF v_orfaos > 0 THEN
    RAISE EXCEPTION
      'ABORTADO: % contato(s) ficaram sem external_id depois do backfill. Nada foi alterado.',
      v_orfaos;
  END IF;

  ALTER TABLE public.contacts ALTER COLUMN external_id SET NOT NULL;

  -- Telefone deixa de ser obrigatório. É o que permite um contato de Instagram.
  ALTER TABLE public.contacts ALTER COLUMN phone DROP NOT NULL;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'contacts_channel_check' AND conrelid = 'public.contacts'::regclass
  ) THEN
    ALTER TABLE public.contacts
      ADD CONSTRAINT contacts_channel_check
      CHECK (channel = ANY (ARRAY['whatsapp'::text, 'instagram'::text]));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'contacts_tenant_channel_external_key' AND conrelid = 'public.contacts'::regclass
  ) THEN
    ALTER TABLE public.contacts
      ADD CONSTRAINT contacts_tenant_channel_external_key
      UNIQUE (tenant_id, channel, external_id);
  END IF;

  -- -------------------------------------------------------------------------
  -- conversations.channel — mesmo truque do DEFAULT constante: sem UPDATE, sem
  -- trigger, sem reescrita. Toda conversa que existe hoje é de WhatsApp.
  -- -------------------------------------------------------------------------
  ALTER TABLE public.conversations
    ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'whatsapp';

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'conversations_channel_check' AND conrelid = 'public.conversations'::regclass
  ) THEN
    ALTER TABLE public.conversations
      ADD CONSTRAINT conversations_channel_check
      CHECK (channel = ANY (ARRAY['whatsapp'::text, 'instagram'::text]));
  END IF;

  -- O índice existe para a CONTAGEM por canal (a chavinha da tela de Conversas
  -- mostra quantas esperam no outro canal). Repete o formato do
  -- idx_conversations_tenant_archived_last_message, com o canal no meio, então
  -- serve tanto a lista de um canal quanto o selo do outro.
  CREATE INDEX IF NOT EXISTS idx_conversations_tenant_channel_archived_last_message
    ON public.conversations (tenant_id, channel, is_archived, last_message_at DESC);

  -- -------------------------------------------------------------------------
  -- whatsapp_instances aceita o provedor novo. NENHUMA instância de Instagram é
  -- criada aqui — isto só abre a porta para a fatia 2.
  -- -------------------------------------------------------------------------
  ALTER TABLE public.whatsapp_instances DROP CONSTRAINT IF EXISTS whatsapp_instances_provider_check;
  ALTER TABLE public.whatsapp_instances
    ADD CONSTRAINT whatsapp_instances_provider_check
    CHECK (provider = ANY (ARRAY['evolution'::text, 'waha'::text, 'official'::text, 'instagram'::text]));

  -- -------------------------------------------------------------------------
  -- CONFERÊNCIA — qualquer uma que falhe desfaz a migração inteira.
  -- -------------------------------------------------------------------------
  IF (SELECT count(*) FROM public.contacts) <> v_contacts_antes THEN
    RAISE EXCEPTION 'ABORTADO: a contagem de contacts mudou (% -> %).',
      v_contacts_antes, (SELECT count(*) FROM public.contacts);
  END IF;
  IF (SELECT count(*) FROM public.conversations) <> v_conversations_antes THEN
    RAISE EXCEPTION 'ABORTADO: a contagem de conversations mudou (% -> %).',
      v_conversations_antes, (SELECT count(*) FROM public.conversations);
  END IF;
  IF (SELECT count(*) FROM public.messages) <> v_messages_antes THEN
    RAISE EXCEPTION 'ABORTADO: a contagem de messages mudou (% -> %).',
      v_messages_antes, (SELECT count(*) FROM public.messages);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.contacts
     WHERE channel = 'whatsapp' AND external_id IS DISTINCT FROM phone
  ) THEN
    RAISE EXCEPTION 'ABORTADO: existe contato de WhatsApp com external_id diferente de phone.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.contacts WHERE channel <> 'whatsapp') THEN
    RAISE EXCEPTION 'ABORTADO: apareceu contato fora do canal whatsapp. Esta fatia não cria nenhum.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.conversations WHERE channel <> 'whatsapp') THEN
    RAISE EXCEPTION 'ABORTADO: apareceu conversa fora do canal whatsapp. Esta fatia não cria nenhuma.';
  END IF;

  -- As duas triggers têm que ter voltado. 'O' = habilitada (origin).
  SELECT count(*) INTO v_trg_off
    FROM pg_trigger
   WHERE tgrelid = 'public.contacts'::regclass
     AND tgname IN ('update_contacts_updated_at', 'trg_webhook_contact_updated')
     AND tgenabled <> 'O';
  IF v_trg_off > 0 THEN
    RAISE EXCEPTION 'ABORTADO: % trigger(s) de contacts ficaram desabilitadas.', v_trg_off;
  END IF;

  RAISE NOTICE 'OK: % contatos, % conversas, % mensagens — todos em channel=whatsapp, external_id = phone.',
    v_contacts_antes, v_conversations_antes, v_messages_antes;
END
$mig$;

COMMENT ON COLUMN public.contacts.channel IS
  'Canal do endereço deste contato: whatsapp | instagram. Contatos NÃO são mesclados entre canais — a mesma pessoa em dois canais são duas linhas, de propósito.';
COMMENT ON COLUMN public.contacts.external_id IS
  'Identificador do contato DENTRO do canal. WhatsApp: é o telefone (a trigger trg_contacts_set_external_id mantém igual a phone, sempre). Instagram: é o IGSID. Identidade = (tenant_id, channel, external_id).';
COMMENT ON COLUMN public.conversations.channel IS
  'Canal da conversa, derivado do contato pela trigger trg_conversations_set_channel. Indexado para a contagem por canal da tela de Conversas.';

-- ---------------------------------------------------------------------------
-- 2. A invariante do WhatsApp: external_id É o telefone, sempre
-- ---------------------------------------------------------------------------
--
-- Sem isto, qualquer caminho que insere contato sem passar pela RPC (o
-- evolution-webhook insere direto, a tela de Nova Conversa insere direto, a
-- importação de CSV insere direto) criaria contato sem external_id — e a RPC
-- de entrada, que agora procura por external_id, não acharia, criando um
-- contato duplicado a cada mensagem. A trigger é o que torna a coluna nova
-- verdadeira para TODOS os caminhos de escrita, não só para os que eu editei.
--
-- A regra para WhatsApp é a de hoje, escrita por extenso: contato de WhatsApp
-- precisa de telefone. Hoje isso vinha do NOT NULL da coluna; como o NOT NULL
-- saiu (por causa do Instagram), a regra passa a morar aqui. Mesmo ERRCODE
-- (23502) para quem já tratava a violação.
CREATE OR REPLACE FUNCTION public.tg_contacts_set_external_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.channel = 'whatsapp' THEN
    IF NEW.phone IS NULL THEN
      RAISE EXCEPTION 'contato de WhatsApp exige phone (tenant %)', NEW.tenant_id
        USING ERRCODE = '23502';
    END IF;
    -- Atribuição, não COALESCE: os dois nunca podem divergir, senão quem procura
    -- por telefone e quem procura por external_id acham contatos diferentes.
    NEW.external_id := NEW.phone;
  ELSE
    IF NEW.external_id IS NULL THEN
      RAISE EXCEPTION 'contato do canal % exige external_id (tenant %)', NEW.channel, NEW.tenant_id
        USING ERRCODE = '23502';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.tg_contacts_set_external_id() IS
  'BEFORE INSERT OR UPDATE em contacts: para channel=whatsapp força external_id = phone (e exige phone, como o NOT NULL fazia antes); para os demais canais exige external_id.';

DROP TRIGGER IF EXISTS trg_contacts_set_external_id ON public.contacts;
CREATE TRIGGER trg_contacts_set_external_id
  BEFORE INSERT OR UPDATE ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_contacts_set_external_id();

-- ---------------------------------------------------------------------------
-- 3. O canal da conversa vem do contato, em todo caminho de criação
-- ---------------------------------------------------------------------------
--
-- Existem pelo menos três caminhos que criam conversa: handle_message_conversation
-- (BEFORE INSERT em messages), update_conversation_on_message (AFTER INSERT em
-- messages, via ON CONFLICT) e o front (useConversations). Uma trigger em
-- `conversations` pega os três de uma vez, e não obriga a mexer nas duas funções
-- SECURITY DEFINER do caminho quente de entrada.
--
-- Está no caminho de entrada de mensagem: se ela levantar exceção, o INSERT da
-- mensagem é desfeito e a mensagem do cliente some sem rastro (o webhook
-- descarta o erro). Por isso ela nunca levanta — no pior caso cai no valor que
-- já viria, que é 'whatsapp'.
CREATE OR REPLACE FUNCTION public.tg_conversations_set_channel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  NEW.channel := COALESCE(
    (SELECT ct.channel FROM public.contacts ct WHERE ct.id = NEW.contact_id),
    NEW.channel,
    'whatsapp'
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  NEW.channel := COALESCE(NEW.channel, 'whatsapp');
  RAISE WARNING 'tg_conversations_set_channel(contato %) falhou: % [%]',
    NEW.contact_id, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.tg_conversations_set_channel() IS
  'BEFORE INSERT em conversations: o canal da conversa é o canal do contato. Exception-safe: nunca desfaz o INSERT da mensagem que criou a conversa.';

DROP TRIGGER IF EXISTS trg_conversations_set_channel ON public.conversations;
CREATE TRIGGER trg_conversations_set_channel
  BEFORE INSERT ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_conversations_set_channel();

-- ---------------------------------------------------------------------------
-- 4. Resolução de contato por canal + identificador
-- ---------------------------------------------------------------------------
--
-- É o miolo que `process_incoming_message` usava inline. Extraído para poder
-- ser chamado com 'instagram' na fatia 2 sem tocar de novo na RPC do caminho
-- quente.
--
-- Equivalência com o que existia, para o WhatsApp:
--   antes:  SELECT id FROM contacts WHERE phone = p_phone AND tenant_id = v_tenant_id
--   agora:  SELECT id FROM contacts WHERE tenant_id = … AND channel = 'whatsapp'
--                                     AND external_id = p_phone
-- São o mesmo conjunto, porque external_id = phone para toda linha de WhatsApp
-- (backfill + trigger) e porque toda linha existente é channel='whatsapp'. A
-- diferença é que agora a chave única garante no máximo UMA linha; antes o
-- SELECT INTO pegava uma qualquer se houvesse duas.
CREATE OR REPLACE FUNCTION public.resolve_contact_by_channel(
  p_tenant_id     uuid,
  p_channel       text,
  p_external_id   text,
  p_phone         text,
  p_instance_id   uuid,
  p_first_message text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_contact_id uuid;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'resolve_contact_by_channel: tenant obrigatório';
  END IF;
  IF p_external_id IS NULL THEN
    RAISE EXCEPTION 'resolve_contact_by_channel: identificador obrigatório (canal %)', p_channel;
  END IF;

  SELECT id INTO v_contact_id
    FROM public.contacts
   WHERE tenant_id = p_tenant_id
     AND channel = p_channel
     AND external_id = p_external_id;

  IF v_contact_id IS NULL THEN
    INSERT INTO public.contacts (
      tenant_id, channel, external_id, phone, whatsapp_instance_id,
      first_message, last_interaction_at
    ) VALUES (
      p_tenant_id, p_channel, p_external_id, p_phone, p_instance_id,
      p_first_message, now()
    )
    RETURNING id INTO v_contact_id;
  ELSE
    UPDATE public.contacts
       SET last_interaction_at = now()
     WHERE id = v_contact_id;
  END IF;

  RETURN v_contact_id;
END;
$function$;

COMMENT ON FUNCTION public.resolve_contact_by_channel(uuid, text, text, text, uuid, text) IS
  'Acha ou cria o contato por (tenant_id, channel, external_id). Miolo compartilhado do caminho de entrada; para WhatsApp o identificador é o telefone.';

REVOKE ALL ON FUNCTION public.resolve_contact_by_channel(uuid, text, text, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_contact_by_channel(uuid, text, text, text, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. process_incoming_message — MESMA assinatura, mesmo comportamento
-- ---------------------------------------------------------------------------
--
-- A assinatura (text, text, uuid, text) NÃO muda. De propósito:
--   * acrescentar parâmetros criaria uma sobrecarga, e chamada por nome com 4
--     argumentos ficaria ambígua entre as duas — erro 42725 no caminho quente;
--   * derrubar e recriar abriria uma janela em que a função não existe e
--     obrigaria a recarregar o cache de esquema do PostgREST. Os dois webhooks
--     descartam o erro da RPC, então uma mensagem de cliente sumiria em
--     silêncio.
-- A fatia 2 chama `resolve_contact_by_channel` direto, com 'instagram'.
--
-- ⚠️ O corpo abaixo é o que está EM PRODUÇÃO hoje, copiado de
-- pg_get_functiondef, não o do arquivo 20260601000001. Os dois divergem: o
-- arquivo filtra `COALESCE(builder_version, 1) = 1` no casamento de chatbot e a
-- função viva NÃO filtra. Preservei a versão viva, byte a byte, porque o
-- critério desta fatia é "nada muda de comportamento". A divergência está
-- relatada à parte e precisa de decisão própria — não é conserto desta fatia.
--
-- A ÚNICA diferença para a função viva é o bloco "Find or create contact",
-- que virou uma chamada a resolve_contact_by_channel.
CREATE OR REPLACE FUNCTION public.process_incoming_message(
  p_phone text,
  p_message_content text,
  p_whatsapp_instance_id uuid,
  p_evolution_message_id text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_contact_id uuid;
  v_tenant_id uuid;
  v_message_id uuid;
  v_chatbot public.chatbots%ROWTYPE;
  v_response_data jsonb;
  v_job_id uuid;
BEGIN
  -- Get tenant_id from whatsapp instance
  SELECT tenant_id INTO v_tenant_id
  FROM public.whatsapp_instances
  WHERE id = p_whatsapp_instance_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'WhatsApp instance not found';
  END IF;

  -- Find or create contact — por canal + identificador. Para o WhatsApp o
  -- identificador é o próprio telefone, então o resultado é o de sempre.
  v_contact_id := public.resolve_contact_by_channel(
    v_tenant_id,
    'whatsapp',
    p_phone,
    p_phone,
    p_whatsapp_instance_id,
    p_message_content
  );

  -- Save incoming message
  INSERT INTO public.messages (
    contact_id,
    tenant_id,
    whatsapp_instance_id,
    direction,
    message_type,
    content,
    evolution_message_id,
    status
  ) VALUES (
    v_contact_id,
    v_tenant_id,
    p_whatsapp_instance_id,
    'inbound',
    'text',
    p_message_content,
    p_evolution_message_id,
    'received'
  ) RETURNING id INTO v_message_id;

  -- Find matching chatbot
  SELECT * INTO v_chatbot
  FROM public.chatbots
  WHERE tenant_id = v_tenant_id
    AND is_active = true
    AND (whatsapp_instance_id IS NULL OR whatsapp_instance_id = p_whatsapp_instance_id)
    AND (
      trigger_type = 'all' OR
      (trigger_type = 'keyword' AND p_message_content ILIKE ANY(trigger_phrases))
    )
  ORDER BY
    CASE WHEN whatsapp_instance_id = p_whatsapp_instance_id THEN 1 ELSE 2 END,
    priority DESC
  LIMIT 1;

  -- If chatbot found, enqueue response
  IF v_chatbot.id IS NOT NULL THEN
    SELECT public.enqueue_job(
      v_tenant_id,
      'chatbot_response',
      jsonb_build_object(
        'chatbotId', v_chatbot.id,
        'contactId', v_contact_id,
        'incomingMessage', p_message_content,
        'instanceName', (
          SELECT instance_key
          FROM public.whatsapp_instances
          WHERE id = p_whatsapp_instance_id
        )
      ),
      2, -- High priority for chatbot responses
      now() + (COALESCE(v_chatbot.delay_seconds, 0) * interval '1 second')
    ) INTO v_job_id;

    v_response_data := jsonb_build_object(
      'matched', true,
      'chatbot_id', v_chatbot.id,
      'chatbot_name', v_chatbot.name,
      'job_id', v_job_id
    );
  ELSE
    v_response_data := jsonb_build_object('matched', false);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'contact_id', v_contact_id,
    'message_id', v_message_id,
    'chatbot_response', v_response_data
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Ledger
-- ---------------------------------------------------------------------------
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260922000002', 'contacts_conversations_channel')
ON CONFLICT (version) DO NOTHING;

-- ===========================================================================
-- ROLLBACK
-- ===========================================================================
--
-- Devolve o banco ao estado anterior. Roda como um comando só, pelo mesmo
-- motivo da ida. Só é seguro enquanto NÃO existir nenhum contato ou conversa
-- fora do canal 'whatsapp' — a guarda no começo verifica isso e aborta se
-- houver, porque derrubar as colunas apagaria a identidade desses contatos.
--
-- DO $rollback$
-- DECLARE v_outros bigint;
-- BEGIN
--   SELECT (SELECT count(*) FROM public.contacts      WHERE channel <> 'whatsapp')
--        + (SELECT count(*) FROM public.conversations WHERE channel <> 'whatsapp')
--     INTO v_outros;
--   IF v_outros > 0 THEN
--     RAISE EXCEPTION 'ABORTADO: % linha(s) fora do canal whatsapp. Derrubar as colunas apagaria a identidade delas. Nada foi alterado.', v_outros;
--   END IF;
--
--   DROP TRIGGER IF EXISTS trg_conversations_set_channel ON public.conversations;
--   DROP TRIGGER IF EXISTS trg_contacts_set_external_id  ON public.contacts;
--   DROP FUNCTION IF EXISTS public.tg_conversations_set_channel();
--   DROP FUNCTION IF EXISTS public.tg_contacts_set_external_id();
--
--   -- process_incoming_message volta ao corpo com o contato resolvido inline.
--   -- (recriar a partir de pg_get_functiondef guardado antes da aplicação)
--
--   DROP FUNCTION IF EXISTS public.resolve_contact_by_channel(uuid, text, text, text, uuid, text);
--
--   DROP INDEX IF EXISTS public.idx_conversations_tenant_channel_archived_last_message;
--   ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_channel_check;
--   ALTER TABLE public.conversations DROP COLUMN IF EXISTS channel;
--
--   ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_tenant_channel_external_key;
--   ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_channel_check;
--   ALTER TABLE public.contacts ALTER COLUMN phone SET NOT NULL;
--   ALTER TABLE public.contacts DROP COLUMN IF EXISTS external_id;
--   ALTER TABLE public.contacts DROP COLUMN IF EXISTS channel;
--
--   ALTER TABLE public.whatsapp_instances DROP CONSTRAINT IF EXISTS whatsapp_instances_provider_check;
--   ALTER TABLE public.whatsapp_instances
--     ADD CONSTRAINT whatsapp_instances_provider_check
--     CHECK (provider = ANY (ARRAY['evolution'::text, 'waha'::text, 'official'::text]));
--
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260922000002';
-- END
-- $rollback$;
