-- =============================================================================
-- 20260919000002_meta_signup_reconnect_rpc
--
-- Embedded Signup (edge function meta-oauth-exchange) passa a RECONHECER um
-- número que já existe e a atualizar a linha dele no lugar, mantendo o id da
-- instância. A gravação (linha + token no Vault) vira UMA transação no banco.
--
-- O DEFEITO (medido em 2026-09-19)
--   meta-oauth-exchange sempre fazia INSERT. Quem reconectava um número já
--   cadastrado batia em `whatsapp_instances_instance_key_key` (UNIQUE global)
--   — DEPOIS de o código de autorização (uso único) ter sido consumido e de o
--   app novo já estar inscrito na WABA. Nada era salvo, e não dava para tentar
--   de novo sem rodar o diálogo inteiro. Para a EncaixaRH isso é 163 conversas,
--   2.622 mensagens, 163 contatos, 1 chatbot e 155 sessões apontando para o id
--   que um "excluir e criar de novo" perderia.
--
-- O QUE MUDA
--   Duas funções SECURITY DEFINER:
--
--     meta_signup_check(text, uuid)          -> jsonb   (interna, só leitura)
--     meta_signup_commit(text, uuid, ...)    -> jsonb   (a gravação)
--
--   A checagem decide, nesta ordem, e para na primeira que falha:
--
--     unauthenticated    sem auth.uid()
--     forbidden          sem whatsapp.configure (atendente, perfil inativo)
--     invalid            phoneNumberId vazio / não numérico
--     ambiguous          instance_key e connection_config.phoneNumberId apontam
--                        para linhas DIFERENTES — recusa, não adivinha
--     provider_mismatch  o identificador já é de instância Evolution/WAHA
--     foreign_instance   a linha existe mas o chamador não a alcança
--                        (mensagem NÃO diz de quem é)
--     tenant_required    primeira conexão sem Conta/Loja de destino
--     forbidden_tenant   Conta/Loja de destino inexistente OU fora do alcance
--                        (mesma resposta, para não revelar existência)
--
--   LOOKUP — só por phoneNumberId, nas duas colunas: `instance_key` e
--   `connection_config->>'phoneNumberId'`. Hoje as duas concordam em toda
--   linha viva. Se UMA linha casar por qualquer uma das duas, é ela (a
--   reconexão regrava connection_config.phoneNumberId com o valor do diálogo;
--   instance_key não é tocada). Se casarem linhas diferentes, `ambiguous`.
--   Não casa por telefone (muda em port-in) nem por wabaId (uma WABA tem
--   vários números).
--
--   ACESSO — mesma regra de decideInstanceAccess (instance-access.ts) e da
--   exclusão (20260919000001): superadmin ativo; qualquer cargo com a
--   capability na própria Conta/Loja; GERENTE ativo numa Loja filha DIRETA
--   (gerente_child_store_ids()). Na reconexão a Conta é a DA LINHA — a
--   pergunta é "este chamador alcança esta instância?". Na primeira conexão a
--   Conta é a que o navegador mandou (a ativa no seletor) e a pergunta é "este
--   chamador pode gravar nesta Conta/Loja?" — a mesma regra, com a Conta de
--   destino no lugar da instância.
--
--   RECONEXÃO — o UPDATE toca SÓ nisto:
--     name              só se o usuário digitou um (p_name não vazio)
--     status            'open'
--     last_connected_at now()
--     updated_at        now()
--     phone_number      só se a Meta devolveu (p_phone_number não nulo)
--     profile_name      só se a Meta devolveu (p_profile_name não nulo)
--     connection_config MERGE (||) de phoneNumberId, wabaId, graphApiVersion,
--                       onboarding='embedded_signup' — o resto da config
--                       (registerPin!) fica
--     token no Vault    set_instance_meta_token atualiza o segredo NO LUGAR
--   E NÃO toca em: id, tenant_id, instance_key, registered_at, created_at,
--   is_active, assigned_profile_id, quality_rating, messaging_limit_tier,
--   account_review_status, is_restricted, restriction_info, health_updated_at,
--   provider, webhook_*, automation_enabled, qr_code, profile_picture_url.
--   Preservar é NÃO estar no SET — não há cópia de volta.
--
--   PRIMEIRA CONEXÃO — INSERT como antes (instance_key = phoneNumberId,
--   provider 'official', status 'open', onboarding 'embedded_signup') seguido
--   do token. Um INSERT que perca a corrida com outro igual cai no UNIQUE
--   (23505) e a transação inteira desfaz: nada fica pela metade.
--
--   ATOMICIDADE — a linha e o token são gravados na mesma função. Se qualquer
--   passo falhar, nenhum dos dois fica. Na reconexão a linha é trancada
--   (FOR UPDATE) antes de conferir.
--
--   RLS — este arquivo NÃO cria, altera nem apaga policy.
--
-- Aplicação: este arquivo inteiro no SQL Editor (ou pelo MCP).
-- NÃO rodar `supabase db push` neste projeto.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. A checagem — interna (sem EXECUTE para authenticated)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.meta_signup_check(p_phone_number_id text, p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_pnid     text := nullif(trim(coalesce(p_phone_number_id, '')), '');
  v_inst     record;
  v_n        int;
  v_access   text;
  v_tenant   record;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated',
      'message', 'Sessão inválida ou expirada.');
  END IF;

  -- Capability antes de qualquer lookup: o atendente recebe a mesma resposta
  -- para qualquer número e não fica sabendo se ele existe.
  IF NOT public.has_capability('whatsapp.configure') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden',
      'message', 'Apenas Gestor ou Gerente pode conectar números de WhatsApp.');
  END IF;

  IF v_pnid IS NULL OR v_pnid !~ '^[0-9]{1,40}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid',
      'message', 'Identificador do número inválido.');
  END IF;

  -- Lookup pelas DUAS colunas. Uma linha casando por qualquer uma = é ela.
  SELECT count(*) INTO v_n
    FROM public.whatsapp_instances i
   WHERE i.instance_key = v_pnid
      OR i.connection_config->>'phoneNumberId' = v_pnid;

  IF v_n > 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ambiguous',
      'message', 'Este número aparece em mais de uma instância. Nada foi alterado. Escreva para contato@convoflow.com.br antes de tentar de novo.');
  END IF;

  IF v_n = 1 THEN
    -- ============================ RECONEXÃO ============================
    SELECT i.id, i.tenant_id, i.name, i.instance_key, i.provider, i.registered_at,
           i.connection_config, i.status
      INTO v_inst
      FROM public.whatsapp_instances i
     WHERE i.instance_key = v_pnid
        OR i.connection_config->>'phoneNumberId' = v_pnid;

    IF coalesce(v_inst.provider, 'evolution') <> 'official' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'provider_mismatch',
        'message', 'Este identificador já é usado por uma instância de outro provedor. Nada foi alterado.');
    END IF;

    -- A Conta é a DA LINHA. p_tenant_id é ignorado de propósito.
    v_access := CASE
      WHEN public.is_super_admin_safe()                                   THEN 'superadmin'
      WHEN v_inst.tenant_id = public.get_current_user_tenant_id()         THEN 'own_tenant'
      WHEN v_inst.tenant_id IN (SELECT public.gerente_child_store_ids())  THEN 'gerente_child_store'
      ELSE NULL
    END;

    IF v_access IS NULL THEN
      -- Não diz de quem é. Só que existe e que não é deste chamador.
      RETURN jsonb_build_object('ok', false, 'reason', 'foreign_instance',
        'message', 'Este número já está conectado em outra Conta ou Loja que você não administra. Se ele é seu, escreva para contato@convoflow.com.br.');
    END IF;

    RETURN jsonb_build_object(
      'ok', true, 'mode', 'reconnect', 'access', v_access,
      'tenant_id', v_inst.tenant_id,
      'instance', jsonb_build_object(
        'id', v_inst.id, 'tenant_id', v_inst.tenant_id, 'name', v_inst.name,
        'instance_key', v_inst.instance_key, 'status', v_inst.status,
        'registered_at', v_inst.registered_at,
        'key_mismatch', (v_inst.instance_key <> v_pnid
                         OR coalesce(v_inst.connection_config->>'phoneNumberId', '') <> v_pnid)));
  END IF;

  -- ============================ PRIMEIRA CONEXÃO ============================
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'tenant_required',
      'message', 'Escolha a Conta ou Loja em que o número vai ser conectado.');
  END IF;

  SELECT t.id INTO v_tenant FROM public.tenants t WHERE t.id = p_tenant_id;

  v_access := CASE
    WHEN NOT FOUND                                                     THEN NULL
    WHEN public.is_super_admin_safe()                                  THEN 'superadmin'
    WHEN p_tenant_id = public.get_current_user_tenant_id()             THEN 'own_tenant'
    WHEN p_tenant_id IN (SELECT public.gerente_child_store_ids())      THEN 'gerente_child_store'
    ELSE NULL
  END;

  IF v_access IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden_tenant',
      'message', 'Você não pode conectar número nesta Conta ou Loja.');
  END IF;

  RETURN jsonb_build_object('ok', true, 'mode', 'connect', 'access', v_access,
    'tenant_id', p_tenant_id, 'instance', NULL);
END;
$function$;

COMMENT ON FUNCTION public.meta_signup_check(text, uuid) IS
  'Decide se o Embedded Signup deste phoneNumberId é reconexão (linha existente, Conta da linha) ou primeira conexão (Conta p_tenant_id), e se o chamador pode. Interna: só meta_signup_commit chama. Espelho de decideMetaSignup em supabase/functions/_shared/meta-signup.ts.';

REVOKE ALL ON FUNCTION public.meta_signup_check(text, uuid) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. A gravação — uma transação: checagem → lock → INSERT ou UPDATE → token
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.meta_signup_commit(
  p_phone_number_id   text,
  p_tenant_id         uuid,
  p_waba_id           text,
  p_graph_api_version text,
  p_name              text,
  p_phone_number      text,
  p_profile_name      text,
  p_token             text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_pnid    text := nullif(trim(coalesce(p_phone_number_id, '')), '');
  v_check   jsonb;
  v_id      uuid;
  v_name    text := nullif(trim(coalesce(p_name, '')), '');
  v_row     record;
  v_secret  uuid;
BEGIN
  IF nullif(trim(coalesce(p_waba_id, '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid', 'message', 'wabaId é obrigatório.');
  END IF;
  IF nullif(p_token, '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid', 'message', 'Token de acesso ausente.');
  END IF;

  -- Lock ANTES de checar: se a linha existe, ninguém a altera nem apaga até
  -- esta transação acabar. Com v_pnid inválido o lock não acha nada e a
  -- checagem devolve 'invalid'.
  IF v_pnid IS NOT NULL THEN
    PERFORM 1 FROM public.whatsapp_instances i
      WHERE i.instance_key = v_pnid OR i.connection_config->>'phoneNumberId' = v_pnid
      FOR UPDATE;
  END IF;

  v_check := public.meta_signup_check(v_pnid, p_tenant_id);
  IF NOT (v_check->>'ok')::boolean THEN
    RETURN v_check;
  END IF;

  IF v_check->>'mode' = 'reconnect' THEN
    v_id := (v_check->'instance'->>'id')::uuid;

    -- Só o que está no SET muda. Tudo o mais (id, tenant_id, instance_key,
    -- registered_at, registerPin dentro da config, saúde, atribuição...) fica
    -- por não ser mencionado.
    UPDATE public.whatsapp_instances
       SET name              = coalesce(v_name, name),
           status            = 'open',
           last_connected_at = now(),
           updated_at        = now(),
           phone_number      = coalesce(p_phone_number, phone_number),
           profile_name      = coalesce(p_profile_name, profile_name),
           connection_config = coalesce(connection_config, '{}'::jsonb) || jsonb_build_object(
             'phoneNumberId',   v_pnid,
             'wabaId',          p_waba_id,
             'graphApiVersion', coalesce(nullif(p_graph_api_version, ''), 'v20.0'),
             'onboarding',      'embedded_signup')
     WHERE id = v_id;
  ELSE
    INSERT INTO public.whatsapp_instances
      (tenant_id, name, instance_key, provider, status, phone_number, profile_name,
       last_connected_at, connection_config)
    VALUES
      ((v_check->>'tenant_id')::uuid,
       coalesce(v_name, p_profile_name, 'Meta ' || v_pnid),
       v_pnid, 'official', 'open', p_phone_number, p_profile_name, now(),
       jsonb_build_object(
         'phoneNumberId',   v_pnid,
         'wabaId',          p_waba_id,
         'graphApiVersion', coalesce(nullif(p_graph_api_version, ''), 'v20.0'),
         'onboarding',      'embedded_signup'))
    RETURNING id INTO v_id;
  END IF;

  -- Token: cria o segredo na primeira conexão, atualiza NO LUGAR na reconexão
  -- (set_instance_meta_token já faz essa distinção pelo instance_secrets).
  v_secret := public.set_instance_meta_token(v_id, p_token);

  SELECT i.id, i.tenant_id, i.name, i.instance_key, i.status, i.provider,
         i.phone_number, i.profile_name, i.registered_at, i.connection_config
    INTO v_row
    FROM public.whatsapp_instances i WHERE i.id = v_id;

  RETURN jsonb_build_object(
    'ok', true,
    'mode', v_check->>'mode',
    'access', v_check->>'access',
    'vault_secret_id', v_secret,
    -- Só a edge function lê connection_config (para o passo de registro);
    -- ela NÃO devolve isto ao navegador.
    'instance', jsonb_build_object(
      'id', v_row.id, 'tenant_id', v_row.tenant_id, 'name', v_row.name,
      'instance_key', v_row.instance_key, 'status', v_row.status,
      'provider', v_row.provider, 'phone_number', v_row.phone_number,
      'profile_name', v_row.profile_name, 'registered_at', v_row.registered_at,
      'connection_config', v_row.connection_config));
END;
$function$;

COMMENT ON FUNCTION public.meta_signup_commit(text, uuid, text, text, text, text, text, text) IS
  'Grava o resultado do Embedded Signup numa transação: meta_signup_check → lock → UPDATE no lugar (reconexão, id preservado) ou INSERT (primeira conexão) → token no Vault. Recusa com {ok:false, reason} antes de tocar em qualquer linha. Chamada pela edge function meta-oauth-exchange DEPOIS da Meta.';

REVOKE ALL ON FUNCTION public.meta_signup_commit(text, uuid, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.meta_signup_commit(text, uuid, text, text, text, text, text, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. Conferência + ledger
-- -----------------------------------------------------------------------------
DO $chk$
DECLARE
  n_pol int;
BEGIN
  IF to_regprocedure('public.meta_signup_check(text, uuid)') IS NULL
     OR to_regprocedure('public.meta_signup_commit(text, uuid, text, text, text, text, text, text)') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: alguma das duas funções não existe.';
  END IF;
  IF to_regprocedure('public.gerente_child_store_ids()') IS NULL
     OR to_regprocedure('public.has_capability(text)') IS NULL
     OR to_regprocedure('public.is_super_admin_safe()') IS NULL
     OR to_regprocedure('public.set_instance_meta_token(uuid, text)') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: helper ausente (gerente_child_store_ids / has_capability / is_super_admin_safe / set_instance_meta_token).';
  END IF;
  IF has_function_privilege('authenticated', 'public.meta_signup_check(text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ABORTADO: meta_signup_check com EXECUTE para authenticated.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.meta_signup_commit(text, uuid, text, text, text, text, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ABORTADO: meta_signup_commit sem EXECUTE para authenticated.';
  END IF;
  -- Prova de que este arquivo não mexeu em policy de whatsapp_instances.
  SELECT count(*) INTO n_pol FROM pg_policies WHERE schemaname = 'public' AND tablename = 'whatsapp_instances';
  IF n_pol <> 6 THEN
    RAISE EXCEPTION 'ABORTADO: whatsapp_instances deveria ter 6 policies, tem %. Este arquivo não cria nem apaga policy — investigue.', n_pol;
  END IF;

  INSERT INTO supabase_migrations.schema_migrations (version, name)
  VALUES ('20260919000002', 'meta_signup_reconnect_rpc')
  ON CONFLICT (version) DO NOTHING;

  RAISE NOTICE 'meta_signup_reconnect_rpc aplicada: 1 interna (check) + 1 RPC (commit). Nenhuma policy alterada. Nenhuma instância tocada.';
END
$chk$;

-- =============================================================================
-- ROLLBACK
-- DROP FUNCTION IF EXISTS public.meta_signup_commit(text, uuid, text, text, text, text, text, text);
-- DROP FUNCTION IF EXISTS public.meta_signup_check(text, uuid);
-- DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260919000002';
-- (Sem a RPC, a edge function nova falha em "Falha ao salvar instância" DEPOIS
--  da Meta — igual ao defeito antigo. Volte a versão anterior da função junto.)
-- =============================================================================
