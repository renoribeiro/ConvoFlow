-- =============================================================================
-- RECONSTRUÍDA em 2026-08-24 a partir do estado vivo do banco.
-- =============================================================================
-- Esta versão existia no ledger (`20250803083958`) sem nenhum arquivo local.
-- Extraída do catálogo do PostgreSQL em 2026-08-24. NÃO é o texto original.
--
-- -----------------------------------------------------------------------------
-- ⚠️  AS TRÊS FUNÇÕES ESTÃO MORTAS — QUEBRAM SE FOREM CHAMADAS
-- -----------------------------------------------------------------------------
-- Era "company_id", anterior à multi-tenancy por `tenant_id`. Colunas que elas
-- usam e que NÃO EXISTEM MAIS (conferido em 2026-08-24):
--
--   messages.company_id      → não existe
--   messages.api_message_id  → não existe
--   messages.updated_at      → não existe
--   contacts.company_id      → não existe
--
-- Ou seja: `update_message_status` faz UPDATE em duas colunas inexistentes,
-- `get_delivery_log` filtra por uma coluna inexistente, e
-- `handle_new_message(text,jsonb)` insere em colunas inexistentes. As três
-- estouram na primeira chamada. O plpgsql só valida o corpo em tempo de
-- execução, por isso elas seguem no catálogo sem dar sinal.
--
-- ⚠️ CUIDADO COM O NOME: existem DUAS `handle_new_message` no banco, com
-- assinaturas diferentes — esta, `(p_instance_name text, p_message_data jsonb)`,
-- e a `(payload jsonb)` da migração 20250803074600. As duas estão mortas.
-- Não confunda com `handle_new_user()`, que é viva e essencial.
--
-- Quem faz esse trabalho hoje: `process_incoming_message` (20260529130000) e o
-- webhook `evolution-webhook` nas Edge Functions.
--
-- Estão aqui porque existem no banco e um rebuild precisa reproduzi-lo.
-- Apagar é decisão do dono do projeto, em script próprio.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_message(p_instance_name text, p_message_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_instance_id UUID;
    v_company_id UUID;
    v_contact_id UUID;
    v_message_id UUID;
    v_phone TEXT;
    v_contact_name TEXT;
BEGIN
    -- Get instance and company info
    SELECT id, company_id INTO v_instance_id, v_company_id
    FROM evolution_api_instances
    WHERE instance_name = p_instance_name;

    IF v_instance_id IS NULL THEN
        RAISE EXCEPTION 'Instance not found: %', p_instance_name;
    END IF;

    -- Extract phone number
    v_phone := p_message_data->>'remoteJid';
    v_phone := REPLACE(v_phone, '@s.whatsapp.net', '');

    -- Extract contact name
    v_contact_name := p_message_data->>'pushName';

    -- Find or create contact
    SELECT id INTO v_contact_id
    FROM contacts
    WHERE phone = v_phone AND company_id = v_company_id;

    IF v_contact_id IS NULL THEN
        INSERT INTO contacts (
            company_id,
            evolution_api_instance_id,
            phone,
            name,
            first_message,
            last_interaction_at
        ) VALUES (
            v_company_id,
            v_instance_id,
            v_phone,
            v_contact_name,
            p_message_data->>'message',
            NOW()
        ) RETURNING id INTO v_contact_id;
    ELSE
        -- Update last interaction
        UPDATE contacts
        SET last_interaction_at = NOW(),
            name = COALESCE(v_contact_name, name)
        WHERE id = v_contact_id;
    END IF;

    -- Insert message
    INSERT INTO messages (
        company_id,
        contact_id,
        evolution_api_instance_id,
        api_message_id,
        direction,
        message_type,
        content,
        media_url,
        status
    ) VALUES (
        v_company_id,
        v_contact_id,
        v_instance_id,
        p_message_data->>'key'->>'id',
        CASE WHEN p_message_data->>'key'->>'fromMe' = 'true' THEN 'outbound' ELSE 'inbound' END,
        COALESCE(p_message_data->>'messageType', 'text'),
        p_message_data->>'message',
        p_message_data->>'mediaUrl',
        'delivered'
    ) RETURNING id INTO v_message_id;

    RETURN v_message_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_message_status(p_api_message_id text, p_status text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    UPDATE messages
    SET status = p_status,
        updated_at = NOW()
    WHERE api_message_id = p_api_message_id;

    RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_delivery_log(p_company_id uuid)
 RETURNS TABLE(contact_name text, phone text, message_content text, status text, sent_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        c.name,
        c.phone,
        m.content,
        m.status,
        m.created_at
    FROM messages m
    JOIN contacts c ON m.contact_id = c.id
    WHERE m.company_id = p_company_id
      AND m.direction = 'outbound'
    ORDER BY m.created_at DESC
    LIMIT 1000;
END;
$function$;
