-- ============================================================================
-- TEST DATA ONLY — gerente.teste@re9.online
-- ============================================================================
--
-- Popula a Conta de testes com 5 contatos, 5 conversas e mensagens realistas
-- em pt-BR, para exercitar filtros, agrupamentos e estados da UI sem tocar em
-- nenhuma API de WhatsApp e sem risco para contas reais.
--
-- COMO RODAR
--   SQL Editor do Supabase (ou psql com service_role). Precisa de um papel
--   privilegiado porque resolve a Conta lendo `auth.users`.
--
-- SEGURANÇA
--   - Tudo roda dentro de uma única transação: qualquer erro aborta o conjunto
--     inteiro (BEGIN/COMMIT + RAISE EXCEPTION nas pré-condições).
--   - O tenant é resolvido EM TEMPO DE EXECUÇÃO a partir do e-mail. Não há
--     nenhum UUID de usuário/Conta fixo no arquivo.
--   - Todo INSERT, UPDATE e DELETE é filtrado por `tenant_id = <Conta de teste>`
--     E pela lista fixa de telefones do seed. Nenhuma linha de outra Conta é
--     alcançável por este script.
--   - Se o e-mail não existir, o script falha antes de escrever qualquer coisa.
--
-- IDEMPOTÊNCIA
--   Rodar duas vezes não duplica nada. O script apaga os dados do seed anterior
--   (identificados por tenant + telefone) e recria. Os contatos mantêm o mesmo
--   `id` entre execuções, porque o upsert usa a chave única natural.
--
-- EFEITOS COLATERAIS (verificados nesta Conta em 2026-08-10)
--   `messages` e `contacts` têm triggers de webhook e de automação. Nesta Conta
--   não há webhooks nem fluxos cadastrados, então eles não fazem nada. Se um dia
--   houver, o seed vai enfileirar eventos — confira antes de rodar.
--
-- PARA LIMPAR TUDO: veja o bloco comentado no fim do arquivo.
-- ============================================================================

BEGIN;

DO $seed$
DECLARE
  c_email     constant text   := 'gerente.teste@re9.online';
  c_chave_inst constant text  := 'seed-sandbox-gerente-teste';

  -- Chave natural do seed: só estes telefones são tocados.
  c_telefones constant text[] := ARRAY[
    '5585991112201', -- Ana Beatriz Nogueira
    '5585991112202', -- Bruno Carvalho Lima
    '5585991112203', -- Carla Menezes Furtado
    '5585991112204', -- Diego Albuquerque Rocha
    '5585991112205'  -- Eduarda Pinheiro Sales
  ];

  v_tenant    uuid;
  v_tenant_nome text;
  v_profile   uuid;
  v_instance  uuid;
  v_tag       uuid;
  v_now       timestamptz := now();

  v_contatos  int;
  v_conversas int;
  v_msgs      int;
BEGIN
  -- --------------------------------------------------------------------------
  -- 1. Resolve a Conta a partir do e-mail (nada é fixo no código)
  -- --------------------------------------------------------------------------
  SELECT p.tenant_id, p.id, t.name
    INTO v_tenant, v_profile, v_tenant_nome
  FROM auth.users u
  JOIN public.profiles p ON p.user_id = u.id
  JOIN public.tenants  t ON t.id = p.tenant_id
  WHERE lower(u.email) = c_email
  ORDER BY p.created_at
  LIMIT 1;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION
      'Conta de teste nao encontrada para %. Verifique se o usuario existe e tem profile com tenant_id. Nada foi inserido.',
      c_email;
  END IF;

  RAISE NOTICE 'Semeando a Conta "%" (tenant_id=%)', v_tenant_nome, v_tenant;

  -- --------------------------------------------------------------------------
  -- 2. Instância sandbox — `messages.whatsapp_instance_id` é NOT NULL.
  --    Fica desconectada de propósito: existe só para dar coerência aos dados,
  --    não para enviar nada.
  -- --------------------------------------------------------------------------
  SELECT id INTO v_instance
  FROM public.whatsapp_instances
  WHERE tenant_id = v_tenant AND instance_key = c_chave_inst;

  IF v_instance IS NULL THEN
    INSERT INTO public.whatsapp_instances (
      tenant_id, name, instance_key, phone_number, status, provider, is_active
    ) VALUES (
      v_tenant, 'Sandbox — dados de teste', c_chave_inst,
      '5585991110000', 'disconnected', 'evolution', true
    )
    RETURNING id INTO v_instance;
    RAISE NOTICE 'Instancia sandbox criada (%)', v_instance;
  END IF;

  -- --------------------------------------------------------------------------
  -- 3. Limpa o seed anterior (idempotência).
  --    Sempre restrito a tenant + telefones do seed.
  -- --------------------------------------------------------------------------
  DELETE FROM public.messages
   WHERE tenant_id = v_tenant
     AND contact_id IN (
       SELECT id FROM public.contacts
        WHERE tenant_id = v_tenant AND phone = ANY(c_telefones)
     );

  DELETE FROM public.individual_followups
   WHERE tenant_id = v_tenant
     AND contact_id IN (
       SELECT id FROM public.contacts
        WHERE tenant_id = v_tenant AND phone = ANY(c_telefones)
     );

  DELETE FROM public.contact_tags
   WHERE contact_id IN (
     SELECT id FROM public.contacts
      WHERE tenant_id = v_tenant AND phone = ANY(c_telefones)
   );

  DELETE FROM public.conversations
   WHERE tenant_id = v_tenant
     AND contact_id IN (
       SELECT id FROM public.contacts
        WHERE tenant_id = v_tenant AND phone = ANY(c_telefones)
     );

  -- O upsert do passo 4 casa pela chave única (tenant_id, phone,
  -- whatsapp_instance_id). Se um seed anterior tivesse apontado para outra
  -- instância, o ON CONFLICT não casaria e criaria contato duplicado — então
  -- realinhamos antes.
  UPDATE public.contacts
     SET whatsapp_instance_id = v_instance
   WHERE tenant_id = v_tenant
     AND phone = ANY(c_telefones)
     AND whatsapp_instance_id IS DISTINCT FROM v_instance;

  -- --------------------------------------------------------------------------
  -- 4. Contatos — 2 novos, 2 recorrentes, 1 sem atividade recente.
  --    created_at espalhado nos últimos 30 dias.
  -- --------------------------------------------------------------------------
  INSERT INTO public.contacts (
    tenant_id, whatsapp_instance_id, phone, name, email,
    created_at, updated_at, last_interaction_at, notes, custom_fields,
    opt_in_mass_message
  )
  SELECT
    v_tenant, v_instance, d.telefone, d.nome, d.email,
    v_now - make_interval(days => d.criado_dias),
    v_now,
    v_now - make_interval(mins => d.ultima_min),
    d.observacao,
    jsonb_build_object('seed', true, 'perfil_teste', d.perfil),
    true
  FROM (VALUES
    ('5585991112201', 'Ana Beatriz Nogueira',    'ana.nogueira@exemplo.com.br',      2,   1560, 'novo',
     NULL::text),
    ('5585991112202', 'Bruno Carvalho Lima',     'bruno.lima@exemplo.com.br',        4,    160, 'novo',
     NULL::text),
    ('5585991112203', 'Carla Menezes Furtado',   'carla.menezes@exemplo.com.br',    28,   2854, 'recorrente',
     'Cliente desde o ano passado. Prefere contato pela manhã.'),
    ('5585991112204', 'Diego Albuquerque Rocha', 'diego.rocha@exemplo.com.br',      22,   4350, 'recorrente',
     'Já contratou o plano mensal em 2025. Avaliando o anual.'),
    ('5585991112205', 'Eduarda Pinheiro Sales',  'eduarda.sales@exemplo.com.br',    30,  34570, 'sem_atividade',
     'Proposta de 3 unidades parada na diretoria. Retomar depois do dia 20.')
  ) AS d(telefone, nome, email, criado_dias, ultima_min, perfil, observacao)
  ON CONFLICT (tenant_id, phone, whatsapp_instance_id) DO UPDATE SET
    name                = EXCLUDED.name,
    email               = EXCLUDED.email,
    created_at          = EXCLUDED.created_at,
    last_interaction_at = EXCLUDED.last_interaction_at,
    notes               = EXCLUDED.notes,
    custom_fields       = EXCLUDED.custom_fields,
    updated_at          = now();

  GET DIAGNOSTICS v_contatos = ROW_COUNT;

  -- --------------------------------------------------------------------------
  -- 5. Conversas — uma por contato. Os valores finais de unread/arquivada são
  --    aplicados no passo 8, porque o trigger de mensagens sobrescreve.
  -- --------------------------------------------------------------------------
  INSERT INTO public.conversations (
    tenant_id, contact_id, whatsapp_instance_id, last_message_at,
    unread_count, is_archived, created_at, updated_at
  )
  SELECT v_tenant, ct.id, v_instance, ct.last_interaction_at, 0, false, ct.created_at, v_now
  FROM public.contacts ct
  WHERE ct.tenant_id = v_tenant AND ct.phone = ANY(c_telefones)
  ON CONFLICT (tenant_id, contact_id) DO UPDATE SET
    whatsapp_instance_id = EXCLUDED.whatsapp_instance_id,
    updated_at           = now();

  GET DIAGNOSTICS v_conversas = ROW_COUNT;

  -- --------------------------------------------------------------------------
  -- 6. Mensagens — 6 a 10 por conversa. `min_atras` = minutos antes de agora,
  --    então a ordem cronológica é decrescente nessa coluna.
  -- --------------------------------------------------------------------------
  INSERT INTO public.messages (
    tenant_id, whatsapp_instance_id, contact_id, conversation_id,
    direction, message_type, content, status, created_at, source, evolution_message_id
  )
  SELECT
    v_tenant, v_instance, ct.id, cv.id,
    m.direcao, 'text', m.conteudo, m.situacao,
    v_now - make_interval(mins => m.min_atras),
    'seed',
    'seed-' || right(m.telefone, 4) || '-' || lpad(m.ordem::text, 2, '0')
  FROM (VALUES
    -- ---- Ana (8) — aberta, aguardando resposta do CLIENTE (última é do atendente)
    ('5585991112201',  1, 'inbound',  'Oi, bom dia! Vi o anúncio de vocês no Instagram e queria saber mais sobre o plano mensal.', 'read', 1580),
    ('5585991112201',  2, 'outbound', 'Bom dia, Ana! Tudo bem? Que bom que você chegou até a gente 😊 O plano mensal sai por R$ 149 e já inclui suporte prioritário.', 'read', 1576),
    ('5585991112201',  3, 'inbound',  'Entendi. E tem fidelidade?', 'read', 1570),
    ('5585991112201',  4, 'outbound', 'Não tem fidelidade nenhuma, você pode cancelar quando quiser.', 'read', 1566),
    ('5585991112201',  5, 'inbound',  'Legal. E a instalação, tem algum custo?', 'read', 1560),
    ('5585991112201',  6, 'outbound', 'A instalação é gratuita para contratações feitas ainda este mês.', 'read', 1554),
    ('5585991112201',  7, 'inbound',  'Perfeito, vou conversar com meu sócio e te retorno.', 'read', 1548),
    ('5585991112201',  8, 'outbound', 'Combinado, Ana! Fico no aguardo. Qualquer dúvida é só chamar por aqui 👍', 'delivered', 1542),

    -- ---- Bruno (8) — aberta, aguardando o ATENDENTE (3 últimas não lidas)
    ('5585991112202',  1, 'outbound', 'Bom dia, Bruno! Aqui é da RE9. Recebemos seu cadastro, posso te ajudar?', 'read', 200),
    ('5585991112202',  2, 'inbound',  'Bom dia! Sim, queria entender como funciona a integração com o meu sistema.', 'read', 196),
    ('5585991112202',  3, 'outbound', 'Claro. Hoje a gente integra via API e também por importação de planilha. Qual sistema você usa?', 'read', 190),
    ('5585991112202',  4, 'inbound',  'Uso o Bling.', 'read', 184),
    ('5585991112202',  5, 'outbound', 'Perfeito, com o Bling a integração é direta — leva uns 10 minutos pra configurar.', 'read', 178),
    ('5585991112202',  6, 'inbound',  'Consigo migrar meus contatos antigos junto?', 'received', 172),
    ('5585991112202',  7, 'inbound',  'E tem algum custo extra nessa migração?', 'received', 166),
    ('5585991112202',  8, 'inbound',  'Fico no aguardo, obrigado!', 'received', 160),

    -- ---- Carla (9) — resolvida / arquivada
    ('5585991112203',  1, 'inbound',  'Oi! Meu boleto deste mês não chegou no e-mail.', 'read', 2900),
    ('5585991112203',  2, 'outbound', 'Oi, Carla! Vou verificar aqui pra você, só um instante.', 'read', 2896),
    ('5585991112203',  3, 'outbound', 'Achei: o boleto foi enviado para um e-mail antigo. Quer que eu atualize o cadastro?', 'read', 2890),
    ('5585991112203',  4, 'inbound',  'Isso, pode trocar para carla.menezes@exemplo.com.br', 'read', 2884),
    ('5585991112203',  5, 'outbound', 'Atualizado! Acabei de reenviar o boleto para o endereço novo.', 'read', 2878),
    ('5585991112203',  6, 'inbound',  'Chegou aqui, obrigada!', 'read', 2872),
    ('5585991112203',  7, 'outbound', 'Que ótimo 😊 Precisa de mais alguma coisa?', 'read', 2866),
    ('5585991112203',  8, 'inbound',  'Não, era só isso mesmo. Valeu!', 'read', 2860),
    ('5585991112203',  9, 'outbound', 'Imagina! Qualquer coisa estamos por aqui. Boa semana!', 'read', 2854),

    -- ---- Diego (6) — recebe a etiqueta "Interessado"
    ('5585991112204',  1, 'inbound',  'Boa tarde, vocês fazem o plano anual com desconto?', 'read', 4380),
    ('5585991112204',  2, 'outbound', 'Boa tarde, Diego! Fazemos sim: no anual são 2 meses de cortesia.', 'read', 4374),
    ('5585991112204',  3, 'inbound',  'Ficaria quanto no total?', 'read', 4368),
    ('5585991112204',  4, 'outbound', 'R$ 1.490 à vista, ou 10x de R$ 149 sem juros no cartão.', 'read', 4362),
    ('5585991112204',  5, 'inbound',  'Gostei. Consegue me mandar a proposta por escrito?', 'read', 4356),
    ('5585991112204',  6, 'outbound', 'Claro! Já preparo e te envio ainda hoje.', 'read', 4350),

    -- ---- Eduarda (6) — sem atividade recente, com follow-up agendado
    ('5585991112205',  1, 'inbound',  'Oi, queria um orçamento para 3 unidades.', 'read', 34600),
    ('5585991112205',  2, 'outbound', 'Oi, Eduarda! Claro. As 3 unidades ficam em Fortaleza mesmo?', 'read', 34594),
    ('5585991112205',  3, 'inbound',  'Duas em Fortaleza e uma em Maracanaú.', 'read', 34588),
    ('5585991112205',  4, 'outbound', 'Perfeito. Consigo fechar o pacote das 3 por R$ 390/mês.', 'read', 34582),
    ('5585991112205',  5, 'inbound',  'Vou levar para a diretoria e te falo depois do dia 20.', 'read', 34576),
    ('5585991112205',  6, 'outbound', 'Combinado! Deixo anotado para te procurar depois do dia 20 👍', 'read', 34570)
  ) AS m(telefone, ordem, direcao, conteudo, situacao, min_atras)
  JOIN public.contacts      ct ON ct.tenant_id = v_tenant AND ct.phone = m.telefone
  JOIN public.conversations cv ON cv.tenant_id = v_tenant AND cv.contact_id = ct.id
  ORDER BY m.min_atras DESC;

  GET DIAGNOSTICS v_msgs = ROW_COUNT;

  -- --------------------------------------------------------------------------
  -- 7. Etiqueta "Interessado" aplicada ao Diego
  -- --------------------------------------------------------------------------
  INSERT INTO public.tags (tenant_id, name, color, description)
  VALUES (v_tenant, 'Interessado', '#DAE27C', 'Lead demonstrou interesse — dados de teste')
  ON CONFLICT (tenant_id, name) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_tag;

  INSERT INTO public.contact_tags (contact_id, tag_id)
  SELECT ct.id, v_tag
  FROM public.contacts ct
  WHERE ct.tenant_id = v_tenant AND ct.phone = '5585991112204'
  ON CONFLICT (contact_id, tag_id) DO NOTHING;

  -- --------------------------------------------------------------------------
  -- 8. Follow-up agendado da Eduarda.
  --    mode = 'manual' de propósito: é um lembrete para o atendente, não entra
  --    na fila de envio automático do cron. A nota do contato já foi gravada
  --    em `contacts.notes` no passo 4.
  -- --------------------------------------------------------------------------
  INSERT INTO public.individual_followups (
    tenant_id, contact_id, whatsapp_instance_id, assigned_to,
    task, due_date, priority, type, mode, status, notes, source, tags
  )
  SELECT
    v_tenant, ct.id, v_instance, v_profile,
    'Retomar contato sobre a proposta das 3 unidades',
    date_trunc('hour', v_now) + interval '3 days' + interval '9 hours',
    'medium', 'whatsapp', 'manual', 'pending',
    'Cliente pediu retorno depois do dia 20. Levar a proposta revisada com o desconto de volume.',
    'seed',
    ARRAY['teste']
  FROM public.contacts ct
  WHERE ct.tenant_id = v_tenant AND ct.phone = '5585991112205';

  -- --------------------------------------------------------------------------
  -- 9. Estado final das conversas.
  --    O trigger `update_conversation_on_message` soma +1 no unread a cada
  --    mensagem inbound, então os valores corretos são gravados agora, no fim.
  -- --------------------------------------------------------------------------
  UPDATE public.conversations cv
  SET last_message_at = (SELECT max(m.created_at) FROM public.messages m WHERE m.conversation_id = cv.id),
      unread_count    = e.nao_lidas,
      is_archived     = e.arquivada,
      updated_at      = v_now
  FROM (VALUES
    ('5585991112201', 0, false),  -- Ana    — aguardando o cliente
    ('5585991112202', 3, false),  -- Bruno  — 3 não lidas, aguardando atendente
    ('5585991112203', 0, true),   -- Carla  — resolvida/arquivada
    ('5585991112204', 0, false),  -- Diego  — etiquetada
    ('5585991112205', 0, false)   -- Eduarda — com follow-up agendado
  ) AS e(telefone, nao_lidas, arquivada)
  JOIN public.contacts ct
    ON ct.tenant_id = v_tenant AND ct.phone = e.telefone
  WHERE cv.tenant_id = v_tenant AND cv.contact_id = ct.id;

  RAISE NOTICE 'Pronto: % contatos, % conversas, % mensagens.', v_contatos, v_conversas, v_msgs;
END;
$seed$;

COMMIT;

-- ============================================================================
-- Conferência — o que ficou na Conta de teste
-- ============================================================================
SELECT
  ct.name                                             AS contato,
  ct.phone                                            AS telefone,
  ct.custom_fields ->> 'perfil_teste'                 AS perfil,
  date_trunc('day', ct.created_at)::date              AS criado_em,
  (SELECT count(*) FROM public.messages m WHERE m.conversation_id = cv.id) AS mensagens,
  cv.unread_count                                     AS nao_lidas,
  cv.is_archived                                      AS arquivada,
  (SELECT string_agg(t.name, ', ') FROM public.contact_tags xt
      JOIN public.tags t ON t.id = xt.tag_id WHERE xt.contact_id = ct.id) AS etiquetas,
  (SELECT count(*) FROM public.individual_followups f WHERE f.contact_id = ct.id) AS followups
FROM public.contacts ct
JOIN public.conversations cv ON cv.contact_id = ct.id AND cv.tenant_id = ct.tenant_id
WHERE ct.tenant_id = (
        SELECT p.tenant_id FROM auth.users u
        JOIN public.profiles p ON p.user_id = u.id
        WHERE lower(u.email) = 'gerente.teste@re9.online' LIMIT 1
      )
  AND ct.custom_fields ->> 'seed' = 'true'
ORDER BY cv.last_message_at DESC;

-- ============================================================================
-- LIMPEZA — remove tudo que este script criou (descomente e rode)
--
-- A ordem importa: `messages.contact_id` NÃO tem ON DELETE CASCADE, então as
-- mensagens precisam sair antes dos contatos. As demais dependentes
-- (conversations, contact_tags, individual_followups) saem por cascade.
-- ============================================================================
-- BEGIN;
-- DO $limpeza$
-- DECLARE
--   v_tenant uuid;
-- BEGIN
--   SELECT p.tenant_id INTO v_tenant
--   FROM auth.users u
--   JOIN public.profiles p ON p.user_id = u.id
--   WHERE lower(u.email) = 'gerente.teste@re9.online'
--   ORDER BY p.created_at LIMIT 1;
--
--   IF v_tenant IS NULL THEN
--     RAISE EXCEPTION 'Conta de teste nao encontrada. Nada foi apagado.';
--   END IF;
--
--   DELETE FROM public.messages
--    WHERE tenant_id = v_tenant
--      AND contact_id IN (SELECT id FROM public.contacts
--                          WHERE tenant_id = v_tenant
--                            AND custom_fields ->> 'seed' = 'true');
--
--   DELETE FROM public.contacts
--    WHERE tenant_id = v_tenant
--      AND custom_fields ->> 'seed' = 'true';
--
--   DELETE FROM public.whatsapp_instances
--    WHERE tenant_id = v_tenant
--      AND instance_key = 'seed-sandbox-gerente-teste';
--
--   -- A etiqueta "Interessado" fica: pode já estar em uso fora do seed.
-- END;
-- $limpeza$;
-- COMMIT;
