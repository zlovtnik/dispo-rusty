# Actix Web REST API Frontend

A modern TypeScript/Bun/React frontend application for the Actix Web REST API backend with JWT authentication and multi-tenant support.

## 🚀 Technology Stack

- **Runtime**: Bun 1.0+ (Fast JavaScript runtime)
- **Language**: TypeScript 5.8+ (First-class citizen)
- **Framework**: React 18.3.1+ (Concurrent features)
- **Routing**: React Router 6.x
- **Forms**: React Hook Form 7.x
- **Build Tool**: Bun (Integrated bundler, package manager, test runner)
- **Styling**: CSS Modules with utility classes

## 📦 Installation

1. Ensure Bun is installed: https://bun.sh
2. Install dependencies:
   ```bash
   bun install
   ```

## 🏃 Development

Start the development server with hot reload:

```bash
bun run dev
```

The application will be available at `http://localhost:3000`

## 🏗️ Building

Build for production:

```bash
bun run build
```

Preview production build:

```bash
bun run preview
```

## 🧪 Testing

Run the test suite:

```bash
bun run test
```

Run tests in watch mode:

```bash
bun run test:watch
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the frontend directory:

```env
API_URL=http://localhost:8080/api
```

### TypeScript Configuration

The tsconfig.json is optimized for Bun runtime with:
- Bun types included
- JSX transform configured
- Path aliases for clean imports

## 🏛️ Architecture

### Application Structure

```
src/
├── components/        # Reusable UI components
├── contexts/         # React context providers
├── pages/           # Route-based page components
├── services/        # API client and services
├── styles/          # Global styles and CSS
├── types/           # TypeScript type definitions
├── utils/           # Utility functions
└── main.tsx         # Application entry point
```

### Core Features

#### Authentication & Multi-Tenancy
- JWT-based authentication with automatic token refresh
- Multi-tenant frontend (tenant-aware but unaware of tenancy details)
- Secure token storage with httpOnly consideration
- Role-based route protection

#### User Interface
- Responsive design for all device types
- Form validation with real-time feedback
- Modal dialogs for user interactions
- Loading states and error handling
- Accessibility compliant (WCAG guidelines)

#### CRUD Operations
- Address book/contact management
- Create, read, update, delete operations
- Search and filtering functionality
- Paginated data display

## 🔗 API Integration

The frontend integrates with the existing Actix Web REST API:

- **Authentication**: `/api/auth/login`, `/api/auth/logout`
- **Health**: `/api/health`, `/api/ping`
- **Tenants**: `/api/tenants`
- **Address Book**: `/api/address-book`

## 🎯 Performance Optimizations

- **Bun Runtime**: Significantly faster than Node.js
- **Hot Reload**: Instant code changes reflection
- **Bundle Optimization**: Tree shaking and code splitting
- **Caching**: HTTP response caching where appropriate

## 🧪 Testing Strategy

- **Unit Tests**: Component logic and utilities
- **Integration Tests**: API service interactions
- **End-to-End Tests**: User workflows and critical paths
- **Coverage**: Target 85%+ code coverage

## 🚀 Deployment

### Static Site Hosting

Deploy to any static hosting platform:

1. Build the application: `bun run build`
2. Deploy the `dist/` directory contents
3. Configure environment variables if needed

### Supported Platforms

- **Vercel**: Recommended for React applications
- **Netlify**: Good for static sites with serverless functions
- **Cloudflare Pages**: Excellent for global performance

## 🤝 Development Guidelines

### Code Style

- Strict TypeScript configuration
- Consistent naming conventions
- Component composition patterns
- Error boundaries for robust error handling

### Security Considerations

- HTTPS everywhere
- Secure token storage
- XSS prevention through React's built-in escaping
- CSRF protection (handled by backend)

## 📈 Monitoring & Analytics

- Client-side performance monitoring
- Error tracking and reporting
- Core Web Vitals measurement
- User experience analytics

## 🔄 Roadmap

### Phase 2 Features
- Progressive Web App (PWA) capabilities
- Advanced UI component library
- Mobile-responsive native features

### Phase 3 Features
- Real-time WebSocket integration
- Advanced caching strategies
- Offline-first functionality

## 📄 License

MIT License - see LICENSE file for details.

## 🙋 Support

For support and questions:
- Check the existing backend API documentation
- Refer to the technical specifications in `target_tech_spec.pdf`
- Open an issue on the project repository
