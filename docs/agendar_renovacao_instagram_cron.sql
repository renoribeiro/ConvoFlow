-- =============================================================================
-- ConvoFlow — ligar a renovação diária do Instagram (projeto pqjkuwyshybxldzpfbbs)
--
-- Equivale a: supabase/migrations/20260924000002_instagram_token_renewal_cron.sql
-- Passo 3 de docs/RUNBOOK_instagram_renovacao.md.
--
-- ⚠️ ORDEM: rode só DEPOIS de (1) criar o segredo no Vault e (2) fazer o deploy
-- da edge function instagram-token-renewal. Sem o segredo este script aborta
-- sozinho; sem a função no ar, cada dia vira um 404 em net._http_response.
--
-- Tudo num bloco DO único: no SQL Editor, BEGIN/COMMIT não garante nada (ver
-- CLAUDE.md, armadilha 4). Ou o job nasce e o ledger é gravado, ou nada muda.
-- Idempotente: rodar de novo não cria um segundo job.
--
-- Horário: 09:20 UTC = 06:20 em Brasília, uma vez por dia. Longe dos jobs
-- de faxina (04:15 e 04:30 UTC). O comando do job não carrega URL, chave nem
-- segredo: ele só chama public.instagram_token_renewal_kick(), que lê o
-- segredo do Vault na hora.
-- =============================================================================

DO $cron$
DECLARE
  v_jobs integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'instagram_token_renewal_cron_secret') THEN
    RAISE EXCEPTION 'ABORTADO: o segredo instagram_token_renewal_cron_secret não está no Vault. Faça o passo 1 do runbook antes. Nada foi agendado.';
  END IF;
  IF to_regprocedure('public.instagram_token_renewal_kick(uuid,boolean,boolean)') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: a migração 20260924000001 não está aplicada. Nada foi agendado.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'instagram-token-renewal-daily') THEN
    PERFORM cron.schedule(
      'instagram-token-renewal-daily',
      '20 9 * * *',
      'SELECT public.instagram_token_renewal_kick()'
    );
  END IF;

  SELECT count(*) INTO v_jobs
    FROM cron.job
   WHERE jobname = 'instagram-token-renewal-daily'
     AND schedule = '20 9 * * *'
     AND command = 'SELECT public.instagram_token_renewal_kick()'
     AND active;
  IF v_jobs <> 1 THEN
    RAISE EXCEPTION 'ABORTADO: esperado 1 job instagram-token-renewal-daily ativo e igual ao combinado, achei %. Nada foi agendado.', v_jobs;
  END IF;

  INSERT INTO supabase_migrations.schema_migrations (version, name)
  VALUES ('20260924000002', 'instagram_token_renewal_cron')
  ON CONFLICT (version) DO NOTHING;

  RAISE NOTICE 'OK: instagram-token-renewal-daily agendado (09:20 UTC, todo dia).';
END
$cron$;

-- Conferência (deve devolver UMA linha, active = true):
SELECT jobid, jobname, schedule, command, active
  FROM cron.job
 WHERE jobname = 'instagram-token-renewal-daily';

-- DESFAZER: SELECT cron.unschedule('instagram-token-renewal-daily');
