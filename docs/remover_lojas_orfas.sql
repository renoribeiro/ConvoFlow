-- =============================================================================
-- ConvoFlow — remover as duas Lojas órfãs (projeto pqjkuwyshybxldzpfbbs)
-- =============================================================================
--
--   ✅ JÁ APLICADO EM PRODUÇÃO — 2026-08-20.
--      As duas Lojas não existem mais. Rodar de novo não faz nada (é
--      idempotente): as guardas passam de graça, os DELETEs casam zero linhas
--      e o registro não é duplicado.
--
--      Fica no repositório como registro do que foi feito, e para servir de
--      base caso a operação precise ser refeita sobre um backup restaurado.
--
-- -----------------------------------------------------------------------------
-- O QUE DEU ERRADO NA APLICAÇÃO — leia antes de escrever o próximo script
-- -----------------------------------------------------------------------------
-- A primeira versão deste arquivo guardava o inventário numa TABELA TEMPORÁRIA
-- (`CREATE TEMP TABLE ... ON COMMIT DROP`) e a lia dois comandos depois. No SQL
-- Editor do Supabase isso falhou com:
--
--     ERROR: 42P01: relation "_lojas_orfas_inventario" does not exist
--
-- E o pior não foi o erro: **os DELETEs já tinham sido gravados quando ele
-- apareceu**. O `BEGIN;` / `COMMIT;` em volta NÃO desfez nada. Ou seja, no SQL
-- Editor a promessa "é transacional, ou entra tudo ou não entra nada" que está
-- escrita em vários scripts de `docs/` PODE NÃO VALER.
--
-- Duas lições, e as duas estão aplicadas nesta versão:
--
--   1. NUNCA depender de estado de sessão entre um comando e outro. Nada de
--      tabela temporária, nada de `SET`, nada de variável de sessão.
--
--   2. Operação com escrita perigosa vai INTEIRA dentro de um único bloco
--      `DO $$ ... $$;`. Um bloco `DO` é UM comando: ou ele termina, ou o
--      PostgreSQL desfaz tudo o que ele fez, independente de como o editor
--      trata `BEGIN`/`COMMIT`. É a única forma de a guarda realmente abortar.
--
-- O `BEGIN;` / `COMMIT;` continua aqui embaixo por hábito da casa, mas repare
-- que ele não é mais quem garante a atomicidade — quem garante é o bloco.
--
-- -----------------------------------------------------------------------------
-- O QUE ESTE SCRIPT FEZ
-- -----------------------------------------------------------------------------
--   1. Desvinculou o superadmin Yuri da Loja dele (profiles.tenant_id → NULL),
--      igualando-o a reno@re9.online e admin@convoflow.com.
--   2. Apagou as linhas dependentes das duas Lojas, em ordem segura de FK.
--   3. Apagou os dois perfis que sobravam (bruno moura, "Excluir Gue").
--   4. Apagou as duas linhas de `tenants`.
--   5. Gravou o inventário do removido em `public.system_logs`.
--
-- O QUE ELE **NÃO** FEZ
--   - Não tocou em `auth.users`. bbrunomoura29@gmail.com e teste@teste.com
--     seguem no Auth sem perfil. Ver "ITEM SEPARADO" no fim.
--   - Não removeu o tratamento de Loja órfã de lugar nenhum. A regra continua:
--     Loja sem pai responde pela própria linha. `tenants.parent_tenant_id`
--     aceita NULL, então uma órfã nova pode aparecer.
--
-- -----------------------------------------------------------------------------
-- POR QUE ESTAS DUAS LINHAS ERAM DESCARTÁVEIS (levantado em 2026-08-20)
-- -----------------------------------------------------------------------------
--   - `messages` NUNCA teve uma única linha de nenhuma das duas, em toda a
--     história do banco (conferido por tenant_id, por conversa e por contato).
--   - Nenhuma das duas jamais teve instância de WhatsApp.
--   - Bruno: `login_count = 0`. Nunca entrou. O acesso da Loja dele foi
--     revogado de propósito em 2026-07-01 e ela ficou no paywall desde então,
--     sem ninguém reclamar.
--   - Yuri: a Loja estava parada desde 2026-06-24. O que a mantinha viva era o
--     perfil de superadmin pendurado nela — vínculo que o passo 1 desfez.
--
-- Os 182 contatos foram exportados antes, por
-- docs/exportar_loja_yuri_antes_de_remover.sql.
--
-- -----------------------------------------------------------------------------
-- ANTES DE RODAR (se for refazer sobre um backup) — SOMENTE LEITURA
-- -----------------------------------------------------------------------------
--   WITH alvo(tenant_id) AS (
--     VALUES ('6aee6f9e-94e5-4962-bf5b-c014c1736b59'::uuid),
--            ('f52d8ba4-0714-4ce7-ad6d-ac486efe22fe'::uuid)
--   ),
--   tabelas AS (
--     SELECT c.table_name FROM information_schema.columns c
--       JOIN information_schema.tables t
--         ON t.table_schema = c.table_schema AND t.table_name = c.table_name
--        AND t.table_type = 'BASE TABLE'
--      WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id'
--        AND c.table_name <> 'tenants'
--   )
--   SELECT tn.name AS loja, tb.table_name AS tabela, n.linhas
--     FROM alvo a
--     CROSS JOIN tabelas tb
--     JOIN public.tenants tn ON tn.id = a.tenant_id
--     CROSS JOIN LATERAL (
--       SELECT (xpath('/row/c/text()', query_to_xml(
--                 format('select count(*) as c from public.%I where tenant_id = %L',
--                        tb.table_name, a.tenant_id), false, true, '')))[1]::text::bigint AS linhas
--     ) n
--    WHERE n.linhas > 0
--    ORDER BY 1, 2;
--
--   Em 2026-08-20 isso devolvia 17 linhas — as mesmas da lista `esperado` da
--   GUARDA 6. Qualquer coisa a mais e o bloco aborta sozinho.
-- =============================================================================

BEGIN;

DO $remover_lojas_orfas$
DECLARE
  -- Alvos. Repetidos como constantes para que nenhum uuid apareça solto no meio
  -- do código e para que um erro de digitação vire erro de compilação, não um
  -- DELETE em outra Conta.
  c_yuri          constant uuid := '6aee6f9e-94e5-4962-bf5b-c014c1736b59';
  c_bruno         constant uuid := 'f52d8ba4-0714-4ce7-ad6d-ac486efe22fe';
  c_perfil_yuri   constant uuid := '03a7194a-16e7-4431-a1bd-f5774ef08945';
  c_perfil_bruno  constant uuid := '9a6de3d5-5152-4cd0-a36e-2eb780f844ed';
  c_perfil_teste  constant uuid := '3196d8c4-414a-4ce2-9a05-08d9f04f5666';

  v_erro          text;
  v_inventario    jsonb;
  v_role          text;
  v_status        text;
  v_tenant        uuid;
  v_email         text;
  v_confirm       timestamptz;
  v_banido        timestamptz;
  v_apagado       timestamptz;
  v_nullable      text;
  v_pares         bigint;
  v_msg_tenant    bigint;
  v_msg_conversa  bigint;
  v_msg_contato   bigint;
  v_instancias    bigint;
  v_segredos      bigint;
  v_conv_viva     bigint;
  v_total         bigint;
  v_bruno_perfil  bigint;
  v_teste_perfil  bigint;
  v_tenants_fim   bigint;
  v_perfis_fim    bigint;
BEGIN

-- ---------------------------------------------------------------------------
-- INVENTÁRIO — fotografia do que existe AGORA, antes de qualquer escrita.
--
-- Vive numa VARIÁVEL, não numa tabela temporária: foi exatamente a tabela
-- temporária que quebrou a primeira aplicação (ver cabeçalho). Como tudo isto
-- é um comando só, a variável atravessa o script inteiro sem depender de nada
-- da sessão.
--
-- Formato: lista de objetos {loja, tenant, tabela, linhas}. Serve para duas
-- coisas — a GUARDA 6 lê de volta com jsonb_to_recordset, e o passo 5 grava o
-- objeto inteiro no registro de auditoria.
--
-- `contact_tags` e as outras filhas SEM `tenant_id` não são alcançadas pela
-- varredura e entram na mão, com um `*` no nome para ficar claro que são
-- contadas pelo pai.
-- ---------------------------------------------------------------------------
  WITH alvo(tenant_id, apelido) AS (
    VALUES (c_yuri, 'Loja - Yuri Saldanha'), (c_bruno, 'Loja - Bruno Moura')
  ),
  tabelas AS (
    SELECT c.table_name::text AS nome
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema
       AND t.table_name   = c.table_name
       AND t.table_type   = 'BASE TABLE'
     WHERE c.table_schema = 'public'
       AND c.column_name  = 'tenant_id'
       AND c.table_name  <> 'tenants'
  ),
  varrida AS (
    SELECT a.apelido, a.tenant_id, tb.nome AS tabela, n.linhas
      FROM alvo a
      CROSS JOIN tabelas tb
      CROSS JOIN LATERAL (
        SELECT (xpath('/row/c/text()', query_to_xml(
                  format('select count(*) as c from public.%I where tenant_id = %L',
                         tb.nome, a.tenant_id), false, true, '')))[1]::text::bigint AS linhas
      ) n
    UNION ALL
    SELECT a.apelido, a.tenant_id, 'contact_tags*',
           (SELECT count(*) FROM public.contact_tags ct
             WHERE ct.contact_id IN (SELECT id FROM public.contacts WHERE tenant_id = a.tenant_id)
                OR ct.tag_id     IN (SELECT id FROM public.tags     WHERE tenant_id = a.tenant_id))
      FROM alvo a
    UNION ALL
    SELECT a.apelido, a.tenant_id, 'campaign_dispatch_queue*',
           (SELECT count(*) FROM public.campaign_dispatch_queue q
             WHERE q.contact_id IN (SELECT id FROM public.contacts WHERE tenant_id = a.tenant_id))
      FROM alvo a
    UNION ALL
    SELECT a.apelido, a.tenant_id, 'campaign_messages*',
           (SELECT count(*) FROM public.campaign_messages m
             WHERE m.campaign_id IN (SELECT id FROM public.mass_message_campaigns WHERE tenant_id = a.tenant_id))
      FROM alvo a
    UNION ALL
    SELECT a.apelido, a.tenant_id, 'webhook_logs*',
           (SELECT count(*) FROM public.webhook_logs w
             WHERE w.whatsapp_instance_id IN (SELECT id FROM public.whatsapp_instances WHERE tenant_id = a.tenant_id))
      FROM alvo a
    UNION ALL
    SELECT a.apelido, a.tenant_id, 'webhook_configuration_attempts*',
           (SELECT count(*) FROM public.webhook_configuration_attempts w
             WHERE w.whatsapp_instance_id IN (SELECT id FROM public.whatsapp_instances WHERE tenant_id = a.tenant_id))
      FROM alvo a
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'loja', apelido, 'tenant', tenant_id, 'tabela', tabela, 'linhas', linhas)
         ORDER BY apelido, tabela), '[]'::jsonb)
    INTO v_inventario
    FROM varrida
   WHERE linhas > 0;

-- ===========================================================================
-- GUARDA 1 — identidade. Id E nome, nos dois sentidos.
-- ===========================================================================
-- Se a linha existe, o nome tem que bater. E nenhum OUTRO tenant pode carregar
-- esses nomes (protege contra alguém ter recriado uma Loja com o mesmo nome).
-- Linha ausente NÃO é erro: é a segunda execução de um script idempotente.
  SELECT string_agg(msg, E'\n') INTO v_erro FROM (
    SELECT format('tenant %s existe mas nao confere: nome=%L kind=%L parent=%L',
                  t.id, t.name, t.kind, t.parent_tenant_id) AS msg
      FROM public.tenants t
     WHERE t.id = c_yuri
       AND NOT (t.name = 'Loja - Yuri Saldanha' AND t.kind::text = 'store' AND t.parent_tenant_id IS NULL)
    UNION ALL
    SELECT format('tenant %s existe mas nao confere: nome=%L kind=%L parent=%L',
                  t.id, t.name, t.kind, t.parent_tenant_id)
      FROM public.tenants t
     WHERE t.id = c_bruno
       AND NOT (t.name = 'Loja - Bruno Moura' AND t.kind::text = 'store' AND t.parent_tenant_id IS NULL)
    UNION ALL
    SELECT format('existe outro tenant com um dos nomes-alvo: %s (%s)', t.name, t.id)
      FROM public.tenants t
     WHERE t.name IN ('Loja - Yuri Saldanha', 'Loja - Bruno Moura')
       AND t.id NOT IN (c_yuri, c_bruno)
  ) x;

  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION E'GUARDA 1 (identidade) reprovou. Abortado.\n%', v_erro;
  END IF;

-- ===========================================================================
-- GUARDA 2 — sinais de vida. Se a realidade mudou, para tudo.
-- ===========================================================================
-- Mensagem é contada por TRÊS caminhos porque basta um deles ter linha para a
-- premissa "nunca houve atendimento aqui" cair.
  SELECT count(*) INTO v_msg_tenant   FROM public.messages WHERE tenant_id IN (c_yuri, c_bruno);
  SELECT count(*) INTO v_msg_conversa FROM public.messages
   WHERE conversation_id IN (SELECT id FROM public.conversations WHERE tenant_id IN (c_yuri, c_bruno));
  SELECT count(*) INTO v_msg_contato  FROM public.messages
   WHERE contact_id IN (SELECT id FROM public.contacts WHERE tenant_id IN (c_yuri, c_bruno));
  SELECT count(*) INTO v_instancias   FROM public.whatsapp_instances WHERE tenant_id IN (c_yuri, c_bruno);
  SELECT count(*) INTO v_segredos     FROM public.instance_secrets   WHERE tenant_id IN (c_yuri, c_bruno);

  -- Conversa "com conteúdo": qualquer sinal de que alguém falou ali.
  SELECT count(*) INTO v_conv_viva FROM public.conversations c
   WHERE c.tenant_id IN (c_yuri, c_bruno)
     AND (c.last_message_content IS NOT NULL
          OR c.last_message_direction IS NOT NULL
          OR COALESCE(c.unread_count, 0) > 0
          OR c.whatsapp_instance_id IS NOT NULL);

  IF v_msg_tenant + v_msg_conversa + v_msg_contato > 0 THEN
    RAISE EXCEPTION 'GUARDA 2 reprovou: existem mensagens nestas Lojas (por tenant=%, por conversa=%, por contato=%). A premissa deste script caiu. Abortado.',
      v_msg_tenant, v_msg_conversa, v_msg_contato;
  END IF;

  IF v_instancias > 0 OR v_segredos > 0 THEN
    RAISE EXCEPTION 'GUARDA 2 reprovou: existe instancia de WhatsApp ligada (instancias=%, segredos=%). Alguem voltou a usar esta Loja. Abortado.',
      v_instancias, v_segredos;
  END IF;

  IF v_conv_viva > 0 THEN
    RAISE EXCEPTION 'GUARDA 2 reprovou: % conversa(s) com conteudo. Esperado: no maximo 1 conversa vazia, sem instancia e sem mensagem. Abortado.',
      v_conv_viva;
  END IF;

-- ===========================================================================
-- GUARDA 3 — o superadmin Yuri continua entrando depois da mudança.
-- ===========================================================================
-- O que faz alguém entrar no ConvoFlow NÃO é o tenant_id:
--   auth.users      → e-mail confirmado, não banido, não apagado;
--   profiles.status → 'active' (AuthGuard derruba suspended/deleted);
--   profiles.role   → 'superadmin' dá o bypass do paywall (useTenantAccess) e
--                     o poder no RLS (is_super_admin_safe() lê role+status,
--                     nunca tenant).
-- Confere os três, mais duas coisas: que a coluna aceita NULL, e que já existe
-- OUTRO superadmin rodando com tenant NULL — prova viva, não teoria.
  SELECT p.role::text, p.status::text, p.tenant_id,
         u.email, u.email_confirmed_at, u.banned_until, u.deleted_at
    INTO v_role, v_status, v_tenant, v_email, v_confirm, v_banido, v_apagado
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.user_id
   WHERE p.id = c_perfil_yuri;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'GUARDA 3 reprovou: o perfil % (Yuri) nao existe. Abortado.', c_perfil_yuri;
  END IF;

  IF v_email IS DISTINCT FROM 'yuri17raulino@gmail.com' THEN
    RAISE EXCEPTION 'GUARDA 3 reprovou: o perfil esperado do Yuri esta com o e-mail %. Abortado.', v_email;
  END IF;

  IF v_role <> 'superadmin' THEN
    RAISE EXCEPTION 'GUARDA 3 reprovou: o cargo do Yuri e %, nao superadmin. Sem superadmin, tirar o tenant_id o deixa sem Conta E sem poder. Abortado.', v_role;
  END IF;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'GUARDA 3 reprovou: o status do Yuri e % (esperado active). Abortado.', v_status;
  END IF;

  IF v_confirm IS NULL OR v_banido IS NOT NULL OR v_apagado IS NOT NULL THEN
    RAISE EXCEPTION 'GUARDA 3 reprovou: o usuario do Auth nao esta apto a entrar (confirmado=% banido=% apagado=%). Abortado.',
      v_confirm, v_banido, v_apagado;
  END IF;

  IF v_tenant IS NOT NULL AND v_tenant <> c_yuri THEN
    RAISE EXCEPTION 'GUARDA 3 reprovou: o Yuri esta na Conta %, que nao e a Loja que este script remove. Abortado.', v_tenant;
  END IF;

  SELECT is_nullable INTO v_nullable
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'tenant_id';

  IF v_nullable <> 'YES' THEN
    RAISE EXCEPTION 'GUARDA 3 reprovou: profiles.tenant_id nao aceita NULL. Abortado.';
  END IF;

  SELECT count(*) INTO v_pares
    FROM public.profiles p
   WHERE p.role::text = 'superadmin' AND p.status::text = 'active'
     AND p.tenant_id IS NULL AND p.id <> c_perfil_yuri;

  IF v_pares = 0 THEN
    RAISE EXCEPTION 'GUARDA 3 reprovou: nenhum outro superadmin ativo roda com tenant_id NULL. Sem esse precedente vivo, nao ha prova de que a forma funciona. Abortado.';
  END IF;

-- ===========================================================================
-- GUARDA 4 — os perfis a apagar são EXATAMENTE os dois esperados.
-- ===========================================================================
-- 3 perfis antes do passo 1 (Yuri ainda dentro), 2 depois, 0 se já rodou tudo.
  SELECT count(*) INTO v_total FROM public.profiles WHERE tenant_id IN (c_yuri, c_bruno);

  IF v_total NOT IN (0, 2, 3) THEN
    RAISE EXCEPTION 'GUARDA 4 reprovou: % perfis nas duas Lojas (esperado 3, ou 2 se o passo 1 ja rodou). Abortado.', v_total;
  END IF;

  SELECT count(*) INTO v_bruno_perfil
    FROM public.profiles p JOIN auth.users u ON u.id = p.user_id
   WHERE p.id = c_perfil_bruno AND u.email = 'bbrunomoura29@gmail.com'
     AND p.tenant_id = c_bruno AND p.role::text = 'gestor';

  SELECT count(*) INTO v_teste_perfil
    FROM public.profiles p JOIN auth.users u ON u.id = p.user_id
   WHERE p.id = c_perfil_teste AND u.email = 'teste@teste.com'
     AND p.tenant_id = c_yuri AND p.status::text = 'deleted';

  IF v_total > 0 AND (v_bruno_perfil + v_teste_perfil) = 0 THEN
    RAISE EXCEPTION 'GUARDA 4 reprovou: existem perfis nas duas Lojas, mas nenhum e um dos dois esperados. Alguem entrou nessas Lojas. Abortado.';
  END IF;

-- ===========================================================================
-- GUARDA 5 — nada de fora depende destas linhas.
-- ===========================================================================
-- Alvo: as FKs `ON DELETE SET NULL` que apontam para `profiles`. Elas não
-- bloqueiam o DELETE — pior: mudam calado a linha de OUTRA Conta. E as FKs
-- `NO ACTION` para `tenants`, que bloqueariam o DELETE lá no fim.
  SELECT string_agg(msg, E'\n') INTO v_erro FROM (
    SELECT format('followup_sequence_enrollments.assigned_to: %s linha(s)', count(*)) AS msg
      FROM public.followup_sequence_enrollments
     WHERE assigned_to IN (c_perfil_bruno, c_perfil_teste) HAVING count(*) > 0
    UNION ALL
    SELECT format('followup_sequences.created_by: %s linha(s)', count(*))
      FROM public.followup_sequences
     WHERE created_by IN (c_perfil_bruno, c_perfil_teste) HAVING count(*) > 0
    UNION ALL
    SELECT format('individual_followups.assigned_to: %s linha(s)', count(*))
      FROM public.individual_followups
     WHERE assigned_to IN (c_perfil_bruno, c_perfil_teste) HAVING count(*) > 0
    UNION ALL
    SELECT format('whatsapp_instances.assigned_profile_id: %s linha(s)', count(*))
      FROM public.whatsapp_instances
     WHERE assigned_profile_id IN (c_perfil_bruno, c_perfil_teste) HAVING count(*) > 0
    UNION ALL
    SELECT format('profiles.parent_id: %s linha(s)', count(*))
      FROM public.profiles
     WHERE parent_id IN (c_perfil_bruno, c_perfil_teste) HAVING count(*) > 0
    UNION ALL
    SELECT format('subscriptions.profile_id: %s linha(s)', count(*))
      FROM public.subscriptions
     WHERE profile_id IN (c_perfil_bruno, c_perfil_teste) HAVING count(*) > 0
    UNION ALL
    SELECT format('tenants.parent_tenant_id aponta para uma das Lojas: %s linha(s)', count(*))
      FROM public.tenants
     WHERE parent_tenant_id IN (c_yuri, c_bruno) HAVING count(*) > 0
    UNION ALL
    SELECT format('tenants.affiliate_id aponta para uma das Lojas: %s linha(s)', count(*))
      FROM public.tenants
     WHERE affiliate_id IN (c_yuri, c_bruno) HAVING count(*) > 0
    UNION ALL
    SELECT format('bug_reports.store_id: %s linha(s)', count(*))
      FROM public.bug_reports
     WHERE store_id IN (c_yuri, c_bruno) HAVING count(*) > 0
  ) x;

  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION E'GUARDA 5 reprovou: coisa de fora depende destas linhas. Abortado.\n%', v_erro;
  END IF;

-- ===========================================================================
-- GUARDA 6 — nada além do inventário levantado em 2026-08-20.
-- ===========================================================================
-- Um teto por (tabela, Loja). Tabela fora da lista tem teto zero: QUALQUER
-- tabela que passe a ter linha aborta. Crescer também aborta — crescimento é
-- atividade nova, e atividade nova derruba a decisão de apagar. Encolher não
-- aborta (alguém pode já ter limpado parte).
  WITH inv AS (
    SELECT * FROM jsonb_to_recordset(v_inventario)
      AS x(loja text, tenant uuid, tabela text, linhas bigint)
  ),
  esperado(tabela, tenant, teto) AS (
    VALUES
      ('chatbot_edges',        c_yuri,    5::bigint),
      ('chatbot_nodes',        c_yuri,    6::bigint),
      ('chatbot_sessions',     c_yuri,    2::bigint),
      ('chatbot_triggers',     c_yuri,    5::bigint),
      ('chatbots',             c_yuri,    1::bigint),
      ('contacts',             c_yuri,  182::bigint),
      ('conversations',        c_yuri,    1::bigint),
      ('funnel_stages',        c_yuri,    7::bigint),
      ('lead_sources',         c_yuri,    8::bigint),
      ('profiles',             c_yuri,    2::bigint),
      ('report_executions',    c_yuri,    2::bigint),
      ('report_templates',     c_yuri,    7::bigint),
      ('tags',                 c_yuri,   10::bigint),
      ('tenant_access_events', c_yuri,    2::bigint),
      ('contact_tags*',        c_yuri,    1::bigint),
      ('profiles',             c_bruno,   1::bigint),
      ('tags',                 c_bruno,   5::bigint),
      ('tenant_access_events', c_bruno,   3::bigint)
  )
  SELECT string_agg(format('  %s / %s: %s linha(s), esperado no maximo %s',
                           i.loja, i.tabela, i.linhas, COALESCE(e.teto, 0)), E'\n'
                    ORDER BY i.loja, i.tabela)
    INTO v_erro
    FROM inv i
    LEFT JOIN esperado e ON e.tabela = i.tabela AND e.tenant = i.tenant
   WHERE i.linhas > COALESCE(e.teto, 0);

  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION E'GUARDA 6 reprovou: a realidade mudou desde o levantamento de 2026-08-20. Abortado.\n%\nRefaca o levantamento antes de insistir.', v_erro;
  END IF;

-- ===========================================================================
-- PASSO 1 — desvincular o superadmin Yuri da Loja dele
-- ===========================================================================
-- Tem que ser o PRIMEIRO. `profiles_tenant_id_fkey` é ON DELETE CASCADE:
-- apagar a Loja com ele dentro apagaria o perfil de superadmin junto, calado.
--
-- Gatilhos que disparam neste UPDATE:
--   enforce_store_membership_limits_trg — a primeira linha da função é
--     `IF NEW.status = 'deleted' OR NEW.tenant_id IS NULL THEN RETURN NEW;`,
--     então sai na hora. Sem Loja não há vaga a conferir.
--   update_profiles_updated_at — só carimba updated_at.
--   force_profile_is_active / sync_profile_is_active — disparam em `is_active`
--     e em `status`, colunas que este UPDATE não toca. Não rodam.
--
-- O WHERE repete a identidade inteira: se algo saiu do lugar entre a guarda e
-- aqui, o UPDATE simplesmente não casa.
  UPDATE public.profiles p
     SET tenant_id = NULL
    FROM auth.users u
   WHERE u.id = p.user_id
     AND p.id = c_perfil_yuri
     AND u.email = 'yuri17raulino@gmail.com'
     AND p.role::text = 'superadmin'
     AND p.status::text = 'active'
     AND p.tenant_id = c_yuri;

-- ===========================================================================
-- PASSO 2 — apagar as linhas dependentes, em ordem segura de FK
-- ===========================================================================
-- Tudo aqui cairia por CASCADE ao apagar a Loja. É explícito de propósito: o
-- passo 3.5 confere que não sobrou NADA antes do DELETE final, e é essa
-- conferência que garante que a Loja não leva junto nada fora desta lista.
--
-- A ordem importa em dois pontos, e só neles:
--   contacts.current_stage_id -> funnel_stages  (NO ACTION)
--   contacts.lead_source_id   -> lead_sources   (NO ACTION)
-- Por isso `contacts` sai ANTES de `funnel_stages` e `lead_sources`.

  -- 2.1 — filhas sem tenant_id
  DELETE FROM public.contact_tags ct
   WHERE ct.contact_id IN (SELECT id FROM public.contacts WHERE tenant_id IN (c_yuri, c_bruno))
      OR ct.tag_id     IN (SELECT id FROM public.tags     WHERE tenant_id IN (c_yuri, c_bruno));

  -- 2.2 — chatbot: sessões e arestas antes dos nós, nós antes do bot
  DELETE FROM public.chatbot_sessions  WHERE tenant_id IN (c_yuri, c_bruno);
  DELETE FROM public.chatbot_edges     WHERE tenant_id IN (c_yuri, c_bruno);
  DELETE FROM public.chatbot_triggers  WHERE tenant_id IN (c_yuri, c_bruno);
  DELETE FROM public.chatbot_variables WHERE tenant_id IN (c_yuri, c_bruno);
  DELETE FROM public.chatbot_nodes     WHERE tenant_id IN (c_yuri, c_bruno);
  DELETE FROM public.chatbots          WHERE tenant_id IN (c_yuri, c_bruno);

  -- 2.3 — relatórios: execuções/dados/agendas antes dos modelos
  DELETE FROM public.report_executions WHERE tenant_id IN (c_yuri, c_bruno);
  DELETE FROM public.report_data       WHERE tenant_id IN (c_yuri, c_bruno);
  DELETE FROM public.report_schedules  WHERE tenant_id IN (c_yuri, c_bruno);
  DELETE FROM public.report_templates  WHERE tenant_id IN (c_yuri, c_bruno);

  -- 2.4 — atendimento: conversas antes dos contatos
  DELETE FROM public.conversations WHERE tenant_id IN (c_yuri, c_bruno);
  DELETE FROM public.contacts      WHERE tenant_id IN (c_yuri, c_bruno);

  -- 2.5 — cadastros de apoio. DEPOIS de `contacts`: as duas FKs são NO ACTION.
  DELETE FROM public.funnel_stages WHERE tenant_id IN (c_yuri, c_bruno);
  DELETE FROM public.lead_sources  WHERE tenant_id IN (c_yuri, c_bruno);
  DELETE FROM public.tags          WHERE tenant_id IN (c_yuri, c_bruno);

  -- 2.6 — histórico de acesso das duas Lojas. Não dá para preservar:
  -- `tenant_access_events_tenant_id_fkey` é ON DELETE CASCADE, então morre com
  -- a Loja de qualquer jeito. É por isso que a auditoria do passo 5 vai para
  -- `system_logs`, que não tem FK para `tenants`.
  DELETE FROM public.tenant_access_events WHERE tenant_id IN (c_yuri, c_bruno);

-- ===========================================================================
-- PASSO 3 — apagar os dois perfis que sobram
-- ===========================================================================
-- Por id E e-mail E cargo/status. Não por `tenant_id`, para que nem um engano
-- nos ids das Lojas alcance outra pessoa.
-- `user_activity_log.profile_id` é CASCADE — os dois têm ZERO linhas lá
-- (nenhum dos dois nunca entrou), então nada de histórico se perde.
  DELETE FROM public.profiles p
   USING auth.users u
   WHERE u.id = p.user_id AND p.id = c_perfil_bruno
     AND u.email = 'bbrunomoura29@gmail.com' AND p.role::text = 'gestor';

  DELETE FROM public.profiles p
   USING auth.users u
   WHERE u.id = p.user_id AND p.id = c_perfil_teste
     AND u.email = 'teste@teste.com' AND p.status::text = 'deleted';

-- ===========================================================================
-- PASSO 3.5 — a conferência que torna o DELETE final inofensivo
-- ===========================================================================
-- Varre TODAS as tabelas com tenant_id de novo, agora depois dos DELETEs. Se
-- sobrou uma linha sequer, o DELETE do passo 4 a levaria por CASCADE sem estar
-- declarada em lugar nenhum — exatamente o que este script não quer fazer.
  WITH alvo(tenant_id, apelido) AS (
    VALUES (c_yuri, 'Loja - Yuri Saldanha'), (c_bruno, 'Loja - Bruno Moura')
  ),
  tabelas AS (
    SELECT c.table_name::text AS nome
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
       AND t.table_type = 'BASE TABLE'
     WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id'
       AND c.table_name <> 'tenants'
  )
  SELECT string_agg(format('  %s / %s: %s linha(s)', a.apelido, tb.nome, n.linhas), E'\n')
    INTO v_erro
    FROM alvo a
    CROSS JOIN tabelas tb
    CROSS JOIN LATERAL (
      SELECT (xpath('/row/c/text()', query_to_xml(
                format('select count(*) as c from public.%I where tenant_id = %L',
                       tb.nome, a.tenant_id), false, true, '')))[1]::text::bigint AS linhas
    ) n
   WHERE n.linhas > 0;

  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION E'PASSO 3.5 reprovou: sobrou linha que o DELETE final levaria por CASCADE sem estar declarada. Abortado.\n%', v_erro;
  END IF;

-- ===========================================================================
-- PASSO 4 — apagar as duas Lojas
-- ===========================================================================
-- Depois do passo 3.5 este DELETE não tem mais nada para cascatear.
  DELETE FROM public.tenants WHERE id IN (c_yuri, c_bruno);

-- ===========================================================================
-- PASSO 5 — registro do que foi removido
-- ===========================================================================
-- Vai para `public.system_logs`: única tabela de registro do schema SEM FK para
-- `tenants`, portanto a única que sobrevive à remoção. `tenant_access_events`
-- seria o lugar natural, mas cascateia junto (ver 2.6).
--
-- Alcance, com honestidade: nenhuma tela do produto lê `system_logs`. Isto é
-- registro para quem for ao banco perguntar "cadê essas Lojas?".
--
-- `user_id` fica NULL de propósito: no SQL Editor `auth.uid()` não existe.
-- Quem decidiu está no metadata, como texto, para ninguém confundir decisor
-- com executor.
--
-- O `IF` é o que torna o passo idempotente: na segunda execução o inventário
-- está vazio e nada novo é escrito.
  IF v_inventario <> '[]'::jsonb THEN
    INSERT INTO public.system_logs (level, message, service_name, component, user_id, metadata)
    VALUES (
      'warn',
      'Remocao definitiva das duas Lojas orfas: "Loja - Yuri Saldanha" e "Loja - Bruno Moura".',
      'convoflow-manutencao',
      'remover_lojas_orfas',
      NULL,
      jsonb_build_object(
        'script', 'docs/remover_lojas_orfas.sql',
        'decidido_por', 'yuri17raulino@gmail.com',
        'decidido_em', '2026-08-20',
        'motivo', 'Nenhuma das duas teve uma unica mensagem ou instancia de WhatsApp em toda a historia do banco. Bruno nunca entrou (login_count=0) e o acesso da Loja dele foi revogado em 2026-07-01. A Loja do Yuri estava parada desde 2026-06-24; o que a mantinha viva era o perfil de superadmin pendurado nela.',
        'origem_das_lojas', 'Migracoes 20260513140200_isolate_yuri_reno_tenants e 20260513140300_assign_bruno_loja_mario_superadmin, que as criaram como recipiente para perfis orfaos quando o "Super Admin Tenant" foi apagado.',
        'tenants_removidos', jsonb_build_array(
          jsonb_build_object('id', c_yuri,  'nome', 'Loja - Yuri Saldanha'),
          jsonb_build_object('id', c_bruno, 'nome', 'Loja - Bruno Moura')),
        'perfis_removidos', jsonb_build_array(
          'bbrunomoura29@gmail.com (gestor, nunca entrou)',
          'teste@teste.com (status=deleted, usuario de teste)'),
        'perfil_desvinculado', 'yuri17raulino@gmail.com (superadmin: tenant_id -> NULL, igualando reno@re9.online e admin@convoflow.com)',
        'auth_users_mantidos', jsonb_build_array('bbrunomoura29@gmail.com', 'teste@teste.com'),
        'linhas_removidas', v_inventario
      )
    );
  END IF;

-- ===========================================================================
-- CONFERÊNCIA FINAL — ainda dentro do bloco. Reprovou, nada é gravado.
-- ===========================================================================
  SELECT count(*) INTO v_tenants_fim FROM public.tenants
   WHERE id IN (c_yuri, c_bruno) OR name IN ('Loja - Yuri Saldanha', 'Loja - Bruno Moura');
  IF v_tenants_fim <> 0 THEN
    RAISE EXCEPTION 'CONFERENCIA FINAL reprovou: sobrou % linha(s) em tenants. Abortado.', v_tenants_fim;
  END IF;

  SELECT p.role::text, p.status::text, p.tenant_id
    INTO v_role, v_status, v_tenant
    FROM public.profiles p WHERE p.id = c_perfil_yuri;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONFERENCIA FINAL reprovou: o perfil do Yuri sumiu. Abortado.';
  END IF;
  IF v_tenant IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERENCIA FINAL reprovou: o tenant_id do Yuri e %, deveria ser NULL. Abortado.', v_tenant;
  END IF;
  IF v_role <> 'superadmin' OR v_status <> 'active' THEN
    RAISE EXCEPTION 'CONFERENCIA FINAL reprovou: o Yuri esta como cargo=% status=%. Abortado.', v_role, v_status;
  END IF;

  SELECT count(*) INTO v_perfis_fim FROM public.profiles
   WHERE id IN (c_perfil_bruno, c_perfil_teste);
  IF v_perfis_fim <> 0 THEN
    RAISE EXCEPTION 'CONFERENCIA FINAL reprovou: % perfil(is) que deveriam ter sido apagados ainda existem. Abortado.', v_perfis_fim;
  END IF;

  RAISE NOTICE 'Tudo certo. Yuri segue superadmin ativo, agora sem Conta. As duas Lojas nao existem mais.';
END;
$remover_lojas_orfas$;

COMMIT;

-- =============================================================================
-- DEPOIS DE RODAR — conferir (foi o que se rodou em 2026-08-20)
-- =============================================================================
--   SELECT 'tenants restantes' AS item, count(*)::text AS valor FROM public.tenants
--   UNION ALL
--   SELECT 'lojas orfas', count(*)::text FROM public.tenants
--    WHERE kind = 'store' AND parent_tenant_id IS NULL
--   UNION ALL
--   SELECT 'superadmins com tenant NULL', count(*)::text FROM public.profiles
--    WHERE role::text = 'superadmin' AND status::text = 'active' AND tenant_id IS NULL
--   UNION ALL
--   SELECT 'seu cargo/status', (SELECT p.role::text || ' / ' || p.status::text
--      FROM public.profiles p WHERE p.id = '03a7194a-16e7-4431-a1bd-f5774ef08945')
--   UNION ALL
--   SELECT 'contact_tags orfaos', count(*)::text FROM public.contact_tags ct
--    WHERE NOT EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = ct.contact_id)
--   UNION ALL
--   SELECT 'tenant_access_events orfaos', count(*)::text FROM public.tenant_access_events e
--    WHERE NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = e.tenant_id)
--   UNION ALL
--   SELECT 'registro em system_logs', count(*)::text FROM public.system_logs
--    WHERE component = 'remover_lojas_orfas';
--
--   Resultado obtido em 2026-08-20: 4, 0, 3, "superadmin / active", 0, 0, 1.
--
--   E o teste de verdade, pelo produto: entrar com yuri17raulino@gmail.com e
--   ver o Dashboard abrir com o botão "Selecionar Conta" no topo, listando as
--   4 Contas restantes. Conferido no mesmo dia.
--
-- -----------------------------------------------------------------------------
-- ITEM SEPARADO — os dois usuários que ficaram no Auth sem perfil
-- -----------------------------------------------------------------------------
-- bbrunomoura29@gmail.com e teste@teste.com continuam em `auth.users`. Isso não
-- vaza dado: sem linha em `profiles`, `get_current_user_tenant_id()` devolve
-- NULL e `is_super_admin_safe()` devolve false — o RLS não entrega nada.
--
-- O que quebra: o `AuthGuard` deixa passar usuário sem perfil de propósito
-- (está escrito lá), e o `DashboardLayout` então chama `useTenantAccess`, que
-- fica em `loading` para sempre quando o cargo é nulo. Na prática, se
-- bbrunomoura29 pedir "esqueci a senha" e entrar, vê um carregando eterno.
-- Feio, não perigoso.
--
-- E a lápide se perdeu: teste@teste.com tinha `status='deleted'`, e o AuthGuard
-- o derrubava com "Esta conta foi excluida.". Sem o perfil, ele cai no
-- carregando eterno como o outro.
--
-- Para fechar, apague os dois pelo painel (Authentication › Users › Delete
-- user), que é o caminho suportado. Pelo SQL seria:
--
--   -- ⚠️ Decisao separada, execucao separada.
--   -- DELETE FROM auth.users WHERE email IN ('bbrunomoura29@gmail.com','teste@teste.com');
--
-- Cascateia sozinho para identities, sessions, mfa_factors e one_time_tokens.
-- Não bloqueia em nada: as FKs de `public` para `auth.users` são todas SET NULL
-- ou CASCADE e nenhuma tem linha destes dois. `tenant_access_events.actor_user_id`
-- é NO ACTION — mas o ator de todos os eventos é o Yuri, que fica.
-- =============================================================================
