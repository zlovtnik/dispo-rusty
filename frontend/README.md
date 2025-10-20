# Actix Web REST API Frontend

A modern TypeScript/Bun/React frontend application for the Actix Web REST API backend with JWT authentication, multi-tenant support, and comprehensive functional programming patterns.

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

### Functional Programming & Error Handling
- **Result Types**: neverthrow 8.2.0+ (Railway-oriented programming with Result<T, E>)
- **Pattern Matching**: ts-pattern 5.8.0+ (Exhaustive pattern matching for error handling)
- **Functional Utilities**: fp-ts 2.16.11+ (Advanced functional programming utilities)
- **Validation**: Zod 4.1.12+ (Runtime type validation with functional patterns)
- **Date Handling**: dayjs 1.11.18+ (Lightweight date manipulation)

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

### Environment Variables Setup

⚠️ **IMPORTANT**: The application requires proper environment configuration to run. Follow these steps:

#### 1. Create Environment Files

Copy the example file to create your environment-specific configuration:

```bash
# For development
cp .env.example .env.development

# For production
cp .env.example .env.production
```

#### 2. Required Environment Variables

The following variables are **REQUIRED** for the application to function:

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API endpoint URL | `http://localhost:8000/api` |

#### 3. Optional Environment Variables

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `VITE_APP_NAME` | Application display name | `Actix Web REST API` | `My App` |
| `VITE_JWT_STORAGE_KEY` | LocalStorage key for JWT token | `auth_token` | `jwt_token` |
| `VITE_DEBUG` | Enable debug logging | `false` | `true` |
| `NODE_ENV` | Node environment (auto-set) | `development` | `production` |

#### 4. Environment Files by Environment

Vite automatically loads environment-specific `.env` files:

- `.env` - Loaded in all environments (base configuration)
- `.env.development` - Development environment (loaded during `bun run dev`)
- `.env.production` - Production environment (loaded during `bun run build`)
- `.env.local` - Local overrides (git-ignored, highest priority)

**Example `.env.development`:**
```env
VITE_API_URL=http://localhost:8000/api
VITE_DEBUG=true
```

**Example `.env.production`:**
```env
VITE_API_URL=https://api.yourdomain.com/api
VITE_DEBUG=false
```

#### 5. Environment Variable Validation

The application performs comprehensive validation of environment variables:

**Build-Time Validation** (via `scripts/validate-env.js`):
- Validates required variables are present
- Checks URL format validity
- Warns about invalid optional variables
- Prevents builds with missing configuration

**Runtime Validation** (via `src/config/env.ts`):
- Validates configuration on app startup
- Displays user-friendly error UI if validation fails
- Provides helpful troubleshooting steps in development mode

**What Happens if Variables are Missing?**

- **Development Mode**: Clear error message with quick fix instructions
- **Production Mode**: Build fails with detailed error message before deployment
- **Runtime**: Application shows configuration error UI instead of broken page

#### 6. Accessing Environment Variables in Code

**❌ WRONG - Direct access:**
```typescript
const apiUrl = import.meta.env.VITE_API_URL; // Type-unsafe, no validation
```

**✅ CORRECT - Use the config utility:**
```typescript
import { getEnv } from '@/config/env';

const config = getEnv();
const apiUrl = config.apiUrl; // Type-safe, validated
```

#### 7. Troubleshooting

**Problem: "Configuration Error" screen on startup**

Solution:
1. Check if `.env.development` or `.env.production` exists
2. Verify `VITE_API_URL` is set and is a valid URL
3. Restart the development server after making changes

**Problem: Build fails with environment variable error**

Solution:
1. Ensure the appropriate `.env.production` file exists
2. Check that `VITE_API_URL` is set for the target environment
3. Verify URL format includes protocol (http:// or https://)

**Problem: Changes to `.env` not taking effect**

Solution:
1. Restart the Vite dev server (`bun run dev`)
2. For production builds, run `bun run build` again
3. Clear browser cache if testing built files

Note: Vite only exposes environment variables that start with `VITE_` to the client-side code. Never store secrets or API keys in these variables as they are embedded in the client-side bundle.

### TypeScript Configuration

The project uses TypeScript 5.9+ with strict type checking enabled. Key configurations:

- **Module System**: ESNext with Preserve mode for optimal Bun compatibility
- **Path Aliases**: Configured for clean imports (e.g., `@/components/*`)
- **Type Definitions**: 
  - `vite/client` - Vite environment types
  - `@types/bun` - Bun runtime types
  - Custom `vite-env.d.ts` - Application-specific environment types

**Verify TypeScript Configuration:**
```bash
bun run tsc --noEmit  # Type-check without emitting files
```

Validation is performed automatically during the build process. If validation fails, the build will be aborted with clear error messages.

To manually validate environment variables:

```bash
node scripts/validate-env.js
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
├── components/        # Reusable UI components (Ant Design based)
├── contexts/         # React context providers for global state
├── pages/           # Route-based page components
├── services/        # API client and business logic services
├── domain/          # Pure business logic (functional programming)
│   ├── auth.ts      # Authentication domain logic
│   ├── contacts.ts  # Contact management logic
│   ├── tenants.ts   # Tenant management logic
│   └── rules/       # Business rules modules
├── hooks/           # Custom React hooks with Result types
├── utils/           # Pure utility functions
├── types/           # TypeScript type definitions
├── validation/      # Zod schemas and validation
├── transformers/    # Data transformation pipelines
├── test-utils/      # Testing utilities and mocks
└── main.tsx         # Application entry point
```

### Core Features

#### Functional Programming Architecture
- **Domain Layer**: Pure business logic with zero dependencies
- **Railway-Oriented Programming**: Result<T, E> types for explicit error handling
- **Pattern Matching**: Exhaustive error handling with ts-pattern
- **Type Safety**: Strict TypeScript with branded types and discriminated unions

#### Authentication & Multi-Tenancy
- JWT-based authentication with automatic token refresh
- Multi-tenant frontend with tenant isolation
- Secure token storage with httpOnly consideration
- Role-based route protection with domain logic

#### User Interface
- Responsive design for all device types
- Form validation with real-time feedback using Zod schemas
- Modal dialogs for user interactions
- Loading states and error handling with Result types
- Accessibility compliant (WCAG guidelines)

#### CRUD Operations
- Address book/contact management with domain validation
- Create, read, update, delete operations with error handling
- Search and filtering functionality
- Paginated data display with optimistic updates

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

### Comprehensive Test Suite
- **Unit Tests**: Component logic, utilities, and domain functions (95%+ coverage)
- **Integration Tests**: API service interactions with MSW mocking
- **Component Tests**: React Testing Library with user-centric testing
- **Domain Tests**: Pure function testing with property-based testing
- **Error Handling Tests**: Result type validation and error scenarios

### Testing Infrastructure
- **Test Runner**: Bun's built-in test runner (Jest-compatible)
- **DOM Environment**: Happy DOM for lightweight component testing
- **API Mocking**: MSW (Mock Service Worker) for network-level mocking
- **Test Utilities**: Custom render functions with provider support
- **Coverage**: Target 85%+ code coverage with detailed reporting

### Testing Patterns
```typescript
// Result-based testing
const result = await userService.getUser(userId);
result.match(
  (user) => expect(user).toHaveProperty('id', userId),
  (error) => expect.fail(`Expected success but got error: ${error.message}`)
);

// Component testing with providers
renderWithAuth(<ContactForm />, { user: mockUser });
expect(screen.getByRole('form')).toBeInTheDocument();

// Property-based testing
fc.assert(fc.property(fc.string(), (email) => {
  const result = validateEmail(email);
  return result.isOk() || result.isErr();
}));
```

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

### Functional Programming Patterns

#### Railway-Oriented Programming
```typescript
// ✅ CORRECT: Use Result types for error handling
const result = await userService.getUser(userId);
result.match(
  (user) => setUser(user),
  (error) => showError(error.message)
);

// ❌ WRONG: Don't use try/catch for API calls
try {
  const user = await userService.getUser(userId);
  setUser(user);
} catch (error) {
  showError(error.message);
}
```

#### Domain Layer Usage
```typescript
// Import domain functions
import { authenticateUser, AuthRules } from '@/domain';

// Use pure functions for business logic
const sessionResult = authenticateUser(credentials, authResponse);
sessionResult.match(
  (session) => updateAuthState(session),
  (error) => handleAuthError(error)
);
```

#### Pattern Matching for Errors
```typescript
import { match } from 'ts-pattern';

const errorUI = match(error)
  .with({ type: 'network', retryable: true }, (e) => <RetryableError error={e} />)
  .with({ type: 'auth' }, (e) => <AuthError error={e} />)
  .with({ type: 'validation' }, (e) => <ValidationError error={e} />)
  .otherwise((e) => <GenericError error={e} />);
```

### Code Style

- **Strict TypeScript**: All strict mode rules enabled
- **Result Types**: Use Result<T, E> instead of throwing exceptions
- **Pure Functions**: Domain logic must be pure and testable
- **Pattern Matching**: Use ts-pattern for exhaustive error handling
- **Branded Types**: Use branded types for validated data

### Security Considerations

- **HTTPS everywhere**: All production traffic encrypted
- **Secure token storage**: httpOnly cookies preferred over localStorage
- **XSS prevention**: React's built-in escaping + Content Security Policy
- **CSRF protection**: Handled by backend with proper headers
- **Input validation**: Zod schemas for all user input
- **Error handling**: No sensitive information in error messages

## 📈 Monitoring & Analytics

- Client-side performance monitoring
- Error tracking and reporting
- Core Web Vitals measurement
- User experience analytics

## 🚀 Recent Improvements & Achievements

### ✅ Completed Enhancements (Latest Release)

#### Functional Programming Architecture
- **Domain Layer**: Complete business logic extraction with 75+ pure functions
- **Railway-Oriented Programming**: Result<T, E> types throughout the application
- **Pattern Matching**: Exhaustive error handling with ts-pattern
- **Type Safety**: Strict TypeScript with branded types and discriminated unions

#### Testing Infrastructure
- **Comprehensive Test Suite**: 180+ passing tests with 95%+ coverage target
- **MSW Integration**: Network-level API mocking for realistic testing
- **Component Testing**: React Testing Library with custom render utilities
- **Property-Based Testing**: Fast-check integration for domain functions

#### Error Handling & Validation
- **TypedValidationError**: Enhanced error shape and validation details
- **Gender Field Validation**: Required gender field with proper enum handling
- **Form Validation**: Zod schemas with real-time feedback
- **Error Boundaries**: Enhanced with recovery strategies and pattern matching

#### Component Enhancements
- **Testability Attributes**: data-testid attributes for better testing
- **Accessibility**: ARIA labels and keyboard navigation support
- **Loading States**: Skeleton screens and optimistic updates
- **Modal Interactions**: Enhanced confirmation dialogs with proper callbacks

### 🎯 Next Phase Improvements

#### Performance Enhancements
- **Code Splitting**: Implement React.lazy() and Suspense for route-based code splitting
- **Bundle Analysis**: Use vite-bundle-analyzer to identify optimization opportunities
- **Image Optimization**: Add lazy loading and WebP format support
- **Caching Strategies**: Implement service worker for better asset caching

#### Advanced Testing
- **End-to-End Testing**: Introduce Playwright for comprehensive user workflows
- **Visual Regression Tests**: Add Chromatic for UI change detection
- **Accessibility Testing**: Implement axe-core for automated a11y testing
- **Performance Testing**: Set up Lighthouse CI for continuous monitoring

#### Developer Experience
- **Storybook Integration**: Create component library documentation
- **Git Hooks**: Implement Husky with commitlint for consistent commits
- **Hot Reloading**: Enhanced development experience with better error reporting
- **Type Checking**: Automated TypeScript validation in CI/CD

#### State Management & Architecture
- **Context Optimization**: Consider Zustand for complex state management
- **API Layer**: Enhanced caching with React Query or SWR
- **Error Tracking**: Sentry integration for production error monitoring
- **Internationalization**: i18n support with react-i18next

#### UI/UX Enhancements
- **Dark Mode**: System-aware dark mode with Tailwind
- **Progressive Web App**: Offline support and installability
- **Advanced Animations**: Framer Motion for smooth transitions
- **Responsive Design**: Enhanced mobile and tablet experiences

#### Build & Deployment
- **Environment-specific Builds**: Staging, production, and development configurations
- **CI/CD Pipeline**: GitHub Actions for automated testing and deployment
- **Security Headers**: CSP, HSTS, and other security headers
- **Monitoring**: Application insights and performance tracking

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
