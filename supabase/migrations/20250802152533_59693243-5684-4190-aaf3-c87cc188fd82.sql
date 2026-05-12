-- =====================================================================
-- Migration originalmente inseria dados de demonstração (Demo Company,
-- contatos modelo João/Maria/Pedro/Ana/Carlos, mensagens, chatbots, etc.)
-- Esses "modelos" foram descontinuados em 2026-05-12. Mantemos o arquivo
-- no histórico para não quebrar o checksum de quem já aplicou, e usamos
-- ele como ponto de limpeza idempotente (caso o banco volte do zero ou
-- alguém tenha reintroduzido os seeds manualmente).
-- =====================================================================

-- Limpa eventuais dependências antes de remover os contatos seed.
DELETE FROM public.contact_tags
WHERE contact_id IN (
  '550e8400-e29b-41d4-a716-446655440040'::uuid,
  '550e8400-e29b-41d4-a716-446655440041'::uuid,
  '550e8400-e29b-41d4-a716-446655440042'::uuid,
  '550e8400-e29b-41d4-a716-446655440043'::uuid,
  '550e8400-e29b-41d4-a716-446655440044'::uuid
);

DELETE FROM public.messages
WHERE id IN (
  '550e8400-e29b-41d4-a716-446655440050'::uuid,
  '550e8400-e29b-41d4-a716-446655440051'::uuid,
  '550e8400-e29b-41d4-a716-446655440052'::uuid,
  '550e8400-e29b-41d4-a716-446655440053'::uuid,
  '550e8400-e29b-41d4-a716-446655440054'::uuid,
  '550e8400-e29b-41d4-a716-446655440055'::uuid
);

DELETE FROM public.conversations
WHERE contact_id IN (
  '550e8400-e29b-41d4-a716-446655440040'::uuid,
  '550e8400-e29b-41d4-a716-446655440041'::uuid,
  '550e8400-e29b-41d4-a716-446655440042'::uuid,
  '550e8400-e29b-41d4-a716-446655440043'::uuid,
  '550e8400-e29b-41d4-a716-446655440044'::uuid
);

DELETE FROM public.contacts
WHERE id IN (
  '550e8400-e29b-41d4-a716-446655440040'::uuid,
  '550e8400-e29b-41d4-a716-446655440041'::uuid,
  '550e8400-e29b-41d4-a716-446655440042'::uuid,
  '550e8400-e29b-41d4-a716-446655440043'::uuid,
  '550e8400-e29b-41d4-a716-446655440044'::uuid
);

DELETE FROM public.mass_message_campaigns
WHERE id IN (
  '550e8400-e29b-41d4-a716-446655440070'::uuid,
  '550e8400-e29b-41d4-a716-446655440071'::uuid
);

DELETE FROM public.chatbots
WHERE id IN (
  '550e8400-e29b-41d4-a716-446655440060'::uuid,
  '550e8400-e29b-41d4-a716-446655440061'::uuid,
  '550e8400-e29b-41d4-a716-446655440062'::uuid
);
