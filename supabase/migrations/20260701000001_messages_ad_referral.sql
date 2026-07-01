-- Conversations: store the Click-to-WhatsApp (CTWA) ad referral that Meta Cloud API
-- attaches to the FIRST inbound message when a lead reaches WhatsApp by clicking an
-- ad/post on Facebook/Instagram. Lets the Conversas tab show the operator which
-- ad/product the lead came from (headline, thumbnail, source_url) instead of a raw,
-- unaccessible tracking link.
--
-- The raw `referral` object is stored as-is (jsonb) to stay resilient to Meta adding
-- fields. Typical keys: source_url, source_id, source_type ('ad' | 'post'), headline,
-- body, media_type, image_url, video_url, thumbnail_url, ctwa_clid.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS ad_referral jsonb;

COMMENT ON COLUMN public.messages.ad_referral IS
  'CTWA ad referral (Meta Cloud API messages[].referral) on the first inbound message from a Click-to-WhatsApp ad. Null for normal messages.';

-- Partial index: cheap "which conversations came from ads" lookups without bloating
-- the index with the overwhelming majority of non-ad messages.
CREATE INDEX IF NOT EXISTS idx_messages_ad_referral
  ON public.messages ((ad_referral IS NOT NULL)) WHERE ad_referral IS NOT NULL;
