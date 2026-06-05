-- Campaign delivery/read tracking, made reliable at the DB level.
-- meta-webhook.handleStatusUpdate reliably updates messages.status from Meta ACKs (proven), but
-- its JS-side mapping onto campaign_executions wasn't taking effect. Instead, derive the campaign
-- execution status from the message status via a trigger --- single source of truth, provider-agnostic
-- (works for Evolution/WAHA/Meta, since all of them update messages.status by evolution_message_id).

-- A stricter pre-upgrade CHECK (campaign_executions_status_check) still rejected
-- delivered/read/replied, so both the webhook JS mapping and this trigger silently failed to
-- record ACK statuses. Drop it; the upgrade's campaign_exec_status_chk already covers the full set.
ALTER TABLE public.campaign_executions DROP CONSTRAINT IF EXISTS campaign_executions_status_check;

CREATE OR REPLACE FUNCTION public.sync_campaign_execution_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_exec_id uuid;
  v_exec_status text;
  v_campaign uuid;
  v_rank_new int;
  v_rank_cur int;
BEGIN
  -- Only campaign-origin messages with a provider id and a delivered/read status are relevant.
  IF NEW.evolution_message_id IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.status, '') NOT IN ('delivered', 'read') THEN RETURN NEW; END IF;
  IF NEW.source IS DISTINCT FROM 'campaign' AND NEW.campaign_id IS NULL THEN RETURN NEW; END IF;

  SELECT id, status, campaign_id INTO v_exec_id, v_exec_status, v_campaign
  FROM public.campaign_executions
  WHERE provider_message_id = NEW.evolution_message_id
  LIMIT 1;
  IF v_exec_id IS NULL THEN RETURN NEW; END IF;

  v_rank_new := CASE NEW.status WHEN 'delivered' THEN 2 WHEN 'read' THEN 3 ELSE 0 END;
  v_rank_cur := CASE v_exec_status
                  WHEN 'replied' THEN 4 WHEN 'read' THEN 3 WHEN 'delivered' THEN 2
                  WHEN 'sent' THEN 1 ELSE 0 END;
  IF v_rank_new <= v_rank_cur THEN RETURN NEW; END IF;

  UPDATE public.campaign_executions
     SET status = NEW.status,
         delivered_at = COALESCE(delivered_at, now()),
         read_at = CASE WHEN NEW.status = 'read' THEN COALESCE(read_at, now()) ELSE read_at END,
         updated_at = now()
   WHERE id = v_exec_id;

  PERFORM public.recompute_campaign_metrics(v_campaign);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_campaign_exec_status ON public.messages;
CREATE TRIGGER trg_sync_campaign_exec_status
AFTER INSERT OR UPDATE OF status ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.sync_campaign_execution_status();

-- One-time backfill: sync executions whose mirrored message already has a delivered/read status.
WITH upd AS (
  UPDATE public.campaign_executions e
     SET status = m.status,
         delivered_at = COALESCE(e.delivered_at, now()),
         read_at = CASE WHEN m.status = 'read' THEN COALESCE(e.read_at, now()) ELSE e.read_at END,
         updated_at = now()
  FROM public.messages m
  WHERE m.evolution_message_id = e.provider_message_id
    AND m.source = 'campaign'
    AND m.status IN ('delivered', 'read')
    AND (CASE m.status WHEN 'read' THEN 3 WHEN 'delivered' THEN 2 ELSE 0 END) >
        (CASE e.status WHEN 'replied' THEN 4 WHEN 'read' THEN 3 WHEN 'delivered' THEN 2 WHEN 'sent' THEN 1 ELSE 0 END)
  RETURNING e.campaign_id
)
SELECT public.recompute_campaign_metrics(campaign_id)
FROM (SELECT DISTINCT campaign_id FROM upd) d;
