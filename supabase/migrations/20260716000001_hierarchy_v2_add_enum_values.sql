-- =============================================================================
-- Hierarchy V2 — Step A: add new enum values (gerente, gestor, atendente)
-- =============================================================================
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block in Postgres,
-- so it lives in its own migration, separate from 20260716000002 (Step B).
--
-- New canonical hierarchy: superadmin > gerente > gestor > atendente.
-- Mapping from the current 3-level model: agencia→gerente, loja→gestor.
-- `atendente` is brand new (operational-only inside one store).
--
-- Old values (agencia, loja, account_manager, enterprise, user, super_admin,
-- tenant_admin, tenant_user) STAY in the enum — Postgres has no DROP VALUE.
-- They are gated out of `profiles.role` by the CHECK constraint updated in
-- Step B. This addition is inert until Step B backfills + re-points helpers.
--
-- Rollback: none needed for this file. If Step B is not merged, these values
-- remain orphan but harmless. Do NOT attempt to remove enum values.
-- =============================================================================

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'gerente';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'gestor';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'atendente';
