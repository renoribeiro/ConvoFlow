-- =============================================================================
-- RECONSTRUÍDA em 2026-08-24 a partir do estado vivo do banco.
-- =============================================================================
-- Esta versão existia no ledger (`20250803074600`) sem nenhum arquivo local.
-- Extraída do catálogo do PostgreSQL em 2026-08-24. NÃO é o texto original.
--
-- -----------------------------------------------------------------------------
-- ⚠️  ESTAS DUAS FUNÇÕES ESTÃO MORTAS — ELAS QUEBRAM SE FOREM CHAMADAS
-- -----------------------------------------------------------------------------
-- São da era "company_id", anterior à multi-tenancy por `tenant_id`. Elas
-- referenciam colunas que NÃO EXISTEM MAIS. Conferido em 2026-08-24:
--
--   contacts.company_id   → não existe    chatbots.company_id → não existe
--   contacts.last_seen    → não existe    messages.type       → não existe
--
-- O PostgreSQL não valida corpo de plpgsql na criação, por isso elas continuam
-- lá sem ninguém perceber. Qualquer chamada estoura em tempo de execução.
--
-- `process_flow_step` nem corpo tem: é um placeholder vazio.
--
-- Quem faz esse trabalho hoje:
--   recepção de mensagem → `process_incoming_message` (20260529130000)
--   fluxo de chatbot     → tabelas chatbot_nodes/chatbot_edges (20260601000001)
--   fila                 → `job_queue` + `enqueue_job` (20250802131719/131928)
--
-- Estão aqui porque existem no banco e um rebuild precisa reproduzi-lo.
-- Apagar é decisão do dono do projeto, em script próprio.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_message(payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  contact_id_var UUID;
  company_id_var UUID;
  evolution_api_instance_id_var UUID;
  chatbot_id_var UUID;
  message_content TEXT;
  message_type TEXT;
  message_status TEXT;
  is_from_me BOOLEAN;
BEGIN
  evolution_api_instance_id_var := (payload->>'instance_id')::UUID;
  message_content := payload->'data'->>'body';
  message_type := payload->'data'->>'type';
  message_status := payload->'data'->>'ackName';
  is_from_me := (payload->'data'->'key'->>'fromMe')::BOOLEAN;

  IF is_from_me THEN RETURN; END IF;

  SELECT company_id INTO company_id_var FROM public.evolution_api_instances WHERE id = evolution_api_instance_id_var;

  INSERT INTO public.contacts (phone, name, company_id)
  VALUES (payload->'data'->>'remoteJid', payload->'data'->>'pushName', company_id_var)
  ON CONFLICT (phone, company_id) DO UPDATE SET last_seen = NOW()
  RETURNING id INTO contact_id_var;

  INSERT INTO public.messages (contact_id, content, type, status, evolution_api_instance_id, campaign_id)
  VALUES (contact_id_var, message_content, message_type, message_status, evolution_api_instance_id_var, NULL);

  SELECT id INTO chatbot_id_var FROM public.chatbots WHERE company_id = company_id_var AND is_active = TRUE LIMIT 1;

  IF chatbot_id_var IS NOT NULL THEN
    INSERT INTO public.jobs (company_id, type, payload)
    VALUES (company_id_var, 'process_flow', jsonb_build_object('contact_id', contact_id_var, 'chatbot_id', chatbot_id_var, 'message_content', message_content));
  END IF;

EXCEPTION
  WHEN OTHERS THEN
    INSERT INTO logs.errors (function_name, error_message, error_details)
    VALUES ('handle_new_message', SQLERRM, jsonb_build_object('payload', payload, 'state', SQLSTATE));
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_flow_step(contact_id_arg uuid, chatbot_id_arg uuid, message_content_arg text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Placeholder for chatbot flow logic
EXCEPTION
  WHEN OTHERS THEN
    INSERT INTO logs.errors (function_name, error_message, error_details)
    VALUES ('process_flow_step', SQLERRM, jsonb_build_object('contact_id', contact_id_arg, 'chatbot_id', chatbot_id_arg, 'message_content', message_content_arg, 'state', SQLSTATE));
END;
$function$;
