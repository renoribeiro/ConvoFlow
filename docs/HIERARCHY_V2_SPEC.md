# ConvoFlow — Hierarchy V2 Technical Spec (Phase 1)

> Status: **DRAFT — awaiting Reno's go-ahead before Phase 2 implementation.**
> Scope: foundation only. No production data is touched by this document.
> All product-facing strings must ship in pt-BR; this internal spec is in English per repo convention.

---

## 0. Verification notes (what is grounded vs assumed)

- Everything below about the **current** system was read directly from the repo (`supabase/migrations/**`, `supabase/functions/**`, `src/**`) on 2026-07-16.
- **Live production DB was NOT reachable from this session.** The connected Supabase account only exposes an unrelated project (`Finanças RE9`, org `jdsmagpvynwbsjglvhay`). ConvoFlow prod is `pqjkuwyshybxldzpfbbs` in a different org (`renoribeiro`) → `permission denied`.
- Consequence: the "current enum / role assignments" below reflect the **intended state per migration files**, not a confirmed live read. **A read-only verification against live prod is a REQUIRED precondition for Phase 3** (Mario/Camila/EncaixaRH). It should also be re-confirmed before Phase 2 migrations run.

---

## 1. Current system (as-built, per files)

### 1.1 Roles
- Enum `public.user_role` has been renamed twice. Physical values now present: `superadmin, enterprise, user, account_manager, agencia, loja` (legacy names were `ALTER TYPE ... RENAME VALUE`'d).
- `profiles.role` is constrained by `profiles_role_modern_only` to **{superadmin, agencia, loja}**. Current canonical hierarchy: `superadmin > agencia > loja`.
- `src/types/userHierarchy.ts` mirrors this: `UserRole = 'superadmin' | 'agencia' | 'loja'`, with `normalizeRole()` mapping legacy → current, `ROLE_ORDER`, `ROLE_LABELS`.

### 1.2 Data shape
- `profiles`: `role`, `tenant_id` (NULL only for superadmin — CHECK `profiles_tenant_required_for_non_superadmin`), `parent_id` (self-ref), `affiliate_id`, `status` (active/suspended/pending/deleted), login metrics.
- `tenants`: the account/store entity. Has `parent_tenant_id` (loja → agência), `subscription_id/_status`, `plan_type`, `max_users`, `max_whatsapp_instances`, `settings` JSONB, deprecated `affiliate_id/_code`.
- `whatsapp_instances`: `tenant_id` FK, `instance_key`, `provider` (evolution default / waha / meta), `connection_config`, legacy `evolution_api_url/_key`. Chip = one row here.
- RLS helpers in DB: `is_super_admin()`, `is_agencia()/is_loja()` (+ `_safe`), `current_profile_id()`, `current_user_role()`, `get_my_child_tenant_ids()`, `is_my_descendant()`, `can_manage_profile()`, `descendant_profile_ids()`.

### 1.3 Guards (frontend)
- `AuthGuard` (session), `ModuleGuard` (module toggle via `module_settings`; **all plan checks already removed** — module access = enabled + authenticated), `RoleGuard` (`role` / `minRole`, superadmin bypass).
- `TenantContext`: superadmin can "impersonate" a tenant via `localStorage` key `convoflow-active-tenant`; everyone else's tenant is derived from their profile.

### 1.4 Billing (current)
- `create-checkout-session`: single recurring price from env `STRIPE_PRICE_ID` (R$29,90), `mode: subscription`, `client_reference_id = tenant.id`, `allow_promotion_codes: true`.
- `stripe-webhook`: on `checkout.session.completed` → `tenants.subscription_status='active', plan_type='pro'`; renews on `invoice.payment_succeeded`; cancels on `customer.subscription.deleted`. **No slot concept.**

### 1.5 KNOWN RISK — `manage-user` Edge Function
- `supabase/functions/manage-user/index.ts` still hardcodes the **old** 4-level names: `type UserRole = 'superadmin' | 'account_manager' | 'enterprise' | 'user'` and `ensureCanCreate` (superadmin→any; account_manager→enterprise; enterprise→user).
- These names **no longer satisfy** the DB constraint `profiles_role_modern_only` ({superadmin, agencia, loja}). Any create of a non-superadmin via this function inserts a role that **violates the CHECK constraint → user creation breaks**. This must be fixed as part of the foundation.
- Also relevant: `handle_new_user()` trigger currently auto-creates an `affiliates` row for `agencia` signups — to be neutralized (affiliate program is being removed).

---

## 2. Target model (V2)

### 2.1 Four levels, two natures
| Level | Nature | POWER | SCOPE |
|-------|--------|-------|-------|
| **Superadmin** | platform (not a product role) | business-ops | whole platform |
| **Gerente** | top-level **sold** account | full | all stores in its slot group |
| **Gestor** | store admin (delegable) | full | exactly one store |
| **Atendente** | operational | operational-only | exactly one store |

### 2.2 The two-axis permission model (core decision)
Do **not** hardcode one rule per role. Model permissions on two independent axes plus a capability flag set:
- **POWER**: `full` (gerente, gestor) vs `operational` (atendente).
- **SCOPE**: `group` (gerente = all stores under its account) vs `store` (gestor, atendente = their one store).
- **Capabilities**: a flag set resolved from role defaults + optional per-user overrides. This is what makes "Atendente + Campanhas = partial" a data flag, not a code branch.

Gerente is then a clean **superset** of Gestor (same `full` power, wider `group` scope). No special-casing per role.

Canonical capability keys (initial set):
```
conversations.handle      contacts.manage         automations.operate
campaigns.view_convos     campaigns.budget         campaigns.dispatch
store.admin (users+chip)  whatsapp.configure       billing.view
stores.switch             stores.compare           platform.ops (stripe/plans/coupons)
```

Default matrix (rows = role):
| capability | Superadmin | Gerente | Gestor | Atendente |
|---|---|---|---|---|
| conversations.handle | ✓ | ✓ | ✓ | ✓ |
| contacts.manage | ✓ | ✓ | ✓ | ✓ |
| automations.operate | ✓ | ✓ | ✓ | ✓ |
| campaigns.view_convos | ✓ | ✓ | ✓ | ✓ (default) |
| campaigns.budget | ✓ | ✓ | ✓ | ✗ (default) |
| campaigns.dispatch | ✓ | ✓ | ✓ | ✗ (default) |
| store.admin (users + chip) | ✓ | ✓ | ✓ | ✗ |
| whatsapp.configure | ✓ | ✓ | ✓ | ✗ |
| billing.view | ✓ | ✓ | ✗ | ✗ |
| stores.switch | ✓ | ✓ | ✗ | ✗ |
| stores.compare | ✓ | ✓ | ✗ | ✗ |
| platform.ops (stripe/plans/coupons) | ✓ | ✗ | ✗ | ✗ |

> ⚠️ **OPEN DECISION for Reno** — the three `campaigns.*` Atendente defaults (view=✓, budget=✗, dispatch=✗) come from the spec's "default assumption unless Reno says otherwise." Confirm before finalizing. Whatever he chooses, it stays a flag → adjustable later with no schema change.

### 2.3 "Store" = container (not a permission)
- A **store is a `tenants` row** (`kind='store'`), holding data (conversations, contacts, whatsapp instance/chip) and users (1 Gestor + up to 5 Atendentes).
- A **Gerente account is a `tenants` row** (`kind='account'`), the slot-group root. Stores are its children via existing `tenants.parent_tenant_id`.
- Membership: `profiles.tenant_id = store_id` for Gestor/Atendente (one store each). Gerente's `tenant_id = account_id`; it reaches its stores through `parent_tenant_id` (reuse existing `get_my_child_tenant_ids()`).

### 2.4 Slots
- On the **account** tenant: `store_slots_included INT DEFAULT 5`, `store_slots_extra INT DEFAULT 0`. Capacity = included + extra. Used = count of child stores. Enforced on store creation.
- Extra slots map to Stripe subscription line-item quantity (§2.6).

### 2.5 WhatsApp chip per store (both cases)
- `whatsapp_instances.tenant_id = store_id`. Add nullable `assigned_profile_id`:
  - **Dedicated**: one instance per Atendente, `assigned_profile_id = that atendente`. Multiple instances per store.
  - **Shared**: one instance, `assigned_profile_id = NULL`, all Atendentes act on it.
- Per-store settings (on store tenant): `chip_mode ∈ {dedicated, shared}`, `agent_signature_enabled BOOL`.
- When `agent_signature_enabled` and shared: outgoing message content is prefixed with the sender's display name in **bold** + colon, e.g. `**Yuri:** mensagem` (Chatwoot/Kommo pattern). Applied in the send path (`whatsapp-send-message` + provider send), using the sending profile's name. Off → customer sees only the company.

### 2.6 Billing (V2)
- New **monthly recurring** Stripe Price objects (not one-time, not annual):
  - `price_gerente_monthly` → **R$499,90/mês**, includes 5 store slots.
  - `price_store_slot_monthly` → **R$99,90/mês** per extra store slot (quantity = extra slots).
- Checkout for a Gerente account: `line_items = [{price: gerente, qty: 1}]` (+ optional slot line when buying extras). Extra-slot purchase = update subscription quantity for the slot price.
- Env: replace single `STRIPE_PRICE_ID` with `STRIPE_PRICE_GERENTE` + `STRIPE_PRICE_STORE_SLOT`. `plan_type='gerente'`. Persist slot count on the account tenant from the subscription.
- Retire the R$29,90 independent-store price (keep webhook idempotency + historical logs).
- Coupons/promotions: Stripe promotion codes (already enabled) managed by Superadmin. Affiliate commissions → **Rewardful** (external, out of scope here).

### 2.7 Account creation
- **Gerente**: self-serve signup **re-enabled** with a **3-day free trial**, then billing to continue. (Note: `App.tsx` currently redirects `/register` → `/auth`; this must be re-opened for Gerente signup only.)
- **Gestor / Atendente**: invite-only by the Gerente via email (`manage-user` `create` → `inviteUserByEmail`). Never self-serve.
- Trial/access gate (`tenant_access_events` / paywall) applies at the **account (Gerente)** level.

### 2.8 Affiliate program removal (data preserved)
- Remove routes, menu entries, and active in-app logic/UI: `CommissionPayments.tsx`, `TransactionStatistics.tsx` (affiliate parts), affiliate sections of `StripeConfiguration.tsx` / `components/integrations/StripeIntegration.tsx` / `AdminDashboard.tsx` / `TeamPage.tsx` / `IntegrationSettings.tsx` (exact surface to be enumerated in Phase 4).
- Neutralize `handle_new_user()` auto-affiliate creation.
- **DO NOT DROP** tables: `affiliates, affiliate_referrals, coupons (if affiliate-linked), commission_payments, commission_calculations, affiliate_stripe_accounts`. Data stays at rest (Reno's explicit decision; commissions move to Rewardful).

---

## 3. Change map (what gets touched)

### 3.1 Database / migrations (additive, backward-compatible)
1. `ALTER TYPE user_role ADD VALUE 'gerente','gestor','atendente'` (non-transactional step, separate migration).
2. Backfill `profiles.role`: `agencia→gerente`, `loja→gestor`. (No existing atendente.)
3. Update `profiles_role_modern_only` CHECK → {superadmin, gerente, gestor, atendente}. Keep old values in enum (Postgres can't drop) — only the constraint gates writes. Drop old-name constraint acceptance **only after** all reads/writes use new names.
4. `tenants`: add `kind ∈ {account, store}` (backfill: agência-owned roots = account, children = store), `store_slots_included`, `store_slots_extra`, per-store `chip_mode`, `agent_signature_enabled` (store settings can live in `settings` JSONB or dedicated columns — decide in Phase 2).
5. `whatsapp_instances`: add `assigned_profile_id` (nullable FK profiles).
6. Capabilities: a `role_capabilities` defaults table (role → jsonb) **and/or** `profiles.capabilities` JSONB overrides. (Chosen shape finalized in Phase 2; must keep campaign flag adjustable without schema change.)
7. Helper functions: rename/alias `is_agencia→is_gerente`, `is_loja→is_gestor`, add `is_gestor/is_atendente`, keep temporary aliases. Extend scope helpers so Gestor/Atendente = own store, Gerente = `get_my_child_tenant_ids()`.
8. Rewrite RLS policies that reference `'agencia'`/`'loja'` literals (`profiles_insert_hierarchy`, `profiles_account_manager_descendants_update`, `stripe_config`, `stripe_transactions`, `tenant_module_settings` x3, plus any others found in a full sweep). Add Atendente operational-only restrictions (deny users/whatsapp-config/billing tables).
9. Enforce caps: 1 Gestor + ≤5 Atendentes per store; store count ≤ slot capacity.

### 3.2 Edge Functions
- **`manage-user`** (critical fix): new `UserRole = superadmin|gerente|gestor|atendente`; `ensureCanCreate` (superadmin→any; gerente→gestor/atendente in its own stores; gestor→atendente in its store; atendente→none); resolve store `tenant_id`/`parent_id`; enforce per-store caps.
- **`create-checkout-session`**: new prices + optional slot line item; `plan_type='gerente'`.
- **`stripe-webhook`**: persist slot quantity → account tenant; `plan_type='gerente'`.
- **`whatsapp-send-message`** (+ provider send): apply agent-signature prefix when store setting is on.
- Sweep all functions for hardcoded old role names.

### 3.3 Frontend
- `src/types/userHierarchy.ts`: `UserRole = superadmin|gerente|gestor|atendente`; update `ROLE_ORDER`, `ROLE_LABELS` (pt-BR), `normalizeRole` (agencia→gerente, loja→gestor, + older legacy); add capability helpers (`can(cap)`, `useCan(cap)`).
- Guards: keep `RoleGuard`; add capability-based gating for tab/action level (hide dispatch button, budget fields, store-admin, whatsapp config, billing from Atendente).
- Phase 4 UI: store switcher (Gerente), invite screen (Gestor/Atendente), cross-store metrics comparison, extra-slot purchase flow, affiliate UI removal.

---

## 4. Mario / Camila / EncaixaRH migration (Phase 3 — designed later, not now)
Target end state:
- Mario → **Gerente** account (`kind='account'`, 5 slots).
- EncaixaRH → **store** (`kind='store'`, `parent_tenant_id = Mario's account`), **all real data intact** (conversations, contacts, automations) and **WhatsApp chip connection unbroken** (`whatsapp_instances` row stays attached to the EncaixaRH store tenant, untouched credentials).
- Camila → **Gestora** of EncaixaRH only (role=gestor, `tenant_id = EncaixaRH store`), no visibility into any other Mario store.

This **unbundles one entity into two** (account-person vs store-container). It will be built as an idempotent, dry-run-first script, executed against a staging copy first, and only run on prod after (a) a fresh backup and (b) Reno's explicit written "sim, pode migrar produção". Requires the live read-only verification noted in §0 first.

---

## 5. Build order (unchanged from brief)
1. **Phase 1** — this spec + pt-BR summary → wait for go-ahead. ← we are here
2. **Phase 2** — implement foundation (schema/RLS/functions/guards/Stripe prices). Structure only, no prod data. Test.
3. **Phase 3** — Mario/Camila/EncaixaRH migration under hard safety rules.
4. **Phase 4** — UI (switcher, invites, cross-store metrics, slot purchase, affiliate removal).

## 6. Open items needing Reno
1. **Campaigns × Atendente** default (§2.2) — confirm view=✓ / budget=✗ / dispatch=✗.
2. Go-ahead to start **Phase 2**.
