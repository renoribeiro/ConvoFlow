-- Backfill da atribuição CTWA — reprocessa o histórico de messages.ad_referral
--
-- O QUE FAZ
-- A ponte (migração 20260831000001) só age em mensagem nova. Este script
-- reprocessa as mensagens que já estavam no banco, na ORDEM CRONOLÓGICA, para
-- que a regra de "primeiro contato vence" produza o mesmo resultado que
-- produziria se o gatilho existisse desde sempre.
--
-- COMO
-- Um `UPDATE ... SET ad_referral = ad_referral` dispara o gatilho sem alterar
-- valor nenhum — a coluna é reescrita com o próprio conteúdo. Não há INSERT
-- manual duplicando a lógica: o backfill e o tempo real usam exatamente o mesmo
-- código, então não podem divergir.
--
-- SEGURANÇA (armadilha 4 do CLAUDE.md)
-- Tudo — guardas, escrita e conferência — vive dentro de UM bloco `DO`. No SQL
-- Editor do Supabase `BEGIN/COMMIT` não garante atomicidade, mas um bloco `DO`
-- é um comando só: ou termina, ou o PostgreSQL desfaz tudo. Por isso o
-- `RAISE EXCEPTION` aqui significa de verdade "nada aconteceu".
--
-- Guardas, nesta ordem:
--   1. o gatilho precisa existir (senão o UPDATE não faria nada e o script
--      mentiria dizendo "pronto")
--   2. precisa haver referral para processar
--   3. o resultado tem que bater: toda mensagem com referral e contato precisa
--      terminar com uma linha em lead_tracking e um contato carimbado
--
-- IDEMPOTENTE: rodar duas vezes não duplica nada (ON CONFLICT DO NOTHING no
-- gatilho + carimbo só quando lead_source_id está vazio).

DO $backfill$
DECLARE
  v_trigger_exists   boolean;
  v_msgs             integer;
  v_contacts_before  integer;
  v_contacts_after   integer;
  v_lt_before        integer;
  v_lt_after         integer;
  v_src_after        integer;
  v_traf_after       integer;
  v_orphans          integer;
  v_touched          integer;
BEGIN
  ------------------------------------------------------------------ guarda 1
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_apply_ad_referral_attribution'
      AND tgrelid = 'public.messages'::regclass
      AND NOT tgisinternal
  ) INTO v_trigger_exists;

  IF NOT v_trigger_exists THEN
    RAISE EXCEPTION
      'ABORTADO: o gatilho trg_apply_ad_referral_attribution nao existe. Aplique a migracao 20260831000001 antes do backfill.';
  END IF;

  ------------------------------------------------------------------ guarda 2
  SELECT count(*) INTO v_msgs
  FROM public.messages
  WHERE ad_referral IS NOT NULL AND contact_id IS NOT NULL;

  IF v_msgs = 0 THEN
    RAISE EXCEPTION 'ABORTADO: nenhuma mensagem com ad_referral e contato. Nada a fazer.';
  END IF;

  ------------------------------------------------------------------- estado antes
  SELECT count(*) INTO v_contacts_before FROM public.contacts WHERE lead_source_id IS NOT NULL;
  SELECT count(*) INTO v_lt_before FROM public.lead_tracking;

  RAISE NOTICE 'ANTES  | mensagens com referral: %  | contatos com fonte: %  | lead_tracking: %',
    v_msgs, v_contacts_before, v_lt_before;

  ------------------------------------------------------------------- escrita
  -- Ordem cronologica: o primeiro anuncio que trouxe cada contato e o que vence.
  WITH ordenadas AS (
    SELECT id FROM public.messages
    WHERE ad_referral IS NOT NULL AND contact_id IS NOT NULL
    ORDER BY created_at ASC
  )
  UPDATE public.messages m
     SET ad_referral = m.ad_referral
    FROM ordenadas o
   WHERE m.id = o.id;

  GET DIAGNOSTICS v_touched = ROW_COUNT;

  ------------------------------------------------------------------- estado depois
  SELECT count(*) INTO v_contacts_after FROM public.contacts WHERE lead_source_id IS NOT NULL;
  SELECT count(*) INTO v_lt_after   FROM public.lead_tracking;
  SELECT count(*) INTO v_src_after  FROM public.lead_sources;
  SELECT count(*) INTO v_traf_after FROM public.traffic_sources;

  ------------------------------------------------------------------ guarda 3
  -- Todo contato que recebeu anuncio tem que ter saido atribuido.
  SELECT count(*) INTO v_orphans
  FROM (
    SELECT DISTINCT m.contact_id
    FROM public.messages m
    WHERE m.ad_referral IS NOT NULL AND m.contact_id IS NOT NULL
  ) alvo
  LEFT JOIN public.lead_tracking lt ON lt.contact_id = alvo.contact_id
  WHERE lt.id IS NULL;

  IF v_orphans > 0 THEN
    RAISE EXCEPTION
      'ABORTADO: % contato(s) com referral ficaram sem linha em lead_tracking. Nada foi gravado.', v_orphans;
  END IF;

  RAISE NOTICE 'DEPOIS | mensagens reprocessadas: %', v_touched;
  RAISE NOTICE 'DEPOIS | contatos com fonte: % (era %, +%)',
    v_contacts_after, v_contacts_before, v_contacts_after - v_contacts_before;
  RAISE NOTICE 'DEPOIS | lead_tracking: % (era %)', v_lt_after, v_lt_before;
  RAISE NOTICE 'DEPOIS | lead_sources: %  | traffic_sources: %', v_src_after, v_traf_after;
  RAISE NOTICE 'OK: backfill concluido sem orfaos.';
END;
$backfill$;
