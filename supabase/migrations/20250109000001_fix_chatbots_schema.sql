-- Fix chatbots schema to match TypeScript types and add conversations table
-- This migration addresses critical issues identified in the analysis

-- First, create conversations table to organize messages by conversation
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    whatsapp_instance_id UUID NOT NULL REFERENCES public.whatsapp_instances(id),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'closed')),
    last_message_at TIMESTAMPTZ,
    unread_count INTEGER DEFAULT 0,
    assigned_to UUID REFERENCES public.profiles(id),
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, contact_id, whatsapp_instance_id)
);

-- Update chatbots table to match TypeScript interface
ALTER TABLE public.chatbots 
    DROP COLUMN IF EXISTS trigger_phrases,
    DROP COLUMN IF EXISTS response_message,
    DROP COLUMN IF EXISTS response_type,
    DROP COLUMN IF EXISTS media_url,
    DROP COLUMN IF EXISTS variables,
    DROP COLUMN IF EXISTS conditions;

-- Add new columns to match TypeScript interface
ALTER TABLE public.chatbots 
    ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'simple' CHECK (type IN ('simple', 'flow')),
    ADD COLUMN IF NOT EXISTS triggers JSONB DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS responses JSONB DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS flow JSONB DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS analytics JSONB DEFAULT '{
        "totalInteractions": 0,
        "successRate": 0,
        "averageResponseTime": 0,
        "topTriggers": [],
        "interactionsByDay": []
    }';

-- Rename columns to match TypeScript interface
ALTER TABLE public.chatbots 
    RENAME COLUMN is_active TO "isActive";

-- Add conversation_id to messages table
ALTER TABLE public.messages 
    ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.conversations(id);

-- Create chatbot_interactions table for analytics
CREATE TABLE IF NOT EXISTS public.chatbot_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    chatbot_id UUID NOT NULL REFERENCES public.chatbots(id) ON DELETE CASCADE,
    contact_phone TEXT NOT NULL,
    message TEXT NOT NULL,
    response TEXT NOT NULL,
    was_successful BOOLEAN DEFAULT true,
    response_time_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversations_tenant_id ON public.conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_contact_id ON public.conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON public.conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON public.conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned_to ON public.conversations(assigned_to);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_interactions_tenant_id ON public.chatbot_interactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_interactions_chatbot_id ON public.chatbot_interactions(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_interactions_created_at ON public.chatbot_interactions(created_at DESC);

-- Add triggers for updated_at
CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON public.conversations
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_chatbots_updated_at
    BEFORE UPDATE ON public.chatbots
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to automatically create/update conversations when messages are inserted
CREATE OR REPLACE FUNCTION public.handle_message_conversation()
RETURNS TRIGGER AS $$
DECLARE
    v_conversation_id UUID;
BEGIN
    -- Find or create conversation
    SELECT id INTO v_conversation_id
    FROM public.conversations
    WHERE tenant_id = NEW.tenant_id 
        AND contact_id = NEW.contact_id 
        AND whatsapp_instance_id = NEW.whatsapp_instance_id;
    
    IF v_conversation_id IS NULL THEN
        INSERT INTO public.conversations (
            tenant_id, 
            contact_id, 
            whatsapp_instance_id, 
            last_message_at,
            unread_count
        ) VALUES (
            NEW.tenant_id, 
            NEW.contact_id, 
            NEW.whatsapp_instance_id, 
            NEW.created_at,
            CASE WHEN NEW.direction = 'inbound' THEN 1 ELSE 0 END
        ) RETURNING id INTO v_conversation_id;
    ELSE
        -- Update existing conversation
        UPDATE public.conversations 
        SET 
            last_message_at = NEW.created_at,
            unread_count = CASE 
                WHEN NEW.direction = 'inbound' THEN unread_count + 1 
                ELSE unread_count 
            END,
            updated_at = now()
        WHERE id = v_conversation_id;
    END IF;
    
    -- Set conversation_id in the message
    NEW.conversation_id = v_conversation_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic conversation handling
DROP TRIGGER IF EXISTS trigger_handle_message_conversation ON public.messages;
CREATE TRIGGER trigger_handle_message_conversation
    BEFORE INSERT ON public.messages
    FOR EACH ROW EXECUTE FUNCTION public.handle_message_conversation();

-- RLS Policies for new tables
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_interactions ENABLE ROW LEVEL SECURITY;

-- Conversations policies
CREATE POLICY "Users can view their tenant conversations" ON public.conversations
    FOR SELECT USING (tenant_id = public.get_current_user_tenant_id());

CREATE POLICY "Users can manage their tenant conversations" ON public.conversations
    FOR ALL USING (tenant_id = public.get_current_user_tenant_id());

-- Chatbot interactions policies
CREATE POLICY "Users can view their tenant chatbot interactions" ON public.chatbot_interactions
    FOR SELECT USING (tenant_id = public.get_current_user_tenant_id());

CREATE POLICY "Users can manage their tenant chatbot interactions" ON public.chatbot_interactions
    FOR ALL USING (tenant_id = public.get_current_user_tenant_id());

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chatbot_interactions TO authenticated;
GRANT SELECT ON public.conversations TO anon;
GRANT SELECT ON public.chatbot_interactions TO anon;

-- Comments for documentation
COMMENT ON TABLE public.conversations IS 'Organizes messages into conversations by contact and WhatsApp instance';
COMMENT ON TABLE public.chatbot_interactions IS 'Tracks chatbot interactions for analytics and performance monitoring';
COMMENT ON COLUMN public.chatbots.triggers IS 'JSON array of trigger objects with id, phrase, and isActive properties';
COMMENT ON COLUMN public.chatbots.responses IS 'JSON array of response objects with id, message, variables, and order properties';
COMMENT ON COLUMN public.chatbots.flow IS 'JSON object representing the chatbot flow for complex bots';
COMMENT ON COLUMN public.chatbots.analytics IS 'JSON object with analytics data including interactions, success rate, etc.';