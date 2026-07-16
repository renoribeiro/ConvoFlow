-- =============================================================================
-- Hierarchy V2 — Phase 3: unbundle Mario / Camila / EncaixaRH (PROD DATA)
-- =============================================================================
-- ⚠️⚠️ THIS MIGRATION MUTATES REAL PRODUCTION DATA. ⚠️⚠️
-- Do NOT run without: (1) a FRESH backup, (2) explicit written go-ahead
-- ("sim, pode migrar produção"), and (3) the V2 foundation (20260716000001 +
-- 20260716000002) already applied. It is idempotent and transactional.
--
-- Confirmed live state (2026-07-16, read-only):
--   * Mario Acioli  profile b29f1afd-ae64-4669-9fdd-b2df9395587f — role superadmin, tenant NULL
--   * Camila Santarosa profile 2478dce2-c829-41a6-952d-f6d27db73d78 — role loja,
--       tenant 2165be9f-... (renamed to EncaixaRH here)
--   * Tenant 2165be9f-b6bb-49fb-ba6a-1dec6840c45a "Camila Santarosa" — the real
--       data container: 1 chip (Meta official, connected), 55 contacts, 970
--       messages, 54 conversations. THIS TENANT IS EncaixaRH.
--
-- Target end state (Reno's decision, 2026-07-16):
--   * Mario → GERENTE, owns a new ACCOUNT tenant with 5 store slots (loses superadmin).
--   * Tenant 2165be9f-... → renamed "EncaixaRH", kind='store', parent = Mario's account.
--   * Camila → GESTORA of EncaixaRH (role gestor, parent_id = Mario), same tenant_id.
--   * The WhatsApp chip row (whatsapp_instances, tenant_id 2165be9f-...) is NOT
--     touched → connection stays unbroken. All child data keeps the same tenant_id.
--
-- Rollback: see notes at the bottom.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_mario   uuid := 'b29f1afd-ae64-4669-9fdd-b2df9395587f';
  v_camila  uuid := '2478dce2-c829-41a6-952d-f6d27db73d78';
  v_store   uuid := '2165be9f-b6bb-49fb-ba6a-1dec6840c45a';
  v_account uuid;
BEGIN
  -- ---- Guards --------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='tenants' AND column_name='kind') THEN
    RAISE EXCEPTION 'V2 foundation (20260716000002) não aplicada — rode a fundação primeiro.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_mario) THEN
    RAISE EXCEPTION 'Profile do Mario (%) não encontrado', v_mario;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_camila) THEN
    RAISE EXCEPTION 'Profile da Camila (%) não encontrado', v_camila;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = v_store) THEN
    RAISE EXCEPTION 'Tenant EncaixaRH (%) não encontrado', v_store;
  END IF;

  -- ---- 1) Mario's ACCOUNT tenant (idempotent) ------------------------------
  SELECT tenant_id INTO v_account FROM public.profiles WHERE id = v_mario;

  IF v_account IS NULL THEN
    INSERT INTO public.tenants (name, slug, kind, store_slots_included, store_slots_extra, status, plan_type)
    VALUES ('Mario Acioli', 'mario-acioli-' || substr(v_mario::text, 1, 8),
            'account', 5, 0, 'active', 'gerente')
    RETURNING id INTO v_account;
  ELSE
    UPDATE public.tenants
      SET kind = 'account', store_slots_included = GREATEST(store_slots_included, 5)
      WHERE id = v_account;
  END IF;

  -- ---- 2) Convert Mario superadmin → gerente (+ attach account) ------------
  UPDATE public.profiles
    SET role = 'gerente'::public.user_role,
        tenant_id = v_account
    WHERE id = v_mario;

  -- ---- 3) Camila's tenant → EncaixaRH store under Mario's account ----------
  UPDATE public.tenants
    SET name = 'EncaixaRH',
        kind = 'store',
        parent_tenant_id = v_account
    WHERE id = v_store;

  -- ---- 4) Camila loja → GESTORA of EncaixaRH (parent = Mario) --------------
  --      (Phase 2 backfill already flips loja→gestor; this is idempotent.)
  UPDATE public.profiles
    SET role = 'gestor'::public.user_role,
        parent_id = v_mario,
        tenant_id = v_store
    WHERE id = v_camila;

  RAISE NOTICE 'OK: Mario account=%, EncaixaRH store=% (chip e dados intactos)', v_account, v_store;
END $$;

COMMIT;

-- =============================================================================
-- POST-CHECK (run read-only after applying — should reflect the target state):
--   select id, role, first_name, tenant_id, parent_id from public.profiles
--     where id in ('b29f1afd-ae64-4669-9fdd-b2df9395587f',
--                  '2478dce2-c829-41a6-952d-f6d27db73d78');
--   select id, name, kind, parent_tenant_id, store_slots_included
--     from public.tenants where kind='account' or id='2165be9f-b6bb-49fb-ba6a-1dec6840c45a';
--   -- chip unchanged:
--   select id, tenant_id, status from public.whatsapp_instances
--     where tenant_id='2165be9f-b6bb-49fb-ba6a-1dec6840c45a';
--   -- data intact:
--   select count(*) from public.messages   where tenant_id='2165be9f-b6bb-49fb-ba6a-1dec6840c45a'; -- 970
--   select count(*) from public.contacts   where tenant_id='2165be9f-b6bb-49fb-ba6a-1dec6840c45a'; -- 55
--
-- ROLLBACK (manual — only restores roles/links; delete the created account tenant):
--   update public.profiles set role='superadmin', tenant_id=null
--     where id='b29f1afd-ae64-4669-9fdd-b2df9395587f';
--   update public.tenants set name='Camila Santarosa', kind='store', parent_tenant_id=null
--     where id='2165be9f-b6bb-49fb-ba6a-1dec6840c45a';
--   update public.profiles set role='loja', parent_id=null
--     where id='2478dce2-c829-41a6-952d-f6d27db73d78';
--   delete from public.tenants where kind='account' and name='Mario Acioli'
--     and id not in (select tenant_id from public.profiles where tenant_id is not null);
--   -- (A full restore should come from the pre-migration backup.)
-- =============================================================================
