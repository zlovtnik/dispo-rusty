# Actix Web REST API with JWT and Multi-Tenancy

A robust, production-ready REST API built with Actix Web, featuring JWT authentication, multi-tenant database isolation, and a modern Astro frontend. This application demonstrates advanced Rust backend patterns with PostgreSQL, Redis caching, and comprehensive security features.

## 🚀 Features

### Backend (Rust/Actix Web)
- **Multi-Tenant Architecture**: Complete database isolation per tenant with thread-safe connection management
- **JWT Authentication**: Secure token-based authentication with tenant context
- **PostgreSQL Integration**: Diesel ORM with r2d2 connection pooling
- **Redis Caching**: Session management and health monitoring
- **Middleware**: CORS, authentication, logging
- **Migration Support**: Database schema management via Diesel
- **Health Checks**: Comprehensive monitoring endpoints
- **Error Handling**: Structured error responses with proper HTTP status codes
- **Logging**: Configurable logging with file and console output

### Frontend (Astro/React)
- **Modern Framework**: Astro for optimized static generation
- **Component Architecture**: Modular Astro components
- **Authentication Flow**: Secure login/signup/logout
- **Contact Management**: Full CRUD operations for address book
- **Responsive Design**: Mobile-friendly CSS with variables
- **Security**: CSP headers, nonce-based script protection
- **Input Validation**: Client-side form validation
- **Type Safety**: TypeScript integration

## 🏗️ Architecture

### Multi-Tenant Design
```
┌─────────────────┐    ┌─────────────────┐
│   Main DB       │    │ Tenant 1 DB     │
│ (Shared Config) │    │ (Tenant Data)   │
│  ┌────────────┐ │    │  ┌────────────┐ │
│  │ Tenants    │ │    │  │ Users      │ │
│  │ db_url     │ │    │  │ Contacts   │ │
│  └────────────┘ │    │  └────────────┘ │
└─────────────────┘    └─────────────────┘
         │                       │
         └───────────────────────┘
              JWT Token Flow
```

- **Tenant Configuration**: Stored in main PostgreSQL database
- **Data Isolation**: Each tenant operates on separate database connections
- **Security**: Complete separation prevents data leakage between tenants
- **Authentication**: JWT tokens include tenant identity for routing

### Technology Stack

#### Backend
```
Rust 1.x + Actix Web 4.x
├── Diesel (ORM) + r2d2 (Connection Pooling)
├── JWT (jsonwebtoken)
├── Redis (redis crate)
├── PostgreSQL
└── log/env_logger
```

#### Frontend
```
Astro 4.x + React
├── TypeScript
├── CSS Variables (Theme-able)
├── CSP with Nonce
├── Form Validation
└── Responsive Design
```

## 📋 Prerequisites

- **Rust**: 1.70+ with wasm-pack for frontend
- **PostgreSQL**: 13+ with development database
- **Redis**: 6+ for caching and sessions
- **Diesel CLI**: `cargo install diesel_cli --no-default-features --features postgres`
- **Node.js**: 18+ for frontend tooling

## 🚀 Quick Start

### 1. Clone and Setup Backend

```bash
git clone https://github.com/zlovtnik/actix-web-rest-api-with-jwt.git
cd actix-web-rest-api-with-jwt

# Copy environment files
cp .env.example .env
cp frontend/.env.example frontend/.env
```

### 2. Configure Environment

Edit `.env`:
```env
# Database
DATABASE_URL=postgres://user:password@localhost/rust_rest_api_db
REDIS_URL=redis://127.0.0.1:6379

# JWT
JWT_SECRET=your-super-secret-jwt-key-here

# Application
APP_HOST=0.0.0.0
APP_PORT=8080
LOG_FILE=logs/app.log

# Frontend
PUBLIC_API_BASE_URL=http://localhost:8080/api
```

Edit `frontend/.env`:
```env
PUBLIC_API_BASE_URL=http://localhost:8080/api
```

### 3. Setup Database

```bash
# Run migrations
diesel migration run

# Seed initial tenant data (optional)
psql -d rust_rest_api_db -f scripts/seed_tenants.sql
```

### 4. Run Backend

```bash
# Development
cargo run

# Production build
cargo build --release
./target/release/actix-web-rest-api-with-jwt
```

### 5. Setup and Run Frontend

```bash
# Install dependencies
yarn install
# or
npm install

# Development
yarn dev
# or
npm run dev

# Production build
yarn build
# or
npm run build
```

## 🔐 Multi-Tenant Authentication

### Signup/Login Flow
1. Client provides `tenant_id` in request body
2. Backend validates tenant exists in main DB
3. User credentials verified against tenant's database
4. JWT token generated with tenant context
5. Subsequent requests automatically routed to correct tenant DB

### Example API Usage

```bash
# Signup (include tenant_id)
curl -X POST http://localhost:8080/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "email": "admin@tenant1.com",
    "password": "securepass",
    "tenant_id": "tenant1"
  }'

# Login (tenant must exist)
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username_or_email": "admin",
    "password": "securepass",
    "tenant_id": "tenant1"
  }'

# Response includes JWT token
{
  "message": "Login successful",
  "data": {
    "token": "eyJ...",
    "token_type": "bearer",
    "tenant_id": "tenant1"
  }
}

# Authenticated request (token automatically routes to tenant1 DB)
curl -X GET http://localhost:8080/api/auth/me \
  -H "Authorization: Bearer eyJ..."
```

## 🗂️ API Endpoints

### Authentication
- `POST /api/auth/signup` - User registration with tenant validation
- `POST /api/auth/login` - Login with tenant context
- `POST /api/auth/logout` - Logout and clear session
- `GET /api/auth/me` - Get authenticated user info

### Address Book (Authenticated, Tenant-Scoped)
- `GET /api/address-book` - List contacts
- `POST /api/address-book` - Create contact
- `PUT /api/address-book/{id}` - Update contact
- `DELETE /api/address-book/{id}` - Delete contact
- `GET /api/address-book/filter/{query}` - Search contacts

### Monitoring
- `GET /api/health` - Health check (with auth status)
- `GET /api/ping` - Simple ping (JSON: {"message":"pong"})

### Admin (Main Tenant DB)
- `GET /api/admin/tenants` - List all tenants
- `POST /api/admin/tenants` - Create tenant

## 🔒 Security Features

### Backend Security
- **JWT Authentication**: Bearer token validation with tenant isolation
- **CORS**: Configured origins and headers
- **Input Validation**: Comprehensive request validation
- **SQL Injection Prevention**: Diesel ORM parameter binding
- **Session Management**: Secure session handling with Redis
- **Password Hashing**: bcrypt for secure password storage

### Frontend Security
- **Content Security Policy**: Nonce-based script protection
- **HSTS Headers**: HTTPS enforcement
- **Input Sanitization**: Proper form validation
- **Token Storage**: Defensively handled localStorage
- **CSP Nonce**: Runtime-generated nonces for scripts

## 🎨 Frontend Features

### Modern UX Enhancements
- **Form Validation**: Real-time input validation with patterns
- **Autocomplete**: Proper browser hints for login/signup
- **Responsive Design**: Mobile-first CSS with variables
- **Theming**: CSS custom properties for easy customization
- **Async Interactions**: Non-blocking confirmations and updates

### Component Architecture
```
frontend/src/
├── components/
│   ├── AddressBook.astro     # Main book interface
│   ├── ContactItem.astro     # Individual contact
│   ├── Header.astro          # Navigation
│   ├── LoginForm.astro       # Authentication
│   └── SignupForm.astro      # Registration
├── layouts/
│   └── BaseLayout.astro      # App shell
├── pages/
│   └── index.astro           # Home page
└── utils/
    ├── api.ts                # API client
    ├── auth.ts               # Auth management
    └── utils.ts              # UI helpers
```

### Key UX Improvements

#### Form Enhancements
- **Pattern Validation**: Gender field accepts `[MFmf]`
- **Range Constraints**: Age 1-120
- **Autocomplete Attributes**: Browser-assisted form filling
- **Password Confirmation**: Client-side matching validation

#### Interaction Design
- **Button Types**: Explicit `type="button"` for non-submit actions
- **Async Confirmations**: Custom dialog fallback to native confirm
- **Safe DOM Updates**: Text nodes instead of innerHTML
- **Loading States**: Visual feedback for operations

#### Security & Performance
- **CSP with Nonce**: Runtime script protection
- **Timeout Handling**: Request timeout configuration
- **Defensive Storage**: Safe localStorage access
- **Error Boundaries**: Comprehensive error messaging

## 🧪 Testing

### Backend Tests
```bash
# Run all tests
cargo test

# Run with coverage
cargo tarpaulin --release

# Integration tests
cargo run --test integration
```

### Frontend Tests
```bash
# Unit tests
yarn test

# E2E tests (if configured)
yarn e2e
```

## 📊 Health Monitoring

### Health Check Endpoint
```
GET /api/health

# Response
{
  "status": "healthy",
  "database": "connected",
  "redis": "connected",
  "tenants_loaded": 3
}
```

### Logging
- **Console Logging**: Development with colors
- **File Logging**: Production with rotation
- **Structured Logs**: Request/response details
- **Error Tracking**: Comprehensive error context

## 🔧 Configuration

### Environment Variables
```env
# Database
DATABASE_URL=postgres://user:password@localhost/dbname
REDIS_URL=redis://127.0.0.1:6379

# JWT Configuration
JWT_SECRET=your-secret-key-here
MAX_AGE=604800    # 7 days in seconds

# Application
APP_HOST=0.0.0.0
APP_PORT=8080
LOG_FILE=logs/app.log

# CORS
CORS_ORIGINS=http://localhost:3000,http://localhost:4321
CORS_CREDENTIALS=true

# Frontend
PUBLIC_API_BASE_URL=http://localhost:8080/api
```

### Database Migrations

```bash
# List pending migrations
diesel migration pending

# Run migrations
diesel migration run

# Revert latest
diesel migration revert

# Redo latest
diesel migration redo
```

## 🐳 Docker Deployment

### Backend Container
```dockerfile
FROM rust:1.70-slim AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
RUN cargo build --release

FROM debian:bullseye-slim
RUN apt-get update && apt-get install -y libpq5 ca-certificates
COPY --from=builder /app/target/release/actix-web-rest-api-with-jwt /usr/local/bin/
CMD ["/usr/local/bin/actix-web-rest-api-with-jwt"]
```

### Docker Compose
```yaml
version: '3.8'
services:
  api:
    build: .
    ports:
      - "8080:8080"
    environment:
      - DATABASE_URL=postgres://user:pass@db/dbname
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis

  frontend:
    build: ./frontend
    ports:
      - "4321:4321"

  db:
    image: postgres:15
    environment:
      POSTGRES_DB: rust_rest_api_db

  redis:
    image: redis:7-alpine
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/awesome-feature`)
3. Add tests for new functionality
4. Ensure all tests pass (`cargo test`)
5. Update documentation as needed
6. Submit a pull request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Actix Web team for the excellent framework
- Diesel team for the ORM
- Astro team for the frontend framework
- PostgreSQL and Redis communities

---

Built with ❤️ using Rust, Actix Web, and Astro
