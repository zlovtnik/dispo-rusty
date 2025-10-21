# Copilot Instructions for TypeScript/React Frontend with Vite, Bun, and Ant Design

**Last Validated**: October 20, 2025

## Project Overview

This is a modern TypeScript/React frontend application built with Bun, Vite, Ant Design, and Tailwind CSS. It provides a multi-tenant address book/contact management system with JWT authentication.

## Technology Stack

- **Runtime**: Bun 1.0+
- **Language**: TypeScript 5.9+ (strict mode)
- **UI Framework**: React 18.3.1+ with Ant Design 5.27.4+
- **Styling**: Tailwind CSS 4.1.14+ with custom color palette
- **Build Tool**: Vite 5.0+
- **Testing**: Bun's built-in test runner
- **Error Handling**: neverthrow (Railway-oriented programming)
- **Validation**: Zod schemas
- **State Management**: React Context + hooks

## Pinned Dependency Version Management

### Overview
All dependency versions listed in the Technology Stack section are pinned to ensure consistent, reproducible builds. These pinned versions must be periodically reviewed and updated to incorporate security patches, bug fixes, and feature improvements.

### Update Cadence
- **Review Frequency**: Quarterly (every 3 months)
- **Review Window**: Aligned with Q1 (Jan), Q2 (Apr), Q3 (Jul), Q4 (Oct)
- **Emergency Updates**: Security patches applied immediately regardless of cadence

### Responsibility
**Primary**: Frontend Team Lead or Designated Maintainer
**Secondary**: Development team members with write access to package.json

### Validation Steps for Version Updates
When updating any pinned dependencies, the following validation steps **must** be completed before committing changes:

1. **Type Checking**
   ```bash
   bun run type-check
   ```

2. **Linting & Code Quality**
   ```bash
   bun run lint
   ```

3. **Full Test Suite**
   ```bash
   bun run test
   ```
   - Target: 85%+ code coverage (see Coverage Checklist)
   - Ensure all tests pass before proceeding

4. **Build Verification**
   ```bash
   bun run build
   ```
   - Verify bundle size remains reasonable
   - Check for any deprecation warnings

5. **Manual Testing** (for major version bumps)
   - Test critical user flows in development
   - Verify authentication/JWT handling
   - Check form validation and error handling

### Version Update Documentation
When updating versions, document in a commit message or PR:
- Which dependencies were updated and their new versions
- Reason for update (security, feature, bug fix)
- Any breaking changes encountered and how they were resolved
- Any post-update adjustments made to configuration files

### Last Updated Versions
This document's "Last Validated" date indicates when the pinned versions were last reviewed and tested. If a version shows a gap of 3+ months, schedule an update review.

## Architecture Principles

### 1. Component Structure

```text
src/
├── components/        # Reusable UI components (Ant Design based)
├── contexts/         # React context providers for global state
├── pages/           # Route-based page components
├── services/        # API client and business logic services
├── utils/           # Pure utility functions
├── types/           # TypeScript type definitions
├── hooks/           # Custom React hooks
├── config/          # Configuration and environment handling
└── styles/          # Global styles and CSS
```

### 2. Error Handling Pattern

Use Railway-oriented programming with `neverthrow` Result types:

```typescript
// ✅ CORRECT: Return Result types, don't throw
async function fetchUser(id: string): Promise<Result<User, AppError>> {
  try {
    const response = await fetch(`/api/users/${id}`);
    
    if (!response.ok) {
      return errAsync(createAppError('USER_NOT_FOUND', `User ${id} not found`));
    }
    
    const userData = await response.json();
    return okAsync(userData);
  } catch (error) {
    return errAsync(createAppError('NETWORK_ERROR', `Failed to fetch user ${id}`));
  }
}

// ❌ WRONG: Don't throw exceptions
async function fetchUser(id: string): Promise<User> {
  throw new Error('User not found'); // Never do this
}
```

### 3. API Service Pattern

All API calls return `AsyncResult<T, E>`:

```typescript
// ✅ CORRECT: Railway-oriented API calls
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

### 4. Pagination Patterns & Metadata

#### Pattern Selection (Decision Tree)

Choose pagination pattern based on UI requirements:

```
UI Requirements?
├─ Shows numbered pages (1, 2, 3...) → Use PAGE-BASED pagination
│  └─ Examples: Static results, traditional table navigation, SEO-friendly URLs
│
└─ Infinite scroll or range queries → Use OFFSET/CURSOR-BASED pagination
   └─ Examples: Social feed, mobile infinite scroll, chronological feeds
```

#### Array Naming Convention

**Prefer resource-agnostic naming** unless legacy constraints or domain-specific reasons require resource-named arrays:

```typescript
// ✅ CORRECT: Resource-agnostic (preferred for new endpoints)
interface PaginatedResponse {
  data: User[];           // Generic, reusable across response types
  page: number;
  totalPages: number;
}

// ⚠️ CONDITIONAL: Resource-named (only if legacy API or domain reason exists)
// Must document the mapping in API docs and mark as legacy if possible
interface PaginatedUserResponse {
  users: User[];          // Resource-specific (document why in codebase comments)
  page: number;
  totalPages: number;
}

// ❌ WRONG: Inconsistent naming patterns across endpoints
// Response 1 uses 'items', Response 2 uses 'results', Response 3 uses 'data'
```

**When using resource-named arrays**: Explicitly document the mapping in the service layer and API documentation, ideally with a migration note if transitioning to `data[]`.

#### Required Metadata Fields by Pattern

**Page-Based Pattern (REQUIRED fields):**
```typescript
interface PagedResponse<T> {
  data: T[];                    // The result items (REQUIRED)
  page: number;                 // Current page (1-indexed, REQUIRED)
  limit: number;                // Items per page (REQUIRED)
  total: number;                // Total items across all pages (REQUIRED)
  totalPages: number;            // Total page count (REQUIRED)
  hasNext: boolean;             // Whether next page exists (REQUIRED)
  hasPrev: boolean;             // Whether previous page exists (REQUIRED)
}
```

**Offset/Cursor-Based Pattern (REQUIRED + OPTIONAL):**
```typescript
interface OffsetResponse<T> {
  // REQUIRED fields
  data: T[];                    // The result items (REQUIRED)
  offset: number;               // Current offset (0-indexed, REQUIRED)
  limit: number;                // Items returned (REQUIRED)
  
  // OPTIONAL fields (choose based on use case)
  total?: number;               // Total items available (OPTIONAL, omit if counting is expensive)
  nextOffset?: number;          // Next offset or null (OPTIONAL alternative to hasNext)
  prevOffset?: number;          // Previous offset or null (OPTIONAL alternative to hasPrev)
  cursor?: string;              // Opaque cursor for continuation (OPTIONAL for cursor-based)
}
```

#### Validation & Migration Enforcement

Enforce pagination patterns through Zod schemas in `src/validation/schemas.ts`. All list endpoints must validate response structure:

```typescript
// ✅ CORRECT: Validation schema in src/validation/schemas.ts
export const pagedResponseSchema = z.object({
  data: z.array(z.unknown()),
  page: z.number().min(1),
  limit: z.number().min(1),
  total: z.number().min(0),
  totalPages: z.number().min(0),
  hasNext: z.boolean(),
  hasPrev: z.boolean(),
});
```

For **legacy endpoints transitioning from resource-named arrays to `data[]`**, add a deprecation note in the schema and service layer comments. See `src/services/api.ts` for examples.

## Coding Standards

### 1. TypeScript Configuration

- **Strict mode enabled**: All strict TypeScript rules active
- **Path aliases**: Use `@/` for src imports, `@/components/*` for component imports
  - **Source of truth**: `tsconfig.json` "paths" should be treated as the source of truth (e.g., `"@/*": ["./src/*"]`)
  - **Vite integration**: Vite requires explicit configuration to resolve TypeScript path aliases. Choose one approach based on your trade-off preference:
    - Install and configure the `vite-tsconfig-paths` plugin: **single source of truth, adds dependency**
    - Manually mirror mappings in `resolve.alias` in `vite.config.ts`: **self-contained, requires manual duplication**
  - **Configuration note**: Do not maintain both sets duplicated to avoid drift and confusion - choose one approach and stick with it
- **Type imports**: Use `import type` for type-only imports
- **No any**: Avoid `any` type, use proper type definitions

```typescript
// ✅ CORRECT
import type { User } from '@/types/auth';
import { getEnv } from '@/config/env';

// ❌ WRONG
import { User } from '@/types/auth'; // Type import should be separate
import { getEnv } from '../config/env'; // Use path aliases
```

### 2. Component Patterns

- **Functional components** with TypeScript
- **Prefer Ant Design components** for interactive UI elements and controls, but permit semantic HTML (div, section, article, header, footer, etc.) for layout, semantics, and accessibility when Ant Design lacks an appropriate component - use raw HTML sparingly and with accessibility in mind
- **Custom hooks** for complex logic
- **Error boundaries** for error handling
- **Accessibility compliant** (WCAG guidelines)

```tsx
// ✅ CORRECT: Ant Design component pattern
import { Button, Card, Typography } from 'antd';
import { useAuth } from '@/contexts/AuthContext';

interface UserCardProps {
  user: User;
}

export const UserCard: React.FC<UserCardProps> = ({ user }) => {
  const { logout } = useAuth();

  return (
    <Card
      title={<Typography.Title level={4}>{user.name}</Typography.Title>}
      extra={
        <Button
          type="primary"
          danger
          onClick={logout}
          aria-label={`Logout user ${user.name}`}
        >
          Logout
        </Button>
      }
    >
      <Typography.Text>{user.email}</Typography.Text>
    </Card>
  );
};
```

### 3. Styling Guidelines

- **Ant Design theme system** - use theme tokens
- **Tailwind utilities** for custom styling
- **Custom color palette** defined in tailwind.config.ts
- **No custom CSS classes** - use utility classes or theme tokens

```tsx
// ✅ CORRECT: Theme-based styling
import { theme } from 'antd';

const { useToken } = theme;

export const StyledComponent: React.FC = () => {
  const { token } = useToken();

  return (
    <div
      className="p-4 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600"
      style={{
        color: token.colorTextLightSolid,
        border: `1px solid ${token.colorBorder}`,
      }}
    >
      Content
    </div>
  );
};
```

### 4. Environment Configuration

- **Environment validation** at build and runtime
- **VITE_ prefixed** variables only exposed to client
- **Never store secrets** in client-side environment variables

```typescript
// ✅ CORRECT: Use validated config
import { getEnv } from '@/config/env';

const config = getEnv();
const apiUrl = config.apiUrl;

// ❌ WRONG: Direct env access
const apiUrl = import.meta.env.VITE_API_URL;
```

### 5. Security Considerations

- **JWT tokens** stored securely via httpOnly cookies (strongly preferred) or localStorage if necessary
  - httpOnly flag prevents JavaScript access, mitigating XSS token theft
  - If localStorage is necessary: document the security trade-off and enforce strict XSS prevention + Content Security Policy
- **XSS prevention** through React's built-in escaping and input sanitization
- **CSRF protection** handled by backend
- **Input validation** with Zod schemas on all forms
- **Content Security Policy** headers in production

### 6. Testing Strategy

- **Unit tests** for utilities and hooks
- **Integration tests** for API services
- **Component tests** for UI interactions
- **MSW integration** for API mocking (see handlers in `test-utils/mocks/handlers.ts`)
- **85%+ code coverage** target

```typescript
// ✅ CORRECT: Test with MSW mocking and neverthrow results
import { describe, expect, it } from 'bun:test';
import { err, ok } from 'neverthrow';
import { http, HttpResponse } from 'msw';
import { getServer } from '../../test-utils/mocks/server';

describe('userService', () => {
  it('should return user on success', async () => {
    // Setup MSW handler
    getServer().use(
      http.get('/api/users/123', () => {
        return HttpResponse.json({ id: '123', name: 'Test User' });
      })
    );

    const result = await userService.getUser('123');
    expect(result.isOk()).toBe(true);
    
    result.match(
      (user) => {
        expect(user).toHaveProperty('id', '123');
      },
      (error) => {
        expect.fail(`Expected success but got error: ${error.message}`);
      }
    );
  });

  it('should return error on failure', async () => {
    // Override handler for error scenario
    getServer().use(
      http.get('/api/users/invalid', () => {
        return HttpResponse.json({ error: 'Not found' }, { status: 404 });
      })
    );

    const result = await userService.getUser('invalid');
    expect(result.isErr()).toBe(true);
  });
});
```

## File Organization Rules

### 1. Component Files

- One component per file
- Export as named export
- Include TypeScript interfaces
- Use .tsx extension

### 2. Service Files

- Group related API calls
- Return AsyncResult types
- Include Zod validation schemas
- Use .ts extension

### 3. Utility Files

- Pure functions only
- No side effects
- Comprehensive unit tests
- Use .ts extension

### 4. Type Files

- Centralize all type definitions
- Use consistent naming
- Export all types
- Use .ts extension

## Import Organization

```typescript
// 1. React imports
import React from 'react';

// 2. Third-party libraries (alphabetical)
import { Button } from 'antd';
import { Result } from 'neverthrow';

// 3. Type imports (with type keyword)
import type { User } from '@/types/auth';

// 4. Local imports (alphabetical, grouped by path)
import { getEnv } from '@/config/env';
import { useAuth } from '@/contexts/AuthContext';
import { userService } from '@/services/userService';
```

## Error Handling Best Practices

### 1. API Error Handling

```typescript
const handleApiCall = async () => {
  const result = await apiService.createUser(userData);

  result.match(
    (user) => {
      // Success: update UI
      setUser(user);
      showSuccess('User created successfully');
    },
    (error) => {
      // Error: show user-friendly message
      showError(getErrorMessage(error));
    }
  );
};
```

### 2. Form Validation

```typescript
const handleSubmit = async (data: FormData) => {
  const validation = userSchema.safeParse(data);

  if (!validation.success) {
    // Show validation errors
    setErrors(validation.error.format());
    return;
  }

  // Proceed with valid data
  await createUser(validation.data);
};
```

## Performance Considerations

### 1. Bundle Optimization

- Use dynamic imports for route-based code splitting
- Lazy load heavy components
- Optimize images and assets

### 2. State Management

- Use React Context for global app state
- Custom hooks for component-specific logic
- Avoid prop drilling with context

### 3. API Optimization

- Implement request caching
- Use optimistic updates where appropriate
- Handle loading states properly

## Development Workflow

### 1. Code Quality Checks

```bash
# Type checking
bun run type-check

# Linting
bun run lint

# Formatting
bun run format

# Full validation
bun run validate
```

### 2. Testing

```bash
# Run all tests
bun run test

# Run with coverage
bun run test:coverage

# Watch mode
bun run test:watch
```

### 3. Environment Setup

- Copy `.env.example` to `.env.local` (note: `.env.local` is git-ignored by default)
- Set required `VITE_API_URL` environment variable
- Run `bun run dev` to start the development server

## Security Checklist

- [ ] No secrets in client-side code
- [ ] JWT tokens not logged in console
- [ ] Input validation on all forms
- [ ] XSS prevention (React handles this)
- [ ] CSRF tokens handled by backend
- [ ] HTTPS in production
- [ ] Content Security Policy headers
- [ ] Secure headers (HSTS, X-Frame-Options, etc.)

## Accessibility Guidelines

- Use semantic HTML through Ant Design components
- Provide aria-labels for interactive elements
- Ensure keyboard navigation works
- Maintain sufficient color contrast
- Test with screen readers

## Deployment Considerations

- Static site deployment (Vercel, Netlify, Cloudflare Pages)
- Environment-specific builds
- Bundle analysis for performance
- CDN for static assets
- Monitoring and error tracking

Remember: This is a production-ready application with enterprise-grade features. Always prioritize type safety, error handling, security, and user experience.
 