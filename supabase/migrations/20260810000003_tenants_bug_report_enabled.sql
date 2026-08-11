-- =============================================================================
-- Relatar Bug — feature flag por Conta: tenants.bug_report_enabled
-- =============================================================================
-- Liga/desliga o botão "Relatar um problema" na Navbar por Conta (ou por Loja,
-- já que ambas são linhas de public.tenants). Default true: o comportamento
-- atual de toda Conta existente é "habilitado".
--
-- O BugReportButton lê esta coluna na montagem e retorna null quando false.
-- A UI de toggle do superadmin NÃO faz parte desta entrega — apenas a coluna.
-- Enquanto não existir toggle, o superadmin desliga por SQL:
--   UPDATE public.tenants SET bug_report_enabled = false WHERE id = '<uuid>';
--
-- Nenhuma policy nova é necessária: a leitura usa as policies de SELECT já
-- existentes em public.tenants ("Users can view own tenant" + superadmin).
-- =============================================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS bug_report_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.tenants.bug_report_enabled IS
  'Quando false, oculta o botão "Relatar um problema" da Navbar para os usuários desta Conta/Loja. Default true.';

-- =============================================================================
-- ROLLBACK
--   ALTER TABLE public.tenants DROP COLUMN IF EXISTS bug_report_enabled;
-- =============================================================================
