-- =============================================================================
-- 20260915000001_conversation_rotation
--
-- Distribuição automática de conversas novas entre atendentes, por
-- porcentagem (passo 3 de 5 da atribuição de atendimento).
--
-- O QUE MUDA
--   1. Três preferências por Loja em `tenants.settings`, gravadas pela RPC
--      `set_tenant_settings` como as do passo 2 e guardadas por CHECK:
--        - rotation_enabled          (boolean; padrão false)
--        - rotation_includes_gestor  (boolean; padrão false)
--        - rotation_timing           ('immediate' | 'after_bot'; padrão 'immediate')
--      Com `rotation_enabled` ausente ou false NADA muda para ninguém: o
--      trigger novo lê a linha da Loja e devolve antes de qualquer outra coisa.
--
--   2. Tabela `conversation_rotation (tenant_id, profile_id, percent, credit)`:
--      a porcentagem de cada pessoa elegível e o crédito acumulado do rodízio.
--      Mesma forma de `conversation_participants`: RLS de leitura para gestor,
--      gerente e superadmin da própria Loja; escrita só por trigger e por
--      função SECURITY DEFINER. Por que uma tabela e não `tenants.settings`:
--        - `set_tenant_settings` faz merge RASO. Um patch parcial apagaria a
--          porcentagem dos colegas sem ninguém perceber; e a soma = 100 não
--          tem como ser validada num merge.
--        - a filiação muda DENTRO do banco, sem JavaScript no caminho
--          (`handle_user_confirmed` em auth.users, cascata de FK, UPDATE direto
--          em profiles). O reequilíbrio tem de estar em SQL e alcançar a
--          porcentagem em SQL.
--        - o crédito muda a cada conversa atribuída. Escrever isso na linha de
--          `tenants` a cada mensagem recebida travaria a linha que todo helper
--          de RLS lê (conversation_visibility_level etc.) e incharia o JSON.
--
--   3. Elegível = perfil ATIVO da Loja com cargo `atendente`, mais o `gestor`
--      quando `rotation_includes_gestor` é true, menos quem está em 0 %.
--      Reequilíbrio automático quando o conjunto elegível muda (trigger em
--      `profiles` para status/role/tenant_id/DELETE e em `tenants` para a chave
--      do gestor): quem sai é removido, quem entra recebe a divisão igual entre
--      os que não estão em 0 % — os 0 % continuam 0 %. Se todos estivessem em
--      0 %, a divisão igual vale para todos (o rodízio não pode ficar sem
--      ninguém). Percentagens inteiras; o resto da divisão vai para quem entrou
--      primeiro. O crédito de todo mundo volta a zero.
--
--   4. O escolhedor: trigger AFTER INSERT em `messages`, SÓ para linhas
--      inbound, SÓ quando a conversa não tem responsável, SÓ quando
--      `auth.uid()` é NULL (webhooks, RPC, cron — nunca importação de histórico
--      nem conversa criada à mão). Algoritmo: round-robin ponderado suave —
--      cada elegível acumula a própria porcentagem por rodada, o maior crédito
--      vence e perde a soma das porcentagens participantes. Serializado por
--      Loja com `pg_advisory_xact_lock`, senão duas mensagens no mesmo instante
--      cairiam na mesma pessoa (nenhuma transação vê o crédito não commitado
--      da outra). O nome do trigger começa com `zz_` DE PROPÓSITO: triggers
--      AFTER disparam em ordem alfabética, e o lock transacional só solta no
--      COMMIT — disparando por último, o intervalo em que a Loja fica
--      serializada é só o escolhedor + a escrita + o commit, e não os cinco
--      triggers que enfileiram webhook e automação.
--
--      `rotation_timing = 'after_bot'`: a conversa só recebe responsável quando
--      não há sessão ativa de chatbot para o contato + instância. O motor do
--      chatbot roda DEPOIS do webhook (fire-and-forget, ~7 s), então na
--      primeira mensagem a sessão ainda não existe. Por isso a espera vale
--      também quando é a primeira mensagem da conversa E há um bot v2
--      publicado para a instância (o bot ainda vai correr). Três coisas
--      garantem que a conversa NÃO fica sem dono esperando um bot que nunca
--      vem: (a) sem bot publicado, atribui na hora; (b) a sessão terminando
--      (transferida/concluída/abandonada pelo motor) atribui naquele instante,
--      por trigger em `chatbot_sessions`; (c) uma varredura por cron a cada 2
--      minutos atribui toda conversa sem dono em que o cliente falou por último
--      há mais de 90 s e não há sessão ativa (cobre o bot que não casou gatilho
--      nenhum e o motor que caiu).
--
--   5. O sino NÃO toca em atribuição automática. A atribuição automática grava
--      `assigned_by = NULL` — verdade dos dados: ninguém passou a conversa — e
--      `tg_notify_conversation_assigned` ganha a condição "sem assigned_by, sem
--      aviso". Transferência feita por pessoa continua tocando: o cliente
--      sempre grava assigned_by (buildAssignmentPatch).
--
--   6. Conversas com responsável NUNCA são reatribuídas automaticamente. É o
--      que faz "o cliente que volta cai com o mesmo atendente" ser verdade —
--      e já era o comportamento. Suspenso ou em 0 % fica com o que tem; só o
--      gestor move, à mão. Para ele achar essas conversas: RPC
--      `loja_ineligible_owners` (quem tem conversa mas não está elegível, com
--      motivo e quantidade), lida pela pílula "Responsável indisponível" e
--      pelo contador da aba Escala.
--
-- NÃO MUDA — de propósito
--   - Nenhuma policy de `conversations` ou `messages`.
--   - `handle_message_conversation` e `update_conversation_on_message`.
--   - O nó `transfer_agent` do chatbot.
--   - Nenhum evento de webhook de saída.
--
-- A MENSAGEM DO CLIENTE NUNCA SE PERDE
--   O escolhedor roda dentro da transação que grava a mensagem. O corpo
--   inteiro dele está em EXCEPTION WHEN OTHERS → RAISE WARNING → RETURN NEW,
--   igual aos triggers do passo 2. Conversa sem responsável é estado inócuo;
--   INSERT abortado não é (no caminho Evolution o webhook descarta o erro do
--   INSERT — evolution-webhook/index.ts:333 — e a mensagem sumiria sem rastro).
--   O único erro que NENHUM handler PL/pgSQL captura é QUERY_CANCELED
--   (statement_timeout / cancelamento). Para o lock nunca virar isso, as
--   funções que esperam lock têm `lock_timeout = 3s`: estourou, vira 55P03,
--   que o handler captura. Provado em docs/teste_rotacao_conversas.sql (R7).
--
-- IDEMPOTENTE: pode rodar de novo. Nada aqui apaga ou sobrescreve dado de
-- usuário. O bloco DO do fim confere e grava o ledger. ROLLBACK no fim.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Guarda de forma das três preferências (CHECK separada da do passo 2)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenants_rotation_settings_check'
      AND conrelid = 'public.tenants'::regclass
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_rotation_settings_check CHECK (
        settings IS NULL
        OR (
          (
            (settings -> 'rotation_enabled') IS NULL
            OR jsonb_typeof(settings -> 'rotation_enabled') IN ('boolean', 'null')
          )
          AND (
            (settings -> 'rotation_includes_gestor') IS NULL
            OR jsonb_typeof(settings -> 'rotation_includes_gestor') IN ('boolean', 'null')
          )
          AND (
            (settings ->> 'rotation_timing') IS NULL
            OR (settings ->> 'rotation_timing') IN ('immediate', 'after_bot')
          )
        )
      );
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Tabela de porcentagens e crédito
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversation_rotation (
  tenant_id  uuid        NOT NULL REFERENCES public.tenants(id)  ON DELETE CASCADE,
  profile_id uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  percent    integer     NOT NULL DEFAULT 0 CHECK (percent BETWEEN 0 AND 100),
  credit     integer     NOT NULL DEFAULT 0,
  -- clock_timestamp, não now(): "quem entrou primeiro" decide o resto da
  -- divisão, e duas linhas criadas na mesma transação precisam ter ordem.
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, profile_id)
);

COMMENT ON TABLE public.conversation_rotation IS
  'Rodízio de conversas novas por Loja: porcentagem de cada pessoa elegível (soma 100; 0 = fora do rodízio sem sair da Loja) e o crédito acumulado do round-robin ponderado suave. Linhas mantidas SÓ por trigger/função SECURITY DEFINER (rotation_rebalance, set_conversation_rotation, rotation_pick). Gestor/gerente só leem.';
COMMENT ON COLUMN public.conversation_rotation.percent IS
  'Fatia desta pessoa nas conversas novas. Inteiro 0..100; a soma das linhas da Loja é 100. 0 = continua na Loja e com as conversas que já tem, mas não recebe novas.';
COMMENT ON COLUMN public.conversation_rotation.credit IS
  'Estado do round-robin ponderado suave: a cada escolha todo participante ganha +percent, o maior vence e perde a soma dos percents participantes. Zera quando a porcentagem muda.';

ALTER TABLE public.conversation_rotation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.conversation_rotation FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.conversation_rotation TO authenticated;
GRANT ALL    ON TABLE public.conversation_rotation TO service_role;

-- Leitura: gestor/gerente da própria Loja, gerente das Lojas filhas, superadmin.
-- Forma initplan (escalar calculado uma vez por comando). Sem policy de escrita
-- para authenticated: quem escreve são as funções abaixo.
DROP POLICY IF EXISTS rotation_read_admins ON public.conversation_rotation;
CREATE POLICY rotation_read_admins ON public.conversation_rotation
  FOR SELECT TO authenticated
  USING (
       (SELECT public.is_super_admin())
    OR (tenant_id = (SELECT public.get_current_user_tenant_id())
        AND (SELECT public.is_enterprise_safe() OR public.is_account_manager_safe()))
    OR tenant_id IN (SELECT public.gerente_child_store_ids())
  );

-- -----------------------------------------------------------------------------
-- 3. Helpers de leitura
-- -----------------------------------------------------------------------------

-- As três preferências, com os padrões. Tenant inexistente = zero linhas.
CREATE OR REPLACE FUNCTION public.rotation_settings(
  p_tenant_id uuid,
  OUT enabled boolean,
  OUT includes_gestor boolean,
  OUT timing text
)
RETURNS SETOF record
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT COALESCE((t.settings ->> 'rotation_enabled')::boolean, false),
         COALESCE((t.settings ->> 'rotation_includes_gestor')::boolean, false),
         COALESCE(NULLIF(t.settings ->> 'rotation_timing', ''), 'immediate')
    FROM public.tenants t
   WHERE t.id = p_tenant_id;
$function$;

-- Quem PODE estar no rodízio da Loja agora (sem olhar porcentagem).
CREATE OR REPLACE FUNCTION public.rotation_eligible_profile_ids(p_tenant_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT p.id
    FROM public.profiles p
   WHERE p.tenant_id = p_tenant_id
     AND p.status = 'active'
     AND (
           p.role = 'atendente'::public.user_role
        OR (p.role = 'gestor'::public.user_role
            AND COALESCE((SELECT s.includes_gestor FROM public.rotation_settings(p_tenant_id) s), false))
     )
   ORDER BY p.created_at, p.id;
$function$;

-- Alcance de quem administra o rodízio: gestor da própria Loja, gerente da
-- própria Conta e das Lojas filhas, superadmin.
CREATE OR REPLACE FUNCTION public.rotation_admin_scope_ok(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT COALESCE(
    p_tenant_id IS NOT NULL AND (
         public.is_super_admin()
      OR (p_tenant_id = public.get_current_user_tenant_id()
          AND (public.is_enterprise_safe() OR public.is_account_manager_safe()))
      OR p_tenant_id IN (SELECT public.gerente_child_store_ids())
    ),
    false
  );
$function$;

-- -----------------------------------------------------------------------------
-- 4. Reequilíbrio — reconcilia a tabela com o conjunto elegível
--    Devolve true quando a filiação mudou (e as porcentagens foram refeitas),
--    false quando não havia nada a fazer. Idempotente. Pode levantar erro: quem
--    chama por trigger embrulha em EXCEPTION.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rotation_rebalance(p_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
SET lock_timeout TO '3s'
AS $function$
DECLARE
  v_removed      int;
  v_added        uuid[];
  v_participants uuid[];
  v_sum          int;
  v_k            int;
  v_base         int;
  v_rem          int;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN false;
  END IF;

  -- Mesmo lock do escolhedor: reequilíbrio e escolha nunca se cruzam.
  PERFORM pg_advisory_xact_lock(hashtextextended('rotation:' || p_tenant_id::text, 0));

  DELETE FROM public.conversation_rotation r
   WHERE r.tenant_id = p_tenant_id
     AND r.profile_id NOT IN (SELECT e FROM public.rotation_eligible_profile_ids(p_tenant_id) e);
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  WITH ins AS (
    INSERT INTO public.conversation_rotation (tenant_id, profile_id, percent, credit)
    SELECT p_tenant_id, e, 0, 0
      FROM public.rotation_eligible_profile_ids(p_tenant_id) WITH ORDINALITY AS x(e, ord)
     WHERE NOT EXISTS (SELECT 1 FROM public.conversation_rotation r
                        WHERE r.tenant_id = p_tenant_id AND r.profile_id = e)
     ORDER BY ord
    RETURNING profile_id
  )
  SELECT COALESCE(array_agg(profile_id), '{}'::uuid[]) INTO v_added FROM ins;

  -- A soma também conta: num DELETE de perfil a FK (ON DELETE CASCADE) some
  -- com a linha ANTES deste código rodar, então v_removed = 0 — mas a soma
  -- ficou abaixo de 100. Medido em 2026-09-15 (R6i da suíte).
  SELECT COALESCE(sum(r.percent), 0) INTO v_sum
    FROM public.conversation_rotation r WHERE r.tenant_id = p_tenant_id;

  IF v_removed = 0 AND cardinality(v_added) = 0 AND v_sum = 100 THEN
    RETURN false;
  END IF;

  -- Participam da divisão igual: quem não está em 0 % e quem acabou de entrar.
  -- Os 0 % continuam 0 %. Se ninguém participa, participam todos.
  SELECT COALESCE(array_agg(r.profile_id ORDER BY r.created_at, r.profile_id), '{}'::uuid[])
    INTO v_participants
    FROM public.conversation_rotation r
   WHERE r.tenant_id = p_tenant_id
     AND (r.percent > 0 OR r.profile_id = ANY (v_added));
  IF cardinality(v_participants) = 0 THEN
    SELECT COALESCE(array_agg(r.profile_id ORDER BY r.created_at, r.profile_id), '{}'::uuid[])
      INTO v_participants
      FROM public.conversation_rotation r
     WHERE r.tenant_id = p_tenant_id;
  END IF;

  v_k := cardinality(v_participants);
  IF v_k = 0 THEN
    RETURN true; -- Loja sem elegível: tabela vazia para ela.
  END IF;

  v_base := 100 / v_k;
  v_rem  := 100 - v_base * v_k;

  UPDATE public.conversation_rotation r
     SET percent = CASE
                     WHEN r.profile_id = ANY (v_participants)
                       THEN v_base + CASE WHEN array_position(v_participants, r.profile_id) <= v_rem THEN 1 ELSE 0 END
                     ELSE 0
                   END,
         credit = 0,
         updated_at = now()
   WHERE r.tenant_id = p_tenant_id;

  RETURN true;
END;
$function$;

COMMENT ON FUNCTION public.rotation_rebalance(uuid) IS
  'Reconcilia conversation_rotation com o conjunto elegível da Loja. Só refaz porcentagens quando alguém entrou ou saiu: divisão igual entre quem não está em 0 % (0 % preservado), resto para quem entrou primeiro, crédito zerado. Devolve true se mudou.';

-- -----------------------------------------------------------------------------
-- 5. O escolhedor (round-robin ponderado suave) e a atribuição
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rotation_pick(p_tenant_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
SET lock_timeout TO '3s'
AS $function$
DECLARE
  v_includes_gestor boolean;
  v_ids    uuid[];
  v_total  int;
  v_winner uuid;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT s.includes_gestor INTO v_includes_gestor FROM public.rotation_settings(p_tenant_id) s;

  -- Serializa a escolha por Loja. Solta no COMMIT (é transacional por
  -- definição); o trigger que chama isto dispara por último para o intervalo
  -- ser o menor possível.
  PERFORM pg_advisory_xact_lock(hashtextextended('rotation:' || p_tenant_id::text, 0));

  -- Quem participa AGORA: percent > 0 e perfil ainda elegível. A segunda
  -- condição é defesa: se um reequilíbrio falhou em silêncio, ninguém
  -- suspenso recebe conversa mesmo assim.
  SELECT COALESCE(array_agg(r.profile_id), '{}'::uuid[]), COALESCE(sum(r.percent), 0)
    INTO v_ids, v_total
    FROM public.conversation_rotation r
    JOIN public.profiles p ON p.id = r.profile_id
   WHERE r.tenant_id = p_tenant_id
     AND r.percent > 0
     AND p.status = 'active'
     AND p.tenant_id = p_tenant_id
     AND (p.role = 'atendente'::public.user_role
          OR (p.role = 'gestor'::public.user_role AND COALESCE(v_includes_gestor, false)));

  IF v_total <= 0 THEN
    RETURN NULL;
  END IF;

  UPDATE public.conversation_rotation
     SET credit = credit + percent
   WHERE tenant_id = p_tenant_id AND profile_id = ANY (v_ids);

  SELECT profile_id INTO v_winner
    FROM public.conversation_rotation
   WHERE tenant_id = p_tenant_id AND profile_id = ANY (v_ids)
   ORDER BY credit DESC, created_at, profile_id
   LIMIT 1;

  UPDATE public.conversation_rotation
     SET credit = credit - v_total
   WHERE tenant_id = p_tenant_id AND profile_id = v_winner;

  RETURN v_winner;
END;
$function$;

COMMENT ON FUNCTION public.rotation_pick(uuid) IS
  'Próxima pessoa do rodízio da Loja (round-robin ponderado suave: todos +percent, maior crédito vence e perde a soma). Serializado por pg_advisory_xact_lock. NULL quando ninguém participa.';

-- Atribui a conversa se ela AINDA não tem responsável. assigned_by = NULL é a
-- marca da atribuição automática (ninguém passou a conversa): é o que cala o
-- sino sem mentir para a policy de visibilidade nem para a tela.
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

  UPDATE public.conversations
     SET assigned_profile_id = v_winner,
         assigned_at         = now(),
         assigned_by         = NULL
   WHERE id = p_conversation_id
     AND assigned_profile_id IS NULL;

  RETURN v_winner;
END;
$function$;

COMMENT ON FUNCTION public.rotation_assign_conversation(uuid) IS
  'Dá responsável (pelo rodízio) a uma conversa SEM responsável. Nunca reatribui. Grava assigned_by = NULL (automático). Devolve quem recebeu ou NULL.';

-- 'after_bot': o bot ainda vai falar (ou está falando) com este contato?
--   - sessão ativa                                → sim, espera
--   - já houve sessão (terminou)                  → não, atribui
--   - não é a primeira mensagem da conversa        → o bot não engatou; atribui
--   - primeira mensagem e há bot v2 publicado para
--     a instância                                  → o motor ainda vai rodar; espera
--   - sem bot publicado                            → nunca vai rodar; atribui
CREATE OR REPLACE FUNCTION public.rotation_bot_pending(
  p_tenant_id       uuid,
  p_contact_id      uuid,
  p_instance_id     uuid,
  p_conversation_id uuid,
  p_message_id      uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM public.chatbot_sessions s
              WHERE s.contact_id = p_contact_id
                AND s.whatsapp_instance_id IS NOT DISTINCT FROM p_instance_id
                AND s.status = 'active'::public.chatbot_session_status) THEN
    RETURN true;
  END IF;
  IF EXISTS (SELECT 1 FROM public.chatbot_sessions s
              WHERE s.contact_id = p_contact_id
                AND s.whatsapp_instance_id IS NOT DISTINCT FROM p_instance_id) THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM public.messages m
              WHERE m.conversation_id = p_conversation_id
                AND m.direction IN ('inbound', 'incoming')
                AND m.id <> p_message_id) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (SELECT 1 FROM public.chatbots b
                  WHERE b.tenant_id = p_tenant_id
                    AND b.is_active = true
                    AND b.is_published = true
                    AND COALESCE(b.builder_version, 1) = 2
                    AND (b.whatsapp_instance_id IS NULL OR b.whatsapp_instance_id = p_instance_id));
END;
$function$;

-- -----------------------------------------------------------------------------
-- 6. Trigger em messages — o ponto único por onde todo provedor passa
--    zz_: dispara DEPOIS dos outros AFTER (ordem alfabética), ver cabeçalho.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_rotation_assign_on_inbound()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  s       record;
  v_owner uuid;
BEGIN
  -- Pessoa logada (importação de histórico, conversa criada à mão): nunca.
  IF auth.uid() IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO s FROM public.rotation_settings(NEW.tenant_id);
  IF NOT FOUND OR NOT COALESCE(s.enabled, false) THEN
    RETURN NEW;
  END IF;

  SELECT c.assigned_profile_id INTO v_owner
    FROM public.conversations c WHERE c.id = NEW.conversation_id;
  IF NOT FOUND OR v_owner IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF s.timing = 'after_bot'
     AND public.rotation_bot_pending(NEW.tenant_id, NEW.contact_id, NEW.whatsapp_instance_id,
                                     NEW.conversation_id, NEW.id) THEN
    RETURN NEW;
  END IF;

  PERFORM public.rotation_assign_conversation(NEW.conversation_id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Conversa sem responsável é inócuo; INSERT abortado não é.
  RAISE WARNING 'tg_rotation_assign_on_inbound(%) falhou: % [%]', NEW.id, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.tg_rotation_assign_on_inbound() IS
  'AFTER INSERT em messages (inbound, auth.uid() NULL): dá responsável pelo rodízio à conversa se ela não tem e a Loja ligou rotation_enabled. Exception-safe: nunca desfaz a mensagem.';

DROP TRIGGER IF EXISTS zz_rotation_assign_on_inbound ON public.messages;
CREATE TRIGGER zz_rotation_assign_on_inbound
  AFTER INSERT ON public.messages
  FOR EACH ROW
  WHEN (NEW.direction IN ('inbound', 'incoming') AND NEW.conversation_id IS NOT NULL)
  EXECUTE FUNCTION public.tg_rotation_assign_on_inbound();

-- -----------------------------------------------------------------------------
-- 7. 'after_bot' — a sessão terminou: atribui naquele instante
--    Só quando foi o MOTOR que encerrou (auth.uid() NULL). Pessoa encerrando a
--    sessão pelo botão da conversa é pessoa agindo — a mesma regra do
--    escolhedor: ação humana nunca dispara distribuição automática.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_rotation_assign_on_session_end()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  s      record;
  v_conv uuid;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO s FROM public.rotation_settings(NEW.tenant_id);
  IF NOT FOUND OR NOT COALESCE(s.enabled, false) OR s.timing <> 'after_bot' THEN
    RETURN NEW;
  END IF;
  SELECT c.id INTO v_conv
    FROM public.conversations c
   WHERE c.tenant_id = NEW.tenant_id
     AND c.contact_id = NEW.contact_id
     AND c.assigned_profile_id IS NULL;
  IF v_conv IS NULL THEN
    RETURN NEW;
  END IF;
  PERFORM public.rotation_assign_conversation(v_conv);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_rotation_assign_on_session_end(%) falhou: % [%]', NEW.id, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_rotation_assign_on_session_end ON public.chatbot_sessions;
CREATE TRIGGER trg_rotation_assign_on_session_end
  AFTER UPDATE OF status ON public.chatbot_sessions
  FOR EACH ROW
  WHEN (OLD.status = 'active'::public.chatbot_session_status
        AND NEW.status IS DISTINCT FROM 'active'::public.chatbot_session_status)
  EXECUTE FUNCTION public.tg_rotation_assign_on_session_end();

-- -----------------------------------------------------------------------------
-- 8. 'after_bot' — varredura de segurança (cron a cada 2 min)
--    Conversa sem dono, cliente falou por último há > 90 s (e < 24 h), sem
--    sessão ativa, Loja ligada em after_bot. Cobre o bot que não casou gatilho
--    e o motor que caiu. Não toca em conversa em que uma pessoa já respondeu
--    (a última mensagem seria outbound) nem no acervo antigo.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rotation_sweep_after_bot()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  r     record;
  v_n   int := 0;
BEGIN
  FOR r IN
    SELECT c.id
      FROM public.conversations c
      JOIN public.tenants t ON t.id = c.tenant_id
     WHERE c.assigned_profile_id IS NULL
       AND COALESCE(c.is_archived, false) = false
       AND c.last_message_direction = 'inbound'
       AND c.last_message_at < now() - interval '90 seconds'
       -- Só conversa RECENTE: ligar o rodízio não pode distribuir o acervo
       -- antigo sem dono de uma vez. 24 h cobre qualquer bot que caiu.
       AND c.last_message_at > now() - interval '24 hours'
       AND COALESCE((t.settings ->> 'rotation_enabled')::boolean, false)
       AND COALESCE(NULLIF(t.settings ->> 'rotation_timing', ''), 'immediate') = 'after_bot'
       AND NOT EXISTS (SELECT 1 FROM public.chatbot_sessions s
                        WHERE s.contact_id = c.contact_id
                          AND s.status = 'active'::public.chatbot_session_status)
     ORDER BY c.last_message_at
     LIMIT 200
  LOOP
    BEGIN
      IF public.rotation_assign_conversation(r.id) IS NOT NULL THEN
        v_n := v_n + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'rotation_sweep_after_bot(%) falhou: % [%]', r.id, SQLERRM, SQLSTATE;
    END;
  END LOOP;
  RETURN v_n;
END;
$function$;

COMMENT ON FUNCTION public.rotation_sweep_after_bot() IS
  'Cron (*/2 min): em Lojas com rotation_timing = after_bot, dá responsável às conversas sem dono em que o cliente falou por último há mais de 90 s (e menos de 24 h) e não há sessão ativa de bot. Devolve quantas atribuiu.';

REVOKE ALL ON FUNCTION public.rotation_sweep_after_bot() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule(
  'rotation-sweep-after-bot',
  '*/2 * * * *',
  $cron$SELECT public.rotation_sweep_after_bot()$cron$
);

-- -----------------------------------------------------------------------------
-- 9. Reequilíbrio automático — triggers em profiles e em tenants
--    Exception-safe: um erro aqui NUNCA bloqueia convite, suspensão, exclusão
--    nem a troca de preferência (enforce_store_membership_limits_trg e
--    handle_user_confirmed correm nas mesmas colunas).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_rotation_rebalance_on_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_old uuid := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN OLD.tenant_id END;
  v_new uuid := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN NEW.tenant_id END;
BEGIN
  IF v_old IS NOT NULL THEN
    PERFORM public.rotation_rebalance(v_old);
  END IF;
  IF v_new IS NOT NULL AND v_new IS DISTINCT FROM v_old THEN
    PERFORM public.rotation_rebalance(v_new);
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_rotation_rebalance_on_profile(%) falhou: % [%]', COALESCE(v_new, v_old), SQLERRM, SQLSTATE;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_rotation_rebalance_on_profile ON public.profiles;
CREATE TRIGGER trg_rotation_rebalance_on_profile
  AFTER INSERT OR DELETE OR UPDATE OF status, role, tenant_id ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_rotation_rebalance_on_profile();

CREATE OR REPLACE FUNCTION public.tg_rotation_rebalance_on_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF (OLD.settings ->> 'rotation_includes_gestor') IS DISTINCT FROM (NEW.settings ->> 'rotation_includes_gestor') THEN
    PERFORM public.rotation_rebalance(NEW.id);
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_rotation_rebalance_on_settings(%) falhou: % [%]', NEW.id, SQLERRM, SQLSTATE;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_rotation_rebalance_on_settings ON public.tenants;
CREATE TRIGGER trg_rotation_rebalance_on_settings
  AFTER UPDATE OF settings ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_rotation_rebalance_on_settings();

-- -----------------------------------------------------------------------------
-- 10. O sino não toca em atribuição automática
--     Corpo do passo 1, com UMA condição a mais: assigned_by NULL = ninguém
--     passou a conversa = ninguém a avisar. Transferência por pessoa sempre
--     grava assigned_by, então continua tocando.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_notify_conversation_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid;
  v_contato text;
BEGIN
  IF NEW.assigned_profile_id IS NULL
     OR NEW.assigned_by IS NULL
     OR NEW.assigned_profile_id IS NOT DISTINCT FROM OLD.assigned_profile_id
     OR NEW.assigned_profile_id IS NOT DISTINCT FROM NEW.assigned_by THEN
    RETURN NEW;
  END IF;

  SELECT p.user_id INTO v_user_id
    FROM public.profiles p
   WHERE p.id = NEW.assigned_profile_id;
  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(c.name, ''), c.phone) INTO v_contato
    FROM public.contacts c
   WHERE c.id = NEW.contact_id;

  INSERT INTO public.notifications
    (tenant_id, user_id, title, message, type, action_url, action_label, metadata)
  VALUES (
    NEW.tenant_id,
    v_user_id,
    'Conversa transferida',
    'Uma conversa foi transferida para você (contato: ' || COALESCE(v_contato, 'sem nome') || ').',
    'info',
    '/dashboard/conversations?contact=' || NEW.contact_id::text,
    'Ver conversa',
    jsonb_build_object(
      'conversation_id', NEW.id,
      'contact_id',      NEW.contact_id,
      'assigned_by',     NEW.assigned_by
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_notify_conversation_assigned(%) falhou: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.tg_notify_conversation_assigned() IS
  'AFTER UPDATE OF assigned_profile_id em conversations: grava no sino de quem recebeu a conversa, na mesma forma que o nó transfer_agent do chatbot. Não avisa quem assume para si nem atribuição automática (assigned_by NULL).';

COMMENT ON COLUMN public.conversations.assigned_by IS
  'Perfil (public.profiles.id) que fez a atribuição. Igual a assigned_profile_id quando a pessoa assumiu para si; diferente quando foi transferência; NULL com assigned_profile_id preenchido = atribuição automática do rodízio (ninguém passou, ninguém é avisado). NULL nas três colunas = sem responsável.';

-- -----------------------------------------------------------------------------
-- 11. RPCs para a tela
-- -----------------------------------------------------------------------------

-- Lê o rodízio da Loja com nome e cargo. Reconcilia antes de devolver, para a
-- tela mostrar sempre o conjunto elegível de agora, mesmo que um trigger de
-- reequilíbrio tenha falhado em silêncio. Fora do alcance: vazio, sem erro.
CREATE OR REPLACE FUNCTION public.conversation_rotation_get(p_tenant_id uuid)
RETURNS TABLE (
  profile_id uuid,
  first_name text,
  last_name  text,
  avatar_url text,
  role       text,
  percent    integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.rotation_admin_scope_ok(p_tenant_id) THEN
    RETURN;
  END IF;
  PERFORM public.rotation_rebalance(p_tenant_id);
  RETURN QUERY
  SELECT r.profile_id, p.first_name, p.last_name, p.avatar_url, p.role::text, r.percent
    FROM public.conversation_rotation r
    JOIN public.profiles p ON p.id = r.profile_id
   WHERE r.tenant_id = p_tenant_id
   ORDER BY r.created_at, p.first_name NULLS LAST, p.last_name NULLS LAST, r.profile_id;
END;
$function$;

-- Grava as porcentagens — tudo ou nada. Exige: chamador no alcance; um objeto
-- {profile_id: inteiro 0..100} cobrindo EXATAMENTE o conjunto elegível; soma
-- 100. Zera os créditos. Recusa com 22023 e mensagem em pt-BR.
CREATE OR REPLACE FUNCTION public.set_conversation_rotation(p_tenant_id uuid, p_percents jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
SET lock_timeout TO '3s'
AS $function$
DECLARE
  v_key   text;
  v_val   jsonb;
  v_sum   int := 0;
  v_n     int := 0;
  v_elig  int;
BEGIN
  IF NOT public.rotation_admin_scope_ok(p_tenant_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar o rodízio desta Loja.' USING ERRCODE = '42501';
  END IF;
  IF p_percents IS NULL OR jsonb_typeof(p_percents) <> 'object' THEN
    RAISE EXCEPTION 'As porcentagens precisam ser um objeto {perfil: número}.' USING ERRCODE = '22023';
  END IF;

  PERFORM public.rotation_rebalance(p_tenant_id);
  PERFORM pg_advisory_xact_lock(hashtextextended('rotation:' || p_tenant_id::text, 0));

  SELECT count(*) INTO v_elig FROM public.conversation_rotation r WHERE r.tenant_id = p_tenant_id;

  FOR v_key, v_val IN SELECT * FROM jsonb_each(p_percents) LOOP
    IF jsonb_typeof(v_val) <> 'number' OR (v_val::text)::numeric <> floor((v_val::text)::numeric)
       OR (v_val::text)::numeric < 0 OR (v_val::text)::numeric > 100 THEN
      RAISE EXCEPTION 'Porcentagem inválida para %: use um inteiro entre 0 e 100.', v_key USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.conversation_rotation r
                    WHERE r.tenant_id = p_tenant_id AND r.profile_id = v_key::uuid) THEN
      RAISE EXCEPTION 'Perfil % não está elegível para o rodízio desta Loja.', v_key USING ERRCODE = '22023';
    END IF;
    v_sum := v_sum + ((v_val::text)::numeric)::int;
    v_n   := v_n + 1;
  END LOOP;

  IF v_n <> v_elig THEN
    RAISE EXCEPTION 'Informe a porcentagem de todas as % pessoas elegíveis (recebi %).', v_elig, v_n USING ERRCODE = '22023';
  END IF;
  IF v_sum <> 100 THEN
    RAISE EXCEPTION 'As porcentagens precisam somar 100 (soma atual: %).', v_sum USING ERRCODE = '22023';
  END IF;

  UPDATE public.conversation_rotation r
     SET percent    = ((p_percents ->> r.profile_id::text)::numeric)::int,
         credit     = 0,
         updated_at = now()
   WHERE r.tenant_id = p_tenant_id;
END;
$function$;

-- Quem tem conversa na Loja mas NÃO está elegível: suspenso/pendente/excluído
-- (status), movido para outra Loja (moved) ou em 0 % com o rodízio ligado
-- (zero_percent). Gerente da Conta acima não conta como "movido". Só conversas
-- não arquivadas. Só para quem administra a Loja; fora do alcance, vazio.
CREATE OR REPLACE FUNCTION public.loja_ineligible_owners(p_tenant_id uuid)
RETURNS TABLE (
  profile_id      uuid,
  first_name      text,
  last_name       text,
  reason          text,
  n_conversations bigint
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
  WITH owned AS (
    SELECT c.assigned_profile_id AS pid, count(*)::bigint AS n
      FROM public.conversations c
     WHERE c.tenant_id = p_tenant_id
       AND c.assigned_profile_id IS NOT NULL
       AND COALESCE(c.is_archived, false) = false
     GROUP BY c.assigned_profile_id
  ),
  judged AS (
    SELECT o.pid, p.first_name, p.last_name, o.n,
           CASE
             WHEN p.id IS NULL THEN 'deleted'
             WHEN p.status <> 'active' THEN p.status
             WHEN p.tenant_id <> p_tenant_id
                  AND NOT (p.role = 'gerente'::public.user_role AND p.tenant_id = v_parent) THEN 'moved'
             WHEN v_enabled AND r.percent = 0 THEN 'zero_percent'
             ELSE NULL
           END AS why
      FROM owned o
      LEFT JOIN public.profiles p ON p.id = o.pid
      LEFT JOIN public.conversation_rotation r ON r.tenant_id = p_tenant_id AND r.profile_id = o.pid
  )
  SELECT j.pid, j.first_name, j.last_name, j.why, j.n
    FROM judged j
   WHERE j.why IS NOT NULL
   ORDER BY j.n DESC, j.first_name NULLS LAST, j.pid;
END;
$function$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.rotation_settings(uuid)',
    'public.rotation_eligible_profile_ids(uuid)',
    'public.rotation_admin_scope_ok(uuid)',
    'public.rotation_rebalance(uuid)',
    'public.rotation_pick(uuid)',
    'public.rotation_assign_conversation(uuid)',
    'public.rotation_bot_pending(uuid, uuid, uuid, uuid, uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY[
    'public.conversation_rotation_get(uuid)',
    'public.set_conversation_rotation(uuid, jsonb)',
    'public.loja_ineligible_owners(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;

COMMENT ON FUNCTION public.conversation_rotation_get(uuid) IS
  'Rodízio da Loja para a tela: perfil, nome, avatar, cargo e porcentagem de cada elegível. Reconcilia com o conjunto elegível antes de devolver. Só gestor/gerente/superadmin no alcance; fora dele, vazio.';
COMMENT ON FUNCTION public.set_conversation_rotation(uuid, jsonb) IS
  'Grava as porcentagens do rodízio (tudo ou nada): objeto {profile_id: inteiro}, exatamente o conjunto elegível, soma 100. Zera créditos. 42501 fora do alcance, 22023 quando inválido.';
COMMENT ON FUNCTION public.loja_ineligible_owners(uuid) IS
  'Responsáveis por conversa na Loja que não estão elegíveis (status, movido, 0 %), com quantidade. Para a pílula "Responsável indisponível" e o contador da aba Escala. Só gestor/gerente/superadmin.';

-- -----------------------------------------------------------------------------
-- 12. Estado inicial: reconcilia toda Loja que já tem gente elegível. Não liga
--     nada (rotation_enabled continua ausente = false).
-- -----------------------------------------------------------------------------
DO $$
DECLARE t uuid;
BEGIN
  FOR t IN SELECT DISTINCT p.tenant_id FROM public.profiles p
            WHERE p.status = 'active' AND p.role = 'atendente'::public.user_role AND p.tenant_id IS NOT NULL
  LOOP
    PERFORM public.rotation_rebalance(t);
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 13. Conferência + ledger
-- -----------------------------------------------------------------------------
DO $chk$
DECLARE
  n_pol_conv int;
  n_pol_msg  int;
  v_last     text;
BEGIN
  IF to_regclass('public.conversation_rotation') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: conversation_rotation não existe.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_rotation_settings_check') THEN
    RAISE EXCEPTION 'ABORTADO: CHECK tenants_rotation_settings_check não existe.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zz_rotation_assign_on_inbound'
                   AND tgrelid = 'public.messages'::regclass) THEN
    RAISE EXCEPTION 'ABORTADO: trigger zz_rotation_assign_on_inbound não existe.';
  END IF;
  -- O escolhedor tem de ser o ÚLTIMO trigger AFTER de messages (ordem alfabética).
  SELECT tgname INTO v_last FROM pg_trigger
   WHERE tgrelid = 'public.messages'::regclass AND NOT tgisinternal
     AND (tgtype & 2) = 0            -- AFTER (bit 1 = BEFORE)
     AND (tgtype & 4) <> 0           -- INSERT
   ORDER BY tgname DESC LIMIT 1;
  IF v_last <> 'zz_rotation_assign_on_inbound' THEN
    RAISE EXCEPTION 'ABORTADO: o escolhedor não é o último trigger AFTER INSERT de messages (é %).', v_last;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_rotation_assign_on_session_end'
                   AND tgrelid = 'public.chatbot_sessions'::regclass) THEN
    RAISE EXCEPTION 'ABORTADO: trigger trg_rotation_assign_on_session_end não existe.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_rotation_rebalance_on_profile'
                   AND tgrelid = 'public.profiles'::regclass) THEN
    RAISE EXCEPTION 'ABORTADO: trigger trg_rotation_rebalance_on_profile não existe.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_rotation_rebalance_on_settings'
                   AND tgrelid = 'public.tenants'::regclass) THEN
    RAISE EXCEPTION 'ABORTADO: trigger trg_rotation_rebalance_on_settings não existe.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rotation-sweep-after-bot') THEN
    RAISE EXCEPTION 'ABORTADO: cron rotation-sweep-after-bot não existe.';
  END IF;
  IF to_regprocedure('public.set_conversation_rotation(uuid, jsonb)') IS NULL
     OR to_regprocedure('public.conversation_rotation_get(uuid)') IS NULL
     OR to_regprocedure('public.loja_ineligible_owners(uuid)') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: alguma RPC da tela não existe.';
  END IF;
  IF pg_get_functiondef('public.tg_notify_conversation_assigned()'::regprocedure) NOT LIKE '%NEW.assigned_by IS NULL%' THEN
    RAISE EXCEPTION 'ABORTADO: o sino não ganhou a condição de atribuição automática.';
  END IF;

  -- Prova de que este arquivo não mexeu em policy de conversations/messages.
  SELECT count(*) INTO n_pol_conv FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'conversations';
  SELECT count(*) INTO n_pol_msg FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'messages';
  IF n_pol_conv <> 7 OR n_pol_msg <> 8 THEN
    RAISE EXCEPTION 'ABORTADO: conversations/messages deveriam ter 7/8 policies, têm %/%. Este arquivo não cria nem apaga policy delas — investigue.', n_pol_conv, n_pol_msg;
  END IF;

  INSERT INTO supabase_migrations.schema_migrations (version, name)
  VALUES ('20260915000001', 'conversation_rotation')
  ON CONFLICT (version) DO NOTHING;

  RAISE NOTICE 'conversation_rotation aplicada: tabela + CHECK, 7 funções internas, 3 RPCs, 4 triggers, 1 cron, sino condicionado; % linhas de rodízio semeadas.',
    (SELECT count(*) FROM public.conversation_rotation);
END
$chk$;

-- =============================================================================
-- ROLLBACK (na ordem; cada passo é independente)
--
-- -- 0. Para PARAR o comportamento sem mexer em código (3 da manhã):
-- UPDATE public.tenants SET settings = settings || '{"rotation_enabled": false}'::jsonb
--  WHERE COALESCE((settings ->> 'rotation_enabled')::boolean, false);
--
-- -- 1. Triggers e cron
-- DROP TRIGGER IF EXISTS zz_rotation_assign_on_inbound ON public.messages;
-- DROP TRIGGER IF EXISTS trg_rotation_assign_on_session_end ON public.chatbot_sessions;
-- DROP TRIGGER IF EXISTS trg_rotation_rebalance_on_profile ON public.profiles;
-- DROP TRIGGER IF EXISTS trg_rotation_rebalance_on_settings ON public.tenants;
-- SELECT cron.unschedule('rotation-sweep-after-bot');
--
-- -- 2. Sino de volta ao texto do passo 1 (sem a linha "OR NEW.assigned_by IS NULL")
-- --    — o corpo está em 20260913000001_conversations_assignment.sql, seção 3.
--
-- -- 3. Funções, tabela, CHECK, ledger
-- DROP FUNCTION IF EXISTS public.tg_rotation_assign_on_inbound();
-- DROP FUNCTION IF EXISTS public.tg_rotation_assign_on_session_end();
-- DROP FUNCTION IF EXISTS public.tg_rotation_rebalance_on_profile();
-- DROP FUNCTION IF EXISTS public.tg_rotation_rebalance_on_settings();
-- DROP FUNCTION IF EXISTS public.rotation_sweep_after_bot();
-- DROP FUNCTION IF EXISTS public.loja_ineligible_owners(uuid);
-- DROP FUNCTION IF EXISTS public.set_conversation_rotation(uuid, jsonb);
-- DROP FUNCTION IF EXISTS public.conversation_rotation_get(uuid);
-- DROP FUNCTION IF EXISTS public.rotation_bot_pending(uuid, uuid, uuid, uuid, uuid);
-- DROP FUNCTION IF EXISTS public.rotation_assign_conversation(uuid);
-- DROP FUNCTION IF EXISTS public.rotation_pick(uuid);
-- DROP FUNCTION IF EXISTS public.rotation_rebalance(uuid);
-- DROP FUNCTION IF EXISTS public.rotation_admin_scope_ok(uuid);
-- DROP FUNCTION IF EXISTS public.rotation_eligible_profile_ids(uuid);
-- DROP FUNCTION IF EXISTS public.rotation_settings(uuid);
-- DROP TABLE IF EXISTS public.conversation_rotation;
-- ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_rotation_settings_check;
-- DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260915000001';
-- =============================================================================
