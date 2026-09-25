-- Fatia 4/5 do Instagram, primeira entrega: RENOVAR o acesso antes que vença.
--
-- ============================================================================
-- O QUE ESTA MIGRAÇÃO FAZ
-- ============================================================================
--
--   1. instagram_connection_alerts: o registro "este aviso já saiu". Uma linha
--      por (instância, marco, validade do token). A chave primária é a regra
--      "uma vez por marco": o segundo INSERT do mesmo marco não entra, e só
--      quem entra manda notificação.
--   2. instagram_token_renewal_record_success / _record_failure: gravam o
--      resultado de uma renovação na PRÓPRIA instância (connection_config) e,
--      no sucesso, o token novo no Vault NO LUGAR (set_instance_meta_token).
--   3. instagram_connection_alert_sweep: os três avisos do sino — 7 dias
--      antes, no vencimento, e quando a renovação falha de um jeito que só
--      reconectar resolve — para Gerente e Gestor da Conta/Loja
--      (response_rule_admin_user_ids, a mesma busca da regra de tempo de
--      resposta).
--   4. instagram_token_renewal_cron_secret: lê o segredo do cron no Vault,
--      para a edge function comparar. Só service_role.
--   5. instagram_token_renewal_kick: dispara a edge function com o segredo no
--      cabeçalho. É o que o cron chama e o que o dono roda à mão. Só postgres.
--
-- NÃO FAZ: agendar o cron (docs/agendar_renovacao_instagram_cron.sql, depois do
-- deploy), criar o segredo (é do dono, uma linha no SQL Editor — ver
-- docs/RUNBOOK_instagram_renovacao.md), tocar em trigger, em mensagem, em
-- conversa, em nada do WhatsApp. Nenhuma linha existente é alterada.
--
-- ============================================================================
-- O ESTADO NA INSTÂNCIA — connection_config.renewal
-- ============================================================================
--
--   { status: 'ok' | 'retrying' | 'needs_reconnect',
--     forTokenIssuedAt,   -- o tokenIssuedAt do token a que o estado se refere
--     reason, message, metaCode,
--     lastAttemptAt, lastSuccessAt, lastErrorAt }
--
-- forTokenIssuedAt é o que faz "parar de tentar até reconectar" funcionar sem
-- ninguém limpar nada: qualquer caminho que troca o token (reconexão, a troca
-- manual do runbook) grava um tokenIssuedAt novo, e o estado antigo deixa de
-- valer sozinho. A comparação é de TEXTO, e os dois valores saem do mesmo
-- to_jsonb(timestamptz) no mesmo comando — iguais byte a byte.
--
-- Guarda de corrida: as duas funções de gravação recebem o tokenIssuedAt que a
-- edge function LEU e não gravam nada se ele mudou no meio ('stale').
--
-- ============================================================================
-- ATOMICIDADE
-- ============================================================================
--
-- Funções com CREATE OR REPLACE (ninguém as chama ainda). Tabela, permissões e
-- conferência num único bloco DO, com lock_timeout de 5 s: a FK para
-- whatsapp_instances pede um lock curto nela; se não sair, aborta em vez de
-- enfileirar os webhooks atrás da migração. Idempotente.

-- ---------------------------------------------------------------------------
-- 0. Leitura tolerante de data (o texto vem de jsonb; nunca levanta)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.instagram_parse_ts(p_value text)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $function$
BEGIN
  RETURN NULLIF(btrim(COALESCE(p_value, '')), '')::timestamptz;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.instagram_parse_ts(text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Sucesso: token novo no Vault, datas novas, estado 'ok'
-- ---------------------------------------------------------------------------
--
-- p_expires_in vem da Meta, em segundos. Sem ele (ou fora de 1 s..400 dias), o
-- token novo é guardado assim mesmo — descartá-lo poderia deixar a conta sem
-- acesso válido —, a validade antiga é MANTIDA (nunca inventamos 60 dias) e o
-- estado vira 'retrying': amanhã a função renova de novo e, com sorte, a Meta
-- manda a validade.
CREATE OR REPLACE FUNCTION public.instagram_token_renewal_record_success(
  p_instance_id         uuid,
  p_token               text,
  p_expires_in          integer,
  p_expected_issued_at  text,
  p_now                 timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_provider text;
  v_cfg      jsonb;
  v_now_txt  jsonb := to_jsonb(p_now);
  v_exp      jsonb;
  v_ok       boolean := p_expires_in IS NOT NULL AND p_expires_in > 0 AND p_expires_in <= 400 * 86400;
BEGIN
  IF NULLIF(btrim(COALESCE(p_token, '')), '') IS NULL THEN
    RAISE EXCEPTION 'instagram_token_renewal_record_success: token vazio (instância %)', p_instance_id;
  END IF;

  SELECT w.provider, COALESCE(w.connection_config, '{}'::jsonb)
    INTO v_provider, v_cfg
    FROM public.whatsapp_instances w
   WHERE w.id = p_instance_id
     FOR UPDATE;

  IF NOT FOUND OR v_provider IS DISTINCT FROM 'instagram' THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;
  IF (v_cfg ->> 'tokenIssuedAt') IS DISTINCT FROM p_expected_issued_at THEN
    RETURN jsonb_build_object('outcome', 'stale');
  END IF;

  PERFORM public.set_instance_meta_token(p_instance_id, btrim(p_token));

  v_exp := CASE WHEN v_ok THEN to_jsonb(p_now + make_interval(secs => p_expires_in))
                ELSE v_cfg -> 'tokenExpiresAt' END;

  UPDATE public.whatsapp_instances
     SET connection_config = v_cfg || jsonb_build_object(
           'tokenIssuedAt',  v_now_txt,
           'tokenExpiresAt', v_exp,
           'renewal', jsonb_build_object(
             'status',           CASE WHEN v_ok THEN 'ok' ELSE 'retrying' END,
             'forTokenIssuedAt', v_now_txt,
             'reason',           CASE WHEN v_ok THEN NULL ELSE 'no_expiry' END,
             'message',          CASE WHEN v_ok THEN NULL
                                      ELSE 'O Instagram renovou, mas não informou a nova validade. O ConvoFlow confere de novo amanhã.' END,
             'metaCode',         NULL,
             'lastAttemptAt',    v_now_txt,
             'lastSuccessAt',    v_now_txt,
             'lastErrorAt',      CASE WHEN v_ok THEN NULL ELSE v_now_txt END
           ))
   WHERE id = p_instance_id;

  RETURN jsonb_build_object(
    'outcome',     CASE WHEN v_ok THEN 'renewed' ELSE 'renewed_without_expiry' END,
    'valid_until', v_exp #>> '{}'
  );
END;
$function$;

COMMENT ON FUNCTION public.instagram_token_renewal_record_success(uuid, text, integer, text, timestamptz) IS
  'Renovação do Instagram deu certo: token novo no Vault no lugar (set_instance_meta_token), tokenIssuedAt = agora, tokenExpiresAt = agora + expires_in da Meta (sem ele, mantém a antiga e fica retrying). Não grava se o tokenIssuedAt mudou desde a leitura (stale). Só service_role.';

REVOKE ALL ON FUNCTION public.instagram_token_renewal_record_success(uuid, text, integer, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.instagram_token_renewal_record_success(uuid, text, integer, text, timestamptz) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Falha: estado, motivo e data. Token e validade intocados.
-- ---------------------------------------------------------------------------
--   p_kind 'transient'       → status 'retrying'        (tenta de novo amanhã)
--   p_kind 'needs_reconnect' → status 'needs_reconnect' (para até trocar o token)
CREATE OR REPLACE FUNCTION public.instagram_token_renewal_record_failure(
  p_instance_id         uuid,
  p_kind                text,
  p_reason              text,
  p_message             text,
  p_meta_code           integer,
  p_expected_issued_at  text,
  p_now                 timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_provider text;
  v_cfg      jsonb;
  v_prev     jsonb;
  v_now_txt  jsonb := to_jsonb(p_now);
  v_status   text;
BEGIN
  v_status := CASE p_kind WHEN 'transient' THEN 'retrying'
                          WHEN 'needs_reconnect' THEN 'needs_reconnect' END;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'instagram_token_renewal_record_failure: tipo inválido %', p_kind;
  END IF;

  SELECT w.provider, COALESCE(w.connection_config, '{}'::jsonb)
    INTO v_provider, v_cfg
    FROM public.whatsapp_instances w
   WHERE w.id = p_instance_id
     FOR UPDATE;

  IF NOT FOUND OR v_provider IS DISTINCT FROM 'instagram' THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;
  IF (v_cfg ->> 'tokenIssuedAt') IS DISTINCT FROM p_expected_issued_at THEN
    RETURN jsonb_build_object('outcome', 'stale');
  END IF;

  -- lastSuccessAt sobrevive só se o estado anterior é do MESMO token.
  v_prev := CASE WHEN (v_cfg #>> '{renewal,forTokenIssuedAt}') = (v_cfg ->> 'tokenIssuedAt')
                 THEN v_cfg -> 'renewal' END;

  UPDATE public.whatsapp_instances
     SET connection_config = v_cfg || jsonb_build_object(
           'renewal', jsonb_build_object(
             'status',           v_status,
             'forTokenIssuedAt', v_cfg -> 'tokenIssuedAt',
             'reason',           p_reason,
             'message',          p_message,
             'metaCode',         p_meta_code,
             'lastAttemptAt',    v_now_txt,
             'lastSuccessAt',    v_prev -> 'lastSuccessAt',
             'lastErrorAt',      v_now_txt
           ))
   WHERE id = p_instance_id;

  RETURN jsonb_build_object('outcome', CASE WHEN v_status = 'retrying' THEN 'retry_tomorrow' ELSE 'needs_reconnect' END);
END;
$function$;

COMMENT ON FUNCTION public.instagram_token_renewal_record_failure(uuid, text, text, text, integer, text, timestamptz) IS
  'Renovação do Instagram falhou: grava status (retrying | needs_reconnect), motivo, mensagem, código da Meta e datas em connection_config.renewal. Não toca no token nem na validade. Só service_role.';

REVOKE ALL ON FUNCTION public.instagram_token_renewal_record_failure(uuid, text, text, text, integer, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.instagram_token_renewal_record_failure(uuid, text, text, text, integer, text, timestamptz) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Avisos do sino, uma vez por marco
-- ---------------------------------------------------------------------------
--
-- Marcos, por instância ATIVA de Instagram com validade legível:
--   needs_reconnect  a renovação deste token terminou em "precisa reconectar"
--   expiring_7d      faltam 7 dias ou menos, e ainda não venceu
--   expired          venceu
-- A chave de cada aviso inclui a validade do token: depois de uma renovação ou
-- reconexão (validade nova) os marcos voltam a valer para o token novo.
--
-- Cada instância roda num subbloco com EXCEPTION: um problema numa não impede
-- as outras, e desfaz só o que era dela (a marca e as notificações juntas).
--
-- Destinatários: Gerente e Gestor ativos da Conta/Loja dona da instância, e o
-- Gerente da Conta-mãe quando a instância é de uma Loja
-- (response_rule_admin_user_ids). Sem ninguém para avisar, a marca é gravada
-- mesmo assim, com recipients = 0 — senão a Conta receberia o aviso atrasado,
-- no dia em que alguém fosse cadastrado.
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
              'O ConvoFlow não conseguiu renovar a conexão do Instagram %s. %sA conexão vale até %s; depois disso, as respostas pelo Instagram param. Para reconectar, escreva para contato@convoflow.com.br.',
              v_label,
              COALESCE(NULLIF(btrim(v_ren ->> 'message'), '') || ' ', ''),
              v_when);
          WHEN 'expiring_7d' THEN
            v_type  := 'warning';
            v_title := 'A conexão do Instagram vai vencer';
            v_msg   := format(
              'A conexão do Instagram %s vale até %s. O ConvoFlow tenta renovar sozinho todo dia, mas ainda não conseguiu. Se vencer, as respostas pelo Instagram param. Se este aviso continuar, escreva para contato@convoflow.com.br para reconectar a conta.',
              v_label, v_when);
          ELSE
            v_type  := 'error';
            v_title := 'A conexão do Instagram venceu';
            v_msg   := format(
              'A conexão do Instagram %s venceu em %s. As respostas pelo Instagram estão paradas até a conta ser reconectada. Para reconectar, escreva para contato@convoflow.com.br.',
              v_label, v_when);
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
  'Avisos do sino sobre a conexão do Instagram: needs_reconnect, expiring_7d (7 dias antes) e expired. Uma vez por (instância, marco, validade) — a chave primária de instagram_connection_alerts é a regra. Destinatários: response_rule_admin_user_ids (Gerente e Gestor). Só service_role.';

REVOKE ALL ON FUNCTION public.instagram_connection_alert_sweep(timestamptz, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.instagram_connection_alert_sweep(timestamptz, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. O segredo do cron, para a edge function comparar
-- ---------------------------------------------------------------------------
-- O dono cria o segredo com UMA linha no SQL Editor, com valor aleatório gerado
-- pelo próprio banco (ninguém vê, ninguém copia) — ver
-- docs/RUNBOOK_instagram_renovacao.md. Sem ele, esta função devolve NULL e a
-- edge function recusa tudo.
CREATE OR REPLACE FUNCTION public.instagram_token_renewal_cron_secret()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT ds.decrypted_secret
    FROM vault.decrypted_secrets ds
   WHERE ds.name = 'instagram_token_renewal_cron_secret';
$function$;

COMMENT ON FUNCTION public.instagram_token_renewal_cron_secret() IS
  'Segredo do cron da renovação do Instagram (Vault: instagram_token_renewal_cron_secret). Só service_role — é a edge function instagram-token-renewal que compara.';

REVOKE ALL ON FUNCTION public.instagram_token_renewal_cron_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.instagram_token_renewal_cron_secret() TO service_role;

-- ---------------------------------------------------------------------------
-- 5. O disparo (cron e execução manual)
-- ---------------------------------------------------------------------------
-- Devolve o id do pedido do pg_net; a resposta da função aparece em
-- net._http_response (guardada por ~6 h). Só o papel postgres executa: é o
-- papel do pg_cron e do SQL Editor. Ninguém pelo app.
CREATE OR REPLACE FUNCTION public.instagram_token_renewal_kick(
  p_instance_id   uuid    DEFAULT NULL,
  p_dry_run       boolean DEFAULT false,
  p_ignore_window boolean DEFAULT false
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_secret text;
  v_id     bigint;
BEGIN
  SELECT ds.decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets ds
   WHERE ds.name = 'instagram_token_renewal_cron_secret';

  IF v_secret IS NULL OR length(v_secret) < 32 THEN
    RAISE EXCEPTION 'O segredo instagram_token_renewal_cron_secret não está no Vault (ou é curto demais). Crie-o antes: ver docs/RUNBOOK_instagram_renovacao.md, passo 1.';
  END IF;

  SELECT net.http_post(
    url := 'https://pqjkuwyshybxldzpfbbs.supabase.co/functions/v1/instagram-token-renewal',
    body := jsonb_build_object(
      'dryRun',       COALESCE(p_dry_run, false),
      'instanceId',   p_instance_id,
      'ignoreWindow', COALESCE(p_ignore_window, false)
    ),
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', v_secret
    ),
    timeout_milliseconds := 60000
  ) INTO v_id;

  RETURN v_id;
END;
$function$;

COMMENT ON FUNCTION public.instagram_token_renewal_kick(uuid, boolean, boolean) IS
  'Dispara a edge function instagram-token-renewal com o segredo do Vault no cabeçalho x-cron-secret. Sem argumentos = execução do cron. Só postgres (pg_cron e SQL Editor).';

REVOKE ALL ON FUNCTION public.instagram_token_renewal_kick(uuid, boolean, boolean) FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Tabela, permissões e conferência — um comando só
-- ---------------------------------------------------------------------------
DO $mig$
DECLARE
  ENCAIXA constant uuid := '2165be9f-b6bb-49fb-ba6a-1dec6840c45a';
  v_enc_antes   text;
  v_enc_depois  text;
  v_inst_antes  text;
  v_inst_depois text;
  v_trg_antes   text;
  v_trg_depois  text;
  v_fn_antes    text;
  v_fn_depois   text;
  v_n           integer;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- Retrato de antes: EncaixaRH (contagens), TODAS as instâncias (conteúdo),
  -- as triggers do caminho de mensagens e as funções de entrada/saída.
  SELECT concat_ws('|',
           (SELECT count(*) FROM public.contacts           WHERE tenant_id = ENCAIXA),
           (SELECT count(*) FROM public.conversations      WHERE tenant_id = ENCAIXA),
           (SELECT count(*) FROM public.messages           WHERE tenant_id = ENCAIXA),
           (SELECT count(*) FROM public.whatsapp_instances WHERE tenant_id = ENCAIXA),
           (SELECT count(*) FROM public.notifications      WHERE tenant_id = ENCAIXA))
    INTO v_enc_antes;
  SELECT md5(string_agg(w::text, '|' ORDER BY w.id)) INTO v_inst_antes FROM public.whatsapp_instances w;
  SELECT md5(string_agg(pg_get_triggerdef(t.oid), '|' ORDER BY t.tgname)) INTO v_trg_antes
    FROM pg_trigger t
   WHERE NOT t.tgisinternal
     AND t.tgrelid IN ('public.messages'::regclass, 'public.contacts'::regclass,
                       'public.conversations'::regclass, 'public.whatsapp_instances'::regclass);
  SELECT md5(string_agg(pg_get_functiondef(p.oid), '|' ORDER BY p.oid::regprocedure::text)) INTO v_fn_antes
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname IN ('process_instagram_message', 'process_incoming_message', 'update_conversation_on_message',
                       'handle_message_conversation', 'set_instance_meta_token', 'get_instance_meta_token',
                       'response_rule_admin_user_ids', 'delete_whatsapp_instance');

  CREATE TABLE IF NOT EXISTS public.instagram_connection_alerts (
    instance_id       uuid        NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
    milestone         text        NOT NULL,
    token_expires_at  timestamptz NOT NULL,
    tenant_id         uuid        NOT NULL,
    recipients        integer     NOT NULL DEFAULT 0,
    created_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT instagram_connection_alerts_pkey PRIMARY KEY (instance_id, milestone, token_expires_at),
    CONSTRAINT instagram_connection_alerts_milestone_check
      CHECK (milestone = ANY (ARRAY['expiring_7d'::text, 'expired'::text, 'needs_reconnect'::text]))
  );

  ALTER TABLE public.instagram_connection_alerts ENABLE ROW LEVEL SECURITY;
  -- Sem policy: só as funções SECURITY DEFINER leem e escrevem.
  REVOKE ALL ON public.instagram_connection_alerts FROM PUBLIC, anon, authenticated;

  -- ---- CONFERÊNCIA ----------------------------------------------------------
  SELECT concat_ws('|',
           (SELECT count(*) FROM public.contacts           WHERE tenant_id = ENCAIXA),
           (SELECT count(*) FROM public.conversations      WHERE tenant_id = ENCAIXA),
           (SELECT count(*) FROM public.messages           WHERE tenant_id = ENCAIXA),
           (SELECT count(*) FROM public.whatsapp_instances WHERE tenant_id = ENCAIXA),
           (SELECT count(*) FROM public.notifications      WHERE tenant_id = ENCAIXA))
    INTO v_enc_depois;
  IF v_enc_depois IS DISTINCT FROM v_enc_antes THEN
    RAISE EXCEPTION 'ABORTADO: contagens da EncaixaRH mudaram (% -> %).', v_enc_antes, v_enc_depois;
  END IF;

  SELECT md5(string_agg(w::text, '|' ORDER BY w.id)) INTO v_inst_depois FROM public.whatsapp_instances w;
  IF v_inst_depois IS DISTINCT FROM v_inst_antes THEN
    RAISE EXCEPTION 'ABORTADO: alguma linha de whatsapp_instances mudou.';
  END IF;

  SELECT md5(string_agg(pg_get_triggerdef(t.oid), '|' ORDER BY t.tgname)) INTO v_trg_depois
    FROM pg_trigger t
   WHERE NOT t.tgisinternal
     AND t.tgrelid IN ('public.messages'::regclass, 'public.contacts'::regclass,
                       'public.conversations'::regclass, 'public.whatsapp_instances'::regclass);
  IF v_trg_depois IS DISTINCT FROM v_trg_antes THEN
    RAISE EXCEPTION 'ABORTADO: alguma trigger de messages/contacts/conversations/whatsapp_instances mudou.';
  END IF;

  SELECT md5(string_agg(pg_get_functiondef(p.oid), '|' ORDER BY p.oid::regprocedure::text)) INTO v_fn_depois
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname IN ('process_instagram_message', 'process_incoming_message', 'update_conversation_on_message',
                       'handle_message_conversation', 'set_instance_meta_token', 'get_instance_meta_token',
                       'response_rule_admin_user_ids', 'delete_whatsapp_instance');
  IF v_fn_depois IS DISTINCT FROM v_fn_antes THEN
    RAISE EXCEPTION 'ABORTADO: alguma função do caminho de mensagens/cofre mudou.';
  END IF;

  -- Permissões: nada executável pelo app; o disparo nem pela service_role.
  SELECT count(*) INTO v_n
    FROM (VALUES
      ('public.instagram_token_renewal_record_success(uuid,text,integer,text,timestamptz)'),
      ('public.instagram_token_renewal_record_failure(uuid,text,text,text,integer,text,timestamptz)'),
      ('public.instagram_connection_alert_sweep(timestamptz,uuid)'),
      ('public.instagram_token_renewal_cron_secret()'),
      ('public.instagram_token_renewal_kick(uuid,boolean,boolean)'),
      ('public.instagram_parse_ts(text)')
    ) f(sig)
   WHERE has_function_privilege('anon', f.sig, 'EXECUTE')
      OR has_function_privilege('authenticated', f.sig, 'EXECUTE');
  IF v_n > 0 THEN
    RAISE EXCEPTION 'ABORTADO: % função(ões) da renovação executável(is) por anon/authenticated.', v_n;
  END IF;
  IF has_function_privilege('service_role', 'public.instagram_token_renewal_kick(uuid,boolean,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ABORTADO: instagram_token_renewal_kick executável por service_role.';
  END IF;
  IF has_table_privilege('authenticated', 'public.instagram_connection_alerts', 'SELECT')
  OR has_table_privilege('anon', 'public.instagram_connection_alerts', 'SELECT') THEN
    RAISE EXCEPTION 'ABORTADO: instagram_connection_alerts legível pelo app.';
  END IF;

  RAISE NOTICE 'OK: instagram_connection_alerts + 6 funções; instâncias, triggers, funções de mensagem e EncaixaRH intocadas.';
END
$mig$;

COMMENT ON TABLE public.instagram_connection_alerts IS
  'Fatia 4 do Instagram: avisos do sino sobre a conexão que JÁ saíram. PK (instance_id, milestone, token_expires_at) = uma vez por marco por token. recipients = quantas notificações saíram. Só funções SECURITY DEFINER tocam.';

-- ---------------------------------------------------------------------------
-- 7. Ledger
-- ---------------------------------------------------------------------------
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260924000001', 'instagram_token_renewal')
ON CONFLICT (version) DO NOTHING;

-- ===========================================================================
-- ROLLBACK (um comando só). Desagende o cron ANTES
-- (SELECT cron.unschedule('instagram-token-renewal-daily');) e, se quiser,
-- apague a função no painel. Tokens já renovados continuam valendo: o rollback
-- não desfaz renovação, só para de renovar.
-- ===========================================================================
-- DO $rb$
-- BEGIN
--   DROP FUNCTION IF EXISTS public.instagram_token_renewal_kick(uuid, boolean, boolean);
--   DROP FUNCTION IF EXISTS public.instagram_token_renewal_cron_secret();
--   DROP FUNCTION IF EXISTS public.instagram_connection_alert_sweep(timestamptz, uuid);
--   DROP FUNCTION IF EXISTS public.instagram_token_renewal_record_failure(uuid, text, text, text, integer, text, timestamptz);
--   DROP FUNCTION IF EXISTS public.instagram_token_renewal_record_success(uuid, text, integer, text, timestamptz);
--   DROP FUNCTION IF EXISTS public.instagram_parse_ts(text);
--   DROP TABLE IF EXISTS public.instagram_connection_alerts;
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260924000001';
-- END
-- $rb$;
