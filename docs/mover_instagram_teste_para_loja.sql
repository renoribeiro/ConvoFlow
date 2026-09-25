-- =============================================================================
-- mover_instagram_teste_para_loja.sql — a conta do Instagram de teste sai da
-- Conta Teste Gerente e vai para a Loja Teste (fatia 4a, 2026-09-25).
--
-- POR QUE: decisão do dono — o Instagram mora SÓ numa Loja, como o WhatsApp de
-- cada Loja. A instância de teste foi criada na Conta por engano.
--
-- O QUE MUDA: só o tenant_id destas linhas, e mais nada nelas:
--   whatsapp_instances           a instância 0c4029bb (1)
--   instance_secrets             o vínculo do cofre dela (1)
--   contacts                     os contatos do Instagram dela (3)
--   conversations                as conversas desses contatos (3)
--   messages                     as mensagens desses contatos (9)
--   instagram_echo_claims        os casamentos de eco dessas mensagens (1)
--   instagram_connection_alerts  avisos de conexão da instância (0)
-- Inventário medido antes (2026-09-25): todas as outras tabelas que apontam
-- para essas linhas estão vazias para elas (campanhas, follow-ups, chatbot,
-- rastreamento, etiquetas, automação, atribuição). conversation_participants
-- (1 linha) não tem tenant_id e aponta para o Gerente da Conta, que continua
-- válido numa Loja filha. Os ids não mudam: nada que aponta por id quebra.
--
-- Triggers que disparam com UPDATE só de tenant_id: update_contacts_updated_at
-- e update_whatsapp_instances_updated_at (carimbam updated_at das linhas
-- movidas) e trg_contacts_set_external_id (confere external_id, presente). Os
-- gatilhos de webhook/automação de contacts só valem para WhatsApp. Nenhum de
-- messages ou conversations dispara (são UPDATE OF outras colunas).
--
-- ATOMICIDADE: um bloco DO só (armadilha 4 do CLAUDE.md): guardas, as sete
-- escritas e a conferência. Qualquer RAISE desfaz tudo.
-- IDEMPOTENTE: rodar de novo depois de movido não muda nada e diz isso.
-- =============================================================================

DO $mover$
DECLARE
  INST  constant uuid := '0c4029bb-e0b6-4307-849b-d947ec4e4164';
  CONTA constant uuid := 'baf2559e-1d38-4c5c-af7d-f6c268a9154e';
  LOJA  constant uuid := 'e6a88a32-5deb-4aa1-b246-05a512882388';
  ENCAIXA constant uuid := '2165be9f-b6bb-49fb-ba6a-1dec6840c45a';
  v_ct uuid[];
  v_cv uuid[];
  v_ms uuid[];
  v_fora_antes  text;
  v_fora_depois text;
  v_enc_antes   text;
  v_enc_depois  text;
  n_inst int; n_sec int; n_ct int; n_cv int; n_ms int; n_echo int; n_alert int;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- ---- já movida? -----------------------------------------------------------
  IF EXISTS (SELECT 1 FROM public.whatsapp_instances WHERE id = INST AND tenant_id = LOJA) THEN
    RAISE NOTICE 'Nada a fazer: a instância % já está na Loja Teste.', INST;
    RETURN;
  END IF;

  -- ---- guardas de identidade ------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = LOJA AND kind = 'store' AND parent_tenant_id = CONTA) THEN
    RAISE EXCEPTION 'ABORTADO: a Loja Teste (%) não é uma Loja filha da Conta Teste Gerente. Nada foi movido.', LOJA;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.whatsapp_instances
                  WHERE id = INST AND tenant_id = CONTA AND provider = 'instagram'
                    AND connection_config ->> 'igAccountId' = '17841419262135883') THEN
    RAISE EXCEPTION 'ABORTADO: a instância % não é a conta de teste na Conta Teste Gerente. Nada foi movido.', INST;
  END IF;

  -- ---- inventário -----------------------------------------------------------
  v_ct := ARRAY(SELECT id FROM public.contacts
                 WHERE tenant_id = CONTA AND channel = 'instagram' AND whatsapp_instance_id = INST ORDER BY id);
  v_cv := ARRAY(SELECT id FROM public.conversations WHERE tenant_id = CONTA AND contact_id = ANY (v_ct) ORDER BY id);
  v_ms := ARRAY(SELECT id FROM public.messages WHERE tenant_id = CONTA AND contact_id = ANY (v_ct) ORDER BY id);

  -- Nada do Instagram na Conta pode ficar para trás.
  IF EXISTS (SELECT 1 FROM public.contacts WHERE tenant_id = CONTA AND channel = 'instagram' AND id <> ALL (v_ct))
  OR EXISTS (SELECT 1 FROM public.conversations WHERE tenant_id = CONTA AND channel = 'instagram' AND id <> ALL (v_cv))
  OR EXISTS (SELECT 1 FROM public.messages WHERE tenant_id = CONTA AND channel = 'instagram' AND id <> ALL (v_ms))
  OR EXISTS (SELECT 1 FROM public.messages WHERE whatsapp_instance_id = INST AND id <> ALL (v_ms)) THEN
    RAISE EXCEPTION 'ABORTADO: existe dado do Instagram na Conta fora do inventário. Nada foi movido.';
  END IF;
  -- Nenhum dado das outras tabelas pode depender destas linhas (medido: zero).
  IF EXISTS (SELECT 1 FROM public.chatbot_sessions WHERE contact_id = ANY (v_ct) OR whatsapp_instance_id = INST)
  OR EXISTS (SELECT 1 FROM public.contact_tags WHERE contact_id = ANY (v_ct))
  OR EXISTS (SELECT 1 FROM public.conversation_assignment_events WHERE conversation_id = ANY (v_cv))
  OR EXISTS (SELECT 1 FROM public.individual_followups WHERE contact_id = ANY (v_ct) OR whatsapp_instance_id = INST)
  OR EXISTS (SELECT 1 FROM public.followup_sequence_enrollments WHERE contact_id = ANY (v_ct) OR whatsapp_instance_id = INST)
  OR EXISTS (SELECT 1 FROM public.campaign_executions WHERE contact_id = ANY (v_ct))
  OR EXISTS (SELECT 1 FROM public.automation_executions WHERE contact_id = ANY (v_ct))
  OR EXISTS (SELECT 1 FROM public.lead_tracking WHERE contact_id = ANY (v_ct))
  OR EXISTS (SELECT 1 FROM public.tracking_events WHERE contact_id = ANY (v_ct))
  OR EXISTS (SELECT 1 FROM public.chatbots WHERE whatsapp_instance_id = INST)
  OR EXISTS (SELECT 1 FROM public.mass_message_campaigns WHERE whatsapp_instance_id = INST)
  OR EXISTS (SELECT 1 FROM public.follow_up_sequences WHERE whatsapp_instance_id = INST) THEN
    RAISE EXCEPTION 'ABORTADO: outra tabela passou a depender destas linhas desde o inventário. Nada foi movido.';
  END IF;
  -- A Loja não pode ter contato do Instagram com o mesmo IGSID (chave única).
  IF EXISTS (SELECT 1 FROM public.contacts l
              WHERE l.tenant_id = LOJA AND l.channel = 'instagram'
                AND l.external_id IN (SELECT external_id FROM public.contacts WHERE id = ANY (v_ct))) THEN
    RAISE EXCEPTION 'ABORTADO: a Loja já tem contato do Instagram com o mesmo IGSID. Nada foi movido.';
  END IF;

  -- ---- retrato do que NÃO pode mudar --------------------------------------
  SELECT md5(string_agg(t.tenant_id::text || ':' || t.tabela || ':' || t.n, ',' ORDER BY t.tenant_id, t.tabela))
    INTO v_fora_antes
    FROM (
      SELECT tenant_id, 'contacts' AS tabela, count(*) AS n FROM public.contacts WHERE tenant_id NOT IN (CONTA, LOJA) GROUP BY 1
      UNION ALL SELECT tenant_id, 'conversations', count(*) FROM public.conversations WHERE tenant_id NOT IN (CONTA, LOJA) GROUP BY 1
      UNION ALL SELECT tenant_id, 'messages', count(*) FROM public.messages WHERE tenant_id NOT IN (CONTA, LOJA) GROUP BY 1
      UNION ALL SELECT tenant_id, 'whatsapp_instances', count(*) FROM public.whatsapp_instances WHERE tenant_id NOT IN (CONTA, LOJA) GROUP BY 1
    ) t;
  SELECT md5(string_agg(x, ',' ORDER BY x)) INTO v_enc_antes FROM (
    SELECT 'c:' || id || ':' || coalesce(updated_at::text, '') AS x FROM public.contacts WHERE tenant_id = ENCAIXA
    UNION ALL SELECT 'v:' || id || ':' || coalesce(updated_at::text, '') FROM public.conversations WHERE tenant_id = ENCAIXA
    UNION ALL SELECT 'i:' || id || ':' || coalesce(updated_at::text, '') FROM public.whatsapp_instances WHERE tenant_id = ENCAIXA
  ) e;

  -- ---- as escritas ----------------------------------------------------------
  UPDATE public.whatsapp_instances SET tenant_id = LOJA WHERE id = INST AND tenant_id = CONTA;
  GET DIAGNOSTICS n_inst = ROW_COUNT;
  UPDATE public.instance_secrets SET tenant_id = LOJA WHERE instance_id = INST AND tenant_id = CONTA;
  GET DIAGNOSTICS n_sec = ROW_COUNT;
  UPDATE public.contacts SET tenant_id = LOJA WHERE id = ANY (v_ct) AND tenant_id = CONTA;
  GET DIAGNOSTICS n_ct = ROW_COUNT;
  UPDATE public.conversations SET tenant_id = LOJA WHERE id = ANY (v_cv) AND tenant_id = CONTA;
  GET DIAGNOSTICS n_cv = ROW_COUNT;
  UPDATE public.messages SET tenant_id = LOJA WHERE id = ANY (v_ms) AND tenant_id = CONTA;
  GET DIAGNOSTICS n_ms = ROW_COUNT;
  UPDATE public.instagram_echo_claims SET tenant_id = LOJA WHERE message_id = ANY (v_ms) AND tenant_id = CONTA;
  GET DIAGNOSTICS n_echo = ROW_COUNT;
  UPDATE public.instagram_connection_alerts SET tenant_id = LOJA WHERE instance_id = INST AND tenant_id = CONTA;
  GET DIAGNOSTICS n_alert = ROW_COUNT;

  -- ---- conferência ----------------------------------------------------------
  IF n_inst <> 1 OR n_sec <> 1 OR n_ct <> cardinality(v_ct) OR n_cv <> cardinality(v_cv) OR n_ms <> cardinality(v_ms) THEN
    RAISE EXCEPTION 'ABORTADO: movidas % instância, % cofre, %/% contatos, %/% conversas, %/% mensagens. Nada foi movido.',
      n_inst, n_sec, n_ct, cardinality(v_ct), n_cv, cardinality(v_cv), n_ms, cardinality(v_ms);
  END IF;
  IF EXISTS (SELECT 1 FROM public.contacts WHERE tenant_id = CONTA AND channel = 'instagram')
  OR EXISTS (SELECT 1 FROM public.conversations WHERE tenant_id = CONTA AND channel = 'instagram')
  OR EXISTS (SELECT 1 FROM public.messages WHERE tenant_id = CONTA AND channel = 'instagram')
  OR EXISTS (SELECT 1 FROM public.whatsapp_instances WHERE tenant_id = CONTA AND provider = 'instagram') THEN
    RAISE EXCEPTION 'ABORTADO: sobrou Instagram na Conta. Nada foi movido.';
  END IF;
  -- Conversa e mensagem continuam do mesmo contato, agora todos na Loja.
  IF EXISTS (SELECT 1 FROM public.messages m JOIN public.contacts c ON c.id = m.contact_id
              WHERE m.id = ANY (v_ms) AND (m.tenant_id <> c.tenant_id OR m.tenant_id <> LOJA))
  OR EXISTS (SELECT 1 FROM public.conversations v JOIN public.contacts c ON c.id = v.contact_id
              WHERE v.id = ANY (v_cv) AND (v.tenant_id <> c.tenant_id OR v.tenant_id <> LOJA)) THEN
    RAISE EXCEPTION 'ABORTADO: mensagem ou conversa ficou em Conta diferente do contato. Nada foi movido.';
  END IF;
  SELECT md5(string_agg(t.tenant_id::text || ':' || t.tabela || ':' || t.n, ',' ORDER BY t.tenant_id, t.tabela))
    INTO v_fora_depois
    FROM (
      SELECT tenant_id, 'contacts' AS tabela, count(*) AS n FROM public.contacts WHERE tenant_id NOT IN (CONTA, LOJA) GROUP BY 1
      UNION ALL SELECT tenant_id, 'conversations', count(*) FROM public.conversations WHERE tenant_id NOT IN (CONTA, LOJA) GROUP BY 1
      UNION ALL SELECT tenant_id, 'messages', count(*) FROM public.messages WHERE tenant_id NOT IN (CONTA, LOJA) GROUP BY 1
      UNION ALL SELECT tenant_id, 'whatsapp_instances', count(*) FROM public.whatsapp_instances WHERE tenant_id NOT IN (CONTA, LOJA) GROUP BY 1
    ) t;
  IF v_fora_depois IS DISTINCT FROM v_fora_antes THEN
    RAISE EXCEPTION 'ABORTADO: contagens de outras Contas/Lojas mudaram. Nada foi movido.';
  END IF;
  SELECT md5(string_agg(x, ',' ORDER BY x)) INTO v_enc_depois FROM (
    SELECT 'c:' || id || ':' || coalesce(updated_at::text, '') AS x FROM public.contacts WHERE tenant_id = ENCAIXA
    UNION ALL SELECT 'v:' || id || ':' || coalesce(updated_at::text, '') FROM public.conversations WHERE tenant_id = ENCAIXA
    UNION ALL SELECT 'i:' || id || ':' || coalesce(updated_at::text, '') FROM public.whatsapp_instances WHERE tenant_id = ENCAIXA
  ) e;
  IF v_enc_depois IS DISTINCT FROM v_enc_antes THEN
    RAISE EXCEPTION 'ABORTADO: alguma linha da EncaixaRH mudou. Nada foi movido.';
  END IF;

  RAISE NOTICE 'OK: movidos para a Loja Teste — instância %, cofre %, contatos %, conversas %, mensagens %, ecos %, avisos %.',
    n_inst, n_sec, n_ct, n_cv, n_ms, n_echo, n_alert;
END
$mover$;

-- Conferência (somente leitura): tudo do Instagram de teste na Loja Teste.
SELECT 'whatsapp_instances' AS tabela, tenant_id, count(*) FROM public.whatsapp_instances WHERE id = '0c4029bb-e0b6-4307-849b-d947ec4e4164' GROUP BY 2
UNION ALL SELECT 'contacts', tenant_id, count(*) FROM public.contacts WHERE channel = 'instagram' GROUP BY 2
UNION ALL SELECT 'conversations', tenant_id, count(*) FROM public.conversations WHERE channel = 'instagram' GROUP BY 2
UNION ALL SELECT 'messages', tenant_id, count(*) FROM public.messages WHERE channel = 'instagram' GROUP BY 2
ORDER BY 1, 2;
