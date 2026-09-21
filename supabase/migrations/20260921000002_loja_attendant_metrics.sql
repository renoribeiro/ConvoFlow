-- =============================================================================
-- 20260921000002_loja_attendant_metrics
--
-- Métricas por PESSOA, por POSSE de conversa — só para quem administra a Loja.
--
-- O QUE MEDE (e o que não mede)
--   `messages` não tinha autor até 20260921000004; e mesmo com autor, o
--   histórico anterior não existe. Esta função mede o que o banco sabe com
--   honestidade: QUEM ESTÁ COM cada conversa (conversations.assigned_profile_id)
--   e como ela chegou até a pessoa (assigned_by). Nada aqui diz quem respondeu.
--
--   Uma linha por pessoa que tem conversa NÃO arquivada em posse (ou que
--   aparece em transferência da regra de tempo), MAIS UMA linha com
--   profile_id NULL — o que está SEM responsável. Essa linha existe de
--   propósito: medido em 2026-09-21 na EncaixaRH, 4 de 168 conversas tinham
--   dono e 92 esperavam resposta sem dono nenhum. Uma tela só com donos diria
--   ao gestor que ninguém deve nada. A linha NULL é o que impede isso.
--
--   Por linha:
--     n_held                      conversas não arquivadas em posse
--     n_assumed                   ...que a própria pessoa assumiu (assigned_by = ela)
--     n_transferred               ...recebidas de um colega (assigned_by = outro)
--     n_automatic                 ...recebidas sem ninguém passar (assigned_by NULL:
--                                 rodízio, regra de tempo ou nó do chatbot — a
--                                 linha não distingue; o log 20260921000003 sim)
--     n_waiting                   ...em que o cliente falou depois da última
--                                 resposta humana (response_rule_turn_start)
--     n_no_human_reply            ...sem NENHUMA resposta humana
--     n_rule_transfers_suffered   vezes que a regra de tempo TIROU conversa da
--                                 pessoa (notifications, reason='response_rule',
--                                 metadata.previous_profile_id = ela)
--     n_rule_transfers_received   vezes que a regra ENTREGOU conversa à pessoa
--                                 (mesma notificação, user_id = ela)
--     reason                      NULL para quem está no time; senão o mesmo
--                                 vocabulário de loja_ineligible_owners
--                                 (deleted / suspended / pending / moved /
--                                 zero_percent) — quem saiu segue listado
--     is_parent_account           true para o gerente da Conta acima da Loja
--                                 (ele atende junto e pode ter posse)
--
-- ALCANCE: rotation_admin_scope_ok(p_tenant_id) — superadmin, gestor/gerente da
--   própria Conta, e gerente sobre Loja filha. É o gate de loja_ineligible_owners
--   e conversation_rotation_get. ATENDENTE RECEBE ZERO LINHAS. Sem service_role:
--   decisão de produto de 2026-09-21 — o relatório por e-mail tem destinatários
--   livres e um atendente poderia receber números dos colegas.
--
-- IDEMPOTENTE: CREATE OR REPLACE e GRANT. Nada de dado de usuário.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.loja_attendant_metrics(p_tenant_id uuid)
RETURNS TABLE (
  profile_id                uuid,
  first_name                text,
  last_name                 text,
  role                      text,
  is_parent_account         boolean,
  reason                    text,
  n_held                    bigint,
  n_assumed                 bigint,
  n_transferred             bigint,
  n_automatic               bigint,
  n_waiting                 bigint,
  n_no_human_reply          bigint,
  n_rule_transfers_suffered bigint,
  n_rule_transfers_received bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_parent  uuid;
  v_enabled boolean;
BEGIN
  IF NOT public.rotation_admin_scope_ok(p_tenant_id) THEN
    RETURN;
  END IF;

  SELECT t.parent_tenant_id, COALESCE((t.settings ->> 'rotation_enabled')::boolean, false)
    INTO v_parent, v_enabled
    FROM public.tenants t WHERE t.id = p_tenant_id;

  RETURN QUERY
  WITH held AS (
    SELECT c.id, c.assigned_profile_id AS pid, c.assigned_by,
           EXISTS (
             SELECT 1 FROM public.messages i
              WHERE i.conversation_id = c.id
                AND i.direction IN ('inbound', 'incoming')
                AND i.created_at > COALESCE(
                      (SELECT max(h.created_at) FROM public.messages h
                        WHERE h.conversation_id = c.id
                          AND h.direction = 'outbound'
                          AND h.is_from_bot IS NOT TRUE
                          AND h.source IS NULL),
                      '-infinity'::timestamptz)
           ) AS waiting,
           NOT EXISTS (
             SELECT 1 FROM public.messages h
              WHERE h.conversation_id = c.id
                AND h.direction = 'outbound'
                AND h.is_from_bot IS NOT TRUE
                AND h.source IS NULL
           ) AS no_human
      FROM public.conversations c
     WHERE c.tenant_id = p_tenant_id
       AND COALESCE(c.is_archived, false) = false
  ),
  rule_events AS (
    SELECT (n.metadata ->> 'previous_profile_id')::uuid AS lost_pid,
           n.user_id AS got_user_id
      FROM public.notifications n
     WHERE n.tenant_id = p_tenant_id
       AND n.metadata ->> 'reason' = 'response_rule'
  ),
  people AS (
    -- A linha "sem responsável" existe SEMPRE, mesmo com zero conversas sem
    -- dono: a tela mostra "0 sem responsável" em vez de esconder a informação.
    SELECT NULL::uuid AS pid
    UNION
    SELECT h.pid FROM held h
    UNION
    SELECT r.lost_pid FROM rule_events r WHERE r.lost_pid IS NOT NULL
    UNION
    SELECT p.id FROM public.profiles p
     WHERE p.user_id IN (SELECT r.got_user_id FROM rule_events r)
       AND (p.tenant_id = p_tenant_id OR p.tenant_id = v_parent)
  )
  SELECT pe.pid AS profile_id,
         p.first_name,
         p.last_name,
         p.role::text AS role,
         (pe.pid IS NOT NULL AND p.tenant_id IS NOT NULL AND p.tenant_id = v_parent) AS is_parent_account,
         CASE
           WHEN pe.pid IS NULL THEN NULL
           WHEN p.id IS NULL THEN 'deleted'
           WHEN p.status <> 'active' THEN p.status
           WHEN p.tenant_id <> p_tenant_id
                AND NOT (p.role = 'gerente'::public.user_role AND p.tenant_id = v_parent) THEN 'moved'
           WHEN v_enabled AND rot.percent = 0 THEN 'zero_percent'
           ELSE NULL
         END AS reason,
         (SELECT count(*) FROM held h WHERE h.pid IS NOT DISTINCT FROM pe.pid)::bigint AS n_held,
         (SELECT count(*) FROM held h WHERE h.pid IS NOT DISTINCT FROM pe.pid AND pe.pid IS NOT NULL
                                        AND h.assigned_by = h.pid)::bigint AS n_assumed,
         (SELECT count(*) FROM held h WHERE h.pid IS NOT DISTINCT FROM pe.pid AND pe.pid IS NOT NULL
                                        AND h.assigned_by IS NOT NULL AND h.assigned_by <> h.pid)::bigint AS n_transferred,
         (SELECT count(*) FROM held h WHERE h.pid IS NOT DISTINCT FROM pe.pid AND pe.pid IS NOT NULL
                                        AND h.assigned_by IS NULL)::bigint AS n_automatic,
         (SELECT count(*) FROM held h WHERE h.pid IS NOT DISTINCT FROM pe.pid AND h.waiting)::bigint AS n_waiting,
         (SELECT count(*) FROM held h WHERE h.pid IS NOT DISTINCT FROM pe.pid AND h.no_human)::bigint AS n_no_human_reply,
         (SELECT count(*) FROM rule_events r WHERE pe.pid IS NOT NULL AND r.lost_pid = pe.pid)::bigint AS n_rule_transfers_suffered,
         (SELECT count(*) FROM rule_events r WHERE pe.pid IS NOT NULL AND p.user_id IS NOT NULL
                                               AND r.got_user_id = p.user_id)::bigint AS n_rule_transfers_received
    FROM people pe
    LEFT JOIN public.profiles p ON p.id = pe.pid
    LEFT JOIN public.conversation_rotation rot ON rot.tenant_id = p_tenant_id AND rot.profile_id = pe.pid
   -- 7 = n_held (posicional: o nome é OUT da função e seria ambíguo em plpgsql)
   ORDER BY (pe.pid IS NULL) DESC, 7 DESC, p.first_name NULLS LAST, pe.pid;
END;
$function$;

REVOKE ALL ON FUNCTION public.loja_attendant_metrics(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.loja_attendant_metrics(uuid) TO authenticated;

COMMENT ON FUNCTION public.loja_attendant_metrics(uuid) IS
  'Métricas por pessoa, por POSSE (não por autoria): conversas não arquivadas em posse, como chegaram (assumiu / de colega / automático), quantas esperam resposta humana, quantas sem resposta humana, e transferências da regra de tempo sofridas/recebidas (notifications). Mais uma linha com profile_id NULL = sem responsável. Gate rotation_admin_scope_ok: atendente recebe zero linhas. Sem service_role de propósito.';

-- -----------------------------------------------------------------------------
-- Conferência + ledger
-- -----------------------------------------------------------------------------
DO $chk$
BEGIN
  IF to_regprocedure('public.loja_attendant_metrics(uuid)') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: loja_attendant_metrics não existe.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'loja_attendant_metrics' AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'ABORTADO: loja_attendant_metrics não é SECURITY DEFINER.';
  END IF;
  -- Prova do gate: sem JWT, a função devolve nada (rotation_admin_scope_ok → false).
  IF EXISTS (SELECT 1 FROM public.loja_attendant_metrics('00000000-0000-4000-8000-000000000000')) THEN
    RAISE EXCEPTION 'ABORTADO: loja_attendant_metrics devolveu linha sem JWT.';
  END IF;

  INSERT INTO supabase_migrations.schema_migrations (version, name)
  VALUES ('20260921000002', 'loja_attendant_metrics')
  ON CONFLICT (version) DO NOTHING;

  RAISE NOTICE 'loja_attendant_metrics aplicada.';
END
$chk$;

-- =============================================================================
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.loja_attendant_metrics(uuid);
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260921000002';
-- =============================================================================
