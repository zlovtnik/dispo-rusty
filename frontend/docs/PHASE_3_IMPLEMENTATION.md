# Phase 3: State Management Refactoring - Implementation Guide

## Overview

Phase 3 of the FP transformation introduces Result types and railway-oriented programming to the authentication flow. This document provides a comprehensive guide to the implementation.

## What Was Implemented

### 3.1 AuthContext Transformation ✅

The authentication context has been refactored to use functional programming patterns:

- **File**: `frontend/src/contexts/AuthContext.fp.tsx`
- **Result Types**: All operations return `Result<T, E>` instead of throwing exceptions
- **Railway-Oriented Programming**: Login flow uses `.andThen()` and `.map()` for sequential validation
- **Type-Safe Error Handling**: Discriminated union types for all error scenarios

#### Key Features

1. **Validation Pipeline for Credentials**
   ```typescript
   const validationResult = validateLoginCredentials(
     credentials.usernameOrEmail,
     credentials.password,
     tenantId
   );
   ```

2. **Result Chaining for Login**
   ```typescript
   return validateCredentials()
     .andThen(() => callLoginAPI())
     .andThen((response) => decodeJWT(response.token))
     .andThen((payload) => extractUserTenant(payload))
     .andThen((data) => saveToStorage(data))
     .map(() => updateState(data));
   ```

3. **Token Refresh with Result Composition**
   ```typescript
   const refreshResult = await attemptTokenRefresh(storedUser, storedTenant);
   if (refreshResult.isOk()) {
     const authState = refreshResult.value;
     // Use validated data
   }
   ```

### 3.2 Storage Abstractions ✅

Type-safe storage operations with Result-based API:

- **File**: `frontend/src/services/StorageService.ts`
- **No Exceptions**: All operations return `Result<T, StorageError>`
- **Type Safety**: Enum-based storage keys prevent typos
- **Versioning**: Built-in support for storage migrations

#### API

```typescript
class StorageService {
  get<T>(key: StorageKey): Result<T, StorageError>
  set<T>(key: StorageKey, value: T): Result<void, StorageError>
  remove(key: StorageKey): Result<void, StorageError>
  clear(): Result<void, StorageError>
}

enum StorageKey {
  AUTH_TOKEN = 'auth_token',
  USER = 'user',
  TENANT = 'tenant',
  // ...
}
```

#### Usage Example

```typescript
import { storageService, StorageKey } from '../services/StorageService';

// Get value
const userResult = storageService.get<User>(StorageKey.USER);
userResult.match(
  (user) => console.log('User:', user.username),
  (error) => console.error('Error:', formatStorageError(error))
);

// Set value
const saveResult = storageService.set(StorageKey.USER, user);
if (saveResult.isErr()) {
  console.error('Failed to save:', saveResult.error);
}

// Remove value
const removeResult = storageService.remove(StorageKey.AUTH_TOKEN);
```

### 3.3 Validation Utilities ✅

Pure validation functions for credentials:

- **File**: `frontend/src/utils/validation.ts`
- **Branded Types**: Validated values have unique types
- **Composable**: Combine validators with `.andThen()`
- **Descriptive Errors**: Each error includes context

#### API

```typescript
validateUsername(username: string): Result<ValidatedUsername, CredentialValidationError>
validatePassword(password: string): Result<ValidatedPassword, CredentialValidationError>
validateTenantId(tenantId: string): Result<TenantId, CredentialValidationError>
validateEmail(email: string): Result<ValidatedEmail, CredentialValidationError>

validateLoginCredentials(
  username: string,
  password: string,
  tenantId?: string
): Result<ValidatedCredentials, CredentialValidationError>
```

#### Usage Example

```typescript
import { validateLoginCredentials } from '../utils/validation';
import { formatCredentialValidationError } from '../types/errors';

const result = validateLoginCredentials('john_doe', 'MyP@ssw0rd', 'tenant1');

result.match(
  (validated) => {
    // All fields validated - safe to use
    console.log('Username:', validated.username);
  },
  (error) => {
    // Show user-friendly error message
    alert(formatCredentialValidationError(error));
  }
);
```

### 3.4 Parsing Utilities ✅

Type-safe parsing for JWT and stored data:

- **File**: `frontend/src/utils/parsing.ts`
- **JWT Decoding**: Validate token structure and expiry
- **Data Validation**: Ensure stored data matches expected schema
- **Token Verification**: Cross-reference JWT with stored data

#### API

```typescript
decodeJwtPayload(token: string): Result<JwtPayload, ParseError>
checkTokenExpiry(payload: JwtPayload): Result<void, ParseError>
parseStoredUser(raw: string): Result<User, ParseError>
parseStoredTenant(raw: string): Result<Tenant, ParseError>
verifyDataMatchesToken(user: User, tenant: Tenant, payload: JwtPayload): Result<void, ParseError>
```

#### Usage Example

```typescript
import { decodeJwtPayload, checkTokenExpiry } from '../utils/parsing';

const payloadResult = decodeJwtPayload(token);

payloadResult
  .andThen((payload) => checkTokenExpiry(payload).map(() => payload))
  .match(
    (payload) => console.log('Valid token for user:', payload.user),
    (error) => console.error('Invalid token:', formatParseError(error))
  );
```

### 3.5 Error Types ✅

Comprehensive error types for all scenarios:

- **File**: `frontend/src/types/errors.ts` (extended)
- **Discriminated Unions**: Pattern matching on error types
- **Helper Functions**: Factory functions for creating errors
- **Formatters**: User-friendly error messages

#### Error Types

```typescript
type StorageError =
  | { type: 'NOT_FOUND'; key: string }
  | { type: 'PARSE_ERROR'; key: string; reason: string }
  | { type: 'STRINGIFY_ERROR'; key: string; reason: string }
  | { type: 'QUOTA_EXCEEDED'; key: string }
  | { type: 'STORAGE_UNAVAILABLE'; reason: string };

type ParseError =
  | { type: 'INVALID_JSON'; raw: string; reason: string }
  | { type: 'INVALID_JWT_FORMAT'; token: string }
  | { type: 'MISSING_JWT_FIELDS'; fields: string[] }
  | { type: 'EXPIRED_TOKEN'; exp: number; now: number }
  | { type: 'INVALID_USER_STRUCTURE'; reason: string }
  | { type: 'INVALID_TENANT_STRUCTURE'; reason: string };

type CredentialValidationError =
  | { type: 'EMPTY_USERNAME' }
  | { type: 'USERNAME_TOO_SHORT'; min: number; actual: number }
  | { type: 'PASSWORD_TOO_WEAK'; requirements: string[] }
  // ...

type AuthFlowError =
  | { type: 'INVALID_CREDENTIALS'; message: string }
  | { type: 'TOKEN_EXPIRED' }
  | { type: 'UNAUTHORIZED'; message: string }
  // ...
```

#### Usage with Pattern Matching

```typescript
import { match } from 'ts-pattern';

const result = validateUsername(input);

result.match(
  (username) => console.log('Valid:', username),
  (error) => {
    const message = match(error)
      .with({ type: 'EMPTY_USERNAME' }, () => 'Please enter a username')
      .with({ type: 'USERNAME_TOO_SHORT' }, (e) => `Username must be at least ${e.min} characters`)
      .with({ type: 'USERNAME_TOO_LONG' }, (e) => `Username must be at most ${e.max} characters`)
      .otherwise(() => 'Invalid username format');
    
    console.error(message);
  }
);
```

## Migration Guide

### Updating Existing Code

To migrate from the old AuthContext to the new FP version:

1. **Update Import**
   ```typescript
   // Old
   import { useAuth } from '../contexts/AuthContext';
   
   // New
   import { useAuth } from '../contexts/AuthContext.fp';
   ```

2. **Handle Login Result**
   ```typescript
   // Old
   try {
     await login(credentials);
     navigate('/dashboard');
   } catch (error) {
     setError(error.message);
   }
   
   // New
   const result = await login(credentials);
   result.match(
     () => navigate('/dashboard'),
     (error) => setError(formatAuthFlowError(error))
   );
   ```

3. **Handle Logout Result**
   ```typescript
   // Old
   await logout();
   navigate('/login');
   
   // New
   const result = await logout();
   result.match(
     () => navigate('/login'),
     (error) => console.error('Logout failed:', error)
   );
   // Note: Logout always clears local data even on server failure
   navigate('/login'); // Can navigate regardless
   ```

4. **Use Error State**
   ```typescript
   const { error, clearError } = useAuth();
   
   useEffect(() => {
     if (error) {
       message.error(error);
       clearError();
     }
   }, [error, clearError]);
   ```

## Testing

### Unit Tests

Test files to create:

1. **StorageService Tests**
   ```typescript
   // frontend/src/services/StorageService.test.ts
   describe('StorageService', () => {
     test('get returns Ok for existing key', () => {
       const result = storage.get(StorageKey.USER);
       expect(result.isOk()).toBe(true);
     });
     
     test('get returns Err for missing key', () => {
       const result = storage.get('nonexistent');
       expect(result.isErr()).toBe(true);
       expect(result._unsafeUnwrapErr().type).toBe('NOT_FOUND');
     });
   });
   ```

2. **Validation Tests**
   ```typescript
   // frontend/src/utils/validation.test.ts
   describe('validateUsername', () => {
     test('returns Ok for valid username', () => {
       const result = validateUsername('john_doe');
       expect(result.isOk()).toBe(true);
     });
     
     test('returns Err for empty username', () => {
       const result = validateUsername('');
       expect(result.isErr()).toBe(true);
       expect(result._unsafeUnwrapErr().type).toBe('EMPTY_USERNAME');
     });
   });
   ```

3. **Parsing Tests**
   ```typescript
   // frontend/src/utils/parsing.test.ts
   describe('decodeJwtPayload', () => {
     test('decodes valid JWT', () => {
       const result = decodeJwtPayload(validToken);
       expect(result.isOk()).toBe(true);
     });
     
     test('returns Err for invalid JWT', () => {
       const result = decodeJwtPayload('invalid');
       expect(result.isErr()).toBe(true);
     });
   });
   ```

### Integration Tests

Test the complete authentication flow:

```typescript
describe('Authentication Flow', () => {
  test('successful login saves data and updates state', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    
    const loginResult = await result.current.login({
      usernameOrEmail: 'test@example.com',
      password: 'Test@1234',
    });
    
    expect(loginResult.isOk()).toBe(true);
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).not.toBeNull();
  });
  
  test('failed login shows validation error', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    
    const loginResult = await result.current.login({
      usernameOrEmail: '',
      password: '',
    });
    
    expect(loginResult.isErr()).toBe(true);
    const error = loginResult._unsafeUnwrapErr();
    expect(error.type).toBe('EMPTY_USERNAME');
  });
});
```

## Benefits

### Type Safety

- **Compile-Time Checks**: TypeScript catches errors before runtime
- **Exhaustive Pattern Matching**: Ensure all error cases handled
- **No `any` Types**: Strict typing throughout

### Error Handling

- **No Try-Catch**: Result types replace exceptions
- **Railway-Oriented**: Errors propagate automatically
- **Descriptive**: Each error carries context

### Maintainability

- **Pure Functions**: Easier to test and reason about
- **Separation of Concerns**: Validation, parsing, storage separate
- **Composable**: Build complex flows from simple functions

### Developer Experience

- **IntelliSense**: Better autocomplete in IDE
- **Refactoring**: Type-safe refactoring with confidence
- **Documentation**: Self-documenting code with types

## Next Steps

1. **Update LoginPage**: Migrate to use new error handling
2. **Add Unit Tests**: Comprehensive test coverage
3. **Performance**: Benchmark vs old implementation
4. **Documentation**: Update developer guide

## References

- [neverthrow Documentation](https://github.com/supermacro/neverthrow)
- [Railway Oriented Programming](https://fsharpforfunandprofit.com/rop/)
- [Branded Types in TypeScript](https://egghead.io/blog/using-branded-types-in-typescript)
- [ADR-001: Functional Patterns](../../docs/ADR-001-FUNCTIONAL-PATTERNS.md)

## Troubleshooting

### Common Issues

**Issue**: Type errors when calling `.andThen()` or `.map()`
**Solution**: Ensure the function returns a `Result` type, not a plain value

**Issue**: Storage errors not handled
**Solution**: Always call `.match()` or check `.isErr()` on Result

**Issue**: Validation errors not user-friendly
**Solution**: Use `format*Error()` functions from `types/errors.ts`

## Changelog

### 2025-10-13
- ✅ Created StorageService with Result-based API
- ✅ Implemented validation utilities for credentials
- ✅ Created parsing utilities for JWT and data
- ✅ Extended error types for FP patterns
- ✅ Refactored AuthContext with railway-oriented programming
- ✅ Added comprehensive documentation

### Next Phase

Phase 4 will focus on:
- Form validation with Result types
- API layer refactoring
- Component layer updates
- Business logic extraction
