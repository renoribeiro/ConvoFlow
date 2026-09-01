-- Agenda o refresh das views materializadas de rastreamento.
--
-- POR QUE ISSO NÃO EXISTIA
-- `public.refresh_tracking_views()` foi criada lá atrás em
-- `001_create_tracking_tables.sql` e nunca foi chamada por ninguém. Enquanto as
-- tabelas de origem estavam vazias isso não fazia diferença. Depois da ponte
-- CTWA (20260831000001) faz: sem refresh, a tela Rastreamento continuaria
-- mostrando o retrato de quando as views foram criadas, ou seja, zero.
--
-- POR QUE 15 MINUTOS
-- Medido em produção em 2026-08-31: 10 refreshes seguidos levaram 131 ms, ou
-- **13 ms por refresh**. A 96 execuções por dia isso dá ~1,25 s de banco por
-- dia. Três razões para esse intervalo e não outro:
--
--   1. Não é o tipo de carga que a gente cortou. A faxina de agosto (758 MB ->
--      52 MB) atacou cron + pg_net: o volume era das RESPOSTAS HTTP guardadas
--      em `net._http_response`, não do cron em si. Este job é SQL local puro,
--      não faz `net.http_post`, então não alimenta aquela tabela. O único
--      rastro é uma linha em `cron.job_run_details`, que o job 11
--      (`purge-cron-job-run-details-daily`) já apaga depois de 7 dias.
--
--   2. Os outros seis jobs `*/5` são despachantes HTTP, onde atraso é defeito
--      de produto: campanha e follow-up têm hora para sair. Relatório de
--      atribuição não tem. Copiar `*/5` seria imitar a forma sem o motivo.
--
--   3. Uma hora seria staleness demais. "Subi um anúncio hoje de manhã, está
--      trazendo gente?" é pergunta real e de mesmo dia. Se a tela demora uma
--      hora para reagir, o operador para de confiar nela — e tela em que
--      ninguém confia é tela morta.
--
-- Se o volume crescer muito, o custo cresce com `lead_tracking`, não com a
-- frequência. Reavaliar quando a tabela passar de ~1 milhão de linhas.

SELECT cron.schedule(
  'refresh-tracking-views-every-15min',
  '*/15 * * * *',
  $$SELECT public.refresh_tracking_views()$$
);
