-- =============================================================================
-- 20260921000003_conversation_assignment_events
--
-- Log de eventos de atribuição de conversa — só acréscimo, nunca sobrescrito.
--
-- POR QUE EXISTE
--   `conversations.assigned_at` e `assigned_by` são SOBRESCRITOS a cada
--   transferência; devolver para "sem responsável" zera os três campos; o
--   rodízio grava assigned_by NULL e não avisa ninguém. Resultado, medido em
--   2026-09-21: "quantas conversas a Maria recebeu esta semana" não tinha
--   resposta — só a posse ATUAL existia. Esta tabela guarda cada mudança de
--   responsável: quem recebeu, de quem, por quem, quando e COMO.
--
-- NÃO HÁ HISTÓRICO ANTES DE HOJE. A tabela começa VAZIA em 2026-09-21. Tudo o
--   que aconteceu antes (posses trocadas, devoluções, atribuições do rodízio)
--   não pode ser reconstruído: as colunas de origem foram sobrescritas. As 3
--   notificações de transferência manual de 17/09 continuam em `notifications`,
--   mas não são importadas aqui — este log é registro, não reconstrução.
--
-- COMO (kind)
--   assume         a própria pessoa assumiu (assigned_by = assigned_profile_id)
--   transfer       alguém passou a conversa a outra pessoa (assigned_by ≠ dono)
--   release        voltou para "sem responsável" (assigned_profile_id NULL)
--   response_rule  a regra de tempo transferiu (auto_transfer_count subiu na
--                  MESMA escrita — é o que response_rule_transfer faz)
--   rotation       o rodízio atribuiu (rotation_assign_conversation marca a
--                  transação com set_config('convoflow.assignment_kind') —
--                  a única mudança nessa função: uma linha antes do UPDATE e
--                  uma depois; o corpo é o mesmo de 20260915000001)
--   bot_node       atribuição automática sem marca e sem contador: hoje só o
--                  nó transfer_agent do chatbot escreve assim
--                  (chatbot-engine.ts, assignConversationToTransferTarget).
--                  Um escritor automático NOVO deve marcar a transação, ou
--                  cairá aqui — está dito no comentário da coluna.
--
-- O TRIGGER NUNCA DERRUBA A ESCRITA. O rodízio atualiza `conversations` DENTRO
--   da transação do INSERT inbound (zz_rotation_assign_on_inbound); um erro
--   aqui abortaria o INSERT e, no caminho Evolution, a mensagem do cliente
--   sumiria (o webhook descarta o erro do INSERT). Por isso o corpo inteiro
--   está em EXCEPTION WHEN OTHERS → RAISE WARNING → RETURN NEW, como os
--   triggers de 20260914000001 e 20260915000001. Provado em
--   docs/teste_log_atribuicao.sql (D5: sabotagem do INSERT no log, inbound
--   continua entrando).
--
-- LEITURA: só pela RPC conversation_assignment_events_list, gate
--   rotation_admin_scope_ok (gestor/gerente da Loja, gerente sobre Loja filha,
--   superadmin). A tabela tem RLS ligado e NENHUMA policy: authenticated não
--   lê nem escreve direto. service_role tudo.
--
-- IDEMPOTENTE: pode rodar de novo. Nada de dado de usuário é tocado.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabela
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversation_assignment_events (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       uuid        NOT NULL,
  conversation_id uuid        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  -- Ids de perfil SEM FK de propósito: o log é história. Apagar o perfil não
  -- apaga o fato de que a conversa passou por ele.
  from_profile_id uuid        NULL,
  to_profile_id   uuid        NULL,
  by_profile_id   uuid        NULL,
  kind            text        NOT NULL
                  CHECK (kind IN ('assume', 'transfer', 'release', 'rotation', 'response_rule', 'bot_node')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assignment_events_tenant_created
  ON public.conversation_assignment_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assignment_events_conversation
  ON public.conversation_assignment_events (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assignment_events_to_profile
  ON public.conversation_assignment_events (tenant_id, to_profile_id, created_at DESC)
  WHERE to_profile_id IS NOT NULL;

COMMENT ON TABLE public.conversation_assignment_events IS
  'Cada mudança de conversations.assigned_profile_id: de quem, para quem, por quem, quando e como. Só acréscimo, gravado pelo trigger trg_log_conversation_assignment (SECURITY DEFINER, exception-safe). Começou VAZIA em 2026-09-21: não há história anterior e ela não pode ser reconstruída. Leitura só pela RPC conversation_assignment_events_list (gate rotation_admin_scope_ok).';
COMMENT ON COLUMN public.conversation_assignment_events.kind IS
  'assume | transfer | release | response_rule | rotation | bot_node. Automático sem marca de transação (set_config convoflow.assignment_kind) e sem contador da regra cai em bot_node — um escritor automático novo deve marcar a transação.';

ALTER TABLE public.conversation_assignment_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.conversation_assignment_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.conversation_assignment_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.conversation_assignment_events_id_seq TO service_role;

-- -----------------------------------------------------------------------------
-- 2. O trigger
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_log_conversation_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_kind  text;
  v_by    uuid;
  v_actor uuid;
  v_mark  text;
BEGIN
  IF NEW.assigned_profile_id IS NOT DISTINCT FROM OLD.assigned_profile_id THEN
    RETURN NEW;
  END IF;

  -- Quem está logado (NULL para service role, cron e triggers do inbound).
  IF auth.uid() IS NOT NULL THEN
    SELECT p.id INTO v_actor
      FROM public.profiles p
     WHERE p.user_id = auth.uid()
     ORDER BY (p.tenant_id = NEW.tenant_id) DESC NULLS LAST
     LIMIT 1;
  END IF;

  IF NEW.assigned_profile_id IS NULL THEN
    v_kind := 'release';
    v_by   := COALESCE(NEW.assigned_by, v_actor);
  ELSIF NEW.assigned_by IS NOT NULL THEN
    v_kind := CASE WHEN NEW.assigned_by = NEW.assigned_profile_id THEN 'assume' ELSE 'transfer' END;
    v_by   := NEW.assigned_by;
  ELSIF COALESCE(NEW.auto_transfer_count, 0) > COALESCE(OLD.auto_transfer_count, 0) THEN
    v_kind := 'response_rule';
    v_by   := NULL;
  ELSE
    v_mark := current_setting('convoflow.assignment_kind', true);
    v_kind := CASE WHEN v_mark = 'rotation' THEN 'rotation' ELSE 'bot_node' END;
    -- Sem marca e com gente logada é uma atribuição manual sem assigned_by:
    -- não deveria acontecer (buildAssignmentPatch sempre grava), mas se
    -- acontecer o ator fica registrado em vez de perdido.
    v_by   := CASE WHEN v_mark IS NULL OR v_mark = '' THEN v_actor ELSE NULL END;
  END IF;

  INSERT INTO public.conversation_assignment_events
    (tenant_id, conversation_id, from_profile_id, to_profile_id, by_profile_id, kind)
  VALUES
    (NEW.tenant_id, NEW.id, OLD.assigned_profile_id, NEW.assigned_profile_id, v_by, v_kind);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Escrituração nunca derruba uma atribuição — nem o INSERT inbound em que
  -- o rodízio roda.
  RAISE WARNING 'tg_log_conversation_assignment(%) falhou: % [%]', NEW.id, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.tg_log_conversation_assignment() IS
  'AFTER UPDATE OF assigned_profile_id em conversations: grava uma linha em conversation_assignment_events com o tipo (assume/transfer/release/response_rule/rotation/bot_node). Exception-safe: nunca aborta a escrita que o disparou.';

DROP TRIGGER IF EXISTS trg_log_conversation_assignment ON public.conversations;
CREATE TRIGGER trg_log_conversation_assignment
  AFTER UPDATE OF assigned_profile_id ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_log_conversation_assignment();

-- -----------------------------------------------------------------------------
-- 3. A marca do rodízio — rotation_assign_conversation ganha DUAS linhas
--    (set_config antes do UPDATE e limpeza depois). O resto é o texto de
--    20260915000001, inclusive lock_timeout e SECURITY DEFINER.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rotation_assign_conversation(p_conversation_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
SET lock_timeout TO '3s'
AS $function$
DECLARE
  v_tenant uuid;
  v_owner  uuid;
  v_winner uuid;
BEGIN
  SELECT c.tenant_id, c.assigned_profile_id INTO v_tenant, v_owner
    FROM public.conversations c
   WHERE c.id = p_conversation_id
   FOR UPDATE;
  IF NOT FOUND OR v_owner IS NOT NULL THEN
    RETURN NULL;
  END IF;

  v_winner := public.rotation_pick(v_tenant);
  IF v_winner IS NULL THEN
    RETURN NULL;
  END IF;

  -- Marca da transação lida por tg_log_conversation_assignment (20260921000003).
  PERFORM set_config('convoflow.assignment_kind', 'rotation', true);
  UPDATE public.conversations
     SET assigned_profile_id = v_winner,
         assigned_at         = now(),
         assigned_by         = NULL
   WHERE id = p_conversation_id
     AND assigned_profile_id IS NULL;
  PERFORM set_config('convoflow.assignment_kind', '', true);

  RETURN v_winner;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 4. Leitura — só pela RPC, gate rotation_admin_scope_ok
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conversation_assignment_events_list(
  p_tenant_id uuid,
  p_from      timestamptz DEFAULT NULL,
  p_to        timestamptz DEFAULT NULL,
  p_limit     integer     DEFAULT 500
)
RETURNS TABLE (
  id              bigint,
  conversation_id uuid,
  contact_id      uuid,
  from_profile_id uuid,
  to_profile_id   uuid,
  by_profile_id   uuid,
  kind            text,
  created_at      timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.rotation_admin_scope_ok(p_tenant_id) THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT e.id, e.conversation_id, c.contact_id, e.from_profile_id, e.to_profile_id, e.by_profile_id, e.kind, e.created_at
    FROM public.conversation_assignment_events e
    LEFT JOIN public.conversations c ON c.id = e.conversation_id
   WHERE e.tenant_id = p_tenant_id
     AND (p_from IS NULL OR e.created_at >= p_from)
     AND (p_to   IS NULL OR e.created_at <= p_to)
   ORDER BY e.created_at DESC, e.id DESC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 500), 1), 5000);
END;
$function$;

REVOKE ALL ON FUNCTION public.conversation_assignment_events_list(uuid, timestamptz, timestamptz, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conversation_assignment_events_list(uuid, timestamptz, timestamptz, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.conversation_assignment_events_list(uuid, timestamptz, timestamptz, integer) IS
  'Eventos de atribuição da Loja (mais recentes primeiro), só para quem administra (rotation_admin_scope_ok). Atendente recebe zero linhas.';

-- -----------------------------------------------------------------------------
-- 5. Conferência + ledger
-- -----------------------------------------------------------------------------
DO $chk$
DECLARE
  n_pol int;
BEGIN
  IF to_regclass('public.conversation_assignment_events') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: tabela conversation_assignment_events não existe.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_log_conversation_assignment'
                   AND tgrelid = 'public.conversations'::regclass) THEN
    RAISE EXCEPTION 'ABORTADO: trigger trg_log_conversation_assignment não existe.';
  END IF;
  IF to_regprocedure('public.conversation_assignment_events_list(uuid, timestamptz, timestamptz, integer)') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: conversation_assignment_events_list não existe.';
  END IF;
  IF position('convoflow.assignment_kind' IN pg_get_functiondef('public.rotation_assign_conversation(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'ABORTADO: rotation_assign_conversation não marca a transação.';
  END IF;
  SELECT count(*) INTO n_pol FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'conversation_assignment_events';
  IF n_pol <> 0 THEN
    RAISE EXCEPTION 'ABORTADO: conversation_assignment_events tem % policies; deve ter zero (leitura só por RPC).', n_pol;
  END IF;

  INSERT INTO supabase_migrations.schema_migrations (version, name)
  VALUES ('20260921000003', 'conversation_assignment_events')
  ON CONFLICT (version) DO NOTHING;

  RAISE NOTICE 'conversation_assignment_events aplicada: tabela vazia (sem história anterior), 1 trigger, rotation_assign_conversation marcada, 1 RPC de leitura.';
END
$chk$;

-- =============================================================================
-- ROLLBACK
--   DROP TRIGGER IF EXISTS trg_log_conversation_assignment ON public.conversations;
--   DROP FUNCTION IF EXISTS public.tg_log_conversation_assignment();
--   DROP FUNCTION IF EXISTS public.conversation_assignment_events_list(uuid, timestamptz, timestamptz, integer);
--   DROP TABLE IF EXISTS public.conversation_assignment_events;
--   -- rotation_assign_conversation: recriar com o texto de 20260915000001:402-432
--   -- (as duas linhas de set_config a menos; o resto é idêntico).
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260921000003';
-- =============================================================================
