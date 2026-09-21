-- =============================================================================
-- 20260921000004_messages_sender_profile
--
-- Quem enviou cada mensagem humana: `messages.sender_profile_id`.
--
-- POR QUE
--   `messages` nunca teve autor — só direção, is_from_bot e source. "Quem
--   respondeu" era desconhecido; só "quem está com a conversa". Decidido em
--   2026-09-21 gravar o autor a partir de agora.
--
-- HISTÓRIA ANTERIOR FICA DESCONHECIDA. Todas as linhas existentes ficam com
--   sender_profile_id NULL e assim continuam: não há como saber quem escreveu
--   (medido: 471 mensagens humanas na EncaixaRH, 353 anteriores mesmo ao
--   registro de participação). Nenhuma métrica por autoria cobre o passado.
--
-- COMO É PREENCHIDO — e por que o cliente não manda
--   Trigger BEFORE INSERT `trg_set_message_sender`, com a MESMA cláusula WHEN
--   de trg_record_conversation_participant (outbound, is_from_bot IS NOT TRUE,
--   source IS NULL): resolve auth.uid() → profiles.id, preferindo o perfil da
--   Loja da mensagem (um gerente responde numa Loja filha com o perfil da
--   Conta). SOBRESCREVE o que vier do cliente: forjar autor não é possível.
--   Service role (auth.uid() NULL) fica NULL sozinho. Se a resolução falhar,
--   fica NULL e o INSERT segue (exception-safe): registro nunca derruba envio.
--
--   Duas cercas a mais para o valor ser confiável por si só:
--     - CHECK messages_sender_only_human: autor só existe em linha humana
--       (outbound, não-bot, sem source). Um cliente que mande
--       sender_profile_id numa linha com source vê 23514. Linhas de webhook,
--       campanha, bot e follow-up nunca mandam a coluna — ficam NULL.
--     - Trigger BEFORE UPDATE `trg_keep_message_sender`: qualquer mudança
--       do autor é revertida para o valor anterior — trocar por outro E
--       zerar. A única exceção é o SET NULL da FK ao apagar o perfil: nesse
--       instante o perfil já não existe, e é isso que o trigger confere
--       (SECURITY DEFINER, para enxergar profiles sem o RLS do chamador).
--
-- UMA CONSULTA A PROFILES, NÃO DUAS
--   tg_record_conversation_participant deixa de resolver auth.uid() por
--   conta própria: lê NEW.sender_profile_id, que o BEFORE já preencheu. O
--   corpo é o mesmo de 20260914000001 tirando o lookup.
--
-- HISTÓRICO IMPORTADO (a armadilha)
--   chatHistorySyncService (navegador) insere mensagens antigas `fromMe` sob
--   a sessão de quem clicou em sincronizar, com is_from_bot false e source
--   NULL. Sem exclusão, quem rodou a sincronização viraria AUTOR de todo o
--   histórico importado — e já virava PARTICIPANTE de todas essas conversas.
--   A partir deste commit o cliente grava source = 'history_sync' nessas
--   linhas: as duas cláusulas WHEN (source IS NULL) pulam. O valor entra na
--   lista de origens ao lado de campaign / chatbot / followup / automation.
--   Consequência assumida: histórico importado também deixa de contar como
--   "resposta humana" nas métricas (response_rule_turn_start e loja_*), pelo
--   mesmo critério `source IS NULL` — é a única definição no sistema.
--
-- CAMINHOS QUE NÃO MUDAM
--   Inbound (evolution-webhook:333, waha-webhook:220, process_incoming_message
--   do meta-webhook): a WHEN é só outbound. meta-webhook e meta-oauth-exchange
--   não são tocados; a coluna é nula e nenhuma leitura deles a vê.
--   Nenhuma edge function precisa de redeploy para esta migração.
--
-- IDEMPOTENTE: pode rodar de novo. Só acréscimo; nenhuma linha reescrita.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Coluna, FK, índice, CHECK
-- -----------------------------------------------------------------------------
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS sender_profile_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'messages_sender_profile_id_fkey'
      AND conrelid = 'public.messages'::regclass
  ) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_sender_profile_id_fkey
      FOREIGN KEY (sender_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'messages_sender_only_human'
      AND conrelid = 'public.messages'::regclass
  ) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_sender_only_human CHECK (
        sender_profile_id IS NULL
        OR (direction = 'outbound' AND is_from_bot IS NOT TRUE AND source IS NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_messages_sender_profile
  ON public.messages (tenant_id, sender_profile_id, created_at)
  WHERE sender_profile_id IS NOT NULL;

COMMENT ON COLUMN public.messages.sender_profile_id IS
  'Perfil (profiles.id) de quem enviou esta mensagem humana. Preenchido SÓ pelo trigger trg_set_message_sender a partir de auth.uid() (o valor mandado pelo cliente é sobrescrito). NULL em tudo que é bot, campanha, follow-up, automação, webhook e histórico importado — e em TODA mensagem anterior a 2026-09-21, que não tem como ser atribuída.';

-- -----------------------------------------------------------------------------
-- 2. BEFORE INSERT — preenche e sobrescreve
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_set_message_sender()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_profile uuid;
BEGIN
  -- O que o cliente mandou não vale nada: começa do zero.
  NEW.sender_profile_id := NULL;

  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.id INTO v_profile
    FROM public.profiles p
   WHERE p.user_id = auth.uid()
   ORDER BY (p.tenant_id = NEW.tenant_id) DESC NULLS LAST
   LIMIT 1;

  NEW.sender_profile_id := v_profile;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Autor desconhecido é inócuo; envio recusado não é.
  RAISE WARNING 'tg_set_message_sender falhou: % [%]', SQLERRM, SQLSTATE;
  NEW.sender_profile_id := NULL;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.tg_set_message_sender() IS
  'BEFORE INSERT em messages (outbound, humana, sem source): sender_profile_id := perfil de auth.uid(), sobrescrevendo o que o cliente mandou. NULL para service role. Exception-safe.';

DROP TRIGGER IF EXISTS trg_set_message_sender ON public.messages;
CREATE TRIGGER trg_set_message_sender
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  WHEN (NEW.direction = 'outbound' AND NEW.is_from_bot IS NOT TRUE AND NEW.source IS NULL)
  EXECUTE FUNCTION public.tg_set_message_sender();

-- -----------------------------------------------------------------------------
-- 3. BEFORE UPDATE — o autor não troca de mãos
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_keep_message_sender()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- ON DELETE SET NULL da FK: o perfil já foi apagado nesta transação.
  IF NEW.sender_profile_id IS NULL
     AND OLD.sender_profile_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = OLD.sender_profile_id) THEN
    RETURN NEW;
  END IF;
  NEW.sender_profile_id := OLD.sender_profile_id;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.tg_keep_message_sender() IS
  'BEFORE UPDATE em messages quando sender_profile_id mudaria: mantém o anterior (trocar e zerar são revertidos). Só passa o SET NULL da FK, quando o perfil já não existe.';

DROP TRIGGER IF EXISTS trg_keep_message_sender ON public.messages;
CREATE TRIGGER trg_keep_message_sender
  BEFORE UPDATE OF sender_profile_id ON public.messages
  FOR EACH ROW
  WHEN (NEW.sender_profile_id IS DISTINCT FROM OLD.sender_profile_id)
  EXECUTE FUNCTION public.tg_keep_message_sender();

-- -----------------------------------------------------------------------------
-- 4. Participantes: reutiliza NEW.sender_profile_id (sem segundo lookup)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_record_conversation_participant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- Sem autor (service role, resolução falhou) ou sem conversa: sem participação.
  IF NEW.sender_profile_id IS NULL OR NEW.conversation_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.conversation_participants (conversation_id, profile_id, first_at)
  VALUES (NEW.conversation_id, NEW.sender_profile_id, NEW.created_at)
  ON CONFLICT (conversation_id, profile_id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Escrituração nunca derruba um envio.
  RAISE WARNING 'tg_record_conversation_participant(%) falhou: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.tg_record_conversation_participant() IS
  'AFTER INSERT em messages (outbound, humana, sem source): registra NEW.sender_profile_id (preenchido pelo BEFORE trg_set_message_sender) como participante da conversa. Nada quando o autor é NULL. Exception-safe.';

-- -----------------------------------------------------------------------------
-- 5. Conferência + ledger
-- -----------------------------------------------------------------------------
DO $chk$
DECLARE
  n_before int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'sender_profile_id') THEN
    RAISE EXCEPTION 'ABORTADO: messages.sender_profile_id não existe.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_sender_only_human') THEN
    RAISE EXCEPTION 'ABORTADO: CHECK messages_sender_only_human não existe.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_set_message_sender' AND tgrelid = 'public.messages'::regclass)
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_keep_message_sender' AND tgrelid = 'public.messages'::regclass)
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_record_conversation_participant' AND tgrelid = 'public.messages'::regclass) THEN
    RAISE EXCEPTION 'ABORTADO: um dos três triggers de messages não existe.';
  END IF;
  -- O participante passou a depender do BEFORE: o texto tem de ler NEW.sender_profile_id.
  IF position('NEW.sender_profile_id' IN pg_get_functiondef('public.tg_record_conversation_participant()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'ABORTADO: tg_record_conversation_participant não usa NEW.sender_profile_id.';
  END IF;
  -- Nenhuma linha existente ganhou autor: a história continua desconhecida.
  SELECT count(*) INTO n_before FROM public.messages WHERE sender_profile_id IS NOT NULL;
  IF n_before <> 0 THEN
    RAISE EXCEPTION 'ABORTADO: % linhas já têm sender_profile_id antes do primeiro envio; esperava 0.', n_before;
  END IF;

  INSERT INTO supabase_migrations.schema_migrations (version, name)
  VALUES ('20260921000004', 'messages_sender_profile')
  ON CONFLICT (version) DO NOTHING;

  RAISE NOTICE 'messages_sender_profile aplicada: coluna + FK + CHECK + índice, 2 triggers novos, participante reescrito. Histórico anterior: sem autor (para sempre).';
END
$chk$;

-- =============================================================================
-- ROLLBACK
--   DROP TRIGGER IF EXISTS trg_keep_message_sender ON public.messages;
--   DROP TRIGGER IF EXISTS trg_set_message_sender ON public.messages;
--   DROP FUNCTION IF EXISTS public.tg_keep_message_sender();
--   DROP FUNCTION IF EXISTS public.tg_set_message_sender();
--   -- tg_record_conversation_participant: recriar com o texto de 20260914000001:149-185
--   ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_sender_only_human;
--   DROP INDEX IF EXISTS public.idx_messages_sender_profile;
--   ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_sender_profile_id_fkey;
--   ALTER TABLE public.messages DROP COLUMN IF EXISTS sender_profile_id;
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260921000004';
-- =============================================================================
