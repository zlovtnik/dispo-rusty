# Tenant Architecture & Microservices Design

## Overview

This document outlines the comprehensive architecture for multi-tenant microservices, including database design, API endpoints, authentication, and service boundaries.

## 🏗️ **Database Architecture**

### 1. **Tenant Isolation Strategy**

#### Option A: Database per Tenant (Recommended)
```sql
-- Master database for tenant metadata
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    domain VARCHAR(255) UNIQUE,
    db_name VARCHAR(100) NOT NULL UNIQUE,
    db_url TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    plan VARCHAR(50) DEFAULT 'basic',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    settings JSONB,
    limits JSONB
);

-- Tenant-specific database creation
-- Each tenant gets their own database: tenant_{tenant_id}
```

#### Option B: Schema per Tenant
```sql
-- Single database with schema isolation
CREATE SCHEMA tenant_12345;
CREATE SCHEMA tenant_67890;

-- Shared tables in public schema
CREATE TABLE tenants (
    id UUID PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    schema_name VARCHAR(100) NOT NULL UNIQUE,
    -- ... other fields
);
```

### 2. **Tenant Configuration Schema**

```sql
-- Tenant settings and configuration
CREATE TABLE tenant_settings (
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    key VARCHAR(100) NOT NULL,
    value JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (tenant_id, key)
);

-- Tenant limits and quotas
CREATE TABLE tenant_limits (
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    resource_type VARCHAR(50) NOT NULL,
    limit_value INTEGER NOT NULL,
    current_usage INTEGER DEFAULT 0,
    reset_period VARCHAR(20) DEFAULT 'monthly',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (tenant_id, resource_type)
);

-- Tenant features and capabilities
CREATE TABLE tenant_features (
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    feature_name VARCHAR(100) NOT NULL,
    enabled BOOLEAN DEFAULT false,
    configuration JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (tenant_id, feature_name)
);
```

### 3. **User-Tenant Relationship**

```sql
-- User-tenant associations
CREATE TABLE user_tenants (
    user_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'member',
    permissions JSONB,
    joined_at TIMESTAMP DEFAULT NOW(),
    last_accessed TIMESTAMP,
    status VARCHAR(20) DEFAULT 'active',
    PRIMARY KEY (user_id, tenant_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Tenant invitations
CREATE TABLE tenant_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    invited_by UUID NOT NULL REFERENCES users(id),
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW()
);
```

## 🔌 **API Endpoints Design**

### 1. **Tenant Management APIs**

```typescript
// Tenant CRUD Operations
POST   /api/tenants                    // Create tenant
GET    /api/tenants                    // List tenants (with pagination/filtering)
GET    /api/tenants/:id                // Get tenant details
PUT    /api/tenants/:id                // Update tenant
DELETE /api/tenants/:id                // Delete tenant

// Tenant Configuration
GET    /api/tenants/:id/settings       // Get tenant settings
PUT    /api/tenants/:id/settings       // Update tenant settings
GET    /api/tenants/:id/limits         // Get tenant limits
PUT    /api/tenants/:id/limits         // Update tenant limits

// Tenant Health & Status
GET    /api/tenants/:id/health         // Tenant health check
GET    /api/tenants/:id/status         // Tenant status
POST   /api/tenants/:id/backup         // Backup tenant data
POST   /api/tenants/:id/restore        // Restore tenant data

// Tenant Analytics
GET    /api/tenants/:id/analytics      // Tenant usage analytics
GET    /api/tenants/:id/metrics        // Performance metrics
```

### 2. **User-Tenant Management APIs**

```typescript
// User-Tenant Associations
GET    /api/tenants/:id/users          // List tenant users
POST   /api/tenants/:id/users          // Add user to tenant
PUT    /api/tenants/:id/users/:userId  // Update user role
DELETE /api/tenants/:id/users/:userId  // Remove user from tenant

// Tenant Invitations
POST   /api/tenants/:id/invite         // Invite user to tenant
GET    /api/tenants/:id/invitations    // List pending invitations
PUT    /api/invitations/:token         // Accept invitation
DELETE /api/invitations/:token         // Decline invitation
```

### 3. **Tenant-Scoped Resource APIs**

```typescript
// All tenant-scoped resources should include tenant context
GET    /api/tenants/:tenantId/contacts     // Tenant-scoped contacts
POST   /api/tenants/:tenantId/contacts     // Create contact in tenant
GET    /api/tenants/:tenantId/contacts/:id // Get tenant contact
PUT    /api/tenants/:tenantId/contacts/:id // Update tenant contact
DELETE /api/tenants/:tenantId/contacts/:id // Delete tenant contact

// Similar pattern for all resources:
// /api/tenants/:tenantId/{resource}
```

## 🔐 **Authentication & Authorization**

### 1. **JWT Token Structure**

```typescript
interface TenantJWT {
  sub: string;           // User ID
  tenant_id: string;     // Current tenant ID
  tenant_role: string;   // Role within tenant
  permissions: string[]; // Tenant-specific permissions
  tenant_limits: {       // Tenant resource limits
    max_users: number;
    max_contacts: number;
    features: string[];
  };
  iat: number;
  exp: number;
}
```

### 2. **Tenant Context Middleware**

```typescript
// Express middleware for tenant context
const tenantContext = (req: Request, res: Response, next: NextFunction) => {
  const token = extractJWT(req);
  const tenantId = token.tenant_id;
  
  // Validate tenant access
  const tokenMetadata: TokenMetadata = {
    issuedAt: token.iat,
    lastRevokeAt: token.lastRevokeAt,
    isBlacklisted: token.isBlacklisted,
    tenantRole: token.tenant_role,
    permissions: token.permissions
  };
  
  const accessResult = hasTenantAccess(token.sub, tenantId, tokenMetadata);
  if (accessResult.isErr() || !accessResult.value) {
    return res.status(403).json({ error: 'Tenant access denied' });
  }
  
  // Set tenant context
  req.tenantId = tenantId;
  req.tenantRole = token.tenant_role;
  req.tenantPermissions = token.permissions;
  
  next();
};
```

### **hasTenantAccess Function Implementation**

The `hasTenantAccess` function is implemented in `src/services/auth.ts` and provides comprehensive tenant access validation:

**Function Signature:**
```typescript
function hasTenantAccess(
  userId: UserId,
  tenantId: TenantId,
  tokenMetadata: TokenMetadata,
  config?: AuthConfig
): Result<boolean, AppError>
```

**Implementation Location:** `src/services/auth.ts`

**Acceptance Conditions:**
- **Ownership**: User is the tenant owner
- **Membership**: User is an active member of the tenant
- **Invitation**: User has an accepted invitation to the tenant
- **Required Role**: User has minimum required role level (invited/member/owner)
- **Active Status**: Both user account and tenant are active
- **Token Validity**: Token is not expired, revoked, or blacklisted

**Validation Process:**
1. **Token Validation**: Checks token freshness, revocation status, and blacklist
2. **Account Status**: Verifies user and tenant accounts are active
3. **Membership Validation**: Confirms user has valid tenant membership
4. **Role Verification**: Ensures user has sufficient role permissions
5. **Security Logging**: Logs all access attempts and failures

**Failure Behavior:**
- **Log Entry**: Emits structured security log with failure reason
- **Metrics Counter**: Increments `auth_failure` metric with tags
- **Response**: Returns 403 Forbidden with error details
- **Security Event**: Triggers security monitoring alerts

**Usage Example:**
```typescript
import { hasTenantAccess } from '@/services/auth';

const tokenMetadata: TokenMetadata = {
  issuedAt: token.iat,
  lastRevokeAt: token.lastRevokeAt,
  isBlacklisted: false,
  tenantRole: 'member',
  permissions: ['read', 'write']
};

const result = hasTenantAccess(userId, tenantId, tokenMetadata);
result.match(
  (hasAccess) => {
    if (hasAccess) {
      // Proceed with tenant operations
    } else {
      // Handle access denied
    }
  },
  (error) => {
    // Handle validation error
    console.error('Access validation failed:', error.message);
  }
);
```

### 3. **Database Connection Management**

```typescript
// Enhanced tenant-aware database connection with bounded pools
interface TenantPoolConfig {
  maxConnections: number;           // System-wide connection limit
  maxConnectionsPerTenant: number;  // Per-tenant connection limit
  idleTimeout: number;              // Idle connection timeout (ms)
  evictionInterval: number;         // Eviction check interval (ms)
}

interface TenantPool {
  activeConnections: Set<DatabaseConnection>;
  busyConnections: Set<DatabaseConnection>;
  lastUsed: Map<DatabaseConnection, number>;
  waitQueue: Array<{
    resolve: (conn: DatabaseConnection) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>;
  tenantConfig: TenantConfig;
}

interface PoolMetrics {
  totalConnections: number;
  activeConnections: number;
  queuedRequests: number;
  evictedConnections: number;
  tenantPools: Map<string, {
    active: number;
    busy: number;
    queued: number;
  }>;
}

class TenantDatabaseManager {
  private tenantPools: Map<string, TenantPool> = new Map();
  private config: TenantPoolConfig;
  private evictionTimer?: NodeJS.Timeout;
  private metrics: PoolMetrics;

  constructor(config: TenantPoolConfig) {
    this.config = {
      maxConnections: 100,
      maxConnectionsPerTenant: 10,
      idleTimeout: 30 * 60 * 1000, // 30 minutes
      evictionInterval: 5 * 60 * 1000, // 5 minutes
      ...config
    };
    
    this.metrics = {
      totalConnections: 0,
      activeConnections: 0,
      queuedRequests: 0,
      evictedConnections: 0,
      tenantPools: new Map()
    };
    
    this.startEvictionTimer();
  }

  async getConnection(tenantId: string, timeoutMs: number = 30000): Promise<DatabaseConnection> {
    const pool = await this.getOrCreateTenantPool(tenantId);
    
    // Check if we can create a new connection
    if (this.canCreateConnection(tenantId)) {
      const connection = await this.createConnection(pool.tenantConfig.db_url);
      this.addConnectionToPool(tenantId, connection);
      this.onAcquire(connection, tenantId);
      return connection;
    }
    
    // Check for available connection in pool
    const availableConnection = this.findAvailableConnection(pool);
    if (availableConnection) {
      this.markConnectionBusy(pool, availableConnection);
      this.onAcquire(availableConnection, tenantId);
      return availableConnection;
    }
    
    // Queue the request if we haven't exceeded limits
    if (this.metrics.totalConnections < this.config.maxConnections) {
      return this.queueConnectionRequest(tenantId, timeoutMs);
    }
    
    // System is at capacity
    throw new Error(`Database connection pool exhausted. System limit: ${this.config.maxConnections}, Active: ${this.metrics.activeConnections}`);
  }

  private async getOrCreateTenantPool(tenantId: string): Promise<TenantPool> {
    if (!this.tenantPools.has(tenantId)) {
      const tenantConfig = await this.getTenantConfig(tenantId);
      const pool: TenantPool = {
        activeConnections: new Set(),
        busyConnections: new Set(),
        lastUsed: new Map(),
        waitQueue: [],
        tenantConfig
      };
      this.tenantPools.set(tenantId, pool);
    }
    return this.tenantPools.get(tenantId)!;
  }

  private canCreateConnection(tenantId: string): boolean {
    const pool = this.tenantPools.get(tenantId);
    if (!pool) return true;
    
    return (
      this.metrics.totalConnections < this.config.maxConnections &&
      pool.activeConnections.size < this.config.maxConnectionsPerTenant
    );
  }

  private findAvailableConnection(pool: TenantPool): DatabaseConnection | null {
    for (const connection of pool.activeConnections) {
      if (!pool.busyConnections.has(connection)) {
        return connection;
      }
    }
    return null;
  }

  private markConnectionBusy(pool: TenantPool, connection: DatabaseConnection): void {
    pool.busyConnections.add(connection);
    this.metrics.activeConnections++;
  }

  private async queueConnectionRequest(tenantId: string, timeoutMs: number): Promise<DatabaseConnection> {
    const pool = this.tenantPools.get(tenantId)!;
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = pool.waitQueue.findIndex(waiter => waiter.resolve === resolve);
        if (index !== -1) {
          pool.waitQueue.splice(index, 1);
          this.metrics.queuedRequests--;
          reject(new Error(`Connection request timeout after ${timeoutMs}ms`));
        }
      }, timeoutMs);
      
      pool.waitQueue.push({ resolve, reject, timeout });
      this.metrics.queuedRequests++;
    });
  }

  async releaseConnection(tenantId: string, connection: DatabaseConnection): Promise<void> {
    const pool = this.tenantPools.get(tenantId);
    if (!pool) return;
    
    // Mark connection as available
    pool.busyConnections.delete(connection);
    pool.lastUsed.set(connection, Date.now());
    this.metrics.activeConnections--;
    
    // Process queued requests
    if (pool.waitQueue.length > 0) {
      const waiter = pool.waitQueue.shift()!;
      clearTimeout(waiter.timeout);
      this.metrics.queuedRequests--;
      
      this.markConnectionBusy(pool, connection);
      this.onAcquire(connection, tenantId);
      waiter.resolve(connection);
    }
    
    this.onRelease(connection, tenantId);
  }

  private addConnectionToPool(tenantId: string, connection: DatabaseConnection): void {
    const pool = this.tenantPools.get(tenantId)!;
    pool.activeConnections.add(connection);
    pool.lastUsed.set(connection, Date.now());
    this.metrics.totalConnections++;
  }

  private startEvictionTimer(): void {
    this.evictionTimer = setInterval(() => {
      this.evictIdleConnections();
    }, this.config.evictionInterval);
  }

  private evictIdleConnections(): void {
    const now = Date.now();
    const idleThreshold = now - this.config.idleTimeout;
    
    for (const [tenantId, pool] of this.tenantPools) {
      const connectionsToClose: DatabaseConnection[] = [];
      
      for (const [connection, lastUsed] of pool.lastUsed) {
        if (lastUsed < idleThreshold && !pool.busyConnections.has(connection)) {
          connectionsToClose.push(connection);
        }
      }
      
      for (const connection of connectionsToClose) {
        this.closeConnection(tenantId, connection);
        this.metrics.evictedConnections++;
      }
    }
    
    this.updateMetrics();
  }

  private closeConnection(tenantId: string, connection: DatabaseConnection): void {
    const pool = this.tenantPools.get(tenantId);
    if (!pool) return;
    
    pool.activeConnections.delete(connection);
    pool.busyConnections.delete(connection);
    pool.lastUsed.delete(connection);
    this.metrics.totalConnections--;
    
    // Close the actual connection
    connection.close().catch(error => {
      console.error(`Error closing connection for tenant ${tenantId}:`, error);
    });
  }

  private onAcquire(connection: DatabaseConnection, tenantId: string): void {
    // Lifecycle hook for connection acquisition
    console.debug(`Connection acquired for tenant ${tenantId}`);
  }

  private onRelease(connection: DatabaseConnection, tenantId: string): void {
    // Lifecycle hook for connection release
    console.debug(`Connection released for tenant ${tenantId}`);
  }

  private onError(connection: DatabaseConnection, tenantId: string, error: Error): void {
    // Lifecycle hook for connection errors
    console.error(`Connection error for tenant ${tenantId}:`, error);
    
    // Remove faulty connection from pool
    const pool = this.tenantPools.get(tenantId);
    if (pool) {
      pool.activeConnections.delete(connection);
      pool.busyConnections.delete(connection);
      pool.lastUsed.delete(connection);
      this.metrics.totalConnections--;
    }
  }

  private updateMetrics(): void {
    this.metrics.tenantPools.clear();
    
    for (const [tenantId, pool] of this.tenantPools) {
      this.metrics.tenantPools.set(tenantId, {
        active: pool.activeConnections.size,
        busy: pool.busyConnections.size,
        queued: pool.waitQueue.length
      });
    }
  }

  getMetrics(): PoolMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  async executeQuery(tenantId: string, query: string, params: any[]): Promise<any> {
    const connection = await this.getConnection(tenantId);
    
    try {
      const result = await connection.query(query, params);
      return result;
    } catch (error) {
      this.onError(connection, tenantId, error as Error);
      throw error;
    } finally {
      await this.releaseConnection(tenantId, connection);
    }
  }

  async shutdown(): Promise<void> {
    if (this.evictionTimer) {
      clearInterval(this.evictionTimer);
    }
    
    // Close all connections
    for (const [tenantId, pool] of this.tenantPools) {
      for (const connection of pool.activeConnections) {
        await connection.close();
      }
    }
    
    this.tenantPools.clear();
    this.metrics = {
      totalConnections: 0,
      activeConnections: 0,
      queuedRequests: 0,
      evictedConnections: 0,
      tenantPools: new Map()
    };
  }
}
```

## 🚀 **Service Boundaries**

### 1. **Core Services**

#### Tenant Management Service
- **Responsibilities**: Tenant CRUD, configuration, limits
- **Database**: Master tenant database
- **APIs**: `/api/tenants/*`
- **Dependencies**: User service, notification service

#### User Management Service
- **Responsibilities**: User authentication, tenant associations
- **Database**: Shared user database
- **APIs**: `/api/users/*`, `/api/auth/*`
- **Dependencies**: Tenant service, notification service

#### Contact Management Service
- **Responsibilities**: Contact CRUD within tenant context
- **Database**: Tenant-specific databases
- **APIs**: `/api/tenants/:id/contacts/*`
- **Dependencies**: Tenant service, user service

### 2. **Supporting Services**

#### Notification Service
- **Responsibilities**: Email notifications, tenant invitations
- **Database**: Shared notification database
- **APIs**: `/api/notifications/*`
- **Dependencies**: User service, tenant service

#### Analytics Service
- **Responsibilities**: Usage analytics, performance metrics
- **Database**: Analytics database (shared)
- **APIs**: `/api/analytics/*`
- **Dependencies**: All tenant-scoped services

#### Backup Service
- **Responsibilities**: Tenant data backup and restore
- **Database**: Backup storage (S3, etc.)
- **APIs**: `/api/backups/*`
- **Dependencies**: Tenant service, database service

## 📊 **Tenant Lifecycle Management**

### 1. **Tenant Creation Flow**

```typescript
interface TenantCreationFlow {
  1. ValidateTenantRequest(request: CreateTenantRequest): ValidationResult;
  2. CheckUserPermissions(userId: string): PermissionResult;
  3. CheckTenantLimits(userId: string): LimitResult;
  4. CreateTenantDatabase(tenantConfig: TenantConfig): DatabaseResult;
  5. InitializeTenantSchema(tenantId: string): SchemaResult;
  6. CreateTenantRecord(tenantData: TenantData): TenantResult;
  7. SendWelcomeNotification(tenantId: string): NotificationResult;
  8. LogTenantCreation(tenantId: string): AuditResult;
}
```

### 2. **Tenant Onboarding**

```typescript
interface TenantOnboarding {
  // Self-service onboarding
  POST /api/onboarding/register
  POST /api/onboarding/verify-email
  POST /api/onboarding/complete-setup
  
  // Admin onboarding
  POST /api/onboarding/invite-user
  POST /api/onboarding/assign-role
  POST /api/onboarding/configure-features
}
```

### 3. **Tenant Migration & Scaling**

```typescript
interface TenantMigration {
  // Database migration
  POST /api/tenants/:id/migrate-database
  POST /api/tenants/:id/upgrade-schema
  
  // Resource scaling
  POST /api/tenants/:id/scale-resources
  POST /api/tenants/:id/update-limits
  
  // Feature toggling
  POST /api/tenants/:id/enable-feature
  POST /api/tenants/:id/disable-feature
}
```

## 🔄 **Microservice Communication**

### 1. **Synchronous Communication**

```typescript
// HTTP API calls between services
class TenantService {
  async createTenant(data: CreateTenantData) {
    // 1. Create tenant record
    const tenant = await this.tenantRepository.create(data);
    
    // 2. Notify user service
    await this.userService.addTenantAccess(tenant.ownerId, tenant.id);
    
    // 3. Notify analytics service
    await this.analyticsService.trackTenantCreation(tenant.id);
    
    // 4. Send notification
    await this.notificationService.sendWelcomeEmail(tenant.ownerId, tenant.id);
    
    return tenant;
  }
}
```

### 2. **Asynchronous Communication**

```typescript
// Message queue events
interface TenantEvents {
  'tenant.created': {
    tenantId: string;
    ownerId: string;
    createdAt: Date;
  };
  
  'tenant.updated': {
    tenantId: string;
    changes: Record<string, any>;
    updatedAt: Date;
  };
  
  'tenant.deleted': {
    tenantId: string;
    deletedAt: Date;
  };
  
  'user.tenant.joined': {
    userId: string;
    tenantId: string;
    role: string;
    joinedAt: Date;
  };
}
```

### 3. **Event-Driven Architecture**

```typescript
// Event handlers
class TenantEventHandler {
  @EventHandler('tenant.created')
  async handleTenantCreated(event: TenantCreatedEvent) {
    // Initialize tenant-specific services
    await this.initializeTenantServices(event.tenantId);
    
    // Set up monitoring
    await this.setupTenantMonitoring(event.tenantId);
    
    // Create default configurations
    await this.createDefaultConfigurations(event.tenantId);
  }
  
  @EventHandler('tenant.deleted')
  async handleTenantDeleted(event: TenantDeletedEvent) {
    // Clean up tenant data
    await this.cleanupTenantData(event.tenantId);
    
    // Remove monitoring
    await this.removeTenantMonitoring(event.tenantId);
    
    // Archive tenant data
    await this.archiveTenantData(event.tenantId);
  }
}
```

## 📈 **Monitoring & Observability**

### 1. **Tenant Metrics**

```typescript
interface TenantMetrics {
  // Resource usage
  databaseConnections: number;
  apiRequests: number;
  storageUsed: number;
  
  // Performance metrics
  responseTime: number;
  errorRate: number;
  throughput: number;
  
  // Business metrics
  activeUsers: number;
  dataRecords: number;
  featureUsage: Record<string, number>;
}
```

### 2. **Health Checks**

```typescript
interface TenantHealthCheck {
  tenantId: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    database: HealthStatus;
    api: HealthStatus;
    storage: HealthStatus;
    features: HealthStatus;
  };
  lastChecked: Date;
  issues: string[];
}
```

## 🚀 **Implementation Roadmap**

### Phase 1: Foundation (Weeks 1-2)
- [ ] Design tenant database schema
- [ ] Implement basic tenant CRUD APIs
- [ ] Set up tenant context middleware
- [ ] Create tenant management UI

### Phase 2: Isolation (Weeks 3-4)
- [ ] Implement database-per-tenant strategy
- [ ] Add tenant-scoped resource APIs
- [ ] Implement JWT with tenant context
- [ ] Add tenant switching functionality

### Phase 3: Advanced Features (Weeks 5-6)
- [ ] Implement tenant invitations
- [ ] Add tenant analytics and monitoring
- [ ] Create tenant backup/restore
- [ ] Add tenant limits and quotas

### Phase 4: Microservices (Weeks 7-8)
- [ ] Split into microservices
- [ ] Implement service communication
- [ ] Add event-driven architecture
- [ ] Set up monitoring and observability

### Phase 5: Production Ready (Weeks 9-10)
- [ ] Performance optimization
- [ ] Security hardening
- [ ] Load testing
- [ ] Documentation and training

## 🔒 **Production Security Framework**

### **Security Architecture Overview**
This section defines a comprehensive security framework for production deployment of the multi-tenant address book system. All security controls must be implemented before launch with assigned ownership, monitoring thresholds, and operational runbooks.

---

## **1. Per-Tenant Rate Limiting & Quotas**

### **Implementation Strategy**
- **Token Bucket Algorithm**: Implement per-tenant rate limiting with configurable burst capacity
- **Tiered Quotas**: Bronze (100 req/min), Silver (500 req/min), Gold (2000 req/min), Enterprise (unlimited)
- **Resource Quotas**: API calls, storage usage, concurrent connections, data export limits

### **Enforcement Mechanisms**
```typescript
// Rate limiting configuration per tenant tier
interface TenantQuotas {
  requestsPerMinute: number;
  storageQuotaGB: number;
  concurrentConnections: number;
  dataExportLimitMB: number;
  burstCapacity: number;
}

// Real-time monitoring and enforcement
const rateLimiter = new TenantRateLimiter({
  redis: redisClient,
  defaultQuota: 'bronze',
  enforcementMode: 'hard' // vs 'soft' for monitoring
});
```

### **Monitoring & Alerting**
- **Thresholds**: 80% quota usage → warning, 95% → alert, 100% → block
- **Metrics**: Request rate, quota utilization, violation patterns
- **Owners**: Platform Engineering Team
- **Runbook**: `docs/security/rate-limiting-incident-response.md`

### **DDoS Protection**
- **Layer 1**: Cloudflare/WAF with tenant-aware rules
- **Layer 2**: Application-level rate limiting with Redis
- **Layer 3**: Database connection pooling and query throttling
- **Emergency**: Circuit breakers and tenant isolation

---

## **2. Encryption Key Management**

### **Key Management Service (KMS) Integration**
```typescript
interface EncryptionConfig {
  keyProvider: 'aws-kms' | 'azure-keyvault' | 'gcp-kms';
  keyRotationPeriod: '90d' | '180d' | '365d';
  keyEscrow: boolean;
  backupKeys: string[];
}

// Per-tenant encryption keys
const tenantEncryption = {
  dataKey: await kms.generateDataKey(tenantId),
  masterKey: await kms.getMasterKey(tenantId),
  rotationSchedule: 'quarterly'
};
```

### **Key Rotation Strategy**
- **Frequency**: Quarterly rotation for data keys, annual for master keys
- **Automation**: Scheduled rotation with 30-day overlap period
- **Emergency Revocation**: Immediate key revocation capability
- **Backup Keys**: Secure escrow with 3-of-5 threshold cryptography

### **Access Controls**
- **Key Access**: Role-based with MFA requirement
- **Audit Trail**: All key operations logged with immutable records
- **Separation**: Development, staging, production key hierarchies
- **Owners**: Security Engineering Team
- **Runbook**: `docs/security/key-rotation-procedures.md`

### **Compliance Requirements**
- **FIPS 140-2 Level 3**: Hardware security modules for key storage
- **SOC 2**: Key access logging and monitoring
- **GDPR**: Right to be forgotten with key destruction procedures

---

## **3. Data Residency & Sovereignty**

### **Regional Storage Configuration**
```typescript
interface DataResidencyConfig {
  region: 'us-east-1' | 'eu-west-1' | 'ap-southeast-1';
  dataSovereignty: 'strict' | 'flexible';
  crossRegionReplication: boolean;
  dataRetention: {
    active: '7y';
    archived: '10y';
    deleted: 'immediate';
  };
}

// Tenant-specific data residency
const tenantDataConfig = {
  'tenant-eu': { region: 'eu-west-1', sovereignty: 'strict' },
  'tenant-us': { region: 'us-east-1', sovereignty: 'flexible' }
};
```

### **GDPR/CCPA Compliance**
- **Data Export**: Automated data export in JSON/CSV formats
- **Data Deletion**: Secure deletion with cryptographic erasure
- **Consent Management**: Granular consent tracking per data type
- **Right to Portability**: Standardized data export APIs

### **Cross-Border Data Transfer**
- **Standard Contractual Clauses**: EU-US data transfer agreements
- **Adequacy Decisions**: Country-specific data transfer approvals
- **Data Processing Agreements**: Tenant-specific DPA templates
- **Owners**: Legal & Compliance Team
- **Runbook**: `docs/compliance/data-residency-procedures.md`

---

## **4. Secrets Rotation Strategy**

### **Rotation Schedule**
```typescript
interface SecretsRotation {
  databaseCredentials: '30d';
  apiKeys: '90d';
  jwtSecrets: '180d';
  encryptionKeys: '365d';
  certificates: '90d';
}

// Automated rotation pipeline
const rotationPipeline = {
  detection: 'vault-secrets-engine',
  rotation: 'automated-scripts',
  validation: 'health-checks',
  rollback: 'previous-version-restore'
};
```

### **Automation Framework**
- **Vault Integration**: HashiCorp Vault for secrets management
- **Rotation Triggers**: Time-based and event-based rotation
- **Validation**: Automated testing of new credentials
- **Rollback**: Automatic rollback on rotation failure

### **Emergency Procedures**
- **Immediate Revocation**: 5-minute response time for compromised secrets
- **Incident Response**: 24/7 on-call rotation for security incidents
- **Communication**: Slack alerts + PagerDuty escalation
- **Owners**: DevOps Security Team
- **Runbook**: `docs/security/secrets-emergency-procedures.md`

---

## **5. Comprehensive Audit Trail**

### **Events to Log**
```typescript
interface AuditEvent {
  timestamp: string;
  tenantId: string;
  userId: string;
  eventType: 'auth' | 'data_access' | 'data_modification' | 'config_change';
  resource: string;
  action: string;
  result: 'success' | 'failure';
  ipAddress: string;
  userAgent: string;
  metadata: Record<string, any>;
}

// Critical audit events
const auditEvents = {
  authentication: ['login', 'logout', 'mfa_attempt', 'password_change'],
  dataAccess: ['read', 'export', 'search', 'view'],
  dataModification: ['create', 'update', 'delete', 'bulk_operation'],
  configuration: ['tenant_creation', 'user_management', 'permission_change']
};
```

### **Retention & Storage**
- **Retention Period**: 7 years for compliance, 1 year for operational
- **Storage**: Immutable audit logs in S3 with versioning
- **Encryption**: AES-256 encryption for audit data at rest
- **Integrity**: Cryptographic hashing for tamper detection

### **Tamper-Evident Controls**
- **Blockchain**: Immutable audit log hashing
- **Digital Signatures**: Cryptographic signing of audit entries
- **Chain of Custody**: Complete audit trail integrity
- **Owners**: Security Operations Center (SOC)
- **Runbook**: `docs/security/audit-trail-management.md`

---

## **6. Least-Privilege Access Model**

### **Default-Deny Architecture**
```typescript
interface AccessPolicy {
  defaultAction: 'deny';
  explicitAllow: boolean;
  roleHierarchy: string[];
  approvalWorkflow: boolean;
}

// Role definitions with minimal permissions
const roles = {
  'tenant-admin': ['tenant:manage', 'users:manage'],
  'tenant-user': ['contacts:read', 'contacts:write'],
  'tenant-viewer': ['contacts:read'],
  'system-admin': ['system:manage', 'audit:read']
};
```

### **Approval Workflows**
- **Privilege Escalation**: Manager approval for elevated permissions
- **Temporary Access**: Time-limited access with automatic revocation
- **Emergency Access**: Break-glass procedures with post-access review
- **Access Reviews**: Quarterly access certification process

### **Periodic Access Review**
- **Frequency**: Quarterly for all users, monthly for privileged accounts
- **Automation**: Automated access review workflows
- **Certification**: Manager certification of user access
- **Owners**: Identity & Access Management Team
- **Runbook**: `docs/security/access-review-procedures.md`

---

## **7. Cross-Tenant Isolation Validation**

### **Testing Framework**
```typescript
interface IsolationTest {
  testType: 'data_leakage' | 'privilege_escalation' | 'resource_isolation';
  tenantA: string;
  tenantB: string;
  expectedResult: 'isolated';
  testData: any;
}

// Automated isolation testing
const isolationTests = {
  dataAccess: 'tenant-A cannot access tenant-B data',
  resourceQuotas: 'tenant-A cannot consume tenant-B resources',
  configuration: 'tenant-A cannot modify tenant-B settings'
};
```

### **Runtime Integrity Checks**
- **Continuous Monitoring**: Real-time isolation validation
- **Anomaly Detection**: ML-based detection of isolation violations
- **Automated Testing**: Daily isolation test execution
- **Incident Response**: Immediate alerting on isolation failures

### **Data Leakage Prevention**
- **Query Filtering**: Automatic tenant ID injection in all queries
- **API Validation**: Request-level tenant context verification
- **Network Isolation**: VPC-level tenant separation
- **Owners**: Security Engineering Team
- **Runbook**: `docs/security/isolation-incident-response.md`

---

## **8. Compliance Framework Mapping**

### **SOC 2 Type II Controls**
| Control Category | Implementation | Evidence Collection |
|------------------|----------------|-------------------|
| **CC6.1** - Logical Access | RBAC + MFA | Access logs, MFA reports |
| **CC6.2** - Authentication | JWT + session management | Auth logs, session data |
| **CC6.3** - Authorization | Permission-based access | Permission matrices |
| **CC6.7** - Data Transmission | TLS 1.3 encryption | Network logs, certs |
| **CC6.8** - Data Disposal | Secure deletion | Deletion logs, certs |

### **HIPAA Compliance (Healthcare Tenants)**
- **Administrative Safeguards**: Security officer designation, workforce training
- **Physical Safeguards**: Data center security, workstation controls
- **Technical Safeguards**: Access controls, audit logs, data encryption
- **Business Associate Agreements**: Required for all third-party integrations

### **PCI-DSS Compliance (Payment Tenants)**
- **Card Data Protection**: No storage of card data, tokenization only
- **Network Security**: Firewall rules, network segmentation
- **Access Control**: Unique IDs, MFA, regular access reviews
- **Monitoring**: Continuous monitoring of card data access

### **Evidence Collection Automation**
```typescript
interface ComplianceEvidence {
  controlId: string;
  evidenceType: 'log' | 'report' | 'certificate' | 'screenshot';
  collectionFrequency: 'real-time' | 'daily' | 'weekly' | 'monthly';
  retentionPeriod: string;
  responsibleTeam: string;
}
```

### **Compliance Monitoring**
- **Real-time Dashboards**: SOC 2, HIPAA, PCI-DSS compliance status
- **Automated Reporting**: Monthly compliance reports
- **Gap Analysis**: Quarterly compliance assessments
- **Owners**: Compliance & Risk Management Team
- **Runbook**: `docs/compliance/evidence-collection-procedures.md`

---

## **Security Implementation Roadmap**

### **Pre-Launch Requirements**
- [ ] All security controls implemented and tested
- [ ] Security team training completed
- [ ] Incident response procedures validated
- [ ] Compliance evidence collection automated
- [ ] Security monitoring dashboards operational

### **Post-Launch Monitoring**
- [ ] 24/7 security operations center
- [ ] Automated threat detection
- [ ] Regular security assessments
- [ ] Continuous compliance monitoring
- [ ] Quarterly security reviews

### **Emergency Contacts**
- **Security Team Lead**: security-lead@company.com
- **Incident Response**: +1-XXX-XXX-XXXX
- **Compliance Officer**: compliance@company.com
- **Legal Team**: legal@company.com

---

This comprehensive security framework ensures production-ready security controls with clear ownership, monitoring, and operational procedures. All security measures must be implemented and validated before system launch.

This architecture provides a solid foundation for scalable, secure, multi-tenant microservices while maintaining clear service boundaries and proper isolation.
