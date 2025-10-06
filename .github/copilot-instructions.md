# Copilot Instructions for Actix Web REST API with Multi-Tenancy

## Architecture Overview

This is a **multi-tenant REST API** built with Actix Web (Rust) and React (TypeScript), featuring complete database isolation per tenant. The system uses JWT tokens to route requests to tenant-specific database connections.

### Multi-Tenant Design Pattern
```
Main DB (shared config) → Tenants table with db_url
                       ↓
JWT Token → Middleware extracts tenant_id → TenantPoolManager routes to tenant DB
```

**Critical:** Each tenant operates on a **separate database connection**. The `TenantPoolManager` (`src/config/db.rs`) maintains an `Arc<RwLock<HashMap<String, Pool>>>` for thread-safe tenant pool management. JWT tokens include `tenant_id` claims that determine database routing.

## Project Structure

### Backend (Rust/Actix Web)
- **`src/main.rs`**: App initialization, CORS configuration (environment-aware), middleware stack
- **`src/config/db.rs`**: `TenantPoolManager` - core multi-tenant connection pooling logic
- **`src/middleware/auth_middleware.rs`**: JWT validation + tenant pool injection into request extensions
- **`src/api/`**: Controllers follow pattern: `async fn -> Result<HttpResponse, ServiceError>`
- **`src/services/`**: Business logic layer, extracts pool via `web::Data<Pool>`
- **`src/models/`**: Diesel ORM models with `Queryable`, `Insertable`, `AsChangeset` traits
- **`src/schema.rs`**: Auto-generated Diesel schema (run `diesel migration run` after DB changes)

### Frontend (React/TypeScript/Bun)
- **Runtime**: Use Bun for all package management and script execution (see `frontend/.cursor/rules/`)
- **`frontend/src/contexts/AuthContext.tsx`**: JWT decoding, token refresh, tenant context management
- **`frontend/src/services/api.ts`**: API client with automatic tenant header injection (`x-tenant-id`)
- **Build Tool**: Vite 5+ with HMR (NOT webpack/CRA)
- **UI Library**: Ant Design 5.27.4+ (NOT Material-UI or custom components)
- **Forms**: React Hook Form 7.x with Ant Design integration

## Development Workflows

### Backend Development
```bash
# Run migrations (required after any DB schema change)
diesel migration run

# Development mode with hot reload
cargo watch -x run

# Build optimized release binary
cargo build --release  # See Cargo.toml for aggressive optimization profile
```

### Frontend Development
```bash
cd frontend
bun install              # NEVER use npm/yarn/pnpm
bun run dev              # Starts Vite dev server on :3000
NODE_ENV=production bun run dev  # Test production mode
```

### Database Management
```bash
# Create new migration
diesel migration generate <name>

# Rollback last migration
diesel migration revert

# Connect to main DB (for tenant config)
psql $DATABASE_URL

# Tenant isolation test: each tenant should only see their own data
```

## Critical Conventions

### Backend Patterns

**Error Handling**: Use `ServiceError` enum (`src/error.rs`) with proper HTTP status codes:
```rust
Err(ServiceError::NotFound { 
    error_message: format!("Person with id {} not found", id) 
})
```

**Response Format**: Always wrap responses in `ResponseBody`:
```rust
HttpResponse::Ok().json(ResponseBody::new(constants::MESSAGE_OK, data))
```

**Constants**: Use `src/constants.rs` constants (e.g., `MESSAGE_OK`, `IGNORE_ROUTES`) - never hardcode strings.

**Pool Extraction**: In tenant-aware endpoints, extract pool from request extensions:
```rust
let pool = req.extensions().get::<Pool>().cloned()
    .ok_or_else(|| ServiceError::Unauthorized { error_message: "No tenant context".into() })?;
```

**Authentication Bypass**: Routes in `IGNORE_ROUTES` skip auth middleware (e.g., `/api/auth/login`, `/api/ping`).

### Frontend Patterns

**API Calls**: Always use service layer (`frontend/src/services/api.ts`), never direct `fetch`:
```typescript
const response = await authService.login(credentials);  // Handles tenant headers automatically
```

**JWT Handling**: `AuthContext` decodes JWTs client-side to extract `tenant_id` and `user`. Token refresh is automatic.

**Type Safety**: All API responses use `ApiResponseWrapper<T>` interface. Define types in `frontend/src/types/`.

**Bun-Specific**: Bun auto-loads `.env` files - do NOT use `dotenv` package.

## Integration Points

### CORS Configuration
Located in `src/main.rs`, environment-aware:
- **Development**: Wildcard + explicit localhost/Vite ports (`:3000`, `:5173`)
- **Production**: Restrictive, reads `CORS_ALLOWED_ORIGINS` env var (comma-separated)

Always includes `x-tenant-id` in allowed headers.

### JWT Token Structure
```json
{
  "user": "username",
  "tenant_id": "tenant1",
  "exp": 1234567890,
  "iat": 1234567800
}
```

Tokens are validated in `src/utils/token_utils.rs` using `JWT_SECRET` from env.

### Database Migrations
Diesel migrations in `migrations/` directory. **CRITICAL**: Run migrations before starting server after pulling schema changes.

### Redis Usage
Used for session management and health monitoring. Connection initialized in `src/config/cache.rs`.

## Testing

### Backend Tests
```bash
cargo test  # Uses testcontainers for PostgreSQL
```

Tests follow pattern: Spin up Postgres container → Run migrations → Test endpoints → Teardown.

See `src/api/address_book_controller.rs::tests` for examples with JWT auth.

### Frontend Tests
```bash
cd frontend
bun test                # Run all tests
bun test --watch        # Watch mode
```

Use Bun's built-in test runner (Jest-compatible), NOT Jest or Vitest directly.

## Common Pitfalls

1. **Tenant Isolation**: Never query databases directly - always use pool from `TenantPoolManager` or request extensions
2. **Diesel Schema**: After adding migrations, regenerate schema with `diesel migration run` (updates `schema.rs`)
3. **JWT Expiration**: Frontend auto-refreshes tokens, but backend must handle expired tokens gracefully
4. **CORS in Production**: Must set `CORS_ALLOWED_ORIGINS` env var, wildcard is disabled
5. **Bun vs Node**: Frontend uses Bun runtime - commands like `node` will fail, use `bun` instead
6. **Pool Unwrap**: Avoid `.unwrap()` on pool connections in production - use proper error handling
7. **Migration Rollback**: Always test `down.sql` works before deploying migrations
8. **Frontend Mock Data**: Address book currently uses mock data - backend integration pending (Phase 2)

## Key Files Reference

- **Multi-tenant logic**: `src/config/db.rs::TenantPoolManager`
- **Auth flow**: `src/middleware/auth_middleware.rs` + `frontend/src/contexts/AuthContext.tsx`
- **Environment config**: `.env` (backend), `frontend/.env` (Vite vars must start with `VITE_`)
- **API routing**: `src/config/app.rs::config_services`
- **Error types**: `src/error.rs::ServiceError`
- **Frontend types**: `frontend/src/types/auth.ts`, `frontend/src/types/contact.ts`

## Current Development Phase

**Phase 1 Complete**: Full architecture in place with mock data in frontend.

**Phase 2 (In Progress)**: Connect frontend API service layer to real backend endpoints. Remove mock data, implement proper error boundaries, add comprehensive tests.

When implementing Phase 2 features, prioritize:
1. Replacing mock services in `frontend/src/services/api.ts` with real API calls
2. Adding proper error handling for API failures
3. Updating service layer to handle backend response structures
