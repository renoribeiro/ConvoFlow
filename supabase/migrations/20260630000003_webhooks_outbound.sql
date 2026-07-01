-- =============================================================================
-- Webhooks de saída (outbound) — config por Conta + fila de entregas + emissão
-- =============================================================================
-- Permite a uma Loja registrar URLs que recebem POSTs quando eventos acontecem
-- (message.received/sent, contact.created/updated, campaign.started/completed,
-- followup.scheduled, chatbot.triggered).
--
-- Arquitetura (segue o padrão de fila do projeto — job_queue/dequeue/complete):
--   1. `webhooks`            : config do usuário (url, eventos, secret, ativo).
--   2. `webhook_deliveries`  : fila + histórico de cada tentativa de entrega.
--   3. `emit_webhook_event()`: enfileira 1 delivery por webhook que assina o evento.
--   4. triggers AFTER INSERT/UPDATE nas tabelas de origem chamam emit().
--   A edge function `webhook-dispatcher` (cron) consome a fila e faz o POST.
--
-- SEGURANÇA / NÃO-QUEBRAR: emit_webhook_event e todos os triggers são
-- SECURITY DEFINER e EXCEPTION-SAFE (capturam qualquer erro e seguem), para
-- NUNCA bloquear o insert/update que originou o evento (mensagem, contato...).
-- =============================================================================

BEGIN;

-- =====================================================================
-- 1. webhooks (configuração por Conta)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.webhooks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  url         text NOT NULL,
  events      text[] NOT NULL DEFAULT '{}',
  secret      text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhooks_tenant        ON public.webhooks (tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_tenant_active ON public.webhooks (tenant_id) WHERE is_active;

ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "webhooks_tenant_all" ON public.webhooks;
CREATE POLICY "webhooks_tenant_all" ON public.webhooks
  FOR ALL TO authenticated
  USING (tenant_id = public.get_current_user_tenant_id())
  WITH CHECK (tenant_id = public.get_current_user_tenant_id());

DROP POLICY IF EXISTS "webhooks_superadmin_all" ON public.webhooks;
CREATE POLICY "webhooks_superadmin_all" ON public.webhooks
  FOR ALL TO authenticated
  USING (public.is_super_admin_safe())
  WITH CHECK (public.is_super_admin_safe());

-- =====================================================================
-- 2. webhook_deliveries (fila + histórico)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  webhook_id      uuid NOT NULL REFERENCES public.webhooks(id) ON DELETE CASCADE,
  event_type      text NOT NULL,
  payload         jsonb NOT NULL DEFAULT '{}',
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'processing', 'delivered', 'failed')),
  attempts        integer NOT NULL DEFAULT 0,
  max_attempts    integer NOT NULL DEFAULT 5,
  response_status integer,
  error_message   text,
  scheduled_at    timestamptz NOT NULL DEFAULT now(),
  delivered_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
-- Índice parcial p/ o dispatcher pegar os pendentes prontos rapidamente.
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending
  ON public.webhook_deliveries (scheduled_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_tenant
  ON public.webhook_deliveries (tenant_id, created_at DESC);

ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- A Conta só LÊ o histórico das próprias entregas. A ESCRITA é feita pelo
-- dispatcher (service_role, bypassa RLS) e pelo emit() (SECURITY DEFINER).
DROP POLICY IF EXISTS "webhook_deliveries_tenant_read" ON public.webhook_deliveries;
CREATE POLICY "webhook_deliveries_tenant_read" ON public.webhook_deliveries
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_user_tenant_id() OR public.is_super_admin_safe());

-- updated_at automático
CREATE OR REPLACE FUNCTION public.tg_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_webhooks_touch ON public.webhooks;
CREATE TRIGGER trg_webhooks_touch BEFORE UPDATE ON public.webhooks
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

DROP TRIGGER IF EXISTS trg_webhook_deliveries_touch ON public.webhook_deliveries;
CREATE TRIGGER trg_webhook_deliveries_touch BEFORE UPDATE ON public.webhook_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- =====================================================================
-- 3. emit_webhook_event — enfileira 1 delivery por webhook que assina o evento
-- =====================================================================
CREATE OR REPLACE FUNCTION public.emit_webhook_event(
  p_tenant_id  uuid,
  p_event_type text,
  p_payload    jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_tenant_id IS NULL OR p_event_type IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.webhook_deliveries (tenant_id, webhook_id, event_type, payload)
  SELECT w.tenant_id, w.id, p_event_type, p_payload
  FROM public.webhooks w
  WHERE w.tenant_id = p_tenant_id
    AND w.is_active = true
    AND p_event_type = ANY (w.events);
EXCEPTION WHEN OTHERS THEN
  -- Defense-in-depth: nunca propaga erro para a transação de origem.
  RETURN;
END;
$$;

-- =====================================================================
-- 4. Triggers de origem (cada um exception-safe e SECURITY DEFINER)
-- =====================================================================

-- messages → message.received / message.sent
CREATE OR REPLACE FUNCTION public.tg_webhook_messages()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event text;
BEGIN
  v_event := CASE WHEN NEW.direction = 'inbound' THEN 'message.received' ELSE 'message.sent' END;
  PERFORM public.emit_webhook_event(
    NEW.tenant_id, v_event,
    jsonb_build_object('event', v_event, 'occurred_at', now(), 'data', to_jsonb(NEW))
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_webhook_messages ON public.messages;
CREATE TRIGGER trg_webhook_messages
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_webhook_messages();

-- contacts (INSERT) → contact.created
CREATE OR REPLACE FUNCTION public.tg_webhook_contact_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.emit_webhook_event(
    NEW.tenant_id, 'contact.created',
    jsonb_build_object('event', 'contact.created', 'occurred_at', now(), 'data', to_jsonb(NEW))
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_webhook_contact_created ON public.contacts;
CREATE TRIGGER trg_webhook_contact_created
  AFTER INSERT ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.tg_webhook_contact_created();

-- contacts (UPDATE) → contact.updated (só quando a linha de fato muda)
CREATE OR REPLACE FUNCTION public.tg_webhook_contact_updated()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.emit_webhook_event(
    NEW.tenant_id, 'contact.updated',
    jsonb_build_object('event', 'contact.updated', 'occurred_at', now(),
                       'data', to_jsonb(NEW), 'previous', to_jsonb(OLD))
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_webhook_contact_updated ON public.contacts;
CREATE TRIGGER trg_webhook_contact_updated
  AFTER UPDATE ON public.contacts
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION public.tg_webhook_contact_updated();

-- mass_message_campaigns (UPDATE de status) → campaign.started / completed
CREATE OR REPLACE FUNCTION public.tg_webhook_campaign()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event text;
BEGIN
  IF NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active' THEN
    v_event := 'campaign.started';
  ELSIF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    v_event := 'campaign.completed';
  ELSE
    RETURN NEW;
  END IF;

  PERFORM public.emit_webhook_event(
    NEW.tenant_id, v_event,
    jsonb_build_object('event', v_event, 'occurred_at', now(), 'data', to_jsonb(NEW))
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_webhook_campaign ON public.mass_message_campaigns;
CREATE TRIGGER trg_webhook_campaign
  AFTER UPDATE ON public.mass_message_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.tg_webhook_campaign();

-- individual_followups (INSERT agendado) → followup.scheduled
CREATE OR REPLACE FUNCTION public.tg_webhook_followup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.mode IS DISTINCT FROM 'scheduled' THEN
    RETURN NEW;
  END IF;
  PERFORM public.emit_webhook_event(
    NEW.tenant_id, 'followup.scheduled',
    jsonb_build_object('event', 'followup.scheduled', 'occurred_at', now(), 'data', to_jsonb(NEW))
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_webhook_followup ON public.individual_followups;
CREATE TRIGGER trg_webhook_followup
  AFTER INSERT ON public.individual_followups
  FOR EACH ROW EXECUTE FUNCTION public.tg_webhook_followup();

-- chatbot_sessions (INSERT) → chatbot.triggered
CREATE OR REPLACE FUNCTION public.tg_webhook_chatbot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.emit_webhook_event(
    NEW.tenant_id, 'chatbot.triggered',
    jsonb_build_object('event', 'chatbot.triggered', 'occurred_at', now(), 'data', to_jsonb(NEW))
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_webhook_chatbot ON public.chatbot_sessions;
CREATE TRIGGER trg_webhook_chatbot
  AFTER INSERT ON public.chatbot_sessions
  FOR EACH ROW EXECUTE FUNCTION public.tg_webhook_chatbot();

COMMIT;
