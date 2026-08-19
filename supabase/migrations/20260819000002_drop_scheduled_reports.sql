-- Remove public.scheduled_reports — duplicata morta de public.report_schedules.
--
-- As duas tabelas descreviam a mesma coisa (envio recorrente de relatório) com
-- colunas diferentes: scheduled_reports usava report_type/frequency/
-- next_send_at; report_schedules usa cron_expression/next_run. Só a segunda tem
-- tela que escreve nela e, desde 20260819000001, um executor que a lê.
-- scheduled_reports nunca teve nenhum dos dois: zero referência em src/, zero
-- linha em produção.
--
-- Manter as duas é convite para o próximo wiring cair na tabela errada.
--
-- Guarda: se aparecer QUALQUER linha até o momento do drop, a migração aborta.
-- Tabela vazia é o fato que torna isto seguro — se deixar de ser verdade, quem
-- rodar precisa decidir o que fazer com o dado, não perdê-lo em silêncio.
--
-- Sem CASCADE de propósito: em 2026-08-19 nada referenciava esta tabela (nenhuma
-- FK entrante, nenhuma view). Se algo passar a referenciar, o DROP falha alto em
-- vez de arrastar junto o que ninguém revisou. As 2 policies, o trigger
-- update_scheduled_reports_updated_at e o índice scheduled_reports_pkey caem com
-- a tabela, como sempre.

DO $$
DECLARE
  linhas bigint;
BEGIN
  IF to_regclass('public.scheduled_reports') IS NULL THEN
    RAISE NOTICE 'scheduled_reports não existe — nada a fazer.';
    RETURN;
  END IF;

  -- EXECUTE (e não SQL estático) para que este bloco continue válido depois que
  -- a tabela deixar de existir, na segunda vez que a migração rodar.
  EXECUTE 'SELECT count(*) FROM public.scheduled_reports' INTO linhas;

  IF linhas > 0 THEN
    RAISE EXCEPTION
      'ABORTADO: public.scheduled_reports tem % linha(s). Esperado: 0. Revise o conteúdo antes de remover a tabela.',
      linhas;
  END IF;
END $$;

DROP TABLE IF EXISTS public.scheduled_reports;

-- Registro no ledger. O projeto aplica migração pelo SQL Editor — sem esta
-- linha, quem rodar este arquivo direto (em vez de docs/remover_scheduled_reports.sql)
-- deixa a migração aplicada no banco e ausente do histórico. `statements` fica
-- NULL de propósito: a coluna é preenchida pela CLI quando é ela quem aplica.
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260819000002', 'drop_scheduled_reports')
ON CONFLICT (version) DO NOTHING;
