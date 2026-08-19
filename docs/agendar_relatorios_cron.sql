-- =============================================================================
-- ConvoFlow — ligar o agendador de relatórios (projeto pqjkuwyshybxldzpfbbs)
-- Rodar de uma vez no SQL Editor do Supabase. É transacional: ou entra tudo, ou
-- não entra nada. Idempotente: rodar duas vezes não quebra nem duplica o job.
--
-- Equivale a:
--   supabase/migrations/20260819000001_report_dispatch_cron.sql
--
-- NÃO rodar `supabase db push` neste projeto: 81 migrations locais não estão no
-- ledger e algumas mexem em dado real de usuário.
--
-- ⚠️ ORDEM IMPORTA: faça o deploy da edge function ANTES de rodar este script.
--
--   supabase functions deploy process-report-dispatch
--
-- Sem a função no ar, cada tick vira um 404 registrado em net._http_response —
-- barulho inútil a cada 5 minutos.
--
-- -----------------------------------------------------------------------------
-- PARA QUE SERVE
-- -----------------------------------------------------------------------------
-- A tela Relatórios › Agendamentos deixa o usuário programar envio recorrente
-- por e-mail. Até aqui isso não saía do lugar: não existia NADA no banco que
-- lesse public.report_schedules. O usuário configurava, esperava a semana
-- inteira e nunca recebia — sem erro, sem log, sem pista.
--
-- Este script cria o job de pg_cron que chama a edge function
-- process-report-dispatch a cada 5 minutos. A função lê as agendas ativas de
-- todas as Contas, descobre quais venceram (comparando a expressão cron com o
-- last_run), reclama cada uma com UPDATE condicional para não enviar duas
-- vezes, monta o relatório da Conta da agenda e envia pelo Resend. Sucesso e
-- falha viram linha em public.report_executions.
--
-- Por que a cada 5 minutos, e não a cada minuto como os outros workers: o
-- volume é baixo e a função tolera tick perdido — ela olha 60 minutos para trás
-- atrás de horário não executado. Um agendamento marcado para 09:00 sai entre
-- 09:00 e 09:05.
--
-- -----------------------------------------------------------------------------
-- PRÉ-REQUISITOS (confira antes de rodar)
-- -----------------------------------------------------------------------------
-- 1) Edge function no ar:
--      supabase functions deploy process-report-dispatch
--
-- 2) Secrets de e-mail já configuradas (as MESMAS que o send-report usa hoje,
--    e que já funcionam em produção — houve entrega real em 2026-06-01):
--      RESEND_API_KEY
--      REPORT_FROM_EMAIL
--    Sem elas a função devolve 500 e não queima a janela de nenhuma agenda.
--
-- -----------------------------------------------------------------------------
-- ANTES DE RODAR — veja o estado de hoje (rode fora da transação):
-- -----------------------------------------------------------------------------
--   SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobid;
--
-- Em 2026-08-19 isso devolvia 5 jobs (job-worker, process-campaign-dispatch,
-- whatsapp-policy-watch, process-followup-dispatch, webhook-dispatcher) e
-- NENHUM de relatório. Depois de rodar este script devem ser 6.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove o job anterior, se existir, para poder rodar este script de novo sem
-- criar um segundo job disparando a mesma função.
DO $$
BEGIN
  PERFORM cron.unschedule('process-report-dispatch-every-5min');
EXCEPTION WHEN OTHERS THEN
  NULL; -- ainda não agendado
END $$;

-- O bearer é a chave ANON do projeto, igual aos outros cinco jobs. Não é ela
-- que autoriza coisa alguma: process-report-dispatch roda com verify_jwt=false
-- e autentica internamente com a SERVICE_ROLE_KEY. A anon key aqui só satisfaz
-- o gateway das Edge Functions.
SELECT cron.schedule(
  'process-report-dispatch-every-5min',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://pqjkuwyshybxldzpfbbs.supabase.co/functions/v1/process-report-dispatch',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxamt1d3lzaHlieGxkenBmYmJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQxMzQxMzAsImV4cCI6MjA2OTcxMDEzMH0.xeS8OdwOHpby2NHf942Z7i240LW1a5kT5oR-aH35sD0"}'::jsonb,
    body := '{"trigger": "cron"}'::jsonb
  ) AS request_id;
  $cron$
);

-- Registro no ledger, já que a aplicação é manual.
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260819000001', 'report_dispatch_cron')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- =============================================================================
-- DEPOIS DE RODAR — conferir
-- =============================================================================
-- 1) O job existe, está ativo, e o ledger recebeu a linha:
--
--   SELECT 'job' AS item,
--          CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FALTA' END AS situacao
--     FROM cron.job
--    WHERE jobname = 'process-report-dispatch-every-5min' AND active
--   UNION ALL
--   SELECT 'ledger',
--          CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FALTA' END
--     FROM supabase_migrations.schema_migrations
--    WHERE version = '20260819000001';
--
-- 2) Espere até 5 minutos e veja se o tick saiu com HTTP 200. Um 401 significa
--    que a anon key mudou; um 404, que a função não foi deployada:
--
--   SELECT r.status_code, left(r.content, 300) AS resposta, r.created
--     FROM net._http_response r
--    ORDER BY r.created DESC
--    LIMIT 5;
--
-- 3) O teste de verdade é pelo produto, e leva 5 minutos:
--    a) Entre em Relatórios › Agendamentos e crie um agendamento DIÁRIO com o
--       seu próprio e-mail, marcando um horário 5 a 10 minutos à frente.
--       (Antes desta entrega o botão Salvar dava erro e nada era gravado — se
--       ele salvar, o primeiro dos dois problemas já está resolvido.)
--    b) Confirme que a linha entrou:
--
--   SELECT id, name, cron_expression, recipients, is_active, last_run, next_run
--     FROM public.report_schedules
--    ORDER BY created_at DESC LIMIT 5;
--
--    c) Passado o horário, confirme o envio e o registro:
--
--   SELECT executed_at, status, error_message,
--          parameters->>'trigger'      AS origem,
--          parameters->>'scheduleName' AS agenda,
--          parameters->'delivered'     AS entregue
--     FROM public.report_executions
--    ORDER BY executed_at DESC LIMIT 5;
--
--    Espere `origem = schedule` e `status = success`. E o e-mail na caixa.
--    Se vier `status = failed`, a mensagem do erro está em error_message — que
--    é exatamente o que não existia antes: a falha agora aparece.
--
--    d) Confira que last_run e next_run foram carimbados na agenda (o next_run
--       é só exibição; quem manda no disparo é cron + last_run).
--
-- -----------------------------------------------------------------------------
-- COMO DESLIGAR (se precisar)
-- -----------------------------------------------------------------------------
--   SELECT cron.unschedule('process-report-dispatch-every-5min');
--
-- Desligar o job para todos os envios agendados e não perde nenhuma agenda: as
-- linhas de report_schedules continuam lá. Para desligar só uma Conta, basta
-- is_active = false na agenda dela.
-- =============================================================================
