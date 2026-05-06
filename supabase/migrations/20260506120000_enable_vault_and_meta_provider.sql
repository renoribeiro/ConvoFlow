-- Enable Supabase Vault and add 'official' (Meta Cloud API) as a supported provider.
--
-- Strategy:
--   * 'evolution' and 'waha' credentials remain in whatsapp_instances.connection_config
--     (low-sensitivity, RLS-protected).
--   * Meta access tokens are highly sensitive (long-lived System User tokens) and
--     are stored in vault.secrets via SECURITY DEFINER RPCs that only service_role
--     can execute. A mapping table (instance_secrets) links each instance to its
--     vault secret id.

-- 1) Required extensions for Supabase Vault
CREATE EXTENSION IF NOT EXISTS pgsodium;
CREATE EXTENSION IF NOT EXISTS supabase_vault CASCADE;

-- 2) Extend the provider CHECK constraint to include 'official'
ALTER TABLE public.whatsapp_instances
  DROP CONSTRAINT IF EXISTS whatsapp_instances_provider_check;

ALTER TABLE public.whatsapp_instances
  ADD CONSTRAINT whatsapp_instances_provider_check
    CHECK (provider IN ('evolution', 'waha', 'official'));

COMMENT ON COLUMN public.whatsapp_instances.provider IS
  'WhatsApp API provider: evolution | waha | official (Meta Cloud API)';

-- 3) Mapping table: instance -> vault secret holding the Meta access token
CREATE TABLE IF NOT EXISTS public.instance_secrets (
  instance_id     UUID PRIMARY KEY REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  vault_secret_id UUID NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_instance_secrets_tenant_id
  ON public.instance_secrets(tenant_id);

ALTER TABLE public.instance_secrets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "instance_secrets_tenant_isolation" ON public.instance_secrets;
CREATE POLICY "instance_secrets_tenant_isolation"
  ON public.instance_secrets
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

-- 4) RPCs to set / get the Meta token via Vault.
--    SECURITY DEFINER + REVOKE ensure tokens can only be touched by service_role
--    (i.e. our Edge Functions running with the service-role key).

CREATE OR REPLACE FUNCTION public.set_instance_meta_token(
  p_instance_id UUID,
  p_token       TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
DECLARE
  v_secret_id UUID;
  v_tenant    UUID;
  v_existing  UUID;
BEGIN
  SELECT tenant_id INTO v_tenant
    FROM public.whatsapp_instances
    WHERE id = p_instance_id;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Instance % not found', p_instance_id;
  END IF;

  SELECT vault_secret_id INTO v_existing
    FROM public.instance_secrets
    WHERE instance_id = p_instance_id;

  IF v_existing IS NOT NULL THEN
    PERFORM vault.update_secret(v_existing, p_token);
    UPDATE public.instance_secrets
       SET updated_at = now()
       WHERE instance_id = p_instance_id;
    RETURN v_existing;
  END IF;

  v_secret_id := vault.create_secret(
    p_token,
    'meta_token_' || p_instance_id::text,
    'Meta Cloud API access token'
  );

  INSERT INTO public.instance_secrets (instance_id, tenant_id, vault_secret_id)
       VALUES (p_instance_id, v_tenant, v_secret_id);

  RETURN v_secret_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_instance_meta_token(
  p_instance_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
DECLARE
  v_secret TEXT;
BEGIN
  SELECT ds.decrypted_secret
    INTO v_secret
    FROM public.instance_secrets isec
    JOIN vault.decrypted_secrets ds ON ds.id = isec.vault_secret_id
   WHERE isec.instance_id = p_instance_id;

  RETURN v_secret;
END;
$$;

-- Lock down RPC visibility: only service_role may execute.
REVOKE ALL ON FUNCTION public.set_instance_meta_token(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_instance_meta_token(UUID)        FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.set_instance_meta_token(UUID, TEXT) TO service_role;
GRANT  EXECUTE ON FUNCTION public.get_instance_meta_token(UUID)        TO service_role;
