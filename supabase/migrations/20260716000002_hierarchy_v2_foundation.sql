-- =============================================================================
-- Hierarchy V2 — Step B: foundation (backfill, constraint, helpers, structure)
-- =============================================================================
-- Requires 20260716000001 (Step A: enum values gerente/gestor/atendente).
--
-- Model: superadmin > gerente > gestor > atendente. A "store" is a CONTAINER
-- (a tenants row, kind='store') holding data (conversations/contacts/chip) and
-- users (1 gestor + up to 5 atendentes). A gerente owns an "account" tenant
-- (kind='account') and its child stores via tenants.parent_tenant_id (5 slots
-- included + purchasable extras).
--
-- Backfill mapping: agencia→gerente, loja→gestor. `atendente` is new.
--
-- SAFETY / BACKWARD-COMPAT:
--   * Additive. Old enum values remain (Postgres can't drop them); the CHECK
--     constraint is what gates writes.
--   * Deprecated helpers is_agencia*/is_loja* are RE-POINTED to the new roles
--     (CREATE OR REPLACE) so every existing RLS policy that calls them keeps
--     working WITHOUT being altered.
--   * Runs in a transaction. Fully reversible (see rollback notes at bottom).
--
-- ⚠️ VALIDATE-AGAINST-LIVE BEFORE APPLYING TO PROD:
--   The ALTER POLICY statements in section 8 reproduce the policy bodies as
--   last set by 20260513140100, swapping agencia→gerente / loja→gestor. If any
--   later migration changed those policies on the live DB, diff first. This
--   migration is authored for staging validation; it must NOT be applied to
--   production outside the Phase 3 safety protocol (fresh backup + explicit
--   "sim, pode migrar produção").
-- =============================================================================

BEGIN;

-- Drop the old CHECK FIRST, otherwise the backfill below cannot write the new
-- role names (the old constraint only allowed superadmin/agencia/loja). The new
-- constraint is (re)created in section 2 after the backfill.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_modern_only;

-- ============================================================================
-- 1) Backfill profiles.role to the new nomenclature
-- ============================================================================
UPDATE public.profiles SET role = 'gerente'::public.user_role WHERE role = 'agencia'::public.user_role;
UPDATE public.profiles SET role = 'gestor'::public.user_role  WHERE role = 'loja'::public.user_role;
-- Defensive: cover any stragglers on the pre-3-level enum.
UPDATE public.profiles SET role = 'gerente'::public.user_role WHERE role = 'account_manager'::public.user_role;
UPDATE public.profiles SET role = 'gestor'::public.user_role  WHERE role = 'enterprise'::public.user_role;
UPDATE public.profiles SET role = 'gestor'::public.user_role  WHERE role = 'user'::public.user_role;

-- New default for the operational tier
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'gestor'::public.user_role;

-- ============================================================================
-- 2) Gate profiles.role to the 4 modern values (block legacy writes)
--    (the old constraint was already dropped at the top, before the backfill)
-- ============================================================================
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_modern_only
  CHECK (role IN ('superadmin'::public.user_role,
                  'gerente'::public.user_role,
                  'gestor'::public.user_role,
                  'atendente'::public.user_role));

-- ============================================================================
-- 3) Re-point deprecated helpers so existing policies keep working
--    (is_agencia*→gerente, is_loja*→gestor). CREATE OR REPLACE preserves deps.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_agencia_safe()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'gerente'::public.user_role); $$;
COMMENT ON FUNCTION public.is_agencia_safe() IS 'DEPRECATED alias → is_gerente_safe(). Checks role = gerente.';

CREATE OR REPLACE FUNCTION public.is_agencia()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'gerente'::public.user_role); $$;
COMMENT ON FUNCTION public.is_agencia() IS 'DEPRECATED alias → is_gerente(). Checks role = gerente.';

CREATE OR REPLACE FUNCTION public.is_loja_safe()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'gestor'::public.user_role); $$;
COMMENT ON FUNCTION public.is_loja_safe() IS 'DEPRECATED alias → is_gestor_safe(). Checks role = gestor.';

CREATE OR REPLACE FUNCTION public.is_loja()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'gestor'::public.user_role); $$;
COMMENT ON FUNCTION public.is_loja() IS 'DEPRECATED alias → is_gestor(). Checks role = gestor.';

-- ============================================================================
-- 4) New helpers aligned to the V2 hierarchy
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_gerente()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'gerente'::public.user_role); $$;

CREATE OR REPLACE FUNCTION public.is_gerente_safe()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'gerente'::public.user_role); $$;

CREATE OR REPLACE FUNCTION public.is_gestor()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'gestor'::public.user_role); $$;

CREATE OR REPLACE FUNCTION public.is_gestor_safe()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'gestor'::public.user_role); $$;

CREATE OR REPLACE FUNCTION public.is_atendente()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'atendente'::public.user_role); $$;

CREATE OR REPLACE FUNCTION public.is_atendente_safe()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'atendente'::public.user_role); $$;

-- ============================================================================
-- 5) profiles.capabilities — per-user capability overrides (JSONB, nullable)
--    NULL = "use role defaults" (see src/types/userHierarchy.ts). Keeps flags
--    like campaigns.dispatch adjustable per-user WITHOUT a schema change.
-- ============================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS capabilities JSONB;
COMMENT ON COLUMN public.profiles.capabilities IS
  'Optional per-user capability overrides ({"campaigns.dispatch": false, ...}). NULL = role defaults. Canonical keys defined in src/types/userHierarchy.ts (Capability).';

-- ============================================================================
-- 6) tenants — store-container fields + slot accounting
-- ============================================================================
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'store'
    CHECK (kind IN ('account','store')),
  ADD COLUMN IF NOT EXISTS store_slots_included INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS store_slots_extra    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chip_mode TEXT NOT NULL DEFAULT 'shared'
    CHECK (chip_mode IN ('dedicated','shared')),
  ADD COLUMN IF NOT EXISTS agent_signature_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tenants.kind IS 'account = gerente slot-group root; store = data/user container (1 gestor + <=5 atendentes).';
COMMENT ON COLUMN public.tenants.store_slots_included IS 'Store slots included in the gerente plan (default 5). Meaningful for kind=account.';
COMMENT ON COLUMN public.tenants.store_slots_extra IS 'Extra store slots purchased (R$99,90/mo each). Meaningful for kind=account.';
COMMENT ON COLUMN public.tenants.chip_mode IS 'dedicated = one WhatsApp instance per atendente; shared = one instance for the whole store. Meaningful for kind=store.';
COMMENT ON COLUMN public.tenants.agent_signature_enabled IS 'When true (shared chip), outgoing messages are prefixed with the sender name in bold ("**Yuri:** msg"). Meaningful for kind=store.';

-- Backfill kind: a tenant that is the home of a gerente profile is an account;
-- everything else is a store.
UPDATE public.tenants t SET kind = 'account'
WHERE EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.tenant_id = t.id AND p.role = 'gerente'::public.user_role
);

-- ============================================================================
-- 7) whatsapp_instances.assigned_profile_id — dedicated-chip ownership
--    NULL = shared chip (whole store acts on it).
-- ============================================================================
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS assigned_profile_id UUID
    REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS whatsapp_instances_assigned_profile_idx
  ON public.whatsapp_instances(assigned_profile_id);
COMMENT ON COLUMN public.whatsapp_instances.assigned_profile_id IS
  'Dedicated chip: the atendente who owns this number. NULL = shared chip for the store.';

-- ============================================================================
-- 8) Rewrite policies that used literal 'agencia'/'loja' (see ⚠️ header note)
-- ============================================================================
-- 8.1 gerente may update role of its descendants, limited to gestor/atendente
ALTER POLICY profiles_account_manager_descendants_update ON public.profiles
WITH CHECK (
  public.is_gerente_safe()
  AND public.is_my_descendant(id)
  AND (role = ANY (ARRAY['gestor'::public.user_role, 'atendente'::public.user_role]))
);

-- 8.2 Invite rules: superadmin→any; gerente→gestor/atendente in its own stores;
--     gestor→atendente in its own store.
ALTER POLICY profiles_insert_hierarchy ON public.profiles
WITH CHECK (
  public.is_super_admin_safe()
  OR (
    public.is_gerente_safe()
    AND (role = ANY (ARRAY['gestor'::public.user_role, 'atendente'::public.user_role]))
    AND (parent_id = public.current_profile_id())
    AND (tenant_id IN (SELECT public.get_my_child_tenant_ids()))
  )
  OR (
    public.is_gestor_safe()
    AND (role = 'atendente'::public.user_role)
    AND (parent_id = public.current_profile_id())
    AND (tenant_id = public.get_current_user_tenant_id())
  )
);

-- 8.3 stripe_config / stripe_transactions: billing is account-level → gerente.
ALTER POLICY "Admin users can manage stripe config" ON public.stripe_config
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.tenant_id = stripe_config.tenant_id
      AND profiles.role = ANY (ARRAY['superadmin'::public.user_role, 'gerente'::public.user_role])
  )
);

ALTER POLICY "Admin users can manage stripe transactions" ON public.stripe_transactions
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.tenant_id = stripe_transactions.tenant_id
      AND profiles.role = ANY (ARRAY['superadmin'::public.user_role, 'gerente'::public.user_role])
  )
);

-- 8.4 tenant_module_settings (delete/insert/update): store admin = gerente/gestor
ALTER POLICY tenant_module_settings_delete_policy ON public.tenant_module_settings
USING (
  tenant_id = (SELECT profiles.tenant_id FROM public.profiles WHERE profiles.id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = ANY (ARRAY['superadmin'::public.user_role, 'gerente'::public.user_role, 'gestor'::public.user_role])
  )
);

ALTER POLICY tenant_module_settings_insert_policy ON public.tenant_module_settings
WITH CHECK (
  tenant_id = (SELECT profiles.tenant_id FROM public.profiles WHERE profiles.id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = ANY (ARRAY['superadmin'::public.user_role, 'gerente'::public.user_role, 'gestor'::public.user_role])
  )
);

ALTER POLICY tenant_module_settings_update_policy ON public.tenant_module_settings
USING (
  tenant_id = (SELECT profiles.tenant_id FROM public.profiles WHERE profiles.id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = ANY (ARRAY['superadmin'::public.user_role, 'gerente'::public.user_role, 'gestor'::public.user_role])
  )
);

-- ============================================================================
-- 9) Enforce store membership caps: 1 gestor + <=5 atendentes per store
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_store_membership_limits()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'deleted' OR NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.role = 'gestor'::public.user_role THEN
    IF (SELECT count(*) FROM public.profiles
        WHERE tenant_id = NEW.tenant_id
          AND role = 'gestor'::public.user_role
          AND status <> 'deleted'
          AND id <> NEW.id) >= 1 THEN
      RAISE EXCEPTION 'Store % already has a gestor', NEW.tenant_id
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.role = 'atendente'::public.user_role THEN
    IF (SELECT count(*) FROM public.profiles
        WHERE tenant_id = NEW.tenant_id
          AND role = 'atendente'::public.user_role
          AND status <> 'deleted'
          AND id <> NEW.id) >= 5 THEN
      RAISE EXCEPTION 'Store % already has the maximum of 5 atendentes', NEW.tenant_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_store_membership_limits_trg ON public.profiles;
CREATE TRIGGER enforce_store_membership_limits_trg
  BEFORE INSERT OR UPDATE OF role, tenant_id, status ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_store_membership_limits();

-- ============================================================================
-- 10) Enforce store slot capacity: child stores <= included + extra
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_store_slot_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_capacity INTEGER;
  v_used     INTEGER;
BEGIN
  IF NEW.kind <> 'store' OR NEW.parent_tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(store_slots_included, 0) + COALESCE(store_slots_extra, 0)
    INTO v_capacity
  FROM public.tenants WHERE id = NEW.parent_tenant_id;

  SELECT count(*) INTO v_used
  FROM public.tenants
  WHERE parent_tenant_id = NEW.parent_tenant_id
    AND kind = 'store'
    AND id <> NEW.id;

  IF v_used >= COALESCE(v_capacity, 0) THEN
    RAISE EXCEPTION 'Account % has no free store slots (used %, capacity %)',
      NEW.parent_tenant_id, v_used, v_capacity
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_store_slot_capacity_trg ON public.tenants;
CREATE TRIGGER enforce_store_slot_capacity_trg
  BEFORE INSERT OR UPDATE OF parent_tenant_id, kind ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.enforce_store_slot_capacity();

-- ============================================================================
-- 11) usage_limits — migrate rows to the new roles
-- ============================================================================
DELETE FROM public.usage_limits
WHERE role IN ('agencia'::public.user_role, 'loja'::public.user_role,
               'account_manager'::public.user_role, 'enterprise'::public.user_role,
               'user'::public.user_role);

INSERT INTO public.usage_limits (role, limit_name, description) VALUES
  ('gerente'::public.user_role,   'whatsapp_numbers', 'Limite de números WhatsApp conectados'),
  ('gerente'::public.user_role,   'monthly_messages', 'Limite mensal de mensagens enviadas'),
  ('gerente'::public.user_role,   'chatbots',         'Limite de chatbots ativos'),
  ('gerente'::public.user_role,   'team_members',     'Limite de Lojas no grupo'),
  ('gestor'::public.user_role,    'whatsapp_numbers', 'Limite de números WhatsApp conectados'),
  ('gestor'::public.user_role,    'monthly_messages', 'Limite mensal de mensagens enviadas'),
  ('gestor'::public.user_role,    'chatbots',         'Limite de chatbots ativos'),
  ('gestor'::public.user_role,    'team_members',     'Limite de atendentes da Loja'),
  ('atendente'::public.user_role, 'monthly_messages', 'Limite mensal de mensagens enviadas')
ON CONFLICT (role, limit_name) DO NOTHING;

-- ============================================================================
-- 12) handle_new_user — new roles, require tenant for non-superadmin,
--     drop affiliate auto-create (affiliate program is being retired).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_role       public.user_role;
  v_tenant_id  UUID;
  v_parent_id  UUID;
  v_status     TEXT;
  v_first_name TEXT;
  v_last_name  TEXT;
  v_phone      TEXT;
BEGIN
  v_first_name := NEW.raw_user_meta_data ->> 'first_name';
  v_last_name  := NEW.raw_user_meta_data ->> 'last_name';
  v_phone      := NEW.raw_user_meta_data ->> 'phone';
  v_status     := COALESCE(NEW.raw_user_meta_data ->> 'status', 'pending');

  v_role := COALESCE(
    (NEW.raw_user_meta_data ->> 'role')::public.user_role,
    'gestor'::public.user_role
  );
  v_tenant_id := NULLIF(NEW.raw_user_meta_data ->> 'tenant_id', '')::UUID;
  v_parent_id := NULLIF(NEW.raw_user_meta_data ->> 'parent_id', '')::UUID;

  -- Everyone except superadmin needs a tenant (account for gerente; store for
  -- gestor/atendente). The account tenant is created by the signup flow before
  -- the auth user, then passed in metadata.
  IF v_role <> 'superadmin'::public.user_role AND v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id é obrigatório no raw_user_meta_data para role %', v_role;
  END IF;

  INSERT INTO public.profiles (
    user_id, tenant_id, role, first_name, last_name, phone, parent_id, status
  ) VALUES (
    NEW.id, v_tenant_id, v_role, v_first_name, v_last_name, v_phone, v_parent_id, v_status
  );

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 13) Enum documentation
-- ============================================================================
COMMENT ON TYPE public.user_role IS
  'Hierarquia V2 (4 níveis): superadmin > gerente > gestor > atendente. Loja = container (tenants.kind=store), não é role. Valores legados (agencia/loja/account_manager/enterprise/user/super_admin/tenant_admin/tenant_user) ficam no enum por compatibilidade do Postgres, bloqueados pela constraint profiles_role_modern_only.';

COMMIT;

-- =============================================================================
-- ROLLBACK (manual, reverse order — run inside a transaction):
--   DROP TRIGGER enforce_store_slot_capacity_trg ON public.tenants;
--   DROP TRIGGER enforce_store_membership_limits_trg ON public.profiles;
--   DROP FUNCTION public.enforce_store_slot_capacity();
--   DROP FUNCTION public.enforce_store_membership_limits();
--   -- revert policies (section 8) to the agencia/loja literals of 20260513140100
--   ALTER TABLE public.whatsapp_instances DROP COLUMN assigned_profile_id;
--   ALTER TABLE public.tenants DROP COLUMN agent_signature_enabled, DROP COLUMN chip_mode,
--        DROP COLUMN store_slots_extra, DROP COLUMN store_slots_included, DROP COLUMN kind;
--   ALTER TABLE public.profiles DROP COLUMN capabilities;
--   -- revert helpers (is_agencia*/is_loja*) to their 20260513140100 bodies;
--   -- DROP the new is_gerente*/is_gestor*/is_atendente* functions
--   ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_modern_only;
--   ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_modern_only
--     CHECK (role IN ('superadmin','agencia','loja'));
--   UPDATE public.profiles SET role='agencia' WHERE role='gerente';
--   UPDATE public.profiles SET role='loja'    WHERE role IN ('gestor','atendente');
--   ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'loja';
--   -- restore usage_limits + handle_new_user of 20260513140100
--   (Enum values gerente/gestor/atendente cannot be dropped — harmless.)
-- =============================================================================
