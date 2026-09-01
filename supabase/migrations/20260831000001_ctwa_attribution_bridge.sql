-- Ponte de atribuição CTWA: messages.ad_referral -> lead_sources / traffic_sources / lead_tracking
--
-- CONTEXTO
-- A captura do referral de anúncio (Click-to-WhatsApp) já funcionava desde
-- 20260701000001: o meta-webhook grava o objeto cru da Meta em
-- `messages.ad_referral` e a aba Conversas mostra o cartão "Veio de um anúncio".
-- O dado parava ali. Nenhuma tabela de rastreamento era alimentada, então a tela
-- Rastreamento — que lê SÓ essas tabelas — mostrava zero para todo mundo.
--
-- Esta migração liga as duas pontas. Um gatilho em `messages` transforma cada
-- referral em três escritas:
--   1. `lead_sources`    — a "Fonte do Lead" que aparece no cadastro do contato
--   2. `traffic_sources` — a fonte de tráfego que alimenta os relatórios
--   3. `lead_tracking`   — a linha de lead que alimenta as views materializadas
-- e carimba `contacts.lead_source_id`.
--
-- DECISÕES DE MODELAGEM (o porquê de cada uma)
--
-- a) A unidade de relatório é o CRIATIVO, não o anúncio.
--    A Meta reaproveita o mesmo `source_id` em criativos diferentes: em produção
--    o id 120247243200890488 aparece com três títulos distintos. E o contrário
--    também acontece: quatro ids diferentes compartilham o título "Cirurgia
--    Plástica Fortaleza". Logo, nem o id nem o título sozinhos identificam a
--    origem — a chave é o PAR (source_id, headline).
--
-- b) O nome exibido precisa ser único, senão a tela mostra quatro linhas iguais.
--    Por isso o nome é `<título> · <6 últimos dígitos do source_id>`. Os 6
--    dígitos bastam para distinguir e o id completo fica em
--    `traffic_sources.utm_content` e em `lead_sources.parameters`, que é o que
--    o operador cola no Gerenciador de Anúncios da Meta.
--
-- c) Título não renderizado vira rótulo honesto.
--    Duas mensagens chegaram com o literal `{{product.name}}` — template do
--    catálogo que a Meta não substituiu. Publicar isso como nome de anúncio é
--    lixo na tela. Títulos que são só um template `{{...}}` são descartados e a
--    linha passa a se chamar "Anúncio <source_id>". Não juntamos essas mensagens
--    a um criativo nomeado: não sabemos qual era, e inventar seria pior.
--
-- d) Atribuição é de PRIMEIRO CONTATO.
--    A Meta anexa o referral só à primeira mensagem, mas um contato pode voltar
--    por outro anúncio meses depois. O primeiro vence: o índice único parcial
--    `uniq_lead_tracking_source_per_contact` garante uma linha de lead_tracking
--    com fonte por contato, e o carimbo em `contacts.lead_source_id` só acontece
--    quando o campo está vazio — escolha manual do operador nunca é sobrescrita.
--
-- e) A data da linha é a da MENSAGEM, não `now()`.
--    As views materializadas agrupam por `date(created_at)`. Usar `now()` no
--    backfill jogaria dois meses de histórico no dia de hoje.
--
-- PROVEDORES
-- O gatilho reage a `messages.ad_referral`, seja quem for que escreveu a coluna.
-- Hoje só o `meta-webhook` escreve (API oficial). Se um dia o evolution-webhook
-- passar a extrair `contextInfo.externalAdReply`, a ponte funciona sem mudança.

-- ---------------------------------------------------------------------------
-- 1. Chaves de deduplicação
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS uniq_lead_sources_tenant_name
  ON public.lead_sources (tenant_id, name);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_traffic_sources_tenant_name
  ON public.traffic_sources (tenant_id, name);

-- Primeiro contato: no máximo uma linha COM fonte por contato. Linhas sem
-- `traffic_source_id` (origem manual, importação) continuam livres.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_lead_tracking_source_per_contact
  ON public.lead_tracking (tenant_id, contact_id)
  WHERE contact_id IS NOT NULL AND traffic_source_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Normalização do referral cru da Meta
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_ad_referral(p_referral jsonb)
RETURNS TABLE (
  display_name   text,
  source_id      text,
  source_type    text,
  utm_source     text,
  utm_medium     text,
  traffic_type   text,
  source_url     text,
  ctwa_clid      text
)
LANGUAGE sql
IMMUTABLE
AS $$
  WITH raw AS (
    SELECT
      nullif(btrim(p_referral->>'headline'), '')    AS headline_raw,
      nullif(btrim(p_referral->>'source_id'), '')   AS sid,
      coalesce(nullif(btrim(p_referral->>'source_type'), ''), 'ad') AS stype,
      nullif(btrim(p_referral->>'source_url'), '')  AS surl,
      nullif(btrim(p_referral->>'ctwa_clid'), '')   AS clid
  ), cleaned AS (
    SELECT
      -- Descarta título que é apenas um template não renderizado: {{product.name}}
      CASE WHEN headline_raw ~ '^\{\{.*\}\}$' THEN NULL ELSE headline_raw END AS headline,
      sid, stype, surl, clid
    FROM raw
  )
  SELECT
    CASE
      WHEN headline IS NOT NULL AND sid IS NOT NULL
        THEN headline || ' · ' || right(sid, 6)
      WHEN headline IS NOT NULL
        THEN headline
      WHEN sid IS NOT NULL
        THEN 'Anúncio ' || sid
      ELSE 'Anúncio sem identificação'
    END,
    sid,
    stype,
    CASE
      WHEN surl ILIKE '%instagram%' THEN 'instagram'
      WHEN surl ILIKE '%facebook%' OR surl ILIKE '%fb.me%' THEN 'facebook'
      ELSE 'meta'
    END,
    CASE WHEN stype = 'ad' THEN 'paid_social' ELSE 'social' END,
    -- traffic_sources.type tem CHECK: organic|paid|social|direct|referral|email
    CASE WHEN stype = 'ad' THEN 'paid' WHEN stype = 'post' THEN 'social' ELSE 'referral' END,
    surl,
    clid
  FROM cleaned;
$$;

COMMENT ON FUNCTION public.normalize_ad_referral(jsonb) IS
  'Traduz o objeto `referral` cru da Meta Cloud API para os campos usados pelas tabelas de rastreamento. Descarta títulos que são template não renderizado e desambigua criativos que compartilham o mesmo título.';

-- ---------------------------------------------------------------------------
-- 3. O gatilho
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_ad_referral_attribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r                 record;
  v_traffic_id      uuid;
  v_lead_source_id  uuid;
BEGIN
  IF NEW.ad_referral IS NULL OR NEW.contact_id IS NULL OR NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO r FROM public.normalize_ad_referral(NEW.ad_referral);

  -- 1. Fonte de tráfego (alimenta os relatórios). utm_source fica 'meta' de
  -- propósito: a plataforma do clique (instagram/facebook) varia por lead e
  -- por isso mora em lead_tracking, não na fonte.
  INSERT INTO public.traffic_sources (
    tenant_id, name, type, utm_source, utm_medium, utm_campaign, utm_content, is_active
  ) VALUES (
    NEW.tenant_id, r.display_name, r.traffic_type,
    'meta', r.utm_medium, r.display_name, r.source_id, true
  )
  ON CONFLICT (tenant_id, name) DO UPDATE
    SET utm_content = COALESCE(traffic_sources.utm_content, EXCLUDED.utm_content),
        updated_at  = now()
  RETURNING id INTO v_traffic_id;

  -- 2. Fonte do lead (aparece no cadastro do contato)
  INSERT INTO public.lead_sources (tenant_id, name, type, parameters, is_active)
  VALUES (
    NEW.tenant_id, r.display_name, 'ctwa',
    jsonb_build_object(
      'source_id',         r.source_id,
      'source_type',       r.source_type,
      'source_url',        r.source_url,
      'traffic_source_id', v_traffic_id,
      'origin',            'meta_ctwa'
    ),
    true
  )
  ON CONFLICT (tenant_id, name) DO UPDATE
    SET parameters = lead_sources.parameters || EXCLUDED.parameters,
        updated_at = now()
  RETURNING id INTO v_lead_source_id;

  -- 3. Linha de lead (alimenta as views materializadas). Primeiro contato vence.
  INSERT INTO public.lead_tracking (
    tenant_id, contact_id, traffic_source_id, session_id,
    utm_source, utm_medium, utm_campaign, utm_content,
    referrer_url, converted, created_at
  ) VALUES (
    NEW.tenant_id, NEW.contact_id, v_traffic_id, r.ctwa_clid,
    r.utm_source, r.utm_medium, r.display_name, r.source_id,
    r.source_url, false, NEW.created_at
  )
  ON CONFLICT (tenant_id, contact_id) WHERE contact_id IS NOT NULL AND traffic_source_id IS NOT NULL
  DO NOTHING;

  -- 4. Carimbo no contato — nunca sobrescreve escolha manual do operador.
  UPDATE public.contacts
     SET lead_source_id = v_lead_source_id
   WHERE id = NEW.contact_id
     AND tenant_id = NEW.tenant_id
     AND lead_source_id IS NULL;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.apply_ad_referral_attribution() IS
  'Espelha messages.ad_referral nas tabelas de rastreamento (lead_sources, traffic_sources, lead_tracking) e carimba contacts.lead_source_id. Atribuição de primeiro contato.';

DROP TRIGGER IF EXISTS trg_apply_ad_referral_attribution ON public.messages;

CREATE TRIGGER trg_apply_ad_referral_attribution
  AFTER INSERT OR UPDATE OF ad_referral ON public.messages
  FOR EACH ROW
  WHEN (NEW.ad_referral IS NOT NULL)
  EXECUTE FUNCTION public.apply_ad_referral_attribution();

COMMENT ON TRIGGER trg_apply_ad_referral_attribution ON public.messages IS
  'Ponte CTWA: transforma o referral de anúncio em atribuição rastreável. Dispara também no UPDATE porque o meta-webhook grava ad_referral logo após criar a mensagem.';
