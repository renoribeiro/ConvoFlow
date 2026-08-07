-- Fecha vazamento de dados entre Contas nas materialized views de métricas.
--
-- Problema: tracking_metrics_daily, report_performance_daily e system_metrics_hourly
-- tinham GRANT ALL para anon e authenticated. Materialized view NÃO respeita RLS,
-- então qualquer pessoa com a anon key (que vai no bundle do frontend) lia leads,
-- conversões e receita de TODAS as Contas sem sequer estar logada. Confirmado em
-- produção com um GET /rest/v1/tracking_metrics_daily -> HTTP 200 com dados reais.
--
-- Solução: revogar acesso direto às matviews e expor só wrappers filtrados por
-- tenant. Os wrappers são views comuns (SECURITY DEFINER implícito, sem
-- security_invoker) de propósito: é isso que permite a view ler a matview depois
-- do revoke, enquanto o WHERE garante o isolamento por Conta.

-- 1) Wrapper de tracking com bypass para superadmin.
--    A versão anterior filtrava só por get_current_user_tenant_id(), o que
--    quebraria a impersonação de Conta do superadmin. O frontend continua
--    aplicando .eq('tenant_id', ...), então o superadmin vê exatamente a Conta
--    que está impersonando.
create or replace view public.tracking_metrics_daily_filtered as
  select tenant_id, date, total_leads, conversions, conversion_rate,
         total_revenue, unique_sources
    from public.tracking_metrics_daily
   where public.is_super_admin_safe()
      or tenant_id = public.get_current_user_tenant_id();

-- 2) Wrapper equivalente para relatórios (não existia).
create or replace view public.report_performance_daily_filtered as
  select tenant_id, date, total_reports, successful_reports,
         failed_reports, success_rate
    from public.report_performance_daily
   where public.is_super_admin_safe()
      or tenant_id = public.get_current_user_tenant_id();

-- 3) Wrapper para métricas de sistema. Não tem tenant_id (são métricas globais
--    de infra), então fica restrito a superadmin.
create or replace view public.system_metrics_hourly_filtered as
  select metric_name, service_name, hour, avg_value, min_value,
         max_value, sample_count, std_deviation
    from public.system_metrics_hourly
   where public.is_super_admin_safe();

-- 4) Corta o acesso direto às matviews cruas.
revoke all on public.tracking_metrics_daily   from anon, authenticated;
revoke all on public.report_performance_daily from anon, authenticated;
revoke all on public.system_metrics_hourly    from anon, authenticated;

-- 5) Só leitura, só para quem está logado, e só via wrapper.
revoke all on public.tracking_metrics_daily_filtered   from anon, authenticated;
revoke all on public.report_performance_daily_filtered from anon, authenticated;
revoke all on public.system_metrics_hourly_filtered    from anon, authenticated;

grant select on public.tracking_metrics_daily_filtered   to authenticated;
grant select on public.report_performance_daily_filtered to authenticated;
grant select on public.system_metrics_hourly_filtered    to authenticated;

-- Observação: o refresh das matviews continua funcionando normalmente — passa
-- pelas RPCs refresh_materialized_view / refresh_all_materialized_views, que são
-- SECURITY DEFINER e não dependem desses grants.
