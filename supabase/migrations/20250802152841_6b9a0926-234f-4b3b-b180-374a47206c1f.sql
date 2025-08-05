-- Insert default tenant
INSERT INTO public.tenants (id, name, slug, status, plan_type, max_whatsapp_instances, max_users) 
VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  'Demo Company',
  'demo-company',
  'active',
  'premium',
  5,
  10
) ON CONFLICT (id) DO NOTHING;

-- Insert funnel stages
INSERT INTO public.funnel_stages (id, tenant_id, name, description, "order", color, is_final) VALUES
('550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440000', 'Lead', 'Primeiro contato', 1, '#3B82F6', false),
('550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440000', 'Interesse', 'Demonstrou interesse', 2, '#F59E0B', false),
('550e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440000', 'Proposta', 'Proposta enviada', 3, '#8B5CF6', false),
('550e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440000', 'Cliente', 'Conversão realizada', 4, '#10B981', true)
ON CONFLICT (id) DO NOTHING;

-- Insert tags
INSERT INTO public.tags (id, tenant_id, name, color, description) VALUES
('550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440000', 'VIP', '#DC2626', 'Cliente VIP'),
('550e8400-e29b-41d4-a716-446655440011', '550e8400-e29b-41d4-a716-446655440000', 'WhatsApp', '#10B981', 'Contato pelo WhatsApp'),
('550e8400-e29b-41d4-a716-446655440012', '550e8400-e29b-41d4-a716-446655440000', 'Urgente', '#F59E0B', 'Necessita atenção urgente'),
('550e8400-e29b-41d4-a716-446655440013', '550e8400-e29b-41d4-a716-446655440000', 'Follow-up', '#3B82F6', 'Necessita acompanhamento')
ON CONFLICT (id) DO NOTHING;

-- Insert WhatsApp instance
INSERT INTO public.whatsapp_instances (id, tenant_id, name, instance_key, status, evolution_api_url, evolution_api_key) VALUES
('550e8400-e29b-41d4-a716-446655440020', '550e8400-e29b-41d4-a716-446655440000', 'Principal', 'demo_instance', 'open', 'https://evolution-api.demo.com', 'demo_api_key')
ON CONFLICT (id) DO NOTHING;

-- Insert lead sources
INSERT INTO public.lead_sources (id, tenant_id, name, type, is_active, parameters) VALUES
('550e8400-e29b-41d4-a716-446655440030', '550e8400-e29b-41d4-a716-446655440000', 'Website', 'website', true, '{"url": "https://demo.com"}'),
('550e8400-e29b-41d4-a716-446655440031', '550e8400-e29b-41d4-a716-446655440000', 'Facebook Ads', 'facebook', true, '{"campaign_id": "demo123"}'),
('550e8400-e29b-41d4-a716-446655440032', '550e8400-e29b-41d4-a716-446655440000', 'Google Ads', 'google', true, '{"campaign_id": "google123"}'),
('550e8400-e29b-41d4-a716-446655440033', '550e8400-e29b-41d4-a716-446655440000', 'Indicação', 'referral', true, '{}')
ON CONFLICT (id) DO NOTHING;

-- Insert contacts
INSERT INTO public.contacts (id, tenant_id, phone, name, email, current_stage_id, lead_source_id, whatsapp_instance_id, first_message, last_interaction_at, notes) VALUES
('550e8400-e29b-41d4-a716-446655440040', '550e8400-e29b-41d4-a716-446655440000', '+5511999999001', 'João Silva', 'joao@email.com', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440030', '550e8400-e29b-41d4-a716-446655440020', 'Olá, gostaria de saber mais sobre os produtos', now() - interval '2 days', 'Cliente interessado em soluções completas'),
('550e8400-e29b-41d4-a716-446655440041', '550e8400-e29b-41d4-a716-446655440000', '+5511999999002', 'Maria Santos', 'maria@email.com', '550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440031', '550e8400-e29b-41d4-a716-446655440020', 'Vi o anúncio no Facebook', now() - interval '1 day', 'Muito interessada, pediu orçamento'),
('550e8400-e29b-41d4-a716-446655440042', '550e8400-e29b-41d4-a716-446655440000', '+5511999999003', 'Pedro Costa', 'pedro@email.com', '550e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440032', '550e8400-e29b-41d4-a716-446655440020', 'Preciso de uma solução urgente', now() - interval '4 hours', 'Cliente corporativo, grande potencial'),
('550e8400-e29b-41d4-a716-446655440043', '550e8400-e29b-41d4-a716-446655440000', '+5511999999004', 'Ana Oliveira', 'ana@email.com', '550e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440033', '550e8400-e29b-41d4-a716-446655440020', 'Fui indicada por um amigo', now() - interval '1 hour', 'Cliente convertido, muito satisfeita'),
('550e8400-e29b-41d4-a716-446655440044', '550e8400-e29b-41d4-a716-446655440000', '+5511999999005', 'Carlos Mendes', 'carlos@email.com', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440030', '550e8400-e29b-41d4-a716-446655440020', 'Olá', now() - interval '30 minutes', 'Primeiro contato')
ON CONFLICT (id) DO NOTHING;

-- Insert contact tags
INSERT INTO public.contact_tags (contact_id, tag_id) VALUES
('550e8400-e29b-41d4-a716-446655440040', '550e8400-e29b-41d4-a716-446655440011'),
('550e8400-e29b-41d4-a716-446655440041', '550e8400-e29b-41d4-a716-446655440011'),
('550e8400-e29b-41d4-a716-446655440041', '550e8400-e29b-41d4-a716-446655440013'),
('550e8400-e29b-41d4-a716-446655440042', '550e8400-e29b-41d4-a716-446655440010'),
('550e8400-e29b-41d4-a716-446655440042', '550e8400-e29b-41d4-a716-446655440012'),
('550e8400-e29b-41d4-a716-446655440043', '550e8400-e29b-41d4-a716-446655440010'),
('550e8400-e29b-41d4-a716-446655440044', '550e8400-e29b-41d4-a716-446655440011')
ON CONFLICT DO NOTHING;

-- Insert messages
INSERT INTO public.messages (id, tenant_id, contact_id, whatsapp_instance_id, direction, message_type, content, status, is_from_bot) VALUES
('550e8400-e29b-41d4-a716-446655440050', '550e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440040', '550e8400-e29b-41d4-a716-446655440020', 'inbound', 'text', 'Olá, gostaria de saber mais sobre os produtos', 'received', false),
('550e8400-e29b-41d4-a716-446655440051', '550e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440040', '550e8400-e29b-41d4-a716-446655440020', 'outbound', 'text', 'Olá João! Obrigado pelo interesse. Temos várias soluções que podem te ajudar.', 'sent', true),
('550e8400-e29b-41d4-a716-446655440052', '550e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440041', '550e8400-e29b-41d4-a716-446655440020', 'inbound', 'text', 'Vi o anúncio no Facebook', 'received', false),
('550e8400-e29b-41d4-a716-446655440053', '550e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440041', '550e8400-e29b-41d4-a716-446655440020', 'outbound', 'text', 'Oi Maria! Que bom que você nos encontrou. Posso te ajudar com mais informações?', 'sent', true),
('550e8400-e29b-41d4-a716-446655440054', '550e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440042', '550e8400-e29b-41d4-a716-446655440020', 'inbound', 'text', 'Preciso de uma solução urgente', 'received', false),
('550e8400-e29b-41d4-a716-446655440055', '550e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440042', '550e8400-e29b-41d4-a716-446655440020', 'outbound', 'text', 'Olá Pedro! Entendo a urgência. Vamos resolver isso rapidamente.', 'sent', true)
ON CONFLICT (id) DO NOTHING;

-- Insert chatbots
INSERT INTO public.chatbots (id, tenant_id, name, description, trigger_type, trigger_phrases, response_message, whatsapp_instance_id, is_active, priority) VALUES
('550e8400-e29b-41d4-a716-446655440060', '550e8400-e29b-41d4-a716-446655440000', 'Saudação Inicial', 'Bot de boas-vindas para novos contatos', 'keyword', ARRAY['olá', 'oi', 'hello', 'hey'], 'Olá {name}! 👋 Seja bem-vindo! Sou o assistente virtual e estou aqui para te ajudar. Como posso te auxiliar hoje?', '550e8400-e29b-41d4-a716-446655440020', true, 10),
('550e8400-e29b-41d4-a716-446655440061', '550e8400-e29b-41d4-a716-446655440000', 'Informações Comerciais', 'Respostas sobre produtos e serviços', 'keyword', ARRAY['preço', 'valor', 'quanto custa', 'produto', 'serviço'], 'Obrigado pelo interesse em nossos produtos! 💼 Temos várias opções que podem atender suas necessidades. Gostaria de falar com um consultor especializado?', '550e8400-e29b-41d4-a716-446655440020', true, 8),
('550e8400-e29b-41d4-a716-446655440062', '550e8400-e29b-41d4-a716-446655440000', 'Horário de Funcionamento', 'Informações sobre horários', 'keyword', ARRAY['horário', 'funcionamento', 'aberto', 'fechado'], 'Nosso horário de atendimento é:\n🕐 Segunda a Sexta: 8h às 18h\n🕐 Sábado: 8h às 12h\n❌ Domingo: Fechado\n\nFora desse horário, deixe sua mensagem que retornaremos assim que possível!', '550e8400-e29b-41d4-a716-446655440020', true, 5)
ON CONFLICT (id) DO NOTHING;

-- Insert campaigns with correct UUID array casting
INSERT INTO public.mass_message_campaigns (id, tenant_id, name, description, message_template, whatsapp_instance_id, status, target_tags, target_stages, delay_between_messages, total_recipients, sent_count) VALUES
('550e8400-e29b-41d4-a716-446655440070', '550e8400-e29b-41d4-a716-446655440000', 'Campanha de Boas Vindas', 'Mensagem de boas-vindas para novos leads', 'Olá {name}! 🎉 Seja bem-vindo à nossa empresa. Estamos muito felizes em ter você conosco!', '550e8400-e29b-41d4-a716-446655440020', 'completed', ARRAY['550e8400-e29b-41d4-a716-446655440011'::uuid], ARRAY['550e8400-e29b-41d4-a716-446655440001'::uuid], 30, 5, 5),
('550e8400-e29b-41d4-a716-446655440071', '550e8400-e29b-41d4-a716-446655440000', 'Follow-up Interesse', 'Acompanhamento para leads interessados', 'Oi {name}! Vi que você demonstrou interesse em nossos produtos. Que tal agendarmos uma conversa rápida para te mostrar como podemos te ajudar? 📞', '550e8400-e29b-41d4-a716-446655440020', 'draft', ARRAY['550e8400-e29b-41d4-a716-446655440013'::uuid], ARRAY['550e8400-e29b-41d4-a716-446655440002'::uuid], 60, 0, 0)
ON CONFLICT (id) DO NOTHING;