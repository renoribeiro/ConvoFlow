-- Migration: process_incoming_message agora considera whatsapp_instance_id no lookup
--
-- Contexto: após a migration 20260529120000 (contatos per-instance), o lookup
-- antigo `WHERE phone = X AND tenant_id = Y` virou ambíguo — pode retornar o
-- contato errado quando o mesmo telefone existe em duas instâncias do mesmo
-- tenant. A função é chamada via RPC pelos webhooks (evolution, waha, meta)
-- para disparar chatbot — se pegar o contato errado, o chatbot dispara no
-- contexto errado.
--
-- Mudança: adicionar `AND whatsapp_instance_id = p_whatsapp_instance_id` no
-- SELECT do contato. Restante da função fica intacto.

CREATE OR REPLACE FUNCTION public.process_incoming_message(
  p_phone text,
  p_message_content text,
  p_whatsapp_instance_id uuid,
  p_evolution_message_id text DEFAULT NULL
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

  -- Find or create contact (escopo per-instance — alinhado com a regra de
  -- unicidade contacts_tenant_phone_instance_uniq introduzida em
  -- 20260529120000_contacts_unique_per_instance.sql).
  SELECT id INTO v_contact_id
  FROM public.contacts
  WHERE phone = p_phone
    AND tenant_id = v_tenant_id
    AND whatsapp_instance_id = p_whatsapp_instance_id;

  IF v_contact_id IS NULL THEN
    INSERT INTO public.contacts (tenant_id, phone, whatsapp_instance_id, first_message, last_interaction_at)
    VALUES (v_tenant_id, p_phone, p_whatsapp_instance_id, p_message_content, now())
    RETURNING id INTO v_contact_id;
  ELSE
    UPDATE public.contacts
    SET last_interaction_at = now()
    WHERE id = v_contact_id;
  END IF;

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
      2 -- High priority for chatbot responses
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

-- =====================================================================
-- NOTA — outro débito conhecido (NÃO BLOQUEIA ESTE PR):
--
-- Esta função INSERE uma mensagem na tabela `messages` (linhas com
-- INSERT INTO public.messages). Os webhooks evolution-webhook e
-- waha-webhook JÁ inserem a mensagem por conta própria antes de chamar
-- esta RPC, então existem registros duplicados na tabela `messages` no
-- fluxo Evolution/WAHA. O fluxo Meta usa apenas esta RPC, então pra Meta
-- a inserção aqui é a única (correta).
--
-- Resolver isso exige decisão arquitetural:
--   a) Refatorar evolution-webhook/waha-webhook pra não inserir mensagem
--      próprias e depender só desta RPC (risco médio).
--   b) Adicionar dedup via evolution_message_id dentro desta função
--      (mais simples mas só funciona quando ID é fornecido).
--   c) Quebrar a RPC em duas: uma só pra disparar chatbot (sem insert)
--      e outra que faz insert + chatbot (mais limpo arquiteturalmente).
--
-- Por ora, mantém o comportamento existente — só consertando o lookup
-- de contato pra ficar consistente com o modelo per-instance.
-- =====================================================================
