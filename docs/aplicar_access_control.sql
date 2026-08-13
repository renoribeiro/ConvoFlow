-- =============================================================================
-- ConvoFlow — aplicar o conserto de controle de acesso (projeto pqjkuwyshybxldzpfbbs)
-- Rodar de uma vez no SQL Editor do Supabase. É transacional: ou entra tudo, ou
-- não entra nada. Idempotente: rodar duas vezes não quebra.
--
-- Equivale a:
--   supabase/migrations/20260813000004_profile_status_source_of_truth.sql
--   supabase/migrations/20260813000005_capability_enforcement_rls.sql
--
-- NÃO rodar `supabase db push` neste projeto: 81 migrations locais não estão no
-- ledger e algumas mexem em dado real de usuário.
--
-- -----------------------------------------------------------------------------
-- ANTES DE RODAR — confira quem seria afetado (rode fora da transação):
-- -----------------------------------------------------------------------------
--   SELECT p.status, p.is_active, p.role, count(*) AS perfis,
--          count(u.last_sign_in_at) AS ja_entraram
--     FROM public.profiles p
--     JOIN auth.users u ON u.id = p.user_id
--    GROUP BY 1,2,3 ORDER BY 1,3;
--
-- Em 2026-08-13 isso devolvia 7 perfis: 5 'active' e 2 'pending' — e os DOIS
-- 'pending' usavam o sistema normalmente. O passo 2 abaixo promove esses dois
-- para 'active' justamente para que o novo bloqueio não os tranque para fora.
-- =============================================================================

BEGIN;

-- #############################################################################
-- PARTE 1/2 — profiles.status vira a fonte da verdade
-- #############################################################################

-- ---------------------------------------------------------------------------
-- 1. Intenção do convite ("Usuário ativo" marcado ou não)
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS invite_intent_active boolean NULL;

COMMENT ON COLUMN public.profiles.invite_intent_active IS
  'Intenção do admin no momento do convite (checkbox "Usuário ativo"). NULL/true = ao aceitar o convite o usuário vira active; false = vira suspended. Lida uma única vez, pelo trigger on_auth_user_confirmed.';

-- ---------------------------------------------------------------------------
-- 2. Backfill A — não trancar para fora quem JÁ usa o sistema
--    (quem confirmou o e-mail e já entrou pelo menos uma vez)
-- ---------------------------------------------------------------------------
UPDATE public.profiles p
   SET status = 'active'
  FROM auth.users u
 WHERE u.id = p.user_id
   AND p.status = 'pending'
   AND u.email_confirmed_at IS NOT NULL
   AND u.last_sign_in_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. CHECK em status
--    'deleted' entra na lista porque o botão Excluir do painel já grava esse
--    valor (manage-user action='soft_delete'). Não é estado de uso — é lápide.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_status_valid'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_status_valid
      CHECK (status IN ('pending', 'active', 'suspended', 'deleted'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Backfill B — is_active vira espelho fiel de status
-- ---------------------------------------------------------------------------
UPDATE public.profiles
   SET is_active = (status = 'active')
 WHERE is_active IS DISTINCT FROM (status = 'active');

-- ---------------------------------------------------------------------------
-- 5. Triggers que mantêm o espelho nos dois sentidos
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_profile_is_active()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  NEW.is_active := (NEW.status = 'active');
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.sync_profile_is_active() IS
  'Deriva profiles.is_active de profiles.status. status é a fonte da verdade; is_active é espelho de retrocompatibilidade.';

DROP TRIGGER IF EXISTS sync_profile_is_active_trigger ON public.profiles;
CREATE TRIGGER sync_profile_is_active_trigger
  BEFORE INSERT OR UPDATE OF status ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_is_active();

CREATE OR REPLACE FUNCTION public.force_profile_is_active()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  NEW.is_active := (NEW.status = 'active');
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.force_profile_is_active() IS
  'Descarta escrita direta em profiles.is_active, recalculando a partir de status. Garante que o par nunca se separe.';

DROP TRIGGER IF EXISTS force_profile_is_active_trigger ON public.profiles;
CREATE TRIGGER force_profile_is_active_trigger
  BEFORE UPDATE OF is_active ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.force_profile_is_active();

-- ---------------------------------------------------------------------------
-- 6. handle_new_user persiste a intenção do convite
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_role         public.user_role;
  v_tenant_id    UUID;
  v_parent_id    UUID;
  v_status       TEXT;
  v_first_name   TEXT;
  v_last_name    TEXT;
  v_phone        TEXT;
  v_intent       BOOLEAN;
BEGIN
  v_first_name := NEW.raw_user_meta_data ->> 'first_name';
  v_last_name  := NEW.raw_user_meta_data ->> 'last_name';
  v_phone      := NEW.raw_user_meta_data ->> 'phone';
  v_status     := COALESCE(NEW.raw_user_meta_data ->> 'status', 'pending');
  v_intent     := NULLIF(NEW.raw_user_meta_data ->> 'invite_intent_active', '')::BOOLEAN;
  v_role := COALESCE((NEW.raw_user_meta_data ->> 'role')::public.user_role, 'gestor'::public.user_role);
  v_tenant_id := NULLIF(NEW.raw_user_meta_data ->> 'tenant_id', '')::UUID;
  v_parent_id := NULLIF(NEW.raw_user_meta_data ->> 'parent_id', '')::UUID;

  IF v_role <> 'superadmin'::public.user_role AND v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id e obrigatorio no raw_user_meta_data para role %', v_role;
  END IF;

  INSERT INTO public.profiles (
    user_id, tenant_id, role, first_name, last_name, phone, parent_id, status,
    invite_intent_active
  )
  VALUES (
    NEW.id, v_tenant_id, v_role, v_first_name, v_last_name, v_phone, v_parent_id, v_status,
    v_intent
  );
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7. Aceite do convite: pending → active (marcado) ou suspended (desmarcado)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_user_confirmed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  UPDATE public.profiles
     SET status = CASE
                    WHEN COALESCE(invite_intent_active, TRUE) THEN 'active'
                    ELSE 'suspended'
                  END
   WHERE user_id = NEW.id
     AND status = 'pending';
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.handle_user_confirmed() IS
  'Conclui o convite: ao confirmar o e-mail e entrar pela primeira vez, o perfil sai de pending. Vai para active se o admin deixou "Usuário ativo" marcado (invite_intent_active NULL ou true) e para suspended se desmarcou.';

DROP TRIGGER IF EXISTS on_auth_user_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_confirmed
  AFTER UPDATE OF email_confirmed_at, last_sign_in_at ON auth.users
  FOR EACH ROW
  WHEN (NEW.email_confirmed_at IS NOT NULL AND NEW.last_sign_in_at IS NOT NULL)
  EXECUTE FUNCTION public.handle_user_confirmed();

-- ---------------------------------------------------------------------------
-- 8. admin_users_view expõe status (p.status acrescentado no fim)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.admin_users_view AS
  SELECT au.id,
         au.email,
         au.created_at,
         au.last_sign_in_at,
         au.email_confirmed_at,
         p.tenant_id,
         p.first_name,
         p.last_name,
         p.role,
         p.is_active,
         p.phone,
         p.updated_at AS profile_updated_at,
         t.name AS tenant_name,
         t.manual_access_granted,
         p.status
    FROM ((auth.users au
      LEFT JOIN public.profiles p ON ((au.id = p.user_id)))
      LEFT JOIN public.tenants t ON ((p.tenant_id = t.id)))
   WHERE ((au.deleted_at IS NULL) AND (EXISTS ( SELECT 1
              FROM public.profiles current_user_profile
             WHERE ((current_user_profile.user_id = auth.uid())
               AND (current_user_profile.role = 'superadmin'::public.user_role)))))
   ORDER BY au.created_at DESC;

-- #############################################################################
-- PARTE 2/2 — permissões por role passam a valer no banco
-- #############################################################################

-- ---------------------------------------------------------------------------
-- 9. Role normalizada do usuário atual (NULL se status != active)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_capability_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT CASE p.role::text
           WHEN 'superadmin'      THEN 'superadmin'
           WHEN 'super_admin'     THEN 'superadmin'
           WHEN 'gerente'         THEN 'gerente'
           WHEN 'agencia'         THEN 'gerente'
           WHEN 'account_manager' THEN 'gerente'
           WHEN 'gestor'          THEN 'gestor'
           WHEN 'loja'            THEN 'gestor'
           WHEN 'enterprise'      THEN 'gestor'
           WHEN 'tenant_admin'    THEN 'gestor'
           WHEN 'tenant_user'     THEN 'gestor'
           WHEN 'user'            THEN 'gestor'
           WHEN 'atendente'       THEN 'atendente'
           ELSE NULL
         END
    FROM public.profiles p
   WHERE p.user_id = auth.uid()
     AND p.status = 'active'
   LIMIT 1;
$function$;

COMMENT ON FUNCTION public.current_capability_role() IS
  'Role do usuário logado normalizada para o enum atual (superadmin/gerente/gestor/atendente). NULL se não há perfil ou se o status não é active.';

-- ---------------------------------------------------------------------------
-- 10. has_capability — a matriz de permissões, em SQL
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_capability(p_capability text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_role      text;
  v_overrides jsonb;
  v_override  text;
BEGIN
  IF p_capability IS NULL THEN
    RETURN FALSE;
  END IF;

  v_role := public.current_capability_role();
  IF v_role IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT p.capabilities INTO v_overrides
    FROM public.profiles p
   WHERE p.user_id = auth.uid()
   LIMIT 1;

  IF v_overrides IS NOT NULL AND jsonb_exists(v_overrides, p_capability) THEN
    v_override := v_overrides ->> p_capability;
    IF v_override IN ('true', 'false') THEN
      RETURN v_override = 'true';
    END IF;
  END IF;

  RETURN CASE
    WHEN p_capability IN (
      'conversations.handle', 'contacts.manage',
      'automations.operate', 'campaigns.view_convos'
    ) THEN TRUE
    WHEN p_capability IN (
      'campaigns.budget', 'campaigns.dispatch',
      'store.admin', 'whatsapp.configure',
      'billing.manage'
    ) THEN v_role <> 'atendente'
    WHEN p_capability IN (
      'billing.view', 'stores.switch', 'stores.compare'
    ) THEN v_role IN ('superadmin', 'gerente')
    WHEN p_capability = 'platform.ops' THEN v_role = 'superadmin'
    ELSE FALSE
  END;
END;
$function$;

COMMENT ON FUNCTION public.has_capability(text) IS
  'Matriz de permissões por role, em SQL. Espelha DEFAULT_CAPABILITIES de src/types/userHierarchy.ts e de supabase/functions/_shared/capabilities.ts. Aplica overrides de profiles.capabilities. FALSE para capability desconhecida, perfil ausente ou status != active.';

REVOKE ALL ON FUNCTION public.has_capability(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_capability(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_capability(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 11. Conta parada não enxerga dado (bloqueio no banco, não só na tela)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_current_user_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT tenant_id FROM public.profiles
   WHERE user_id = auth.uid()
     AND status = 'active';
$function$;

COMMENT ON FUNCTION public.get_current_user_tenant_id() IS
  'Conta (tenant) do usuário logado. NULL quando o perfil não existe ou o status não é active — o que faz todas as policies tenant_id = get_current_user_tenant_id() negarem para conta suspensa/pendente.';

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE user_id = auth.uid()
       AND role = 'superadmin'::public.user_role
       AND status = 'active'
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_super_admin_safe()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE user_id = auth.uid()
       AND role = 'superadmin'::public.user_role
       AND status = 'active'
  );
$function$;

-- ---------------------------------------------------------------------------
-- 12. Campanhas — todo mundo lê, só quem tem campaigns.dispatch escreve
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can access own tenant campaigns" ON public.mass_message_campaigns;
DROP POLICY IF EXISTS "campaigns_tenant_select" ON public.mass_message_campaigns;
DROP POLICY IF EXISTS "campaigns_tenant_insert" ON public.mass_message_campaigns;
DROP POLICY IF EXISTS "campaigns_tenant_update" ON public.mass_message_campaigns;
DROP POLICY IF EXISTS "campaigns_tenant_delete" ON public.mass_message_campaigns;

CREATE POLICY "campaigns_tenant_select" ON public.mass_message_campaigns
  FOR SELECT USING (tenant_id = public.get_current_user_tenant_id());

CREATE POLICY "campaigns_tenant_insert" ON public.mass_message_campaigns
  FOR INSERT WITH CHECK (
    tenant_id = public.get_current_user_tenant_id()
    AND public.has_capability('campaigns.dispatch')
  );

CREATE POLICY "campaigns_tenant_update" ON public.mass_message_campaigns
  FOR UPDATE
  USING (
    tenant_id = public.get_current_user_tenant_id()
    AND public.has_capability('campaigns.dispatch')
  )
  WITH CHECK (
    tenant_id = public.get_current_user_tenant_id()
    AND public.has_capability('campaigns.dispatch')
  );

CREATE POLICY "campaigns_tenant_delete" ON public.mass_message_campaigns
  FOR DELETE USING (
    tenant_id = public.get_current_user_tenant_id()
    AND public.has_capability('campaigns.dispatch')
  );

-- ---------------------------------------------------------------------------
-- 13. Execuções de campanha — mesma regra
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can access own tenant campaign executions" ON public.campaign_executions;
DROP POLICY IF EXISTS "campaign_executions_tenant_select" ON public.campaign_executions;
DROP POLICY IF EXISTS "campaign_executions_tenant_insert" ON public.campaign_executions;
DROP POLICY IF EXISTS "campaign_executions_tenant_update" ON public.campaign_executions;
DROP POLICY IF EXISTS "campaign_executions_tenant_delete" ON public.campaign_executions;

CREATE POLICY "campaign_executions_tenant_select" ON public.campaign_executions
  FOR SELECT USING (tenant_id = public.get_current_user_tenant_id());

CREATE POLICY "campaign_executions_tenant_insert" ON public.campaign_executions
  FOR INSERT WITH CHECK (
    tenant_id = public.get_current_user_tenant_id()
    AND public.has_capability('campaigns.dispatch')
  );

CREATE POLICY "campaign_executions_tenant_update" ON public.campaign_executions
  FOR UPDATE
  USING (
    tenant_id = public.get_current_user_tenant_id()
    AND public.has_capability('campaigns.dispatch')
  )
  WITH CHECK (
    tenant_id = public.get_current_user_tenant_id()
    AND public.has_capability('campaigns.dispatch')
  );

CREATE POLICY "campaign_executions_tenant_delete" ON public.campaign_executions
  FOR DELETE USING (
    tenant_id = public.get_current_user_tenant_id()
    AND public.has_capability('campaigns.dispatch')
  );

-- ---------------------------------------------------------------------------
-- 14. Instâncias de WhatsApp — atendente usa, não configura
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can access own tenant whatsapp instances" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "whatsapp_instances_tenant_select" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "whatsapp_instances_tenant_insert" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "whatsapp_instances_tenant_update" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "whatsapp_instances_tenant_delete" ON public.whatsapp_instances;

CREATE POLICY "whatsapp_instances_tenant_select" ON public.whatsapp_instances
  FOR SELECT USING (tenant_id = public.get_current_user_tenant_id());

CREATE POLICY "whatsapp_instances_tenant_insert" ON public.whatsapp_instances
  FOR INSERT WITH CHECK (
    tenant_id = public.get_current_user_tenant_id()
    AND public.has_capability('whatsapp.configure')
  );

CREATE POLICY "whatsapp_instances_tenant_update" ON public.whatsapp_instances
  FOR UPDATE
  USING (
    tenant_id = public.get_current_user_tenant_id()
    AND public.has_capability('whatsapp.configure')
  )
  WITH CHECK (
    tenant_id = public.get_current_user_tenant_id()
    AND public.has_capability('whatsapp.configure')
  );

CREATE POLICY "whatsapp_instances_tenant_delete" ON public.whatsapp_instances
  FOR DELETE USING (
    tenant_id = public.get_current_user_tenant_id()
    AND public.has_capability('whatsapp.configure')
  );

-- ---------------------------------------------------------------------------
-- 15. Ledger — registra as duas, para o histórico não ficar mais fora de
--     sincronia do que já está.
-- ---------------------------------------------------------------------------
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES
  ('20260813000004', 'profile_status_source_of_truth'),
  ('20260813000005', 'capability_enforcement_rls')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- =============================================================================
-- VERIFICAÇÃO — rodar DEPOIS. Todas as linhas devem sair com 'ok'.
-- =============================================================================
-- SELECT 'ninguem trancado para fora' AS item,
--        count(*)::text || ' perfis nao-active que ja usavam' AS valor,
--        CASE WHEN count(*) = 0 THEN 'ok' ELSE 'ATENCAO' END AS status
--   FROM public.profiles p
--   JOIN auth.users u ON u.id = p.user_id
--  WHERE p.status <> 'active' AND u.last_sign_in_at IS NOT NULL
-- UNION ALL
-- SELECT 'is_active espelha status',
--        count(*)::text || ' linhas dessincronizadas',
--        CASE WHEN count(*) = 0 THEN 'ok' ELSE 'FALTA' END
--   FROM public.profiles
--  WHERE is_active IS DISTINCT FROM (status = 'active')
-- UNION ALL
-- SELECT 'constraint de status',
--        coalesce(max(conname::text), '-'),
--        CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FALTA' END
--   FROM pg_constraint
--  WHERE conname = 'profiles_status_valid'
-- UNION ALL
-- SELECT 'coluna invite_intent_active',
--        coalesce(max(column_name::text), '-'),
--        CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FALTA' END
--   FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'profiles'
--    AND column_name = 'invite_intent_active'
-- UNION ALL
-- SELECT 'triggers do espelho',
--        count(*)::text || ' de 2',
--        CASE WHEN count(*) = 2 THEN 'ok' ELSE 'FALTA' END
--   FROM pg_trigger
--  WHERE tgname IN ('sync_profile_is_active_trigger', 'force_profile_is_active_trigger')
-- UNION ALL
-- SELECT 'trigger de aceite do convite',
--        coalesce(max(tgname::text), '-'),
--        CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FALTA' END
--   FROM pg_trigger WHERE tgname = 'on_auth_user_confirmed'
-- UNION ALL
-- SELECT 'has_capability existe',
--        coalesce(max(proname::text), '-'),
--        CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FALTA' END
--   FROM pg_proc WHERE proname = 'has_capability' AND pronamespace = 'public'::regnamespace
-- UNION ALL
-- SELECT 'policies novas de escrita',
--        count(*)::text || ' de 9',
--        CASE WHEN count(*) = 9 THEN 'ok' ELSE 'FALTA' END
--   FROM pg_policies
--  WHERE schemaname = 'public'
--    AND policyname LIKE ANY (ARRAY['campaigns_tenant_%', 'campaign_executions_tenant_%', 'whatsapp_instances_tenant_%'])
--    AND cmd <> 'SELECT'
-- UNION ALL
-- SELECT 'status na admin_users_view',
--        CASE WHEN count(*) = 1 THEN 'presente' ELSE 'ausente' END,
--        CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FALTA' END
--   FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'admin_users_view' AND column_name = 'status';
--
-- -----------------------------------------------------------------------------
-- CONFERIR A MATRIZ EM SQL contra a do código (userHierarchy.ts / capabilities.ts)
-- -----------------------------------------------------------------------------
-- Não dá para testar has_capability() por fora sem uma sessão de cada role, mas
-- dá para ler a regra que ficou gravada:
--
--   SELECT prosrc FROM pg_proc
--    WHERE proname = 'has_capability' AND pronamespace = 'public'::regnamespace;
--
-- Confira que os quatro grupos batem com DEFAULT_CAPABILITIES:
--   sempre true            → conversations.handle, contacts.manage,
--                            automations.operate, campaigns.view_convos
--   todos menos atendente  → campaigns.budget, campaigns.dispatch, store.admin,
--                            whatsapp.configure, billing.manage
--   gerente para cima      → billing.view, stores.switch, stores.compare
--   só superadmin          → platform.ops
-- =============================================================================
