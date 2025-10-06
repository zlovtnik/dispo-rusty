# Actix Web REST API Frontend

A modern TypeScript/Bun/React frontend application for the Actix Web REST API backend with JWT authentication and multi-tenant support.

## 🚀 Frontend Technology Stack

### Core Frontend Technologies (Frontend-Only)
- **Runtime & Package Manager**: Bun 1.0+ (Fast runtime, bundler, and test runner)
- **Programming Language**: TypeScript 5.9+ (Type-safe, compiled to JavaScript)
- **UI Framework**: React 18.3.1+ (Virtual DOM, component-based architecture)
- **Routing Library**: React Router DOM 6.x (Declarative client-side routing)
- **Form Management**: React Hook Form 7.x (Performant form validation and state management)
- **UI Component Library**: Ant Design (antd) 5.27.4+ (Enterprise-grade UI components)
- **CSS Framework**: Tailwind CSS 4.1.14+ (Utility-first CSS with custom color palette)
- **Build Tool & Dev Server**: Vite 5.0+ (Fast HMR, optimized bundling)
- **CSS Processor**: PostCSS 8.5.6+ with Autoprefixer 10.4.21+ (CSS transformations and vendor prefixes)
- **Query String Parsing**: QS 6.14.0+ (Query string serialization/deserialization)
- **Icons**: Ant Design Icons 6.1.0+ (Consistent iconography with UI components)
- **Typography Plugin**: Tailwind Typography 0.5.19+ (Tailwind utilities for rich text)
- **Testing Runner**: Bun's built-in test runner (Jest-compatible)

## 📦 Installation

1. Ensure Bun is installed: https://bun.sh
2. Install dependencies:
   ```bash
   bun install
   ```

## 🏃 Development

Start the development server with hot reload in development mode:

```bash
NODE_ENV=development bun run dev
```

Or in production mode:

```bash
NODE_ENV=production bun run dev
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

Vite automatically loads environment-specific `.env` files:

- `.env.development` - for development environment
- `.env.production` - for production environment

Example `.env.development`:

```env
VITE_API_URL=http://localhost:8000/api
```

Example `.env.production`:

```env
VITE_API_URL=https://your-production-api.com/api
```

Note: Vite only exposes environment variables that start with `VITE_` to the client-side code at runtime. Use `NODE_ENV` when running Bun to control which env file is loaded.

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

## 🚀 Potential Improvements

### Performance Enhancements
- **Code Splitting**: Implement React.lazy() and Suspense for route-based code splitting to reduce initial bundle size
- **Bundle Analysis**: Use tools like `vite-bundle-analyzer` to identify large dependencies and optimize accordingly
- **Image Optimization**: Add image lazy loading and WebP format support for faster page loads
- **Caching Strategies**: Implement service worker for better caching of static assets and API responses

### Testing & Quality Assurance
- **End-to-End Testing**: Introduce Cypress or Playwright for comprehensive user workflow testing
- **Visual Regression Tests**: Add visual testing with tools like Chromatic to detect UI changes
- **Accessibility Testing**: Implement automated a11y testing using axe-core or similar tools
- **Performance Testing**: Set up Lighthouse CI for continuous performance monitoring

### Developer Experience
- **Storybook Integration**: Create a Storybook instance for isolated component development and documentation
- **ESLint & Prettier**: Add linting and code formatting rules specific to the project style
- **Git Hooks**: Implement Husky with commitlint for consistent commit messages and pre-commit checks
- **Type Checking**: Set up automated TypeScript checks in CI/CD pipeline

### State Management & Architecture
- **Context Optimization**: Replace React Context with Zustand or Redux Toolkit for better performance on complex state
- **API Layer Improvement**: Add Axios or SWR for better data fetching with caching and error handling
- **Error Boundaries**: Implement application-wide error boundaries with Sentry integration for production error tracking
- **Internationalization**: Add i18n support with react-i18next if multi-language support is needed

### UI/UX Enhancements
- **Dark Mode**: Implement system-aware dark mode using Tailwind's `dark:` prefix
- **Theming**: Expand the custom color palette with variable-based theming for branded experiences
- **Progressive Web App**: Add PWA features like offline support, installability, and push notifications
- **Advanced Animations**: Use Framer Motion for smooth, accessible animations and page transitions

### Build & Deployment Optimization
- **Environment-specific Builds**: Create different build configurations for staging, production, and local development
- **CI/CD Pipeline**: Automate testing, building, and deployment with GitHub Actions or similar
- **Docker Containerization**: Containerize the frontend for consistent deployment environments
- **Security Headers**: Implement security headers for production builds (CSP, HSTS, etc.)

### Monitoring & Maintenance
- **Application Insights**: Add tools like LogRocket or Hotjar for session replay and user behavior analytics
- **Dependency Updates**: Automate dependency updates with Dependabot or similar tools
- **Performance Metrics**: Track bundle size changes over time with bundle size monitoring
- **SEO Optimization**: Add React Helmet for dynamic meta tags and sitemap generation if needed

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
