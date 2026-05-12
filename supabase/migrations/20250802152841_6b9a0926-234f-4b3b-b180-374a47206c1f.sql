-- =====================================================================
-- Migration originalmente reinseria os mesmos dados de demonstração da
-- 20250802152533_59693243 (Demo Company, contatos modelo, mensagens,
-- chatbots, campanhas). Foi descontinuada em 2026-05-12 junto com a
-- remoção dos "Modelos" do sistema.
--
-- Arquivo preservado no histórico para não quebrar o checksum de quem
-- já aplicou as migrações, e reaproveitado como ponto extra de limpeza
-- idempotente: além dos seeds da migração anterior, também remove o
-- tenant 'Demo Company' e seus auxiliares (tags / stages / lead_sources
-- / whatsapp_instance) quando ele não tem mais profiles ativos.
-- =====================================================================

-- 1) Garantir limpeza dos contatos seed (caso a 152533 não tenha rodado).
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

-- 2) Limpeza adicional do tenant Demo Company.
-- Só remove tudo (incluindo o próprio tenant) se NÃO houver perfis
-- vinculados a ele. Em ambientes onde algum usuário ainda esteja
-- vinculado, esta migração é no-op para esse tenant — a remoção
-- definitiva precisa ser conduzida manualmente após realocar/desativar
-- esses perfis.
DO $$
DECLARE
  demo_tenant uuid := '550e8400-e29b-41d4-a716-446655440000'::uuid;
  profile_count integer;
BEGIN
  SELECT COUNT(*) INTO profile_count
  FROM public.profiles
  WHERE tenant_id = demo_tenant;

  IF profile_count = 0 THEN
    DELETE FROM public.contact_tags
      WHERE contact_id IN (SELECT id FROM public.contacts WHERE tenant_id = demo_tenant);
    DELETE FROM public.messages WHERE tenant_id = demo_tenant;
    DELETE FROM public.conversations WHERE tenant_id = demo_tenant;
    DELETE FROM public.contacts WHERE tenant_id = demo_tenant;
    DELETE FROM public.mass_message_campaigns WHERE tenant_id = demo_tenant;
    DELETE FROM public.chatbots WHERE tenant_id = demo_tenant;
    DELETE FROM public.whatsapp_instances WHERE tenant_id = demo_tenant;
    DELETE FROM public.lead_sources WHERE tenant_id = demo_tenant;
    DELETE FROM public.tags WHERE tenant_id = demo_tenant;
    DELETE FROM public.funnel_stages WHERE tenant_id = demo_tenant;
    DELETE FROM public.tenants WHERE id = demo_tenant;
  END IF;
END;
$$;
