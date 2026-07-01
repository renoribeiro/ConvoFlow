-- =============================================================================
-- Paywall / liberação de acesso por Conta + auditoria
-- =============================================================================
-- Objetivo (2026-06-30):
--   - Lojas só acessam o sistema se a Conta tiver acesso liberado:
--       * PAGO    → tenants.subscription_status = 'active' (Stripe, Fase 2), ou
--       * MANUAL  → tenants.manual_access_granted = true (liberado por superadmin)
--   - Registrar QUEM liberou manualmente e QUANDO (e o histórico de eventos).
--
-- A trava em si é aplicada no frontend (DashboardLayout/useTenantAccess) para
-- lojas. Superadmin e Agência têm bypass. Esta migration só adiciona o
-- rastro de auditoria — não altera RLS das tabelas operacionais.
-- =============================================================================

BEGIN;

-- 1. Quem liberou manualmente e quando (estado atual, na própria Conta).
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS manual_access_granted_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS manual_access_granted_at timestamptz;

-- 2. Histórico completo de eventos de acesso (auditoria).
CREATE TABLE IF NOT EXISTS public.tenant_access_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  action        text NOT NULL CHECK (action IN ('granted', 'revoked', 'paid', 'canceled')),
  source        text NOT NULL CHECK (source IN ('manual', 'stripe')),
  actor_user_id uuid REFERENCES auth.users(id),  -- superadmin que fez (manual); NULL p/ stripe
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_access_events_tenant
  ON public.tenant_access_events (tenant_id, created_at DESC);

ALTER TABLE public.tenant_access_events ENABLE ROW LEVEL SECURITY;

-- Superadmin: acesso total ao histórico.
DROP POLICY IF EXISTS "access_events_superadmin_all" ON public.tenant_access_events;
CREATE POLICY "access_events_superadmin_all" ON public.tenant_access_events
  FOR ALL TO authenticated
  USING (public.is_super_admin_safe())
  WITH CHECK (public.is_super_admin_safe());

-- Membros da Conta podem LER o histórico da própria Conta.
DROP POLICY IF EXISTS "access_events_tenant_read" ON public.tenant_access_events;
CREATE POLICY "access_events_tenant_read" ON public.tenant_access_events
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_user_tenant_id());

COMMIT;

-- =============================================================================
-- OPCIONAL — "grandfathering": liberar as Contas já existentes como liberação
-- MANUAL feita por um superadmin (para não trancá-las de uma vez). Troque o
-- e-mail abaixo pelo superadmin que deve constar como autor da liberação.
-- =============================================================================
-- UPDATE public.tenants t
--   SET manual_access_granted = true,
--       manual_access_granted_by = (SELECT id FROM auth.users WHERE email = 'reno@re9.online' LIMIT 1),
--       manual_access_granted_at = now()
--   WHERE t.manual_access_granted IS DISTINCT FROM true;
--
-- INSERT INTO public.tenant_access_events (tenant_id, action, source, actor_user_id, note)
--   SELECT t.id, 'granted', 'manual',
--          (SELECT id FROM auth.users WHERE email = 'reno@re9.online' LIMIT 1),
--          'Grandfathering na migração 20260630000001'
--   FROM public.tenants t;
