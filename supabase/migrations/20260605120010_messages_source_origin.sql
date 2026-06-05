-- Conversations: identify the origin of each message so the Conversas tab can show whether a
-- message came from a campaign, a chatbot, a follow-up, or a human agent.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS campaign_id uuid;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_campaign_id_fk') THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_campaign_id_fk
      FOREIGN KEY (campaign_id) REFERENCES public.mass_message_campaigns(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_messages_campaign
  ON public.messages (campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_source
  ON public.messages (source) WHERE source IS NOT NULL;
