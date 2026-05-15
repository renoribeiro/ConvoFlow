-- =============================================================================
-- Fase 0.5 — Renomeação completa da hierarquia para Loja/Agência/Superadmin
-- =============================================================================
-- Esta migration assume que 20260513140000 já adicionou 'agencia' e 'loja' ao
-- enum user_role. Aqui fazemos:
--   1. UPDATE profiles: account_manager → agencia; enterprise/user → loja
--   2. Re-aperta constraint tenant_required (só superadmin permite NULL)
--   3. Adiciona constraint profiles_role_modern_only (bloqueia valores legados)
--   4. Atualiza helpers existentes (is_account_manager_safe → aponta pra agencia;
--      is_enterprise_safe → aponta pra loja) — preserva policies dependentes
--   5. Cria helpers novos: is_agencia(), is_loja(), is_agencia_safe(), is_loja_safe()
--   6. Adiciona tenants.parent_tenant_id (Loja aponta pra Agência) + helper
--      get_my_child_tenant_ids()
--   7. Reescreve policies que tinham literais 'account_manager'/'enterprise'/'user'
--   8. Atualiza handle_new_user pra usar a nova nomenclatura
--   9. Migra usage_limits: deleta linhas dos roles antigos, insere pros novos
--
-- Rollback resumido (manual, requer ordem reversa):
--   • DROP constraint profiles_role_modern_only
--   • UPDATE profiles SET role = 'user' WHERE role = 'loja';
--     UPDATE profiles SET role = 'account_manager' WHERE role = 'agencia';
--   • Reverter is_account_manager_safe/is_enterprise_safe pros literais antigos
--   • DROP FUNCTION is_agencia, is_loja, is_agencia_safe, is_loja_safe, get_my_child_tenant_ids
--   • ALTER TABLE tenants DROP COLUMN parent_tenant_id
--   • Reverter policies (ALTER POLICY com array antigo)
--   • Reverter handle_new_user
--   • Restore usage_limits (DELETE WHERE role IN ('agencia','loja'); reinsert pros antigos)
-- =============================================================================

BEGIN;

-- ============================================================================
-- 1) Migrar profiles existentes para o novo enum
-- ============================================================================
-- Atualmente: 3 user + 1 superadmin (zero account_manager / enterprise).
-- Defensive: cobrir todos os casos.
UPDATE public.profiles SET role = 'agencia'::public.user_role WHERE role = 'account_manager'::public.user_role;
UPDATE public.profiles SET role = 'loja'::public.user_role    WHERE role = 'enterprise'::public.user_role;
UPDATE public.profiles SET role = 'loja'::public.user_role    WHERE role = 'user'::public.user_role;

-- Default da coluna role: 'loja' (era 'user')
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'loja'::public.user_role;

-- ============================================================================
-- 2) Re-apertar constraint tenant_required (só superadmin permite NULL)
-- ============================================================================
-- A constraint anterior permitia NULL para superadmin E account_manager.
-- Agora: só superadmin. Agência tem tenant próprio.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_tenant_required_for_lower_roles;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_tenant_required_for_non_superadmin
  CHECK (role = 'superadmin'::public.user_role OR tenant_id IS NOT NULL);

-- ============================================================================
-- 3) Constraint: só permite os 3 valores novos (bloqueia legados)
-- ============================================================================
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_modern_only;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_modern_only
  CHECK (role IN ('superadmin'::public.user_role,
                  'agencia'::public.user_role,
                  'loja'::public.user_role));

-- ============================================================================
-- 4) Atualizar helpers existentes (CREATE OR REPLACE preserva dependências)
-- ============================================================================
-- is_account_manager_safe agora aponta pra 'agencia' (mesma semântica)
CREATE OR REPLACE FUNCTION public.is_account_manager_safe()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND role = 'agencia'::public.user_role
  );
$$;
COMMENT ON FUNCTION public.is_account_manager_safe() IS
  'DEPRECATED — alias temporário para is_agencia_safe(). Verifica role = agencia.';

-- is_enterprise_safe agora aponta pra 'loja' (mesma semântica)
CREATE OR REPLACE FUNCTION public.is_enterprise_safe()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND role = 'loja'::public.user_role
  );
$$;
COMMENT ON FUNCTION public.is_enterprise_safe() IS
  'DEPRECATED — alias temporário para is_loja_safe(). Verifica role = loja.';

-- ============================================================================
-- 5) Helpers novos com nomes alinhados à hierarquia atual
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_agencia()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND role = 'agencia'::public.user_role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_agencia_safe()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND role = 'agencia'::public.user_role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_loja()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND role = 'loja'::public.user_role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_loja_safe()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND role = 'loja'::public.user_role
  );
$$;

-- ============================================================================
-- 6) tenants.parent_tenant_id (Loja → Agência) + helper get_my_child_tenant_ids
-- ============================================================================
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS parent_tenant_id uuid
    REFERENCES public.tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tenants_parent_tenant_id
  ON public.tenants(parent_tenant_id);

COMMENT ON COLUMN public.tenants.parent_tenant_id IS
  'Quando preenchido, indica que este tenant (Loja) é gerenciado por outro tenant (Agência). NULL pra Agências e pra Lojas independentes.';

CREATE OR REPLACE FUNCTION public.get_my_child_tenant_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id FROM public.tenants
  WHERE parent_tenant_id = public.get_current_user_tenant_id();
$$;

-- ============================================================================
-- 7) Atualizar policies que tinham literais 'account_manager'/'enterprise'/'user'
-- ============================================================================
-- 7.1 profiles_account_manager_descendants_update WITH CHECK
--     Era: role IN ('account_manager','enterprise','user')
--     Vira: role IN ('agencia','loja')
ALTER POLICY profiles_account_manager_descendants_update ON public.profiles
WITH CHECK (
  public.is_account_manager_safe()
  AND public.is_my_descendant(id)
  AND (role = ANY (ARRAY['agencia'::public.user_role, 'loja'::public.user_role]))
);

-- 7.2 profiles_insert_hierarchy WITH CHECK
--     Era: 3 ramos com 'enterprise'/'user'
--     Vira: superadmin pode tudo; agencia cria loja; loja não convida ninguém
--     (a antiga regra "enterprise convida user" some — Loja agora é o nível final)
ALTER POLICY profiles_insert_hierarchy ON public.profiles
WITH CHECK (
  public.is_super_admin_safe()
  OR (
    public.is_account_manager_safe()
    AND (role = 'loja'::public.user_role)
    AND (parent_id = public.current_profile_id())
  )
);

-- 7.3 stripe_config: era superadmin OR enterprise; vira superadmin OR loja
ALTER POLICY "Admin users can manage stripe config" ON public.stripe_config
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.tenant_id = stripe_config.tenant_id
      AND profiles.role = ANY (ARRAY['superadmin'::public.user_role, 'loja'::public.user_role])
  )
);

-- 7.4 stripe_transactions: idem
ALTER POLICY "Admin users can manage stripe transactions" ON public.stripe_transactions
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.tenant_id = stripe_transactions.tenant_id
      AND profiles.role = ANY (ARRAY['superadmin'::public.user_role, 'loja'::public.user_role])
  )
);

-- 7.5 tenant_module_settings (3 policies: delete/insert/update)
ALTER POLICY tenant_module_settings_delete_policy ON public.tenant_module_settings
USING (
  tenant_id = (SELECT profiles.tenant_id FROM public.profiles WHERE profiles.id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = ANY (ARRAY['superadmin'::public.user_role, 'loja'::public.user_role])
  )
);

ALTER POLICY tenant_module_settings_insert_policy ON public.tenant_module_settings
WITH CHECK (
  tenant_id = (SELECT profiles.tenant_id FROM public.profiles WHERE profiles.id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = ANY (ARRAY['superadmin'::public.user_role, 'loja'::public.user_role])
  )
);

ALTER POLICY tenant_module_settings_update_policy ON public.tenant_module_settings
USING (
  tenant_id = (SELECT profiles.tenant_id FROM public.profiles WHERE profiles.id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = ANY (ARRAY['superadmin'::public.user_role, 'loja'::public.user_role])
  )
);

-- ============================================================================
-- 8) Reescrever handle_new_user pra suportar a nova nomenclatura
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
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
    'loja'::public.user_role
  );
  v_tenant_id    := NULLIF(NEW.raw_user_meta_data ->> 'tenant_id', '')::UUID;
  v_parent_id    := NULLIF(NEW.raw_user_meta_data ->> 'parent_id', '')::UUID;
  v_affiliate_id := NULLIF(NEW.raw_user_meta_data ->> 'affiliate_id', '')::UUID;

  -- Loja e Agência precisam de tenant_id (Loja é o operacional; Agência tem tenant próprio).
  IF v_role IN ('loja'::public.user_role, 'agencia'::public.user_role) AND v_tenant_id IS NULL THEN
    RAISE EXCEPTION
      'tenant_id é obrigatório no raw_user_meta_data para role %', v_role;
  END IF;

  -- Auto-criar affiliate pra Agência sem affiliate_id no metadata
  IF v_role = 'agencia'::public.user_role AND v_affiliate_id IS NULL THEN
    v_full_name := NULLIF(TRIM(CONCAT_WS(' ', v_first_name, v_last_name)), '');
    v_aff_code  := 'AG-' ||
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

-- ============================================================================
-- 9) Migrar usage_limits para a nova nomenclatura
-- ============================================================================
DELETE FROM public.usage_limits
WHERE role IN ('account_manager'::public.user_role,
               'enterprise'::public.user_role,
               'user'::public.user_role);

INSERT INTO public.usage_limits (role, limit_name, description) VALUES
  ('agencia'::public.user_role, 'whatsapp_numbers', 'Limite de números WhatsApp conectados'),
  ('agencia'::public.user_role, 'monthly_messages', 'Limite mensal de mensagens enviadas'),
  ('agencia'::public.user_role, 'chatbots',         'Limite de chatbots ativos'),
  ('agencia'::public.user_role, 'team_members',     'Limite de Lojas afiliadas'),
  ('loja'::public.user_role,    'whatsapp_numbers', 'Limite de números WhatsApp conectados'),
  ('loja'::public.user_role,    'monthly_messages', 'Limite mensal de mensagens enviadas'),
  ('loja'::public.user_role,    'chatbots',         'Limite de chatbots ativos'),
  ('loja'::public.user_role,    'team_members',     'Limite de usuários internos da Loja')
ON CONFLICT (role, limit_name) DO NOTHING;

-- ============================================================================
-- 10) Documentação do enum
-- ============================================================================
COMMENT ON TYPE public.user_role IS
  'Hierarquia 3 níveis: superadmin > agencia > loja. Valores legados (account_manager/enterprise/user/super_admin/tenant_admin/tenant_user) ficam no enum por compatibilidade do Postgres mas são bloqueados pela constraint profiles_role_modern_only.';

COMMIT;
