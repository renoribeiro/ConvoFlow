-- =============================================================================
-- ConvoFlow — exportar a "Loja - Yuri Saldanha" ANTES de removê-la
-- =============================================================================
-- SOMENTE LEITURA. Não altera nada. Rode no SQL Editor e use o botão
-- "Download CSV" acima da grade de resultados para salvar como planilha.
--
-- Par deste arquivo: docs/remover_lojas_orfas.sql (a remoção em si).
-- Ordem: exporte primeiro, confira o CSV, só então rode a remoção.
--
-- -----------------------------------------------------------------------------
-- O QUE VOCÊ VAI RECEBER (conferido em 2026-08-20)
-- -----------------------------------------------------------------------------
-- 182 linhas. Destas, 178 têm o nome IGUAL ao telefone e absolutamente mais
-- nada preenchido: são o despejo da agenda de uma instância do WhatsApp que já
-- não existe, importada em 2026-05-22 num intervalo de segundos.
--
-- Colunas que voltam VAZIAS nas 182 linhas: E-mail, Origem do lead, Etapa do
-- funil, Observações, Primeira mensagem, Campos personalizados, Detalhes de
-- origem, Aceita disparo, Recusou disparo, Bloqueado.
--
-- Só carregam informação de verdade:
--   Telefone   — 182 números distintos
--   Nome       — diferente do telefone em 4 linhas
--   Etiquetas  — 1 linha ("Em negociação")
--   Últ. inter.— 4 linhas
--   Foto (URL) — 60 linhas (URL do WhatsApp; expira, não é arquivo salvo)
--
-- A exportação é barata e vale como rede de segurança, mas não se iluda com o
-- volume: o conteúdo real é uma lista de telefones.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- CONSULTA 1 — os 182 contatos (é esta que vira a planilha)
-- -----------------------------------------------------------------------------
SELECT
  c.phone                                     AS "Telefone",
  c.name                                      AS "Nome",
  c.email                                     AS "E-mail",
  ls.name                                     AS "Origem do lead",
  fs.name                                     AS "Etapa do funil",
  c.stage_entered_at                          AS "Entrou na etapa em",
  (
    SELECT string_agg(t.name, ' | ' ORDER BY t.name)
      FROM public.contact_tags ct
      JOIN public.tags t ON t.id = ct.tag_id
     WHERE ct.contact_id = c.id
  )                                           AS "Etiquetas",
  c.notes                                     AS "Observacoes",
  c.first_message                             AS "Primeira mensagem",
  c.last_interaction_at                       AS "Ultima interacao",
  c.is_blocked                                AS "Bloqueado",
  c.opt_in_mass_message                       AS "Aceita disparo",
  c.opt_in_source                             AS "Origem do aceite",
  c.opt_in_at                                 AS "Aceitou em",
  c.opt_out_mass_message                      AS "Recusou disparo",
  c.opt_out_source                            AS "Origem da recusa",
  c.opt_out_at                                AS "Recusou em",
  c.custom_fields::text                       AS "Campos personalizados",
  c.source_details::text                      AS "Detalhes de origem",
  c.avatar_url                                AS "Foto (URL)",
  c.created_at                                AS "Criado em",
  c.updated_at                                AS "Atualizado em",
  c.id                                        AS "ID interno"
FROM public.contacts c
LEFT JOIN public.lead_sources  ls ON ls.id = c.lead_source_id
LEFT JOIN public.funnel_stages fs ON fs.id = c.current_stage_id
WHERE c.tenant_id = '6aee6f9e-94e5-4962-bf5b-c014c1736b59'
ORDER BY c.created_at;

-- -----------------------------------------------------------------------------
-- CONSULTA 2 (opcional) — todo o resto das duas Lojas, num dump só
-- -----------------------------------------------------------------------------
-- Na minha leitura NADA aqui vale a pena guardar: são seeds do sistema e um bot
-- de teste. Está aqui porque exportar custa um clique e não dá para desfazer a
-- remoção. Rode SEPARADO da consulta 1 (o SQL Editor mostra o resultado do
-- último comando).
--
-- Descomente o bloco inteiro para usar:
--
-- SELECT * FROM (
--   SELECT 'etiqueta'         AS tipo, t.name  AS item, t.color       AS detalhe_1, NULL::text AS detalhe_2, tn.name AS loja, t.created_at
--     FROM public.tags t JOIN public.tenants tn ON tn.id = t.tenant_id
--    WHERE t.tenant_id IN ('6aee6f9e-94e5-4962-bf5b-c014c1736b59','f52d8ba4-0714-4ce7-ad6d-ac486efe22fe')
--   UNION ALL
--   SELECT 'etapa do funil', f.name, f."order"::text, f.is_final::text, tn.name, f.created_at
--     FROM public.funnel_stages f JOIN public.tenants tn ON tn.id = f.tenant_id
--    WHERE f.tenant_id IN ('6aee6f9e-94e5-4962-bf5b-c014c1736b59','f52d8ba4-0714-4ce7-ad6d-ac486efe22fe')
--   UNION ALL
--   SELECT 'origem de lead', l.name, l.type, l.is_active::text, tn.name, l.created_at
--     FROM public.lead_sources l JOIN public.tenants tn ON tn.id = l.tenant_id
--    WHERE l.tenant_id IN ('6aee6f9e-94e5-4962-bf5b-c014c1736b59','f52d8ba4-0714-4ce7-ad6d-ac486efe22fe')
--   UNION ALL
--   SELECT 'modelo de relatorio', r.name::text, r.category::text, r.type::text, tn.name, r.created_at
--     FROM public.report_templates r JOIN public.tenants tn ON tn.id = r.tenant_id
--    WHERE r.tenant_id IN ('6aee6f9e-94e5-4962-bf5b-c014c1736b59','f52d8ba4-0714-4ce7-ad6d-ac486efe22fe')
--   UNION ALL
--   SELECT 'chatbot', b.name, b.is_active::text, b.builder_version::text, tn.name, b.created_at
--     FROM public.chatbots b JOIN public.tenants tn ON tn.id = b.tenant_id
--    WHERE b.tenant_id IN ('6aee6f9e-94e5-4962-bf5b-c014c1736b59','f52d8ba4-0714-4ce7-ad6d-ac486efe22fe')
--   UNION ALL
--   SELECT 'no do chatbot', n.node_type::text, n.data::text, NULL, tn.name, n.created_at
--     FROM public.chatbot_nodes n JOIN public.tenants tn ON tn.id = n.tenant_id
--    WHERE n.tenant_id IN ('6aee6f9e-94e5-4962-bf5b-c014c1736b59','f52d8ba4-0714-4ce7-ad6d-ac486efe22fe')
--   UNION ALL
--   SELECT 'gatilho do chatbot', g.trigger_type::text, g.trigger_value::text, g.is_active::text, tn.name, g.created_at
--     FROM public.chatbot_triggers g JOIN public.tenants tn ON tn.id = g.tenant_id
--    WHERE g.tenant_id IN ('6aee6f9e-94e5-4962-bf5b-c014c1736b59','f52d8ba4-0714-4ce7-ad6d-ac486efe22fe')
--   UNION ALL
--   SELECT 'historico de acesso', e.action, e.source, e.note, tn.name, e.created_at
--     FROM public.tenant_access_events e JOIN public.tenants tn ON tn.id = e.tenant_id
--    WHERE e.tenant_id IN ('6aee6f9e-94e5-4962-bf5b-c014c1736b59','f52d8ba4-0714-4ce7-ad6d-ac486efe22fe')
-- ) x
-- ORDER BY loja, tipo, created_at;
-- =============================================================================
