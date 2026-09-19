-- =============================================================================
-- 20260919000001_delete_whatsapp_instance_rpc
--
-- Exclusão de instância de WhatsApp passa a ser decidida e executada NO BANCO,
-- numa transação só, e é RECUSADA quando a instância guarda histórico.
--
-- O DEFEITO (medido em 2026-09-19 contra produção)
--   O botão da lixeira em Instâncias e APIs rodava um laço NO NAVEGADOR:
--   apagava messages, mass_message_campaigns, follow_up_sequences e
--   conversations da instância (cada erro ignorado com console.warn), depois
--   tentava apagar a linha de whatsapp_instances. Consequências:
--
--   1. Um ATENDENTE da EncaixaRH clicava e apagava 2.622 mensagens e 163
--      conversas: as policies de DELETE de messages/conversations são só por
--      Conta, sem capability. A linha da instância sobrevivia (a policy dela
--      exige whatsapp.configure) e ela via "Instância deletada com sucesso".
--   2. Um GERENTE dentro de uma Loja filha apagava NADA (o laço filtrava por
--      profiles.tenant_id, que é a Conta) e também via sucesso.
--   3. A ordem era filhos primeiro, instância por último: individual_followups
--      e followup_sequence_enrollments (FK NO ACTION, fora do laço) faziam o
--      último passo falhar DEPOIS de o histórico já ter ido embora.
--
-- O QUE MUDA
--   Duas RPCs SECURITY DEFINER, para `authenticated`:
--
--     whatsapp_instance_delete_preview(uuid) -> jsonb   (somente leitura)
--     delete_whatsapp_instance(uuid)         -> jsonb   (a exclusão)
--
--   As duas passam pela MESMA checagem (whatsapp_instance_delete_check), nesta
--   ordem, e param na primeira que falha, ANTES de tocar em qualquer linha:
--
--     unauthenticated  sem auth.uid()
--     forbidden        sem whatsapp.configure (atendente, perfil inativo)
--     not_found        instância inexistente OU de Conta que o chamador não
--                      alcança (mesma resposta, para não revelar existência)
--     has_history      qualquer dependente > 0
--
--   ACESSO — quem alcança a instância (espelho de decideInstanceAccess em
--   supabase/functions/_shared/instance-access.ts, a regra de 2026-09-14):
--     superadmin ativo; qualquer cargo com a capability na própria Conta/Loja;
--     GERENTE ativo numa Loja filha DIRETA (gerente_child_store_ids()).
--   Decisão de 2026-09-19: o gerente PODE excluir na Loja filha. Motivo
--   concreto: a EncaixaRH não tem gestor — só a Camila (gerente da Conta-mãe)
--   e uma atendente. Com "recusar", ninguém além do superadmin (que nem abre
--   a tela) conseguiria remover uma instância vazia daquela Loja. E o risco é
--   pequeno: só instância SEM histórico é excluível.
--
--   HISTÓRICO — o que conta, tudo com FK para whatsapp_instances:
--     conversations, messages, contacts, chatbots, chatbot_sessions,
--     mass_message_campaigns, individual_followups,
--     followup_sequence_enrollments, follow_up_sequences (tabela morta,
--     mas a FK existe e bloquearia o DELETE).
--   Qualquer um > 0 recusa. Não há override: reconectar o número é a resposta
--   (fatia seguinte), não excluir. webhook_logs, webhook_configuration_attempts
--   e instance_secrets NÃO são histórico: cascateiam com a linha.
--
--   ATOMICIDADE — delete_whatsapp_instance tranca a linha (FOR UPDATE), conta
--   sob o lock, apaga a linha (as três cascatas vão junto) e apaga o segredo
--   do Vault que instance_secrets apontava. Uma função = uma transação:
--   qualquer erro no meio desfaz tudo. Um INSERT de mensagem que chegue no
--   meio (webhook) espera o lock (FK toma FOR KEY SHARE) e, se a instância
--   sumiu, falha no FK dele — nunca fica órfão nem apaga histórico.
--
--   VAULT — set_instance_meta_token cria uma linha em vault.secrets por
--   instância Meta; instance_secrets cascateia, o Vault não. Em 2026-09-19
--   havia 7 segredos órfãos de exclusões antigas. A partir daqui a exclusão
--   apaga o segredo junto. Os 7 antigos NÃO são tocados por este arquivo.
--
--   RLS — este arquivo NÃO cria, altera nem apaga policy. A autoridade é a
--   RPC; o DELETE direto em whatsapp_instances continua como está.
--
-- Aplicação: este arquivo inteiro no SQL Editor (ou pelo MCP).
-- NÃO rodar `supabase db push` neste projeto.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Contagem dos dependentes — interna (sem EXECUTE para authenticated)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_instance_history_counts(p_instance_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT jsonb_build_object(
    'conversations',        (SELECT count(*) FROM public.conversations                 x WHERE x.whatsapp_instance_id = p_instance_id),
    'messages',             (SELECT count(*) FROM public.messages                      x WHERE x.whatsapp_instance_id = p_instance_id),
    'contacts',             (SELECT count(*) FROM public.contacts                      x WHERE x.whatsapp_instance_id = p_instance_id),
    'chatbots',             (SELECT count(*) FROM public.chatbots                      x WHERE x.whatsapp_instance_id = p_instance_id),
    'chatbot_sessions',     (SELECT count(*) FROM public.chatbot_sessions              x WHERE x.whatsapp_instance_id = p_instance_id),
    'campaigns',            (SELECT count(*) FROM public.mass_message_campaigns        x WHERE x.whatsapp_instance_id = p_instance_id),
    'followups',            (SELECT count(*) FROM public.individual_followups          x WHERE x.whatsapp_instance_id = p_instance_id),
    'followup_enrollments', (SELECT count(*) FROM public.followup_sequence_enrollments x WHERE x.whatsapp_instance_id = p_instance_id),
    'followup_sequences',   (SELECT count(*) FROM public.follow_up_sequences           x WHERE x.whatsapp_instance_id = p_instance_id)
  );
$function$;

COMMENT ON FUNCTION public.whatsapp_instance_history_counts(uuid) IS
  'Quantos registros dependem da instância (tudo que tem FK para whatsapp_instances e não cascateia). Interna: só as RPCs de exclusão chamam.';

REVOKE ALL ON FUNCTION public.whatsapp_instance_history_counts(uuid) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. A checagem — interna. Mesma para o preview e para a exclusão.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_instance_delete_check(p_instance_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_inst    record;
  v_access  text;
  v_counts  jsonb;
  v_total   bigint;
  v_base    jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated',
      'message', 'Sessão inválida ou expirada.');
  END IF;

  -- Capability antes de existência: o atendente recebe a mesma resposta para
  -- qualquer id, e não fica sabendo se a instância existe.
  IF NOT public.has_capability('whatsapp.configure') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden',
      'message', 'Apenas Gestor ou Gerente pode excluir números de WhatsApp.');
  END IF;

  IF p_instance_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found',
      'message', 'Instância não encontrada.');
  END IF;

  SELECT id, tenant_id, instance_key, name, provider
    INTO v_inst
    FROM public.whatsapp_instances
   WHERE id = p_instance_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found',
      'message', 'Instância não encontrada.');
  END IF;

  -- Espelho de decideInstanceAccess (instance-access.ts). Fora disso, a
  -- resposta é not_found — de propósito, para não revelar Conta alheia.
  v_access := CASE
    WHEN public.is_super_admin_safe()                                      THEN 'superadmin'
    WHEN v_inst.tenant_id = public.get_current_user_tenant_id()            THEN 'own_tenant'
    WHEN v_inst.tenant_id IN (SELECT public.gerente_child_store_ids())     THEN 'gerente_child_store'
    ELSE NULL
  END;

  IF v_access IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found',
      'message', 'Instância não encontrada.');
  END IF;

  v_counts := public.whatsapp_instance_history_counts(p_instance_id);
  SELECT coalesce(sum(value::bigint), 0) INTO v_total FROM jsonb_each_text(v_counts);

  v_base := jsonb_build_object(
    'access',   v_access,
    'counts',   v_counts,
    'total',    v_total,
    'instance', jsonb_build_object(
      'id',           v_inst.id,
      'tenant_id',    v_inst.tenant_id,
      'instance_key', v_inst.instance_key,
      'name',         v_inst.name,
      'provider',     coalesce(v_inst.provider, 'evolution')));

  IF v_total > 0 THEN
    RETURN v_base || jsonb_build_object('ok', false, 'reason', 'has_history',
      'message', format(
        'Esta instância guarda %s conversa(s), %s mensagem(ns), %s contato(s), %s chatbot(s), %s sessão(ões) de chatbot, %s campanha(s) e %s follow-up(s). A exclusão foi recusada para não apagar esse histórico.',
        v_counts->>'conversations', v_counts->>'messages', v_counts->>'contacts',
        v_counts->>'chatbots', v_counts->>'chatbot_sessions', v_counts->>'campaigns',
        (v_counts->>'followups')::bigint + (v_counts->>'followup_enrollments')::bigint + (v_counts->>'followup_sequences')::bigint));
  END IF;

  RETURN v_base || jsonb_build_object('ok', true, 'reason', 'empty');
END;
$function$;

COMMENT ON FUNCTION public.whatsapp_instance_delete_check(uuid) IS
  'Decide se o chamador pode excluir a instância: unauthenticated → forbidden (sem whatsapp.configure) → not_found (inexistente ou Conta alheia) → has_history. Interna.';

REVOKE ALL ON FUNCTION public.whatsapp_instance_delete_check(uuid) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Preview — o modal chama ao abrir, para mostrar os números reais
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_instance_delete_preview(p_instance_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT public.whatsapp_instance_delete_check(p_instance_id);
$function$;

COMMENT ON FUNCTION public.whatsapp_instance_delete_preview(uuid) IS
  'Somente leitura. Devolve {ok, reason, counts, total, access, instance} — o que o modal de exclusão mostra. Não escreve nada.';

REVOKE ALL ON FUNCTION public.whatsapp_instance_delete_preview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.whatsapp_instance_delete_preview(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. A exclusão — uma transação; recusa antes de tocar em qualquer linha
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_whatsapp_instance(p_instance_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_check        jsonb;
  v_vault_ids    uuid[];
  v_vault_n      int := 0;
  v_logs_n       bigint;
  v_attempts_n   bigint;
  v_conn         jsonb;
BEGIN
  -- Lock ANTES de contar: quem insere filho (webhook) toma FOR KEY SHARE na
  -- instância e espera este FOR UPDATE. Se a instância não existe, o lock
  -- não acha nada e a checagem devolve not_found.
  PERFORM 1 FROM public.whatsapp_instances WHERE id = p_instance_id FOR UPDATE;

  v_check := public.whatsapp_instance_delete_check(p_instance_id);
  IF NOT (v_check->>'ok')::boolean THEN
    RETURN v_check;
  END IF;

  -- O que vai embora junto — para o relatório de volta.
  SELECT array_agg(vault_secret_id) INTO v_vault_ids
    FROM public.instance_secrets WHERE instance_id = p_instance_id;
  SELECT count(*) INTO v_logs_n     FROM public.webhook_logs                   WHERE whatsapp_instance_id = p_instance_id;
  SELECT count(*) INTO v_attempts_n FROM public.webhook_configuration_attempts WHERE whatsapp_instance_id = p_instance_id;
  SELECT connection_config INTO v_conn FROM public.whatsapp_instances WHERE id = p_instance_id;

  -- A linha. Cascateia instance_secrets, webhook_logs e
  -- webhook_configuration_attempts. Se um dependente NO ACTION apareceu entre
  -- a contagem e aqui, o próprio FK levanta 23503 e a função inteira desfaz.
  DELETE FROM public.whatsapp_instances WHERE id = p_instance_id;

  IF v_vault_ids IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = ANY (v_vault_ids);
    GET DIAGNOSTICS v_vault_n = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'reason', 'deleted',
    'access', v_check->'access',
    'instance', v_check->'instance',
    -- Só a edge function lê isto (para encerrar a sessão no provedor); ela
    -- NÃO devolve ao navegador.
    'connection_config', v_conn,
    'removed', jsonb_build_object(
      'vault_secrets', v_vault_n,
      'webhook_logs', v_logs_n,
      'webhook_configuration_attempts', v_attempts_n));
END;
$function$;

COMMENT ON FUNCTION public.delete_whatsapp_instance(uuid) IS
  'Exclui uma instância SEM histórico, numa transação: checagem (whatsapp_instance_delete_check) → lock → DELETE da linha (cascatas) → DELETE do segredo no Vault. Recusa com {ok:false, reason} antes de tocar em qualquer linha. Chamada pela edge function delete-whatsapp-instance, que depois encerra a sessão no provedor.';

REVOKE ALL ON FUNCTION public.delete_whatsapp_instance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_whatsapp_instance(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. Conferência + ledger
-- -----------------------------------------------------------------------------
DO $chk$
DECLARE
  n_pol int;
BEGIN
  IF to_regprocedure('public.whatsapp_instance_history_counts(uuid)') IS NULL
     OR to_regprocedure('public.whatsapp_instance_delete_check(uuid)') IS NULL
     OR to_regprocedure('public.whatsapp_instance_delete_preview(uuid)') IS NULL
     OR to_regprocedure('public.delete_whatsapp_instance(uuid)') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: alguma das quatro funções não existe.';
  END IF;
  IF to_regprocedure('public.gerente_child_store_ids()') IS NULL
     OR to_regprocedure('public.has_capability(text)') IS NULL
     OR to_regprocedure('public.is_super_admin_safe()') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: helper de acesso ausente (gerente_child_store_ids / has_capability / is_super_admin_safe).';
  END IF;
  -- As internas não podem ser chamadas direto pelo navegador.
  IF has_function_privilege('authenticated', 'public.whatsapp_instance_history_counts(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.whatsapp_instance_delete_check(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ABORTADO: função interna com EXECUTE para authenticated.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.whatsapp_instance_delete_preview(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.delete_whatsapp_instance(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ABORTADO: RPC pública sem EXECUTE para authenticated.';
  END IF;
  -- Prova de que este arquivo não mexeu em policy de whatsapp_instances.
  SELECT count(*) INTO n_pol FROM pg_policies WHERE schemaname = 'public' AND tablename = 'whatsapp_instances';
  IF n_pol <> 6 THEN
    RAISE EXCEPTION 'ABORTADO: whatsapp_instances deveria ter 6 policies, tem %. Este arquivo não cria nem apaga policy — investigue.', n_pol;
  END IF;

  INSERT INTO supabase_migrations.schema_migrations (version, name)
  VALUES ('20260919000001', 'delete_whatsapp_instance_rpc')
  ON CONFLICT (version) DO NOTHING;

  RAISE NOTICE 'delete_whatsapp_instance_rpc aplicada: 2 internas + 2 RPCs (preview, delete). Nenhuma policy alterada. Nenhuma instância tocada.';
END
$chk$;

-- =============================================================================
-- ROLLBACK
-- DROP FUNCTION IF EXISTS public.delete_whatsapp_instance(uuid);
-- DROP FUNCTION IF EXISTS public.whatsapp_instance_delete_preview(uuid);
-- DROP FUNCTION IF EXISTS public.whatsapp_instance_delete_check(uuid);
-- DROP FUNCTION IF EXISTS public.whatsapp_instance_history_counts(uuid);
-- DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260919000001';
-- (Sem a RPC, o modal novo mostra erro ao abrir e não oferece o botão de
--  excluir — não volta ao laço antigo, que foi removido do código.)
-- =============================================================================
