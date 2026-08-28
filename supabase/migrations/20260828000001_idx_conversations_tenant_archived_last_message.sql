-- Indice composto para a consulta da lista de Conversas.
--
-- A lista (useConversations) filtra e ordena sempre pela mesma combinacao:
--
--   WHERE tenant_id = $1 AND is_archived = $2
--   ORDER BY last_message_at DESC
--
-- Hoje existem tres indices em conversations que cobrem PEDACOS disso
-- (idx_conversations_tenant_id, idx_conversations_last_message_at,
-- conversations_tenant_id_contact_id_key), mas nenhum cobre o recorte inteiro.
-- Com 131 linhas o planejador escolhe seq scan e esta CERTO em escolher — o
-- indice so passa a valer quando a tabela crescer.
--
-- Medido em 2026-08-28: a lista consome 375 blocos para devolver 20 linhas de
-- uma tabela de 131 linhas. Esse custo e RLS (ver o lint auth_rls_initplan),
-- nao falta de indice — este indice NAO conserta aquilo. Ele evita o problema
-- seguinte: quando uma Loja tiver dezenas de milhares de conversas, sem ele a
-- ordenacao por last_message_at vira sort de tabela inteira a cada 30 segundos
-- de polling, por aba aberta.
--
-- Por isso: preventivo, barato, reversivel. Nao espere ver diferenca agora.

CREATE INDEX IF NOT EXISTS idx_conversations_tenant_archived_last_message
  ON public.conversations (tenant_id, is_archived, last_message_at DESC);
