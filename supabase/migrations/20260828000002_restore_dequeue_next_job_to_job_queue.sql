-- Conserta a fila de jobs: dequeue_next_job volta a ler public.job_queue.
--
-- ============================================================================
-- O QUE ESTAVA QUEBRADO
-- ============================================================================
--
-- Existiam DUAS filas no banco:
--
--   public.job_queue  — criada em 20250802131719, chaveada por tenant_id,
--                       FK para public.tenants (viva). Trio completo e correto:
--                       filtro por tipo, ordem por prioridade, marcacao de
--                       'processing' e retentativa com backoff de 5 min.
--
--   public.jobs       — criada no dia seguinte pelo
--                       20250803074510_consolidated_initial_setup_v5, chaveada
--                       por company_id, FK para public.companies (tabela morta
--                       da era pre-tenant: 2 linhas obsoletas contra 5 tenants
--                       vivos). Nunca teve funcao de enfileiramento.
--
-- TODOS os produtores escrevem em job_queue, via enqueue_job():
--   * automation-processor (edge function), acao send_message
--   * process_incoming_message() e as duas variantes de chatbot legado
--   * schedule_follow_up_message()
--
-- E o CONSUMIDOR tambem foi escrito para job_queue. A prova esta na interface
-- TypeScript do proprio job-worker:
--
--   interface Job { id: string; tenant_id: string; job_type: ...;
--                   job_data: JobData; current_attempts: number }
--
-- Isso e exatamente o formato de job_queue. `jobs` devolve company_id / type /
-- payload — nomes que o worker nao le.
--
-- O unico elo quebrado era esta funcao. Em algum momento depois de 2025-08-18
-- (o dump de schema daquela data ainda mostra a versao correta) ela foi
-- recriada apontando para public.jobs, devolvendo bigint/company_id/type/
-- payload. Com isso:
--
--   produtor -> job_queue        (escreve)
--   consumidor -> jobs           (le)   <-- nunca se encontram
--
-- Efeito pratico: a acao "enviar mensagem" das automacoes enfileira e NUNCA
-- envia, sem erro em lugar nenhum. Nao explodiu ainda porque a unica automacao
-- ativa em producao usa update_contact, que escreve direto em contacts.
--
-- ============================================================================
-- SEGUNDO BUG CONSERTADO AQUI: entrega duplicada
-- ============================================================================
--
-- A versao que estava no ar fazia SELECT ... FOR UPDATE SKIP LOCKED e devolvia
-- a linha SEM marcar status = 'processing'. O PostgREST confirma cada RPC na
-- hora, entao a trava do FOR UPDATE some assim que a funcao retorna.
--
-- Consequencia: duas execucoes sobrepostas do job-worker (o loop dele dura 45 s
-- e o cron dispara a cada minuto) pegariam o MESMO job e enviariam a MESMA
-- mensagem duas vezes para o cliente.
--
-- A versao original marcava 'processing' + started_at + current_attempts dentro
-- da mesma transacao do SELECT. E o que volta aqui.
--
-- ============================================================================
-- O QUE ESTA MIGRACAO FAZ
-- ============================================================================
--
-- Restaura a definicao VERBATIM de 20250802131928 (que por sua vez so acrescentou
-- `SET search_path TO ''` a original de 20250802131719).
--
-- Precisa de DROP antes do CREATE: o tipo de retorno muda (bigint -> uuid,
-- company_id -> tenant_id), e CREATE OR REPLACE nao consegue trocar o tipo de
-- retorno de uma funcao.

DROP FUNCTION IF EXISTS public.dequeue_next_job(text[]);

CREATE OR REPLACE FUNCTION public.dequeue_next_job(
  p_job_types text[] DEFAULT NULL
) RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  job_type text,
  job_data jsonb,
  current_attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  job_record RECORD;
BEGIN
  -- Find and lock the next job to process
  SELECT jq.id, jq.tenant_id, jq.job_type, jq.job_data, jq.current_attempts
  INTO job_record
  FROM public.job_queue jq
  WHERE jq.status = 'pending'
    AND jq.scheduled_at <= now()
    AND (p_job_types IS NULL OR jq.job_type = ANY(p_job_types))
  ORDER BY jq.priority DESC, jq.scheduled_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF job_record.id IS NOT NULL THEN
    -- Mark job as processing.
    --
    -- CORRECAO OBRIGATORIA em cima do original: a versao de 20250802131928
    -- escrevia `current_attempts = current_attempts + 1` sem qualificar, e isso
    -- NAO EXECUTA. O `RETURNS TABLE (... current_attempts integer)` cria uma
    -- variavel PL/pgSQL com esse nome, entao o lado direito fica ambiguo:
    --
    --   ERROR: 42702: column reference "current_attempts" is ambiguous
    --   DETAIL: It could refer to either a PL/pgSQL variable or a table column.
    --
    -- Descoberto em 2026-08-28 com um teste que enfileirou um job de verdade e
    -- chamou a funcao. O erro nunca apareceu em producao porque job_queue nunca
    -- teve uma linha — o produtor escrevia nela, mas o consumidor lia `jobs`.
    -- Ou seja: a fila nunca funcionou em NENHUMA das duas pontas.
    --
    -- O apelido `jq` resolve a ambiguidade sem mexer nos nomes das colunas de
    -- retorno, que o TypeScript do job-worker le.
    UPDATE public.job_queue AS jq
    SET
      status = 'processing',
      started_at = now(),
      current_attempts = jq.current_attempts + 1,
      updated_at = now()
    WHERE jq.id = job_record.id;

    -- Return job details
    RETURN QUERY SELECT
      job_record.id,
      job_record.tenant_id,
      job_record.job_type,
      job_record.job_data,
      job_record.current_attempts;
  END IF;
END;
$$;

-- Mesmas permissoes que a funcao tinha antes do DROP.
GRANT EXECUTE ON FUNCTION public.dequeue_next_job(text[]) TO anon, authenticated, service_role;
