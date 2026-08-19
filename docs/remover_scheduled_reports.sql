-- =============================================================================
-- ConvoFlow — remover a tabela morta public.scheduled_reports
-- (projeto pqjkuwyshybxldzpfbbs)
-- Rodar de uma vez no SQL Editor do Supabase. É transacional: ou entra tudo, ou
-- não entra nada. Idempotente: rodar duas vezes não quebra.
--
-- Equivale a:
--   supabase/migrations/20260819000002_drop_scheduled_reports.sql
--
-- NÃO rodar `supabase db push` neste projeto: 81 migrations locais não estão no
-- ledger e algumas mexem em dado real de usuário.
--
-- -----------------------------------------------------------------------------
-- PARA QUE SERVE
-- -----------------------------------------------------------------------------
-- Existiam DUAS tabelas para a mesma ideia — mandar relatório de tempos em
-- tempos:
--
--   public.report_schedules   cron_expression, recipients (jsonb), next_run
--   public.scheduled_reports  report_type, frequency, recipients (text[]),
--                             next_send_at
--
-- Quem a tela Relatórios › Agendamentos escreve é report_schedules. Quem o
-- agendador (process-report-dispatch, migração 20260819000001) lê é
-- report_schedules. scheduled_reports não tem tela, não tem executor, não é
-- citada em lugar nenhum do código e está vazia desde que foi criada.
--
-- O risco de deixar como está não é ocupar espaço: é o próximo wiring escolher
-- a tabela errada pelo nome — "scheduled_reports" é, aliás, o nome mais óbvio
-- dos dois para quem chega agora. Duas fontes para um conceito só é como o
-- módulo de relatórios ficou quebrado por meses.
--
-- -----------------------------------------------------------------------------
-- POR QUE É SEGURO (verificado em 2026-08-19)
-- -----------------------------------------------------------------------------
--   linhas ................. 0
--   FKs apontando para ela . nenhuma
--   views dependentes ...... nenhuma
--   referências em src/ .... nenhuma
--
-- Caem junto com a tabela, e nada mais usa nenhum deles:
--   policy  "Super admins can access all scheduled reports"
--   policy  "Users can access own tenant scheduled reports"
--   trigger update_scheduled_reports_updated_at
--   index   scheduled_reports_pkey
--
-- O DROP é SEM CASCADE de propósito. Se entre hoje e a hora em que você rodar
-- isto alguém criar uma FK ou uma view apontando para a tabela, o comando falha
-- alto — que é o que se quer — em vez de derrubar junto o que ninguém revisou.
--
-- -----------------------------------------------------------------------------
-- ANTES DE RODAR — confira o estado de hoje (rode fora da transação):
-- -----------------------------------------------------------------------------
--   SELECT (SELECT count(*) FROM public.scheduled_reports) AS linhas,
--          (SELECT count(*) FROM pg_constraint
--            WHERE confrelid = 'public.scheduled_reports'::regclass) AS fks_entrantes;
--
-- O esperado é 0 e 0. Se `linhas` não for 0, este script ABORTA sozinho — não
-- há como perder dado sem perceber.
-- =============================================================================

BEGIN;

-- Guarda: tabela vazia é a premissa inteira desta remoção. Se deixou de ser
-- verdade, a transação inteira é desfeita e nada é removido.
DO $$
DECLARE
  linhas bigint;
BEGIN
  IF to_regclass('public.scheduled_reports') IS NULL THEN
    RAISE NOTICE 'scheduled_reports não existe — nada a fazer.';
    RETURN;
  END IF;

  -- EXECUTE (e não SQL estático) para que este bloco continue válido depois que
  -- a tabela deixar de existir, na segunda vez que o script rodar.
  EXECUTE 'SELECT count(*) FROM public.scheduled_reports' INTO linhas;

  IF linhas > 0 THEN
    RAISE EXCEPTION
      'ABORTADO: public.scheduled_reports tem % linha(s). Esperado: 0. Revise o conteúdo antes de remover a tabela.',
      linhas;
  END IF;
END $$;

DROP TABLE IF EXISTS public.scheduled_reports;

-- Registro no ledger, já que a aplicação é manual.
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260819000002', 'drop_scheduled_reports')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- =============================================================================
-- DEPOIS DE RODAR — conferir
-- =============================================================================
-- 1) A tabela sumiu e o ledger recebeu a linha:
--
--   SELECT 'tabela' AS item,
--          CASE WHEN to_regclass('public.scheduled_reports') IS NULL
--               THEN 'removida' ELSE 'AINDA EXISTE' END AS situacao
--   UNION ALL
--   SELECT 'ledger',
--          CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FALTA' END
--     FROM supabase_migrations.schema_migrations
--    WHERE version = '20260819000002';
--
-- 2) A tabela que importa continua de pé, com o agendador olhando para ela:
--
--   SELECT count(*) AS agendamentos FROM public.report_schedules;
--   SELECT jobname, schedule, active FROM cron.job
--    WHERE jobname = 'process-report-dispatch-every-5min';
--
-- 3) O produto não deve mudar em nada: Relatórios › Agendamentos continua
--    listando, criando e editando normalmente. Se mudou, algo lia a tabela
--    removida e a verificação de dependências não pegou — reporte.
--
-- -----------------------------------------------------------------------------
-- UM RESÍDUO CONHECIDO (não bloqueia nada)
-- -----------------------------------------------------------------------------
-- src/integrations/supabase/types.ts é um arquivo GERADO e ainda declara
-- `scheduled_reports`. Nada no código usa esse tipo, então não quebra build nem
-- runtime. Some sozinho na próxima regeração:
--
--   supabase gen types typescript --project-id pqjkuwyshybxldzpfbbs > src/integrations/supabase/types.ts
--
-- Não edite o arquivo à mão para tirar o bloco: ele é gerado, e a edição
-- manual volta a divergir na próxima vez que alguém regerar.
-- =============================================================================
