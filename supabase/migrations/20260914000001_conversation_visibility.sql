-- =============================================================================
-- 20260914000001_conversation_visibility
--
-- Visibilidade de conversas por atendente (passo 2 de 5 da atribuição).
--
-- O QUE MUDA
--   Duas preferências por Loja em `tenants.settings`, gravadas pela RPC
--   `set_tenant_settings` como as de SLA:
--     - atendente_visibility  ('all' | 'unassigned' | 'own'; padrão 'all')
--     - atendente_can_transfer (boolean; padrão true)
--   Valem SÓ para o cargo `atendente`. Gestor, gerente e superadmin nunca são
--   restringidos — a exceção é explícita no helper, não implícita na policy.
--
--   O que cada nível deixa o atendente LER:
--     'all'         todas as conversas da Loja — exatamente o comportamento de
--                   hoje. Sem nada gravado em settings, é este que vale.
--     'unassigned'  as sem responsável + as dele + as em que ele já respondeu
--                   + as que ele mesmo passou adiante.
--     'own'         as dele + as em que ele já respondeu + as que ele mesmo
--                   passou adiante.
--
--   "As que ele mesmo passou adiante" (assigned_by = ele) NÃO estava na
--   especificação do passo 2 e entrou por uma razão medida (2026-09-13, probe
--   em tabela descartável + a suíte): o PostgreSQL também confere as policies
--   de SELECT na LINHA NOVA de um UPDATE que precisou ler a linha. Sem esse
--   ramo, um atendente restrito que assume uma conversa e a transfere ao colega
--   SEM ter respondido faz a linha ficar invisível para ele mesmo — e o UPDATE
--   estoura 42501 ("new row violates row-level security policy"). A regra
--   "você continua vendo o que você mesmo passou adiante" resolve isso sem RPC
--   e sem mexer no cliente; quando outra pessoa reatribuir a conversa, ele a
--   perde de vista como a especificação pede.
--
-- A DECISÃO CENTRAL — só a LEITURA é restringida
--   Só as policies de SELECT de `conversations` e `messages` mudam. INSERT,
--   UPDATE e DELETE ficam exatamente como estão (por Conta). Motivo: restringir
--   UPDATE quebraria `update_conversation_on_message` dentro do INSERT da
--   mensagem (42501, o INSERT inteiro desfeito, a mídia já entregue ao cliente)
--   e faria marcar-como-lida, silenciar SLA e arquivar virarem no-op mudo.
--
--   Mas há uma regra do PostgreSQL que a decisão precisa acomodar, e que foi
--   MEDIDA antes de escrever isto (probe numa tabela descartável, 2026-09-13):
--   com as policies de escrita totalmente abertas, uma policy de SELECT
--   restritiva sozinha faz `INSERT ... ON CONFLICT DO UPDATE` numa linha
--   invisível estourar 42501, e faz `UPDATE/DELETE ... WHERE` em linha
--   invisível virar zero linhas sem erro. É a regra documentada em CREATE
--   POLICY: quando o comando precisa LER a linha (WHERE, RETURNING, SET que
--   referencia coluna), as policies de SELECT também valem.
--
--   Consequência: os dois triggers de escrituração da cadeia de INSERT em
--   `messages` — `handle_message_conversation` (BEFORE, acha ou cria a
--   conversa) e `update_conversation_on_message` (AFTER, o ON CONFLICT DO
--   UPDATE da prévia) — passam a SECURITY DEFINER. Eles só mantêm a linha da
--   conversa da mensagem que o chamador já teve permissão de inserir; não
--   devolvem nada ao cliente. Sem isto, um atendente restrito responder numa
--   conversa que não vê daria 23505 (chave duplicada) no BEFORE ou 42501 no
--   AFTER — e "escrita continua livre" seria mentira. Os corpos são os mesmos;
--   só a cláusula de segurança e o search_path mudam. O texto anterior está
--   no bloco ROLLBACK.
--
-- PARTICIPAÇÃO
--   `conversation_participants (conversation_id, profile_id, first_at)`: quem já
--   respondeu numa conversa continua lendo-a depois de transferida. Gravada por
--   trigger AFTER INSERT em `messages` (outbound, humana, sem `source`),
--   SECURITY DEFINER — o cliente não consegue forjar participação. Quando
--   `auth.uid()` é nulo (service role: campanhas, follow-ups, webhooks) nada é
--   gravado. A PARTICIPAÇÃO HISTÓRICA É IRRECUPERÁVEL: `messages` nunca teve
--   autor, então a tabela começa VAZIA. Ninguém "já participou" de nada no
--   dia em que isto sobe.
--
-- FORMA DAS POLICIES (initplan)
--   Coluna da linha comparada a um escalar/conjunto calculado UMA vez por
--   comando: `(SELECT helper())` e `id IN (SELECT ... WHERE profile_id =
--   (SELECT current_profile_id()))`. Nunca EXISTS correlacionado nem helper
--   que recebe coluna da linha. Cargo e configuração são resolvidos juntos, uma
--   vez, por `conversation_visibility_level()` (SECURITY DEFINER: lê a linha
--   de `tenants` da própria Loja do chamador sem depender do RLS de tenants).
--
-- messages.conversation_id NULL
--   Visível. São linhas legadas (a coluna é preenchida pelo BEFORE INSERT
--   desde que existe); esconder por NULL esconderia histórico de forma
--   imprevisível. Medido em 2026-09-13: 0 de 2.324 linhas.
--
-- NÚMEROS DO DASHBOARD
--   Decisão de produto: agregados continuam da Loja inteira para todo mundo;
--   CONTEÚDO segue a restrição. As funções `loja_*` (SECURITY DEFINER)
--   devolvem só contagens/médias por balde — nunca texto, nunca id de
--   mensagem ou de conversa. O alcance por Conta espelha o RLS de hoje:
--   a própria Conta, as Lojas filhas do gerente e, para `messages`, o
--   superadmin (que tem policy ALL em messages e nenhuma em conversations).
--
-- IDEMPOTENTE: pode rodar de novo. Nada aqui apaga ou sobrescreve dado de
-- usuário — as policies são reescritas por ALTER/DROP+CREATE com o texto
-- anterior guardado no ROLLBACK. O bloco DO do fim confere e grava o ledger.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Guarda de forma das preferências em tenants.settings
--    (o RPC set_tenant_settings faz merge raso sem validar; a CHECK garante que
--    o helper nunca vê lixo — valor inválido é recusado na gravação).
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenants_atendente_settings_check'
      AND conrelid = 'public.tenants'::regclass
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_atendente_settings_check CHECK (
        settings IS NULL
        OR (
          (settings ->> 'atendente_visibility') IS NULL
          OR (settings ->> 'atendente_visibility') IN ('all', 'unassigned', 'own')
        )
        AND (
          (settings -> 'atendente_can_transfer') IS NULL
          OR jsonb_typeof(settings -> 'atendente_can_transfer') IN ('boolean', 'null')
        )
      );
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Participantes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversation_participants (
  conversation_id uuid        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  profile_id      uuid        NOT NULL REFERENCES public.profiles(id)      ON DELETE CASCADE,
  first_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_participants_profile
  ON public.conversation_participants (profile_id, conversation_id);

COMMENT ON TABLE public.conversation_participants IS
  'Quem já respondeu (mensagem outbound humana) em cada conversa. Gravada só pelo trigger tg_record_conversation_participant (SECURITY DEFINER); o cliente só lê as próprias linhas. Começou VAZIA em 2026-09-14: messages nunca teve autor, então participação anterior a esta data não existe e não pode ser reconstruída.';

ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.conversation_participants FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.conversation_participants TO authenticated;
GRANT ALL    ON TABLE public.conversation_participants TO service_role;

DROP POLICY IF EXISTS participants_read_own ON public.conversation_participants;
CREATE POLICY participants_read_own ON public.conversation_participants
  FOR SELECT TO authenticated
  USING (profile_id = (SELECT public.current_profile_id()));

CREATE OR REPLACE FUNCTION public.tg_record_conversation_participant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_profile uuid;
BEGIN
  -- Service role (campanha, follow-up, webhook, job-worker): sem pessoa, sem participação.
  IF auth.uid() IS NULL OR NEW.conversation_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.id INTO v_profile
    FROM public.profiles p
   WHERE p.user_id = auth.uid()
   LIMIT 1;
  IF v_profile IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.conversation_participants (conversation_id, profile_id, first_at)
  VALUES (NEW.conversation_id, v_profile, NEW.created_at)
  ON CONFLICT (conversation_id, profile_id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Escrituração nunca derruba um envio.
  RAISE WARNING 'tg_record_conversation_participant(%) falhou: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.tg_record_conversation_participant() IS
  'AFTER INSERT em messages (outbound, humana, sem source): registra o perfil de auth.uid() como participante da conversa. Nada quando auth.uid() é nulo. Exception-safe.';

DROP TRIGGER IF EXISTS trg_record_conversation_participant ON public.messages;
CREATE TRIGGER trg_record_conversation_participant
  AFTER INSERT ON public.messages
  FOR EACH ROW
  WHEN (NEW.direction = 'outbound' AND NEW.is_from_bot IS NOT TRUE AND NEW.source IS NULL)
  EXECUTE FUNCTION public.tg_record_conversation_participant();

-- -----------------------------------------------------------------------------
-- 3. Helpers — cargo e configuração resolvidos juntos, uma vez por comando
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conversation_visibility_level()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT COALESCE((
    SELECT CASE
             WHEN p.role = 'atendente'::public.user_role
               THEN COALESCE(NULLIF(t.settings ->> 'atendente_visibility', ''), 'all')
             ELSE 'all'
           END
      FROM public.profiles p
      LEFT JOIN public.tenants t ON t.id = p.tenant_id
     WHERE p.user_id = auth.uid()
       AND p.status = 'active'
     LIMIT 1
  ), 'all');
$function$;

COMMENT ON FUNCTION public.conversation_visibility_level() IS
  'Nível efetivo de visibilidade de conversas do chamador: ''all'' para todo cargo que não seja atendente (e para quem não tem perfil ativo); para atendente, tenants.settings.atendente_visibility da própria Loja, com ''all'' como padrão. Usar SEMPRE como (SELECT ...) em policy.';

CREATE OR REPLACE FUNCTION public.conversation_transfer_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT COALESCE((
    SELECT CASE
             WHEN p.role = 'atendente'::public.user_role
               THEN COALESCE((t.settings ->> 'atendente_can_transfer')::boolean, true)
             ELSE true
           END
      FROM public.profiles p
      LEFT JOIN public.tenants t ON t.id = p.tenant_id
     WHERE p.user_id = auth.uid()
       AND p.status = 'active'
     LIMIT 1
  ), true);
$function$;

COMMENT ON FUNCTION public.conversation_transfer_allowed() IS
  'Se o chamador pode TRANSFERIR conversa: true para todo cargo que não seja atendente; para atendente, tenants.settings.atendente_can_transfer da própria Loja (padrão true). Assumir para si nunca passa por aqui.';

REVOKE ALL ON FUNCTION public.conversation_visibility_level()  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conversation_transfer_allowed()  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conversation_visibility_level()  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conversation_transfer_allowed()  TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. Recusa de transferência no servidor (esconder o botão não basta)
--    Atendente com atendente_can_transfer = false só pode fazer UMA mudança em
--    assigned_profile_id: de NULL para o próprio perfil ("Assumir"). Qualquer
--    outra (dar a outro, tomar de outro, devolver para a fila) é recusada.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_guard_conversation_transfer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.assigned_profile_id IS NOT DISTINCT FROM OLD.assigned_profile_id THEN
    RETURN NEW;
  END IF;
  IF public.conversation_transfer_allowed() THEN
    RETURN NEW;
  END IF;
  IF OLD.assigned_profile_id IS NULL
     AND NEW.assigned_profile_id = public.current_profile_id() THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Transferência de conversas está desativada para atendentes nesta Loja.'
    USING ERRCODE = '42501';
END;
$function$;

COMMENT ON FUNCTION public.tg_guard_conversation_transfer() IS
  'BEFORE UPDATE OF assigned_profile_id em conversations: com atendente_can_transfer = false, atendente só assume conversa sem responsável para si; o resto é recusado com 42501.';

DROP TRIGGER IF EXISTS trg_guard_conversation_transfer ON public.conversations;
CREATE TRIGGER trg_guard_conversation_transfer
  BEFORE UPDATE OF assigned_profile_id ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_guard_conversation_transfer();

-- -----------------------------------------------------------------------------
-- 5. Os dois triggers de escrituração da cadeia de INSERT em messages passam a
--    SECURITY DEFINER (ver a decisão central no cabeçalho). Corpos idênticos
--    aos que estavam em produção em 2026-09-13.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_message_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_conversation_id UUID;
BEGIN
  SELECT id INTO v_conversation_id FROM public.conversations
  WHERE contact_id = NEW.contact_id AND tenant_id = NEW.tenant_id;
  IF v_conversation_id IS NULL THEN
    INSERT INTO public.conversations (tenant_id, contact_id, whatsapp_instance_id, last_message_at, unread_count, is_archived)
    VALUES (NEW.tenant_id, NEW.contact_id, NEW.whatsapp_instance_id, NEW.created_at, 0, false)
    RETURNING id INTO v_conversation_id;
  END IF;
  NEW.conversation_id = v_conversation_id;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.update_conversation_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.conversations (
    tenant_id, contact_id, whatsapp_instance_id, last_message_at, unread_count,
    last_message_content, last_message_direction, last_message_status, last_message_type
  )
  VALUES (
    NEW.tenant_id, NEW.contact_id, NEW.whatsapp_instance_id, NEW.created_at,
    CASE WHEN NEW.direction IN ('inbound','incoming') THEN 1 ELSE 0 END,
    NEW.content,
    CASE WHEN NEW.direction IN ('inbound','incoming') THEN 'inbound' ELSE 'outbound' END,
    NEW.status,
    NEW.message_type
  )
  ON CONFLICT (tenant_id, contact_id) DO UPDATE SET
    last_message_at = NEW.created_at,
    unread_count = CASE WHEN NEW.direction IN ('inbound','incoming')
                        THEN conversations.unread_count + 1
                        ELSE conversations.unread_count END,
    -- Mensagem do cliente reabre a pendência: volta a sinalizar.
    sla_muted_at = CASE WHEN NEW.direction IN ('inbound','incoming')
                        THEN NULL
                        ELSE conversations.sla_muted_at END,
    sla_muted_by = CASE WHEN NEW.direction IN ('inbound','incoming')
                        THEN NULL
                        ELSE conversations.sla_muted_by END,
    last_message_content = NEW.content,
    last_message_direction = CASE WHEN NEW.direction IN ('inbound','incoming')
                                  THEN 'inbound'
                                  ELSE 'outbound' END,
    last_message_status = NEW.status,
    last_message_type = NEW.message_type,
    updated_at = NOW();
  RETURN NEW;
END; $function$;

-- -----------------------------------------------------------------------------
-- 6. Policies de SELECT
-- -----------------------------------------------------------------------------

-- conversations: a policy base ganha o recorte por atendente. O primeiro termo
-- é o texto de hoje, intacto; o AND só existe para quem NÃO está em 'all'.
ALTER POLICY "Users can view conversations from their tenant" ON public.conversations
  USING (
    tenant_id IN (
      SELECT p.tenant_id FROM public.profiles p WHERE p.user_id = (SELECT auth.uid())
    )
    AND (
         (SELECT public.conversation_visibility_level()) = 'all'
      OR assigned_profile_id = (SELECT public.current_profile_id())
      OR assigned_by = (SELECT public.current_profile_id())
      OR (assigned_profile_id IS NULL
          AND (SELECT public.conversation_visibility_level()) = 'unassigned')
      OR id IN (
        SELECT cp.conversation_id
          FROM public.conversation_participants cp
         WHERE cp.profile_id = (SELECT public.current_profile_id())
      )
    )
  );

-- messages: a policy ALL "Users can access own tenant messages" vira quatro.
-- INSERT/UPDATE/DELETE reproduzem o que a ALL fazia (USING valia como WITH
-- CHECK). SELECT passa pela conversa, em forma hasheável: `conversation_id IN
-- (SELECT id FROM conversations)` já sai filtrado pelo RLS de conversations —
-- uma regra só, num lugar só.
DROP POLICY IF EXISTS "Users can access own tenant messages" ON public.messages;
DROP POLICY IF EXISTS "Users can view own tenant messages"   ON public.messages;
DROP POLICY IF EXISTS "Users can insert own tenant messages" ON public.messages;
DROP POLICY IF EXISTS "Users can update own tenant messages" ON public.messages;
DROP POLICY IF EXISTS "Users can delete own tenant messages" ON public.messages;

CREATE POLICY "Users can view own tenant messages" ON public.messages
  FOR SELECT
  USING (
    tenant_id = (SELECT public.get_current_user_tenant_id())
    AND (
         (SELECT public.conversation_visibility_level()) = 'all'
      OR conversation_id IS NULL
      OR conversation_id IN (SELECT c.id FROM public.conversations c)
    )
  );

CREATE POLICY "Users can insert own tenant messages" ON public.messages
  FOR INSERT
  WITH CHECK (tenant_id = (SELECT public.get_current_user_tenant_id()));

CREATE POLICY "Users can update own tenant messages" ON public.messages
  FOR UPDATE
  USING      (tenant_id = (SELECT public.get_current_user_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.get_current_user_tenant_id()));

CREATE POLICY "Users can delete own tenant messages" ON public.messages
  FOR DELETE
  USING (tenant_id = (SELECT public.get_current_user_tenant_id()));

-- -----------------------------------------------------------------------------
-- 7. Números da Loja inteira (dashboard) — só contagens e médias
-- -----------------------------------------------------------------------------

-- Alcance: espelha o RLS de hoje. p_allow_super = true para messages (tem
-- policy ALL de superadmin), false para conversations (não tem, de propósito).
CREATE OR REPLACE FUNCTION public.loja_stats_scope_ok(p_tenant_id uuid, p_allow_super boolean)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  -- COALESCE é obrigatório: sem JWT, get_current_user_tenant_id() é NULL e a
  -- comparação vira NULL — que um `IF NOT ...` em plpgsql deixaria passar.
  -- Medido no dry-run de 2026-09-13: sem isto, o papel postgres via 151 linhas.
  SELECT COALESCE(
    p_tenant_id IS NOT NULL AND (
         p_tenant_id = public.get_current_user_tenant_id()
      OR p_tenant_id IN (SELECT public.gerente_child_store_ids())
      OR (p_allow_super AND public.is_super_admin())
    ),
    false
  );
$function$;

CREATE OR REPLACE FUNCTION public.loja_message_counts(
  p_tenant_id uuid,
  p_from      timestamptz DEFAULT NULL,
  p_to        timestamptz DEFAULT NULL,
  p_bucket    text        DEFAULT 'all',
  p_tz        text        DEFAULT 'UTC'
)
RETURNS TABLE (
  bucket               timestamptz,
  direction            text,
  is_from_bot          boolean,
  whatsapp_instance_id uuid,
  n                    bigint,
  last_at              timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF p_bucket NOT IN ('all', 'hour', 'day') THEN
    RAISE EXCEPTION 'p_bucket deve ser all, hour ou day' USING ERRCODE = '22023';
  END IF;
  IF NOT public.loja_stats_scope_ok(p_tenant_id, true) THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT CASE WHEN p_bucket = 'all' THEN NULL
              ELSE date_trunc(p_bucket, m.created_at, p_tz) END AS bucket,
         m.direction,
         COALESCE(m.is_from_bot, false) AS is_from_bot,
         m.whatsapp_instance_id,
         count(*)::bigint AS n,
         max(m.created_at) AS last_at
    FROM public.messages m
   WHERE m.tenant_id = p_tenant_id
     AND (p_from IS NULL OR m.created_at >= p_from)
     AND (p_to   IS NULL OR m.created_at <= p_to)
   GROUP BY 1, 2, 3, 4
   ORDER BY 1, 2, 3, 4;
END;
$function$;

CREATE OR REPLACE FUNCTION public.loja_response_time(
  p_tenant_id uuid,
  p_from      timestamptz DEFAULT NULL,
  p_to        timestamptz DEFAULT NULL,
  p_bucket    text        DEFAULT 'all',
  p_tz        text        DEFAULT 'UTC'
)
RETURNS TABLE (
  bucket      timestamptz,
  n           bigint,
  avg_minutes numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF p_bucket NOT IN ('all', 'hour', 'day') THEN
    RAISE EXCEPTION 'p_bucket deve ser all, hour ou day' USING ERRCODE = '22023';
  END IF;
  IF NOT public.loja_stats_scope_ok(p_tenant_id, true) THEN
    RETURN;
  END IF;
  -- Mesma regra do front (avgResponseMinutes): por conversa e por balde, o 1º
  -- inbound e o 1º outbound de created_at >= ele. Uma medida por conversa/balde.
  RETURN QUERY
  WITH m AS (
    SELECT x.conversation_id, x.direction, x.created_at,
           CASE WHEN p_bucket = 'all' THEN NULL
                ELSE date_trunc(p_bucket, x.created_at, p_tz) END AS b
      FROM public.messages x
     WHERE x.tenant_id = p_tenant_id
       AND (p_from IS NULL OR x.created_at >= p_from)
       AND (p_to   IS NULL OR x.created_at <= p_to)
  ),
  first_in AS (
    SELECT m.conversation_id, m.b, min(m.created_at) AS t_in
      FROM m
     WHERE m.direction = 'inbound'
     GROUP BY m.conversation_id, m.b
  ),
  pairs AS (
    SELECT fi.b, fi.t_in,
           (SELECT min(mo.created_at)
              FROM m mo
             WHERE mo.conversation_id IS NOT DISTINCT FROM fi.conversation_id
               AND mo.b IS NOT DISTINCT FROM fi.b
               AND mo.direction = 'outbound'
               AND mo.created_at >= fi.t_in) AS t_out
      FROM first_in fi
  )
  SELECT p.b AS bucket,
         count(*)::bigint AS n,
         (avg(extract(epoch FROM (p.t_out - p.t_in))) / 60.0)::numeric AS avg_minutes
    FROM pairs p
   WHERE p.t_out IS NOT NULL
   GROUP BY p.b
   ORDER BY p.b;
END;
$function$;

CREATE OR REPLACE FUNCTION public.loja_conversation_counts(
  p_tenant_id uuid,
  p_from      timestamptz DEFAULT NULL,
  p_to        timestamptz DEFAULT NULL,
  p_bucket    text        DEFAULT 'all',
  p_tz        text        DEFAULT 'UTC'
)
RETURNS TABLE (
  bucket      timestamptz,
  is_archived boolean,
  n           bigint,
  n_unread    bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF p_bucket NOT IN ('all', 'hour', 'day') THEN
    RAISE EXCEPTION 'p_bucket deve ser all, hour ou day' USING ERRCODE = '22023';
  END IF;
  -- Sem superadmin: conversations não tem policy de superadmin, de propósito.
  IF NOT public.loja_stats_scope_ok(p_tenant_id, false) THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT CASE WHEN p_bucket = 'all' THEN NULL
              ELSE date_trunc(p_bucket, c.created_at, p_tz) END AS bucket,
         COALESCE(c.is_archived, false) AS is_archived,
         count(*)::bigint AS n,
         count(*) FILTER (WHERE COALESCE(c.unread_count, 0) > 0)::bigint AS n_unread
    FROM public.conversations c
   WHERE c.tenant_id = p_tenant_id
     AND (p_from IS NULL OR c.created_at >= p_from)
     AND (p_to   IS NULL OR c.created_at <= p_to)
   GROUP BY 1, 2
   ORDER BY 1, 2;
END;
$function$;

CREATE OR REPLACE FUNCTION public.loja_contact_last_message(
  p_tenant_id  uuid,
  p_direction  text DEFAULT NULL,
  p_contact_id uuid DEFAULT NULL
)
RETURNS TABLE (
  contact_id uuid,
  last_at    timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.loja_stats_scope_ok(p_tenant_id, true) THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT m.contact_id, max(m.created_at) AS last_at
    FROM public.messages m
   WHERE m.tenant_id = p_tenant_id
     AND (p_direction  IS NULL OR m.direction  = p_direction)
     AND (p_contact_id IS NULL OR m.contact_id = p_contact_id)
   GROUP BY m.contact_id;
END;
$function$;

-- Deep link ?contact=<id> para conversa que o chamador não enxerga: a tela
-- precisa saber que ela EXISTE (para não tentar criar outra e levar 23505),
-- e nada mais. Só existência, dentro do alcance de Conta do chamador.
CREATE OR REPLACE FUNCTION public.contact_has_conversation(p_contact_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.conversations c
     WHERE c.contact_id = p_contact_id
       AND public.loja_stats_scope_ok(c.tenant_id, false)
  );
$function$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.loja_stats_scope_ok(uuid, boolean)',
    'public.loja_message_counts(uuid, timestamptz, timestamptz, text, text)',
    'public.loja_response_time(uuid, timestamptz, timestamptz, text, text)',
    'public.loja_conversation_counts(uuid, timestamptz, timestamptz, text, text)',
    'public.loja_contact_last_message(uuid, text, uuid)',
    'public.contact_has_conversation(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;

COMMENT ON FUNCTION public.loja_message_counts(uuid, timestamptz, timestamptz, text, text) IS
  'Contagem de mensagens da Conta por balde (all/hour/day no fuso p_tz), direção, bot e instância. SECURITY DEFINER: número da Loja inteira mesmo para atendente restrito. Nunca devolve texto nem id de mensagem.';
COMMENT ON FUNCTION public.loja_response_time(uuid, timestamptz, timestamptz, text, text) IS
  'Tempo médio (minutos) do 1º inbound ao 1º outbound seguinte, por conversa e balde — a mesma regra de avgResponseMinutes do front. Só médias e contagens.';
COMMENT ON FUNCTION public.loja_conversation_counts(uuid, timestamptz, timestamptz, text, text) IS
  'Contagem de conversas da Conta por balde e arquivamento, com quantas têm não lidas. Superadmin recebe vazio (conversations não tem policy de superadmin).';
COMMENT ON FUNCTION public.loja_contact_last_message(uuid, text, uuid) IS
  'Última mensagem (só o instante) por contato da Conta, opcionalmente por direção e por contato. Nunca devolve conteúdo.';
COMMENT ON FUNCTION public.contact_has_conversation(uuid) IS
  'Se existe conversa para o contato, dentro do alcance de Conta do chamador — inclusive as que o RLS esconde dele. Só existência.';

-- -----------------------------------------------------------------------------
-- 8. Conferência + ledger
-- -----------------------------------------------------------------------------
DO $chk$
DECLARE
  n_pol_conv int;
  n_pol_msg  int;
  n_null     bigint;
BEGIN
  IF to_regclass('public.conversation_participants') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: conversation_participants não existe.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_record_conversation_participant'
                   AND tgrelid = 'public.messages'::regclass) THEN
    RAISE EXCEPTION 'ABORTADO: trigger trg_record_conversation_participant não existe.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_guard_conversation_transfer'
                   AND tgrelid = 'public.conversations'::regclass) THEN
    RAISE EXCEPTION 'ABORTADO: trigger trg_guard_conversation_transfer não existe.';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.handle_message_conversation()'::regprocedure)
     OR NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.update_conversation_on_message()'::regprocedure) THEN
    RAISE EXCEPTION 'ABORTADO: os triggers de escrituração não ficaram SECURITY DEFINER.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_atendente_settings_check') THEN
    RAISE EXCEPTION 'ABORTADO: CHECK tenants_atendente_settings_check não existe.';
  END IF;

  SELECT count(*) INTO n_pol_conv FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'conversations'
     AND policyname IN (
       'Users can view conversations from their tenant',
       'Users can insert conversations for their tenant',
       'Users can update conversations from their tenant',
       'Users can delete conversations from their tenant',
       'gerente_reads_child_store_data',
       'gerente_inserts_child_store_data',
       'gerente_updates_child_store_data');
  IF n_pol_conv <> 7 THEN
    RAISE EXCEPTION 'ABORTADO: conversations deveria ter as 7 policies conhecidas, tem %.', n_pol_conv;
  END IF;

  SELECT count(*) INTO n_pol_msg FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'messages'
     AND policyname IN (
       'Super admins can access all messages',
       'Users can view own tenant messages',
       'Users can insert own tenant messages',
       'Users can update own tenant messages',
       'Users can delete own tenant messages',
       'gerente_reads_child_store_data',
       'gerente_inserts_child_store_data',
       'gerente_updates_child_store_data');
  IF n_pol_msg <> 8 THEN
    RAISE EXCEPTION 'ABORTADO: messages deveria ter 8 policies (1 super + 4 users + 3 gerente), tem %.', n_pol_msg;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'messages'
               AND policyname = 'Users can access own tenant messages') THEN
    RAISE EXCEPTION 'ABORTADO: a policy ALL antiga de messages ainda existe.';
  END IF;

  SELECT count(*) INTO n_null FROM public.messages WHERE conversation_id IS NULL;

  INSERT INTO supabase_migrations.schema_migrations (version, name)
  VALUES ('20260914000001', 'conversation_visibility')
  ON CONFLICT (version) DO NOTHING;

  RAISE NOTICE 'conversation_visibility aplicada: participants, 2 helpers, 2 triggers novos, 2 triggers SECURITY DEFINER, 1 policy alterada + 4 criadas, 6 funções loja_*; messages.conversation_id NULL = % (visíveis por decisão).', n_null;
END
$chk$;

-- =============================================================================
-- ROLLBACK (na ordem; cada passo é independente)
--
-- -- 1. Policies de volta ao texto de 2026-09-13
-- ALTER POLICY "Users can view conversations from their tenant" ON public.conversations
--   USING (tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.user_id = (SELECT auth.uid())));
-- DROP POLICY IF EXISTS "Users can view own tenant messages"   ON public.messages;
-- DROP POLICY IF EXISTS "Users can insert own tenant messages" ON public.messages;
-- DROP POLICY IF EXISTS "Users can update own tenant messages" ON public.messages;
-- DROP POLICY IF EXISTS "Users can delete own tenant messages" ON public.messages;
-- CREATE POLICY "Users can access own tenant messages" ON public.messages
--   FOR ALL USING (tenant_id = (SELECT public.get_current_user_tenant_id()));
--
-- -- 2. Triggers de escrituração de volta a SECURITY INVOKER (corpos iguais)
-- CREATE OR REPLACE FUNCTION public.handle_message_conversation() RETURNS trigger
-- LANGUAGE plpgsql AS $function$
-- DECLARE v_conversation_id UUID;
-- BEGIN
--   SELECT id INTO v_conversation_id FROM public.conversations
--   WHERE contact_id = NEW.contact_id AND tenant_id = NEW.tenant_id;
--   IF v_conversation_id IS NULL THEN
--     INSERT INTO public.conversations (tenant_id, contact_id, whatsapp_instance_id, last_message_at, unread_count, is_archived)
--     VALUES (NEW.tenant_id, NEW.contact_id, NEW.whatsapp_instance_id, NEW.created_at, 0, false)
--     RETURNING id INTO v_conversation_id;
--   END IF;
--   NEW.conversation_id = v_conversation_id;
--   RETURN NEW;
-- END; $function$;
-- ALTER FUNCTION public.handle_message_conversation() SECURITY INVOKER RESET search_path;
-- ALTER FUNCTION public.update_conversation_on_message() SECURITY INVOKER RESET search_path;
--   (o corpo de update_conversation_on_message não mudou; só a cláusula.)
--
-- -- 3. Objetos novos
-- DROP TRIGGER IF EXISTS trg_guard_conversation_transfer ON public.conversations;
-- DROP TRIGGER IF EXISTS trg_record_conversation_participant ON public.messages;
-- DROP FUNCTION IF EXISTS public.tg_guard_conversation_transfer();
-- DROP FUNCTION IF EXISTS public.tg_record_conversation_participant();
-- DROP FUNCTION IF EXISTS public.contact_has_conversation(uuid);
-- DROP FUNCTION IF EXISTS public.loja_contact_last_message(uuid, text, uuid);
-- DROP FUNCTION IF EXISTS public.loja_conversation_counts(uuid, timestamptz, timestamptz, text, text);
-- DROP FUNCTION IF EXISTS public.loja_response_time(uuid, timestamptz, timestamptz, text, text);
-- DROP FUNCTION IF EXISTS public.loja_message_counts(uuid, timestamptz, timestamptz, text, text);
-- DROP FUNCTION IF EXISTS public.loja_stats_scope_ok(uuid, boolean);
-- DROP FUNCTION IF EXISTS public.conversation_transfer_allowed();
-- DROP FUNCTION IF EXISTS public.conversation_visibility_level();
-- DROP TABLE IF EXISTS public.conversation_participants;
-- ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_atendente_settings_check;
-- DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260914000001';
-- =============================================================================
