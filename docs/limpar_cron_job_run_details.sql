-- =============================================================================
-- ③ Podar cron.job_run_details e criar retencao
-- =============================================================================
--
-- MEDIDO em 2026-08-28:
--
--   O banco tem 758 MB. Destes:
--     cron   587 MB  (77,4%)  <-- este script
--     net    145 MB  (19,1%)  <-- script ① (vacuum_full_http_response.sql)
--     public   8,5 MB ( 1,1%)  <-- o aplicativo INTEIRO
--
--   cron.job_run_details tem 634.166 linhas desde 2025-08-02 e NUNCA foi podada.
--   573 MB de heap + 14 MB de indices.
--
--   Crescimento atual: 5 jobs por minuto + 1 a cada 5 min = 7.488 linhas/dia
--   ~= 7,3 MB/dia ~= 218 MB/mes. Isso NAO depende de quantos clientes voce tem:
--   cresce igual com 1 ou com 100. Foi o que estourou o NANO.
--
--   Efeito colateral ja visivel: uma unica chamada de
--   `update cron.job_run_details set status where status in (...)`
--   — a checagem que o pg_cron faz ao iniciar — levou 9,3 SEGUNDOS e leu 73.334
--   blocos, porque varre a tabela inteira. Piora todo dia.
--
-- =============================================================================
-- O QUE ESTA SENDO JOGADO FORA — leia antes, depois nao da mais
-- =============================================================================
--
-- Levantamento completo das 634.166 linhas. Existem exatamente DUAS mensagens
-- distintas em toda a tabela:
--
--  jobid  job                                status     mensagem                          linhas    periodo
--  -----  ---------------------------------  ---------  --------------------------------  --------  ---------------------
--    1    job-worker-every-minute            failed     ERROR: schema "net" does not      208.544   2025-08-02 a 2026-06-05
--                                                       exist / LINE 2: SELECT
--                                                       net.http_post(
--    1    job-worker-every-minute            succeeded  1 row                             121.282   2026-06-05 a 2026-08-28
--    2    process-campaign-dispatch          succeeded  1 row                             121.282   2026-06-05 a 2026-08-28
--    4    process-followup-dispatch          succeeded  1 row                              96.782   2026-06-22 a 2026-08-28
--    5    webhook-dispatcher                 succeeded  1 row                              83.681   2026-07-01 a 2026-08-28
--    6    process-report-dispatch-every-5min succeeded   1 row                              2.568   2026-08-19 a 2026-08-28
--    3    whatsapp-policy-watch-weekly       succeeded  1 row                                  10   2026-06-22 a 2026-08-24
--
-- CONCLUSAO SOBRE AS 208.544 FALHAS: nao ha nada a aprender alem do que ja se ve.
-- E UMA unica mensagem, repetida identicamente 208.544 vezes. Nao ha uma segunda
-- causa escondida no meio, nao ha erro intermitente, nao ha nada que so aparece
-- em algumas linhas — a consulta acima agrupou por (jobid, status, mensagem)
-- sobre a tabela inteira e devolveu exatamente 7 grupos, que somam o total.
--
-- O que a falha significa: de 2025-08-02 ate 2026-06-05 (10 meses) o cron do
-- job-worker chamou net.http_post() sem que a extensao pg_net estivesse
-- instalada/visivel. Ou seja: o job-worker NUNCA rodou nesse periodo. Foi
-- corrigido em 2026-06-05 e desde entao retorna "1 row".
--
-- O unico valor historico destas linhas e o registro de que houve 10 meses de
-- falha silenciosa. Isso ja esta escrito aqui neste cabecalho — que fica
-- versionado no git. Nao ha motivo para guardar 208.544 copias da mesma frase.
--
-- Se ainda assim voce quiser o registro cru antes de apagar, rode a PARTE A.
--
-- =============================================================================
-- PERMISSAO — ja conferida
-- =============================================================================
-- cron.job_run_details pertence a supabase_admin, mas o papel postgres tem
-- DELETE = true e MAINTAIN = true. DELETE e VACUUM FULL funcionam.
-- (ALTER TABLE nao funcionaria — mas nao precisamos dele aqui.)
--
-- NAO E MIGRACAO: este script nao muda schema. Por isso NAO ha INSERT no
-- supabase_migrations.schema_migrations. Manutencao nao entra no ledger.
-- =============================================================================


-- =============================================================================
-- PARTE A — ANTES (somente leitura). Rode e guarde o resultado.
-- =============================================================================

SELECT
  (SELECT count(*) FROM cron.job_run_details)                                          AS total_agora,
  (SELECT count(*) FROM cron.job_run_details WHERE start_time <  now() - interval '7 days') AS vai_apagar,
  (SELECT count(*) FROM cron.job_run_details WHERE start_time >= now() - interval '7 days') AS vai_ficar,
  (SELECT min(start_time) FROM cron.job_run_details)                                   AS mais_antiga,
  pg_size_pretty(pg_relation_size('cron.job_run_details'))                             AS heap_antes,
  pg_size_pretty(pg_indexes_size('cron.job_run_details'))                              AS indice_antes,
  pg_size_pretty(pg_database_size(current_database()))                                 AS banco_antes;

-- Esperado (medido em 2026-08-28): total ~634.166 | apaga ~591.846 | fica ~42.320
--                                  heap 573 MB | indice 14 MB | banco ~758 MB

-- Opcional — o inventario completo do que sai, uma linha por grupo.
-- E a MESMA consulta que gerou a tabela do cabecalho. Rode se quiser guardar.
--
--   SELECT jobid, status,
--          left(regexp_replace(coalesce(return_message,'(null)'),'\s+',' ','g'),140) AS msg,
--          count(*) AS n, min(start_time) AS de, max(start_time) AS ate
--   FROM cron.job_run_details
--   WHERE start_time < now() - interval '7 days'
--   GROUP BY jobid, status, msg
--   ORDER BY n DESC;


-- =============================================================================
-- PARTE B — A PODA. Bloco DO unico: ou termina inteiro, ou nao acontece nada.
-- =============================================================================
--
-- Conforme a armadilha 4 do CLAUDE.md, guardas + escrita + conferencia ficam
-- TODAS dentro do mesmo bloco DO. Um bloco DO e um comando so: qualquer
-- RAISE EXCEPTION aqui dentro desfaz o DELETE, mesmo no SQL Editor.
--
-- Duracao esperada: 10 a 40 segundos para ~592 mil linhas. Nao trava o
-- aplicativo — cron.job_run_details nao e lida por nada em `public`. O pg_cron
-- escreve nela a cada minuto; essas gravacoes esperam o fim da transacao.

DO $poda$
DECLARE
  v_corte           timestamptz := now() - interval '7 days';
  v_total_antes     bigint;
  v_previsto_apagar bigint;
  v_previsto_ficar  bigint;
  v_apagados        bigint;
  v_total_depois    bigint;
BEGIN
  SELECT count(*) INTO v_total_antes FROM cron.job_run_details;

  SELECT count(*) FILTER (WHERE start_time <  v_corte),
         count(*) FILTER (WHERE start_time >= v_corte)
    INTO v_previsto_apagar, v_previsto_ficar
    FROM cron.job_run_details;

  RAISE NOTICE 'Antes: % linhas. Apagar: %. Manter: %. Corte: %',
    v_total_antes, v_previsto_apagar, v_previsto_ficar, v_corte;

  -- GUARDA 1 — ja esta podada? Entao nao ha o que fazer.
  IF v_previsto_apagar = 0 THEN
    RAISE NOTICE 'Nada acima de 7 dias. Tabela ja esta limpa. Nenhuma escrita feita.';
    RETURN;
  END IF;

  -- GUARDA 2 — nunca esvaziar a tabela. Se o corte nao deixa NADA, algo esta
  -- errado (relogio do servidor, cron parado). Aborta.
  IF v_previsto_ficar = 0 THEN
    RAISE EXCEPTION
      'ABORTADO: o corte de 7 dias nao deixaria nenhuma linha (total=%). '
      'Isso indica que o pg_cron parou de gravar ou o relogio esta errado. '
      'Investigue antes de apagar.', v_total_antes;
  END IF;

  -- GUARDA 3 — a janela de 7 dias com 6 jobs deve deixar dezenas de milhares de
  -- linhas (7.488/dia x 7 = ~52 mil). Se sobrar muito pouco, o cron nao esta
  -- rodando como esperado e apagar o historico seria destruir a evidencia.
  IF v_previsto_ficar < 1000 THEN
    RAISE EXCEPTION
      'ABORTADO: so % linhas nos ultimos 7 dias — esperado dezenas de milhares. '
      'Sinal de que os cron jobs nao estao rodando. Investigue antes de apagar.',
      v_previsto_ficar;
  END IF;

  -- ESCRITA
  DELETE FROM cron.job_run_details WHERE start_time < v_corte;
  GET DIAGNOSTICS v_apagados = ROW_COUNT;

  SELECT count(*) INTO v_total_depois FROM cron.job_run_details;

  -- GUARDA 4 — a aritmetica tem que fechar. Se nao fechar, desfaz tudo.
  -- Tolerancia de 200 linhas porque o pg_cron insere durante a transacao.
  IF abs((v_total_antes - v_apagados) - v_total_depois) > 200 THEN
    RAISE EXCEPTION
      'ABORTADO: contas nao fecham. antes=% apagados=% depois=% (esperado ~%). '
      'Nada foi apagado.',
      v_total_antes, v_apagados, v_total_depois, v_total_antes - v_apagados;
  END IF;

  RAISE NOTICE 'OK. Apagadas % linhas. Restam %.', v_apagados, v_total_depois;
  RAISE NOTICE 'O ESPACO EM DISCO AINDA NAO VOLTOU — rode a PARTE C.';
END
$poda$;


-- =============================================================================
-- PARTE C — devolver o espaco. Rode SOZINHO, sem mais nada selecionado.
-- =============================================================================
--
-- POR QUE VACUUM FULL E NAO VACUUM SIMPLES:
-- o DELETE removeu as linhas MAIS ANTIGAS, que ficam no COMECO do arquivo. Um
-- VACUUM comum so devolve espaco ao sistema operacional quando ele esta no FIM
-- do arquivo. Sem o FULL, a tabela continuaria ocupando 573 MB com 42 mil
-- linhas dentro.
--
-- Trava: ACCESS EXCLUSIVE, esperado 5 a 20 segundos (573 MB para reescrever,
-- mas so ~42 mil linhas sobrevivem). O pg_cron nao consegue gravar nesses
-- segundos; ele registra o proximo minuto normalmente. Nenhum job e perdido:
-- a EXECUCAO do job e independente do registro dela.

VACUUM (FULL, ANALYZE) cron.job_run_details;


-- =============================================================================
-- PARTE D — DEPOIS (somente leitura). Confirme.
-- =============================================================================

SELECT
  (SELECT count(*) FROM cron.job_run_details)                    AS linhas_depois,
  (SELECT min(start_time) FROM cron.job_run_details)             AS mais_antiga_depois,
  pg_size_pretty(pg_relation_size('cron.job_run_details'))       AS heap_depois,
  pg_size_pretty(pg_indexes_size('cron.job_run_details'))        AS indice_depois,
  pg_size_pretty(pg_database_size(current_database()))           AS banco_depois;

-- CRITERIO DE SUCESSO:
--   linhas_depois  ~42.000 (e nao 634.000)
--   mais_antiga_depois  no maximo 7 dias atras
--   heap_depois    algo entre 30 MB e 60 MB (era 573 MB)
--   banco_depois   ~170 MB se ① ja rodou, ~310 MB se ainda nao


-- =============================================================================
-- PARTE E — RETENCAO. Autorizacao SEPARADA (Regra 0).
-- =============================================================================
--
-- Sem isto, a tabela volta a 218 MB/mes e em 3 meses voce esta no mesmo lugar.
--
-- POR QUE PRECISA DE UM CRON PROPRIO:
-- o pg_cron 1.6 nao tem retencao embutida. A alternativa seria desligar o log
-- inteiro com `cron.log_run = off`, mas esse parametro tem context = 'postmaster'
-- (conferido em pg_settings): exige reiniciar o servidor e editar o arquivo de
-- configuracao, o que voce NAO alcanca em Supabase gerenciado. E, mesmo se
-- alcancasse, desligar o log seria ruim: foram 10 meses de falha silenciosa do
-- job-worker que so apareceram PORQUE havia log. Manter o log e podar e melhor.
--
-- Custo do job novo: 1 execucao por dia, apagando ~7.488 linhas. Irrelevante
-- perto dos 7.488 registros/dia que ele remove.
--
-- Roda as 04:15 UTC (01:15 em Brasilia) — fora do horario comercial.
--
-- Obs.: cron.schedule() e SECURITY DEFINER, entao funciona mesmo com o papel
-- postgres nao tendo DELETE direto em cron.job.

SELECT cron.schedule(
  'purge-cron-job-run-details-daily',
  '15 4 * * *',
  $$DELETE FROM cron.job_run_details WHERE start_time < now() - interval '7 days'$$
);

-- Conferir que entrou (somente leitura):
--
--   SELECT jobid, jobname, schedule, active, command
--   FROM cron.job WHERE jobname = 'purge-cron-job-run-details-daily';
--
-- Para remover depois, se quiser:
--
--   SELECT cron.unschedule('purge-cron-job-run-details-daily');
--
-- ATENCAO: a poda diaria mantem a CONTAGEM baixa, mas nao devolve espaco ao
-- disco sozinha (mesmo motivo da PARTE C). Como o volume diario e pequeno e o
-- espaco liberado e reaproveitado pelas linhas novas, o arquivo se estabiliza
-- em torno de 50-60 MB. Confira o tamanho a cada alguns meses com a PARTE D e,
-- se tiver crescido muito, repita a PARTE C.
