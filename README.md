# Actix Web REST API with JWT and Multi-Tenancy

A robust, production-ready REST API built with Actix Web, featuring JWT authentication, multi-tenant database isolation, and a modern React frontend. This application demonstrates advanced Rust backend patterns with a high-performance TypeScript React SPA frontend, PostgreSQL, Redis caching, and comprehensive security features.

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

### Frontend (React/TypeScript/Ant Design)
- **Modern Framework**: React 18.3.1+ with TypeScript 5.9+ for enterprise-grade development
- **Build Tool**: Vite 5.0+ with Bun runtime for exceptional development performance
- **UI Framework**: Ant Design 5.27.4+ enterprise-class component library
- **Form Management**: React Hook Form 7.x with Ant Design integration for optimal performance
- **Component Architecture**: Component-based React SPA with proper state management
- **Authentication Flow**: JWT-based authentication with automatic token refresh
- **Contact Management**: Full CRUD operations for address book (currently with mock data)
- **Multi-Tenant UI**: Tenant-aware frontend components with transparent data isolation
- **Responsive Design**: Mobile-first responsive design supporting all device types
- **Real-time Validation**: Comprehensive form validation with immediate user feedback
- **Type Safety**: Full TypeScript integration with strict type checking
- **Development Experience**: Hot Module Replacement (HMR) with sub-50ms updates

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

## 📈 Development Phase Status

### Current Phase: **Phase 1 - Foundation Complete**

We have successfully implemented a solid foundation with all core architectural components in place:

### ✅ **Completed Features (Phase 1)**
- **Technology Stack**: Full React/TypeScript/Bun/Ant Design implementation
- **Architecture**: Component-based React SPA with proper separation of concerns
- **Authentication**: JWT-based authentication with automatic token refresh
- **Multi-Tenancy**: Frontend context and headers for tenant isolation
- **CRUD Operations**: Complete Address Book functionality with mock data
- **UI/UX**: Ant Design integration with responsive, professional design
- **Form Validation**: Real-time validation using React Hook Form
- **Type Safety**: Full TypeScript integration with strict type checking

### 🔄 **Current State**
- **Backend Integration**: Comprehensive API service layer implemented but not yet connected to real endpoints
- **Data Management**: All CRUD operations functional with mock data
- **Development Experience**: Vite + Bun runtime with HMR providing exceptional development performance

### 🎯 **Next Steps (Phase 2 - Full API Integration)**

#### **Immediate Priorities (Week 1-2)**
1. **Connect Address Book to Real API Endpoints**
   - Replace mock data with actual backend API calls
   - Implement proper error handling for API failures
   - Update service layer to handle real API responses

2. **Remove Legacy Components**
   - Remove or update `PharmacyPagination.tsx` component
   - Clean up any unused or outdated components
   - Optimize component bundle size

#### **Phase 2 Features (Week 3-6)**
3. **Implement Remaining Features from Specifications**
   - Add internationalization (i18n) support
   - Implement advanced search and filtering
   - Add data export/import functionality

4. **Complete Testing Strategy**
   - Implement comprehensive unit tests for all components
   - Add integration tests for API interactions
   - Setup end-to-end testing pipeline

5. **Production Readiness**
   - Optimize bundle size and loading performance
   - Implement proper error boundaries and monitoring
   - Add progressive web app capabilities

### 🏗️ **Architecture Readiness**

| Component | Status | Details |
|-----------|--------|---------|
| **Frontend Architecture** | ✅ **Ready** | Component-based React SPA with TypeScript |
| **Authentication System** | ✅ **Ready** | JWT with multi-tenant support |
| **API Service Layer** | ✅ **Ready** | Comprehensive service layer for backend integration |
| **UI Component Library** | ✅ **Ready** | Ant Design with custom theming |
| **Form Management** | ✅ **Ready** | React Hook Form with Ant Design integration |
| **Backend API Connection** | 🔄 **In Progress** | Mock data currently, ready for real API connection |

### 🚀 **Migration Path to Phase 2**

1. **Data Layer Migration**: Replace mock services with real API calls
2. **Component Cleanup**: Remove legacy components and optimize imports
3. **Error Handling Enhancement**: Implement comprehensive error boundaries
4. **Testing Implementation**: Add full test coverage for production readiness
5. **Performance Optimization**: Bundle analysis and loading optimizations

This foundation provides a solid base for rapid Phase 2 implementation, with all architectural patterns established and ready for production deployment.

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
React 18.3.1+ + TypeScript 5.9+
├── Vite 5.0+ Build Tool
├── Bun 1.0+ Runtime
├── Ant Design 5.27.4+ UI Library
├── React Hook Form 7.x
├── Tailwind CSS 4.1.14+
├── PostCSS 8.5.6+
└── Enterprise Architecture
```

## 📋 Prerequisites

- **Rust**: 1.70+ with diesel_cli for database migrations
- **PostgreSQL**: 13+ with development database
- **Redis**: 6+ for caching and sessions
- **Diesel CLI**: `cargo install diesel_cli --no-default-features --features postgres`
- **Bun**: 1.0+ for frontend tooling (drop-in replacement for Node.js/npm)

## 🚀 Quick Start

### 1. Clone and Setup Backend

```bash
git clone https://github.com/zlovtnik/rcs
cd rcs

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
./target/release/rcs
```

### 5. Setup and Run Frontend

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
bun install

# Development (with hot reload)
bun run dev

# Production build
bun run build

# Preview production build
bun run preview
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
│   ├── AddressBook.tsx       # Main address book interface
│   ├── ContactForm.tsx       # Contact creation/editing forms
│   ├── Layout.tsx            # Main application layout
│   ├── LoginPage.tsx         # Authentication interface
│   ├── PrivateRoute.tsx      # Route protection component
│   └── ConfirmationModal.tsx # User confirmation dialogs
├── contexts/
│   ├── AuthContext.tsx       # Authentication state management
│   └── TenantContext.tsx     # Multi-tenant state management
├── pages/
│   ├── Dashboard.tsx         # Main dashboard page
│   ├── HomePage.tsx          # Landing page
│   ├── LoginPage.tsx         # Login interface
│   └── TenantsPage.tsx       # Tenant management
├── services/
│   └── api.ts                # REST API client with JWT auth
├── types/
│   ├── auth.ts              # Authentication type definitions
│   ├── contact.ts           # Contact/address type definitions
│   └── tenant.ts            # Tenant type definitions
├── styles/
│   └── index.css            # Global styles and Tailwind imports
└── utils/
    └── helpers.ts           # Utility functions
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

The application supports multiple deployment configurations for different environments.

### Multi-Stage Production Build

The `Dockerfile.github-action` provides a complete multi-stage build that includes both backend and frontend:

```dockerfile
# Stage 1: Build Rust backend
FROM rust:1.75-slim as rust-builder
# ... Rust compilation

# Stage 2: Build React frontend
FROM oven/bun:1-slim as frontend-builder
# ... Frontend build with Bun

# Stage 3: Runtime image with compiled assets
FROM debian:bookworm-slim
# ... Production optimized image
```

### Local Development Setup

For local development without requiring local database containers:

```yaml
version: '3'
services:
  address-book-api-local:
    build:
      context: .
      dockerfile: Dockerfile.local
    ports:
      - "8000:8000"
    env_file:
      - .env  # Contains remote DB connections
    environment:
      - APP_HOST=0.0.0.0
      - APP_PORT=8000
```

### Remote Database Configuration

The application is configured to use remote databases (PostgreSQL + Redis Cloud) instead of local containers:

```env
# Remote PostgreSQL (e.g., Neon, Supabase, AWS RDS)
DATABASE_URL=postgres://user:pass@host/database

# Remote Redis (e.g., Redis Cloud, AWS ElastiCache)
REDIS_URL=redis://default:pass@host:port
```

### GitHub Actions CI/CD

Automated builds are handled via GitHub Actions with caching and multi-platform support:

- **Rust Backend**: Compiled with release optimizations
- **React Frontend**: Built using Bun for fast compilation
- **Docker Image**: Published to Docker Hub with metadata
- **Security**: Build provenance attestation included

### Production Deployment Options


#### Option C: Cloud Platform (Railway, Render, Fly.io)
Deploy the Docker image directly to your preferred cloud platform using the published Docker Hub image.

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
- React team for the component framework
- Ant Design team for the enterprise UI library
- PostgreSQL and Redis communities

---

Built with ❤️ using Rust, Actix Web, and React
