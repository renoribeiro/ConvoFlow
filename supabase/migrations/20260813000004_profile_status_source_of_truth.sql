-- =============================================================================
-- profiles.status vira a FONTE DA VERDADE do estado da conta de usuário
-- =============================================================================
-- CONTRATO (decidido em 2026-08-13)
--
--   public.profiles.status     → FONTE DA VERDADE. text NOT NULL. Valores:
--       'pending'    convidado, ainda não concluiu o cadastro
--       'active'     conta normal, em uso
--       'suspended'  bloqueada por um administrador
--       'deleted'    lápide do soft delete (manage-user action='soft_delete').
--                    NÃO é um estado em que um usuário "fica" — é o registro
--                    preservado para não perder histórico/comissões. Entra no
--                    CHECK porque o fluxo de exclusão do painel já grava esse
--                    valor hoje; sem ele, o botão Excluir do Admin quebraria.
--
--   public.profiles.is_active  → ESPELHO DERIVADO. Vale exatamente
--       (status = 'active'). NUNCA deve ser escrito sozinho — a partir desta
--       migração qualquer UPDATE direto nele é reescrito pelo trigger. Existe
--       só por retrocompatibilidade: `admin_users_view` e a policy
--       `superadmin_full_access_module_settings` ainda o leem.
--
--   Só 'active' dá acesso. Qualquer outro valor é conta parada.
--
-- O QUE ESTAVA QUEBRADO
--
--   1. O checkbox "Usuário ativo" do Admin era jogado fora na criação: o shim
--      admin-create-user não repassava `isActive` para manage-user, e o convite
--      sempre nascia 'pending' → is_active=false, marcasse ou não a caixa.
--   2. Na edição, o painel gravava profiles.is_active DIRETO. O trigger só
--      disparava em UPDATE OF status, então os dois campos se separavam em
--      silêncio (is_active=true com status='suspended', por exemplo).
--   3. is_active não bloqueava nada: nem login, nem rota, nem listagem.
--   4. status também não: era checado em UM lugar só (manage-user), então um
--      usuário suspenso continuava usando o sistema inteiro.
--
-- O QUE ESTA MIGRAÇÃO FAZ
--
--   - CHECK em status (valores válidos e nada além disso)
--   - profiles.invite_intent_active: guarda a intenção do admin no convite
--   - backfill A: promove a 'active' quem JÁ USA o sistema hoje (senão esta
--     migração trancaria usuários reais para fora — ver nota abaixo)
--   - backfill B: is_active = (status = 'active') em todas as linhas
--   - trigger sync_profile_is_active em INSERT OR UPDATE OF status
--   - trigger force_profile_is_active em UPDATE OF is_active: escrita direta
--     em is_active volta a ser derivada, nunca dessincroniza
--   - handle_new_user passa a persistir invite_intent_active
--   - novo trigger em auth.users: ao aceitar o convite, 'pending' vira 'active'
--     se o admin marcou a caixa, e 'suspended' se desmarcou
--   - admin_users_view passa a expor status (o painel mostrava "Inativo" tanto
--     para convite não aceito quanto para suspenso)
--
-- BACKFILL A — POR QUE PROMOVER 'pending' → 'active'
--
--   Consulta ao banco de produção em 2026-08-13 (7 perfis no total):
--     status='active'  is_active=true   → 5  (2 superadmin, 1 gerente, 2 gestor)
--     status='pending' is_active=false  → 2  (1 superadmin, 1 gerente)
--
--   Os DOIS 'pending' logam e usam o sistema normalmente hoje — um deles tinha
--   entrado no mesmo dia desta migração, com 11 logins acumulados. Eles ficaram
--   'pending' porque handle_new_user grava 'pending' por padrão e NADA nunca
--   promoveu ninguém a 'active'. Como o bloqueio de login passa a valer, sem o
--   backfill A esses dois perdiam o acesso no deploy.
--
--   Critério: já confirmou o e-mail E já entrou pelo menos uma vez. Quem foi
--   convidado e nunca entrou continua 'pending' — é exatamente o que 'pending'
--   quer dizer.
--
-- Idempotente de propósito: o histórico de migrations deste projeto está
-- dessincronizado e esta pode rodar depois de já ter sido aplicada à mão.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Coluna de intenção do convite
-- -----------------------------------------------------------------------------
-- NULL = convite antigo/sem intenção registrada → ao aceitar, vira 'active'
-- (comportamento retrocompatível). false = admin desmarcou "Usuário ativo" →
-- ao aceitar, o usuário já entra 'suspended'.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS invite_intent_active boolean NULL;

COMMENT ON COLUMN public.profiles.invite_intent_active IS
  'Intenção do admin no momento do convite (checkbox "Usuário ativo"). NULL/true = ao aceitar o convite o usuário vira active; false = vira suspended. Lida uma única vez, pelo trigger on_auth_user_confirmed.';

-- -----------------------------------------------------------------------------
-- 2. Backfill A — não trancar para fora quem já usa o sistema
--    (roda ANTES do CHECK e do backfill B)
-- -----------------------------------------------------------------------------
UPDATE public.profiles p
   SET status = 'active'
  FROM auth.users u
 WHERE u.id = p.user_id
   AND p.status = 'pending'
   AND u.email_confirmed_at IS NOT NULL
   AND u.last_sign_in_at IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. CHECK constraint em status
-- -----------------------------------------------------------------------------
-- Separado do ALTER ... ADD COLUMN para continuar idempotente. NOT VALID não é
-- usado de propósito: queremos que a migração falhe alto se sobrar algum valor
-- fora da lista, em vez de deixar lixo passar.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_status_valid'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_status_valid
      CHECK (status IN ('pending', 'active', 'suspended', 'deleted'));
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4. Backfill B — is_active vira espelho fiel de status
-- -----------------------------------------------------------------------------
UPDATE public.profiles
   SET is_active = (status = 'active')
 WHERE is_active IS DISTINCT FROM (status = 'active');

-- -----------------------------------------------------------------------------
-- 5. Triggers que mantêm o espelho — nos DOIS sentidos
-- -----------------------------------------------------------------------------
-- sync_*  : status mudou (ou linha nova) → recalcula is_active
-- force_* : alguém escreveu is_active direto → devolve o valor derivado
--
-- Quando o mesmo UPDATE toca status E is_active, os dois disparam. Ambos
-- calculam a MESMA expressão a partir de NEW.status, então a ordem entre eles
-- (alfabética: force_ antes de sync_) não muda o resultado.
CREATE OR REPLACE FUNCTION public.sync_profile_is_active()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  NEW.is_active := (NEW.status = 'active');
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.sync_profile_is_active() IS
  'Deriva profiles.is_active de profiles.status. status é a fonte da verdade; is_active é espelho de retrocompatibilidade.';

DROP TRIGGER IF EXISTS sync_profile_is_active_trigger ON public.profiles;
CREATE TRIGGER sync_profile_is_active_trigger
  BEFORE INSERT OR UPDATE OF status ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_is_active();

CREATE OR REPLACE FUNCTION public.force_profile_is_active()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- Escrita direta em is_active é ignorada: o valor volta a ser derivado de
  -- status. É o que impede o painel (ou qualquer script) de dessincronizar o
  -- par de novo.
  NEW.is_active := (NEW.status = 'active');
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.force_profile_is_active() IS
  'Descarta escrita direta em profiles.is_active, recalculando a partir de status. Garante que o par nunca se separe.';

DROP TRIGGER IF EXISTS force_profile_is_active_trigger ON public.profiles;
CREATE TRIGGER force_profile_is_active_trigger
  BEFORE UPDATE OF is_active ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.force_profile_is_active();

-- -----------------------------------------------------------------------------
-- 6. handle_new_user passa a persistir a intenção do convite
-- -----------------------------------------------------------------------------
-- Mesma função de antes, com duas linhas a mais: lê invite_intent_active do
-- raw_user_meta_data (gravado por manage-user) e guarda na coluna nova.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_role         public.user_role;
  v_tenant_id    UUID;
  v_parent_id    UUID;
  v_status       TEXT;
  v_first_name   TEXT;
  v_last_name    TEXT;
  v_phone        TEXT;
  v_intent       BOOLEAN;
BEGIN
  v_first_name := NEW.raw_user_meta_data ->> 'first_name';
  v_last_name  := NEW.raw_user_meta_data ->> 'last_name';
  v_phone      := NEW.raw_user_meta_data ->> 'phone';
  v_status     := COALESCE(NEW.raw_user_meta_data ->> 'status', 'pending');
  v_intent     := NULLIF(NEW.raw_user_meta_data ->> 'invite_intent_active', '')::BOOLEAN;
  v_role := COALESCE((NEW.raw_user_meta_data ->> 'role')::public.user_role, 'gestor'::public.user_role);
  v_tenant_id := NULLIF(NEW.raw_user_meta_data ->> 'tenant_id', '')::UUID;
  v_parent_id := NULLIF(NEW.raw_user_meta_data ->> 'parent_id', '')::UUID;

  IF v_role <> 'superadmin'::public.user_role AND v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id e obrigatorio no raw_user_meta_data para role %', v_role;
  END IF;

  INSERT INTO public.profiles (
    user_id, tenant_id, role, first_name, last_name, phone, parent_id, status,
    invite_intent_active
  )
  VALUES (
    NEW.id, v_tenant_id, v_role, v_first_name, v_last_name, v_phone, v_parent_id, v_status,
    v_intent
  );
  RETURN NEW;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 7. Aceite do convite: 'pending' → 'active' ou 'suspended'
-- -----------------------------------------------------------------------------
-- O convite do Supabase (inviteUserByEmail) cria o auth.users com o e-mail
-- ainda não confirmado. Quando a pessoa clica no link e define a senha, o
-- Supabase preenche email_confirmed_at e last_sign_in_at. É esse o momento em
-- que o cadastro está concluído — e é aqui que a intenção do admin é aplicada.
--
-- O UPDATE tem `AND status = 'pending'`, então depois da primeira vez vira
-- no-op: logins seguintes não mexem em nada e nunca "ressuscitam" um suspenso.
CREATE OR REPLACE FUNCTION public.handle_user_confirmed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  UPDATE public.profiles
     SET status = CASE
                    WHEN COALESCE(invite_intent_active, TRUE) THEN 'active'
                    ELSE 'suspended'
                  END
   WHERE user_id = NEW.id
     AND status = 'pending';
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.handle_user_confirmed() IS
  'Conclui o convite: ao confirmar o e-mail e entrar pela primeira vez, o perfil sai de pending. Vai para active se o admin deixou "Usuário ativo" marcado (invite_intent_active NULL ou true) e para suspended se desmarcou.';

DROP TRIGGER IF EXISTS on_auth_user_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_confirmed
  AFTER UPDATE OF email_confirmed_at, last_sign_in_at ON auth.users
  FOR EACH ROW
  WHEN (NEW.email_confirmed_at IS NOT NULL AND NEW.last_sign_in_at IS NOT NULL)
  EXECUTE FUNCTION public.handle_user_confirmed();

-- -----------------------------------------------------------------------------
-- 8. admin_users_view expõe status
-- -----------------------------------------------------------------------------
-- Mesma definição de antes, com p.status acrescentado NO FIM (CREATE OR REPLACE
-- VIEW só permite adicionar colunas ao final). Sem isso o painel mostra
-- "Inativo" tanto para "convidado, não aceitou" quanto para "suspenso pelo
-- admin" — dois estados bem diferentes.
CREATE OR REPLACE VIEW public.admin_users_view AS
  SELECT au.id,
         au.email,
         au.created_at,
         au.last_sign_in_at,
         au.email_confirmed_at,
         p.tenant_id,
         p.first_name,
         p.last_name,
         p.role,
         p.is_active,
         p.phone,
         p.updated_at AS profile_updated_at,
         t.name AS tenant_name,
         t.manual_access_granted,
         p.status
    FROM ((auth.users au
      LEFT JOIN public.profiles p ON ((au.id = p.user_id)))
      LEFT JOIN public.tenants t ON ((p.tenant_id = t.id)))
   WHERE ((au.deleted_at IS NULL) AND (EXISTS ( SELECT 1
              FROM public.profiles current_user_profile
             WHERE ((current_user_profile.user_id = auth.uid())
               AND (current_user_profile.role = 'superadmin'::public.user_role)))))
   ORDER BY au.created_at DESC;

-- =============================================================================
-- ROLLBACK
--   DROP TRIGGER IF EXISTS on_auth_user_confirmed ON auth.users;
--   DROP FUNCTION IF EXISTS public.handle_user_confirmed();
--   DROP TRIGGER IF EXISTS force_profile_is_active_trigger ON public.profiles;
--   DROP FUNCTION IF EXISTS public.force_profile_is_active();
--   ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_valid;
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS invite_intent_active;
--   -- handle_new_user, sync_profile_is_active e admin_users_view voltam à
--   -- versão anterior recriando-as (ver git history).
-- =============================================================================
