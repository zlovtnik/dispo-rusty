-- Tenant Database Schema
-- Comprehensive multi-tenant database design with isolation and scalability

-- =============================================
-- CORE TENANT MANAGEMENT
-- =============================================

-- Master tenants table
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE, -- URL-friendly identifier
    domain VARCHAR(255) UNIQUE, -- Custom domain support
    db_name VARCHAR(100) NOT NULL UNIQUE, -- Tenant-specific database name
    db_url TEXT NOT NULL, -- Database connection URL
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'pending')),
    plan VARCHAR(50) DEFAULT 'basic' CHECK (plan IN ('basic', 'professional', 'enterprise', 'custom')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES users(id),
    settings JSONB DEFAULT '{}',
    limits JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}'
);

-- Tenant settings and configuration
CREATE TABLE tenant_settings (
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key VARCHAR(100) NOT NULL,
    value JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (tenant_id, key)
);

-- Tenant limits and quotas
CREATE TABLE tenant_limits (
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    resource_type VARCHAR(50) NOT NULL,
    limit_value INTEGER NOT NULL,
    current_usage INTEGER DEFAULT 0,
    reset_period VARCHAR(20) DEFAULT 'monthly' CHECK (reset_period IN ('daily', 'weekly', 'monthly', 'yearly')),
    last_reset TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (tenant_id, resource_type)
);

-- Tenant features and capabilities
CREATE TABLE tenant_features (
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    feature_name VARCHAR(100) NOT NULL,
    enabled BOOLEAN DEFAULT false,
    configuration JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (tenant_id, feature_name)
);

-- =============================================
-- USER-TENANT RELATIONSHIPS
-- =============================================

-- User-tenant associations with roles
CREATE TABLE user_tenants (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'manager', 'member', 'viewer')),
    permissions JSONB DEFAULT '[]',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_accessed TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'pending')),
    invited_by UUID REFERENCES users(id),
    PRIMARY KEY (user_id, tenant_id)
);

-- Tenant invitations
CREATE TABLE tenant_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'manager', 'member', 'viewer')),
    invited_by UUID NOT NULL REFERENCES users(id),
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    accepted_at TIMESTAMP WITH TIME ZONE,
    declined_at TIMESTAMP WITH TIME ZONE
);

-- =============================================
-- TENANT-SPECIFIC RESOURCES
-- =============================================

-- Tenant-scoped contacts (example resource)
CREATE TABLE tenant_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    company VARCHAR(100),
    job_title VARCHAR(100),
    address JSONB,
    custom_fields JSONB DEFAULT '{}',
    tags TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES users(id),
    updated_by UUID NOT NULL REFERENCES users(id),
    is_active BOOLEAN DEFAULT true
);

-- Tenant-scoped users (tenant-specific user data)
CREATE TABLE tenant_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_specific_data JSONB DEFAULT '{}',
    preferences JSONB DEFAULT '{}',
    last_activity TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id, user_id)
);

-- =============================================
-- AUDIT AND LOGGING
-- =============================================

-- Tenant audit log
CREATE TABLE tenant_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tenant activity log
CREATE TABLE tenant_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    activity_type VARCHAR(100) NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}',
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- ANALYTICS AND METRICS
-- =============================================

-- Tenant usage metrics
CREATE TABLE tenant_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    metric_name VARCHAR(100) NOT NULL,
    metric_value NUMERIC NOT NULL,
    metric_unit VARCHAR(20),
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

-- Tenant performance metrics
CREATE TABLE tenant_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    response_time_ms INTEGER,
    error_rate DECIMAL(5,2),
    uptime_percentage DECIMAL(5,2),
    api_calls_count INTEGER,
    storage_used_bytes BIGINT,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

-- Tenant indexes
CREATE INDEX idx_tenants_status ON tenants(status);
CREATE INDEX idx_tenants_plan ON tenants(plan);
CREATE INDEX idx_tenants_created_at ON tenants(created_at);
CREATE INDEX idx_tenants_created_by ON tenants(created_by);

-- User-tenant indexes
CREATE INDEX idx_user_tenants_user_id ON user_tenants(user_id);
CREATE INDEX idx_user_tenants_tenant_id ON user_tenants(tenant_id);
CREATE INDEX idx_user_tenants_role ON user_tenants(role);
CREATE INDEX idx_user_tenants_status ON user_tenants(status);
CREATE INDEX idx_user_tenants_last_accessed ON user_tenants(last_accessed);

-- Invitation indexes
CREATE INDEX idx_tenant_invitations_tenant_id ON tenant_invitations(tenant_id);
CREATE INDEX idx_tenant_invitations_email ON tenant_invitations(email);
CREATE INDEX idx_tenant_invitations_token ON tenant_invitations(token);
CREATE INDEX idx_tenant_invitations_status ON tenant_invitations(status);
CREATE INDEX idx_tenant_invitations_expires_at ON tenant_invitations(expires_at);

-- Contact indexes
CREATE INDEX idx_tenant_contacts_tenant_id ON tenant_contacts(tenant_id);
CREATE INDEX idx_tenant_contacts_email ON tenant_contacts(email);
CREATE INDEX idx_tenant_contacts_company ON tenant_contacts(company);
CREATE INDEX idx_tenant_contacts_created_at ON tenant_contacts(created_at);
CREATE INDEX idx_tenant_contacts_is_active ON tenant_contacts(is_active);

-- Audit log indexes
CREATE INDEX idx_tenant_audit_log_tenant_id ON tenant_audit_log(tenant_id);
CREATE INDEX idx_tenant_audit_log_user_id ON tenant_audit_log(user_id);
CREATE INDEX idx_tenant_audit_log_action ON tenant_audit_log(action);
CREATE INDEX idx_tenant_audit_log_created_at ON tenant_audit_log(created_at);

-- Activity log indexes
CREATE INDEX idx_tenant_activity_log_tenant_id ON tenant_activity_log(tenant_id);
CREATE INDEX idx_tenant_activity_log_user_id ON tenant_activity_log(user_id);
CREATE INDEX idx_tenant_activity_log_activity_type ON tenant_activity_log(activity_type);
CREATE INDEX idx_tenant_activity_log_created_at ON tenant_activity_log(created_at);

-- Metrics indexes
CREATE INDEX idx_tenant_metrics_tenant_id ON tenant_metrics(tenant_id);
CREATE INDEX idx_tenant_metrics_metric_name ON tenant_metrics(metric_name);
CREATE INDEX idx_tenant_metrics_recorded_at ON tenant_metrics(recorded_at);

-- Performance indexes
CREATE INDEX idx_tenant_performance_tenant_id ON tenant_performance(tenant_id);
CREATE INDEX idx_tenant_performance_recorded_at ON tenant_performance(recorded_at);

-- =============================================
-- TRIGGERS FOR AUTOMATIC UPDATES
-- =============================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to all tables with updated_at
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tenant_settings_updated_at BEFORE UPDATE ON tenant_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tenant_limits_updated_at BEFORE UPDATE ON tenant_limits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tenant_features_updated_at BEFORE UPDATE ON tenant_features
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tenant_contacts_updated_at BEFORE UPDATE ON tenant_contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tenant_users_updated_at BEFORE UPDATE ON tenant_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================

-- Enable RLS on tenant-scoped tables
ALTER TABLE tenant_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_performance ENABLE ROW LEVEL SECURITY;

-- RLS policies for tenant isolation
CREATE POLICY tenant_contacts_tenant_isolation ON tenant_contacts
    FOR ALL TO authenticated
    USING (tenant_id IN (
        SELECT tenant_id FROM user_tenants 
        WHERE user_id = current_setting('app.current_user_id')::UUID
    ));

CREATE POLICY tenant_users_tenant_isolation ON tenant_users
    FOR ALL TO authenticated
    USING (tenant_id IN (
        SELECT tenant_id FROM user_tenants 
        WHERE user_id = current_setting('app.current_user_id')::UUID
    ));

CREATE POLICY tenant_audit_log_tenant_isolation ON tenant_audit_log
    FOR ALL TO authenticated
    USING (tenant_id IN (
        SELECT tenant_id FROM user_tenants 
        WHERE user_id = current_setting('app.current_user_id')::UUID
    ));

CREATE POLICY tenant_activity_log_tenant_isolation ON tenant_activity_log
    FOR ALL TO authenticated
    USING (tenant_id IN (
        SELECT tenant_id FROM user_tenants 
        WHERE user_id = current_setting('app.current_user_id')::UUID
    ));

CREATE POLICY tenant_metrics_tenant_isolation ON tenant_metrics
    FOR ALL TO authenticated
    USING (tenant_id IN (
        SELECT tenant_id FROM user_tenants 
        WHERE user_id = current_setting('app.current_user_id')::UUID
    ));

CREATE POLICY tenant_performance_tenant_isolation ON tenant_performance
    FOR ALL TO authenticated
    USING (tenant_id IN (
        SELECT tenant_id FROM user_tenants 
        WHERE user_id = current_setting('app.current_user_id')::UUID
    ));

-- =============================================
-- VIEWS FOR COMMON QUERIES
-- =============================================

-- Tenant overview view
CREATE VIEW tenant_overview AS
SELECT 
    t.id,
    t.name,
    t.slug,
    t.domain,
    t.status,
    t.plan,
    t.created_at,
    t.updated_at,
    COUNT(DISTINCT ut.user_id) as user_count,
    COUNT(DISTINCT tc.id) as contact_count,
    t.settings,
    t.limits
FROM tenants t
LEFT JOIN user_tenants ut ON t.id = ut.tenant_id AND ut.status = 'active'
LEFT JOIN tenant_contacts tc ON t.id = tc.tenant_id AND tc.is_active = true
GROUP BY t.id, t.name, t.slug, t.domain, t.status, t.plan, t.created_at, t.updated_at, t.settings, t.limits;

-- Tenant usage summary view
CREATE VIEW tenant_usage_summary AS
SELECT 
    t.id as tenant_id,
    t.name as tenant_name,
    t.plan,
    COUNT(DISTINCT ut.user_id) as active_users,
    COUNT(DISTINCT tc.id) as total_contacts,
    COALESCE(SUM(tm.metric_value) FILTER (WHERE tm.metric_name = 'api_calls'), 0) as total_api_calls,
    COALESCE(AVG(tp.response_time_ms), 0) as avg_response_time,
    COALESCE(AVG(tp.error_rate), 0) as avg_error_rate,
    COALESCE(MAX(tp.uptime_percentage), 0) as uptime_percentage
FROM tenants t
LEFT JOIN user_tenants ut ON t.id = ut.tenant_id AND ut.status = 'active'
LEFT JOIN tenant_contacts tc ON t.id = tc.tenant_id AND tc.is_active = true
LEFT JOIN tenant_metrics tm ON t.id = tm.tenant_id AND tm.metric_name = 'api_calls'
LEFT JOIN tenant_performance tp ON t.id = tp.tenant_id
GROUP BY t.id, t.name, t.plan;

-- =============================================
-- FUNCTIONS FOR TENANT OPERATIONS
-- =============================================

-- Function to create tenant-specific database
CREATE OR REPLACE FUNCTION create_tenant_database(tenant_id UUID, db_name TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    sql TEXT;
BEGIN
    -- Create database
    sql := format('CREATE DATABASE %I', db_name);
    EXECUTE sql;
    
    -- Log the creation
    INSERT INTO tenant_audit_log (tenant_id, action, resource_type, new_values)
    VALUES (tenant_id, 'database_created', 'database', jsonb_build_object('db_name', db_name));
    
    RETURN TRUE;
EXCEPTION
    WHEN OTHERS THEN
        RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Function to check tenant limits
CREATE OR REPLACE FUNCTION check_tenant_limit(tenant_id UUID, resource_type VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
    limit_value INTEGER;
    current_usage INTEGER;
BEGIN
    SELECT tl.limit_value, tl.current_usage
    INTO limit_value, current_usage
    FROM tenant_limits tl
    WHERE tl.tenant_id = tenant_id AND tl.resource_type = resource_type;
    
    IF limit_value IS NULL THEN
        RETURN TRUE; -- No limit set
    END IF;
    
    RETURN current_usage < limit_value;
END;
$$ LANGUAGE plpgsql;

-- Function to increment tenant usage
CREATE OR REPLACE FUNCTION increment_tenant_usage(tenant_id UUID, resource_type VARCHAR, amount INTEGER DEFAULT 1)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE tenant_limits 
    SET current_usage = current_usage + amount,
        updated_at = NOW()
    WHERE tenant_id = tenant_id AND resource_type = resource_type;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to reset tenant usage (for periodic resets)
CREATE OR REPLACE FUNCTION reset_tenant_usage(tenant_id UUID, resource_type VARCHAR)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE tenant_limits 
    SET current_usage = 0,
        last_reset = NOW(),
        updated_at = NOW()
    WHERE tenant_id = tenant_id AND resource_type = resource_type;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;
