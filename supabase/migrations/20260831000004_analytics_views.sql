-- As quatro views que a aba Análises consulta desde sempre e que nunca existiram.
--
-- O QUE ESTAVA ERRADO
-- `useRealTimeAnalytics` faz quatro SELECTs em `tracking_metrics_view`,
-- `daily_analytics_view`, `source_performance_view` e `conversion_funnel_view`.
-- Nenhuma das quatro existia no banco. Toda busca da aba estourava no primeiro
-- SELECT e a aba inteira caía no estado de erro. Não era dado faltando: era
-- objeto inexistente.
--
-- COMO ESTAS FORAM DESENHADAS
-- Elas foram escritas a partir do que os gráficos LEEM, não do que os nomes
-- sugerem. O contrato foi extraído de `processAnalyticsData()`:
--
--   tracking_metrics_view   -> filtra por `created_at`; somam-se leads,
--                              conversions, revenue
--   daily_analytics_view    -> filtra e ordena por `date`; lê leads,
--                              conversions, revenue, visitors
--   source_performance_view -> filtra por `date`; lê source, leads,
--                              conversions, revenue, cost
--   conversion_funnel_view  -> filtra por `date`; lê stage_name, count
--
-- O QUE NÃO DÁ PARA RESPONDER (e por isso vai zerado, não inventado)
--
--   `visitors`  — não existe analytics de site. Ninguém mede visita: o lead
--                 nasce quando a mensagem chega no WhatsApp. Fica 0 e o seletor
--                 de métrica do gráfico nem oferece essa opção.
--   `cost`      — não existe ingestão de gasto do Gerenciador de Anúncios da
--                 Meta. Sem custo não há ROI, e ROI calculado sobre custo zero
--                 é número falso com cara de verdade. Fica 0 e a etiqueta de
--                 ROI sai da tela.
--
-- Quando `lead_tracking.conversion_value` e um custo real entrarem, estas duas
-- colunas passam a valer sem mudar o formato das views.
--
-- ISOLAMENTO POR CONTA
-- Mesmo padrão da `tracking_metrics_daily_filtered`, que já estava correta:
-- filtro explícito por `get_current_user_tenant_id()`, com escape para
-- superadmin via `is_super_admin_safe()`. O GRANT vai para `authenticated`, e
-- nunca para `anon`.

-- ---------------------------------------------------------------------------
-- 1. tracking_metrics_view — totais do período (grão diário)
-- ---------------------------------------------------------------------------
-- `created_at` é timestamptz truncado no dia porque o hook filtra com
-- `.gte('created_at', <data>)`. Grão diário em vez de uma linha por lead para
-- não mandar a tabela inteira ao navegador quando a Conta crescer.

CREATE OR REPLACE VIEW public.tracking_metrics_view AS
SELECT
  lt.tenant_id,
  date_trunc('day', lt.created_at)                      AS created_at,
  count(*)::bigint                                      AS leads,
  count(*) FILTER (WHERE lt.converted)::bigint          AS conversions,
  COALESCE(sum(lt.conversion_value), 0)::numeric        AS revenue
FROM public.lead_tracking lt
WHERE is_super_admin_safe() OR lt.tenant_id = get_current_user_tenant_id()
GROUP BY lt.tenant_id, date_trunc('day', lt.created_at);

COMMENT ON VIEW public.tracking_metrics_view IS
  'Totais de leads/conversoes/receita por dia, para os cartoes da aba Analises. Escopo por Conta.';

-- ---------------------------------------------------------------------------
-- 2. daily_analytics_view — série temporal do gráfico principal
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.daily_analytics_view AS
SELECT
  lt.tenant_id,
  date(lt.created_at)                                   AS date,
  count(*)::bigint                                      AS leads,
  count(*) FILTER (WHERE lt.converted)::bigint          AS conversions,
  COALESCE(sum(lt.conversion_value), 0)::numeric        AS revenue,
  0::bigint                                             AS visitors
FROM public.lead_tracking lt
WHERE is_super_admin_safe() OR lt.tenant_id = get_current_user_tenant_id()
GROUP BY lt.tenant_id, date(lt.created_at);

COMMENT ON VIEW public.daily_analytics_view IS
  'Serie diaria de leads/conversoes/receita. `visitors` e sempre 0: nao existe analytics de site neste produto.';

-- ---------------------------------------------------------------------------
-- 3. source_performance_view — desempenho por fonte
-- ---------------------------------------------------------------------------
-- Grão (fonte, dia). O gráfico precisa de UMA linha por fonte, mas o hook
-- filtra por `date`, então as duas coisas só coexistem se a view mantiver o
-- dia e o cliente agrupar por fonte depois do filtro — que é o que
-- `processAnalyticsData` passa a fazer.

CREATE OR REPLACE VIEW public.source_performance_view AS
SELECT
  lt.tenant_id,
  date(lt.created_at)                                   AS date,
  COALESCE(ts.name, 'Sem fonte')                        AS source,
  count(*)::bigint                                      AS leads,
  count(*) FILTER (WHERE lt.converted)::bigint          AS conversions,
  COALESCE(sum(lt.conversion_value), 0)::numeric        AS revenue,
  0::numeric                                            AS cost
FROM public.lead_tracking lt
LEFT JOIN public.traffic_sources ts ON ts.id = lt.traffic_source_id
WHERE is_super_admin_safe() OR lt.tenant_id = get_current_user_tenant_id()
GROUP BY lt.tenant_id, date(lt.created_at), COALESCE(ts.name, 'Sem fonte');

COMMENT ON VIEW public.source_performance_view IS
  'Leads por fonte e por dia. `cost` e sempre 0: nao ha ingestao de gasto do Gerenciador de Anuncios, e por isso a tela nao mostra ROI.';

-- ---------------------------------------------------------------------------
-- 4. conversion_funnel_view — onde estão os leads do período
-- ---------------------------------------------------------------------------
-- O funil aqui é um retrato: de quem CHEGOU no período, em que etapa está
-- agora. Não é histórico de passagem por etapa — o produto não guarda isso.
-- Etapa sem nenhum contato no período não aparece.

CREATE OR REPLACE VIEW public.conversion_funnel_view AS
SELECT
  c.tenant_id,
  date(c.created_at)                                    AS date,
  fs.name                                               AS stage_name,
  fs."order"                                            AS stage_order,
  count(*)::bigint                                      AS count
FROM public.contacts c
JOIN public.funnel_stages fs ON fs.id = c.current_stage_id
WHERE is_super_admin_safe() OR c.tenant_id = get_current_user_tenant_id()
GROUP BY c.tenant_id, date(c.created_at), fs.name, fs."order";

COMMENT ON VIEW public.conversion_funnel_view IS
  'Retrato do funil: contatos criados no periodo, agrupados pela etapa em que estao hoje. Vazio enquanto a Conta nao configurar funnel_stages.';

-- ---------------------------------------------------------------------------
-- 5. Acesso
-- ---------------------------------------------------------------------------

GRANT SELECT ON public.tracking_metrics_view   TO authenticated;
GRANT SELECT ON public.daily_analytics_view    TO authenticated;
GRANT SELECT ON public.source_performance_view TO authenticated;
GRANT SELECT ON public.conversion_funnel_view  TO authenticated;
