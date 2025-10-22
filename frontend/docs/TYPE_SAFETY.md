# Type Safety Guide

**For**: Development Team  
**Topic**: TypeScript Type System Best Practices  
**Version**: 1.0.0  
**Last Updated**: October 22, 2025

---

## 📚 Table of Contents

1. [Overview](#overview)
2. [Branded Types](#branded-types)
3. [Discriminated Unions](#discriminated-unions)
4. [Exhaustiveness Checking](#exhaustiveness-checking)
5. [Generic Constraints](#generic-constraints)
6. [Pattern Matching](#pattern-matching)
7. [Type Guards](#type-guards)
8. [Best Practices](#best-practices)

---

## Overview

### Goals of Type Safety

1. **Catch errors at compile time**, not runtime
2. **Document intent** through types
3. **Enable IDE support** with autocomplete
4. **Prevent invalid states** from being representable
5. **Self-document code** - types explain behavior

### The 4 Pillars

| Pillar | Purpose | Example |
|--------|---------|---------|
| **Branded Types** | Semantic type safety | `Email` vs `string` |
| **Discriminated Unions** | State representation | `LoginState = Success \| Error` |
| **Exhaustiveness Checking** | All cases covered | `switch` covers all types |
| **Type Guards** | Runtime validation | `asserts user is User` |

---

## Branded Types

### What Are Branded Types?

Branded types add semantic meaning to primitive types at compile time:

```typescript
// Regular string - could be anything
const email: string = 'not-an-email';

// Branded type - specifically an Email
const email: Email = 'not-an-email'; // ❌ TYPE ERROR!
```

### Creating Branded Types

```typescript
// Note: Result is the Either-style result type provided by the neverthrow library
// Import with: import { Result, ok, err } from 'neverthrow';

// Define the brand
type Email = string & { readonly __brand: 'Email' };

// Create branded value
const createEmail = (email: string): Result<Email, ValidationError> => {
  if (!isValidEmail(email)) {
    return err(new ValidationError('Invalid email format'));
  }
  // Safely brand the string
  return ok(email as Email);
};

// Usage
const email = createEmail('user@example.com');
email.match(
  validEmail => sendEmail(validEmail), // TypeScript knows it's valid
  error => showError(error)
);
```

### Common Branded Types in Codebase

```typescript
// Authentication
type Email = string & { readonly __brand: 'Email' };
type Password = string & { readonly __brand: 'Password' };
type UserId = string & { readonly __brand: 'UserId' };
type TenantId = string & { readonly __brand: 'TenantId' };

// Contact Information
type Phone = string & { readonly __brand: 'Phone' };
type ZipCode = string & { readonly __brand: 'ZipCode' };
type Age = number & { readonly __brand: 'Age' };

// Database
type ContactId = string & { readonly __brand: 'ContactId' };
```

### Benefits of Branded Types

✅ **Type Safety**

```typescript
// ❌ WRONG - Mixing IDs
const contact = contacts[userId]; // userId is not ContactId!

// ✅ CORRECT - Type prevents this
const contact = contacts[contactId]; // contactId is ContactId
```

✅ **Self-Documenting**

```typescript
// ❌ Unclear
function updateUser(id: string, data: string): void {}

// ✅ Clear
function updateUser(id: UserId, data: Email): void {}
```

✅ **Validation Guarantee**

```typescript
// ❌ Could be invalid
function sendEmail(email: string): void {
  if (!isValidEmail(email)) throw new Error('Invalid email');
  // ... send
}

// ✅ Must be valid
function sendEmail(email: Email): void {
  // No validation needed - type guarantees validity
  // ... send
}
```

### Anti-Patterns

```typescript
// ❌ WRONG - Branded type in data structure
interface User {
  email: Email; // Should be string in storage
}

// ✅ CORRECT - Validate at boundaries
interface UserDTO {
  email: string;
}

interface User {
  email: Email;
}

const validateUserDTO = (dto: UserDTO): Result<User, ValidationError> =>
  validateEmail(dto.email).map(validEmail => ({
    ...dto,
    email: validEmail
  }));
```

---

## Discriminated Unions

### What Are Discriminated Unions?

Union types with a discriminating field that identifies which variant it is:

```typescript
// ❌ NOT DISCRIMINATED - Must check multiple fields
type LoginResult = 
  | { user: User; error: null }
  | { user: null; error: Error };

// ✅ DISCRIMINATED - Single field identifies variant
type LoginResult = 
  | { type: 'success'; user: User }
  | { type: 'error'; error: Error };
```

### Creating Discriminated Unions

```typescript
// ❌ WRONG - Generic union
type PageState<T> = {
  data?: T;
  error?: Error;
  loading?: boolean;
};

// ✅ CORRECT - Discriminated union
type PageState<T> = 
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'success'; data: T }
  | { type: 'error'; error: Error };
```

### Pattern Matching with Discriminated Unions

```typescript
import { match } from 'ts-pattern';

const render = (state: PageState<User>) =>
  match(state)
    .with({ type: 'idle' }, () => <Empty />)
    .with({ type: 'loading' }, () => <Loading />)
    .with({ type: 'success', data: _ }, (s) => <UserCard user={s.data} />)
    .with({ type: 'error', error: _ }, (s) => <Error error={s.error} />)
    .exhaustive(); // TypeScript ensures all cases handled
```

### Common Discriminated Union Patterns

#### API Response States

```typescript
type ApiResponse<T> = 
  | { type: 'idle' }
  | { type: 'loading'; progress?: number }
  | { type: 'success'; data: T; cached?: boolean }
  | { type: 'error'; error: ApiError; retryable: boolean };
```

#### Form States

```typescript
type FormState = 
  | { type: 'empty' }
  | { type: 'editing'; data: FormData }
  | { type: 'validating' }
  | { type: 'invalid'; errors: ValidationError[] }
  | { type: 'submitting' }
  | { type: 'success'; message: string }
  | { type: 'error'; error: Error };
```

#### Authentication States

```typescript
type AuthState = 
  | { type: 'unauthenticated' }
  | { type: 'authenticating' }
  | { type: 'authenticated'; user: User; token: string }
  | { type: 'error'; error: AuthError };
```

### Benefits

✅ **Exhaustiveness Checking**

```typescript
// TypeScript ensures ALL cases handled
const handler = (state: PageState<T>) => {
  switch (state.type) {
    case 'idle':
      return <Empty />;
    case 'loading':
      return <Loading />;
    case 'success':
      return <Data data={state.data} />; // state.data available
    case 'error':
      return <Error error={state.error} />; // state.error available
    // ❌ TypeScript ERROR if you forgot a case!
  }
};
```

✅ **Type Narrowing**

```typescript
const state: PageState<User> = getPageState();

// In this block, TypeScript KNOWS state is success
if (state.type === 'success') {
  console.log(state.data.name); // ✅ No assertion needed
}

// In this block, TypeScript KNOWS state is error
if (state.type === 'error') {
  console.log(state.error.message); // ✅ Correct type
}
```

---

## Exhaustiveness Checking

### Using Switch

```typescript
// ❌ WRONG - Might forget a case
const handle = (error: ApiError) => {
  switch (error.type) {
    case 'NETWORK_ERROR':
      return 'Network issue';
    case 'TIMEOUT_ERROR':
      return 'Request timeout';
    // Forgot PARSE_ERROR case!
  }
};

// ✅ CORRECT - TypeScript forces handling all cases
const handle = (error: ApiError): string => {
  switch (error.type) {
    case 'NETWORK_ERROR':
      return 'Network issue';
    case 'TIMEOUT_ERROR':
      return 'Request timeout';
    case 'PARSE_ERROR':
      return 'Invalid response';
    case 'HTTP_ERROR':
      return 'Server error';
    // ❌ TypeScript ERROR if you forget a case!
  }
};
```

### Using Pattern Matching

```typescript
import { match } from 'ts-pattern';

const getMessage = (error: ApiError): string =>
  match(error)
    .with({ type: 'NETWORK_ERROR' }, (e) => e.message)
    .with({ type: 'TIMEOUT_ERROR' }, (e) => `Timeout: ${e.timeout}ms`)
    .with({ type: 'PARSE_ERROR' }, (e) => `Invalid: ${e.data}`)
    .with({ type: 'HTTP_ERROR' }, (e) => `HTTP ${e.statusCode}`)
    .exhaustive(); // ❌ TypeScript ERROR if case missing!
```

### Using Never Type

For additional safety in conditional logic:

```typescript
const assertNever = (value: never): never => {
  throw new Error(`Unhandled value: ${value}`);
};

const handle = (state: PageState<User>) => {
  if (state.type === 'idle') {
    // ...
  } else if (state.type === 'loading') {
    // ...
  } else if (state.type === 'success') {
    // ...
  } else if (state.type === 'error') {
    // ...
  } else {
    assertNever(state); // ❌ TypeScript ERROR if case missing!
  }
};
```

---

## Generic Constraints

### Basic Constraints

```typescript
// ❌ WRONG - T could be anything
const getProperty = <T>(obj: T, key: string): any => {
  return obj[key]; // ❌ obj might not have properties
};

// ✅ CORRECT - T must have property key
const getProperty = <T extends Record<string, unknown>>(obj: T, key: string): unknown => {
  return obj[key]; // ✅ Safe
};
```

### Common Constraint Patterns

```typescript
// Must have specific property
const getIdAndName = <T extends { id: string; name: string }>(item: T) => ({
  id: item.id,
  name: item.name
});

// Must be object
const entries = <T extends Record<string, unknown>>(obj: T) =>
  Object.entries(obj);

// Must be array
const first = <T extends unknown[]>(arr: T): T[0] => arr[0];

// Must extend Result
const mapResult = <T, E, R>(
  result: Result<T, E>,
  fn: (t: T) => R
): Result<R, E> => result.map(fn);
```

### Result Generic Constraints

```typescript
// ❌ WRONG - Doesn't constrain error type
const handleResult = <T, E>(result: Result<T, E>) => {
  result.match(
    (value) => console.log(value),
    (error) => console.log(error) // What's the type of error?
  );
};

// ✅ CORRECT - Constrains to error type
type AppError = { message: string; code: string };

const handleResult = <T>(result: Result<T, AppError>) => {
  result.match(
    (value) => console.log(value),
    (error) => console.log(`${error.code}: ${error.message}`)
  );
};
```

> **Note**: Constraining the Result's error generic to a concrete `AppError` (or a shared error union) ensures compile-time consistency of error shape across callers and handlers. This is the recommended pattern when using neverthrow or similar Result libraries. Consider using a shared type alias or concrete error union for your app so all `Result<T, E>` usages carry the same `E` type, enabling proper type-safe handling and autocompletion.

---

## Pattern Matching

### Using ts-pattern

```typescript
import { match, P } from 'ts-pattern';

// Basic matching
const descriptor = match(value)
  .with(P.string, () => 'string')
  .with(P.number, () => 'number')
  .with(P.boolean, () => 'boolean')
  .otherwise(() => 'unknown');

// Discriminated union matching
const handleState = (state: PageState<User>) =>
  match(state)
    .with({ type: 'success' }, (s) => renderUser(s.data))
    .with({ type: 'error' }, (s) => renderError(s.error))
    .with({ type: 'loading' }, () => renderLoading())
    .with({ type: 'idle' }, () => renderEmpty())
    .exhaustive();

// Complex pattern matching
const handler = (data: unknown) =>
  match(data)
    .with(
      { type: 'login', email: P.string, password: P.string },
      (m) => login(m.email, m.password)
    )
    .with(
      { type: 'signup', email: P.string },
      (m) => signup(m.email)
    )
    .with(P._, () => console.error('Invalid data'))
    .exhaustive();
```

### Benefits Over Switch

```typescript
// ❌ Switch - Verbose, error-prone
const handle = (state: PageState<User>) => {
  switch (state.type) {
    case 'success':
      if (!state.data) return null; // Extra guard
      return <UserCard user={state.data} />;
    case 'error':
      if (!state.error) return null; // Extra guard
      return <ErrorCard error={state.error} />;
    // ...
  }
};

// ✅ Pattern Matching - Concise, safe
const handle = (state: PageState<User>) =>
  match(state)
    .with({ type: 'success', data: _ }, (s) => <UserCard user={s.data} />)
    .with({ type: 'error', error: _ }, (s) => <ErrorCard error={s.error} />)
    .exhaustive();
```

---

## Type Guards

### Creating Type Guards

```typescript
// Check if value is User
const isUser = (value: unknown): value is User => {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'name' in value &&
    typeof (value as any).id === 'string' &&
    typeof (value as any).name === 'string'
  );
};

// Usage
const value: unknown = getData();
if (isUser(value)) {
  console.log(value.name); // ✅ TypeScript knows it's User
}
```

### Assertion Guards

```typescript
// Assert value is User, throw if not
const assertIsUser = (value: unknown): asserts value is User => {
  if (!isUser(value)) {
    throw new TypeError('Value is not a User');
  }
};

// Usage
const value: unknown = getData();
assertIsUser(value);
console.log(value.name); // ✅ TypeScript knows it's User after assert
```

### Array Type Guards

```typescript
// Filter out null/undefined
const notEmpty = <T>(value: T | null | undefined): value is T =>
  value !== null && value !== undefined;

// Usage
const users: (User | null)[] = [user1, null, user2, null];
const validUsers = users.filter(notEmpty); // Type: User[]
```

---

## Best Practices

### ✅ DO

1. **Use Branded Types for validated data**

```typescript
// ✅ GOOD
const validateAge = (age: number): Result<Age, ValidationError> => {
  if (age < 0 || age > 150) return err(...);
  return ok(age as Age);
};

const sendBirthdayCard = (age: Age): void => {
  // age is guaranteed valid
};

// ❌ BAD
const sendBirthdayCard = (age: number): void => {
  if (age < 0 || age > 150) throw new Error(...);
};
```

**Use Discriminated Unions for state** - Prevent invalid state combinations:

```typescript
// ✅ GOOD
type FetchState<T> = 
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'success'; data: T }
  | { type: 'error'; error: Error };

// ❌ BAD
type FetchState<T> = {
  data?: T;
  error?: Error;
  loading?: boolean;
};
```

**Use Pattern Matching for state handling** - Express state transitions safely:

```typescript
// ✅ GOOD
match(state)
  .with({ type: 'success' }, (s) => renderData(s.data))
  .with({ type: 'error' }, (s) => renderError(s.error))
  .exhaustive();

// ❌ BAD
if (state.data) {
  renderData(state.data);
} else if (state.error) {
  renderError(state.error);
}
```

**Use Type Guards at boundaries** - Validate untrusted data:

```typescript
// ✅ GOOD - Validate at API boundary
const getUser = (data: unknown): Result<User, ValidationError> => {
  if (!isUser(data)) {
    return err(new ValidationError('Invalid user'));
  }
  return ok(data);
};

// ❌ BAD - No validation
const getUser = (data: unknown): User => {
  return data as User; // Dangerous!
};
```

**Use Generic Constraints** - Limit generic parameters appropriately:

```typescript
// ✅ GOOD - Constrained generics
const getValues = <T extends Record<string, unknown>>(obj: T) =>
  Object.values(obj);

// ❌ BAD - Unconstrained
const getValues = <T>(obj: T) =>
  Object.values(obj as any);
```

### ❌ DON'T

1. **Don't use `any`**

```typescript
// ❌ WRONG - Loses type safety
const handler = (data: any) => {
  return data.foo.bar.baz;
};

// ✅ CORRECT
const handler = (data: unknown) => {
  if (typeof data === 'object' && data !== null && 'foo' in data) {
    return (data as { foo: unknown }).foo;
  }
};
```

**Don't use `as` for unsupported types** - Validate first:

```typescript
// ❌ WRONG
const value = data as User;

// ✅ CORRECT - Check first
if (isUser(data)) {
  const value: User = data; // Now safe
}
```

**Don't skip exhaustiveness checking** - Use ts-pattern or switch fallthrough:

```typescript
// ❌ WRONG - Incomplete cases
const handle = (state: PageState<User>) => {
  if (state.type === 'success') {
    // ...
  }
  // Missing other cases!
};

// ✅ CORRECT - All cases
const handle = (state: PageState<User>) =>
  match(state)
    .with({ type: 'success' }, () => ...)
    .with({ type: 'error' }, () => ...)
    .with({ type: 'loading' }, () => ...)
    .with({ type: 'idle' }, () => ...)
    .exhaustive();
```

**Don't mix branded types with plain types** - Keep types consistent:

```typescript
// ❌ WRONG
const emails: (string | Email)[] = [email1, 'not-validated'];

// ✅ CORRECT
const validatedEmails: Email[] = [email1, email2];
const toValidate: string[] = [raw];
```

---

## Real-World Examples

### Example 1: API Response Handling

```typescript
type ApiResponse<T> = 
  | { type: 'success'; data: T }
  | { type: 'error'; code: string; message: string };

const handleResponse = <T extends { id: string }>(
  response: ApiResponse<T>
): void =>
  match(response)
    .with({ type: 'success', data: { id: P.string } }, (r) => {
      console.log(`Received ${r.data.id}`);
    })
    .with({ type: 'error', code: P.string }, (r) => {
      console.error(`Error: ${r.code} - ${r.message}`);
    })
    .exhaustive();
```

### Example 2: Form State Machine

```typescript
type FormState = 
  | { type: 'empty' }
  | { type: 'editing'; data: FormData }
  | { type: 'validating' }
  | { type: 'invalid'; errors: ValidationError[] }
  | { type: 'submitting' }
  | { type: 'success'; id: string }
  | { type: 'error'; message: string };

const FormComponent = ({ state }: { state: FormState }) =>
  match(state)
    .with({ type: 'empty' }, () => <EmptyForm />)
    .with({ type: 'editing' }, (s) => <EditForm data={s.data} />)
    .with({ type: 'validating' }, () => <LoadingSpinner />)
    .with({ type: 'invalid' }, (s) => <FormErrors errors={s.errors} />)
    .with({ type: 'submitting' }, () => <SubmittingForm />)
    .with({ type: 'success' }, (s) => <SuccessMessage id={s.id} />)
    .with({ type: 'error' }, (s) => <ErrorMessage message={s.message} />)
    .exhaustive();
```

---

## Related Documentation

- **FP Patterns Guide**: See `docs/FP_PATTERNS_GUIDE.md`
- **Error Handling**: See `docs/ERROR_HANDLING.md`
- **Domain Layer**: See `src/domain/`
- **neverthrow**: [https://github.com/supermacro/neverthrow](https://github.com/supermacro/neverthrow)
- **ts-pattern**: [https://github.com/gvergnaud/ts-pattern](https://github.com/gvergnaud/ts-pattern)

---

**Version**: 1.0.0  
**Last Updated**: October 22, 2025  
**Status**: Complete
