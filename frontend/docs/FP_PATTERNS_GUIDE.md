# Functional Programming Patterns Guide

**For**: Development Team  
**Status**: Reference Documentation  
**Version**: 1.0.0  
**Last Updated**: October 22, 2025

---

## 📚 Table of Contents

1. [Introduction](#introduction)
2. [Core Concepts](#core-concepts)
3. [Result Type Pattern](#result-type-pattern)
4. [Railway-Oriented Programming](#railway-oriented-programming)
5. [Pure Functions](#pure-functions)
6. [Composition Patterns](#composition-patterns)
7. [Error Handling](#error-handling)
8. [Common Patterns](#common-patterns)
9. [Anti-Patterns](#anti-patterns)
10. [Migration Guide](#migration-guide)
11. [Troubleshooting](#troubleshooting)

---

## Introduction

This guide teaches functional programming patterns used throughout the frontend codebase. These patterns provide:

- **Type Safety**: Compile-time guarantees about error handling
- **Predictability**: No hidden exceptions or side effects
- **Composability**: Easy to combine and reuse functions
- **Testability**: Pure functions are trivial to test
- **Maintainability**: Clear error propagation and handling

---

## Core Concepts

### 1. Immutability

Never modify data in place. Instead, create new values:

```typescript
// ✅ CORRECT - Immutable
const addContact = (contacts: Contact[], newContact: Contact): Contact[] => [
  ...contacts,
  newContact
];

// ❌ WRONG - Mutating input
const addContact = (contacts: Contact[], newContact: Contact): Contact[] => {
  contacts.push(newContact); // Mutation!
  return contacts;
};
```

**Why?** Mutations make code unpredictable and hard to debug.

### 2. Purity

Functions should have no side effects - same inputs always produce same outputs:

```typescript
// ✅ CORRECT - Pure
const calculateAge = (birthDate: Date): number => {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const hasBirthdayPassed = 
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());
  return hasBirthdayPassed ? age : age - 1;
};

// ❌ WRONG - Impure (depends on current time)
let count = 0;
const calculateAge = (birthDate: Date): number => {
  count++; // Side effect!
  return new Date().getFullYear() - birthDate.getFullYear();
};
```

**Why?** Pure functions are predictable, cacheable, and testable.

### 3. Composition

Build complex operations from simple, reusable functions:

```typescript
// ✅ CORRECT - Composed
const getAdultContacts = (contacts: Contact[]): Contact[] =>
  contacts
    .filter(c => calculateAge(c.birthDate) >= 18)
    .map(c => ({ ...c, status: 'adult' as const }));

// ❌ WRONG - One big function
const getAdultContacts = (contacts: Contact[]): Contact[] => {
  const result = [];
  for (const contact of contacts) {
    // ... age calculation logic
    // ... status calculation logic
  }
  return result;
};
```

**Why?** Composition is easier to test, reuse, and refactor.

---

## Result Type Pattern

The `Result<T, E>` type explicitly represents success or failure:

```typescript
import { Result, ok, err } from 'neverthrow';

type Result<T, E> = 
  | { ok: true; value: T }
  | { ok: false; error: E };
```

### Creating Results

```typescript
// Success
const success: Result<User, Error> = ok(user);

// Failure
const failure: Result<User, Error> = err(new Error('Not found'));
```

### Handling Results

```typescript
// Pattern matching (preferred)
const result = await fetchUser('123');

result.match(
  (user) => console.log('Success:', user),
  (error) => console.log('Error:', error.message)
);

// Conditional checking
if (result.isOk()) {
  console.log(result.value);
} else {
  console.log(result.error);
}

// Map transformations
result
  .map(user => user.name)
  .mapErr(error => error.message);
```

### Extracting Values (Unsafe)

```typescript
// Only use if you're CERTAIN the result is ok
const value = result.getOrThrow();

// Use with default
const value = result.getOr(defaultValue);

// Use unwrap helpers
result.unwrapOr(() => defaultValue);
```

---

## Railway-Oriented Programming

Think of success and failure as two parallel "rails". Operations keep you on your current rail:

```text
Success Rail: User -> Validate -> Transform -> Save -> Response
                ↓ (error) → Failure Rail → Error Response
                
Failure Rail: Always flows to error handler
                ↓ (recovery) → Success Rail ↑
```

### Example: Login Flow

```typescript
// Railway-oriented login
const login = async (credentials: Credentials): AsyncResult<AuthResponse, AuthError> => {
  return validateCredentials(credentials)  // Validate -> Success Rail
    .andThen(creds => authenticateUser(creds))  // Auth -> Success Rail
    .andThen(user => createSession(user))  // Create Session -> Success Rail
    .mapErr(error => transformAuthError(error))  // If error, stay on Failure Rail
};

// Usage - single handler for both rails
const result = await login(credentials);

result.match(
  (auth) => navigateToDashboard(auth),  // Success Rail
  (error) => showError(error.message)   // Failure Rail
);
```

### Chaining with `andThen`

```typescript
// Each step returns a Result
// If any step fails, jump to error handler

validateEmail(email)
  .andThen(email => checkEmailAvailable(email))
  .andThen(email => sendVerificationEmail(email))
  .match(
    () => showSuccess('Email sent'),
    (error) => showError(error)
  );
```

---

## Pure Functions

### Guidelines for Writing Pure Functions

1. **Same input = Same output**

```typescript
// ✅ CORRECT
const greet = (name: string): string => `Hello, ${name}`;
greet('Alice') === greet('Alice'); // Always true

// ❌ WRONG
const greet = (name: string): string => 
  `Hello, ${name} at ${new Date().toISOString()}`;
// Output differs each call
```

**No mutations** - Always create new objects instead of modifying existing ones:

```typescript
// ✅ CORRECT
const addAge = (person: Person, years: number): Person => ({
  ...person,
  age: person.age + years
});

// ❌ WRONG
const addAge = (person: Person, years: number): Person => {
  person.age += years;
  return person;
};
```

**No side effects** - Functions should only compute values, not cause external changes:

```typescript
// ✅ CORRECT - Pure
const calculateDiscount = (price: number, percentage: number): number =>
  price * (1 - percentage / 100);

// ❌ WRONG - Impure (logs, network, storage)
const calculateDiscount = (price: number, percentage: number): number => {
  console.log('Calculating...'); // Side effect!
  const discount = price * (1 - percentage / 100);
  analytics.track('discount_calculated'); // Side effect!
  return discount;
};
```

### Handling Necessary Side Effects

When side effects are unavoidable, isolate them:

```typescript
// ✅ CORRECT - Separated
const calculateDiscount = (price: number, percentage: number): number =>
  price * (1 - percentage / 100);

const calculateAndLog = (price: number, percentage: number): number => {
  const discount = calculateDiscount(price, percentage);
  console.log('Discount:', discount); // Side effect in separate function
  return discount;
};

// ✅ CORRECT - Or use Result
const calculateDiscount = (price: number, percentage: number): Result<number, ValidationError> => {
  if (percentage < 0 || percentage > 100) {
    return err(new ValidationError('Invalid percentage'));
  }
  return ok(price * (1 - percentage / 100));
};
```

---

## Composition Patterns

### Pattern 1: Pipe Composition

```typescript
import { pipe } from 'fp-ts/lib/function';

// Build complex operations from simple functions
const processContact = pipe(
  contact,
  validateContact,           // Contact -> Result<Contact, Error>
  result => result.map(formatName),  // Transform
  result => result.map(validateAge),
  result => result.match(
    contact => ({ ...contact, status: 'valid' }),
    error => ({ status: 'invalid', error })
  )
);
```

### Pattern 2: Function Composition with Result

```typescript
// Compose functions that return Results
const validateAndSave = (contact: Contact): AsyncResult<Contact, AppError> =>
  validateContact(contact)
    .andThen(validated => saveContact(validated))
    .andThen(saved => reloadFromDB(saved.id))
    .mapErr(error => transformToAppError(error));
```

### Pattern 3: Array Transformation Pipeline

```typescript
// Transform arrays with multiple operations
const processContacts = (contacts: Contact[]): Result<Contact[], Error> =>
  pipe(
    contacts,
    (cs) => cs.filter(c => c.email), // Filter empty emails
    (cs) => cs.map(formatContact),   // Transform
    (cs) => cs.sort((a, b) => a.name.localeCompare(b.name)),
    (cs) => cs.slice(0, 100) // Paginate
  );
```

---

## Error Handling

### 1. Typed Errors

Always use typed errors, not generic `Error`:

```typescript
// ✅ CORRECT - Typed error
type ValidationError = {
  type: 'VALIDATION_ERROR';
  message: string;
  field: string;
};

type ApiError = {
  type: 'API_ERROR';
  statusCode: number;
  message: string;
};

type AppError = ValidationError | ApiError;

const validateEmail = (email: string): Result<Email, ValidationError> => {
  if (!email.includes('@')) {
    return err({
      type: 'VALIDATION_ERROR',
      message: 'Invalid email format',
      field: 'email'
    });
  }
  return ok(email as Email);
};

// ❌ WRONG - Generic error
const validateEmail = (email: string): Result<Email, Error> => {
  if (!email.includes('@')) {
    return err(new Error('Invalid email')); // Loses information
  }
  return ok(email as Email);
};
```

### 2. Error Recovery

```typescript
// Recover from specific errors
const getUser = (id: string): AsyncResult<User, AppError> =>
  fetchUser(id)
    .orElse(error => {
      if (error.type === 'NOT_FOUND') {
        return createDefaultUser(id); // Recover
      }
      return err(error); // Keep error
    });
```

### 3. Error Transformation

```typescript
// Transform one error type to another
const validateAndSave = (contact: Contact): AsyncResult<Contact, AppError> =>
  validateContact(contact)
    .mapErr(validationError => ({
      type: 'APP_ERROR' as const,
      message: validationError.message,
      statusCode: 400
    }))
    .andThen(validated => saveContact(validated))
    .mapErr(apiError => ({
      type: 'APP_ERROR' as const,
      message: apiError.message,
      statusCode: apiError.statusCode
    }));
```

---

## Common Patterns

### Pattern 1: Validation Pipeline

```typescript
import { validateAll } from '@/utils/validation';

// Validate multiple fields
const validateContactForm = (data: unknown): Result<Contact, ValidationError[]> =>
  validateAll([
    validateEmail(data.email),
    validatePhone(data.phone),
    validateAge(data.age)
  ]);
```

### Pattern 2: Memoized Computation

```typescript
import { memoize } from '@/utils/memoization';

// Cache expensive pure functions
const getContactSummary = memoize((contact: Contact): string => {
  // Expensive computation
  return `${contact.name} - ${contact.email}`;
}, { cacheSize: 256 });

getContactSummary(contact1); // Computed
getContactSummary(contact1); // From cache
```

### Pattern 3: Lazy Evaluation

```typescript
import { lazy } from '@/utils/lazy';

// Defer computation until needed
const lazyData = lazy(() => {
  // Expensive computation
  return processLargeDataset();
});

// Later when needed:
const result = lazyData.value; // Computed on first access
const cached = lazyData.value; // From cache
```

### Pattern 4: Component Memoization

```typescript
import { memoizeComponent } from '@/utils/reactMemoization';

// Prevent unnecessary re-renders
const MemoUserCard = memoizeComponent(
  UserCard,
  (prev, next) => prev.userId === next.userId
);

// Only re-renders if userId changes
```

### Pattern 5: Form Validation

```typescript
import { useFormValidation } from '@/hooks/useFormValidation';

// React hook for form validation
const form = useFormValidation({
  fields: {
    email: validateEmail,
    password: validatePassword
  }
});

form.validate({ email: 'user@example.com', password: 'pass123' })
  .match(
    validData => submitForm(validData),
    errors => showErrors(errors)
  );
```

---

## Anti-Patterns

### ❌ 1. Try-Catch for Expected Errors

```typescript
// ❌ WRONG - Using exceptions for flow control
const getUser = async (id: string): Promise<User> => {
  try {
    return await api.getUser(id);
  } catch (error) {
    if (error.statusCode === 404) {
      // Expected error, shouldn't throw
      return null; // What about type safety?
    }
    throw error; // Re-throw unexpected errors?
  }
};

// ✅ CORRECT - Use Result type
const getUser = (id: string): AsyncResult<User | null, ApiError> =>
  api.getUser(id)
    .orElse(error => 
      error.statusCode === 404 
        ? ok(null)
        : err(error)
    );
```

### ❌ 2. Mutating Shared State

```typescript
// ❌ WRONG - Mutating input
const addTag = (contact: Contact, tag: string): Contact => {
  contact.tags.push(tag); // Mutation affects original!
  return contact;
};

// ✅ CORRECT - Return new object
const addTag = (contact: Contact, tag: string): Contact => ({
  ...contact,
  tags: [...contact.tags, tag]
});
```

### ❌ 3. Losing Error Information

```typescript
// ❌ WRONG - Generic error
const processData = (data: unknown): Result<Data, Error> => {
  try {
    return ok(parseData(data));
  } catch (error) {
    return err(new Error('Failed')); // Lost original error!
  }
};

// ✅ CORRECT - Preserve error details
const processData = (data: unknown): Result<Data, ParseError> => {
  try {
    return ok(parseData(data));
  } catch (error) {
    return err({
      type: 'PARSE_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
      data: data
    });
  }
};
```

### ❌ 4. Nested Try-Catch

```typescript
// ❌ WRONG - Multiple try-catch levels
const complexOperation = async (): Promise<Result<Data, Error>> => {
  try {
    try {
      try {
        return ok(await api.call());
      } catch (e1) {
        return err(e1);
      }
    } catch (e2) {
      return err(e2);
    }
  } catch (e3) {
    return err(e3);
  }
};

// ✅ CORRECT - Single pipeline
const complexOperation = (): AsyncResult<Data, ApiError> =>
  api.call()
    .andThen(data => validate(data))
    .andThen(validated => transform(validated))
    .mapErr(error => handleError(error));
```

### ❌ 5. Side Effects in Selectors

```typescript
// ❌ WRONG - Side effect in selector
const userSelector = (state: AppState): User => {
  analytics.track('user_selected'); // Side effect!
  return state.user;
};

// ✅ CORRECT - Pure selector
const userSelector = (state: AppState): User => state.user;

// Side effect handled separately
const trackUserSelection = (user: User): void => {
  analytics.track('user_selected', { userId: user.id });
};
```

### ❌ 6. Uncaught Async Errors

```typescript
// ❌ WRONG - Promise rejection unhandled
const deleteContact = (id: string): Promise<void> => {
  return api.deleteContact(id); // What if it rejects?
};

// ✅ CORRECT - Handle rejection
const deleteContact = (id: string): AsyncResult<void, ApiError> =>
  api.deleteContact(id)
    .mapErr(error => handleApiError(error));
```

---

## Migration Guide

### Step 1: Identify Problematic Code

Look for:

- Try-catch blocks for expected errors
- Untyped error handling
- Mutation of inputs
- Uncaught promise rejections
- Functions with side effects

### Step 2: Convert to Result Types

```typescript
// BEFORE
const validateEmail = (email: string): boolean => {
  return email.includes('@');
};

const login = async (email: string, password: string): Promise<User> => {
  if (!validateEmail(email)) {
    throw new Error('Invalid email');
  }
  return await api.login(email, password);
};

// AFTER
const validateEmail = (email: string): Result<Email, ValidationError> => {
  if (!email.includes('@')) {
    return err({ type: 'VALIDATION_ERROR', message: 'Invalid email' });
  }
  return ok(email as Email);
};

const login = (email: string, password: string): AsyncResult<User, AuthError> =>
  validateEmail(email)
    .andThen(validEmail => authenticateUser(validEmail, password))
    .mapErr(error => transformToAuthError(error));
```

### Step 3: Update Callers

```typescript
// BEFORE
try {
  const user = await login(email, password);
  console.log('Logged in:', user);
} catch (error) {
  console.error('Login failed:', error.message);
}

// AFTER
const result = await login(email, password);

result.match(
  (user) => console.log('Logged in:', user),
  (error) => console.error('Login failed:', error.message)
);
```

### Step 4: Gradual Rollout

1. Start with utility functions
2. Move to service layer
3. Update hooks
4. Finally update components

**Don't** migrate everything at once - it's safer to do it incrementally.

---

## Troubleshooting

### Q: How do I use Result in React hooks?

**A:** Use `useAsync` hook:

```typescript
const { state, error, isLoading } = useAsync(
  () => fetchUser(userId),
  [userId]
);

state.match(
  (user) => <UserCard user={user} />,
  (error) => <ErrorDisplay error={error} />
);
```

### Q: What's the difference between `map` and `andThen`?

**A:**

- `map`: Transform the value without wrapping in Result
- `andThen`: Chain operations that return Result

```typescript
result
  .map(x => x + 1)        // Transform value: T -> R
  .andThen(x => ok(x * 2)) // Chain Result: T -> Result<R, E>
```

### Q: Can I throw errors in FP code?

**A:** No, always return `Result` or `err()`:

```typescript
// ❌ WRONG
const validateAge = (age: number): Age => {
  if (age < 0) throw new Error('Invalid age');
  return age as Age;
};

// ✅ CORRECT
const validateAge = (age: number): Result<Age, ValidationError> => {
  if (age < 0) {
    return err({ type: 'VALIDATION_ERROR', message: 'Age cannot be negative' });
  }
  return ok(age as Age);
};
```

### Q: How do I test FP code?

**A:** Very easily - it's pure!

```typescript
import { expect, it } from 'bun:test';

it('validates email correctly', () => {
  const validEmail = validateEmail('user@example.com');
  expect(validEmail.isOk()).toBe(true);
  
  const invalidEmail = validateEmail('not-an-email');
  expect(invalidEmail.isErr()).toBe(true);
});
```

### Q: Should I always return Result?

**A:** For error-prone operations, yes. For guaranteed-to-work functions, no:

```typescript
// ✅ Return Result - error-prone
const parseJson = (json: string): Result<unknown, ParseError> => {...};

// ✅ Just return value - can't fail
const formatName = (first: string, last: string): string => 
  `${first} ${last}`;
```

---

## 📚 Further Reading

- **Error Handling Deep Dive**: See `/docs/ERROR_HANDLING.md`
- **Type Safety Guide**: See `/docs/TYPE_SAFETY.md`
- **Code Examples**: See `src/domain/` for real-world FP code
- **Utilities Reference**: See `src/utils/README.md`

---

**Version**: 1.0.0  
**Last Updated**: October 22, 2025  
**Status**: Complete
