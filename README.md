# dispo-rusty: The Enterprise Multi-Tenant API Starter

Built to solve real-world SaaS and managed platform pain points—compliance, scale, and speed—dispo-rusty is an open-source foundation for secure, high-performance, tenant-isolated REST API services. Whether you're a fast-moving founder, a platform CTO, or an enterprise engineering team, dispo-rusty helps you reduce costs, onboard clients instantly, and meet demanding security requirements from day zero.

🚀 **Database Isolation** | ⚡ **Enterprise Security** | 🤝 **Rapid Onboarding** | 🏗️ **Scale-Ready**

## Why dispo-rusty?

**The Problem**: Building multi-tenant SaaS platforms is hard. You need database isolation, security compliance, and the ability to scale—all while keeping development velocity high.

**The Solution**: dispo-rusty gives you a production-ready foundation that handles the complex stuff so you can focus on your business logic.

### What You Get Out of the Box

- **🔒 True Database Isolation**: Each tenant gets their own database—no data leakage possible
- **⚡ Blazing Fast**: Rust backend with sub-millisecond response times
- **🛡️ Security First**: JWT authentication, CORS protection, input validation
- **🎨 Modern Frontend**: React + TypeScript with Ant Design components
- **🐳 Production Ready**: Docker containers, health checks, monitoring
- **📈 Built to Scale**: Connection pooling, caching, and tenant-aware routing

## The Tech Stack

### Backend (Rust + Actix Web)
- **Database**: PostgreSQL with Diesel ORM for type-safe queries
- **Authentication**: JWT tokens with tenant context built-in
- **Caching**: Redis for sessions and performance
- **Connection Pooling**: r2d2 for efficient database connections
- **Logging**: Structured logging with file rotation

### Frontend (React + TypeScript)
- **Framework**: React 18 with TypeScript for type safety
- **Build Tool**: Vite + Bun for lightning-fast development
- **UI Library**: Ant Design for professional components
- **Forms**: React Hook Form with real-time validation
- **State**: Context API for global state management

## How It Works

### Multi-Tenant Architecture

Each tenant gets their own database. When a user logs in, their JWT token includes their `tenant_id`. Every API request automatically routes to the correct database.

```text
┌─────────────────────┐    ┌─────────────────────┐
│   Main Database     │    │ Tenant Database     │
│  (Configuration)    │    │  (Isolated Data)    │
│  ┌────────────────┐ │    │  ┌────────────────┐ │
│  │ Tenants Config │ │    │  │ User Data      │ │
│  │ Database URLs  │ │    │  │ Business Logic │ │
│  │ Security Keys  │ │    │  │ Application    │ │
│  └────────────────┘ │    │  │ State          │ │
└─────────────────────┘    │  └────────────────┘ │
         │                 └─────────────────────┘
         │                           │
         └─────────JWT Token─────────┘
              (includes tenant_id)
```

**Why This Matters:**
- **Zero Data Leakage**: Impossible to access another tenant's data
- **Compliance Ready**: Meets strict data isolation requirements
- **Performance**: Each tenant gets optimized database connections
- **Simple**: JWT tokens handle routing automatically

## Current Status

### ✅ What's Working Now
- **Frontend**: Complete React app with authentication, tenant switching, and contact management
- **Backend**: Rust API with JWT auth, database isolation, and health checks
- **Database**: Multi-tenant PostgreSQL setup with proper migrations
- **Security**: CORS, input validation, password hashing, and secure token handling

### 🔄 What's Next
- **API Integration**: Connect frontend to real backend (currently using mock data)
- **Testing**: Add comprehensive test coverage
- **Performance**: Bundle optimization and caching improvements
- **Features**: Advanced search, data export, and internationalization

## Quick Start

### Prerequisites
- Rust 1.86+ with Diesel CLI
- PostgreSQL 13+
- Redis 6+
- Bun 1.0+ (for frontend)

### 1. Clone and Setup
```bash
git clone https://github.com/zlovtnik/actix-web-rest-api-with-jwt.git
cd actix-web-rest-api-with-jwt

# Copy environment files
cp .env.example .env
cp frontend/.env.example frontend/.env
```

### 2. Database Setup
```bash
# Run migrations
diesel migration run

# Optional: Seed tenant data
psql -d rust_rest_api_db -f scripts/seed_tenants.sql
```

### 3. Start the Backend
```bash
cargo run
```

### 4. Start the Frontend
```bash
cd frontend
bun install
bun run dev
```

Visit `http://localhost:3000` to see the app in action.

## API Usage

### Authentication
```bash
# Register a new user
curl -X POST http://localhost:8080/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "email": "admin@tenant1.com",
    "password": "securepass",
    "tenant_id": "tenant1"
  }'

# Login
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username_or_email": "admin",
    "password": "securepass",
    "tenant_id": "tenant1"
  }'
```

### Address Book Operations
```bash
# Get all contacts (requires JWT token)
curl -X GET http://localhost:8080/api/address-book \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Create a new contact
curl -X POST http://localhost:8080/api/address-book \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+1234567890"
  }'
```

## Security Features

- **JWT Authentication**: Secure token-based auth with tenant context
- **Database Isolation**: Each tenant has their own database
- **CORS Protection**: Configurable origin validation
- **Input Validation**: Comprehensive request validation
- **Password Security**: bcrypt hashing with configurable cost
- **SQL Injection Prevention**: Diesel ORM with parameterized queries

## Development

### Running Tests
```bash
# Backend tests
cargo test

# Frontend tests
cd frontend
bun test
```

### Database Migrations
```bash
# Create a new migration
diesel migration generate add_new_table

# Run migrations
diesel migration run

# Revert last migration
diesel migration revert
```

## Deployment

### Docker
```bash
# Build and run with Docker Compose
docker-compose up --build
```

### Environment Variables
```env
# Database
DATABASE_URL=postgres://user:password@localhost/dbname
REDIS_URL=redis://127.0.0.1:6379

# Security
JWT_SECRET=your-secret-key-here
MAX_AGE=604800

# Server
APP_HOST=0.0.0.0
APP_PORT=8080
LOG_FILE=logs/app.log

# CORS
CORS_ORIGINS=http://localhost:3000,http://localhost:4321
CORS_CREDENTIALS=true
```

## Contributing

We welcome contributions! Here's how to get started:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests for new functionality
5. Run the test suite (`cargo test` and `bun test`)
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to your branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

Thanks to the amazing open-source community:

- **Actix Web** - High-performance Rust web framework
- **Diesel** - Type-safe ORM for Rust
- **React** - The UI library that powers the frontend
- **Ant Design** - Enterprise UI component library
- **PostgreSQL** - The world's most advanced open-source database
- **Redis** - In-memory data structure store

---

**Built with ❤️ using Rust, Actix Web, React, and modern DevOps practices**

*Solving real-world multi-tenant challenges with production-ready architecture and security-first design.*