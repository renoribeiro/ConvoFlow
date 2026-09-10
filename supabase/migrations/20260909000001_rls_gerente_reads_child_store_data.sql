-- =============================================================================
-- 20260909000001_rls_gerente_reads_child_store_data
--
-- O QUE MUDA
--   Um GERENTE passa a LER os dados operacionais das Lojas filhas da Conta
--   dele. Antes disso o seletor de Loja do gerente era decorativo: ele trocava
--   o filtro no frontend, mas o RLS continuava preso ao proprio `tenant_id` do
--   perfil (`get_current_user_tenant_id()`), entao a tela abria VAZIA, sem erro.
--
--   Medido em 2026-09-09, antes desta migracao: o gerente Mario Acioli via
--   0 das 144 conversas e 0 dos 145 contatos da Loja EncaixaRH, que e filha da
--   Conta dele.
--
-- ESCOPO - de proposito estreito
--   - SOMENTE LEITURA (FOR SELECT). Nenhuma policy de INSERT/UPDATE/DELETE.
--   - SOMENTE gerente. Gestor e atendente continuam presos a propria Loja, e
--     um membro de Loja continua SEM enxergar a Conta pai.
--   - SOMENTE Loja filha direta: `parent_tenant_id = get_current_user_tenant_id()`.
--     Nao ha recursao: a arvore de tenants tem dois niveis (Conta -> Loja).
--
-- DESEMPENHO
--   O predicado e UMA subconsulta NAO correlacionada:
--       tenant_id IN (SELECT public.gerente_child_store_ids())
--   O planejador resolve isso como InitPlan/SubPlan com hash, avaliado UMA vez
--   por consulta - nao uma vez por linha. Isso e intencional e foi conferido no
--   EXPLAIN. NAO troque por uma funcao que receba a coluna como argumento
--   (ex.: `is_my_child_store(tenant_id)`): isso vira filtro correlacionado e
--   volta a re-avaliar por linha, desfazendo o trabalho de otimizacao de RLS.
--
-- REDE DE SEGURANCA
--   `docs/teste_isolamento_rls.sql` foi atualizado na mesma entrega e cobre as
--   quatro afirmacoes: gerente LE a Loja filha, gerente NAO le Loja de outra
--   Conta, gestor/atendente inalterados, membro de Loja nao le a Conta pai.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. O helper. SECURITY DEFINER porque precisa ler `tenants` inteiro: o RLS de
--    `tenants` nao entrega a linha da Loja para quem esta fora dela, e e essa
--    leitura que decide a resposta. Devolve VAZIO para quem nao e gerente, o
--    que faz a policy inteira virar "nenhuma linha" sem precisar de um segundo
--    predicado.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gerente_child_store_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT t.id
    FROM public.tenants t
   WHERE t.kind = 'store'
     AND t.parent_tenant_id IS NOT NULL
     AND t.parent_tenant_id = public.get_current_user_tenant_id()
     AND public.is_gerente_safe();
$function$;

COMMENT ON FUNCTION public.gerente_child_store_ids() IS
  'IDs das Lojas filhas da Conta do gerente logado. Vazio para qualquer outro cargo. Usado nas policies gerente_reads_child_store_data (somente SELECT).';

REVOKE ALL ON FUNCTION public.gerente_child_store_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gerente_child_store_ids() TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. As policies. Um unico bloco DO: ou entram todas, ou nenhuma entra
--    (armadilha 4 do CLAUDE.md - BEGIN/COMMIT nao e garantia no SQL Editor).
--
--    A lista abaixo E a superficie de auditoria. Cada tabela aqui carrega dado
--    OPERACIONAL de uma Loja. As tabelas com `tenant_id` que ficaram DE FORA
--    estao listadas no rodape deste arquivo, com o motivo de cada uma.
-- -----------------------------------------------------------------------------
DO $mig$
DECLARE
  v_tbl     text;
  v_missing text[];
  v_tables  text[] := ARRAY[
    -- Caixa de entrada
    'conversations', 'messages', 'contacts', 'quick_replies', 'tags',
    -- Funil
    'funnel_stages',
    -- Chatbot
    'chatbots', 'chatbot_nodes', 'chatbot_edges', 'chatbot_triggers',
    'chatbot_variables', 'chatbot_sessions',
    -- Automacoes
    'automation_flows', 'automation_executions', 'automation_step_logs',
    -- Campanhas
    'mass_message_campaigns', 'campaign_executions', 'campaign_metrics',
    'campaign_imports',
    -- Follow-ups
    'followup_sequences', 'followup_sequence_steps',
    'followup_sequence_enrollments', 'individual_followups',
    -- Numeros de WhatsApp
    'whatsapp_instances',
    -- Rastreamento
    'lead_tracking', 'lead_sources', 'tracking_events', 'traffic_sources',
    -- Relatorios e metricas
    'metrics_cache', 'report_data', 'report_executions', 'report_schedules',
    'report_templates',
    -- Integracoes
    'webhooks', 'webhook_deliveries'
  ];
BEGIN
  -- Guarda: falhar alto se a lista citar tabela que nao existe ou que nao tem
  -- `tenant_id`. Sem isto um erro de digitacao viraria uma policy silenciosa
  -- faltando numa tabela - exatamente o tipo de buraco que ninguem percebe.
  SELECT array_agg(t ORDER BY t) INTO v_missing
    FROM unnest(v_tables) AS t
   WHERE NOT EXISTS (
     SELECT 1
       FROM pg_attribute a
       JOIN pg_class c     ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = t
        AND c.relkind = 'r'
        AND a.attname = 'tenant_id'
        AND NOT a.attisdropped
   );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'ABORTADO: sem tenant_id ou inexistentes: %. Nada foi criado.', v_missing;
  END IF;

  FOREACH v_tbl IN ARRAY v_tables LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS gerente_reads_child_store_data ON public.%I', v_tbl);
    EXECUTE format(
      'CREATE POLICY gerente_reads_child_store_data ON public.%I '
      'FOR SELECT TO authenticated '
      'USING (tenant_id IN (SELECT public.gerente_child_store_ids()))', v_tbl);
  END LOOP;

  RAISE NOTICE 'gerente_reads_child_store_data criada em % tabelas.',
               array_length(v_tables, 1);
END
$mig$;

-- =============================================================================
-- TABELAS COM `tenant_id` DEIXADAS DE FORA - e por que
--
--   instance_secrets      credencial crua do provedor. Nao e dado de tela.
--   stripe_config         cobranca mora na CONTA; a Loja nunca tem assinatura.
--   stripe_transactions   idem - o gerente ja le a propria linha de cobranca.
--   subscriptions         idem.
--   tenant_access_events  auditoria de liberacao manual; superficie de superadmin.
--   tenant_module_settings sistema de modulos MORTO (o vivo e `module_settings`,
--                         que e global e nem tem tenant_id).
--   notifications         e por USUARIO (`user_id`), nao por Loja. Herdar a
--                         caixa de notificacao de outra pessoa nao faz sentido.
--   profiles              ja resolvido pelas policies de hierarquia
--                         (`is_my_descendant`), que andam pela arvore de perfis.
--   bug_reports           tem modelo proprio (`user_id` + `store_id`), triagem
--                         de superadmin.
--   affiliate_referrals   programa de afiliados, nivel de Conta.
--   job_queue             fila interna do worker; roda por service_role, nenhuma
--                         tela le.
--   follow_up_sequences   tabela MORTA - duplicata legada de `followup_sequences`
--                         (0 linhas, 0 referencias no codigo em 2026-09-09).
-- =============================================================================
