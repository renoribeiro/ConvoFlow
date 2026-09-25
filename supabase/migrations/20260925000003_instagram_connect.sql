-- =============================================================================
-- 20260925000003_instagram_connect — fatia 4b do Instagram: conectar,
-- reconectar, desligar e religar uma conta do Instagram PELA TELA.
--
-- Até aqui a conta nascia por create_instagram_instance, no SQL Editor. Agora
-- o Gestor/Gerente clica em "Conectar Instagram", entra no Instagram (Business
-- Login com redirecionamento) e a edge function instagram-connect grava a
-- linha por estas funções.
--
-- ============================================================================
-- O QUE ESTA MIGRAÇÃO CRIA
-- ============================================================================
--
--   instagram_connect_stores   A chave POR LOJA que libera o botão. Só o
--                              superadmin liga/desliga (set_instagram_connect_enabled).
--                              Motivo: até a Meta conceder o acesso avançado, só
--                              contas com papel no app conseguem entrar; um
--                              cliente de verdade bateria num erro da Meta.
--                              Nasce ligada SÓ para a Loja Teste.
--   instagram_oauth_states     O "state" do login: aleatório (256 bits), preso
--                              ao usuário, à Loja de destino e (na reconexão) à
--                              instância; vale 10 minutos; uso único. Guardado
--                              como sha256 — o valor em si só existe na URL.
--
--   instagram_connect_enabled(uuid)                 a tela pergunta: mostro o botão?
--   set_instagram_connect_enabled(uuid, boolean)    superadmin liga/desliga a chave
--   instagram_connect_begin(uuid, uuid, text, text) cria o state (como o usuário)
--   instagram_connect_bounce(text)                  para onde devolver o navegador (servidor)
--   instagram_connect_claim(text, uuid)             confere e QUEIMA o state (servidor)
--   instagram_connect_check(uuid, uuid, text)       decide: conectar / reconectar / recusar (servidor)
--   instagram_connect_commit(uuid, uuid, text, text, text, integer)
--                                                   grava linha + token numa transação (servidor)
--   set_instagram_account_active(uuid, boolean)     desliga / religa (como o usuário)
--
-- E REESCREVE instagram_connection_alert_sweep SÓ no texto dos avisos: numa
-- Loja com a chave ligada o sino manda usar o botão Reconectar; nas outras, o
-- texto continua EXATAMENTE o de antes (escreva para contato@).
--
-- ============================================================================
-- A ORDEM DO LOGIN (a edge function instagram-connect segue esta ordem)
-- ============================================================================
--
--   1. begin  (como o usuário, JWT dele): capability, Loja, chave, alcance.
--      Devolve o state. A edge function monta a URL de autorização.
--   2. O navegador vai ao Instagram, que o devolve à PRÓPRIA edge function
--      (único endereço cadastrado na Meta, HTTPS, igual para produção e para
--      teste no localhost). Ela lê o return_to do state (bounce) e manda o
--      navegador de volta à tela com ?ig_code&ig_state.
--   3. claim  (service_role, com o user id do JWT validado): state existe, é
--      DESTE usuário, não expirou, não foi usado. Queima o state ANTES de
--      falar com a Meta — um state vale uma tentativa.
--   4. Meta: code → token curto → token longo → /me (user_id = igAccountId).
--   5. check  (service_role): decide com o igAccountId na mão.
--   6. Meta: subscribed_apps (só se o check aceitou).
--   7. commit (service_role): repete o check sob lock e grava.
--
-- POR QUE claim/check/commit SÃO SÓ DO SERVIDOR (diferente de
-- meta_signup_commit, que o usuário pode chamar): se o usuário pudesse chamar
-- o commit pelo PostgREST, gravaria QUALQUER igAccountId com QUALQUER token na
-- própria Loja, sem a Meta ter provado que a conta é dele — e travaria o dono
-- verdadeiro com "já conectada em outra Loja". Aqui só a edge function, que
-- acabou de ouvir a Meta, grava. Para as regras de acesso continuarem as
-- MESMAS do resto do sistema (has_capability, gerente_child_store_ids,
-- is_super_admin_safe — todas leem auth.uid()), as três funções assumem a
-- identidade do usuário do state DENTRO da transação (instagram_connect_act_as)
-- e devolvem a anterior no fim.
--
-- ============================================================================
-- A DECISÃO (instagram_connect_check), na ordem, parando na primeira que falha
-- ============================================================================
--
--   invalid_state     state inexistente, de outro usuário, não queimado, já
--                     gravado, ou queimado há mais de 15 minutos
--   forbidden         sem whatsapp.configure (atendente, perfil parado)
--   invalid           igAccountId não é só dígitos
--   forbidden_tenant  a Loja do state saiu do alcance do usuário
--   not_store         a Conta/Loja não é Loja (decisão do dono: só Loja)
--   not_enabled       a chave da Loja foi desligada no meio do caminho
--   ambiguous         o igAccountId casa com mais de uma linha
--   (reconexão pelo cartão — o state tem instance_id)
--     not_found       a instância sumiu ou mudou de Loja
--     wrong_account   entrou no Instagram com OUTRA conta (@b no cartão de @a)
--   (conectar — o state não tem instance_id)
--     foreign_account a conta já está em outra Conta ou Loja (não diz qual)
--     reconnect       a conta já está NESTA Loja: atualiza a linha no lugar
--     connect         conta nova: linha nova
--
-- RECONEXÃO NO LUGAR — o UPDATE toca SÓ em: status 'connected',
-- last_connected_at, updated_at, profile_name (se veio @), e em
-- connection_config: igAccountId, igUsername (se veio), tokenIssuedAt,
-- tokenExpiresAt, onboarding='instagram_login', e APAGA `renewal` (estado da
-- renovação zerado). Token no Vault NO LUGAR (set_instance_meta_token).
-- NÃO toca em: id, tenant_id, instance_key, name, is_active, created_at. Uma
-- conta desligada continua desligada depois de reconectar — religar é o outro
-- botão.
--
-- DESLIGAR = is_active false. Nada é apagado; mensagens que chegam enquanto
-- está desligada são descartadas pelo instagram-webhook (inactive_instance) e
-- não voltam. A renovação automática pula conta desligada.
--
-- RLS — as duas tabelas novas têm RLS ligada; instagram_connect_stores tem UMA
-- policy (SELECT para superadmin), instagram_oauth_states nenhuma. Nenhuma
-- policy de tabela existente muda.
--
-- Aplicação: este arquivo inteiro, de uma vez (MCP execute_sql ou SQL Editor).
-- Idempotente. NÃO rodar `supabase db push` neste projeto.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Guarda: a função de avisos em produção é a que este arquivo espera
--    (a reescrita abaixo parte dela; se alguém a mudou, pare e olhe).
-- -----------------------------------------------------------------------------
DO $pre$
DECLARE
  v_md5 text;
BEGIN
  IF to_regclass('public.instagram_connect_stores') IS NULL THEN
    SELECT md5(pg_get_functiondef('public.instagram_connection_alert_sweep(timestamptz,uuid)'::regprocedure))
      INTO v_md5;
    IF v_md5 IS DISTINCT FROM '78580cebd0d3f470b1263a77d5d7a33f' THEN
      RAISE EXCEPTION 'ABORTADO: instagram_connection_alert_sweep em produção não é a da migração 20260924000001 (md5 %). Nada foi feito.', v_md5;
    END IF;
  END IF;
END
$pre$;

-- -----------------------------------------------------------------------------
-- 1. Tabelas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.instagram_connect_stores (
  tenant_id   uuid        PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  enabled_by  uuid        NULL,
  enabled_at  timestamptz NOT NULL DEFAULT now(),
  note        text        NULL
);

COMMENT ON TABLE public.instagram_connect_stores IS
  'Fatia 4b do Instagram: Lojas em que o botão "Conectar Instagram" aparece e funciona. Linha presente = liberada. Só o superadmin escreve (set_instagram_connect_enabled); só o superadmin lê direto (policy); o app pergunta por instagram_connect_enabled.';

ALTER TABLE public.instagram_connect_stores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.instagram_connect_stores FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.instagram_connect_stores TO authenticated;

DROP POLICY IF EXISTS instagram_connect_stores_superadmin_select ON public.instagram_connect_stores;
CREATE POLICY instagram_connect_stores_superadmin_select
  ON public.instagram_connect_stores
  FOR SELECT TO authenticated
  USING ((SELECT public.is_super_admin_safe()));

CREATE TABLE IF NOT EXISTS public.instagram_oauth_states (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  state_hash    text        NOT NULL UNIQUE,
  user_id       uuid        NOT NULL,
  tenant_id     uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  instance_id   uuid        NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  redirect_uri  text        NOT NULL,
  return_to     text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  claimed_at    timestamptz NULL,
  committed_at  timestamptz NULL,
  outcome       text        NULL
);

COMMENT ON TABLE public.instagram_oauth_states IS
  'Fatia 4b do Instagram: o state do Business Login. state_hash = sha256 hex do valor aleatório que vai na URL. Preso a user_id, tenant_id (Loja de destino) e instance_id (reconexão pelo cartão). Vale 10 min, uso único (claimed_at). Só funções SECURITY DEFINER tocam.';

ALTER TABLE public.instagram_oauth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.instagram_oauth_states FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Helpers internos
-- -----------------------------------------------------------------------------

-- Assume a identidade p_user_id até o fim da transação (ou até restore) e
-- devolve a anterior. auth.uid() lê request.jwt.claim.sub e, sem ele,
-- request.jwt.claims->>'sub' — as duas são trocadas.
CREATE OR REPLACE FUNCTION public.instagram_connect_act_as(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path TO ''
AS $function$
DECLARE
  v_prev text := coalesce(current_setting('request.jwt.claims', true), '')
                 || chr(31) || coalesce(current_setting('request.jwt.claim.sub', true), '');
BEGIN
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_user_id::text, ''), true);
  RETURN v_prev;
END;
$function$;

CREATE OR REPLACE FUNCTION public.instagram_connect_restore(p_prev text)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SET search_path TO ''
AS $function$
BEGIN
  PERFORM set_config('request.jwt.claims', split_part(coalesce(p_prev, chr(31)), chr(31), 1), true);
  PERFORM set_config('request.jwt.claim.sub', split_part(coalesce(p_prev, chr(31)), chr(31), 2), true);
END;
$function$;

REVOKE ALL ON FUNCTION public.instagram_connect_act_as(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.instagram_connect_restore(text) FROM PUBLIC, anon, authenticated, service_role;

-- Quem chama alcança esta Conta/Loja? Mesma regra de meta_signup_check e de
-- decideInstanceAccess (supabase/functions/_shared/instance-access.ts):
-- superadmin ativo; a própria Conta/Loja; GERENTE ativo numa Loja filha DIRETA.
CREATE OR REPLACE FUNCTION public.instagram_connect_access(p_tenant_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN p_tenant_id IS NULL                                               THEN NULL
    WHEN NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id) THEN NULL
    WHEN public.is_super_admin_safe()                                      THEN 'superadmin'
    WHEN p_tenant_id = public.get_current_user_tenant_id()                 THEN 'own_tenant'
    WHEN p_tenant_id IN (SELECT public.gerente_child_store_ids())          THEN 'gerente_child_store'
    ELSE NULL
  END;
$function$;

REVOKE ALL ON FUNCTION public.instagram_connect_access(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- Recusa padronizada (mensagens em pt-BR, as mesmas que a tela mostra).
CREATE OR REPLACE FUNCTION public.instagram_connect_refuse(p_reason text, p_detail text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  SELECT jsonb_build_object('ok', false, 'reason', p_reason, 'message', CASE p_reason
    WHEN 'unauthenticated'  THEN 'Sessão inválida ou expirada. Entre de novo no ConvoFlow.'
    WHEN 'forbidden'        THEN 'Apenas Gestor ou Gerente pode conectar o Instagram.'
    WHEN 'not_found'        THEN 'Conta do Instagram não encontrada nesta Loja. Nada foi alterado.'
    WHEN 'tenant_required'  THEN 'Escolha a Loja em que o Instagram vai ser conectado.'
    WHEN 'forbidden_tenant' THEN 'Você não pode conectar o Instagram nesta Loja.'
    WHEN 'not_store'        THEN 'A conta do Instagram fica numa Loja, nunca na Conta. Escolha uma Loja no seletor e tente de novo.'
    WHEN 'not_enabled'      THEN 'A conexão do Instagram ainda não foi liberada para esta Loja. Fale com o suporte do ConvoFlow.'
    WHEN 'invalid_redirect' THEN 'Endereço de retorno inválido. Nada foi alterado.'
    WHEN 'invalid_state'    THEN 'Este pedido de conexão não é válido. Comece de novo pelo botão do Instagram. Nada foi alterado.'
    WHEN 'used_state'       THEN 'Este pedido de conexão já foi usado. Comece de novo pelo botão do Instagram. Nada foi alterado.'
    WHEN 'expired_state'    THEN 'O pedido de conexão expirou (vale 10 minutos). Comece de novo pelo botão do Instagram. Nada foi alterado.'
    WHEN 'invalid'          THEN 'O Instagram respondeu sem os dados da conta. Nada foi alterado. Tente de novo.'
    WHEN 'ambiguous'        THEN 'Esta conta do Instagram aparece em mais de um lugar. Nada foi alterado. Escreva para contato@convoflow.com.br.'
    WHEN 'foreign_account'  THEN 'Esta conta do Instagram já está conectada em outra Conta ou Loja. Nada foi alterado. Se ela é sua, escreva para contato@convoflow.com.br.'
    WHEN 'wrong_account'    THEN format('Você entrou no Instagram com outra conta. Este cartão é da conta %s: saia do Instagram neste navegador, entre com ela e clique em Reconectar de novo. Nada foi alterado.',
                                        coalesce(p_detail, 'que já estava conectada'))
    ELSE 'Não foi possível concluir. Nada foi alterado.'
  END);
$function$;

REVOKE ALL ON FUNCTION public.instagram_connect_refuse(text, text) FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. A chave por Loja
-- -----------------------------------------------------------------------------

-- A tela pergunta: mostro "Conectar/Reconectar"? true só se TUDO vale: sessão,
-- capability, alcance, é Loja, e a chave está ligada.
CREATE OR REPLACE FUNCTION public.instagram_connect_enabled(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND public.has_capability('whatsapp.configure')
     AND public.instagram_connect_access(p_tenant_id) IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id AND t.kind = 'store')
     AND EXISTS (SELECT 1 FROM public.instagram_connect_stores s WHERE s.tenant_id = p_tenant_id);
$function$;

REVOKE ALL ON FUNCTION public.instagram_connect_enabled(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.instagram_connect_enabled(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_instagram_connect_enabled(p_tenant_id uuid, p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_kind text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN public.instagram_connect_refuse('unauthenticated');
  END IF;
  IF NOT public.is_super_admin_safe() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden',
      'message', 'Só o superadmin libera a conexão do Instagram numa Loja.');
  END IF;

  SELECT t.kind INTO v_kind FROM public.tenants t WHERE t.id = p_tenant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found', 'message', 'Loja não encontrada.');
  END IF;
  IF v_kind IS DISTINCT FROM 'store' THEN
    RETURN public.instagram_connect_refuse('not_store');
  END IF;

  IF coalesce(p_enabled, false) THEN
    INSERT INTO public.instagram_connect_stores (tenant_id, enabled_by, enabled_at)
    VALUES (p_tenant_id, auth.uid(), now())
    ON CONFLICT (tenant_id) DO NOTHING;
  ELSE
    DELETE FROM public.instagram_connect_stores WHERE tenant_id = p_tenant_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'tenant_id', p_tenant_id, 'enabled', coalesce(p_enabled, false));
END;
$function$;

REVOKE ALL ON FUNCTION public.set_instagram_connect_enabled(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_instagram_connect_enabled(uuid, boolean) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. begin — cria o state (como o usuário)
-- -----------------------------------------------------------------------------
--   p_instance_id NULL  → conectar na Loja p_tenant_id
--   p_instance_id dado  → reconectar ESTE cartão; a Loja é a da instância
--                         (p_tenant_id é ignorado, como em meta_signup_check)
CREATE OR REPLACE FUNCTION public.instagram_connect_begin(
  p_tenant_id    uuid,
  p_instance_id  uuid,
  p_redirect_uri text,
  p_return_to    text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_tenant   uuid;
  v_inst     record;
  v_state    text;
  v_kind     text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN public.instagram_connect_refuse('unauthenticated');
  END IF;
  -- Capability antes de qualquer lookup: o atendente recebe a mesma resposta
  -- para qualquer Loja ou instância.
  IF NOT public.has_capability('whatsapp.configure') THEN
    RETURN public.instagram_connect_refuse('forbidden');
  END IF;

  IF p_instance_id IS NOT NULL THEN
    SELECT w.id, w.tenant_id, w.provider INTO v_inst
      FROM public.whatsapp_instances w WHERE w.id = p_instance_id;
    -- Inexistente, de outro provedor ou fora do alcance: a MESMA resposta.
    IF NOT FOUND OR v_inst.provider IS DISTINCT FROM 'instagram'
       OR public.instagram_connect_access(v_inst.tenant_id) IS NULL THEN
      RETURN public.instagram_connect_refuse('not_found');
    END IF;
    v_tenant := v_inst.tenant_id;
  ELSE
    IF p_tenant_id IS NULL THEN
      RETURN public.instagram_connect_refuse('tenant_required');
    END IF;
    -- Inexistente e fora do alcance: a MESMA resposta.
    IF public.instagram_connect_access(p_tenant_id) IS NULL THEN
      RETURN public.instagram_connect_refuse('forbidden_tenant');
    END IF;
    v_tenant := p_tenant_id;
  END IF;

  SELECT t.kind INTO v_kind FROM public.tenants t WHERE t.id = v_tenant;
  IF v_kind IS DISTINCT FROM 'store' THEN
    RETURN public.instagram_connect_refuse('not_store');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.instagram_connect_stores s WHERE s.tenant_id = v_tenant) THEN
    RETURN public.instagram_connect_refuse('not_enabled');
  END IF;

  -- A lista de endereços permitidos mora na edge function; aqui só a forma.
  IF p_redirect_uri IS NULL OR length(p_redirect_uri) > 300
     OR p_redirect_uri !~ '^https://[^[:space:]#?]+$'
     OR p_return_to IS NULL OR length(p_return_to) > 300
     OR p_return_to !~ '^https?://[^[:space:]#?]+$' THEN
    RETURN public.instagram_connect_refuse('invalid_redirect');
  END IF;

  -- Faxina: states velhos não servem para nada.
  DELETE FROM public.instagram_oauth_states WHERE expires_at < now() - interval '1 day';

  v_state := encode(extensions.gen_random_bytes(32), 'hex');

  INSERT INTO public.instagram_oauth_states (state_hash, user_id, tenant_id, instance_id, redirect_uri, return_to, expires_at)
  VALUES (encode(sha256(convert_to(v_state, 'UTF8')), 'hex'), auth.uid(), v_tenant, p_instance_id,
          p_redirect_uri, p_return_to, now() + interval '10 minutes');

  RETURN jsonb_build_object(
    'ok', true,
    'state', v_state,
    'mode', CASE WHEN p_instance_id IS NULL THEN 'connect' ELSE 'reconnect' END,
    'tenant_id', v_tenant,
    'instance_id', p_instance_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.instagram_connect_begin(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.instagram_connect_begin(uuid, uuid, text, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. claim — confere e QUEIMA o state (só o servidor)
-- -----------------------------------------------------------------------------
-- p_user_id é o usuário do JWT que a edge function acabou de validar. O state
-- de outro usuário tem a MESMA resposta que um state inventado.
CREATE OR REPLACE FUNCTION public.instagram_connect_claim(p_state text, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_row record;
BEGIN
  IF p_user_id IS NULL OR p_state IS NULL OR p_state !~ '^[0-9a-f]{64}$' THEN
    RETURN public.instagram_connect_refuse('invalid_state');
  END IF;

  SELECT s.* INTO v_row
    FROM public.instagram_oauth_states s
   WHERE s.state_hash = encode(sha256(convert_to(p_state, 'UTF8')), 'hex')  -- [state-confere]
     FOR UPDATE;

  IF NOT FOUND OR v_row.user_id IS DISTINCT FROM p_user_id THEN
    RETURN public.instagram_connect_refuse('invalid_state');
  END IF;
  IF v_row.claimed_at IS NOT NULL THEN
    RETURN public.instagram_connect_refuse('used_state');
  END IF;
  IF v_row.expires_at <= now() THEN
    UPDATE public.instagram_oauth_states SET claimed_at = now(), outcome = 'expired_state' WHERE id = v_row.id;
    RETURN public.instagram_connect_refuse('expired_state');
  END IF;

  UPDATE public.instagram_oauth_states SET claimed_at = now() WHERE id = v_row.id;

  RETURN jsonb_build_object(
    'ok', true,
    'state_id', v_row.id,
    'tenant_id', v_row.tenant_id,
    'instance_id', v_row.instance_id,
    'redirect_uri', v_row.redirect_uri,
    'mode', CASE WHEN v_row.instance_id IS NULL THEN 'connect' ELSE 'reconnect' END);
END;
$function$;

REVOKE ALL ON FUNCTION public.instagram_connect_claim(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.instagram_connect_claim(text, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 5b. bounce — para onde devolver o navegador (só o servidor)
-- -----------------------------------------------------------------------------
-- O Instagram volta para a EDGE FUNCTION (o único endereço cadastrado na
-- Meta). Ela pergunta aqui para onde mandar o navegador: o return_to gravado
-- no begin — nunca um endereço vindo da URL. State desconhecido, vencido ou
-- já usado = NULL, e a edge function mostra uma página de erro em vez de
-- redirecionar (nada de redirecionamento aberto). Só lê; não queima o state:
-- quem queima é o claim, com a sessão do usuário.
CREATE OR REPLACE FUNCTION public.instagram_connect_bounce(p_state text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT s.return_to
    FROM public.instagram_oauth_states s
   WHERE p_state ~ '^[0-9a-f]{64}$'
     AND s.state_hash = encode(sha256(convert_to(p_state, 'UTF8')), 'hex')
     AND s.claimed_at IS NULL
     AND s.expires_at > now();
$function$;

REVOKE ALL ON FUNCTION public.instagram_connect_bounce(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.instagram_connect_bounce(text) TO service_role;

-- -----------------------------------------------------------------------------
-- 6. check — a decisão, com o igAccountId na mão (só o servidor)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.instagram_connect_check(
  p_state_id      uuid,
  p_user_id       uuid,
  p_ig_account_id text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_state   record;
  v_prev    text;
  v_access  text;
  v_kind    text;
  v_n       int;
  v_other_id       uuid;
  v_other_tenant   uuid;
  v_other_provider text;
  v_target  record;
  v_igid    text := nullif(btrim(coalesce(p_ig_account_id, '')), '');
  v_result  jsonb;
BEGIN
  SELECT s.* INTO v_state FROM public.instagram_oauth_states s WHERE s.id = p_state_id;
  IF NOT FOUND
     OR p_user_id IS NULL
     OR v_state.user_id IS DISTINCT FROM p_user_id
     OR v_state.claimed_at IS NULL
     OR v_state.committed_at IS NOT NULL
     OR v_state.outcome IS NOT NULL
     OR v_state.claimed_at < now() - interval '15 minutes' THEN
    RETURN public.instagram_connect_refuse('invalid_state');
  END IF;

  v_prev := public.instagram_connect_act_as(p_user_id);

  <<decide>>
  BEGIN
    IF NOT public.has_capability('whatsapp.configure') THEN
      v_result := public.instagram_connect_refuse('forbidden'); EXIT decide;
    END IF;
    IF v_igid IS NULL OR v_igid !~ '^[0-9]{5,30}$' THEN
      v_result := public.instagram_connect_refuse('invalid'); EXIT decide;
    END IF;

    v_access := public.instagram_connect_access(v_state.tenant_id);
    IF v_access IS NULL THEN
      v_result := public.instagram_connect_refuse('forbidden_tenant'); EXIT decide;
    END IF;

    SELECT t.kind INTO v_kind FROM public.tenants t WHERE t.id = v_state.tenant_id;
    IF v_kind IS DISTINCT FROM 'store' THEN
      v_result := public.instagram_connect_refuse('not_store'); EXIT decide;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.instagram_connect_stores s WHERE s.tenant_id = v_state.tenant_id) THEN
      v_result := public.instagram_connect_refuse('not_enabled'); EXIT decide;
    END IF;

    -- Linhas que já são desta conta: pela config (índice único) OU pela chave.
    SELECT count(*) INTO v_n
      FROM public.whatsapp_instances w
     WHERE w.connection_config ->> 'igAccountId' = v_igid
        OR w.instance_key = 'instagram_' || v_igid;
    IF v_n > 1 THEN
      v_result := public.instagram_connect_refuse('ambiguous'); EXIT decide;
    END IF;

    SELECT w.id, w.tenant_id, w.provider INTO v_other_id, v_other_tenant, v_other_provider
      FROM public.whatsapp_instances w
     WHERE w.connection_config ->> 'igAccountId' = v_igid
        OR w.instance_key = 'instagram_' || v_igid;
    -- (v_other_id IS NULL quando não há linha)

    IF v_state.instance_id IS NOT NULL THEN
      -- ======================= RECONEXÃO PELO CARTÃO =======================
      SELECT w.id, w.tenant_id, w.provider, w.profile_name,
             w.connection_config ->> 'igAccountId' AS ig_id,
             w.connection_config ->> 'igUsername'  AS ig_user
        INTO v_target
        FROM public.whatsapp_instances w WHERE w.id = v_state.instance_id;
      IF NOT FOUND OR v_target.provider IS DISTINCT FROM 'instagram'
         OR v_target.tenant_id IS DISTINCT FROM v_state.tenant_id THEN
        v_result := public.instagram_connect_refuse('not_found'); EXIT decide;
      END IF;
      IF v_target.ig_id IS DISTINCT FROM v_igid THEN
        v_result := public.instagram_connect_refuse('wrong_account',
          CASE WHEN nullif(v_target.ig_user, '') IS NOT NULL THEN '@' || v_target.ig_user
               ELSE nullif(v_target.profile_name, '') END);
        EXIT decide;
      END IF;
      v_result := jsonb_build_object('ok', true, 'mode', 'reconnect', 'access', v_access,
                                     'tenant_id', v_state.tenant_id, 'instance_id', v_target.id);
      EXIT decide;
    END IF;

    -- =========================== CONECTAR ===========================
    IF v_other_id IS NULL THEN
      v_result := jsonb_build_object('ok', true, 'mode', 'connect', 'access', v_access,
                                     'tenant_id', v_state.tenant_id, 'instance_id', NULL);
    ELSIF v_other_tenant = v_state.tenant_id AND v_other_provider = 'instagram' THEN
      -- A conta já é desta Loja: reconectar no lugar, mesmo sem ter clicado no cartão.
      v_result := jsonb_build_object('ok', true, 'mode', 'reconnect', 'access', v_access,
                                     'tenant_id', v_state.tenant_id, 'instance_id', v_other_id);
    ELSE
      -- Não diz de quem é. Nem se é Conta ou Loja.
      v_result := public.instagram_connect_refuse('foreign_account');
    END IF;
  END decide;

  PERFORM public.instagram_connect_restore(v_prev);
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.instagram_connect_check(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.instagram_connect_check(uuid, uuid, text) TO service_role;

-- -----------------------------------------------------------------------------
-- 7. commit — linha + token numa transação (só o servidor)
-- -----------------------------------------------------------------------------
-- p_expires_in em segundos, da troca pelo token longo. Sem ele (ou fora de
-- 1 s..400 dias), a validade é 60 dias a partir de agora — a duração que a
-- Meta documenta para o token longo e a mesma de create_instagram_instance.
CREATE OR REPLACE FUNCTION public.instagram_connect_commit(
  p_state_id      uuid,
  p_user_id       uuid,
  p_ig_account_id text,
  p_username      text,
  p_token         text,
  p_expires_in    integer
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_igid    text := nullif(btrim(coalesce(p_ig_account_id, '')), '');
  v_user    text := nullif(ltrim(btrim(coalesce(p_username, '')), '@'), '');
  v_check   jsonb;
  v_id      uuid;
  v_now     timestamptz := now();
  v_exp     timestamptz;
  v_row     record;
BEGIN
  IF nullif(btrim(coalesce(p_token, '')), '') IS NULL THEN
    RETURN public.instagram_connect_refuse('invalid');
  END IF;
  IF v_user IS NOT NULL AND v_user !~ '^[A-Za-z0-9._]{1,30}$' THEN
    v_user := NULL;  -- @ ilegível: fica sem, não inventa
  END IF;

  -- Locks ANTES de decidir: o state (ninguém grava duas vezes) e as linhas
  -- desta conta (ninguém as altera nem apaga até o fim).
  PERFORM 1 FROM public.instagram_oauth_states s WHERE s.id = p_state_id FOR UPDATE;
  IF v_igid IS NOT NULL THEN
    PERFORM 1 FROM public.whatsapp_instances w
      WHERE w.connection_config ->> 'igAccountId' = v_igid OR w.instance_key = 'instagram_' || v_igid
      FOR UPDATE;
  END IF;
  PERFORM 1 FROM public.whatsapp_instances w
    WHERE w.id = (SELECT s.instance_id FROM public.instagram_oauth_states s WHERE s.id = p_state_id)
    FOR UPDATE;

  v_check := public.instagram_connect_check(p_state_id, p_user_id, v_igid);
  IF NOT (v_check ->> 'ok')::boolean THEN
    -- Recusa definitiva deste state (ele não serve para outra tentativa).
    UPDATE public.instagram_oauth_states SET outcome = v_check ->> 'reason'
     WHERE id = p_state_id AND committed_at IS NULL AND outcome IS NULL;
    RETURN v_check;
  END IF;

  v_exp := CASE WHEN p_expires_in IS NOT NULL AND p_expires_in > 0 AND p_expires_in <= 400 * 86400
                THEN v_now + make_interval(secs => p_expires_in)
                ELSE v_now + interval '60 days' END;

  IF v_check ->> 'mode' = 'reconnect' THEN
    v_id := (v_check ->> 'instance_id')::uuid;
    UPDATE public.whatsapp_instances
       SET status            = 'connected',
           last_connected_at = v_now,
           updated_at        = v_now,
           profile_name      = CASE WHEN v_user IS NULL THEN profile_name ELSE '@' || v_user END,
           connection_config = (coalesce(connection_config, '{}'::jsonb) - 'renewal')
                               || jsonb_build_object(
                                    'igAccountId',    v_igid,
                                    'tokenIssuedAt',  to_jsonb(v_now),
                                    'tokenExpiresAt', to_jsonb(v_exp),
                                    'onboarding',     'instagram_login')
                               || CASE WHEN v_user IS NULL THEN '{}'::jsonb
                                       ELSE jsonb_build_object('igUsername', v_user) END
     WHERE id = v_id;
  ELSE
    INSERT INTO public.whatsapp_instances (
      tenant_id, name, instance_key, provider, status, is_active,
      profile_name, last_connected_at, connection_config
    ) VALUES (
      (v_check ->> 'tenant_id')::uuid,
      CASE WHEN v_user IS NULL THEN 'Instagram' ELSE 'Instagram @' || v_user END,
      'instagram_' || v_igid, 'instagram', 'connected', true,
      CASE WHEN v_user IS NULL THEN NULL ELSE '@' || v_user END,
      v_now,
      jsonb_build_object(
        'igAccountId',    v_igid,
        'igUsername',     v_user,
        'tokenIssuedAt',  to_jsonb(v_now),
        'tokenExpiresAt', to_jsonb(v_exp),
        'onboarding',     'instagram_login')
    )
    RETURNING id INTO v_id;
  END IF;

  -- Cria o segredo na primeira conexão, atualiza NO LUGAR na reconexão.
  PERFORM public.set_instance_meta_token(v_id, btrim(p_token));

  UPDATE public.instagram_oauth_states
     SET committed_at = v_now, outcome = v_check ->> 'mode'
   WHERE id = p_state_id;

  SELECT w.id, w.tenant_id, w.name, w.profile_name, w.is_active,
         w.connection_config ->> 'tokenExpiresAt' AS valid_until
    INTO v_row FROM public.whatsapp_instances w WHERE w.id = v_id;

  RETURN jsonb_build_object(
    'ok', true,
    'mode', v_check ->> 'mode',
    'access', v_check ->> 'access',
    'instance', jsonb_build_object(
      'id', v_row.id, 'tenant_id', v_row.tenant_id, 'name', v_row.name,
      'profile_name', v_row.profile_name, 'is_active', v_row.is_active,
      'valid_until', v_row.valid_until),
    'expiry_from_meta', p_expires_in IS NOT NULL AND p_expires_in > 0 AND p_expires_in <= 400 * 86400);
END;
$function$;

REVOKE ALL ON FUNCTION public.instagram_connect_commit(uuid, uuid, text, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.instagram_connect_commit(uuid, uuid, text, text, text, integer) TO service_role;

-- -----------------------------------------------------------------------------
-- 8. Desligar / religar (como o usuário)
-- -----------------------------------------------------------------------------
-- Não depende da chave da Loja: desligar tem que funcionar sempre. Quem pode:
-- a mesma regra de conectar (capability + alcance, gerente na Loja filha).
CREATE OR REPLACE FUNCTION public.set_instagram_account_active(p_instance_id uuid, p_active boolean)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_inst record;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN public.instagram_connect_refuse('unauthenticated');
  END IF;
  IF NOT public.has_capability('whatsapp.configure') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden',
      'message', 'Apenas Gestor ou Gerente pode desligar ou religar o Instagram.');
  END IF;
  IF p_active IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid', 'message', 'Pedido inválido.');
  END IF;

  SELECT w.id, w.tenant_id, w.provider, w.is_active INTO v_inst
    FROM public.whatsapp_instances w WHERE w.id = p_instance_id FOR UPDATE;
  IF NOT FOUND OR v_inst.provider IS DISTINCT FROM 'instagram'
     OR public.instagram_connect_access(v_inst.tenant_id) IS NULL THEN
    RETURN public.instagram_connect_refuse('not_found');
  END IF;

  UPDATE public.whatsapp_instances
     SET is_active = p_active, updated_at = now()
   WHERE id = p_instance_id AND is_active IS DISTINCT FROM p_active;

  RETURN jsonb_build_object('ok', true, 'instance_id', p_instance_id, 'is_active', p_active,
                            'changed', coalesce(v_inst.is_active, true) IS DISTINCT FROM p_active);
END;
$function$;

REVOKE ALL ON FUNCTION public.set_instagram_account_active(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_instagram_account_active(uuid, boolean) TO authenticated;

-- -----------------------------------------------------------------------------
-- 9. Avisos do sino: com a chave ligada, o texto aponta para o botão
-- -----------------------------------------------------------------------------
-- Corpo = o da migração 20260924000001, exceto: v_reconnect / v_persist e os
-- três textos que os usam. Sem a chave, cada texto sai IGUAL ao de antes.
CREATE OR REPLACE FUNCTION public.instagram_connection_alert_sweep(
  p_now         timestamptz DEFAULT now(),
  p_instance_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  r           record;
  v_exp       timestamptz;
  v_ren       jsonb;
  v_milestone text;
  v_due       boolean;
  v_n         integer;
  v_label     text;
  v_when      text;
  v_title     text;
  v_msg       text;
  v_type      text;
  v_button    boolean;
  v_reconnect text;
  v_persist   text;
  v_alerts    integer := 0;
  v_notifs    integer := 0;
  v_errors    integer := 0;
BEGIN
  FOR r IN
    SELECT w.id, w.tenant_id, w.name, w.profile_name,
           COALESCE(w.connection_config, '{}'::jsonb) AS cfg
      FROM public.whatsapp_instances w
     WHERE w.provider = 'instagram'
       AND COALESCE(w.is_active, true)
       AND (p_instance_id IS NULL OR w.id = p_instance_id)
     ORDER BY w.id
  LOOP
    BEGIN
      v_exp := public.instagram_parse_ts(r.cfg ->> 'tokenExpiresAt');
      CONTINUE WHEN v_exp IS NULL;

      v_ren   := r.cfg -> 'renewal';
      v_label := COALESCE(NULLIF(btrim(r.profile_name), ''), r.name);
      v_when  := to_char(v_exp AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI');

      -- Fatia 4b: a Loja com a chave ligada tem o botão Reconectar no cartão.
      v_button := EXISTS (SELECT 1 FROM public.instagram_connect_stores s WHERE s.tenant_id = r.tenant_id);
      v_reconnect := CASE WHEN v_button
        THEN 'Para reconectar, abra Instâncias e APIs e clique em Reconectar no cartão da conta.'
        ELSE 'Para reconectar, escreva para contato@convoflow.com.br.' END;
      v_persist := CASE WHEN v_button
        THEN 'Se este aviso continuar, reconecte a conta em Instâncias e APIs, pelo botão Reconectar no cartão dela.'
        ELSE 'Se este aviso continuar, escreva para contato@convoflow.com.br para reconectar a conta.' END;

      FOREACH v_milestone IN ARRAY ARRAY['needs_reconnect', 'expiring_7d', 'expired'] LOOP
        v_due := CASE v_milestone
          WHEN 'needs_reconnect' THEN
                 COALESCE(v_ren ->> 'status' = 'needs_reconnect'
                          AND (v_ren ->> 'forTokenIssuedAt') = (r.cfg ->> 'tokenIssuedAt'), false)
          WHEN 'expiring_7d' THEN p_now >= v_exp - interval '7 days' AND p_now < v_exp
          WHEN 'expired'     THEN p_now >= v_exp
        END;
        CONTINUE WHEN NOT v_due;

        INSERT INTO public.instagram_connection_alerts (instance_id, milestone, token_expires_at, tenant_id)
        VALUES (r.id, v_milestone, v_exp, r.tenant_id)
        ON CONFLICT (instance_id, milestone, token_expires_at) DO NOTHING;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        CONTINUE WHEN v_n = 0; -- [uma-vez-por-marco] este aviso já saiu

        CASE v_milestone
          WHEN 'needs_reconnect' THEN
            v_type  := 'error';
            v_title := 'O Instagram precisa ser reconectado';
            v_msg   := format(
              'O ConvoFlow não conseguiu renovar a conexão do Instagram %s. %sA conexão vale até %s; depois disso, as respostas pelo Instagram param. %s',
              v_label,
              COALESCE(NULLIF(btrim(v_ren ->> 'message'), '') || ' ', ''),
              v_when,
              v_reconnect);
          WHEN 'expiring_7d' THEN
            v_type  := 'warning';
            v_title := 'A conexão do Instagram vai vencer';
            v_msg   := format(
              'A conexão do Instagram %s vale até %s. O ConvoFlow tenta renovar sozinho todo dia, mas ainda não conseguiu. Se vencer, as respostas pelo Instagram param. %s',
              v_label, v_when, v_persist);
          ELSE
            v_type  := 'error';
            v_title := 'A conexão do Instagram venceu';
            v_msg   := format(
              'A conexão do Instagram %s venceu em %s. As respostas pelo Instagram estão paradas até a conta ser reconectada. %s',
              v_label, v_when, v_reconnect);
        END CASE;

        INSERT INTO public.notifications (tenant_id, user_id, title, message, type, action_url, action_label, metadata)
        SELECT r.tenant_id, u.uid, v_title, v_msg, v_type,
               '/dashboard/whatsapp-numbers', 'Ver conexão',
               jsonb_build_object('kind', 'instagram_connection', 'milestone', v_milestone,
                                  'instance_id', r.id, 'valid_until', v_exp)
          FROM public.response_rule_admin_user_ids(r.tenant_id) AS u(uid);
        GET DIAGNOSTICS v_n = ROW_COUNT;

        UPDATE public.instagram_connection_alerts
           SET recipients = v_n
         WHERE instance_id = r.id AND milestone = v_milestone AND token_expires_at = v_exp;

        v_alerts := v_alerts + 1;
        v_notifs := v_notifs + v_n;
      END LOOP;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
      RAISE WARNING 'instagram_connection_alert_sweep(instância %) falhou: % [%]', r.id, SQLERRM, SQLSTATE;
    END;
  END LOOP;

  RETURN jsonb_build_object('alerts', v_alerts, 'notifications', v_notifs, 'errors', v_errors);
END;
$function$;

COMMENT ON FUNCTION public.instagram_connection_alert_sweep(timestamptz, uuid) IS
  'Avisos do sino sobre a conexão do Instagram: needs_reconnect, expiring_7d (7 dias antes) e expired. Uma vez por (instância, marco, validade) — a chave primária de instagram_connection_alerts é a regra. Destinatários: response_rule_admin_user_ids (Gerente e Gestor). Texto: botão Reconectar se a Loja tem a chave da fatia 4b; senão, contato@. Só service_role.';

REVOKE ALL ON FUNCTION public.instagram_connection_alert_sweep(timestamptz, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.instagram_connection_alert_sweep(timestamptz, uuid) TO service_role;

COMMENT ON FUNCTION public.instagram_connect_begin(uuid, uuid, text, text) IS
  'Fatia 4b: cria o state do Business Login (10 min, uso único) para conectar na Loja p_tenant_id ou reconectar a instância p_instance_id. Recusa sem capability, fora do alcance, fora de Loja ou com a chave da Loja desligada.';
COMMENT ON FUNCTION public.instagram_connect_claim(text, uuid) IS
  'Fatia 4b: confere o state (existe, é deste usuário, não expirou, não foi usado) e o queima. Só service_role.';
COMMENT ON FUNCTION public.instagram_connect_check(uuid, uuid, text) IS
  'Fatia 4b: com o igAccountId vindo do /me, decide connect / reconnect / recusa (foreign_account, wrong_account, ...). Assume a identidade do usuário do state para usar as regras de acesso de sempre. Só service_role.';
COMMENT ON FUNCTION public.instagram_connect_commit(uuid, uuid, text, text, text, integer) IS
  'Fatia 4b: repete o check sob lock e grava — UPDATE no lugar (reconexão, renovação zerada) ou INSERT — e o token no Vault, numa transação. Só service_role.';
COMMENT ON FUNCTION public.set_instagram_account_active(uuid, boolean) IS
  'Fatia 4b: desliga/religa uma conta do Instagram (is_active). Nada é apagado; mensagens recebidas desligada são descartadas pelo webhook. Mesma regra de acesso de conectar, sem depender da chave da Loja.';
COMMENT ON FUNCTION public.instagram_connect_enabled(uuid) IS
  'Fatia 4b: a tela pergunta se mostra Conectar/Reconectar. true só com sessão, whatsapp.configure, alcance, Loja e a chave ligada.';
COMMENT ON FUNCTION public.set_instagram_connect_enabled(uuid, boolean) IS
  'Fatia 4b: o superadmin liga/desliga a conexão do Instagram numa Loja (Administração > Configurações).';

-- -----------------------------------------------------------------------------
-- 10. Loja Teste liberada + conferência + ledger — um comando só
-- -----------------------------------------------------------------------------
DO $mig$
DECLARE
  ENCAIXA    constant uuid := '2165be9f-b6bb-49fb-ba6a-1dec6840c45a';
  LOJA_TESTE constant uuid := 'e6a88a32-5deb-4aa1-b246-05a512882388';
  v_n        int;
  v_inst     text;
  v_inst2    text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  SELECT md5(string_agg(w::text, '|' ORDER BY w.id)) INTO v_inst FROM public.whatsapp_instances w;

  -- A Loja Teste é a Loja da conta de teste do Instagram. Confere que é ela.
  IF NOT EXISTS (SELECT 1 FROM public.tenants t
                  WHERE t.id = LOJA_TESTE AND t.kind = 'store' AND t.name = 'Loja Teste') THEN
    RAISE EXCEPTION 'ABORTADO: % não é a Loja Teste (kind store). Nada foi feito.', LOJA_TESTE;
  END IF;
  INSERT INTO public.instagram_connect_stores (tenant_id, enabled_by, note)
  VALUES (LOJA_TESTE, NULL, 'Liberada pela migração 20260925000003 (fatia 4b)')
  ON CONFLICT (tenant_id) DO NOTHING;

  -- Só a Loja Teste liberada; a EncaixaRH, não.
  SELECT count(*) INTO v_n FROM public.instagram_connect_stores;
  IF v_n <> 1 OR EXISTS (SELECT 1 FROM public.instagram_connect_stores WHERE tenant_id = ENCAIXA) THEN
    RAISE EXCEPTION 'ABORTADO: instagram_connect_stores deveria ter só a Loja Teste (tem %).', v_n;
  END IF;

  -- Nenhuma instância tocada.
  SELECT md5(string_agg(w::text, '|' ORDER BY w.id)) INTO v_inst2 FROM public.whatsapp_instances w;
  IF v_inst2 IS DISTINCT FROM v_inst THEN
    RAISE EXCEPTION 'ABORTADO: alguma linha de whatsapp_instances mudou.';
  END IF;

  -- whatsapp_instances continua com as 6 policies de sempre.
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname = 'public' AND tablename = 'whatsapp_instances';
  IF v_n <> 6 THEN
    RAISE EXCEPTION 'ABORTADO: whatsapp_instances deveria ter 6 policies, tem %.', v_n;
  END IF;

  -- Permissões: o que é do servidor não é do app.
  SELECT count(*) INTO v_n FROM (VALUES
      ('public.instagram_connect_claim(text,uuid)'),
      ('public.instagram_connect_bounce(text)'),
      ('public.instagram_connect_check(uuid,uuid,text)'),
      ('public.instagram_connect_commit(uuid,uuid,text,text,text,integer)'),
      ('public.instagram_connect_act_as(uuid)'),
      ('public.instagram_connect_restore(text)'),
      ('public.instagram_connect_access(uuid)'),
      ('public.instagram_connect_refuse(text,text)'),
      ('public.instagram_connection_alert_sweep(timestamptz,uuid)')
    ) f(sig)
   WHERE has_function_privilege('anon', f.sig, 'EXECUTE')
      OR has_function_privilege('authenticated', f.sig, 'EXECUTE');
  IF v_n > 0 THEN
    RAISE EXCEPTION 'ABORTADO: % função(ões) de servidor executável(is) por anon/authenticated.', v_n;
  END IF;
  IF has_function_privilege('service_role', 'public.instagram_connect_act_as(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ABORTADO: instagram_connect_act_as executável por service_role.';
  END IF;
  SELECT count(*) INTO v_n FROM (VALUES
      ('public.instagram_connect_enabled(uuid)'),
      ('public.set_instagram_connect_enabled(uuid,boolean)'),
      ('public.instagram_connect_begin(uuid,uuid,text,text)'),
      ('public.set_instagram_account_active(uuid,boolean)')
    ) f(sig)
   WHERE NOT has_function_privilege('authenticated', f.sig, 'EXECUTE')
      OR has_function_privilege('anon', f.sig, 'EXECUTE');
  IF v_n > 0 THEN
    RAISE EXCEPTION 'ABORTADO: % RPC(s) do app sem EXECUTE para authenticated (ou com anon).', v_n;
  END IF;
  IF has_table_privilege('authenticated', 'public.instagram_oauth_states', 'SELECT')
  OR has_table_privilege('anon', 'public.instagram_oauth_states', 'SELECT')
  OR has_table_privilege('authenticated', 'public.instagram_connect_stores', 'INSERT')
  OR has_table_privilege('authenticated', 'public.instagram_connect_stores', 'DELETE')
  OR has_table_privilege('anon', 'public.instagram_connect_stores', 'SELECT') THEN
    RAISE EXCEPTION 'ABORTADO: tabela nova com permissão direta demais.';
  END IF;

  -- A sabotagem da suíte da renovação ancora nesta linha: tem que existir UMA vez.
  SELECT (length(d) - length(replace(d, 'CONTINUE WHEN v_n = 0; -- [uma-vez-por-marco]', '')))
         / length('CONTINUE WHEN v_n = 0; -- [uma-vez-por-marco]')
    INTO v_n
    FROM (SELECT pg_get_functiondef('public.instagram_connection_alert_sweep(timestamptz,uuid)'::regprocedure) AS d) x;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'ABORTADO: âncora da sabotagem da renovação aparece % vez(es).', v_n;
  END IF;

  INSERT INTO supabase_migrations.schema_migrations (version, name)
  VALUES ('20260925000003', 'instagram_connect')
  ON CONFLICT (version) DO NOTHING;

  RAISE NOTICE 'OK: fatia 4b — 2 tabelas, 12 funções, avisos com o botão; Loja Teste liberada; instâncias e policies de whatsapp_instances intocadas.';
END
$mig$;

-- =============================================================================
-- ROLLBACK (um comando só). A tela e a edge function nova param de funcionar
-- (o botão some porque instagram_connect_enabled deixa de existir → erro →
-- escondido). Contas já conectadas continuam como estão.
-- =============================================================================
-- DO $rb$
-- BEGIN
--   DROP FUNCTION IF EXISTS public.set_instagram_account_active(uuid, boolean);
--   DROP FUNCTION IF EXISTS public.instagram_connect_commit(uuid, uuid, text, text, text, integer);
--   DROP FUNCTION IF EXISTS public.instagram_connect_check(uuid, uuid, text);
--   DROP FUNCTION IF EXISTS public.instagram_connect_bounce(text);
--   DROP FUNCTION IF EXISTS public.instagram_connect_claim(text, uuid);
--   DROP FUNCTION IF EXISTS public.instagram_connect_begin(uuid, uuid, text, text);
--   DROP FUNCTION IF EXISTS public.set_instagram_connect_enabled(uuid, boolean);
--   DROP FUNCTION IF EXISTS public.instagram_connect_enabled(uuid);
--   DROP FUNCTION IF EXISTS public.instagram_connect_refuse(text, text);
--   DROP FUNCTION IF EXISTS public.instagram_connect_access(uuid);
--   DROP FUNCTION IF EXISTS public.instagram_connect_restore(text);
--   DROP FUNCTION IF EXISTS public.instagram_connect_act_as(uuid);
--   -- instagram_connection_alert_sweep: recriar pelo corpo da 20260924000001
--   -- (os textos voltam a mandar escrever para contato@) ANTES de apagar a tabela.
--   DROP TABLE IF EXISTS public.instagram_oauth_states;
--   DROP TABLE IF EXISTS public.instagram_connect_stores;
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260925000003';
-- END
-- $rb$;
