# Tenant-Scoped API Endpoints

## Overview

This document defines the comprehensive API endpoints for tenant management, following RESTful principles with proper tenant isolation and security.

## 🔐 **Authentication & Authorization**

### JWT Token Structure
```json
{
  "sub": "user_id",
  "tenant_id": "tenant_id",
  "tenant_role": "admin|manager|member|viewer",
  "permissions": ["read:contacts", "write:contacts", "admin:tenant"],
  "iat": 1640995200,
  "exp": 1641081600
}
```

### Tenant Context Middleware
```typescript
// Express middleware for tenant context
const tenantContext = (req: Request, res: Response, next: NextFunction) => {
  const token = extractJWT(req);
  const tenantId = token.tenant_id;
  
  // Validate tenant access
  if (!hasTenantAccess(token.sub, tenantId)) {
    return res.status(403).json({ error: 'Tenant access denied' });
  }
  
  // Set tenant context
  req.tenantId = tenantId;
  req.tenantRole = token.tenant_role;
  req.tenantPermissions = token.permissions;
  
  next();
};
```

## 🏢 **Tenant Management APIs**

### Core Tenant Operations

```typescript
// Tenant CRUD
POST   /api/tenants                    // Create tenant
GET    /api/tenants                    // List tenants (with pagination/filtering)
GET    /api/tenants/:id                // Get tenant details
PUT    /api/tenants/:id                // Update tenant
DELETE /api/tenants/:id                // Delete tenant
PATCH  /api/tenants/:id                // Partial update tenant
```

### Tenant Configuration

```typescript
// Tenant settings
GET    /api/tenants/:id/settings       // Get tenant settings
PUT    /api/tenants/:id/settings       // Update tenant settings
PATCH  /api/tenants/:id/settings       // Partial update settings

// Tenant limits
GET    /api/tenants/:id/limits         // Get tenant limits
PUT    /api/tenants/:id/limits         // Update tenant limits
POST   /api/tenants/:id/limits/reset   // Reset usage counters

// Tenant features
GET    /api/tenants/:id/features       // Get tenant features
PUT    /api/tenants/:id/features       // Update tenant features
POST   /api/tenants/:id/features/:feature/enable   // Enable feature
POST   /api/tenants/:id/features/:feature/disable  // Disable feature
```

### Tenant Health & Status

```typescript
// Health checks
GET    /api/tenants/:id/health         // Tenant health check
GET    /api/tenants/:id/status         // Tenant status
POST   /api/tenants/:id/health/check   // Manual health check

// Backup & restore
POST   /api/tenants/:id/backup         // Backup tenant data
GET    /api/tenants/:id/backups        // List backups
POST   /api/tenants/:id/restore        // Restore from backup
DELETE /api/tenants/:id/backups/:backupId  // Delete backup
```

## 👥 **User-Tenant Management APIs**

### User-Tenant Associations

```typescript
// User-tenant relationships
GET    /api/tenants/:id/users          // List tenant users
POST   /api/tenants/:id/users          // Add user to tenant
GET    /api/tenants/:id/users/:userId  // Get user in tenant
PUT    /api/tenants/:id/users/:userId  // Update user role/permissions
DELETE /api/tenants/:id/users/:userId  // Remove user from tenant

// Bulk operations
POST   /api/tenants/:id/users/bulk     // Bulk add users
PUT    /api/tenants/:id/users/bulk     // Bulk update users
DELETE /api/tenants/:id/users/bulk     // Bulk remove users
```

### Tenant Invitations

```typescript
// Invitation management
POST   /api/tenants/:id/invite         // Invite user to tenant
GET    /api/tenants/:id/invitations    // List pending invitations
GET    /api/invitations/:token         // Get invitation details
PUT    /api/invitations/:token/accept  // Accept invitation
DELETE /api/invitations/:token/decline // Decline invitation
DELETE /api/invitations/:token          // Cancel invitation
```

## 📊 **Tenant-Scoped Resource APIs**

### Contacts Management

```typescript
// Tenant-scoped contacts
GET    /api/tenants/:tenantId/contacts     // List tenant contacts
POST   /api/tenants/:tenantId/contacts     // Create contact in tenant
GET    /api/tenants/:tenantId/contacts/:id // Get tenant contact
PUT    /api/tenants/:tenantId/contacts/:id // Update tenant contact
DELETE /api/tenants/:tenantId/contacts/:id // Delete tenant contact
PATCH  /api/tenants/:tenantId/contacts/:id // Partial update contact

// Bulk operations
POST   /api/tenants/:tenantId/contacts/bulk     // Bulk create contacts
PUT    /api/tenants/:tenantId/contacts/bulk     // Bulk update contacts
DELETE /api/tenants/:tenantId/contacts/bulk     // Bulk delete contacts
POST   /api/tenants/:tenantId/contacts/import   // Import contacts
GET    /api/tenants/:tenantId/contacts/export   // Export contacts
```

### Users Management

```typescript
// Tenant-scoped users
GET    /api/tenants/:tenantId/users          // List tenant users
POST   /api/tenants/:tenantId/users          // Create user in tenant
GET    /api/tenants/:tenantId/users/:id       // Get tenant user
PUT    /api/tenants/:tenantId/users/:id       // Update tenant user
DELETE /api/tenants/:tenantId/users/:id       // Delete tenant user
```

## 📈 **Analytics & Metrics APIs**

### Usage Analytics

```typescript
// Tenant analytics
GET    /api/tenants/:id/analytics      // Get tenant analytics
GET    /api/tenants/:id/analytics/usage    // Usage analytics
GET    /api/tenants/:id/analytics/performance // Performance analytics
GET    /api/tenants/:id/analytics/users     // User analytics

// Metrics
GET    /api/tenants/:id/metrics        // Get tenant metrics
POST   /api/tenants/:id/metrics        // Record metric
GET    /api/tenants/:id/metrics/:metric // Get specific metric
```

### Reporting

```typescript
// Reports
GET    /api/tenants/:id/reports        // List available reports
GET    /api/tenants/:id/reports/:type  // Get specific report
POST   /api/tenants/:id/reports        // Generate custom report
GET    /api/tenants/:id/reports/:id/download // Download report
```

## 🔍 **Search & Filter APIs**

### Advanced Search

```typescript
// Search endpoints
POST   /api/tenants/:id/search         // Advanced search
GET    /api/tenants/:id/search/suggestions // Search suggestions
POST   /api/tenants/:id/search/save     // Save search query
GET    /api/tenants/:id/search/saved   // Get saved searches
DELETE /api/tenants/:id/search/saved/:id // Delete saved search

// Filter operations
GET    /api/tenants/:id/filters        // Get available filters
POST   /api/tenants/:id/filters        // Apply filters
GET    /api/tenants/:id/filters/preset // Get filter presets
POST   /api/tenants/:id/filters/preset // Save filter preset
```

## 📝 **Audit & Logging APIs**

### Audit Logs

```typescript
// Audit logging
GET    /api/tenants/:id/audit          // Get audit logs
GET    /api/tenants/:id/audit/:id      // Get specific audit entry
POST   /api/tenants/:id/audit          // Create audit entry
GET    /api/tenants/:id/audit/export   // Export audit logs
```

### Activity Logs

```typescript
// Activity tracking
GET    /api/tenants/:id/activity       // Get activity logs
GET    /api/tenants/:id/activity/:id   // Get specific activity
POST   /api/tenants/:id/activity       // Log activity
```

## 🔧 **System Management APIs**

### Tenant Operations

```typescript
// System operations
POST   /api/tenants/:id/migrate        // Migrate tenant data
POST   /api/tenants/:id/upgrade        // Upgrade tenant
POST   /api/tenants/:id/downgrade      // Downgrade tenant
POST   /api/tenants/:id/suspend        // Suspend tenant
POST   /api/tenants/:id/unsuspend      // Unsuspend tenant
POST   /api/tenants/:id/archive        // Archive tenant
POST   /api/tenants/:id/unarchive      // Unarchive tenant
```

### Database Management

```typescript
// Database operations
GET    /api/tenants/:id/database       // Get database info
POST   /api/tenants/:id/database/test // Test database connection
POST   /api/tenants/:id/database/migrate // Run database migrations
GET    /api/tenants/:id/database/schema // Get database schema
```

## 📡 **WebSocket Events**

### Real-time Notifications

```typescript
// WebSocket events
ws://api.domain.com/notifications

// Event types
{
  "type": "tenant_created",
  "data": { "tenant_id": "uuid", "name": "string" }
}

{
  "type": "tenant_updated", 
  "data": { "tenant_id": "uuid", "changes": {} }
}

{
  "type": "user_joined_tenant",
  "data": { "tenant_id": "uuid", "user_id": "uuid", "role": "string" }
}

{
  "type": "tenant_health_check",
  "data": { "tenant_id": "uuid", "status": "healthy|degraded|unhealthy" }
}
```

## 🛡️ **Security Considerations**

### Rate Limiting

```typescript
// Rate limiting by tenant
const rateLimits = {
  'basic': { requests: 1000, window: '1h' },
  'professional': { requests: 5000, window: '1h' },
  'enterprise': { requests: 50000, window: '1h' }
};
```

### Data Validation

```typescript
// Request validation middleware
const validateTenantRequest = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      res.status(400).json({ error: 'Validation failed', details: error });
    }
  };
};
```

### Tenant Isolation

```typescript
// Database connection per tenant
class TenantDatabaseManager {
  async getConnection(tenantId: string): Promise<DatabaseConnection> {
    const tenant = await this.getTenantConfig(tenantId);
    return await this.createConnection(tenant.db_url);
  }
  
  async executeQuery(tenantId: string, query: string, params: any[]) {
    const connection = await this.getConnection(tenantId);
    return connection.query(query, params);
  }
}
```

## 📋 **Request/Response Examples**

### Create Tenant

```typescript
// POST /api/tenants
{
  "name": "Acme Corporation",
  "db_url": "postgresql://user:pass@localhost:5432/acme_db",
  "settings": {
    "theme": "light",
    "timezone": "UTC"
  },
  "limits": {
    "max_users": 100,
    "max_contacts": 10000
  }
}

// Response
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Acme Corporation",
    "slug": "acme-corporation",
    "status": "active",
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

### List Tenant Contacts

```typescript
// GET /api/tenants/:id/contacts?page=1&limit=10&search=john
{
  "success": true,
  "data": {
    "contacts": [...],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 100,
      "pages": 10
    },
    "filters": {
      "search": "john",
      "status": "active"
    }
  }
}
```

### Tenant Analytics

```typescript
// GET /api/tenants/:id/analytics
{
  "success": true,
  "data": {
    "usage": {
      "users": 25,
      "contacts": 1500,
      "api_calls": 50000,
      "storage_used": "2.5GB"
    },
    "performance": {
      "response_time": 150,
      "uptime": 99.9,
      "error_rate": 0.1
    },
    "trends": {
      "users_growth": 15.5,
      "api_calls_growth": 25.3
    }
  }
}
```

This comprehensive API design provides full tenant isolation, security, and scalability while maintaining a clean, RESTful interface for frontend consumption.
