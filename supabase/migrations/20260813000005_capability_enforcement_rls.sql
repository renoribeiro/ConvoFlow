-- =============================================================================
-- Permissões por role deixam de ser só enfeite de tela
-- =============================================================================
-- O QUE ESTAVA QUEBRADO
--
--   A matriz de capabilities (src/types/userHierarchy.ts) descrevia quatro
--   níveis com poderes diferentes, mas no banco GESTOR e ATENDENTE eram a
--   MESMA COISA: as policies de conversas, contatos, mensagens, campanhas e
--   instâncias de WhatsApp diziam apenas
--
--       tenant_id = get_current_user_tenant_id()
--
--   sem olhar a role. Ou seja: o atendente era escondido na interface, mas uma
--   chamada direta ao PostgREST (ou o DevTools) disparava campanha, mexia em
--   orçamento e reconfigurava o número de WhatsApp da Loja. Essa era a
--   vulnerabilidade de verdade — o resto era cosmético.
--
--   Só UMA capability tinha alguma checagem no servidor (store.admin, dentro da
--   RPC set_tenant_settings). As outras doze, nenhuma.
--
-- O QUE ESTA MIGRAÇÃO FAZ
--
--   1. public.has_capability(text) — a matriz escrita UMA vez em SQL, com os
--      mesmos defaults do front e respeitando overrides de profiles.capabilities.
--   2. Exige status='active' nas três funções que sustentam todo o RLS
--      (get_current_user_tenant_id, is_super_admin, is_super_admin_safe). É o
--      lado servidor do bloqueio de login: usuário suspenso/pendente para de
--      enxergar dado, não importa por onde entre.
--   3. Separa leitura de escrita em campanhas, execuções de campanha e
--      instâncias de WhatsApp: todo mundo da Conta lê, só quem tem a capability
--      escreve.
--
-- ESPELHOS — a mesma matriz existe em três lugares e precisam concordar:
--   src/types/userHierarchy.ts               → esconde na UI
--   supabase/functions/_shared/capabilities.ts → nega nas edge functions
--   public.has_capability(text)              → nega no banco  (este arquivo)
--
-- SEGURANÇA DA MUDANÇA (consulta ao banco de produção em 2026-08-13):
--   roles existentes hoje → superadmin 3, gerente 2, gestor 2, atendente 0.
--   Como não existe NENHUM atendente ainda, apertar o RLS do atendente não tira
--   acesso de ninguém que esteja trabalhando. E, depois do backfill da migração
--   20260813000004, os 7 perfis ficam com status='active' — então exigir
--   'active' também não tranca ninguém.
--
-- O QUE ESTA MIGRAÇÃO NÃO FAZ (de propósito)
--
--   stores.switch / stores.compare: já estão corretos. As policies de SELECT em
--   public.tenants são "própria Conta" (gestor/atendente), "descendentes"
--   (gerente) e "todas" (superadmin) — um gestor ou atendente JÁ não enxerga a
--   linha de outra Loja. Não há o que apertar, e mexer aí arriscaria o paywall,
--   que lê tenants.subscription_status.
--
-- Idempotente de propósito — o histórico de migrations deste projeto está
-- dessincronizado e esta pode rodar depois de já ter sido aplicada à mão.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Role normalizada do usuário atual
-- -----------------------------------------------------------------------------
-- O enum public.user_role ainda carrega os nomes legados (agencia, loja, user,
-- enterprise, account_manager...). Mesmo mapeamento de normalizeRole() no front.
-- Retorna NULL para quem não tem perfil OU cujo status não é 'active' — sem
-- perfil ativo, nenhuma capability.
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

-- -----------------------------------------------------------------------------
-- 2. has_capability — a matriz, em SQL
-- -----------------------------------------------------------------------------
-- Capability desconhecida devolve FALSE (fecha por padrão). Overrides por
-- usuário em profiles.capabilities (jsonb) ganham do default da role, igual ao
-- resolveCapabilities() do front.
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
    -- Operação do dia a dia: todo mundo da Loja.
    WHEN p_capability IN (
      'conversations.handle', 'contacts.manage',
      'automations.operate', 'campaigns.view_convos'
    ) THEN TRUE

    -- Poder pleno sobre a Loja: todos menos o atendente.
    WHEN p_capability IN (
      'campaigns.budget', 'campaigns.dispatch',
      'store.admin', 'whatsapp.configure',
      'billing.manage'
    ) THEN v_role <> 'atendente'

    -- Escopo de grupo: gerente para cima.
    WHEN p_capability IN (
      'billing.view', 'stores.switch', 'stores.compare'
    ) THEN v_role IN ('superadmin', 'gerente')

    -- Operação de plataforma: só superadmin.
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

-- -----------------------------------------------------------------------------
-- 3. Conta parada não enxerga dado — nas três funções que sustentam o RLS
-- -----------------------------------------------------------------------------
-- get_current_user_tenant_id() aparece em ~20 policies como
-- `tenant_id = get_current_user_tenant_id()`. Devolvendo NULL para quem não
-- está 'active', a comparação vira NULL (nunca true) e TODAS elas negam de uma
-- vez. É o ponto único onde o bloqueio de conta suspensa passa a valer no
-- banco, sem reescrever policy por policy.
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

-- -----------------------------------------------------------------------------
-- 4. Campanhas — atendente lê, não dispara e não mexe em orçamento
-- -----------------------------------------------------------------------------
-- campaigns.view_convos (true para atendente) = ver. campaigns.dispatch e
-- campaigns.budget (false para atendente) = escrever. As duas têm exatamente os
-- mesmos valores na matriz, e orçamento é coluna da mesma linha da campanha —
-- então o controle por linha na escrita cobre as duas sem precisar de grant por
-- coluna.
--
-- A policy antiga era FOR ALL (leitura e escrita juntas); ela é substituída por
-- quatro. A de superadmin ("Super admins can access all campaigns") continua
-- como está.
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

-- -----------------------------------------------------------------------------
-- 5. Execuções de campanha — mesma regra
-- -----------------------------------------------------------------------------
-- Enfileirar destinatário É disparar campanha. O worker
-- (process-campaign-dispatch) roda com service_role e passa por cima do RLS,
-- então o cron não é afetado por nada disto.
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

-- -----------------------------------------------------------------------------
-- 6. Instâncias de WhatsApp — atendente usa, não configura
-- -----------------------------------------------------------------------------
-- O atendente precisa LER a instância (é ela que manda a mensagem da conversa
-- que ele está atendendo), mas conectar, trocar credencial, apagar ou apontar
-- para outro provedor é whatsapp.configure.
--
-- Os webhooks (evolution-webhook, waha-webhook, meta-webhook) e o job-worker
-- usam service_role e passam por cima do RLS — recebimento de mensagem não é
-- afetado.
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

-- =============================================================================
-- ROLLBACK
--   DROP POLICY IF EXISTS "campaigns_tenant_select"   ON public.mass_message_campaigns;
--   DROP POLICY IF EXISTS "campaigns_tenant_insert"   ON public.mass_message_campaigns;
--   DROP POLICY IF EXISTS "campaigns_tenant_update"   ON public.mass_message_campaigns;
--   DROP POLICY IF EXISTS "campaigns_tenant_delete"   ON public.mass_message_campaigns;
--   CREATE POLICY "Users can access own tenant campaigns" ON public.mass_message_campaigns
--     FOR ALL USING (tenant_id = public.get_current_user_tenant_id());
--   (idem campaign_executions e whatsapp_instances)
--   E recriar get_current_user_tenant_id/is_super_admin/is_super_admin_safe sem
--   o `AND status = 'active'`.
-- =============================================================================
