-- =============================================================================
-- teste_canal_contato.sql — rede de segurança da migração
-- 20260922000002_contacts_conversations_channel (fatia 1/5 do Instagram).
--
-- O QUE FAZ
--   Semeia UMA organização falsa (Conta K + Loja K + Loja K2, uma instância de
--   WhatsApp, quatro contatos) e afirma, cenário a cenário:
--
--   K0  O BACKFILL, medido contra os dados REAIS (não a fixture): nenhum
--       contato sem external_id, nenhum contato de WhatsApp com external_id
--       diferente de phone, nenhuma linha fora do canal 'whatsapp' em contacts
--       nem em conversations. É a afirmação que a sabotagem derruba.
--   K1  Contato de WhatsApp continua sendo achado PELO TELEFONE: a RPC de
--       entrada chamada duas vezes com o mesmo telefone devolve o MESMO
--       contact_id e não cria contato novo.
--   K2  Contato SEM telefone existe: canal 'instagram', phone NULL,
--       external_id = IGSID. É o que a fatia 1 tinha que destravar.
--   K3  O MESMO identificador em canais diferentes NÃO colide: '5511999999001'
--       como telefone de WhatsApp e como IGSID de Instagram convivem na mesma
--       Loja, em duas linhas.
--   K4  O MESMO identificador em Lojas diferentes NÃO colide.
--   K5  A RPC de entrada se comporta EXATAMENTE como antes para WhatsApp:
--       cria o contato com phone preenchido, grava a mensagem inbound, a
--       conversa nasce, unread_count vai a 1 e o retorno mantém o formato
--       ('success', 'contact_id', 'message_id', 'chatbot_response').
--   K6  A invariante external_id = phone é FORÇADA, não sugerida: inserir um
--       contato de WhatsApp com external_id mentiroso grava o telefone assim
--       mesmo; e trocar o telefone arrasta o external_id junto.
--   K7  Contato de WhatsApp sem telefone é RECUSADO, com o mesmo SQLSTATE
--       (23502) que o NOT NULL da coluna dava antes da migração.
--   K8  Identificador repetido no mesmo (Loja, canal) é recusado (23505).
--   K9  conversations.channel é DERIVADO do contato, em todo caminho de
--       criação: conversa de contato de WhatsApp nasce 'whatsapp', conversa de
--       contato de Instagram nasce 'instagram' — inclusive quando quem cria é
--       a trigger do caminho de entrada, e inclusive se alguém insere a
--       conversa dizendo o canal errado na mão.
--   K10 whatsapp_instances aceita provider='instagram' e continua recusando
--       qualquer outro valor.
--   K11 A ordem das triggers de `messages` não mudou: zz_rotation_assign_on_inbound
--       continua sendo a ÚLTIMA. (A migração não mexeu em messages, e este é o
--       cheque que prova.)
--
-- SEGURANÇA — por que dá para rodar contra produção
--   BEGIN ... ROLLBACK incondicional. UUIDs de fixture com prefixo c4c4c4c4-.
--   Guarda de colisão antes de semear. K0 só LÊ os dados reais. Nada aqui
--   escreve fora da transação.
--
-- COMO RODAR
--   Papel `postgres` (SQL Editor ou o MCP de escrita), o arquivo inteiro de uma
--   vez. O placar sai no fim.
--   Medido em 2026-09-22 contra produção: 36/36 verde.
--
-- MODO AUTO-TESTE (prova que a suíte sabe falhar)
--   Descomente o bloco SABOTAGEM logo abaixo da semeadura: ele estraga o
--   backfill de UM contato real (external_id passa a ser 'SABOTADO'), dentro da
--   transação, e o ROLLBACK desfaz.
--   Medido em 2026-09-22 contra produção: K0b vira FAIL (esperado 0, veio 1) e
--   o placar fecha 35 ok / 1 FAIL — só K0b acusa, as outras 35 seguem verdes,
--   que é exatamente o alvo da sabotagem. Sem a sabotagem, 36/36.
--   Conferido depois do ROLLBACK: nenhum contato com external_id 'SABOTADO',
--   nenhuma linha de fixture, e os três md5 de contacts/conversations/messages
--   de volta ao valor de antes.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Guarda de colisão
-- -----------------------------------------------------------------------------
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tenants  WHERE id::text LIKE 'c4c4c4c4-%')
  OR EXISTS (SELECT 1 FROM public.contacts WHERE id::text LIKE 'c4c4c4c4-%') THEN
    RAISE EXCEPTION 'ABORTADO: já existe fixture com prefixo c4c4c4c4-. Limpe antes.';
  END IF;
END
$guard$;

-- -----------------------------------------------------------------------------
-- 1. Semeadura da organização
-- -----------------------------------------------------------------------------
SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
  ('c4c4c4c4-0000-4000-8000-00000000000a','authenticated','authenticated','fix-k-gerente@fixture.invalid', now(), now());

INSERT INTO public.tenants (id, name, slug, kind, parent_tenant_id, status, subscription_status, settings) VALUES
  ('c4c4c4c4-0000-4000-8000-000000000001','FIXTURE Conta K','fixture-conta-k','account', NULL,'active','active','{}'),
  ('c4c4c4c4-0000-4000-8000-000000000002','FIXTURE Loja K', 'fixture-loja-k', 'store','c4c4c4c4-0000-4000-8000-000000000001','active',NULL,'{}'),
  ('c4c4c4c4-0000-4000-8000-000000000003','FIXTURE Loja K2','fixture-loja-k2','store','c4c4c4c4-0000-4000-8000-000000000001','active',NULL,'{}');

INSERT INTO public.profiles (id, user_id, tenant_id, role, parent_id, status, first_name, last_name) VALUES
  ('c4c4c4c4-0000-4000-8000-0000000000fa','c4c4c4c4-0000-4000-8000-00000000000a','c4c4c4c4-0000-4000-8000-000000000001','gerente',NULL,'active','FIX','GerenteK');

INSERT INTO public.whatsapp_instances (id, tenant_id, name, instance_key) VALUES
  ('c4c4c4c4-aaaa-4000-8000-000000000002','c4c4c4c4-0000-4000-8000-000000000002','FIX instancia K','fix-key-k'),
  ('c4c4c4c4-aaaa-4000-8000-000000000003','c4c4c4c4-0000-4000-8000-000000000003','FIX instancia K2','fix-key-k2');

SET LOCAL session_replication_role = origin;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- SABOTAGEM (MODO AUTO-TESTE) — descomente as 5 linhas para ver K0b falhar.
-- Estraga o backfill de UM contato real. O ROLLBACK no fim desfaz.
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- ALTER TABLE public.contacts DISABLE TRIGGER trg_contacts_set_external_id;
-- UPDATE public.contacts SET external_id = 'SABOTADO'
--  WHERE id = (SELECT id FROM public.contacts WHERE channel = 'whatsapp'
--                AND id::text NOT LIKE 'c4c4c4c4-%' ORDER BY id LIMIT 1);
-- ALTER TABLE public.contacts ENABLE TRIGGER trg_contacts_set_external_id;

-- -----------------------------------------------------------------------------
-- 2. Infra
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _k_results (
  seq serial, grupo text, check_kind text, expected text, actual text, status text
) ON COMMIT DROP;

CREATE FUNCTION pg_temp.afirma(p_grupo text, p_check text, p_expected text, p_actual text)
RETURNS void LANGUAGE sql AS $f$
  INSERT INTO _k_results(grupo, check_kind, expected, actual, status)
  VALUES (p_grupo, p_check, p_expected, p_actual, CASE WHEN p_expected = p_actual THEN 'ok' ELSE 'FAIL' END);
$f$;

-- Executa e devolve o SQLSTATE ('-' quando não levanta).
CREATE FUNCTION pg_temp.estado(p_sql text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  EXECUTE p_sql;
  RETURN '-';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE;
END;
$f$;

-- -----------------------------------------------------------------------------
-- 3. A bateria
-- -----------------------------------------------------------------------------
DO $bateria$
DECLARE
  LOJA   constant uuid := 'c4c4c4c4-0000-4000-8000-000000000002';
  LOJA2  constant uuid := 'c4c4c4c4-0000-4000-8000-000000000003';
  INST   constant uuid := 'c4c4c4c4-aaaa-4000-8000-000000000002';
  INST2  constant uuid := 'c4c4c4c4-aaaa-4000-8000-000000000003';
  TEL    constant text := '5511999999001';
  r      jsonb;
  r2     jsonb;
  c_ig   uuid;
  c_ig2  uuid;
  c_wa   uuid;
  conv   uuid;
  n      bigint;
  txt    text;
BEGIN
  -- ===========================================================================
  -- K0 — o backfill, medido nos dados REAIS
  -- ===========================================================================
  SELECT count(*) INTO n FROM public.contacts
   WHERE id::text NOT LIKE 'c4c4c4c4-%' AND external_id IS NULL;
  PERFORM pg_temp.afirma('K0','K0a contato real sem external_id','0', n::text);

  SELECT count(*) INTO n FROM public.contacts
   WHERE id::text NOT LIKE 'c4c4c4c4-%' AND channel = 'whatsapp'
     AND external_id IS DISTINCT FROM phone;
  PERFORM pg_temp.afirma('K0','K0b contato real de WhatsApp com external_id <> phone','0', n::text);

  SELECT count(*) INTO n FROM public.contacts
   WHERE id::text NOT LIKE 'c4c4c4c4-%' AND channel <> 'whatsapp';
  PERFORM pg_temp.afirma('K0','K0c contato real fora do canal whatsapp','0', n::text);

  SELECT count(*) INTO n FROM public.conversations
   WHERE id::text NOT LIKE 'c4c4c4c4-%' AND channel <> 'whatsapp';
  PERFORM pg_temp.afirma('K0','K0d conversa real fora do canal whatsapp','0', n::text);

  SELECT count(*) INTO n FROM public.contacts
   WHERE id::text NOT LIKE 'c4c4c4c4-%' AND phone IS NULL;
  PERFORM pg_temp.afirma('K0','K0e contato real com phone nulo (nenhum ainda)','0', n::text);

  -- ===========================================================================
  -- K1 / K5 — a RPC de entrada, comportamento de sempre para WhatsApp
  -- ===========================================================================
  SELECT public.process_incoming_message(TEL, 'oi, primeira', INST, 'fix-k-wamid-1') INTO r;

  PERFORM pg_temp.afirma('K5','K5a retorno success','true', (r->>'success'));
  PERFORM pg_temp.afirma('K5','K5b retorno tem contact_id','true', ((r->>'contact_id') IS NOT NULL)::text);
  PERFORM pg_temp.afirma('K5','K5c retorno tem message_id','true', ((r->>'message_id') IS NOT NULL)::text);
  PERFORM pg_temp.afirma('K5','K5d retorno tem chatbot_response','true', ((r->'chatbot_response') IS NOT NULL)::text);

  c_wa := (r->>'contact_id')::uuid;

  SELECT phone || '|' || channel || '|' || external_id INTO txt
    FROM public.contacts WHERE id = c_wa;
  PERFORM pg_temp.afirma('K5','K5e contato criado com phone/canal/identificador',
    TEL || '|whatsapp|' || TEL, txt);

  SELECT count(*) INTO n FROM public.messages
   WHERE evolution_message_id = 'fix-k-wamid-1' AND direction = 'inbound';
  PERFORM pg_temp.afirma('K5','K5f mensagem inbound gravada','1', n::text);

  SELECT id INTO conv FROM public.conversations WHERE contact_id = c_wa;
  PERFORM pg_temp.afirma('K5','K5g conversa nasceu','true', (conv IS NOT NULL)::text);
  SELECT unread_count INTO n FROM public.conversations WHERE id = conv;
  PERFORM pg_temp.afirma('K5','K5h unread_count foi a 1','1', n::text);

  -- Segunda mensagem do MESMO telefone: acha o contato, não cria outro.
  SELECT public.process_incoming_message(TEL, 'oi, segunda', INST, 'fix-k-wamid-2') INTO r2;
  PERFORM pg_temp.afirma('K1','K1a mesmo telefone devolve o MESMO contato',
    c_wa::text, (r2->>'contact_id'));

  SELECT count(*) INTO n FROM public.contacts WHERE tenant_id = LOJA AND phone = TEL;
  PERFORM pg_temp.afirma('K1','K1b nenhum contato duplicado','1', n::text);

  SELECT unread_count INTO n FROM public.conversations WHERE id = conv;
  PERFORM pg_temp.afirma('K1','K1c unread_count foi a 2','2', n::text);

  -- ===========================================================================
  -- K2 — contato sem telefone
  -- ===========================================================================
  INSERT INTO public.contacts (id, tenant_id, channel, external_id, name)
  VALUES ('c4c4c4c4-cccc-4000-8000-000000000001', LOJA, 'instagram', 'IGSID-AAA', 'FIX insta 1')
  RETURNING id INTO c_ig;

  SELECT coalesce(phone,'<nulo>') || '|' || channel || '|' || external_id INTO txt
    FROM public.contacts WHERE id = c_ig;
  PERFORM pg_temp.afirma('K2','K2a contato de Instagram sem telefone existe',
    '<nulo>|instagram|IGSID-AAA', txt);

  -- ===========================================================================
  -- K3 — mesmo identificador, canais diferentes, mesma Loja
  -- ===========================================================================
  INSERT INTO public.contacts (id, tenant_id, channel, external_id, name)
  VALUES ('c4c4c4c4-cccc-4000-8000-000000000002', LOJA, 'instagram', TEL, 'FIX insta com id igual ao telefone');

  SELECT count(*) INTO n FROM public.contacts WHERE tenant_id = LOJA AND external_id = TEL;
  PERFORM pg_temp.afirma('K3','K3a mesmo identificador em 2 canais = 2 linhas','2', n::text);

  SELECT string_agg(channel, ',' ORDER BY channel) INTO txt
    FROM public.contacts WHERE tenant_id = LOJA AND external_id = TEL;
  PERFORM pg_temp.afirma('K3','K3b e são canais diferentes','instagram,whatsapp', txt);

  -- E a RPC de WhatsApp continua achando o de WhatsApp, não o de Instagram.
  SELECT public.process_incoming_message(TEL, 'oi, terceira', INST, 'fix-k-wamid-3') INTO r2;
  PERFORM pg_temp.afirma('K3','K3c RPC de WhatsApp ignora o homônimo de Instagram',
    c_wa::text, (r2->>'contact_id'));

  -- ===========================================================================
  -- K4 — mesmo identificador, Lojas diferentes
  -- ===========================================================================
  INSERT INTO public.contacts (id, tenant_id, channel, external_id, name)
  VALUES ('c4c4c4c4-cccc-4000-8000-000000000003', LOJA2, 'instagram', 'IGSID-AAA', 'FIX insta outra loja')
  RETURNING id INTO c_ig2;

  SELECT count(*) INTO n FROM public.contacts WHERE channel='instagram' AND external_id='IGSID-AAA';
  PERFORM pg_temp.afirma('K4','K4a mesmo IGSID em 2 Lojas = 2 linhas','2', n::text);

  SELECT public.process_incoming_message(TEL, 'oi loja2', INST2, 'fix-k-wamid-4') INTO r2;
  PERFORM pg_temp.afirma('K4','K4b mesmo telefone em outra Loja = contato NOVO',
    'false', ((r2->>'contact_id') = c_wa::text)::text);

  -- ===========================================================================
  -- K6 — a invariante external_id = phone é forçada
  -- ===========================================================================
  INSERT INTO public.contacts (id, tenant_id, channel, phone, external_id, name)
  VALUES ('c4c4c4c4-cccc-4000-8000-000000000004', LOJA, 'whatsapp', '5511999999009', 'MENTIRA', 'FIX wa mentiroso');

  SELECT external_id INTO txt FROM public.contacts
   WHERE id = 'c4c4c4c4-cccc-4000-8000-000000000004';
  PERFORM pg_temp.afirma('K6','K6a external_id mentiroso é sobrescrito pelo telefone',
    '5511999999009', txt);

  UPDATE public.contacts SET phone = '5511999999010'
   WHERE id = 'c4c4c4c4-cccc-4000-8000-000000000004';
  SELECT external_id INTO txt FROM public.contacts
   WHERE id = 'c4c4c4c4-cccc-4000-8000-000000000004';
  PERFORM pg_temp.afirma('K6','K6b trocar o telefone arrasta o external_id',
    '5511999999010', txt);

  -- ===========================================================================
  -- K7 — contato de WhatsApp sem telefone é recusado (mesmo SQLSTATE do NOT NULL)
  -- ===========================================================================
  PERFORM pg_temp.afirma('K7','K7a WhatsApp sem telefone recusado com 23502','23502',
    pg_temp.estado($q$INSERT INTO public.contacts (tenant_id, channel, phone, name)
      VALUES ('c4c4c4c4-0000-4000-8000-000000000002','whatsapp',NULL,'FIX sem tel')$q$));

  PERFORM pg_temp.afirma('K7','K7b canal novo sem external_id recusado com 23502','23502',
    pg_temp.estado($q$INSERT INTO public.contacts (tenant_id, channel, external_id, name)
      VALUES ('c4c4c4c4-0000-4000-8000-000000000002','instagram',NULL,'FIX sem id')$q$));

  -- ===========================================================================
  -- K8 — identificador repetido no mesmo (Loja, canal)
  -- ===========================================================================
  PERFORM pg_temp.afirma('K8','K8a IGSID repetido na mesma Loja recusado com 23505','23505',
    pg_temp.estado($q$INSERT INTO public.contacts (tenant_id, channel, external_id, name)
      VALUES ('c4c4c4c4-0000-4000-8000-000000000002','instagram','IGSID-AAA','FIX dup')$q$));

  PERFORM pg_temp.afirma('K8','K8b telefone repetido na mesma Loja recusado com 23505','23505',
    pg_temp.estado($q$INSERT INTO public.contacts (tenant_id, channel, phone, name)
      VALUES ('c4c4c4c4-0000-4000-8000-000000000002','whatsapp','5511999999001','FIX dup tel')$q$));

  -- ===========================================================================
  -- K9 — conversations.channel é derivado do contato
  -- ===========================================================================
  SELECT channel INTO txt FROM public.conversations WHERE id = conv;
  PERFORM pg_temp.afirma('K9','K9a conversa criada pelo caminho de entrada = whatsapp','whatsapp', txt);

  INSERT INTO public.conversations (id, tenant_id, contact_id, whatsapp_instance_id)
  VALUES ('c4c4c4c4-dddd-4000-8000-000000000001', LOJA, c_ig, INST);
  SELECT channel INTO txt FROM public.conversations
   WHERE id = 'c4c4c4c4-dddd-4000-8000-000000000001';
  PERFORM pg_temp.afirma('K9','K9b conversa de contato de Instagram nasce instagram','instagram', txt);

  -- Mesmo mentindo o canal na mão, o contato manda.
  INSERT INTO public.conversations (id, tenant_id, contact_id, whatsapp_instance_id, channel)
  VALUES ('c4c4c4c4-dddd-4000-8000-000000000002', LOJA2, c_ig2, INST2, 'whatsapp');
  SELECT channel INTO txt FROM public.conversations
   WHERE id = 'c4c4c4c4-dddd-4000-8000-000000000002';
  PERFORM pg_temp.afirma('K9','K9c canal mentiroso na mão é corrigido pelo contato','instagram', txt);

  -- ===========================================================================
  -- K10 — whatsapp_instances aceita 'instagram' e nada mais
  -- ===========================================================================
  PERFORM pg_temp.afirma('K10','K10a provider=instagram aceito','-',
    pg_temp.estado($q$INSERT INTO public.whatsapp_instances (id, tenant_id, name, instance_key, provider)
      VALUES ('c4c4c4c4-aaaa-4000-8000-00000000000f','c4c4c4c4-0000-4000-8000-000000000002','FIX ig','fix-key-k-ig','instagram')$q$));

  PERFORM pg_temp.afirma('K10','K10b provider inventado recusado com 23514','23514',
    pg_temp.estado($q$INSERT INTO public.whatsapp_instances (id, tenant_id, name, instance_key, provider)
      VALUES ('c4c4c4c4-aaaa-4000-8000-0000000000ff','c4c4c4c4-0000-4000-8000-000000000002','FIX x','fix-key-k-x','telegram')$q$));

  PERFORM pg_temp.afirma('K10','K10c canal inventado em contacts recusado com 23514','23514',
    pg_temp.estado($q$INSERT INTO public.contacts (tenant_id, channel, external_id, name)
      VALUES ('c4c4c4c4-0000-4000-8000-000000000002','telegram','X','FIX x')$q$));

  -- ===========================================================================
  -- K11 — a ordem das triggers de messages não mudou
  -- ===========================================================================
  SELECT tgname INTO txt FROM pg_trigger
   WHERE tgrelid = 'public.messages'::regclass AND NOT tgisinternal
     AND tgtype & 1 = 1          -- ROW
     AND tgtype & 4 = 4          -- INSERT
     AND tgtype & 2 = 0          -- AFTER
   ORDER BY tgname DESC LIMIT 1;
  PERFORM pg_temp.afirma('K11','K11a a ultima trigger AFTER INSERT continua sendo o rodizio',
    'zz_rotation_assign_on_inbound', txt);

  SELECT count(*) INTO n FROM pg_trigger
   WHERE tgrelid = 'public.contacts'::regclass AND NOT tgisinternal AND tgenabled <> 'O';
  PERFORM pg_temp.afirma('K11','K11b nenhuma trigger de contacts desabilitada','0', n::text);
END
$bateria$;

-- -----------------------------------------------------------------------------
-- 4. Placar
-- -----------------------------------------------------------------------------
SELECT seq, grupo, check_kind, expected, actual, status FROM _k_results ORDER BY seq;

SELECT
  count(*) FILTER (WHERE status = 'ok')   AS ok,
  count(*) FILTER (WHERE status = 'FAIL') AS fail,
  count(*)                                AS total,
  CASE WHEN count(*) FILTER (WHERE status = 'FAIL') = 0
       THEN 'VERDE' ELSE 'VERMELHO' END   AS placar
FROM _k_results;

ROLLBACK;
