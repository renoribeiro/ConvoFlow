-- =============================================================================
-- Fase 0.1 — Adiciona valores 'agencia' e 'loja' ao enum user_role
-- =============================================================================
-- Estes valores complementam os existentes: superadmin/account_manager/enterprise/user.
-- ALTER TYPE ADD VALUE NÃO pode rodar dentro de transação — por isso esta migration
-- está separada da seguinte (20260513140100).
--
-- Rollback: Postgres não tem DROP VALUE. Como ninguém usa esses valores ainda,
-- a migration B (seguinte) é quem efetivamente "ativa" eles. Se a migration B
-- falhar, basta NÃO mergear; os valores ficam órfãos mas inofensivos.
-- =============================================================================

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'agencia';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'loja';
