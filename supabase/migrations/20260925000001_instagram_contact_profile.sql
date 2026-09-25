-- Fatia 4a do Instagram: o NOME do cliente, buscado sob demanda.
--
-- ============================================================================
-- O QUE ESTA MIGRAÇÃO FAZ
-- ============================================================================
--
--   1. contacts ganha três colunas, todas anuláveis e sem DEFAULT (o Postgres
--      não reescreve a tabela e nenhuma trigger de linha dispara):
--        username            o @ do Instagram, sem o "@"
--        profile_status      pending | ok | unavailable | retry  (NULL = nunca tentado)
--        profile_checked_at  quando a última tentativa começou
--   2. instagram_contact_profile_claim: marca como 'pending' os contatos de
--      Instagram que estão na hora de buscar e devolve o que a edge function
--      precisa. A marca é o que impede duas abas abertas de pedirem o mesmo
--      contato, e o que impede tentar de novo a cada ciclo.
--   3. instagram_contact_profile_record: grava o resultado — só sobre uma
--      marca 'pending' (quem chegou depois não sobrescreve).
--
-- NÃO FAZ: nada no caminho de entrada. O webhook do Instagram, a
-- process_instagram_message e as triggers de mensagens não mudam. Nenhuma
-- linha existente é alterada.
--
-- ============================================================================
-- QUANDO UM CONTATO ESTÁ "NA HORA"
-- ============================================================================
--
--   profile_status IS NULL                                   nunca tentado
--   'retry'   e profile_checked_at há mais de 6 horas         falha passageira
--   'pending' e profile_checked_at há mais de 10 minutos      a tentativa morreu no meio
--   'ok' / 'unavailable'                                     nunca mais
--
-- E só se a conexão do Instagram do contato atende: instância ativa, acesso
-- dentro da validade e sem "precisa reconectar" para o acesso atual (a mesma
-- regra do cartão e da renovação). Acesso vencido: nem tenta — o contato fica
-- sem marca e volta a estar na hora quando a conta for reconectada.
--
-- A regra está espelhada no navegador (src/lib/instagram/contactProfile.ts),
-- só para não chamar a função à toa; quem decide é esta função.
--
-- ============================================================================
-- ATOMICIDADE
-- ============================================================================
--
-- Funções com CREATE OR REPLACE. Colunas, restrição e conferência num único
-- bloco DO com lock_timeout de 5 s (ALTER TABLE contacts pede um lock curto;
-- se não sair, aborta em vez de enfileirar o webhook atrás da migração).
-- Idempotente.

-- ---------------------------------------------------------------------------
-- 1. Colunas — um comando só, com conferência
-- ---------------------------------------------------------------------------
DO $mig$
DECLARE
  ENCAIXA constant uuid := '2165be9f-b6bb-49fb-ba6a-1dec6840c45a';
  v_ct_antes   text;
  v_ct_depois  text;
  v_enc_antes  text;
  v_enc_depois text;
  v_trg_antes  text;
  v_trg_depois text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- Nenhuma linha pode mudar: id + updated_at de TODOS os contatos.
  SELECT md5(string_agg(c.id::text || '|' || coalesce(c.updated_at::text, ''), ',' ORDER BY c.id))
    INTO v_ct_antes FROM public.contacts c;
  SELECT concat_ws('|',
           (SELECT count(*) FROM public.contacts      WHERE tenant_id = ENCAIXA),
           (SELECT count(*) FROM public.conversations WHERE tenant_id = ENCAIXA),
           (SELECT count(*) FROM public.messages      WHERE tenant_id = ENCAIXA))
    INTO v_enc_antes;
  SELECT md5(string_agg(pg_get_triggerdef(t.oid), '|' ORDER BY t.tgname)) INTO v_trg_antes
    FROM pg_trigger t
   WHERE NOT t.tgisinternal
     AND t.tgrelid IN ('public.messages'::regclass, 'public.contacts'::regclass, 'public.conversations'::regclass);

  ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS username text;
  ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS profile_status text;
  ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS profile_checked_at timestamptz;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'contacts_profile_status_check'
                    AND conrelid = 'public.contacts'::regclass) THEN
    ALTER TABLE public.contacts
      ADD CONSTRAINT contacts_profile_status_check
      CHECK (profile_status IS NULL
             OR profile_status = ANY (ARRAY['pending'::text, 'ok'::text, 'unavailable'::text, 'retry'::text]));
  END IF;

  -- ---- CONFERÊNCIA ----------------------------------------------------------
  SELECT md5(string_agg(c.id::text || '|' || coalesce(c.updated_at::text, ''), ',' ORDER BY c.id))
    INTO v_ct_depois FROM public.contacts c;
  IF v_ct_depois IS DISTINCT FROM v_ct_antes THEN
    RAISE EXCEPTION 'ABORTADO: alguma linha de contacts mudou.';
  END IF;
  SELECT concat_ws('|',
           (SELECT count(*) FROM public.contacts      WHERE tenant_id = ENCAIXA),
           (SELECT count(*) FROM public.conversations WHERE tenant_id = ENCAIXA),
           (SELECT count(*) FROM public.messages      WHERE tenant_id = ENCAIXA))
    INTO v_enc_depois;
  IF v_enc_depois IS DISTINCT FROM v_enc_antes THEN
    RAISE EXCEPTION 'ABORTADO: contagens da EncaixaRH mudaram (% -> %).', v_enc_antes, v_enc_depois;
  END IF;
  SELECT md5(string_agg(pg_get_triggerdef(t.oid), '|' ORDER BY t.tgname)) INTO v_trg_depois
    FROM pg_trigger t
   WHERE NOT t.tgisinternal
     AND t.tgrelid IN ('public.messages'::regclass, 'public.contacts'::regclass, 'public.conversations'::regclass);
  IF v_trg_depois IS DISTINCT FROM v_trg_antes THEN
    RAISE EXCEPTION 'ABORTADO: alguma trigger de messages/contacts/conversations mudou.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.contacts
              WHERE username IS NOT NULL OR profile_status IS NOT NULL OR profile_checked_at IS NOT NULL) THEN
    RAISE EXCEPTION 'ABORTADO: as colunas novas nasceram com valor.';
  END IF;

  RAISE NOTICE 'OK: contacts.username/profile_status/profile_checked_at; nenhuma linha, trigger ou contagem mudou.';
END
$mig$;

COMMENT ON COLUMN public.contacts.username IS
  'Instagram: o @ do cliente, sem o "@", buscado sob demanda (instagram-contact-profile). NULL no WhatsApp.';
COMMENT ON COLUMN public.contacts.profile_status IS
  'Busca do perfil no Instagram: NULL nunca tentado | pending tentando | ok achou | unavailable bloqueou ou sem consentimento (não tenta mais) | retry falha passageira (tenta de novo em 6 h).';
COMMENT ON COLUMN public.contacts.profile_checked_at IS
  'Quando a última busca do perfil no Instagram começou.';

-- ---------------------------------------------------------------------------
-- 2. Reservar os contatos na hora de buscar
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.instagram_contact_profile_claim(
  p_contact_ids uuid[],
  p_now         timestamptz DEFAULT now()
)
RETURNS TABLE (contact_id uuid, igsid text, instance_id uuid, token_issued_at text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF p_contact_ids IS NULL OR cardinality(p_contact_ids) = 0 THEN
    RETURN;
  END IF;
  IF cardinality(p_contact_ids) > 50 THEN
    RAISE EXCEPTION 'instagram_contact_profile_claim: no máximo 50 contatos por vez (%).', cardinality(p_contact_ids);
  END IF;

  RETURN QUERY
  WITH alvo AS (
    SELECT c.id, c.external_id, w.id AS inst_id, w.connection_config ->> 'tokenIssuedAt' AS issued
      FROM public.contacts c
      JOIN public.whatsapp_instances w ON w.id = c.whatsapp_instance_id
     WHERE c.id = ANY (p_contact_ids)
       AND c.channel = 'instagram'
       AND NULLIF(c.external_id, '') IS NOT NULL
       AND (   c.profile_status IS NULL
            OR (c.profile_status = 'retry'   AND c.profile_checked_at < p_now - interval '6 hours')
            OR (c.profile_status = 'pending' AND c.profile_checked_at < p_now - interval '10 minutes'))
       -- A conexão atende: a mesma regra do cartão e da renovação.
       AND w.provider = 'instagram'
       AND COALESCE(w.is_active, true)
       AND public.instagram_parse_ts(w.connection_config ->> 'tokenExpiresAt') > p_now
       AND NOT COALESCE(
             (w.connection_config #>> '{renewal,status}') = 'needs_reconnect'
             AND (w.connection_config #>> '{renewal,forTokenIssuedAt}') = (w.connection_config ->> 'tokenIssuedAt'),
             false)
       FOR UPDATE OF c SKIP LOCKED
  ),
  marcados AS (
    UPDATE public.contacts c
       SET profile_status = 'pending',
           profile_checked_at = p_now
      FROM alvo
     WHERE c.id = alvo.id
    RETURNING c.id, alvo.external_id, alvo.inst_id, alvo.issued
  )
  SELECT m.id, m.external_id, m.inst_id, m.issued FROM marcados m;
END;
$function$;

COMMENT ON FUNCTION public.instagram_contact_profile_claim(uuid[], timestamptz) IS
  'Marca como pending os contatos de Instagram na hora de buscar o perfil (nunca tentado, retry há 6 h, pending esquecido há 10 min) cuja conexão atende, e devolve IGSID, instância e o tokenIssuedAt lido. SKIP LOCKED: duas chamadas ao mesmo tempo nunca pegam o mesmo contato. Só service_role.';

REVOKE ALL ON FUNCTION public.instagram_contact_profile_claim(uuid[], timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.instagram_contact_profile_claim(uuid[], timestamptz) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Gravar o resultado
-- ---------------------------------------------------------------------------
--   ok           grava o @ (sempre) e o nome (SÓ se o contato ainda não tem um
--                — nunca sobrescreve o que alguém digitou)
--   unavailable  bloqueou ou não deu consentimento: não tenta mais
--   retry        falha passageira: tenta de novo em 6 h
--   release      o problema é a conexão (acesso recusado): tira a marca, o
--                contato volta a estar na hora quando a conta for reconectada
CREATE OR REPLACE FUNCTION public.instagram_contact_profile_record(
  p_contact_id uuid,
  p_status     text,
  p_name       text,
  p_username   text,
  p_now        timestamptz DEFAULT now()
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user text := NULLIF(ltrim(btrim(COALESCE(p_username, '')), '@'), '');
  v_name text := NULLIF(btrim(COALESCE(p_name, '')), '');
  v_n    integer;
BEGIN
  IF p_status IS NULL OR p_status <> ALL (ARRAY['ok', 'unavailable', 'retry', 'release']) THEN
    RAISE EXCEPTION 'instagram_contact_profile_record: status inválido %', p_status;
  END IF;

  UPDATE public.contacts c
     SET profile_status = CASE p_status WHEN 'release' THEN NULL ELSE p_status END,
         profile_checked_at = CASE p_status WHEN 'release' THEN NULL ELSE p_now END,
         username = CASE WHEN p_status = 'ok' AND v_user IS NOT NULL THEN v_user ELSE c.username END,
         name = CASE WHEN p_status = 'ok' AND NULLIF(btrim(COALESCE(c.name, '')), '') IS NULL AND v_name IS NOT NULL
                     THEN v_name ELSE c.name END
   WHERE c.id = p_contact_id
     AND c.channel = 'instagram'
     AND c.profile_status = 'pending';
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN CASE WHEN v_n = 0 THEN 'not_pending' ELSE 'recorded' END;
END;
$function$;

COMMENT ON FUNCTION public.instagram_contact_profile_record(uuid, text, text, text, timestamptz) IS
  'Grava o resultado da busca do perfil do Instagram sobre uma marca pending: ok (@ sempre, nome só se vazio), unavailable, retry, release (volta a NULL). Só service_role.';

REVOKE ALL ON FUNCTION public.instagram_contact_profile_record(uuid, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.instagram_contact_profile_record(uuid, text, text, text, timestamptz) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Ledger
-- ---------------------------------------------------------------------------
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260925000001', 'instagram_contact_profile')
ON CONFLICT (version) DO NOTHING;

-- ===========================================================================
-- ROLLBACK (um comando só). Tire o front do ar antes (a lista pede as colunas).
-- ===========================================================================
-- DO $rb$
-- BEGIN
--   DROP FUNCTION IF EXISTS public.instagram_contact_profile_record(uuid, text, text, text, timestamptz);
--   DROP FUNCTION IF EXISTS public.instagram_contact_profile_claim(uuid[], timestamptz);
--   ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_profile_status_check;
--   ALTER TABLE public.contacts DROP COLUMN IF EXISTS profile_checked_at;
--   ALTER TABLE public.contacts DROP COLUMN IF EXISTS profile_status;
--   ALTER TABLE public.contacts DROP COLUMN IF EXISTS username;
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260925000001';
-- END
-- $rb$;
