-- =============================================================================
-- 20260921000001_loja_conversation_metrics
--
-- Métricas por CONVERSA, da Loja inteira — uma função `loja_*` a mais, no
-- mesmo molde da migração 20260914000001 (SECURITY DEFINER, só contagens e
-- medianas, nunca texto nem id).
--
-- POR QUE EXISTE
--   O cartão "Tempo Médio de Resposta" do Dashboard media, via
--   loja_response_time, a 1ª outbound depois da 1ª inbound — SEM distinguir
--   bot de pessoa. Medido em 2026-09-21 na EncaixaRH (todo o histórico): a
--   fórmula dava 8,4 min; a 1ª resposta de uma PESSOA tinha média de 3.112 min
--   (~52 h) e mediana de 448 min (7,5 h). O cartão media o bot. Esta função
--   separa os dois e devolve MEDIANA (a média era puxada por meia dúzia de
--   conversas esquecidas; a mediana é o que acontece de fato).
--
-- O QUE DEVOLVE (uma linha; zero linhas quando o chamador não tem alcance)
--   Janela = conversas CRIADAS entre p_from e p_to (NULL = sem limite), como
--   loja_conversation_counts. Os "agora" ignoram a janela: são retrato de hoje.
--     n_conversations            conversas na janela
--     n_bot_touched              ...em que o bot falou (is_from_bot ou source='chatbot')
--     n_no_human_reply           ...sem NENHUMA resposta humana
--     n_waiting_human            AGORA: conversas não arquivadas em que o cliente
--                                falou depois da última resposta humana
--                                (a definição de response_rule_turn_start)
--     n_waiting_human_unowned    ...dessas, quantas não têm responsável
--     n_first_human              conversas com 1ª resposta humana depois da 1ª inbound
--     median_first_human_minutes mediana (min) da 1ª inbound → 1ª resposta HUMANA
--     n_first_bot                conversas com 1ª resposta do bot depois da 1ª inbound
--     median_first_bot_minutes   mediana (min) da 1ª inbound → 1ª resposta do BOT
--     median_messages            mediana de mensagens por conversa
--     median_duration_minutes    mediana (min) da 1ª à última mensagem
--
-- "RESPOSTA HUMANA" é a definição que o resto do sistema já usa —
--   trg_record_conversation_participant (20260914000001:187-191) e
--   response_rule_turn_start (20260916000001:305-325):
--   direction = 'outbound' AND is_from_bot IS NOT TRUE AND source IS NULL.
--   Consequência assumida: mensagem com `source` (campanha, follow-up,
--   automação e, a partir de 20260921000004, histórico importado) NÃO é
--   resposta humana. Mensagem digitada no celular pelo caminho Evolution
--   (send.message, source NULL) É resposta humana — sem autor, mas humana.
--
-- ALCANCE: loja_stats_scope_ok(p_tenant_id, false) — própria Conta e Lojas
--   filhas do gerente; superadmin NÃO (conversations não tem policy de
--   superadmin, de propósito). MAIS o papel service_role: o relatório por
--   e-mail (report-core, com service role) precisa dos mesmos números da tela.
--   auth.role() = 'service_role' já é o critério usado em policies deste banco
--   (20260309221219).
--
-- IDEMPOTENTE: só CREATE OR REPLACE e GRANT. Nada de dado de usuário.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.loja_conversation_metrics(
  p_tenant_id uuid,
  p_from      timestamptz DEFAULT NULL,
  p_to        timestamptz DEFAULT NULL
)
RETURNS TABLE (
  n_conversations            bigint,
  n_bot_touched              bigint,
  n_no_human_reply           bigint,
  n_waiting_human            bigint,
  n_waiting_human_unowned    bigint,
  n_first_human              bigint,
  median_first_human_minutes numeric,
  n_first_bot                bigint,
  median_first_bot_minutes   numeric,
  median_messages            numeric,
  median_duration_minutes    numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT (public.loja_stats_scope_ok(p_tenant_id, false)
          OR COALESCE((SELECT auth.role()), '') = 'service_role') THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH cs AS (
    SELECT c.id
      FROM public.conversations c
     WHERE c.tenant_id = p_tenant_id
       AND (p_from IS NULL OR c.created_at >= p_from)
       AND (p_to   IS NULL OR c.created_at <= p_to)
  ),
  base AS (
    SELECT cs.id,
           min(m.created_at) FILTER (WHERE m.direction IN ('inbound', 'incoming')) AS t_in,
           count(m.id) AS n_msgs,
           count(m.id) FILTER (WHERE m.is_from_bot IS TRUE OR m.source = 'chatbot') AS n_bot,
           count(m.id) FILTER (WHERE m.direction = 'outbound'
                                 AND m.is_from_bot IS NOT TRUE
                                 AND m.source IS NULL) AS n_human,
           min(m.created_at) AS t0,
           max(m.created_at) AS t1
      FROM cs
      LEFT JOIN public.messages m ON m.conversation_id = cs.id
     GROUP BY cs.id
  ),
  firsts AS (
    SELECT b.*,
           (SELECT min(h.created_at)
              FROM public.messages h
             WHERE h.conversation_id = b.id
               AND h.direction = 'outbound'
               AND h.is_from_bot IS NOT TRUE
               AND h.source IS NULL
               AND h.created_at >= b.t_in) AS t_human,
           (SELECT min(x.created_at)
              FROM public.messages x
             WHERE x.conversation_id = b.id
               AND x.direction = 'outbound'
               AND (x.is_from_bot IS TRUE OR x.source = 'chatbot')
               AND x.created_at >= b.t_in) AS t_bot
      FROM base b
  ),
  waiting AS (
    SELECT c.id, c.assigned_profile_id AS owner
      FROM public.conversations c
     WHERE c.tenant_id = p_tenant_id
       AND COALESCE(c.is_archived, false) = false
       AND EXISTS (
         SELECT 1
           FROM public.messages i
          WHERE i.conversation_id = c.id
            AND i.direction IN ('inbound', 'incoming')
            AND i.created_at > COALESCE(
                  (SELECT max(h.created_at)
                     FROM public.messages h
                    WHERE h.conversation_id = c.id
                      AND h.direction = 'outbound'
                      AND h.is_from_bot IS NOT TRUE
                      AND h.source IS NULL),
                  '-infinity'::timestamptz))
  )
  SELECT
    (SELECT count(*) FROM firsts)::bigint,
    (SELECT count(*) FROM firsts f WHERE f.n_bot > 0)::bigint,
    (SELECT count(*) FROM firsts f WHERE f.n_human = 0)::bigint,
    (SELECT count(*) FROM waiting)::bigint,
    (SELECT count(*) FROM waiting w WHERE w.owner IS NULL)::bigint,
    (SELECT count(*) FROM firsts f WHERE f.t_human IS NOT NULL)::bigint,
    (SELECT (percentile_cont(0.5) WITHIN GROUP
              (ORDER BY extract(epoch FROM (f.t_human - f.t_in))::double precision) / 60.0)::numeric
       FROM firsts f WHERE f.t_human IS NOT NULL),
    (SELECT count(*) FROM firsts f WHERE f.t_bot IS NOT NULL)::bigint,
    (SELECT (percentile_cont(0.5) WITHIN GROUP
              (ORDER BY extract(epoch FROM (f.t_bot - f.t_in))::double precision) / 60.0)::numeric
       FROM firsts f WHERE f.t_bot IS NOT NULL),
    (SELECT (percentile_cont(0.5) WITHIN GROUP (ORDER BY f.n_msgs::double precision))::numeric
       FROM firsts f),
    (SELECT (percentile_cont(0.5) WITHIN GROUP
              (ORDER BY extract(epoch FROM (f.t1 - f.t0))::double precision) / 60.0)::numeric
       FROM firsts f WHERE f.t1 > f.t0);
END;
$function$;

REVOKE ALL ON FUNCTION public.loja_conversation_metrics(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.loja_conversation_metrics(uuid, timestamptz, timestamptz) TO authenticated, service_role;

COMMENT ON FUNCTION public.loja_conversation_metrics(uuid, timestamptz, timestamptz) IS
  'Métricas por conversa da Loja inteira (conversas criadas na janela; os "agora" ignoram a janela): medianas da 1ª resposta do BOT e da 1ª resposta de uma PESSOA (1ª inbound → 1ª outbound do tipo), mediana de mensagens e de duração, quantas o bot tocou, quantas sem resposta humana e quantas esperam uma pessoa agora (com/sem responsável). Resposta humana = outbound, is_from_bot IS NOT TRUE, source IS NULL. SECURITY DEFINER; alcance = loja_stats_scope_ok(sem superadmin) ou service_role (relatório). Só números.';

-- -----------------------------------------------------------------------------
-- Conferência + ledger
-- -----------------------------------------------------------------------------
DO $chk$
DECLARE
  n_cols int;
BEGIN
  IF to_regprocedure('public.loja_conversation_metrics(uuid, timestamptz, timestamptz)') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: loja_conversation_metrics não existe.';
  END IF;
  SELECT count(*) INTO n_cols
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'loja_conversation_metrics' AND p.prosecdef;
  IF n_cols <> 1 THEN
    RAISE EXCEPTION 'ABORTADO: esperava 1 loja_conversation_metrics SECURITY DEFINER, achei %.', n_cols;
  END IF;

  INSERT INTO supabase_migrations.schema_migrations (version, name)
  VALUES ('20260921000001', 'loja_conversation_metrics')
  ON CONFLICT (version) DO NOTHING;

  RAISE NOTICE 'loja_conversation_metrics aplicada.';
END
$chk$;

-- =============================================================================
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.loja_conversation_metrics(uuid, timestamptz, timestamptz);
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260921000001';
-- =============================================================================
