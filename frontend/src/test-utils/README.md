# Testing Guide

This document provides comprehensive guidance on testing in this React/TypeScript frontend application.

## Table of Contents

- [Overview](#overview)
- [Testing Stack](#testing-stack)
- [Running Tests](#running-tests)
- [Writing Tests](#writing-tests)
- [Test Utilities](#test-utilities)
- [API Mocking](#api-mocking)
- [Best Practices](#best-practices)
- [Coverage Requirements](#coverage-requirements)
- [Troubleshooting](#troubleshooting)

---

## Overview

This project uses a comprehensive testing infrastructure with:

- **Bun Test Runner**: Fast, built-in test runner with Jest-compatible API
- **React Testing Library**: Component testing with user-centric queries
- **Happy DOM**: Lightweight DOM implementation for fast tests
- **MSW (Mock Service Worker)**: API mocking at the network level
- **jest-dom**: Custom matchers for improved assertions

## Testing Stack

### Dependencies

```json
{
  "@testing-library/react": "^16.3.0",
  "@testing-library/user-event": "^14.6.1",
  "@testing-library/jest-dom": "^6.9.1",
  "happy-dom": "^20.0.1",
  "msw": "^2.11.5"
}
```

### Configuration Files

- **`bunfig.toml`**: Bun test runner configuration
- **`src/test-utils/setup.ts`**: Global test setup (loaded before all tests)
- **`src/test-utils/render.tsx`**: Custom render functions with providers
- **`src/test-utils/mocks/`**: MSW handlers and server setup

---

## Running Tests

### Basic Commands

```bash
# Run all tests
bun test

# Run tests in watch mode (re-runs on file changes)
bun test:watch

# Run tests with coverage report
bun test:coverage

# Run tests with DOM environment
bun test:ui
```

### Coverage Reports

Coverage reports are generated in the `./coverage` directory:

- **HTML Report**: `coverage/index.html` (open in browser)
- **Console Summary**: Displayed after test run

### Coverage Targets

```
Overall:      85%+
Components:   90%+
Services:     95%+
Utils:        90%+
```

---

## Writing Tests

### Basic Test Structure

```typescript
import { describe, test, expect, beforeEach } from 'bun:test';
import { renderWithProviders, screen, userEvent } from '../test-utils';
import { MyComponent } from './MyComponent';

describe('MyComponent', () => {
  beforeEach(() => {
    // Setup runs before each test
  });

  test('should render component', () => {
    renderWithProviders(<MyComponent />);

    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

### Component Testing

#### Rendering Components

```typescript
import { renderWithProviders } from '../test-utils';

// Render with all providers (Router, AuthContext, Ant Design)
renderWithProviders(<MyComponent />);

// Render with authenticated user
renderWithAuth(<MyComponent />);

// Render without authentication
renderWithoutAuth(<MyComponent />);

// Render with custom route
renderWithProviders(<MyComponent />, {
  initialRoute: '/contacts'
});

// Render with custom auth state
renderWithProviders(<MyComponent />, {
  authValue: {
    isAuthenticated: true,
    user: customUser,
    tenant: customTenant
  }
});
```

#### User Interactions

```typescript
import { userEvent } from '../test-utils';

test('should handle button click', async () => {
  const user = userEvent.setup();

  renderWithProviders(<MyComponent />);

  const button = screen.getByRole('button', { name: 'Submit' });
  await user.click(button);

  expect(screen.getByText('Submitted')).toBeInTheDocument();
});

test('should handle form input', async () => {
  const user = userEvent.setup();

  renderWithProviders(<LoginForm />);

  const emailInput = screen.getByLabelText('Email');
  await user.type(emailInput, 'test@example.com');

  expect(emailInput).toHaveValue('test@example.com');
});
```

#### Queries

Use React Testing Library queries in order of preference:

```typescript
// ✅ Accessible queries (preferred)
screen.getByRole('button', { name: 'Submit' });
screen.getByLabelText('Email');
screen.getByPlaceholderText('Enter email');
screen.getByText('Hello World');

// ⚠️ Semantic queries (use when accessible queries don't work)
screen.getByAltText('Profile picture');
screen.getByTitle('Close');

// ❌ Avoid (last resort only)
screen.getByTestId('submit-button'); // Only for non-semantic elements
```

#### Async Operations

```typescript
import { waitFor } from '../test-utils';

test('should load data', async () => {
  renderWithProviders(<DataTable />);

  // Wait for loading to finish
  await waitFor(() => {
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });

  // Check data rendered
  expect(screen.getByText('John Doe')).toBeInTheDocument();
});

test('should show error message', async () => {
  // Setup mock to return error
  server.use(
    http.get('/api/contacts', () => {
      return HttpResponse.json(
        { message: 'Server error' },
        { status: 500 }
      );
    })
  );

  renderWithProviders(<DataTable />);

  // Wait for error to appear
  await waitFor(() => {
    expect(screen.getByText(/Server error/i)).toBeInTheDocument();
  });
});
```

### Service/API Testing

```typescript
import { describe, test, expect } from 'bun:test';
import { authService } from '../services/api';
import { setupMSW, teardownMSW, resetMSW } from '../test-utils';

describe('authService', () => {
  beforeAll(() => {
    setupMSW(); // Start MSW server
  });

  afterAll(() => {
    teardownMSW(); // Stop MSW server
  });

  beforeEach(() => {
    resetMSW(); // Reset handlers and mock data
  });

  test('should login successfully', async () => {
    const result = await authService.login({
      usernameOrEmail: 'test@example.com',
      password: 'password123',
      tenantId: asTenantId('tenant-1'),
    });

    expect(result.isOk()).toBe(true);

    if (result.isOk()) {
      expect(result.value.data.token).toBeDefined();
      expect(result.value.data.user.email).toBe('test@example.com');
    }
  });

  test('should handle login error', async () => {
    const result = await authService.login({
      usernameOrEmail: '',
      password: '',
      tenantId: asTenantId('tenant-1'),
    });

    expect(result.isErr()).toBe(true);
  });
});
```

---

## Test Utilities

### Custom Render Functions

Located in `src/test-utils/render.tsx`:

#### `renderWithProviders(ui, options)`

Renders component with Router, AuthContext, and Ant Design providers.

**Options:**

- `initialRoute`: Initial route for MemoryRouter
- `initialRoutes`: Array of routes for navigation history
- `useBrowserRouter`: Use BrowserRouter instead of MemoryRouter
- `authValue`: Custom auth context value
- `withAntApp`: Wrap with Ant Design App component (default: true)

#### `renderWithAuth(ui, options)`

Shortcut for rendering with authenticated user.

#### `renderWithoutAuth(ui, options)`

Shortcut for rendering with unauthenticated user.

### Mock Data

Located in `src/test-utils/render.tsx`:

```typescript
import { mockUser, mockTenant } from '../test-utils';

// Use in tests
expect(user).toEqual(mockUser);
```

### Async Utilities

```typescript
import { waitFor, createDeferred } from '../test-utils';

// Wait for specific time
await waitFor(100);

// Create deferred promise for testing
const deferred = createDeferred<string>();
mockApi.login.mockReturnValue(deferred.promise);

// Later, resolve or reject
deferred.resolve('success');
// or
deferred.reject(new Error('failed'));
```

---

## API Mocking

### MSW (Mock Service Worker)

MSW intercepts network requests at the service worker level, providing realistic API mocking.

### Setup

```typescript
import { setupMSW, teardownMSW, resetMSW } from '../test-utils';

beforeAll(() => {
  setupMSW(); // Start server before all tests
});

afterAll(() => {
  teardownMSW(); // Stop server after all tests
});

beforeEach(() => {
  resetMSW(); // Reset handlers and mock data between tests
});
```

### Available Handlers

Located in `src/test-utils/mocks/handlers.ts`:

**Authentication:**

- `POST /auth/login` - Login with credentials
- `POST /auth/logout` - Logout user
- `POST /auth/refresh` - Refresh JWT token

**Tenants:**

- `GET /tenants` - Get all tenants
- `GET /tenants/:id` - Get tenant by ID
- `POST /tenants` - Create tenant
- `PUT /tenants/:id` - Update tenant
- `DELETE /tenants/:id` - Delete tenant

**Contacts:**

- `GET /people` - Get all contacts
- `GET /people/:id` - Get contact by ID
- `POST /people` - Create contact
- `PUT /people/:id` - Update contact
- `DELETE /people/:id` - Delete contact

**Health:**

- `GET /ping` - Health check

### Customizing Responses

```typescript
import { server, http, HttpResponse } from '../test-utils';

test('should handle specific error', async () => {
  // Override handler for this test
  server.use(
    http.get('/api/contacts', () => {
      return HttpResponse.json({ message: 'Not found', data: null }, { status: 404 });
    })
  );

  // Test with custom response
  const result = await addressBookService.getAll();
  expect(result.isErr()).toBe(true);
});
```

### Resetting Mock Data

```typescript
import { resetMockData } from '../test-utils';

beforeEach(() => {
  // Reset mock contacts and tenants to initial state
  resetMockData();
});
```

---

## Best Practices

### ✅ DO

- **Test user behavior**, not implementation details
- **Use accessible queries** (getByRole, getByLabelText) whenever possible
- **Test error states and edge cases**, not just happy paths
- **Keep tests isolated** - each test should be independent
- **Use descriptive test names** - "should do X when Y"
- **Test one thing per test** - single responsibility principle
- **Clean up after tests** - reset mocks, clear state
- **Use React Testing Library queries** - don't access component internals
- **Wait for async operations** - use waitFor, findBy queries

### ❌ DON'T

- ❌ **Don't test implementation details** (internal state, class names)
- ❌ **Don't use snapshot testing** for complex components
- ❌ **Don't test external libraries** (React Router, Ant Design)
- ❌ **Don't make real API calls** in unit tests
- ❌ **Don't use `act()` directly** - React Testing Library handles it
- ❌ **Don't use `setTimeout` in tests** - use waitFor instead
- ❌ **Don't test CSS styling** - use visual regression tests for that
- ❌ **Don't repeat test setup** - use beforeEach or custom utilities

### Example: Good vs Bad

#### ❌ Bad: Testing Implementation Details

```typescript
test('should update state on click', () => {
  const { result } = renderHook(() => useState(0));
  const [count, setCount] = result.current;

  act(() => {
    setCount(1);
  });

  expect(result.current[0]).toBe(1); // Testing internal state
});
```

#### ✅ Good: Testing User Behavior

```typescript
test('should increment counter on button click', async () => {
  const user = userEvent.setup();

  renderWithProviders(<Counter />);

  const button = screen.getByRole('button', { name: 'Increment' });
  await user.click(button);

  expect(screen.getByText('Count: 1')).toBeInTheDocument(); // Testing UI output
});
```

---

## Coverage Requirements

### Target Coverage

```
Overall:      85%+
Components:   90%+
Services:     95%+
Utils:        90%+
```

### Viewing Coverage

```bash
# Generate coverage report
bun test:coverage

# Open HTML report in browser
open coverage/index.html  # macOS
xdg-open coverage/index.html  # Linux
start coverage/index.html  # Windows
```

### Coverage Guidelines

- **Statements**: Aim for 90%+ in all files
- **Branches**: Cover all if/else paths
- **Functions**: Test all exported functions
- **Lines**: No critical business logic untested

### Excluding Files from Coverage

Add comment to exclude file or section:

```typescript
/* istanbul ignore file */

// Or exclude specific lines
/* istanbul ignore next */
function unusedUtility() {
  // This won't be counted in coverage
}
```

---

## Troubleshooting

### Common Issues

#### Tests Failing with "Not wrapped in act(...)"

**Solution**: Use React Testing Library's async utilities:

```typescript
// ❌ Don't use setTimeout
setTimeout(() => {
  expect(...).toBeInTheDocument();
}, 100);

// ✅ Use waitFor
await waitFor(() => {
  expect(...).toBeInTheDocument();
});
```

#### API Calls Not Mocked

**Solution**: Ensure MSW server is set up:

```typescript
import { setupMSW, teardownMSW, resetMSW } from '../test-utils';

beforeAll(() => setupMSW());
afterAll(() => teardownMSW());
beforeEach(() => resetMSW());
```

#### LocalStorage Not Available

**Solution**: Already configured in `test-utils/setup.ts`. If issues persist:

```typescript
beforeEach(() => {
  localStorage.clear();
});
```

#### Can't Find Element

**Solution**: Use `screen.debug()` to see rendered output:

```typescript
import { screen } from '../test-utils';

test('should render element', () => {
  renderWithProviders(<MyComponent />);

  screen.debug(); // Prints HTML to console

  expect(screen.getByText('Hello')).toBeInTheDocument();
});
```

#### Tests Are Slow

**Solutions**:

1. Use `renderWithoutAuth()` if auth not needed
2. Set `withAntApp: false` if Ant Design context not needed
3. Mock heavy components with `React.lazy()`
4. Reduce number of MSW handlers if not all needed

---

## Resources

### Documentation

- [React Testing Library](https://testing-library.com/react)
- [Bun Test Runner](https://bun.sh/docs/test/writing)
- [MSW (Mock Service Worker)](https://mswjs.io/)
- [jest-dom Matchers](https://github.com/testing-library/jest-dom)

### Testing Philosophy

- [Testing Library Guiding Principles](https://testing-library.com/docs/guiding-principles/)
- [Common Mistakes with React Testing Library](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)

---

## Next Steps

1. **Write Component Tests** - Start with simple components (TI-003)
2. **Test Service Layer** - Test all API services with MSW (TI-002)
3. **Integration Tests** - Test complete user flows (TI-004)
4. **Achieve Coverage Targets** - Aim for 85%+ overall coverage

**Happy Testing! 🧪**
