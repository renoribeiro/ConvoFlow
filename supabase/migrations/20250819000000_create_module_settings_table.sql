CREATE TABLE module_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE module_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow full access to superadmins"
ON module_settings
FOR ALL
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Allow read access to authenticated users"
ON module_settings
FOR SELECT
USING (auth.role() = 'authenticated');