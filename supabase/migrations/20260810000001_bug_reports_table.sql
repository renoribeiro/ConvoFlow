-- =============================================================================
-- Relatar Bug — tabela public.bug_reports
-- =============================================================================
-- Registro de relatos de problema enviados pelos usuários a partir do botão
-- "Relatar um problema" da Navbar. Leitura é exclusiva do superadmin; o usuário
-- só escreve (nunca lê, edita ou apaga o próprio relato).
--
-- DECISÕES DE MODELAGEM (divergências deliberadas da especificação original):
--
--  1) NÃO existe tabela `stores` neste schema. Na hierarquia V2
--     (20260716000002_hierarchy_v2_foundation.sql) uma "Loja" é uma linha de
--     `public.tenants` com kind='store', ligada à Conta do gerente por
--     `tenants.parent_tenant_id`. Portanto `store_id` referencia
--     `public.tenants(id)` — não há outra tabela para apontar.
--
--  2) `user_role` guarda o RÓTULO pt-BR ('Gerente' | 'Gestor' | 'Atendente' |
--     'Superadmin') resolvido no frontend por `roleLabel()`. Fica sem CHECK de
--     propósito: a coluna é um registro histórico do que o usuário era no
--     momento do relato e não deve quebrar se a nomenclatura de roles mudar.
--
--  3) O INSERT aceita, além da própria Conta, uma Loja filha dela. Isso NÃO é
--     um afrouxamento: `useTenantId()` no frontend devolve a Conta/Loja ATIVA,
--     e um gerente com uma Loja selecionada no StoreSwitcher tem
--     `tenant_id != profiles.tenant_id`. A regra reproduz exatamente
--     `canUseActiveTenant()` do TenantContext. Sem isso, todo gerente com uma
--     Loja aberta receberia "new row violates row-level security policy".
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.bug_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Loja (tenants.kind='store') ativa no momento do relato, quando houver.
  store_id        uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email      text NOT NULL,
  user_role       text NOT NULL,
  description     text NOT NULL,
  -- URL assinada de longa duração (o bucket bug-reports é privado).
  attachment_url  text,
  attachment_type text CHECK (attachment_type IN ('image', 'video')),
  page_url        text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.bug_reports IS
  'Relatos de bug enviados pelos usuários (botão "Relatar um problema" da Navbar). Somente INSERT pelo usuário; SELECT exclusivo do superadmin; sem UPDATE/DELETE.';
COMMENT ON COLUMN public.bug_reports.store_id IS
  'Loja ativa no relato — linha de tenants com kind=''store''. Não existe tabela stores neste schema.';
COMMENT ON COLUMN public.bug_reports.user_role IS
  'Rótulo pt-BR da role no momento do relato (Gerente | Gestor | Atendente | Superadmin). Sem CHECK: é registro histórico.';
COMMENT ON COLUMN public.bug_reports.attachment_url IS
  'URL assinada (bucket privado bug-reports), validade de 1 ano. O path do objeto é recuperável do próprio link.';

-- Painel do superadmin lista por Conta e por data.
CREATE INDEX IF NOT EXISTS bug_reports_tenant_created_idx
  ON public.bug_reports (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bug_reports_created_idx
  ON public.bug_reports (created_at DESC);

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- SELECT — apenas superadmin.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "bug_reports_superadmin_select" ON public.bug_reports;
CREATE POLICY "bug_reports_superadmin_select" ON public.bug_reports
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- INSERT — usuário autenticado, sempre em nome de si mesmo, escopado à Conta
-- ativa permitida (própria, Loja filha da própria, ou qualquer uma p/ superadmin).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "bug_reports_tenant_insert" ON public.bug_reports;
CREATE POLICY "bug_reports_tenant_insert" ON public.bug_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      public.is_super_admin()
      OR tenant_id = public.get_current_user_tenant_id()
      OR EXISTS (
        SELECT 1
        FROM public.tenants t
        WHERE t.id = bug_reports.tenant_id
          AND t.parent_tenant_id = public.get_current_user_tenant_id()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Sem policy de UPDATE/DELETE: com RLS habilitado, a ausência de policy já
-- nega a operação para toda role sujeita a RLS. Os REVOKEs abaixo são defesa
-- em profundidade (caso alguém adicione uma policy permissiva por engano).
-- `service_role` continua ignorando RLS, como no resto do schema.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT ON public.bug_reports TO authenticated;
REVOKE UPDATE, DELETE ON public.bug_reports FROM authenticated;
REVOKE ALL ON public.bug_reports FROM anon;

COMMIT;

-- =============================================================================
-- ROLLBACK
--   DROP TABLE IF EXISTS public.bug_reports;
-- =============================================================================
