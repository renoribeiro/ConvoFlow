-- =============================================================================
-- ConvoFlow — reconciliar o ledger de migrações (projeto pqjkuwyshybxldzpfbbs)
-- =============================================================================
-- Auditoria de 2026-08-24: 117 arquivos em supabase/migrations/, 102 versões no
-- ledger, 48 arquivos sem nenhum rastro. Este script fecha esses 48.
--
-- ESTE SCRIPT NÃO MEXE NO ESQUEMA. Ele só escreve linhas em
-- supabase_migrations.schema_migrations. Nenhum CREATE, ALTER, DROP, INSERT ou
-- UPDATE em tabela do produto. É o equivalente SQL de
--     supabase migration repair --status applied <versao>
-- que não dá para usar aqui porque a variável de usuário SUPABASE_ACCESS_TOKEN
-- está morta e devolve 401 (ver CLAUDE.md, armadilha 3).
--
-- NÃO rode `supabase db push` neste projeto, nem antes nem depois.
--
-- -----------------------------------------------------------------------------
-- COMO RODAR
-- -----------------------------------------------------------------------------
-- São TRÊS lotes independentes. Cole UM POR VEZ no SQL Editor do Supabase.
-- Cada lote é um único bloco DO $tag$ ... $tag$; — um comando só. Ou ele
-- termina, ou o PostgreSQL desfaz tudo o que ele fez. Não existe meio-termo.
-- (No SQL Editor, BEGIN;/COMMIT; NÃO garante isso — ver CLAUDE.md, armadilha 4.)
--
-- Ordem: LOTE 1 → conferir → LOTE 2 → conferir → LOTE 3 → conferir.
-- O passo-a-passo completo está em docs/RUNBOOK_reconciliacao_ledger.md
--
-- -----------------------------------------------------------------------------
-- A GUARDA QUE IMPORTA
-- -----------------------------------------------------------------------------
-- Nos LOTES 1 e 2, cada versão só é carimbada se o objeto que PROVA que ela
-- rodou ainda estiver vivo NESTE MESMO BLOCO. A prova está escrita na linha de
-- cada versão, nas colunas `tipo` / `objeto` / `detalhe`.
--
-- Se qualquer prova estiver ausente, o bloco inteiro aborta com RAISE EXCEPTION
-- e NADA é gravado — nem as versões cuja prova passou. Isso é de propósito: se
-- uma prova sumiu, minha classificação está errada em algum ponto, e carimbar
-- as outras seria assumir que o resto está certo.
--
-- Idempotente: ON CONFLICT (version) DO NOTHING. Rodar duas vezes não quebra e
-- não duplica (a PK de schema_migrations é `version`).
--
-- -----------------------------------------------------------------------------
-- CONFERÊNCIA ANTES (rode isto sozinho primeiro, é só leitura)
-- -----------------------------------------------------------------------------
--   SELECT count(*) AS versoes_no_ledger FROM supabase_migrations.schema_migrations;
--   -- Em 2026-08-24 isso devolvia 102.
--   -- Depois dos três lotes deve devolver 150 (102 + 27 + 6 + 15).
-- =============================================================================


-- #############################################################################
-- #                                                                           #
-- #  LOTE 1 — 27 migrações aplicadas, efeito conferido objeto por objeto      #
-- #                                                                           #
-- #############################################################################
--
-- O QUE FAZ: carimba 27 versões cujo efeito eu confirmei vivo no banco.
-- RISCO: baixo. Nenhum SQL de esquema roda. O único jeito de dar errado é eu
--        ter classificado alguma errado — e é exatamente contra isso que serve
--        a coluna de prova em cada linha. Confira 3 ou 4 por amostragem.
-- REVERSÍVEL: sim, bloco de reversão logo abaixo do lote.

DO $lote1$
DECLARE
  r            record;
  v_ok         boolean;
  v_faltando   text := '';
  v_inseridas  integer := 0;
  v_ja_tinha   integer := 0;
  v_demo_seeds constant uuid[] := ARRAY[
    '550e8400-e29b-41d4-a716-446655440040','550e8400-e29b-41d4-a716-446655440041',
    '550e8400-e29b-41d4-a716-446655440042','550e8400-e29b-41d4-a716-446655440043',
    '550e8400-e29b-41d4-a716-446655440044']::uuid[];
BEGIN
  -- ---- Guardas de identidade ------------------------------------------------
  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'supabase_migrations.schema_migrations não existe. Projeto errado — nada foi alterado.';
  END IF;
  IF to_regclass('public.tenants') IS NULL OR to_regclass('public.whatsapp_instances') IS NULL THEN
    RAISE EXCEPTION 'public.tenants / public.whatsapp_instances não existem. Este não é o banco do ConvoFlow — nada foi alterado.';
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
    -- versão          | nome no ledger                            | tipo  | objeto                        | detalhe (A PROVA)
      ('20250120000001','add_campaign_randomization_fields'        ,'col' ,'mass_message_campaigns'       ,'enable_message_randomization'),
      ('20250802131928','job_queue_functions_and_evolution_webhook','fn'  ,'complete_job'                 ,'p_job_id uuid, p_success boolean, p_error_message text'),
      ('20250802152533','cleanup_demo_seed_contacts'               ,'sem_contato_seed','contacts'         ,NULL),
      ('20250802152841','cleanup_demo_tenant'                      ,'sem_tenant_demo' ,'tenants'          ,NULL),
      ('20260103000000','add_waha_provider'                        ,'col' ,'whatsapp_instances'           ,'connection_config'),
      ('20260506120000','enable_vault_and_meta_provider'           ,'rel' ,'instance_secrets'             ,NULL),
      ('20260529120000','contacts_unique_per_instance'             ,'idx' ,'contacts'                     ,'contacts_tenant_phone_no_instance_uniq'),
      ('20260529130000','process_incoming_message_per_instance'    ,'fn'  ,'process_incoming_message'     ,'p_phone text, p_message_content text, p_whatsapp_instance_id uuid, p_evolution_message_id text'),
      ('20260601000001','chatbot_visual_flow_builder'              ,'col' ,'chatbots'                     ,'builder_version'),
      ('20260615000001','whatsapp_policy_watch'                    ,'cron','cron.job'                     ,'whatsapp-policy-watch-weekly'),
      ('20260615000002','whatsapp_compliance_guardrails'           ,'fn'  ,'is_within_service_window'     ,'p_instance_id uuid, p_phone text'),
      ('20260615000003','whatsapp_consent_warmup_templates'        ,'col' ,'contacts'                     ,'opt_out_mass_message'),
      ('20260623000001','automation_drop_legacy_sql_engine'        ,'nofn','process_automation_trigger'   ,NULL),
      ('20260630000001','tenant_access_gate'                       ,'pol' ,'tenant_access_events'         ,'access_events_superadmin_all'),
      ('20260630000002','fix_notifications_schema'                 ,'pol' ,'notifications'                ,'notifications_select_own'),
      ('20260630000003','webhooks_outbound'                        ,'fn'  ,'emit_webhook_event'           ,'p_tenant_id uuid, p_event_type text, p_payload jsonb'),
      ('20260630000004','webhook_dispatcher_cron'                  ,'cron','cron.job'                     ,'webhook-dispatcher-every-minute'),
      ('20260701000001','messages_ad_referral'                     ,'idx' ,'messages'                     ,'idx_messages_ad_referral'),
      ('20260731000001','revoke_public_access_materialized_views'  ,'rel' ,'tracking_metrics_daily_filtered',NULL),
      ('20260810000001','bug_reports_table'                        ,'pol' ,'bug_reports'                  ,'bug_reports_tenant_insert'),
      ('20260810000002','bug_reports_storage_bucket'               ,'buck','storage.buckets'              ,'bug-reports'),
      ('20260810000003','tenants_bug_report_enabled'               ,'col' ,'tenants'                      ,'bug_report_enabled'),
      ('20260811000001','coupons_duration_and_promo_code'          ,'idx' ,'coupons'                      ,'idx_coupons_stripe_promotion_code_id'),
      ('20260813000003','rpc_set_tenant_settings'                  ,'fn'  ,'set_tenant_settings'          ,'p_tenant_id uuid, p_patch jsonb'),
      ('20260513000002','user_hierarchy_rls'                       ,'pol' ,'profiles'                     ,'profiles_insert_hierarchy'),
      ('20260716000001','hierarchy_v2_add_enum_values'             ,'enum','user_role'                    ,'atendente'),
      ('20260716000003','hierarchy_v2_mario_camila_encaixarh'      ,'kind_conta','tenants'                ,NULL)
    ) AS t(version, name, kind, obj, det)
  LOOP
    v_ok := CASE r.kind
      WHEN 'rel'  THEN to_regclass('public.' || r.obj) IS NOT NULL
      WHEN 'col'  THEN EXISTS (SELECT 1 FROM information_schema.columns
                                WHERE table_schema='public' AND table_name=r.obj AND column_name=r.det)
      WHEN 'fn'   THEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                                WHERE n.nspname='public' AND p.proname=r.obj
                                  AND pg_get_function_identity_arguments(p.oid)=r.det)
      WHEN 'nofn' THEN NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                                    WHERE n.nspname='public' AND p.proname=r.obj)
      WHEN 'pol'  THEN EXISTS (SELECT 1 FROM pg_policies
                                WHERE schemaname='public' AND tablename=r.obj AND policyname=r.det)
      WHEN 'idx'  THEN EXISTS (SELECT 1 FROM pg_indexes
                                WHERE schemaname='public' AND tablename=r.obj AND indexname=r.det)
      WHEN 'enum' THEN EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
                                WHERE t.typname=r.obj AND e.enumlabel=r.det)
      WHEN 'cron' THEN EXISTS (SELECT 1 FROM cron.job WHERE jobname=r.det)
      WHEN 'buck' THEN EXISTS (SELECT 1 FROM storage.buckets WHERE id=r.det)
      -- provas sob medida:
      WHEN 'sem_contato_seed' THEN NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = ANY(v_demo_seeds))
      WHEN 'sem_tenant_demo'  THEN NOT EXISTS (SELECT 1 FROM public.tenants
                                                WHERE id='550e8400-e29b-41d4-a716-446655440000'::uuid)
      WHEN 'kind_conta'       THEN EXISTS (SELECT 1 FROM public.tenants
                                            WHERE kind='account' AND name='Mario Acioli')
                                   AND EXISTS (SELECT 1 FROM public.tenants
                                                WHERE kind='store' AND name='EncaixaRH'
                                                  AND parent_tenant_id IS NOT NULL)
      ELSE NULL
    END;

    IF v_ok IS NULL THEN
      RAISE EXCEPTION 'Tipo de prova desconhecido "%" na versão %. Nada foi alterado.', r.kind, r.version;
    END IF;

    IF NOT v_ok THEN
      v_faltando := v_faltando || format(E'\n    %s (%s) — prova ausente: %s %s %s',
                                         r.version, r.name, r.kind, r.obj, coalesce(r.det,''));
      CONTINUE;
    END IF;

    IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = r.version) THEN
      v_ja_tinha := v_ja_tinha + 1;
    ELSE
      INSERT INTO supabase_migrations.schema_migrations (version, name)
      VALUES (r.version, r.name);
      v_inseridas := v_inseridas + 1;
    END IF;
  END LOOP;

  -- Falhar alto: se UMA prova sumiu, a classificação está errada e o bloco
  -- inteiro é desfeito, inclusive os INSERTs que já rodaram acima.
  IF v_faltando <> '' THEN
    RAISE EXCEPTION E'LOTE 1 ABORTADO — nada foi gravado.\n  Provas que eu esperava encontrar e não estão no banco:%s\n  Não force. Traga esta mensagem de volta para reclassificar.', v_faltando;
  END IF;

  RAISE NOTICE 'LOTE 1 OK — % carimbadas agora, % já estavam no ledger (27 conferidas).', v_inseridas, v_ja_tinha;
END
$lote1$;

-- -----------------------------------------------------------------------------
-- REVERSÃO DO LOTE 1 — descomente e rode só se precisar desfazer.
-- Apaga exatamente as 27 versões deste lote, e só se ninguém tiver escrito
-- `statements` nelas (o que indicaria que outra ferramenta as gravou de verdade).
-- -----------------------------------------------------------------------------
-- DO $rev1$
-- DECLARE v_apagadas integer;
-- BEGIN
--   WITH alvo AS (
--     DELETE FROM supabase_migrations.schema_migrations
--      WHERE statements IS NULL
--        AND version IN ('20250120000001','20250802131928','20250802152533','20250802152841',
--                        '20260103000000','20260506120000','20260529120000','20260529130000',
--                        '20260601000001','20260615000001','20260615000002','20260615000003',
--                        '20260623000001','20260630000001','20260630000002','20260630000003',
--                        '20260630000004','20260701000001','20260731000001','20260810000001',
--                        '20260810000002','20260810000003','20260811000001','20260813000003',
--                        '20260513000002','20260716000001','20260716000003')
--     RETURNING 1)
--   SELECT count(*) INTO v_apagadas FROM alvo;
--   RAISE NOTICE 'Reversão do LOTE 1: % linhas apagadas do ledger.', v_apagadas;
-- END $rev1$;


-- #############################################################################
-- #                                                                           #
-- #  LOTE 2 — 6 migrações aplicadas cujo ARQUIVO não roda mais                #
-- #                                                                           #
-- #############################################################################
--
-- O QUE FAZ: carimba 6 versões cujo efeito está vivo no banco, mas cujo arquivo
--        contém erro fatal e nunca mais poderá rodar como está escrito.
--        Carimbar é justamente o que impede alguém de tentar e tomar o erro.
-- RISCO: baixo, mesmo do LOTE 1. Nenhum SQL de esquema roda aqui.
-- ATENÇÃO: estes arquivos FICAM em supabase/migrations/. Eles são história real
--        — o esquema de hoje é o efeito deles. Não arquive; só não rode.
-- REVERSÍVEL: sim, bloco abaixo.

DO $lote2$
DECLARE
  r           record;
  v_ok        boolean;
  v_faltando  text := '';
  v_inseridas integer := 0;
  v_ja_tinha  integer := 0;
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'supabase_migrations.schema_migrations não existe. Projeto errado — nada foi alterado.';
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
    -- versão          | nome no ledger                | tipo  | objeto        | detalhe (A PROVA)          -- por que o arquivo não roda mais
      ('20250802124822','initial_bootstrap_tenants'    ,'type','tenant_status',NULL),                        -- CREATE TYPE / CREATE TABLE sem guarda → "already exists"
      ('20250802131719','create_job_queue'             ,'pol' ,'job_queue'    ,'Users can access own tenant jobs'), -- CREATE TABLE public.job_queue sem IF NOT EXISTS
      ('20260113000002','fix_campaign_schema'          ,'col' ,'mass_message_campaigns','target_stages'),     -- 5x "ADD COLUMN ..." solto, sem ALTER TABLE → syntax error
      ('20260513000001','user_hierarchy_schema'        ,'col' ,'profiles'     ,'parent_id'),                  -- ALTER TYPE RENAME VALUE 'super_admin' → label não existe mais
      ('20260513000003','user_hierarchy_rls_fix'       ,'fn'  ,'is_tenant_in_my_descendants','target_tenant_id uuid'), -- is_user_in_my_tenant depois substituída pela 20260818000002
      ('20260716000002','hierarchy_v2_foundation'      ,'cons','profiles'     ,'profiles_role_modern_only')   -- re-rodar troca usage_limits inteira e reescreve handle_new_user
    ) AS t(version, name, kind, obj, det)
  LOOP
    v_ok := CASE r.kind
      WHEN 'type' THEN EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
                                WHERE n.nspname='public' AND t.typname=r.obj)
      WHEN 'col'  THEN EXISTS (SELECT 1 FROM information_schema.columns
                                WHERE table_schema='public' AND table_name=r.obj AND column_name=r.det)
      WHEN 'pol'  THEN EXISTS (SELECT 1 FROM pg_policies
                                WHERE schemaname='public' AND tablename=r.obj AND policyname=r.det)
      WHEN 'fn'   THEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                                WHERE n.nspname='public' AND p.proname=r.obj
                                  AND pg_get_function_identity_arguments(p.oid)=r.det)
      WHEN 'cons' THEN EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
                                WHERE t.relname=r.obj AND c.conname=r.det)
      ELSE NULL
    END;

    IF v_ok IS NULL THEN
      RAISE EXCEPTION 'Tipo de prova desconhecido "%" na versão %. Nada foi alterado.', r.kind, r.version;
    END IF;

    IF NOT v_ok THEN
      v_faltando := v_faltando || format(E'\n    %s (%s) — prova ausente: %s %s %s',
                                         r.version, r.name, r.kind, r.obj, coalesce(r.det,''));
      CONTINUE;
    END IF;

    IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = r.version) THEN
      v_ja_tinha := v_ja_tinha + 1;
    ELSE
      INSERT INTO supabase_migrations.schema_migrations (version, name)
      VALUES (r.version, r.name);
      v_inseridas := v_inseridas + 1;
    END IF;
  END LOOP;

  IF v_faltando <> '' THEN
    RAISE EXCEPTION E'LOTE 2 ABORTADO — nada foi gravado.\n  Provas que eu esperava encontrar e não estão no banco:%s', v_faltando;
  END IF;

  RAISE NOTICE 'LOTE 2 OK — % carimbadas agora, % já estavam no ledger (6 conferidas).', v_inseridas, v_ja_tinha;
END
$lote2$;

-- -----------------------------------------------------------------------------
-- REVERSÃO DO LOTE 2
-- -----------------------------------------------------------------------------
-- DO $rev2$
-- DECLARE v_apagadas integer;
-- BEGIN
--   WITH alvo AS (
--     DELETE FROM supabase_migrations.schema_migrations
--      WHERE statements IS NULL
--        AND version IN ('20250802124822','20250802131719','20260113000002',
--                        '20260513000001','20260513000003','20260716000002')
--     RETURNING 1)
--   SELECT count(*) INTO v_apagadas FROM alvo;
--   RAISE NOTICE 'Reversão do LOTE 2: % linhas apagadas do ledger.', v_apagadas;
-- END $rev2$;


-- #############################################################################
-- #                                                                           #
-- #  LOTE 3 — 15 migrações ARQUIVADAS: carimbo como TRAVA                     #
-- #                                                                           #
-- #############################################################################
--
-- LEIA ISTO ANTES DE RODAR.
--
-- Este lote é diferente dos outros dois. Aqui o carimbo NÃO quer dizer "isto
-- rodou". Quer dizer "isto nunca deve rodar".
--
--   • 13 são SUPERSEDIDAS: rodaram um dia, ou foram substituídas por algo
--     posterior. Rodar hoje desfaz o estado atual.
--   • 2 NUNCA rodaram e não podem rodar — estão marcadas abaixo com
--     `NUNCA_APLICADA`. Para essas eu NÃO tenho prova de aplicação, e é
--     mentira dizer que tenho. O carimbo existe só como trava.
--
-- Os 15 arquivos já saíram de supabase/migrations/ e estão em
-- supabase/migrations-archive/, que o CLI não lê. Cada um tem um cabeçalho
-- explicando o que aconteceria se rodasse. O carimbo é a segunda tranca.
--
-- O QUE FAZ: escreve 15 linhas no ledger. Nenhum SQL de esquema.
-- RISCO: o risco não está em rodar este lote, está em NÃO rodar — sem ele,
--        qualquer ferramenta que compare arquivos com ledger continua achando
--        que essas 15 estão "pendentes".
-- REVERSÍVEL: sim, bloco abaixo.

DO $lote3$
DECLARE
  r           record;
  v_inseridas integer := 0;
  v_ja_tinha  integer := 0;
  v_travadas  text := '';
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'supabase_migrations.schema_migrations não existe. Projeto errado — nada foi alterado.';
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
    -- versão          | nome no ledger                              | situação        | o que aconteceria se rodasse hoje
      ('20241220000000','create_stripe_config__SUPERSEDIDA'          ,'SUPERSEDIDA'   ,'4a policy permissiva em stripe_config; versão viva veio do ledger 20250805032512'),
      ('20250103000001','automation_flows__SUPERSEDIDA'              ,'SUPERSEDIDA'   ,'recria o motor SQL legado que a 20260623000001 apagou; CREATE TABLE sem guarda'),
      ('20250103000002','notifications__SUPERSEDIDA'                 ,'SUPERSEDIDA'   ,'esquema antigo com coluna read; hoje é is_read (20260630000002)'),
      ('20250109000001','fix_chatbots_schema__NUNCA_APLICADA'        ,'NUNCA_APLICADA','DROP COLUMN em 6 colunas de chatbots que o useChatbots.ts lê e grava'),
      ('20250120000002','update_schedule_campaign_messages__SUPERSEDIDA','SUPERSEDIDA','apaga opt-in e janela de atendimento de schedule_campaign_messages'),
      ('20250802124911','bootstrap_alternativo_morto__SUPERSEDIDA'   ,'SUPERSEDIDA'   ,'bootstrap que nunca venceu; seus 4 enums não existem no banco'),
      ('20250802125654','rls_policies_nomenclatura_antiga__SUPERSEDIDA','SUPERSEDIDA' ,'37 policies antigas; referencia scheduled_reports, tabela já apagada'),
      ('20250802125731','handle_new_user_2025__SUPERSEDIDA'          ,'SUPERSEDIDA'   ,'usuário novo deixaria de nascer com capabilities/parent_id/cargo v2'),
      ('20250802131206','handle_evolution_webhook_antigo__SUPERSEDIDA','SUPERSEDIDA'  ,'versão anterior à 20250802131928, que é a viva'),
      ('20250802132106','schedule_campaign_messages_antigo__SUPERSEDIDA','SUPERSEDIDA','schedule_campaign_messages sem guardas de conformidade'),
      ('20250802151159','process_incoming_message_antigo__SUPERSEDIDA','SUPERSEDIDA'  ,'sem isolamento por instância; viva é a 20260529130000'),
      ('20250802151308','process_incoming_message_antigo_2__SUPERSEDIDA','SUPERSEDIDA','idem + CREATE TRIGGER update_chatbots_updated_at duplicado'),
      ('20250802151358','process_incoming_message_antigo_3__SUPERSEDIDA','SUPERSEDIDA','arquivo idêntico ao 20250802151159'),
      ('20260113000001','security_hardening_rls__NUNCA_APLICADA'     ,'NUNCA_APLICADA','derruba as policies de profiles e tenants em uso — perda de acesso geral'),
      ('20260703120000','fix_unread_count_inbound__SUPERSEDIDA'      ,'SUPERSEDIDA'   ,'somaria junto com update_conversation_on_message: não-lido em dobro')
    ) AS t(version, name, situacao, efeito)
  LOOP
    IF r.situacao = 'NUNCA_APLICADA' THEN
      v_travadas := v_travadas || format(E'\n    %s — %s', r.version, r.efeito);
    END IF;

    IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = r.version) THEN
      v_ja_tinha := v_ja_tinha + 1;
    ELSE
      INSERT INTO supabase_migrations.schema_migrations (version, name)
      VALUES (r.version, r.name);
      v_inseridas := v_inseridas + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'LOTE 3 OK — % carimbadas agora, % já estavam no ledger (15 no total).', v_inseridas, v_ja_tinha;
  RAISE NOTICE 'Destas, 2 NUNCA rodaram e o carimbo é só trava:%', v_travadas;
END
$lote3$;

-- -----------------------------------------------------------------------------
-- REVERSÃO DO LOTE 3
-- ATENÇÃO: reverter este lote REMOVE A TRAVA. Só faça isso se você também for
-- devolver os 15 arquivos de supabase/migrations-archive/ para o lugar — e aí
-- você volta a ter duas migrações capazes de derrubar o acesso de todo mundo
-- ao alcance de qualquer ferramenta.
-- -----------------------------------------------------------------------------
-- DO $rev3$
-- DECLARE v_apagadas integer;
-- BEGIN
--   WITH alvo AS (
--     DELETE FROM supabase_migrations.schema_migrations
--      WHERE statements IS NULL
--        AND version IN ('20241220000000','20250103000001','20250103000002','20250109000001',
--                        '20250120000002','20250802124911','20250802125654','20250802125731',
--                        '20250802131206','20250802132106','20250802151159','20250802151308',
--                        '20250802151358','20260113000001','20260703120000')
--     RETURNING 1)
--   SELECT count(*) INTO v_apagadas FROM alvo;
--   RAISE NOTICE 'Reversão do LOTE 3: % linhas apagadas. A TRAVA FOI REMOVIDA.', v_apagadas;
-- END $rev3$;


-- =============================================================================
-- CONFERÊNCIA DEPOIS (rode como leitura, depois dos três lotes)
-- =============================================================================
--   SELECT count(*) FROM supabase_migrations.schema_migrations;   -- esperado: 150
--
--   -- as 15 travadas, e por quê:
--   SELECT version, name FROM supabase_migrations.schema_migrations
--    WHERE name LIKE '%\_\_SUPERSEDIDA' ESCAPE '\'
--       OR name LIKE '%\_\_NUNCA\_APLICADA' ESCAPE '\'
--    ORDER BY version;                                            -- esperado: 15
--
--   -- nada de esquema mudou (compare com o que você anotou ANTES):
--   SELECT count(*) FROM pg_policies WHERE schemaname='public';   -- esperado: 175
--   SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public';                                    -- esperado: 110
--   -- (175 e 110 são os valores medidos em 2026-08-24, antes dos lotes. Este
--   --  script não cria nem apaga policy ou função nenhuma, então têm que ficar
--   --  idênticos. Se mudarem, algo além deste script rodou.)
-- =============================================================================
