-- Criar tabela de notificações
CREATE TABLE IF NOT EXISTS notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('info', 'success', 'warning', 'error')),
    read BOOLEAN DEFAULT FALSE,
    action_url TEXT,
    action_label TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_notifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_notifications_updated_at
    BEFORE UPDATE ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION update_notifications_updated_at();

-- Função para criar notificação
CREATE OR REPLACE FUNCTION create_notification(
    p_user_id UUID,
    p_title TEXT,
    p_message TEXT,
    p_type TEXT DEFAULT 'info',
    p_action_url TEXT DEFAULT NULL,
    p_action_label TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
    notification_id UUID;
BEGIN
    INSERT INTO notifications (
        user_id,
        title,
        message,
        type,
        action_url,
        action_label,
        metadata
    ) VALUES (
        p_user_id,
        p_title,
        p_message,
        p_type,
        p_action_url,
        p_action_label,
        p_metadata
    ) RETURNING id INTO notification_id;
    
    RETURN notification_id;
END;
$$ LANGUAGE plpgsql;

-- Função para notificar sobre nova mensagem
CREATE OR REPLACE FUNCTION notify_new_message()
RETURNS TRIGGER AS $$
DECLARE
    contact_name TEXT;
    instance_name TEXT;
BEGIN
    -- Buscar nome do contato
    SELECT name INTO contact_name
    FROM contacts
    WHERE id = NEW.contact_id;
    
    -- Buscar nome da instância
    SELECT name INTO instance_name
    FROM whatsapp_instances
    WHERE id = NEW.instance_id;
    
    -- Criar notificação apenas para mensagens recebidas
    IF NEW.direction = 'received' THEN
        PERFORM create_notification(
            auth.uid(),
            'Nova mensagem recebida',
            'Mensagem de ' || COALESCE(contact_name, 'Contato desconhecido') || ' via ' || COALESCE(instance_name, 'WhatsApp'),
            'info',
            '/dashboard/conversations?contact=' || NEW.contact_id,
            'Ver conversa',
            jsonb_build_object(
                'contact_id', NEW.contact_id,
                'message_id', NEW.id,
                'instance_id', NEW.instance_id
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para notificar sobre novas mensagens
CREATE TRIGGER trigger_notify_new_message
    AFTER INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION notify_new_message();

-- Função para notificar sobre nova campanha
CREATE OR REPLACE FUNCTION notify_campaign_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Notificar quando campanha é iniciada
    IF OLD.status = 'draft' AND NEW.status = 'active' THEN
        PERFORM create_notification(
            auth.uid(),
            'Campanha iniciada',
            'A campanha "' || NEW.name || '" foi iniciada com sucesso',
            'success',
            '/dashboard/campaigns/' || NEW.id,
            'Ver campanha',
            jsonb_build_object('campaign_id', NEW.id)
        );
    END IF;
    
    -- Notificar quando campanha é finalizada
    IF OLD.status = 'active' AND NEW.status = 'completed' THEN
        PERFORM create_notification(
            auth.uid(),
            'Campanha finalizada',
            'A campanha "' || NEW.name || '" foi finalizada',
            'info',
            '/dashboard/campaigns/' || NEW.id,
            'Ver relatório',
            jsonb_build_object('campaign_id', NEW.id)
        );
    END IF;
    
    -- Notificar quando campanha falha
    IF NEW.status = 'failed' THEN
        PERFORM create_notification(
            auth.uid(),
            'Erro na campanha',
            'A campanha "' || NEW.name || '" encontrou um erro',
            'error',
            '/dashboard/campaigns/' || NEW.id,
            'Ver detalhes',
            jsonb_build_object('campaign_id', NEW.id)
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para notificar sobre status de campanhas
CREATE TRIGGER trigger_notify_campaign_status
    AFTER UPDATE ON campaigns
    FOR EACH ROW
    EXECUTE FUNCTION notify_campaign_status();

-- Função para notificar sobre automação
CREATE OR REPLACE FUNCTION notify_automation_execution()
RETURNS TRIGGER AS $$
DECLARE
    flow_name TEXT;
BEGIN
    -- Buscar nome do fluxo
    SELECT name INTO flow_name
    FROM automation_flows
    WHERE id = NEW.flow_id;
    
    -- Notificar quando automação falha
    IF NEW.status = 'failed' THEN
        PERFORM create_notification(
            auth.uid(),
            'Erro na automação',
            'O fluxo "' || COALESCE(flow_name, 'Desconhecido') || '" encontrou um erro',
            'error',
            '/dashboard/automation',
            'Ver automações',
            jsonb_build_object(
                'flow_id', NEW.flow_id,
                'execution_id', NEW.id
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para notificar sobre execuções de automação
CREATE TRIGGER trigger_notify_automation_execution
    AFTER UPDATE ON automation_executions
    FOR EACH ROW
    EXECUTE FUNCTION notify_automation_execution();

-- Função para notificar sobre follow-ups vencidos
CREATE OR REPLACE FUNCTION notify_overdue_followups()
RETURNS void AS $$
DECLARE
    overdue_count INTEGER;
BEGIN
    -- Contar follow-ups vencidos
    SELECT COUNT(*) INTO overdue_count
    FROM followups
    WHERE status = 'scheduled'
    AND scheduled_for < NOW() - INTERVAL '1 hour';
    
    -- Criar notificação se houver follow-ups vencidos
    IF overdue_count > 0 THEN
        PERFORM create_notification(
            auth.uid(),
            'Follow-ups em atraso',
            'Você tem ' || overdue_count || ' follow-up' || 
            CASE WHEN overdue_count > 1 THEN 's' ELSE '' END || ' em atraso',
            'warning',
            '/dashboard/followups',
            'Ver follow-ups',
            jsonb_build_object('overdue_count', overdue_count)
        );
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Função para notificar sobre novos contatos
CREATE OR REPLACE FUNCTION notify_new_contact()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM create_notification(
        auth.uid(),
        'Novo contato adicionado',
        'O contato ' || COALESCE(NEW.name, NEW.phone) || ' foi adicionado',
        'info',
        '/dashboard/contacts/' || NEW.id,
        'Ver contato',
        jsonb_build_object('contact_id', NEW.id)
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para notificar sobre novos contatos
CREATE TRIGGER trigger_notify_new_contact
    AFTER INSERT ON contacts
    FOR EACH ROW
    EXECUTE FUNCTION notify_new_contact();

-- Função para limpar notificações antigas (mais de 30 dias)
CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS void AS $$
BEGIN
    DELETE FROM notifications
    WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Agendar limpeza de notificações antigas (executar diariamente às 2h)
SELECT cron.schedule(
    'cleanup-notifications',
    '0 2 * * *',
    'SELECT cleanup_old_notifications();'
);

-- Agendar verificação de follow-ups vencidos (executar a cada hora)
SELECT cron.schedule(
    'check-overdue-followups',
    '0 * * * *',
    'SELECT notify_overdue_followups();'
);

-- Políticas RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Política para visualizar apenas suas próprias notificações
CREATE POLICY "Users can view own notifications" ON notifications
    FOR SELECT USING (auth.uid() = user_id);

-- Política para inserir notificações
CREATE POLICY "Users can insert own notifications" ON notifications
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Política para atualizar suas próprias notificações
CREATE POLICY "Users can update own notifications" ON notifications
    FOR UPDATE USING (auth.uid() = user_id);

-- Política para deletar suas próprias notificações
CREATE POLICY "Users can delete own notifications" ON notifications
    FOR DELETE USING (auth.uid() = user_id);

-- Inserir algumas notificações de exemplo
INSERT INTO notifications (user_id, title, message, type, action_url, action_label) VALUES
(auth.uid(), 'Bem-vindo ao ConvoFlow!', 'Sua conta foi criada com sucesso. Comece criando sua primeira campanha.', 'success', '/dashboard/campaigns', 'Criar campanha'),
(auth.uid(), 'Configure sua instância do WhatsApp', 'Para começar a enviar mensagens, você precisa configurar uma instância do WhatsApp.', 'info', '/dashboard/settings/whatsapp', 'Configurar'),
(auth.uid(), 'Dica: Use templates de mensagem', 'Crie templates de mensagem para agilizar suas campanhas e follow-ups.', 'info', '/dashboard/templates', 'Ver templates');

COMMIT;