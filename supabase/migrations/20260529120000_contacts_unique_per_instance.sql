-- Migration: contatos passam a ser únicos por instância (em vez de por conta)
--
-- Contexto: o produto agora trata "mesma pessoa em duas instâncias" como dois
-- contatos separados (decisão de UX). Cada cliente vê uma lista por instância.
-- A regra antiga UNIQUE(tenant_id, phone) impedia isso — o webhook quebrava
-- com violação de unique ao inserir o mesmo número numa segunda instância.
--
-- Estratégia:
--   1. Derruba a UNIQUE antiga.
--   2. Cria índice único parcial (tenant_id, phone, whatsapp_instance_id)
--      QUANDO whatsapp_instance_id IS NOT NULL — cobre contatos vindos de
--      instâncias WhatsApp.
--   3. Cria índice único parcial (tenant_id, phone) QUANDO
--      whatsapp_instance_id IS NULL — cobre contatos cadastrados manualmente
--      no painel, sem instância vinculada.
--
-- Por que dois índices parciais em vez de UNIQUE(tenant_id, phone, instance_id)?
-- Em Postgres, NULL é sempre considerado "diferente" em uniques compostas, o
-- que permitiria duplicatas em (tenant_id, phone) quando instance_id for NULL.
-- Os parciais resolvem isso explicitamente.

BEGIN;

-- 1) Derruba a UNIQUE antiga (nome auto-gerado pelo Postgres).
--    Tentamos os 2 nomes possíveis pra ser idempotente em ambientes diferentes.
ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS contacts_tenant_id_phone_key;

ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS contacts_phone_tenant_id_key;

-- 2) Unicidade por (conta, telefone, instância) — vale pra contatos
--    vindos de qualquer instância de WhatsApp.
CREATE UNIQUE INDEX IF NOT EXISTS contacts_tenant_phone_instance_uniq
  ON public.contacts (tenant_id, phone, whatsapp_instance_id)
  WHERE whatsapp_instance_id IS NOT NULL;

-- 3) Unicidade por (conta, telefone) — vale só pra contatos cadastrados
--    manualmente, sem instância (import CSV, cadastro pelo painel, etc).
CREATE UNIQUE INDEX IF NOT EXISTS contacts_tenant_phone_no_instance_uniq
  ON public.contacts (tenant_id, phone)
  WHERE whatsapp_instance_id IS NULL;

COMMIT;

-- =====================================================================
-- ATENÇÃO — débito conhecido pra revisão futura (NÃO BLOQUEIA ESTE PR):
--
-- A função public.process_incoming_message (criada na migration
-- 20250802151308_*.sql) faz lookup de contato por (phone, tenant_id) sem
-- considerar whatsapp_instance_id. Após esta migration, se existirem dois
-- contatos com mesmo telefone em instâncias diferentes do mesmo tenant, o
-- SELECT INTO dentro dessa função pode resolver pro contato errado.
--
-- A função é chamada via RPC dos webhooks (evolution-webhook, waha-webhook,
-- meta-webhook) APENAS pra disparar chatbots — não persiste mensagens no
-- fluxo principal. O risco é o chatbot rodar contra o contato errado em
-- caso de número duplicado em 2 instâncias do mesmo tenant.
--
-- Próximo passo planejado: atualizar process_incoming_message pra receber e
-- usar whatsapp_instance_id no lookup, restaurando consistência.
-- =====================================================================
