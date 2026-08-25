-- =============================================================================
-- RECONSTRUÍDA em 2026-08-24 a partir do estado vivo do banco.
-- =============================================================================
-- Esta versão existia no ledger (`20250818082851`) sem nenhum arquivo local.
-- Extraída do catálogo do PostgreSQL em 2026-08-24. NÃO é o texto original.
-- Idempotente: já está aplicada, rodar de novo é no-op.
--
-- -----------------------------------------------------------------------------
-- ⚠️  ESTE NÃO É O SISTEMA DE MÓDULOS QUE O PRODUTO USA
-- -----------------------------------------------------------------------------
-- Quem alimenta o `ModuleGuard` hoje é a tabela `module_settings`
-- (migração `20250819000000_create_module_settings_table.sql`, via `useModules`).
--
-- Este trio — system_modules / tenant_module_settings / tenant_active_modules —
-- é um segundo sistema, paralelo e morto. Conferido em 2026-08-24: aparece
-- APENAS no `src/integrations/supabase/types.ts`, que é gerado automaticamente
-- a partir do banco. Nenhum código de aplicação lê ou escreve nessas tabelas.
--
-- Linhas: system_modules=12 (catálogo semeado abaixo), tenant_module_settings=0.
-- Zero linhas em tenant_module_settings é a prova de que nunca foi usado.
--
-- Está aqui porque existe no banco e um rebuild precisa reproduzi-lo.
-- Apagar é decisão do dono do projeto, em script próprio.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.system_modules (
  id           uuid DEFAULT gen_random_uuid() NOT NULL,
  name         character varying(100) NOT NULL,
  display_name character varying(200) NOT NULL,
  description  text,
  route        character varying(200) NOT NULL,
  icon         character varying(100),
  is_essential boolean DEFAULT false,
  is_active    boolean DEFAULT true,
  sort_order   integer DEFAULT 0,
  created_at   timestamp with time zone DEFAULT now(),
  updated_at   timestamp with time zone DEFAULT now()
);
DO $$ BEGIN
  ALTER TABLE public.system_modules ADD CONSTRAINT system_modules_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.system_modules ADD CONSTRAINT system_modules_name_key UNIQUE (name);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_system_modules_active ON public.system_modules USING btree (is_active);
CREATE INDEX IF NOT EXISTS idx_system_modules_name   ON public.system_modules USING btree (name);

CREATE TABLE IF NOT EXISTS public.tenant_module_settings (
  id              uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id       uuid NOT NULL,
  module_id       uuid NOT NULL,
  is_active       boolean DEFAULT true,
  activated_at    timestamp with time zone DEFAULT now(),
  deactivated_at  timestamp with time zone,
  created_at      timestamp with time zone DEFAULT now(),
  updated_at      timestamp with time zone DEFAULT now()
);
DO $$ BEGIN
  ALTER TABLE public.tenant_module_settings ADD CONSTRAINT tenant_module_settings_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.tenant_module_settings ADD CONSTRAINT tenant_module_settings_tenant_id_module_id_key UNIQUE (tenant_id, module_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.tenant_module_settings ADD CONSTRAINT tenant_module_settings_module_id_fkey
    FOREIGN KEY (module_id) REFERENCES public.system_modules(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.tenant_module_settings ADD CONSTRAINT tenant_module_settings_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_tenant_module_settings_active        ON public.tenant_module_settings USING btree (is_active);
CREATE INDEX IF NOT EXISTS idx_tenant_module_settings_tenant        ON public.tenant_module_settings USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_module_settings_tenant_active ON public.tenant_module_settings USING btree (tenant_id, is_active);

DO $$ BEGIN
  ALTER TABLE public.system_modules         ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.tenant_module_settings ENABLE ROW LEVEL SECURITY;
END $$;

-- ⚠️ Estas policies comparam `profiles.id = auth.uid()`. Está errado: a coluna
-- que guarda o id do auth é `profiles.user_id`. Reproduzido como está no banco
-- porque é o estado real; na prática o predicado nunca casa, o que é mais uma
-- razão pela qual este sistema nunca funcionou.
DROP POLICY IF EXISTS "system_modules_select_policy" ON public.system_modules;
CREATE POLICY "system_modules_select_policy" ON public.system_modules
  FOR SELECT USING (auth.role() = 'authenticated'::text);

DROP POLICY IF EXISTS "system_modules_insert_policy" ON public.system_modules;
CREATE POLICY "system_modules_insert_policy" ON public.system_modules
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'superadmin'::user_role));

DROP POLICY IF EXISTS "system_modules_update_policy" ON public.system_modules;
CREATE POLICY "system_modules_update_policy" ON public.system_modules
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'superadmin'::user_role));

DROP POLICY IF EXISTS "system_modules_delete_policy" ON public.system_modules;
CREATE POLICY "system_modules_delete_policy" ON public.system_modules
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'superadmin'::user_role));

DROP POLICY IF EXISTS "tenant_module_settings_select_policy" ON public.tenant_module_settings;
CREATE POLICY "tenant_module_settings_select_policy" ON public.tenant_module_settings
  FOR SELECT USING (tenant_id = (SELECT profiles.tenant_id FROM public.profiles WHERE profiles.id = auth.uid()));

DROP POLICY IF EXISTS "tenant_module_settings_insert_policy" ON public.tenant_module_settings;
CREATE POLICY "tenant_module_settings_insert_policy" ON public.tenant_module_settings
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT profiles.tenant_id FROM public.profiles WHERE profiles.id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid()
                  AND profiles.role = ANY (ARRAY['superadmin'::user_role,'gerente'::user_role,'gestor'::user_role])));

DROP POLICY IF EXISTS "tenant_module_settings_update_policy" ON public.tenant_module_settings;
CREATE POLICY "tenant_module_settings_update_policy" ON public.tenant_module_settings
  FOR UPDATE USING (
    tenant_id = (SELECT profiles.tenant_id FROM public.profiles WHERE profiles.id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid()
                  AND profiles.role = ANY (ARRAY['superadmin'::user_role,'gerente'::user_role,'gestor'::user_role])));

DROP POLICY IF EXISTS "tenant_module_settings_delete_policy" ON public.tenant_module_settings;
CREATE POLICY "tenant_module_settings_delete_policy" ON public.tenant_module_settings
  FOR DELETE USING (
    tenant_id = (SELECT profiles.tenant_id FROM public.profiles WHERE profiles.id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid()
                  AND profiles.role = ANY (ARRAY['superadmin'::user_role,'gerente'::user_role,'gestor'::user_role])));

CREATE OR REPLACE VIEW public.tenant_active_modules AS
 SELECT tms.tenant_id,
    sm.id AS module_id,
    sm.name,
    sm.display_name,
    sm.description,
    sm.route,
    sm.icon,
    sm.is_essential,
    sm.sort_order,
    tms.is_active,
    tms.activated_at,
    tms.deactivated_at
   FROM public.tenant_module_settings tms
     JOIN public.system_modules sm ON tms.module_id = sm.id
  WHERE tms.is_active = true AND sm.is_active = true
  ORDER BY sm.sort_order;

CREATE OR REPLACE FUNCTION public.activate_essential_modules_for_tenant(tenant_uuid uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
    INSERT INTO tenant_module_settings (tenant_id, module_id, is_active)
    SELECT tenant_uuid, id, true
    FROM system_modules
    WHERE is_essential = true
    ON CONFLICT (tenant_id, module_id) DO NOTHING;
END;
$function$;

-- Catálogo semeado (12 linhas, exatamente como está no banco em 2026-08-24).
INSERT INTO public.system_modules (name, display_name, description, route, icon, is_essential, is_active, sort_order) VALUES
  ('dashboard'       ,'Dashboard'       ,'Painel principal com métricas e visão geral'  ,'/dashboard'       ,'LayoutDashboard',true ,true, 1),
  ('conversations'   ,'Conversas'       ,'Gerenciamento de conversas do WhatsApp'       ,'/conversations'   ,'MessageSquare'  ,true ,true, 2),
  ('contacts'        ,'Contatos'        ,'Gerenciamento de contatos e leads'            ,'/contacts'        ,'Users'          ,false,true, 3),
  ('funnel'          ,'Funil de Vendas' ,'Acompanhamento do funil de vendas'            ,'/funnel'          ,'TrendingUp'     ,false,true, 4),
  ('tracking'        ,'Rastreamento'    ,'Rastreamento de leads e conversões'           ,'/tracking'        ,'Target'         ,false,true, 5),
  ('reports'         ,'Relatórios'      ,'Relatórios e análises detalhadas'             ,'/reports'         ,'BarChart3'      ,false,true, 6),
  ('chatbots'        ,'Chatbots'        ,'Configuração e gerenciamento de chatbots'     ,'/chatbots'        ,'Bot'            ,false,true, 7),
  ('campaigns'       ,'Campanhas'       ,'Criação e gerenciamento de campanhas'         ,'/campaigns'       ,'Megaphone'      ,false,true, 8),
  ('followups'       ,'Follow-ups'      ,'Gerenciamento de follow-ups automáticos'      ,'/followups'       ,'Clock'          ,false,true, 9),
  ('automation'      ,'Automação'       ,'Fluxos de automação e workflows'              ,'/automation'      ,'Zap'            ,false,true,10),
  ('whatsapp-numbers','Números WhatsApp','Gerenciamento de números WhatsApp'            ,'/whatsapp-numbers','Phone'          ,false,true,11),
  ('settings'        ,'Configurações'   ,'Configurações gerais da aplicação'            ,'/settings'        ,'Settings'       ,true ,true,12)
ON CONFLICT (name) DO NOTHING;
