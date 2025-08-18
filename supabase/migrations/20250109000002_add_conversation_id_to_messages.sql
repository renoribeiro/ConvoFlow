-- Add conversation_id to messages table to link messages to conversations
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.conversations(id);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);

-- Function to automatically manage conversations when messages are inserted
CREATE OR REPLACE FUNCTION handle_message_conversation()
RETURNS TRIGGER AS $$
DECLARE
    v_conversation_id UUID;
BEGIN
    -- Find existing conversation for this contact and whatsapp instance
    SELECT id INTO v_conversation_id
    FROM public.conversations
    WHERE contact_id = NEW.contact_id 
      AND whatsapp_instance_id = NEW.whatsapp_instance_id
      AND tenant_id = NEW.tenant_id;
    
    -- If no conversation exists, create one
    IF v_conversation_id IS NULL THEN
        INSERT INTO public.conversations (
            tenant_id,
            contact_id,
            whatsapp_instance_id,
            last_message_at,
            unread_count,
            is_archived
        ) VALUES (
            NEW.tenant_id,
            NEW.contact_id,
            NEW.whatsapp_instance_id,
            NEW.created_at,
            CASE WHEN NEW.direction = 'incoming' THEN 1 ELSE 0 END,
            false
        ) RETURNING id INTO v_conversation_id;
    ELSE
        -- Update existing conversation
        UPDATE public.conversations
        SET last_message_at = NEW.created_at,
            unread_count = CASE 
                WHEN NEW.direction = 'incoming' THEN unread_count + 1 
                ELSE unread_count 
            END,
            updated_at = NOW()
        WHERE id = v_conversation_id;
    END IF;
    
    -- Set conversation_id in the message
    NEW.conversation_id = v_conversation_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically handle conversations
DROP TRIGGER IF EXISTS trigger_handle_message_conversation ON public.messages;
CREATE TRIGGER trigger_handle_message_conversation
    BEFORE INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION handle_message_conversation();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.conversations TO authenticated;
GRANT SELECT ON public.conversations TO anon;
GRANT USAGE ON SCHEMA public TO authenticated, anon;