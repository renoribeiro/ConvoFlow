-- Remove a fila orfa public.jobs e o complete_job(bigint) que so servia a ela.
--
-- Depende de 20260828000002 (dequeue_next_job voltou a ler job_queue).
--
-- ============================================================================
-- POR QUE ESTA TABELA SAI
-- ============================================================================
--
-- public.jobs foi criada em 20250803074510_consolidated_initial_setup_v5 e:
--
--   * NUNCA recebeu uma linha. n_tup_ins = 0 desde a criacao (2025-08-03).
--   * Nao tem funcao de enfileiramento. Os dois overloads de enqueue_job()
--     escrevem em job_queue.
--   * E chaveada por company_id com FK para public.companies — a tabela morta
--     da era pre-tenant, com 2 linhas obsoletas, enquanto o produto roda em
--     public.tenants com 5 linhas. Nao da nem para representar uma Loja aqui.
--   * O formato que ela devolve (company_id / type / payload) nao e o que o
--     TypeScript do job-worker le (tenant_id / job_type / job_data).
--
-- Ou seja: nao e uma fila em uso, e uma fila que nunca chegou a existir.
-- Enquanto ela ficar de pe, o job-worker tem duas tabelas plausiveis e a
-- proxima pessoa que mexer nisso erra de novo.
--
-- complete_job(bigint, boolean, text) sai junto por um motivo pratico e
-- importante: ele so opera em public.jobs, e a presenca dos DOIS overloads
-- (bigint e uuid) com os MESMOS nomes de parametro deixa a resolucao do
-- PostgREST ambigua na chamada que o worker faz:
--
--   supabase.rpc('complete_job', { p_job_id, p_success, p_error_message })
--
-- Com o overload bigint fora, sobra so complete_job(uuid,...) — que opera em
-- job_queue e ja traz a logica de retentativa correta (reagenda +5 min ate
-- max_attempts). Sem isso, o conserto do 20260828000002 fica pela metade.
--
-- ============================================================================
-- O QUE **NAO** SAI
-- ============================================================================
--
-- handle_new_message(jsonb) tambem cita `jobs`, mas e uma das funcoes mortas da
-- era company_id que ja lancam excecao se chamadas (documentado no CLAUDE.md).
-- Ela ja estava quebrada antes desta migracao e continua igual depois. Mexer
-- nela e outro assunto.
--
-- O indice em jobs(status, type, run_at) que chegou a ser cogitado NAO foi
-- criado, de proposito: nao se indexa tabela que vai ser removida.
--
-- ============================================================================
-- REVERSAO
-- ============================================================================
-- A definicao original da tabela esta em
-- supabase/migrations/20250803074510_consolidated_initial_setup_v5_tables_only.sql
-- e o complete_job(bigint) em database-schema/schema-ddl-2025-08-18T...sql.
-- Como a tabela esta vazia, recriar e um CREATE TABLE — nao ha dado a restaurar.

DO $drop_jobs$
DECLARE
  v_linhas      bigint;
  v_policies    int;
  v_fks         int;
  v_publicacao  int;
  v_views       int;
  v_dequeue_ok  boolean;
BEGIN
  -- GUARDA 1 — a tabela existe? Se ja foi removida, nada a fazer.
  IF to_regclass('public.jobs') IS NULL THEN
    RAISE NOTICE 'public.jobs ja nao existe. Nada a fazer (idempotente).';
  ELSE
    -- GUARDA 2 — a tabela precisa estar VAZIA. Se alguem enfileirou algo entre
    -- a analise e a execucao, aborta e nao perde trabalho de ninguem.
    EXECUTE 'SELECT count(*) FROM public.jobs' INTO v_linhas;
    IF v_linhas <> 0 THEN
      RAISE EXCEPTION
        'ABORTADO: public.jobs tem % linha(s). A premissa da remocao era estar '
        'vazia. Alguem passou a enfileirar aqui — investigue antes de remover.',
        v_linhas;
    END IF;

    -- GUARDA 3 — nada pode depender dela no nivel do catalogo.
    SELECT count(*) INTO v_policies   FROM pg_policy WHERE polrelid='public.jobs'::regclass;
    SELECT count(*) INTO v_fks        FROM pg_constraint WHERE confrelid='public.jobs'::regclass;
    SELECT count(*) INTO v_publicacao FROM pg_publication_tables
      WHERE schemaname='public' AND tablename='jobs';
    SELECT count(*) INTO v_views FROM pg_depend d
      JOIN pg_class c ON c.oid=d.objid
      WHERE d.refobjid='public.jobs'::regclass AND d.deptype='n' AND c.relkind IN ('v','m');

    IF v_fks <> 0 OR v_publicacao <> 0 OR v_views <> 0 THEN
      RAISE EXCEPTION
        'ABORTADO: public.jobs ainda tem dependentes — fks=%, publicacao=%, views=%. '
        'Nada foi removido.', v_fks, v_publicacao, v_views;
    END IF;

    RAISE NOTICE 'jobs: 0 linhas, % policies, 0 fks, 0 views, fora de publicacao. Removendo.', v_policies;

    -- Sem CASCADE, de proposito: se aparecer dependente inesperado, falha alto.
    DROP TABLE public.jobs;
  END IF;

  -- GUARDA 4 — so remove o complete_job(bigint) depois de confirmar que o
  -- consumidor novo esta mesmo apontando para job_queue. Se o 20260828000002
  -- nao tiver sido aplicado, aborta tudo.
  -- Nota: identifica a funcao pela assinatura completa via regprocedure.
  -- pg_get_function_identity_arguments() devolve 'p_job_types text[]' (COM o
  -- nome do parametro), nao 'text[]' — comparar com 'text[]' nunca casa e o
  -- guarda dispara sem motivo.
  SELECT pg_get_functiondef(p.oid) ILIKE '%job_queue%'
    INTO v_dequeue_ok
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.oid::regprocedure::text = 'dequeue_next_job(text[])';

  IF v_dequeue_ok IS NOT TRUE THEN
    RAISE EXCEPTION
      'ABORTADO: dequeue_next_job(text[]) nao aponta para job_queue. Aplique o '
      '20260828000002 primeiro. Nada foi removido.';
  END IF;

  DROP FUNCTION IF EXISTS public.complete_job(bigint, boolean, text);

  -- CONFERENCIA FINAL dentro do mesmo bloco.
  IF to_regclass('public.jobs') IS NOT NULL THEN
    RAISE EXCEPTION 'ABORTADO: public.jobs ainda existe depois do DROP.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='complete_job'
      AND pg_get_function_identity_arguments(p.oid)='bigint, boolean, text'
  ) THEN
    RAISE EXCEPTION 'ABORTADO: complete_job(bigint,...) ainda existe.';
  END IF;

  RAISE NOTICE 'OK. public.jobs removida e complete_job(bigint) removido.';
END
$drop_jobs$;
