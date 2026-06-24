-- Migration: liga o automation-processor ao fluxo ao vivo via triggers de banco.
--
-- Contexto: o automation-processor (Edge Function) existia mas NÃO era invocado
-- por nenhum código — os gatilhos message_received, contact_created e
-- funnel_stage_changed estavam dormentes. Em vez de disparar em cada webhook
-- (evolution/waha/meta) separadamente, usamos triggers de banco que cobrem
-- TODOS os caminhos de uma vez (webhooks, UI, importações, chatbot, automações).
--
-- Mesmo padrão de pg_net já usado em 20260615000001 / 20260605120005:
-- net.http_post com Bearer = anon key do projeto (verify_jwt aceita; o handler
-- usa service_role internamente). Se a anon key rotacionar, atualize aqui.

CREATE EXTENSION IF NOT EXISTS pg_net;

-- ---------------------------------------------------------------------------
-- Helper central: dispara um gatilho de automação (best-effort, não-fatal).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fire_automation_trigger(
  p_type text,
  p_tenant_id uuid,
  p_contact_id uuid,
  p_data jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://pqjkuwyshybxldzpfbbs.supabase.co/functions/v1/automation-processor',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxamt1d3lzaHlieGxkenBmYmJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQxMzQxMzAsImV4cCI6MjA2OTcxMDEzMH0.xeS8OdwOHpby2NHf942Z7i240LW1a5kT5oR-aH35sD0"}'::jsonb,
    body := jsonb_build_object(
      'trigger', jsonb_build_object(
        'type', p_type,
        'tenant_id', p_tenant_id,
        'contact_id', p_contact_id,
        'data', COALESCE(p_data, '{}'::jsonb)
      )
    )
  );
EXCEPTION WHEN OTHERS THEN
  -- Nunca quebrar a transação de origem (inserir mensagem, mover funil, etc).
  RAISE WARNING 'fire_automation_trigger(%, %) falhou: %', p_type, p_contact_id, SQLERRM;
END;
$$;

COMMENT ON FUNCTION public.fire_automation_trigger IS
  'Dispara o automation-processor (Edge Function) via pg_net. Usado pelos triggers de automação.';

-- ---------------------------------------------------------------------------
-- Gatilho: message_received — em toda mensagem RECEBIDA (inbound).
-- Cobre Evolution, WAHA e Meta de uma só vez (todos inserem em messages).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_automation_message_received()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.direction = 'inbound' THEN
    PERFORM public.fire_automation_trigger(
      'message_received',
      NEW.tenant_id,
      NEW.contact_id,
      jsonb_build_object('message', NEW.content, 'message_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_automation_message_received ON public.messages;
CREATE TRIGGER trg_automation_message_received
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_automation_message_received();

-- ---------------------------------------------------------------------------
-- Gatilho: contact_created — em todo contato novo.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_automation_contact_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fire_automation_trigger(
    'contact_created',
    NEW.tenant_id,
    NEW.id,
    jsonb_build_object('lead_source_id', NEW.lead_source_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_automation_contact_created ON public.contacts;
CREATE TRIGGER trg_automation_contact_created
  AFTER INSERT ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_automation_contact_created();

-- ---------------------------------------------------------------------------
-- Gatilho: funnel_stage_changed — quando current_stage_id muda de fato.
-- WHEN evita disparo em UPDATEs que não alteram o estágio (e evita loop:
-- mover para o mesmo estágio = sem mudança = sem novo disparo).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_automation_funnel_stage_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fire_automation_trigger(
    'funnel_stage_changed',
    NEW.tenant_id,
    NEW.id,
    jsonb_build_object('from_stage', OLD.current_stage_id, 'to_stage', NEW.current_stage_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_automation_funnel_stage_changed ON public.contacts;
CREATE TRIGGER trg_automation_funnel_stage_changed
  AFTER UPDATE OF current_stage_id ON public.contacts
  FOR EACH ROW
  WHEN (OLD.current_stage_id IS DISTINCT FROM NEW.current_stage_id)
  EXECUTE FUNCTION public.tg_automation_funnel_stage_changed();

-- ---------------------------------------------------------------------------
-- Hardening: estas funções SECURITY DEFINER só devem ser chamadas internamente
-- (pelos triggers). Revogar EXECUTE dos papéis de cliente fecha o aviso
-- *_security_definer_function_executable e impede chamada direta.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fire_automation_trigger(text, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_automation_message_received() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_automation_contact_created() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_automation_funnel_stage_changed() FROM PUBLIC, anon, authenticated;
