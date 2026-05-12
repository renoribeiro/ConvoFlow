-- =============================================================================
-- Fase 1 — Reestruturação de gestão de usuários: schema base
-- =============================================================================
-- Estratégia revisada: usar ALTER TYPE RENAME VALUE em vez de swap de enum.
-- Isso preserva TODAS as policies e funções existentes (Postgres atualiza
-- referências internamente quando o valor é renomeado), sem precisar dropar
-- nada em cascata.
--
-- ATENÇÃO: este arquivo deve ser rodado em DUAS ETAPAS no SQL Editor:
--   ETAPA A — apenas o ALTER TYPE ADD VALUE (não pode rodar em transação)
--   ETAPA B — todo o resto (em transação BEGIN/COMMIT)
-- =============================================================================

-- =============================================================================
-- ETAPA A — Adicionar o valor novo 'account_manager' ao enum
-- =============================================================================
-- ALTER TYPE ADD VALUE não pode ser executado dentro de uma transação no
-- PostgreSQL, então roda isoladamente.

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'account_manager';


-- =============================================================================
-- ETAPA B — Resto da migration (em transação)
-- =============================================================================

BEGIN;

-- 1. Renomear valores existentes do enum para a nova nomenclatura
-- RENAME VALUE preserva todas as referências (policies, funções, dados).
ALTER TYPE public.user_role RENAME VALUE 'super_admin'  TO 'superadmin';
ALTER TYPE public.user_role RENAME VALUE 'tenant_admin' TO 'enterprise';
ALTER TYPE public.user_role RENAME VALUE 'tenant_user'  TO 'user';

-- 2. Atualizar default da coluna profiles.role
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'user'::public.user_role;

-- 3. Remover brecha de segurança (qualquer authenticated lia todos os profiles)
DROP POLICY IF EXISTS "Enable read access for all users" ON public.profiles;

-- 4. Atualizar is_super_admin() para usar o nome novo via CREATE OR REPLACE
--    (preserva todas as policies dependentes — Postgres não dropa)
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND role = 'superadmin'::public.user_role
  );
$$;

-- 5. Helpers SECURITY DEFINER STABLE para a hierarquia

CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin_safe()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND role = 'superadmin'::public.user_role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_account_manager_safe()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND role = 'account_manager'::public.user_role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_enterprise_safe()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND role = 'enterprise'::public.user_role
  );
$$;

-- 6. Permitir tenant_id NULL para superadmin / account_manager
ALTER TABLE public.profiles ALTER COLUMN tenant_id DROP NOT NULL;

-- CHECK garante que enterprise/user sempre tenham tenant_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_tenant_required_for_lower_roles'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_tenant_required_for_lower_roles
      CHECK (role IN ('superadmin','account_manager') OR tenant_id IS NOT NULL);
  END IF;
END $$;

-- 7. Adicionar novas colunas em profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS parent_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS affiliate_id  UUID REFERENCES public.affiliates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','suspended','pending','deleted')),
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS login_count   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_ip       INET;

CREATE INDEX IF NOT EXISTS profiles_parent_id_idx ON public.profiles(parent_id);
CREATE INDEX IF NOT EXISTS profiles_status_idx    ON public.profiles(status);
CREATE INDEX IF NOT EXISTS profiles_role_idx      ON public.profiles(role);

-- 8. Backfill: status reflete is_active legado
UPDATE public.profiles SET status = 'suspended' WHERE is_active = false AND status = 'active';

-- 9. Sync is_active <-> status (trigger) para retrocompatibilidade
CREATE OR REPLACE FUNCTION public.sync_profile_is_active()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.is_active := (NEW.status = 'active');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_profile_is_active_trigger ON public.profiles;
CREATE TRIGGER sync_profile_is_active_trigger
  BEFORE INSERT OR UPDATE OF status ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_is_active();

-- 10. Backfill de parent_id
--     enterprises -> superadmin mais antigo
--     users       -> enterprise mais antigo do mesmo tenant_id
WITH first_super AS (
  SELECT id FROM public.profiles
  WHERE role = 'superadmin'
  ORDER BY created_at ASC
  LIMIT 1
)
UPDATE public.profiles p
SET parent_id = (SELECT id FROM first_super)
WHERE p.role = 'enterprise' AND p.parent_id IS NULL;

UPDATE public.profiles u
SET parent_id = (
  SELECT e.id FROM public.profiles e
  WHERE e.tenant_id = u.tenant_id AND e.role = 'enterprise'
  ORDER BY e.created_at ASC
  LIMIT 1
)
WHERE u.role = 'user' AND u.parent_id IS NULL AND u.tenant_id IS NOT NULL;

-- 11. Reescrever handle_new_user para ler do invite metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role          public.user_role;
  v_tenant_id     UUID;
  v_parent_id     UUID;
  v_affiliate_id  UUID;
  v_status        TEXT;
  v_first_name    TEXT;
  v_last_name     TEXT;
  v_phone         TEXT;
  v_email         TEXT := NEW.email;
  v_full_name     TEXT;
  v_aff_code      TEXT;
BEGIN
  v_first_name := NEW.raw_user_meta_data ->> 'first_name';
  v_last_name  := NEW.raw_user_meta_data ->> 'last_name';
  v_phone      := NEW.raw_user_meta_data ->> 'phone';
  v_status     := COALESCE(NEW.raw_user_meta_data ->> 'status', 'pending');

  v_role := COALESCE(
    (NEW.raw_user_meta_data ->> 'role')::public.user_role,
    'user'::public.user_role
  );
  v_tenant_id    := NULLIF(NEW.raw_user_meta_data ->> 'tenant_id', '')::UUID;
  v_parent_id    := NULLIF(NEW.raw_user_meta_data ->> 'parent_id', '')::UUID;
  v_affiliate_id := NULLIF(NEW.raw_user_meta_data ->> 'affiliate_id', '')::UUID;

  -- enterprise/user precisam de tenant_id
  IF v_role IN ('enterprise','user') AND v_tenant_id IS NULL THEN
    RAISE EXCEPTION
      'tenant_id é obrigatório no raw_user_meta_data para role %', v_role;
  END IF;

  -- Auto-criar affiliate para account_manager sem affiliate_id no metadata
  IF v_role = 'account_manager' AND v_affiliate_id IS NULL THEN
    v_full_name := NULLIF(TRIM(CONCAT_WS(' ', v_first_name, v_last_name)), '');
    v_aff_code  := 'AM-' ||
      UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', '') FROM 1 FOR 8));

    INSERT INTO public.affiliates (email, name, affiliate_code)
    VALUES (v_email, COALESCE(v_full_name, v_email), v_aff_code)
    RETURNING id INTO v_affiliate_id;
  END IF;

  INSERT INTO public.profiles (
    user_id, tenant_id, role, first_name, last_name, phone,
    parent_id, affiliate_id, status
  ) VALUES (
    NEW.id, v_tenant_id, v_role, v_first_name, v_last_name, v_phone,
    v_parent_id, v_affiliate_id, v_status
  );

  RETURN NEW;
END;
$$;

-- 12. Criar tabela usage_limits + seed
CREATE TABLE IF NOT EXISTS public.usage_limits (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role        public.user_role NOT NULL,
  limit_name  TEXT NOT NULL,
  limit_value JSONB NOT NULL DEFAULT '{"limit": null}'::jsonb,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (role, limit_name)
);

ALTER TABLE public.usage_limits ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_usage_limits_updated_at ON public.usage_limits;
CREATE TRIGGER update_usage_limits_updated_at
  BEFORE UPDATE ON public.usage_limits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.usage_limits (role, limit_name, description) VALUES
  ('superadmin',      'whatsapp_numbers', 'Limite de números WhatsApp conectados'),
  ('superadmin',      'monthly_messages', 'Limite mensal de mensagens enviadas'),
  ('superadmin',      'chatbots',         'Limite de chatbots ativos'),
  ('superadmin',      'team_members',     'Limite de usuários na equipe'),
  ('account_manager', 'whatsapp_numbers', 'Limite de números WhatsApp conectados'),
  ('account_manager', 'monthly_messages', 'Limite mensal de mensagens enviadas'),
  ('account_manager', 'chatbots',         'Limite de chatbots ativos'),
  ('account_manager', 'team_members',     'Limite de usuários na equipe'),
  ('enterprise',      'whatsapp_numbers', 'Limite de números WhatsApp conectados'),
  ('enterprise',      'monthly_messages', 'Limite mensal de mensagens enviadas'),
  ('enterprise',      'chatbots',         'Limite de chatbots ativos'),
  ('enterprise',      'team_members',     'Limite de usuários na equipe'),
  ('user',            'whatsapp_numbers', 'Limite de números WhatsApp conectados'),
  ('user',            'monthly_messages', 'Limite mensal de mensagens enviadas'),
  ('user',            'chatbots',         'Limite de chatbots ativos'),
  ('user',            'team_members',     'Limite de usuários na equipe')
ON CONFLICT (role, limit_name) DO NOTHING;

-- 13. Criar tabela user_activity_log + trigger
CREATE TABLE IF NOT EXISTS public.user_activity_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,
  ip          INET,
  user_agent  TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_activity_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS user_activity_log_profile_created_idx
  ON public.user_activity_log(profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_activity_log_event_type_idx
  ON public.user_activity_log(event_type);

CREATE OR REPLACE FUNCTION public.update_profile_login_metrics()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.event_type = 'login' THEN
    UPDATE public.profiles
    SET last_login_at = NEW.created_at,
        login_count   = login_count + 1,
        last_ip       = COALESCE(NEW.ip, last_ip)
    WHERE id = NEW.profile_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_insert_user_activity_log ON public.user_activity_log;
CREATE TRIGGER after_insert_user_activity_log
  AFTER INSERT ON public.user_activity_log
  FOR EACH ROW EXECUTE FUNCTION public.update_profile_login_metrics();

-- 14. Marcar como deprecadas colunas legadas de afiliado em tenants
COMMENT ON COLUMN public.tenants.affiliate_id   IS 'DEPRECATED — usar profiles.affiliate_id';
COMMENT ON COLUMN public.tenants.affiliate_code IS 'DEPRECATED — usar profiles.affiliate_id → affiliates.affiliate_code';

-- 15. Policies provisórias para usage_limits e user_activity_log
DROP POLICY IF EXISTS "usage_limits_authenticated_read" ON public.usage_limits;
DROP POLICY IF EXISTS "usage_limits_superadmin_write" ON public.usage_limits;
DROP POLICY IF EXISTS "user_activity_log_service_role_insert" ON public.user_activity_log;
DROP POLICY IF EXISTS "user_activity_log_self_read" ON public.user_activity_log;
DROP POLICY IF EXISTS "user_activity_log_superadmin_all" ON public.user_activity_log;

CREATE POLICY "usage_limits_authenticated_read" ON public.usage_limits
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "usage_limits_superadmin_write" ON public.usage_limits
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "user_activity_log_service_role_insert" ON public.user_activity_log
  FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "user_activity_log_self_read" ON public.user_activity_log
  FOR SELECT TO authenticated
  USING (profile_id = public.current_profile_id());

CREATE POLICY "user_activity_log_superadmin_all" ON public.user_activity_log
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

COMMIT;
