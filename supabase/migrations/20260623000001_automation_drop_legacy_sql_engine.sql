-- Fase 0 — Remoção do motor de automação legado em PL/pgSQL (código morto).
--
-- Estas funções foram a primeira tentativa de motor de automação dentro do
-- Postgres. Elas foram inteiramente SUPERSEDIDAS pela Edge Function
-- `automation-processor` (TypeScript), que é hoje o único caminho de execução.
--
-- Além de não serem mais chamadas por nenhum código da aplicação (confirmado por
-- varredura: só apareciam nestas migrations e em dumps de schema), várias delas
-- referenciam objetos que NÃO EXISTEM mais no schema e, portanto, falhariam em
-- runtime se acionadas:
--   * schedule_automation_message  -> INSERT em `scheduled_messages` (tabela removida)
--   * schedule_automation_followup -> INSERT em `followups` (tabela nunca existiu;
--                                     follow-ups vivem em `individual_followups`)
--   * add_contact_tag              -> lê/escreve `contacts.tags` (coluna inexistente;
--                                     tags vivem em `tags` + junction `contact_tags`)
--
-- A lógica equivalente — e correta — já está implementada no
-- `automation-processor` (send_message via job_queue, add_tag via contact_tags,
-- schedule_followup via individual_followups, change_funnel_stage via
-- contacts.current_stage_id).
--
-- Observação: NÃO mexemos nas tabelas (automation_flows/executions/step_logs),
-- nos índices, no trigger de updated_at, nem nas políticas RLS — tudo isso
-- continua válido e em uso.

-- process_automation_trigger tem dois overloads (3 e 4 argumentos).
DROP FUNCTION IF EXISTS public.process_automation_trigger(character varying, jsonb, uuid);
DROP FUNCTION IF EXISTS public.process_automation_trigger(character varying, jsonb, uuid, uuid);

DROP FUNCTION IF EXISTS public.execute_automation_step(uuid);
DROP FUNCTION IF EXISTS public.execute_step_by_type(text, jsonb, uuid, jsonb);
DROP FUNCTION IF EXISTS public.should_execute_trigger(jsonb, jsonb);
DROP FUNCTION IF EXISTS public.schedule_automation_message(jsonb, uuid);
DROP FUNCTION IF EXISTS public.change_contact_funnel_stage(jsonb, uuid);
DROP FUNCTION IF EXISTS public.schedule_automation_followup(jsonb, uuid);
DROP FUNCTION IF EXISTS public.add_contact_tag(jsonb, uuid);
