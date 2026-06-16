-- WhatsApp/Meta acceptable-use — fase 2 dos guardrails (auditoria 2026-06-15).
--   V4: opt-in/consent real + opt-out por palavra-chave (STOP/PARE/SAIR).
--   V6: warm-up de número novo (rampa de volume nos primeiros dias).
--   Campanha por TEMPLATE aprovado (caminho conforme p/ número oficial fora da janela).
-- Ver .agent/skills/whatsapp-policies/SKILL.md.

-- ---------------------------------------------------------------------------
-- V4: consentimento explícito no contato. opt_out_mass_message/is_blocked já
-- existem (operacionais). Aqui registramos o OPT-IN e sua origem/data.
-- ---------------------------------------------------------------------------
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS opt_in_mass_message boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS opt_in_source       text,   -- manual | form | imported | reply | api
  ADD COLUMN IF NOT EXISTS opt_in_at           timestamptz,
  ADD COLUMN IF NOT EXISTS opt_out_at          timestamptz,
  ADD COLUMN IF NOT EXISTS opt_out_source      text;   -- keyword | manual | block | report

-- ---------------------------------------------------------------------------
-- V6: idade do número para warm-up. registered_at é setado no register (Meta).
-- ---------------------------------------------------------------------------
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS registered_at timestamptz;

-- Backfill conservador: números oficiais já existentes assumem created_at como
-- data de registro (já passaram do warm-up). Novos números setam no /register.
UPDATE public.whatsapp_instances
   SET registered_at = COALESCE(registered_at, created_at)
 WHERE provider = 'official' AND registered_at IS NULL;

-- ---------------------------------------------------------------------------
-- Campanha por TEMPLATE aprovado + exigência de opt-in.
-- ---------------------------------------------------------------------------
ALTER TABLE public.mass_message_campaigns
  ADD COLUMN IF NOT EXISTS require_opt_in    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_template       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS template_name     text,
  ADD COLUMN IF NOT EXISTS template_language text DEFAULT 'pt_BR',
  ADD COLUMN IF NOT EXISTS template_params   jsonb;  -- ['{name}','{first_name}', 'texto fixo', ...]

-- ---------------------------------------------------------------------------
-- V4: opt-out por telefone (usado pelo handler de palavra-chave STOP/PARE/SAIR).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_contact_opt_out_by_phone(
  p_tenant uuid,
  p_phone text,
  p_source text DEFAULT 'keyword'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE public.contacts ct
     SET opt_out_mass_message = true,
         opt_in_mass_message  = false,
         opt_out_at           = now(),
         opt_out_source       = p_source,
         updated_at           = now()
   WHERE ct.tenant_id = p_tenant
     AND regexp_replace(COALESCE(ct.phone, ''), '\D', '', 'g')
         = regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g')
     AND regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g') <> '';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.set_contact_opt_out_by_phone(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_contact_opt_out_by_phone(uuid, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- V6: volume de saída do número HOJE (para a rampa de warm-up no dispatcher).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.instance_outbound_today(p_instance_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT COUNT(*)::int
  FROM public.messages m
  WHERE m.whatsapp_instance_id = p_instance_id
    AND m.direction = 'outbound'
    AND m.created_at >= date_trunc('day', now());
$$;

REVOKE ALL ON FUNCTION public.instance_outbound_today(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.instance_outbound_today(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- schedule_campaign_messages: passa a respeitar require_opt_in (além do
-- opt-out/bloqueio já corrigido em 000002).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.schedule_campaign_messages(p_campaign_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  c RECORD;
  v_caller_tenant uuid;
  rec RECORD;
  v_item jsonb;
  v_count int := 0;
  v_base timestamptz;
  v_step int;
  v_exec_time timestamptz;
BEGIN
  SELECT * INTO c FROM public.mass_message_campaigns WHERE id = p_campaign_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;

  v_caller_tenant := public.get_current_user_tenant_id();
  IF NOT public.is_super_admin()
     AND (v_caller_tenant IS NULL OR v_caller_tenant <> c.tenant_id) THEN
    RAISE EXCEPTION 'Not authorized for this campaign';
  END IF;

  IF c.status NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'Campanha "%" já foi disparada (status: %). Duplique-a para enviar novamente.', c.name, c.status;
  END IF;

  DELETE FROM public.campaign_executions
   WHERE campaign_id = p_campaign_id AND status = 'pending';

  v_base := COALESCE(c.scheduled_at, now());
  v_step := GREATEST(COALESCE(c.delay_between_messages, 5), 1);

  IF c.audience_type = 'csv_import' THEN
    FOR v_item IN
      SELECT * FROM jsonb_array_elements(COALESCE(c.audience_config -> 'contacts', '[]'::jsonb))
    LOOP
      IF COALESCE(v_item ->> 'phone', '') = '' THEN CONTINUE; END IF;

      -- V2: nunca enviar para quem pediu opt-out ou foi bloqueado.
      IF EXISTS (
        SELECT 1 FROM public.contacts ct
        WHERE ct.tenant_id = c.tenant_id
          AND regexp_replace(COALESCE(ct.phone, ''), '\D', '', 'g')
              = regexp_replace(v_item ->> 'phone', '\D', '', 'g')
          AND (ct.opt_out_mass_message = true OR ct.is_blocked = true)
      ) THEN CONTINUE; END IF;

      -- V4: se a campanha exige opt-in, o telefone do CSV precisa casar com um
      -- contato explicitamente opted-in (CSV cru não prova consentimento).
      IF c.require_opt_in AND NOT EXISTS (
        SELECT 1 FROM public.contacts ct
        WHERE ct.tenant_id = c.tenant_id
          AND regexp_replace(COALESCE(ct.phone, ''), '\D', '', 'g')
              = regexp_replace(v_item ->> 'phone', '\D', '', 'g')
          AND ct.opt_in_mass_message = true
      ) THEN CONTINUE; END IF;

      v_exec_time := v_base + (v_count * v_step) * interval '1 second';
      INSERT INTO public.campaign_executions
        (campaign_id, tenant_id, contact_id, contact_identifier, contact_name, message_text, status, scheduled_at)
      VALUES
        (p_campaign_id, c.tenant_id, NULL, v_item ->> 'phone', v_item ->> 'name',
         c.message_template, 'pending', v_exec_time);
      v_count := v_count + 1;
    END LOOP;
  ELSE
    FOR rec IN
      SELECT ct.id, ct.phone, ct.name, ct.email
      FROM public.contacts ct
      WHERE ct.tenant_id = c.tenant_id
        AND ct.is_blocked = false
        AND ct.opt_out_mass_message = false
        AND ct.phone IS NOT NULL
        AND (NOT c.require_opt_in OR ct.opt_in_mass_message = true)   -- V4
        AND (
          (c.audience_type = 'contact_list'
            AND ct.id IN (
              SELECT (jsonb_array_elements_text(COALESCE(c.audience_config -> 'contact_ids', '[]'::jsonb)))::uuid
            ))
          OR
          (c.audience_type = 'tags'
            AND (array_length(c.target_stages, 1) IS NULL OR ct.current_stage_id = ANY (c.target_stages))
            AND (array_length(c.target_tags, 1) IS NULL OR EXISTS (
              SELECT 1 FROM public.contact_tags x
              WHERE x.contact_id = ct.id AND x.tag_id = ANY (c.target_tags)
            )))
        )
    LOOP
      v_exec_time := v_base + (v_count * v_step) * interval '1 second';
      INSERT INTO public.campaign_executions
        (campaign_id, tenant_id, contact_id, contact_identifier, contact_name, message_text, status, scheduled_at)
      VALUES
        (p_campaign_id, c.tenant_id, rec.id, rec.phone, rec.name,
         c.message_template, 'pending', v_exec_time);
      v_count := v_count + 1;
    END LOOP;
  END IF;

  UPDATE public.mass_message_campaigns
     SET status = CASE WHEN c.scheduled_at IS NULL OR c.scheduled_at <= now() THEN 'active' ELSE 'scheduled' END,
         total_recipients = v_count,
         paused_at = NULL,
         cancelled_at = NULL,
         started_at = COALESCE(started_at,
           CASE WHEN c.scheduled_at IS NULL OR c.scheduled_at <= now() THEN now() ELSE NULL END),
         updated_at = now()
   WHERE id = p_campaign_id;

  PERFORM public.recompute_campaign_metrics(p_campaign_id);
  RETURN v_count;
END;
$$;
