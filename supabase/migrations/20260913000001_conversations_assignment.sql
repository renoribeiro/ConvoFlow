-- =============================================================================
-- 20260913000001_conversations_assignment
--
-- Responsável por conversa (passo 1 de 5 da atribuição de atendimento).
--
-- O QUE MUDA
--   `conversations` ganha um dono opcional: `assigned_profile_id` (quem atende),
--   `assigned_at` (desde quando) e `assigned_by` (quem atribuiu). Mais uma
--   função de diretório do time, para o front resolver nome e avatar do dono,
--   e um trigger que avisa (sino) quem recebeu a conversa numa transferência.
--
-- O QUE **NÃO** MUDA — de propósito
--   - NENHUMA policy de RLS. Todo mundo da Loja continua vendo TODAS as
--     conversas, exatamente como hoje. Restringir visibilidade é outro passo.
--   - Nada em `supabase_realtime`.
--   - Nada no nó `transfer_agent` do chatbot.
--   - Nenhum evento de webhook.
--
-- FORMA
--   Segue a convenção de `sla_muted_at` / `sla_muted_by` (20260813000001):
--   colunas NULL-áveis na própria linha da conversa, FK com ON DELETE SET NULL,
--   índice parcial. NULL nas três = a conversa ainda não tem responsável.
--
--   DIFERENÇA DELIBERADA: `sla_muted_by` referencia `auth.users(id)`. Aqui as
--   duas FKs referenciam `public.profiles(id)`. Motivo: a tela precisa mostrar
--   UMA PESSOA DA LOJA (nome, avatar), e é `profiles` que carrega nome, avatar,
--   cargo e Loja. `auth.users` só tem e-mail, que ninguém deve ver. Além disso,
--   apagar o usuário do Auth já cascateia para `profiles` (profiles_user_id_fkey),
--   então o SET NULL daqui cobre os dois casos de sumiço.
--
-- IDEMPOTENTE: pode rodar de novo sem efeito. Nada aqui apaga ou sobrescreve
-- dado — é só acréscimo — por isso não precisa do bloco DO único das escritas
-- perigosas (CLAUDE.md, armadilha 4). O bloco DO do fim confere o resultado e
-- grava o ledger.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Colunas
-- -----------------------------------------------------------------------------
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS assigned_profile_id uuid NULL,
  ADD COLUMN IF NOT EXISTS assigned_at         timestamptz NULL,
  ADD COLUMN IF NOT EXISTS assigned_by         uuid NULL;

-- FKs separadas do ADD COLUMN para continuar idempotente em bases que já têm
-- as colunas mas ainda não as constraints. ON DELETE SET NULL: perder o perfil
-- do responsável devolve a conversa para "sem responsável", não apaga a conversa.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'conversations_assigned_profile_id_fkey'
      AND conrelid = 'public.conversations'::regclass
  ) THEN
    ALTER TABLE public.conversations
      ADD CONSTRAINT conversations_assigned_profile_id_fkey
      FOREIGN KEY (assigned_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'conversations_assigned_by_fkey'
      AND conrelid = 'public.conversations'::regclass
  ) THEN
    ALTER TABLE public.conversations
      ADD CONSTRAINT conversations_assigned_by_fkey
      FOREIGN KEY (assigned_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- (tenant_id, assigned_profile_id): é o recorte de "as minhas" e de "as sem
-- responsável" dentro de uma Loja. Cobre as duas perguntas com um índice só.
CREATE INDEX IF NOT EXISTS idx_conversations_tenant_assigned
  ON public.conversations (tenant_id, assigned_profile_id);

COMMENT ON COLUMN public.conversations.assigned_profile_id IS
  'Perfil (public.profiles.id) que atende esta conversa. NULL = a conversa ainda não tem responsável; qualquer pessoa da Loja pode assumir. Não restringe leitura: todo mundo da Loja continua vendo a conversa.';
COMMENT ON COLUMN public.conversations.assigned_at IS
  'Quando o responsável atual assumiu ou recebeu a conversa. NULL = sem responsável. Zera junto com assigned_profile_id.';
COMMENT ON COLUMN public.conversations.assigned_by IS
  'Perfil (public.profiles.id) que fez a atribuição. Igual a assigned_profile_id quando a pessoa assumiu para si; diferente quando foi transferência. NULL = sem responsável.';

-- -----------------------------------------------------------------------------
-- 2. Diretório do time — quem pode ser responsável, com nome e avatar
--
--    Por que existe: o RLS de `profiles` é hierárquico de propósito. Um
--    atendente lê SÓ o próprio perfil e um gestor lê só os atendentes da Loja.
--    Sem isto, a tela veria `assigned_profile_id` e não teria como mostrar o
--    nome de quem atende — e o seletor de "Transferir" sairia vazio.
--
--    O que devolve: id, nome, sobrenome, avatar. NADA além disso — nem e-mail,
--    nem telefone, nem cargo, nem status, nem capacidades. É o mínimo para
--    montar um chip "Maria" com foto.
--
--    Escopo:
--      - a Loja/Conta do próprio chamador (padrão, p_tenant_id NULL);
--      - um gerente pode pedir uma Loja filha da Conta dele (é o mesmo alcance
--        de `gerente_child_store_ids()`, que já lhe dá leitura da Loja);
--      - quando o alvo é uma Loja, entram também os gerentes ATIVOS da Conta
--        acima dela. Motivo: o gerente pode assumir/transferir conversa da
--        Loja (policy gerente_updates_child_store_data), e sem isto a Loja
--        veria um responsável sem nome e não conseguiria devolver a conversa
--        para ele. É só nome e avatar de quem já é o chefe deles.
--      - qualquer outro pedido devolve VAZIO, sem erro.
--
--    Só perfis `status = 'active'` e nunca `superadmin` (superadmin não atende
--    e nem lê Conversas — ver a nota de privacidade em conversations).
--
--    NÃO é usada em policy nenhuma. Chamar por linha numa policy viraria filtro
--    correlacionado; ela é para o front, uma vez por tela.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_team_directory(p_tenant_id uuid DEFAULT NULL)
RETURNS TABLE (
  id         uuid,
  first_name text,
  last_name  text,
  avatar_url text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_mine   uuid;
  v_target uuid;
  v_parent uuid;
BEGIN
  v_mine   := public.get_current_user_tenant_id();
  v_target := COALESCE(p_tenant_id, v_mine);

  -- Sem perfil ativo, ou pedindo uma Conta que não é a sua nem uma Loja filha
  -- da sua Conta de gerente: nada.
  IF v_mine IS NULL OR v_target IS NULL THEN
    RETURN;
  END IF;
  -- Mesma forma das policies gerente_*_child_store_data: subconsulta não
  -- correlacionada, vazia para quem não é gerente.
  IF v_target <> v_mine
     AND v_target NOT IN (SELECT public.gerente_child_store_ids()) THEN
    RETURN;
  END IF;

  SELECT t.parent_tenant_id INTO v_parent
    FROM public.tenants t
   WHERE t.id = v_target AND t.kind = 'store';

  RETURN QUERY
  SELECT p.id, p.first_name, p.last_name, p.avatar_url
    FROM public.profiles p
   WHERE p.status = 'active'
     AND p.role IS DISTINCT FROM 'superadmin'::public.user_role
     AND (
           p.tenant_id = v_target
        OR (v_parent IS NOT NULL
            AND p.tenant_id = v_parent
            AND p.role = 'gerente'::public.user_role)
     )
   ORDER BY p.first_name NULLS LAST, p.last_name NULLS LAST, p.id;
END;
$function$;

COMMENT ON FUNCTION public.tenant_team_directory(uuid) IS
  'Quem pode ser responsável por conversa na Loja/Conta do chamador (ou numa Loja filha, para gerente): id, nome, sobrenome e avatar de perfis ativos. Nada mais é exposto. Existe porque o RLS de profiles não deixa atendente ler colega. Não usar em policy.';

REVOKE ALL ON FUNCTION public.tenant_team_directory(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tenant_team_directory(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.tenant_team_directory(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. Aviso no sino de quem RECEBEU a conversa
--
--    Mesma linha que o motor do chatbot grava em `createTransferNotification`
--    (supabase/functions/_shared/chatbot-engine.ts): title 'Conversa
--    transferida', type 'info', action_url para a conversa, action_label
--    'Ver conversa', metadata com os ids. Nenhum mecanismo novo — é a tabela
--    `notifications` que o sino já lê.
--
--    Por que trigger e não INSERT do cliente: `notifications.user_id` é o id
--    do Auth, e o diretório acima devolve só o id do PERFIL, de propósito. O
--    trigger faz a ponte no banco (SECURITY DEFINER, porque o RLS de profiles
--    não deixaria um atendente ler o user_id do colega) e ainda garante que
--    transferência e aviso saem na mesma transação.
--
--    Não avisa quando a pessoa assume para si (assigned_by = assigned_profile_id)
--    nem quando a conversa é devolvida para "sem responsável".
--
--    EXCEPTION-SAFE: um erro aqui nunca desfaz a transferência.
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
  'AFTER UPDATE OF assigned_profile_id em conversations: grava no sino de quem recebeu a conversa, na mesma forma que o nó transfer_agent do chatbot. Não avisa quem assume para si.';

DROP TRIGGER IF EXISTS trg_notify_conversation_assigned ON public.conversations;
CREATE TRIGGER trg_notify_conversation_assigned
  AFTER UPDATE OF assigned_profile_id ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_notify_conversation_assigned();

-- -----------------------------------------------------------------------------
-- 4. Conferência + ledger. Aborta (sem gravar o ledger) se algo acima não
--    ficou como esperado.
-- -----------------------------------------------------------------------------
DO $chk$
DECLARE
  n_cols int;
  n_fks  int;
  n_pol  int;
BEGIN
  SELECT count(*) INTO n_cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'conversations'
     AND column_name IN ('assigned_profile_id', 'assigned_at', 'assigned_by');
  IF n_cols <> 3 THEN
    RAISE EXCEPTION 'ABORTADO: esperava 3 colunas de responsável, encontrei %.', n_cols;
  END IF;

  SELECT count(*) INTO n_fks
    FROM pg_constraint
   WHERE conrelid = 'public.conversations'::regclass
     AND conname IN ('conversations_assigned_profile_id_fkey', 'conversations_assigned_by_fkey');
  IF n_fks <> 2 THEN
    RAISE EXCEPTION 'ABORTADO: esperava 2 FKs de responsável, encontrei %.', n_fks;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
                   AND indexname = 'idx_conversations_tenant_assigned') THEN
    RAISE EXCEPTION 'ABORTADO: índice idx_conversations_tenant_assigned não existe.';
  END IF;

  IF to_regprocedure('public.tenant_team_directory(uuid)') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: função tenant_team_directory(uuid) não existe.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notify_conversation_assigned'
                   AND tgrelid = 'public.conversations'::regclass) THEN
    RAISE EXCEPTION 'ABORTADO: trigger trg_notify_conversation_assigned não existe.';
  END IF;

  -- Prova de que este arquivo não mexeu em policy: as 7 conhecidas de
  -- conversations (4 base + 3 do gerente) continuam existindo. Se faltar
  -- alguma, NÃO foi aqui — investigue antes de gravar o ledger.
  SELECT count(*) INTO n_pol
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'conversations'
     AND policyname IN (
       'Users can view conversations from their tenant',
       'Users can insert conversations for their tenant',
       'Users can update conversations from their tenant',
       'Users can delete conversations from their tenant',
       'gerente_reads_child_store_data',
       'gerente_inserts_child_store_data',
       'gerente_updates_child_store_data');
  IF n_pol <> 7 THEN
    RAISE EXCEPTION 'ABORTADO: só % das 7 policies conhecidas de conversations existem. Este arquivo não cria nem apaga policy — investigue antes de gravar o ledger.', n_pol;
  END IF;

  INSERT INTO supabase_migrations.schema_migrations (version, name)
  VALUES ('20260913000001', 'conversations_assignment')
  ON CONFLICT (version) DO NOTHING;

  RAISE NOTICE 'conversations_assignment aplicada: 3 colunas, 2 FKs, 1 índice, 1 função, 1 trigger; % policies intactas.', n_pol;
END
$chk$;

-- =============================================================================
-- ROLLBACK
--   DROP TRIGGER IF EXISTS trg_notify_conversation_assigned ON public.conversations;
--   DROP FUNCTION IF EXISTS public.tg_notify_conversation_assigned();
--   DROP FUNCTION IF EXISTS public.tenant_team_directory(uuid);
--   DROP INDEX IF EXISTS public.idx_conversations_tenant_assigned;
--   ALTER TABLE public.conversations
--     DROP CONSTRAINT IF EXISTS conversations_assigned_by_fkey,
--     DROP CONSTRAINT IF EXISTS conversations_assigned_profile_id_fkey,
--     DROP COLUMN IF EXISTS assigned_by,
--     DROP COLUMN IF EXISTS assigned_at,
--     DROP COLUMN IF EXISTS assigned_profile_id;
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260913000001';
-- =============================================================================
