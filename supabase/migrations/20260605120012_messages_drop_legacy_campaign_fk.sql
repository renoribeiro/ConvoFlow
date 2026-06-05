-- Conversations fix: messages.campaign_id pre-existed with a foreign key to the legacy/orphan
-- `campaigns` table (messages_campaign_id_fkey). The campaigns upgrade added a second FK to
-- mass_message_campaigns (messages_campaign_id_fk). With both present, a real campaign message
-- id satisfied the new FK but violated the stale legacy one, so the "mirror campaign message
-- into the Conversas thread" insert failed (silently, since supabase-js doesn't throw).
-- Drop the legacy FK; campaign messages reference mass_message_campaigns via messages_campaign_id_fk.

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_campaign_id_fkey;
