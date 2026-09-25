-- Fatia 4a do Instagram: a conta do Instagram mora SÓ numa Loja.
--
-- Decisão do dono (2026-09-25): como cada Loja tem o seu WhatsApp, cada Loja
-- tem o seu Instagram. Nunca na Conta. A instância de teste tinha sido criada
-- na Conta Teste Gerente — foi movida para a Loja Teste pelo script
-- docs/mover_instagram_teste_para_loja.sql.
--
-- Esta migração só impede o erro de se repetir: create_instagram_instance (o
-- procedimento de operador, enquanto não há tela de conectar) passa a recusar
-- quando o destino não é uma Loja (tenants.kind = 'store'). O resto do corpo é
-- o que está em produção, linha por linha.
--
-- Idempotente (CREATE OR REPLACE, mesma assinatura, mesmas permissões).

CREATE OR REPLACE FUNCTION public.create_instagram_instance(
  p_tenant_id       uuid,
  p_name            text,
  p_ig_account_id   text,
  p_ig_username     text,
  p_token           text,
  p_token_issued_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_id      uuid;
  v_expires timestamptz;
  v_user    text := NULLIF(ltrim(btrim(COALESCE(p_ig_username, '')), '@'), '');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id) THEN
    RAISE EXCEPTION 'Conta % não existe. Nada foi criado.', p_tenant_id;
  END IF;
  -- O Instagram mora numa Loja, como o WhatsApp de cada Loja. Nunca na Conta.
  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id AND t.kind = 'store') THEN
    RAISE EXCEPTION 'A conta do Instagram fica numa Loja, nunca na Conta: % não é uma Loja. Nada foi criado.', p_tenant_id;
  END IF;
  IF p_ig_account_id IS NULL OR p_ig_account_id !~ '^[0-9]{5,30}$' THEN
    RAISE EXCEPTION 'igAccountId inválido (esperado só dígitos, ex.: 17841419262135883). Nada foi criado.';
  END IF;
  IF NULLIF(btrim(COALESCE(p_token, '')), '') IS NULL THEN
    RAISE EXCEPTION 'token vazio. Nada foi criado.';
  END IF;
  IF NULLIF(btrim(COALESCE(p_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'nome vazio. Nada foi criado.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.whatsapp_instances w
              WHERE w.provider = 'instagram'
                AND w.connection_config ->> 'igAccountId' = p_ig_account_id) THEN
    RAISE EXCEPTION 'Já existe instância para a conta do Instagram %. Nada foi criado.', p_ig_account_id;
  END IF;
  v_expires := COALESCE(p_token_issued_at, now()) + interval '60 days';
  INSERT INTO public.whatsapp_instances (
    tenant_id, name, instance_key, provider, status, is_active,
    profile_name, connection_config
  ) VALUES (
    p_tenant_id, btrim(p_name), 'instagram_' || p_ig_account_id, 'instagram',
    'connected', true,
    CASE WHEN v_user IS NULL THEN NULL ELSE '@' || v_user END,
    jsonb_build_object(
      'igAccountId',    p_ig_account_id,
      'igUsername',     v_user,
      'tokenIssuedAt',  COALESCE(p_token_issued_at, now()),
      'tokenExpiresAt', v_expires
    )
  )
  RETURNING id INTO v_id;
  PERFORM public.set_instance_meta_token(v_id, btrim(p_token));
  RETURN jsonb_build_object(
    'instance_id',      v_id,
    'ig_account_id',    p_ig_account_id,
    'token_expires_at', v_expires
  );
END;
$function$;

COMMENT ON FUNCTION public.create_instagram_instance(uuid, text, text, text, text, timestamptz) IS
  'Procedimento de operador (sem tela): cria a instância provider=instagram NUMA LOJA (recusa Conta) e guarda o token no Vault via set_instance_meta_token. Só postgres.';

REVOKE ALL ON FUNCTION public.create_instagram_instance(uuid, text, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260925000002', 'instagram_only_in_loja')
ON CONFLICT (version) DO NOTHING;
