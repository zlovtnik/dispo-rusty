# Error Handling Guide

**For**: Development Team  
**Topic**: Result-Based Error Handling  
**Version**: 1.0.0  
**Last Updated**: October 22, 2025

---

## 📚 Table of Contents

1. [Philosophy](#philosophy)
2. [Result vs Throwing](#result-vs-throwing)
3. [Error Types](#error-types)
4. [Error Handling Patterns](#error-handling-patterns)
5. [Common Scenarios](#common-scenarios)
6. [Best Practices](#best-practices)

---

## Philosophy

**Result types make errors explicit and type-safe.**

Instead of hidden exceptions, errors are part of your function's signature:

```typescript
// ❌ HIDDEN ERROR - No way to know it might fail
const getUser = (id: string): User => {...};

// ✅ EXPLICIT ERROR - Type shows what can go wrong
const getUser = (id: string): AsyncResult<User, UserNotFoundError | ApiError> => {...};
```

### Benefits

1. **Type Safety**: TypeScript catches missing error handlers
2. **Explicitness**: Readers know exactly what can fail
3. **Composability**: Chain operations safely with `andThen`
4. **Testability**: Easy to test both success and failure paths
5. **Predictability**: No surprise exceptions at runtime

---

## Result vs Throwing

### When to Use Result

Use `Result<T, E>` for **expected errors**:

```typescript
// ✅ USE RESULT - Expected error
const validateEmail = (email: string): Result<Email, ValidationError> => {
  if (!email.includes('@')) {
    return err(new ValidationError('Invalid email format'));
  }
  return ok(email as Email);
};

// ✅ USE RESULT - API might fail
const getUser = (id: string): AsyncResult<User, ApiError> =>
  api.get(`/users/${id}`);

// ✅ USE RESULT - Business logic validation
const createContact = (data: unknown): Result<Contact, ValidationError[]> =>
  validateContactData(data)
    .map(normalizeContact);
```

### When to Throw

Throw errors for **programming errors** only:

```typescript
// ✅ USE THROW - Programming error
const getArrayElement = <T>(arr: T[], index: number): T => {
  if (index < 0 || index >= arr.length) {
    throw new RangeError(`Index ${index} out of bounds for array of length ${arr.length}`);
  }
  return arr[index];
};

// ✅ USE THROW - Invalid configuration
const connectDB = (url: string): Connection => {
  if (!url) {
    throw new Error('DATABASE_URL is required');
  }
  return new Connection(url);
};

// ✅ USE THROW - Assertion
const assertUser = (user: unknown): asserts user is User => {
  if (typeof user !== 'object' || !('id' in user)) {
    throw new TypeError('Invalid user object');
  }
};
```

### Decision Tree

```text
Is this error expected by the user?
├─ YES → Use Result<T, E>
│  Examples: Validation fails, user not found, API timeout
│
└─ NO → Throw Error
   Examples: Invalid configuration, array out of bounds, null pointer
```

---

## Error Types

### 1. Domain Errors

Errors that represent business logic failures:

```typescript
// ❌ WRONG - Generic
type LoginError = Error;

// ✅ CORRECT - Typed
type LoginError = 
  | { type: 'INVALID_CREDENTIALS'; message: string }
  | { type: 'ACCOUNT_LOCKED'; lockedUntil: Date }
  | { type: 'MFA_REQUIRED'; sessionId: string }
  | { type: 'USER_NOT_FOUND'; message: string };

const login = (creds: Credentials): AsyncResult<AuthResponse, LoginError> => {
  // Implementation
};
```

### 2. API Errors

Errors from HTTP requests:

```typescript
type ApiError = 
  | { type: 'NETWORK_ERROR'; message: string }
  | { type: 'TIMEOUT_ERROR'; timeout: number }
  | { type: 'HTTP_ERROR'; statusCode: number; message: string }
  | { type: 'PARSE_ERROR'; data: unknown; message: string };

const fetchUser = (id: string): AsyncResult<User, ApiError> => {
  // Implementation
};
```

### 3. Validation Errors

Errors from input validation:

```typescript
type ValidationError = {
  type: 'VALIDATION_ERROR';
  message: string;
  field: string;
  value: unknown;
};

type ValidationErrors = ValidationError[];

const validateContactForm = (data: unknown): Result<Contact, ValidationErrors> => {
  // Implementation
};
```

### 4. System Errors

Low-level errors that shouldn't happen:

```typescript
type SystemError = 
  | { type: 'DATABASE_ERROR'; message: string }
  | { type: 'STORAGE_ERROR'; message: string }
  | { type: 'FILE_NOT_FOUND'; path: string }
  | { type: 'PERMISSION_DENIED'; resource: string };
```

---

## Error Handling Patterns

### Pattern 1: Basic Matching

```typescript
const result = await getUser('123');

result.match(
  // Success handler
  (user) => {
    console.log('User:', user);
    navigateToDashboard(user);
  },
  // Error handler
  (error) => {
    console.error('Failed:', error.message);
    showErrorUI(error);
  }
);
```

### Pattern 2: Discriminated Unions

```typescript
const result = await login(credentials);

result.match(
  (auth) => {
    // Successful login
    saveToken(auth.token);
    navigateToDashboard();
  },
  (error) => {
    // Handle specific errors differently
    switch (error.type) {
      case 'INVALID_CREDENTIALS':
        showError('Invalid username or password');
        break;
      case 'ACCOUNT_LOCKED':
        showError(`Account locked until ${error.lockedUntil}`);
        break;
      case 'MFA_REQUIRED':
        showMFADialog(error.sessionId);
        break;
      case 'USER_NOT_FOUND':
        showError('User account not found');
        break;
    }
  }
);
```

### Pattern 3: Chaining Operations

```typescript
// Each operation returns Result
// If any fails, jump to error handler
const workflow = validateInput(data)
  .andThen(validated => transformData(validated))
  .andThen(transformed => saveToAPI(transformed))
  .andThen(saved => reloadFromCache(saved.id))
  .map(reloaded => ({ status: 'success', data: reloaded }))
  .mapErr(error => ({ status: 'error', error: error.message }));

const result = await workflow;
console.log(result);
```

### Pattern 4: Error Recovery

```typescript
// Try primary operation, fall back to secondary
const getUser = (id: string): AsyncResult<User, ApiError> =>
  primaryAPI.getUser(id)
    .orElse(error => {
      // If 404, try secondary API
      if (error.statusCode === 404) {
        return secondaryAPI.getUser(id);
      }
      // For other errors, propagate
      return err(error);
    });
```

### Pattern 5: Error Transformation

```typescript
// Convert one error type to another
const createContact = (data: unknown): AsyncResult<Contact, AppError> =>
  validateContactData(data)
    .mapErr(validationErrors => ({
      type: 'APP_ERROR' as const,
      code: 'VALIDATION_FAILED',
      message: validationErrors.map(e => e.message).join('; '),
      statusCode: 400
    }))
    .andThen(validated => api.createContact(validated))
    .mapErr(apiError => ({
      type: 'APP_ERROR' as const,
      code: 'CREATE_FAILED',
      message: apiError.message,
      statusCode: apiError.statusCode
    }));
```

---

## Common Scenarios

### Scenario 1: Form Validation

```typescript
import { Result, ok, err } from 'neverthrow';
import { validateAll } from '@/utils/validation';

type FormError = {
  field: string;
  message: string;
};

const validateForm = (data: FormData): Result<ValidatedData, FormError[]> => {
  const errors: FormError[] = [];

  // Validate each field
  const emailResult = validateEmail(data.email);
  if (emailResult.isErr()) {
    errors.push({ field: 'email', message: emailResult.error.message });
  }

  const passwordResult = validatePassword(data.password);
  if (passwordResult.isErr()) {
    errors.push({ field: 'password', message: passwordResult.error.message });
  }

  // Return all errors or validated data
  if (errors.length > 0) {
    return err(errors);
  }

  return ok({
    email: emailResult.value,
    password: passwordResult.value
  });
};

// Usage
const handleSubmit = (data: FormData) => {
  const result = validateForm(data);

  result.match(
    (validated) => {
      submitForm(validated);
    },
    (errors) => {
      errors.forEach(({ field, message }) => {
        setFieldError(field, message);
      });
    }
  );
};
```

### Scenario 2: API Data Fetching

```typescript
import { okAsync, errAsync } from 'neverthrow';

type FetchError = 
  | { type: 'NETWORK_ERROR'; message: string }
  | { type: 'PARSE_ERROR'; message: string }
  | { type: 'HTTP_ERROR'; status: number; message: string };

const fetchUsers = (): AsyncResult<User[], FetchError> => {
  return ResultAsync.fromPromise(
    fetch('/api/users'),
    (error) => ({
      type: 'NETWORK_ERROR' as const,
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  )
    .andThen(response => {
      if (!response.ok) {
        return errAsync({
          type: 'HTTP_ERROR' as const,
          status: response.status,
          message: response.statusText
        });
      }
      return okAsync(response.json());
    })
    .andThen(data => {
      try {
        const users = parseUsers(data);
        return okAsync(users);
      } catch (error) {
        return errAsync({
          type: 'PARSE_ERROR' as const,
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
};

// Usage in component
const Users = () => {
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<FetchError | null>(null);

  useEffect(() => {
    fetchUsers().then(result => {
      result.match(
        (users) => {
          setUsers(users);
          setState('success');
        },
        (err) => {
          setError(err);
          setState('error');
        }
      );
    });
  }, []);

  if (state === 'loading') return <Loading />;
  if (state === 'error') return <Error error={error} />;
  return <UserList users={users} />;
};
```

### Scenario 3: Conditional Execution

```typescript
// Execute operation only if result is ok
const processContact = (contact: Contact): AsyncResult<void, AppError> =>
  validateContact(contact)
    .andThen(validated => {
      // Only execute if validation succeeded
      return saveContact(validated)
        .andThen(saved => {
          // Chain more operations
          return notifyContactCreated(saved);
        });
    });
```

### Scenario 4: Error Aggregation

```typescript
// Collect all errors before failing
const validateContactForm = (data: unknown): Result<Contact, ValidationError[]> => {
  const errors: ValidationError[] = [];

  // Validate all fields (don't stop at first error)
  const email = validateEmail(data.email);
  if (email.isErr()) errors.push(email.error);

  const phone = validatePhone(data.phone);
  if (phone.isErr()) errors.push(phone.error);

  const age = validateAge(data.age);
  if (age.isErr()) errors.push(age.error);

  // Return all errors at once
  if (errors.length > 0) {
    return err(errors);
  }

  return ok({
    email: email.value,
    phone: phone.value,
    age: age.value
  });
};
```

---

## Best Practices

### ✅ DO

1. **Use discriminated unions for errors**

```typescript
// ✅ GOOD - Clear error types
type LoginError = 
  | { type: 'INVALID_CREDENTIALS'; message: string }
  | { type: 'USER_NOT_FOUND'; message: string };

// ❌ BAD - Generic error
type LoginError = Error;
```

**Chain operations with andThen** - Use andThen for Result-returning operations:

```typescript
// ✅ GOOD - Railway-oriented
result
  .andThen(data => validate(data))
  .andThen(validated => save(validated))
  .match(success, failure);

// ❌ BAD - Nested matching
result.match(
  data => {
    const validated = validate(data);
    validated.match(
      saved => save(saved),
      err => failure(err)
    );
  },
  failure
);
```

**Transform errors appropriately** - Add context and preserve error information:

```typescript
// ✅ GOOD - Transform error context
validateData(data)
  .mapErr(error => ({
    ...error,
    context: 'form_validation',
    timestamp: new Date()
  }));

// ❌ BAD - Lose error information
validateData(data)
  .mapErr(error => new Error('Failed'));
```

**Handle all error cases** - Always provide both success and error handlers:

```typescript
// ✅ GOOD - All cases handled
result.match(
  (success) => handleSuccess(success),
  (error) => handleError(error)
);

// ❌ BAD - Ignore errors
const value = result.getOrThrow(); // Could throw!
```

**Use type guards for narrowing** - Check error status before accessing values:

```typescript
// ✅ GOOD - Type guards
if (result.isOk()) {
  console.log(result.value);
} else {
  console.log(result.error);
}

// ❌ BAD - Unsafe casting
const value = (result as { value: User }).value;
```

### ❌ DON'T

1. **Don't swallow errors**

```typescript
// ❌ WRONG - Silently ignoring errors
result.match(
  (data) => save(data),
  () => {} // Silently ignore!
);

// ✅ CORRECT - Handle or log
result.match(
  (data) => save(data),
  (error) => logger.error('Operation failed', error)
);
```

**Don't mix Result and throwing** - Choose one approach consistently:

```typescript
// ❌ WRONG - Confusing error handling
const processData = (data: unknown): Result<Data, Error> => {
  try {
    const validated = validateData(data); // Returns Result
    if (validated.isErr()) {
      throw validated.error; // Convert to exception
    }
    return ok(validated.value);
  } catch (error) {
    return err(error);
  }
};

// ✅ CORRECT - Consistent error handling
const processData = (data: unknown): Result<Data, ValidationError> =>
  validateData(data); // Use Result throughout
```

**Don't use error codes as strings** - Use discriminated unions for type safety:

```typescript
// ❌ WRONG - String error codes are fragile
type Error = { code: string };
if (error.code === 'USER_NOT_FOUND') { }

// ✅ CORRECT - Discriminated unions
type Error = { type: 'USER_NOT_FOUND' };
if (error.type === 'USER_NOT_FOUND') { }
```

**Don't lose error details** - Preserve original error information:

```typescript
// ❌ WRONG - Throwing generic error
const processData = (data: unknown) => {
  try {
    return JSON.parse(data);
  } catch (error) {
    throw new Error('Parse failed'); // Lost original error!
  }
};

// ✅ CORRECT - Preserve details
const processData = (data: unknown): Result<unknown, ParseError> => {
  try {
    return ok(JSON.parse(data));
  } catch (error) {
    return err({
      type: 'PARSE_ERROR',
      message: error instanceof Error ? error.message : 'Unknown',
      input: data
    });
  }
};
```

**Don't nest try-catch blocks** - Use Result chaining instead:

```typescript
// ❌ WRONG - Deeply nested
try {
  try {
    try {
      return await operation();
    } catch (e) {
      // Nested handler
    }
  } catch (e) {
    // Nested handler
  }
} catch (e) {
  // Nested handler
}

// ✅ CORRECT - Linear pipeline
operation()
  .andThen(step1)
  .andThen(step2)
  .andThen(step3)
  .match(success, failure);
```

---

## Error Logging

### What to Log

```typescript
// Log with context
logger.error('Operation failed', {
  operation: 'createContact',
  userId: currentUser.id,
  error: error.message,
  errorType: error.type,
  timestamp: new Date(),
  context: data
});
```

### What NOT to Log

```typescript
// ❌ DON'T - Sensitive data
logger.error('Login failed', credentials); // Contains password!

// ❌ DON'T - Entire error objects
logger.error('Request failed', error); // Could be huge

// ✅ DO - Only necessary info
logger.error('Login failed', {
  username: credentials.username,
  reason: error.message,
  errorType: error.type
});
```

---

## Related Documentation

- **FP Patterns Guide**: See `docs/FP_PATTERNS_GUIDE.md`
- **Type Safety**: See `docs/TYPE_SAFETY.md`
- **Result API**: neverthrow documentation
- **Domain Errors**: See `src/domain/`

---

**Version**: 1.0.0  
**Last Updated**: October 22, 2025  
**Status**: Complete
