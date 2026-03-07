-- Add webhook automation columns to whatsapp_instances table
ALTER TABLE whatsapp_instances 
ADD COLUMN IF NOT EXISTS webhook_configured BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS webhook_events TEXT[] DEFAULT ARRAY['QRCODE_UPDATED', 'CONNECTION_UPDATE', 'MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'SEND_MESSAGE'],
ADD COLUMN IF NOT EXISTS automation_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS webhook_last_configured_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS webhook_retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS webhook_last_error TEXT;

-- Add new columns to existing webhook_logs table for automation monitoring
ALTER TABLE webhook_logs 
ADD COLUMN IF NOT EXISTS whatsapp_instance_id UUID,
ADD COLUMN IF NOT EXISTS webhook_url TEXT,
ADD COLUMN IF NOT EXISTS http_status INTEGER,
ADD COLUMN IF NOT EXISTS response_body TEXT,
ADD COLUMN IF NOT EXISTS error_message TEXT,
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add foreign key constraint separately to avoid type casting issues
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'webhook_logs_whatsapp_instance_id_fkey'
    ) THEN
        ALTER TABLE webhook_logs 
        ADD CONSTRAINT webhook_logs_whatsapp_instance_id_fkey 
        FOREIGN KEY (whatsapp_instance_id) REFERENCES whatsapp_instances(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Create webhook_configuration_attempts table for tracking automation attempts
CREATE TABLE IF NOT EXISTS webhook_configuration_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    whatsapp_instance_id UUID NOT NULL REFERENCES whatsapp_instances(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL,
    webhook_url TEXT NOT NULL,
    events TEXT[] NOT NULL,
    success BOOLEAN DEFAULT FALSE,
    error_message TEXT,
    response_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_webhook_logs_whatsapp_instance_id ON webhook_logs(whatsapp_instance_id);
CREATE INDEX IF NOT EXISTS idx_webhook_configuration_attempts_instance_id ON webhook_configuration_attempts(whatsapp_instance_id);
CREATE INDEX IF NOT EXISTS idx_webhook_configuration_attempts_created_at ON webhook_configuration_attempts(created_at);

-- Enable RLS on new table
ALTER TABLE webhook_configuration_attempts ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for webhook_configuration_attempts
CREATE POLICY "Users can view webhook config attempts for their tenant instances" ON webhook_configuration_attempts
    FOR SELECT USING (
        whatsapp_instance_id IN (
            SELECT id FROM whatsapp_instances 
            WHERE tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
        )
    );

CREATE POLICY "Users can insert webhook config attempts for their tenant instances" ON webhook_configuration_attempts
    FOR INSERT WITH CHECK (
        whatsapp_instance_id IN (
            SELECT id FROM whatsapp_instances 
            WHERE tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
        )
    );

-- Grant permissions to authenticated users
GRANT SELECT, INSERT ON webhook_configuration_attempts TO authenticated;

-- Grant permissions to anon role for webhook processing
GRANT SELECT, INSERT, UPDATE ON webhook_logs TO anon;
GRANT SELECT ON whatsapp_instances TO anon;

-- Create function to update updated_at timestamp if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for webhook_logs updated_at
DROP TRIGGER IF EXISTS update_webhook_logs_updated_at ON webhook_logs;
CREATE TRIGGER update_webhook_logs_updated_at 
    BEFORE UPDATE ON webhook_logs 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add comment to new table for documentation
COMMENT ON TABLE webhook_configuration_attempts IS 'Tracks webhook configuration attempts during instance creation for debugging automation issues';
COMMENT ON COLUMN whatsapp_instances.webhook_configured IS 'Indicates if webhook has been successfully configured for this instance';
COMMENT ON COLUMN whatsapp_instances.webhook_events IS 'Array of webhook events configured for this instance';
COMMENT ON COLUMN whatsapp_instances.automation_enabled IS 'Indicates if webhook automation is enabled for this instance';
COMMENT ON COLUMN whatsapp_instances.webhook_last_configured_at IS 'Timestamp of last successful webhook configuration';
COMMENT ON COLUMN whatsapp_instances.webhook_retry_count IS 'Number of webhook configuration retry attempts';
COMMENT ON COLUMN whatsapp_instances.webhook_last_error IS 'Last error message from webhook configuration attempt';