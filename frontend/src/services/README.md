# Services Layer

This directory contains the API client and service layer for communicating with the backend REST API. All services use Railway-Oriented Programming with `Result` types for type-safe error handling.

The services layer centralizes communication with external systems such as the Actix backend and browser storage. All functions return `Result`/`ResultAsync` types to align with the functional programming guidelines.

## Architecture Overview

```
┌─────────────────┐
│ React Components │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Service Layer  │ (authService, tenantService, addressBookService)
│  (api.ts)       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  HttpClient     │ (Retry, Circuit Breaker, Auth)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Backend API    │
└─────────────────┘
```

## Files

### `api.ts`
Core HTTP client and all API services with comprehensive JSDoc documentation.

**Exports:**
- `authService` - Authentication operations (login, logout, refresh)
- `tenantService` - Tenant CRUD operations
- `addressBookService` - Contact management
- `healthService` - API health checks
- `HttpClient` - Low-level HTTP client class
- `createHttpClient()` - Factory for custom client instances
- `apiClient` - Default HTTP client instance

### `StorageService.ts`
Result-based wrapper around `localStorage` with versioned payload support for type-safe storage operations.

## HttpClient Features

### 1. Automatic Authentication
Automatically includes JWT tokens in the `Authorization` header for all requests.

```typescript
// Token is automatically included from localStorage
const result = await apiClient.get('/api/protected-resource');
```

### 2. Tenant Context Injection
Automatically includes `X-Tenant-ID` header for multi-tenant routing.

```typescript
// Tenant ID is automatically extracted from localStorage
const result = await addressBookService.getAll();
// Request includes: X-Tenant-ID: tenant1
```

### 3. Retry with Exponential Backoff
Automatically retries failed requests with exponential backoff.

**Default Configuration:**
- Max attempts: 3
- Base delay: 1 second
- Max delay: 10 seconds

```typescript
// Automatically retries network errors and 5xx errors
const result = await apiClient.get('/api/data');
```

### 4. Circuit Breaker Pattern
Prevents cascading failures by opening the circuit after repeated failures.

**Default Configuration:**
- Failure threshold: 5 consecutive failures
- Reset timeout: 60 seconds (1 minute)

**States:**
- **Closed** - Normal operation, requests pass through
- **Open** - Too many failures, requests fail immediately
- **Half-Open** - Testing if service recovered

### 5. Request Timeout
All requests timeout after a configurable duration.

**Default:** 30 seconds

## Services

### Authentication Service

```typescript
import { authService } from './services/api';

// Login
const result = await authService.login({
  usernameOrEmail: 'user@example.com',
  password: 'password123',
  tenantId: 'tenant1',
  rememberMe: true
});

result.match(
  (auth) => {
    // Success: auth.token, auth.user, auth.tenant, auth.expiresIn
    localStorage.setItem('auth_token', JSON.stringify({ token: auth.token }));
    localStorage.setItem('user', JSON.stringify(auth.user));
    localStorage.setItem('tenant', JSON.stringify(auth.tenant));
  },
  (error) => {
    // Error: error.message, error.type, error.statusCode
    console.error('Login failed:', error.message);
  }
);

// Logout
await authService.logout();

// Refresh token
const refreshed = await authService.refreshToken();
```

> ⚠️ **Security note:** Storing access tokens or tenant metadata in `localStorage` makes them accessible to script injection. Prefer httpOnly cookies or hardened storage layers; see the [Security](#security) guidance for safer alternatives and mitigation steps.

### Tenant Service

```typescript
import { tenantService } from './services/api';

// Get all tenants (admin only)
const tenants = await tenantService.getAll();

// Get with pagination
const paginated = await tenantService.getAllWithPagination({
  offset: 0,
  limit: 20
});
// Filter tenants
const active = await tenantService.filter({
  filters: [
    { field: 'status', operator: 'eq', value: 'active' }
  ],
  page_size: 20
});

// Get single tenant
const tenant = await tenantService.getById('tenant-123');

// Create tenant
const newTenant = await tenantService.create({
  name: 'New Company',
  db_url: 'postgresql://localhost/tenant_db'
});

// Update tenant
const updated = await tenantService.update('tenant-123', {
  name: 'Updated Name'
});

// Delete tenant
await tenantService.delete('tenant-123');
```

### Address Book Service

```typescript
import { addressBookService } from './services/api';

// Get all contacts
const contacts = await addressBookService.getAll({
  page: 1,
  limit: 20,
  search: 'john'
});

contacts.match(
  (response) => {
    if (response.status === 'success') {
      console.log('Contacts:', response.data.contacts);
      console.log('Total:', response.data.total);
      console.log('Current Page:', response.data.currentPage);
    }
  },
  (error) => console.error(error)
);

// Create contact
const contact = await addressBookService.create({
  name: 'John Doe',
  email: 'john@example.com',
  phone: '+1234567890',
  address: '123 Main St',
  age: 30,
  gender: true // true = male, false = female
});

// Update contact
const updated = await addressBookService.update('contact-123', {
  name: 'Jane Doe',
  email: 'jane@example.com',
  phone: '+1234567890',
  address: '456 Oak Ave',
  age: 28
});

// Delete contact
await addressBookService.delete('contact-123');
```

## Error Handling

All services return `AsyncResult<T, E>` which is a `ResultAsync` from the `neverthrow` library.

### Basic Pattern

```typescript
const result = await authService.login(credentials);

result.match(
  (success) => {
    // Handle success case
    console.log('Success:', success);
  },
  (error) => {
    // Handle error case
    console.error('Error:', error.message);
  }
);
```

### Using `.andThen()` for Chaining

```typescript
const user = await authService.login(credentials)
  .andThen((auth) => {
    // Save to localStorage
    localStorage.setItem('auth_token', JSON.stringify({ token: auth.token }));
    return okAsync(auth.user);
  })
  .andThen((user) => {
    // Fetch user profile
    return fetchUserProfile(user.id);
  });
```

### Using `.mapErr()` for Error Transformation

```typescript
const result = await authService.login(credentials)
  .mapErr((error) => {
    // Transform error for display
    return {
      ...error,
      displayMessage: error.type === 'auth' 
        ? 'Invalid credentials' 
        : 'Login failed'
    };
  });
```

### Error Types

All errors implement the `AppError` interface:

```typescript
interface AppError {
  type: 'auth' | 'network' | 'validation' | 'business';
  message: string;
  code?: string;
  statusCode?: number;
  details?: Record<string, unknown>;
  retryable?: boolean;
  cause?: unknown;
}
```

**Error Type Matrix:**

| HTTP Status | Error Type | Retryable | Description |
|------------|------------|-----------|-------------|
| 401, 403 | `auth` | No | Authentication/authorization failure |
| 400, 422 | `validation` | No | Invalid request data |
| 500-599 | `network` | Yes | Server error |
| Timeout | `network` | Yes | Request timeout |
| Network failure | `network` | Yes | No connection to server |
| Other | `business` | No | Business logic error |

## Custom Configuration

Create a custom HTTP client with different settings:

```typescript
import { createHttpClient } from './services/api';

const fastClient = createHttpClient({
  timeout: 5000, // 5 seconds
  retry: {
    maxAttempts: 2,
    baseDelay: 500,
    maxDelay: 5000
  },
  circuitBreaker: {
    failureThreshold: 3,
    resetTimeout: 30000
  }
});

// Use custom client
const result = await fastClient.get('/api/fast-endpoint');
```

### Notes

- **Circuit Breaker Behavior**: When the circuit breaker is open, requests fail immediately without hitting the network. This prevents wasting resources on a failing service.
- **Exponential Backoff**: Prevents overwhelming a recovering service with retry requests. Use custom configuration for time-sensitive operations.
- **Timeout Handling**: The HttpClient uses AbortController to cancel requests that exceed the timeout. This prevents memory leaks and zombie requests.
- **Security Considerations**:
  - **Current:** Tokens stored in localStorage (XSS vulnerability)
  - **Recommended:** Use httpOnly cookies if backend supports it
  - **Alternative:** Store in memory only (lost on page refresh)
  - When using cookies, ensure backend implements CSRF tokens and include them in requests
  - Configure CSP headers to prevent XSS attacks

## Storage Conventions

The HttpClient expects specific storage formats for authentication:

```typescript
// auth_token: JWT token
localStorage.setItem('auth_token', JSON.stringify({ 
  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' 
}));

// tenant: Current tenant context
localStorage.setItem('tenant', JSON.stringify({ 
  id: 'tenant1',
  name: 'Company Name',
  // ... other tenant fields
}));

// user: Current user data
localStorage.setItem('user', JSON.stringify({ 
  id: 'user1',
  email: 'user@example.com',
  username: 'johndoe',
  // ... other user fields
}));
```

## Conventions

- Export only typed service functions; consumers should never call `fetch` directly.
- Always validate responses with `zod` schemas before exposing data to the UI.
- When adding a service, include a JSDoc block with parameter descriptions, return values, and a usage example.
- Keep cross-cutting retry/circuit breaker helpers inside this directory to maintain parity across services.
- Storage interactions must go through `StorageService` so migrations and versioning remain consistent.

## Adding New Services

1. Model the success and error payloads in `frontend/src/types`.
2. Create schema validators in `frontend/src/validation`.
3. Implement the service function using `ResultAsync` and the shared HTTP client.
4. Add comprehensive JSDoc documentation describing:
   - Purpose and responsibility
   - All parameters with types and descriptions
   - Return type and possible error states
   - Usage examples with real code
5. Update this README with service description and usage examples.
6. Add unit tests for the new service.

### Example Service Template

```typescript
/**
 * Widget Management Service
 * 
 * Provides CRUD operations for managing widgets.
 * 
 * @example
 * ```typescript
 * const widgets = await widgetService.getAll({ page: 1, limit: 10 });
 * widgets.match(
 *   (response) => console.log(response.data),
 *   (error) => console.error(error.message)
 * );
 * ```
 */
export const widgetService = {
  /**
   * Retrieves all widgets with optional pagination
   * 
   * @param params - Query parameters (page, limit)
   * @returns AsyncResult with widget list or AppError
   * 
   * @example
   * ```typescript
   * const widgets = await widgetService.getAll({ page: 1, limit: 20 });
   * ```
   */
  getAll(params?: { page?: number; limit?: number }): AsyncResult<ApiResponse<Widget[]>, AppError> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    
    const query = queryParams.toString();
    return apiClient.get<Widget[]>(query ? `/widgets?${query}` : '/widgets');
  },
  
  // ... other methods
};
```

## Best Practices

### 1. Always Handle Both Success and Error Cases

```typescript
// ✅ Good
const result = await authService.login(credentials);
result.match(
  (auth) => handleSuccess(auth),
  (error) => handleError(error)
);

// ❌ Bad - doesn't handle errors
const result = await authService.login(credentials);
if (result.isOk()) {
  handleSuccess(result.value);
}
```

### 2. Use Railway-Oriented Programming

```typescript
// ✅ Good - chain operations
const profile = await authService.login(credentials)
  .andThen((auth) => saveToStorage(auth))
  .andThen((auth) => fetchProfile(auth.user.id));

// ❌ Bad - nested callbacks
const loginResult = await authService.login(credentials);
if (loginResult.isOk()) {
  const saveResult = await saveToStorage(loginResult.value);
  if (saveResult.isOk()) {
    const profileResult = await fetchProfile(loginResult.value.user.id);
    // ...
  }
}
```

### 3. Transform Errors for Display

```typescript
// ✅ Good - user-friendly messages
const result = await authService.login(credentials)
  .mapErr((error) => ({
    ...error,
    displayMessage: getDisplayMessage(error)
  }));

// ❌ Bad - expose technical details
const result = await authService.login(credentials);
if (result.isErr()) {
  alert(result.error.message); // "Network request failed"
}
```

### 4. Don't Catch Result Errors

```typescript
// ✅ Good - use .match() or .mapErr()
const result = await authService.login(credentials);
result.match(
  (auth) => console.log(auth),
  (error) => console.error(error)
);

// ❌ Bad - Result types don't throw
try {
  const result = await authService.login(credentials);
} catch (error) {
  // This will never execute
}
```

## Performance Considerations

### Circuit Breaker Impact

When the circuit breaker is open, requests fail immediately without hitting the network. This prevents wasting resources on a failing service.

### Retry Backoff

Exponential backoff prevents overwhelming a recovering service with retry requests. Use custom configuration for time-sensitive operations:

```typescript
const quickClient = createHttpClient({
  retry: { maxAttempts: 1, baseDelay: 0, maxDelay: 0 }
});
```

### Request Cancellation

The HttpClient uses AbortController to cancel requests that exceed the timeout. This prevents memory leaks and zombie requests.

## Security

### Token Storage

- **Current:** Tokens stored in localStorage (XSS vulnerability)
- **Recommended:** Use httpOnly cookies if backend supports it
- **Alternative:** Store in memory only (lost on page refresh)

### CSRF Protection

When using cookies, ensure backend implements CSRF tokens and include them in requests.

### Content Security Policy (CSP)

Configure CSP headers to prevent XSS attacks:

```http
Content-Security-Policy: default-src 'self'; script-src 'self'
```

## Troubleshooting

### "Service is temporarily unavailable"

Circuit breaker is open. Wait for reset timeout (default: 60 seconds) or restart application.

### "Request timed out"

Request exceeded timeout (default: 30 seconds). Check network connection or increase timeout:

```typescript
const client = createHttpClient({ timeout: 60000 });
```

### "No tenant context"

`X-Tenant-ID` header missing. Ensure tenant is stored in localStorage:

```typescript
localStorage.setItem('tenant', JSON.stringify({ id: 'tenant1', name: 'Company' }));
```

### "Expected JSON response from server"

API returned non-JSON content. Check API endpoint and ensure proper Content-Type header.

## Related Documentation

- [Validation Layer](../validation/README.md) - Request/response validation
- [Type System](../types/README.md) - TypeScript types and interfaces
- [Error Handling](../types/errors.ts) - Error type definitions
- [Functional Programming](../types/fp.ts) - Result and AsyncResult types
- [StorageService](./StorageService.ts) - Type-safe localStorage wrapper

