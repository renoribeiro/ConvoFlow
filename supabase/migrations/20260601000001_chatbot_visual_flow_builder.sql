-- ============================================================================
-- Chatbot Visual Flow Builder
-- Adds flow-based chatbot tables (triggers, nodes, edges, variables, sessions)
-- alongside the legacy single-response `chatbots` model.
--
-- Backward compatibility: existing chatbots are tagged builder_version = 1 and
-- continue to be processed by the legacy `process_incoming_message` RPC +
-- job-worker path. New visual-flow chatbots are builder_version = 2 and are
-- processed by the `process-chatbot-message` Edge Function. The legacy RPC is
-- patched to ignore v2 bots so a bot is never processed by both paths.
--
-- RLS mirrors the existing `chatbots` pattern exactly:
--   USING (is_super_admin())  OR  USING (tenant_id = get_current_user_tenant_id())
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.chatbot_trigger_type AS ENUM (
    'keyword', 'first_contact', 'out_of_hours', 'no_agent_reply', 'funnel_stage'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.chatbot_node_type AS ENUM (
    'start', 'send_text', 'ask_question', 'show_options', 'condition',
    'transfer_agent', 'end_flow', 'set_variable', 'update_contact', 'move_funnel'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.chatbot_session_status AS ENUM (
    'active', 'completed', 'transferred', 'abandoned'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 2. updated_at helper (idempotent)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_chatbot_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Extend `chatbots` with the builder version flag
-- ---------------------------------------------------------------------------
ALTER TABLE public.chatbots
  ADD COLUMN IF NOT EXISTS builder_version smallint NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false;

-- Existing rows are legacy single-response bots.
UPDATE public.chatbots SET builder_version = 1 WHERE builder_version IS NULL OR builder_version = 2;

-- response_message is NOT NULL on the legacy table but visual bots don't use it.
-- Relax it so visual-flow bots can be created without a single canned response.
ALTER TABLE public.chatbots ALTER COLUMN response_message DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. chatbot_triggers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chatbot_triggers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id   uuid NOT NULL REFERENCES public.chatbots(id) ON DELETE CASCADE,
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  trigger_type public.chatbot_trigger_type NOT NULL,
  trigger_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chatbot_triggers_chatbot ON public.chatbot_triggers(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_triggers_tenant  ON public.chatbot_triggers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_triggers_type    ON public.chatbot_triggers(trigger_type) WHERE is_active;

-- ---------------------------------------------------------------------------
-- 5. chatbot_nodes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chatbot_nodes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id  uuid NOT NULL REFERENCES public.chatbots(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  node_type   public.chatbot_node_type NOT NULL,
  position_x  double precision NOT NULL DEFAULT 0,
  position_y  double precision NOT NULL DEFAULT 0,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chatbot_nodes_chatbot ON public.chatbot_nodes(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_nodes_tenant  ON public.chatbot_nodes(tenant_id);
-- Exactly one start node per chatbot.
CREATE UNIQUE INDEX IF NOT EXISTS uq_chatbot_one_start
  ON public.chatbot_nodes(chatbot_id) WHERE node_type = 'start';

DROP TRIGGER IF EXISTS trg_chatbot_nodes_updated_at ON public.chatbot_nodes;
CREATE TRIGGER trg_chatbot_nodes_updated_at
  BEFORE UPDATE ON public.chatbot_nodes
  FOR EACH ROW EXECUTE FUNCTION public.set_chatbot_updated_at();

-- ---------------------------------------------------------------------------
-- 6. chatbot_edges
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chatbot_edges (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id     uuid NOT NULL REFERENCES public.chatbots(id) ON DELETE CASCADE,
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  source_node_id uuid NOT NULL REFERENCES public.chatbot_nodes(id) ON DELETE CASCADE,
  target_node_id uuid NOT NULL REFERENCES public.chatbot_nodes(id) ON DELETE CASCADE,
  source_handle  text,
  label          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chatbot_edges_chatbot ON public.chatbot_edges(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_edges_tenant  ON public.chatbot_edges(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_edges_source  ON public.chatbot_edges(source_node_id);

-- ---------------------------------------------------------------------------
-- 7. chatbot_variables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chatbot_variables (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id    uuid NOT NULL REFERENCES public.chatbots(id) ON DELETE CASCADE,
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  default_value text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chatbot_id, name)
);
CREATE INDEX IF NOT EXISTS idx_chatbot_variables_chatbot ON public.chatbot_variables(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_variables_tenant  ON public.chatbot_variables(tenant_id);

-- ---------------------------------------------------------------------------
-- 8. chatbot_sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chatbot_sessions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id           uuid NOT NULL REFERENCES public.chatbots(id) ON DELETE CASCADE,
  contact_id           uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  tenant_id            uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  whatsapp_instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  current_node_id      uuid REFERENCES public.chatbot_nodes(id) ON DELETE SET NULL,
  variables            jsonb NOT NULL DEFAULT '{}'::jsonb,
  status               public.chatbot_session_status NOT NULL DEFAULT 'active',
  awaiting_input       boolean NOT NULL DEFAULT false,
  started_at           timestamptz NOT NULL DEFAULT now(),
  ended_at             timestamptz,
  last_activity_at     timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_chatbot ON public.chatbot_sessions(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_contact ON public.chatbot_sessions(contact_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_tenant  ON public.chatbot_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_status  ON public.chatbot_sessions(status);
-- At most one active session per contact per instance.
CREATE UNIQUE INDEX IF NOT EXISTS uq_chatbot_active_session
  ON public.chatbot_sessions(contact_id, whatsapp_instance_id) WHERE status = 'active';

DROP TRIGGER IF EXISTS trg_chatbot_sessions_updated_at ON public.chatbot_sessions;
CREATE TRIGGER trg_chatbot_sessions_updated_at
  BEFORE UPDATE ON public.chatbot_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_chatbot_updated_at();

-- ---------------------------------------------------------------------------
-- 9. RLS — mirror the existing chatbots policy pattern
-- ---------------------------------------------------------------------------
ALTER TABLE public.chatbot_triggers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_nodes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_edges     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_variables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_sessions  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'chatbot_triggers', 'chatbot_nodes', 'chatbot_edges',
    'chatbot_variables', 'chatbot_sessions'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Super admins can access all %1$s" ON public.%1$s;', t);
    EXECUTE format('DROP POLICY IF EXISTS "Users can access own tenant %1$s" ON public.%1$s;', t);
    EXECUTE format(
      'CREATE POLICY "Super admins can access all %1$s" ON public.%1$s FOR ALL USING (public.is_super_admin());', t);
    EXECUTE format(
      'CREATE POLICY "Users can access own tenant %1$s" ON public.%1$s FOR ALL USING (tenant_id = public.get_current_user_tenant_id());', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 10. Patch legacy RPC to ignore visual-flow (v2) bots
-- ---------------------------------------------------------------------------
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

  -- Find or create contact
  SELECT id INTO v_contact_id
  FROM public.contacts
  WHERE phone = p_phone AND tenant_id = v_tenant_id;

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
    contact_id, tenant_id, whatsapp_instance_id, direction,
    message_type, content, evolution_message_id, status
  ) VALUES (
    v_contact_id, v_tenant_id, p_whatsapp_instance_id, 'inbound',
    'text', p_message_content, p_evolution_message_id, 'received'
  ) RETURNING id INTO v_message_id;

  -- Find matching LEGACY chatbot (builder_version = 1 only).
  -- Visual-flow bots (builder_version = 2) are handled by the
  -- process-chatbot-message Edge Function, not this path.
  SELECT * INTO v_chatbot
  FROM public.chatbots
  WHERE tenant_id = v_tenant_id
    AND is_active = true
    AND COALESCE(builder_version, 1) = 1
    AND (whatsapp_instance_id IS NULL OR whatsapp_instance_id = p_whatsapp_instance_id)
    AND (
      trigger_type = 'all' OR
      (trigger_type = 'keyword' AND p_message_content ILIKE ANY(trigger_phrases))
    )
  ORDER BY
    CASE WHEN whatsapp_instance_id = p_whatsapp_instance_id THEN 1 ELSE 2 END,
    priority DESC
  LIMIT 1;

  IF v_chatbot.id IS NOT NULL THEN
    SELECT public.enqueue_job(
      v_tenant_id,
      'chatbot_response',
      jsonb_build_object(
        'chatbotId', v_chatbot.id,
        'contactId', v_contact_id,
        'incomingMessage', p_message_content,
        'instanceName', (
          SELECT instance_key FROM public.whatsapp_instances WHERE id = p_whatsapp_instance_id
        )
      ),
      2,
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
