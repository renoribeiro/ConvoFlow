-- WhatsApp/Meta policy watcher.
-- Motivação: em 2026-06-15 uma WABA conectada pelo app foi RESTRITA por violação
-- de uso aceitável. Para "ficar de olho" nas políticas em tempo (quase) real,
-- a Edge Function `policy-watch` baixa periodicamente as URLs oficiais, calcula
-- um hash do conteúdo e registra mudanças. Quando algo muda, super_admins são
-- notificados para revisar `.agent/skills/whatsapp-policies/SKILL.md`.

CREATE EXTENSION IF NOT EXISTS pg_net;

-- ---------------------------------------------------------------------------
-- Catálogo das políticas monitoradas (1 linha por documento).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_policy_documents (
  key               TEXT PRIMARY KEY,
  label             TEXT NOT NULL,
  url               TEXT NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  last_hash         TEXT,
  last_status_code  INTEGER,
  last_checked_at   TIMESTAMPTZ,
  last_changed_at   TIMESTAMPTZ,
  last_error        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Histórico de mudanças detectadas.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_policy_change_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_key  TEXT NOT NULL REFERENCES public.whatsapp_policy_documents(key) ON DELETE CASCADE,
  old_hash      TEXT,
  new_hash      TEXT,
  http_status   INTEGER,
  excerpt       TEXT,                 -- primeiros ~500 chars do conteúdo novo
  detected_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_policy_change_log_detected_at
  ON public.whatsapp_policy_change_log(detected_at DESC);

-- ---------------------------------------------------------------------------
-- RLS: leitura só para super_admin (políticas são globais, não por tenant).
-- A Edge Function usa service_role e ignora RLS.
-- ---------------------------------------------------------------------------
ALTER TABLE public.whatsapp_policy_documents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_policy_change_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "policy_documents_super_admin_read" ON public.whatsapp_policy_documents;
CREATE POLICY "policy_documents_super_admin_read" ON public.whatsapp_policy_documents
  FOR SELECT TO authenticated
  USING (public.is_super_admin_safe());

DROP POLICY IF EXISTS "policy_change_log_super_admin_read" ON public.whatsapp_policy_change_log;
CREATE POLICY "policy_change_log_super_admin_read" ON public.whatsapp_policy_change_log
  FOR SELECT TO authenticated
  USING (public.is_super_admin_safe());

-- ---------------------------------------------------------------------------
-- Seed da watchlist (mesma lista do SKILL.md). ON CONFLICT preserva hashes.
-- ---------------------------------------------------------------------------
INSERT INTO public.whatsapp_policy_documents (key, label, url) VALUES
  ('business-terms',       'WhatsApp Business Terms of Service',              'https://www.whatsapp.com/legal/business-terms'),
  ('business-messaging',   'WhatsApp Business Messaging Policy',              'https://www.whatsapp.com/legal/business-policy/'),
  ('business-solution',    'WhatsApp Business Solution Terms',                'https://www.whatsapp.com/legal/business-solution-terms/'),
  ('messaging-guidelines', 'WhatsApp Messaging Guidelines',                   'https://www.whatsapp.com/legal/messaging-guidelines'),
  ('commerce-policy',      'WhatsApp/Meta Commerce Policy',                   'https://www.whatsapp.com/legal/commerce-policy/'),
  ('policy-enforcement',   'WhatsApp Business Platform — Policy Enforcement', 'https://developers.facebook.com/docs/whatsapp/overview/policy-enforcement'),
  ('meta-terms-business',  'Meta Terms for WhatsApp Business',                'https://www.whatsapp.com/legal/meta-terms-whatsapp-business')
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label,
      url   = EXCLUDED.url,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- Cron semanal (segunda 09:00 UTC) que dispara o watcher.
-- NOTE: troque o Bearer pelo anon key do projeto se ele rotacionar (mesmo
-- padrão de 20260605120005_campaign_cron_pgnet.sql).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM cron.unschedule('whatsapp-policy-watch-weekly');
EXCEPTION WHEN OTHERS THEN
  NULL; -- ainda não agendado
END $$;

SELECT cron.schedule(
  'whatsapp-policy-watch-weekly',
  '0 9 * * 1',
  $cron$
  SELECT net.http_post(
    url := 'https://pqjkuwyshybxldzpfbbs.supabase.co/functions/v1/policy-watch',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxamt1d3lzaHlieGxkenBmYmJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQxMzQxMzAsImV4cCI6MjA2OTcxMDEzMH0.xeS8OdwOHpby2NHf942Z7i240LW1a5kT5oR-aH35sD0"}'::jsonb,
    body := '{"trigger": "cron"}'::jsonb
  ) AS request_id;
  $cron$
);
