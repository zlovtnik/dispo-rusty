# Phase 5: Quick Reference Guide

## Hook Overview

### useAsync<T, E>

**Purpose:** Manage async operations with Result types

```typescript
const { loading, result, execute, reset } = useAsync(
  () => authService.login(credentials),
  [credentials]
);
```

**When to use:**
- Single async operation
- Need manual execution control
- Require Result-based error handling

---

### useValidation<T, E>

**Purpose:** Synchronous validation with railway pattern

```typescript
const email = useValidation('', [validateEmail], {
  validateOnChange: true
});
```

**When to use:**
- Single field validation
- Real-time validation feedback
- Need validation state tracking

---

### useFormValidation<T>

**Purpose:** Complete form validation with multiple fields

```typescript
const form = useFormValidation<ContactForm>({
  initialValues: { email: '', phone: '' },
  validators: {
    email: [validateEmail],
    phone: [validatePhone],
  },
  mode: 'onChange',
});
```

**When to use:**
- Multi-field forms
- Need touched/dirty tracking
- Form-level validation required

---

### useApiCall<T, E>

**Purpose:** API calls with retry logic

```typescript
const { loading, result, execute } = useApiCall(
  () => contactService.getAll(),
  {
    retryOnError: true,
    maxRetries: 3,
    onSuccess: (data) => console.log('Success!'),
  }
);
```

**When to use:**
- Need automatic retry
- Want success/error callbacks
- Require Result transformation

---

### useFetch<T>

**Purpose:** Declarative data fetching

```typescript
const { data, loading, error, refetch } = useFetch<User>(
  `/api/users/${userId}`,
  {
    timeout: 5000,
    retries: 3,
  }
);
```

**When to use:**
- Automatic fetching on mount
- Simple GET requests
- Need refetch capability

---

## Common Patterns

### Pattern: Login Flow

```typescript
function LoginPage() {
  const navigate = useNavigate();
  
  const { loading, result, execute } = useAsync(
    () => authService.login(credentials)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await execute();
    
    result.match(
      (user) => navigate('/dashboard'),
      (error) => toast.error(error.message)
    );
  };

  return (
    <Form onSubmit={handleSubmit}>
      <Button loading={loading} type="submit">
        Sign In
      </Button>
    </Form>
  );
}
```

### Pattern: Data List with Retry

```typescript
function ContactList() {
  const { loading, result, execute } = useApiCall(
    () => contactService.getAll(),
    {
      retryOnError: true,
      maxRetries: 3,
    }
  );

  useEffect(() => {
    execute();
  }, [execute]);

  return result?.match(
    (contacts) => <List data={contacts} />,
    (error) => <ErrorDisplay error={error} onRetry={execute} />
  ) ?? <Loading />;
}
```

### Pattern: Form with Validation

```typescript
function ContactForm() {
  const form = useFormValidation<ContactForm>({
    initialValues: { email: '', phone: '', name: '' },
    validators: {
      email: [validateEmail],
      phone: [validatePhone],
    },
    mode: 'onChange',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const result = form.actions.validateForm();
    
    result.match(
      (values) => submitContact(values),
      (errors) => console.error('Validation failed', errors)
    );
  };

  return (
    <form onSubmit={handleSubmit}>
      <Input
        name="email"
        value={form.fields.email.value}
        onChange={(e) => form.actions.setFieldValue('email', e.target.value)}
        error={form.fields.email.touched ? form.fields.email.validation.error : undefined}
      />
      
      <Button type="submit" disabled={!form.form.isValid}>
        Submit
      </Button>
    </form>
  );
}
```

### Pattern: Optimistic Updates

```typescript
function ContactManager() {
  const [optimisticData, setOptimisticData] = useState<Contact[]>([]);
  const { data, refetch } = useFetch<Contact[]>('/api/contacts');

  const displayData = optimisticData.length > 0 ? optimisticData : data;

  const updateContact = async (id: string, updates: Partial<Contact>) => {
    // Optimistic update
    setOptimisticData(data?.map(c => 
      c.id === id ? { ...c, ...updates } : c
    ) ?? []);

    // API call
    const result = await contactService.update(id, updates);
    
    result.match(
      () => {
        refetch();
        setOptimisticData([]);
      },
      () => setOptimisticData([]) // Rollback
    );
  };

  return <ContactList contacts={displayData} onUpdate={updateContact} />;
}
```

### Pattern: Parallel API Calls

```typescript
function Dashboard() {
  const { result: userData } = useApiCall(() => api.fetchUserData());
  const { result: settings } = useApiCall(() => api.fetchSettings());
  const { result: notifications } = useApiCall(() => api.fetchNotifications());

  // Combine results
  const combinedResult = Result.combine([
    userData ?? err({ type: 'business', message: 'No data' }),
    settings ?? err({ type: 'business', message: 'No settings' }),
    notifications ?? err({ type: 'business', message: 'No notifications' }),
  ]);

  return combinedResult.match(
    ([user, settings, notifications]) => (
      <DashboardView
        user={user}
        settings={settings}
        notifications={notifications}
      />
    ),
    (error) => <ErrorDisplay error={error} />
  );
}
```

### Pattern: Error Boundary with Recovery

```typescript
import { ErrorBoundary } from '@/components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        // Report to error tracking service
        Sentry.captureException(error, { contexts: { react: errorInfo } });
      }}
      onResultError={(result) => {
        if (result.isErr()) {
          const error = result.error;
          
          // Custom handling for auth errors
          if (error.type === 'auth') {
            return <RedirectToLogin />;
          }
          
          // Custom handling for network errors
          if (error.type === 'network' && error.retryable) {
            return <RetryableError error={error} />;
          }
        }
        return null;
      }}
    >
      <Routes />
    </ErrorBoundary>
  );
}
```

## ErrorBoundary Usage

### Basic Usage

```typescript
<ErrorBoundary>
  <YourComponent />
</ErrorBoundary>
```

### With Custom Error Handler

```typescript
<ErrorBoundary
  onError={(error, errorInfo) => {
    logErrorToService(error, errorInfo);
  }}
>
  <YourComponent />
</ErrorBoundary>
```

### Using HOC

```typescript
const SafeComponent = withErrorBoundary(MyComponent, {
  onError: (error) => reportError(error),
});
```

## Result Type Patterns

### Matching on Result

```typescript
result.match(
  (data) => console.log('Success:', data),
  (error) => console.error('Error:', error)
);
```

### Transforming Result

```typescript
const transformed = result.map((data) => ({
  ...data,
  fullName: `${data.firstName} ${data.lastName}`
}));
```

### Chaining Results

```typescript
const final = result
  .map(sanitizeData)
  .map(transformData)
  .map(enrichData);
```

### Combining Results

```typescript
const combined = Result.combine([result1, result2, result3]);

combined.match(
  ([data1, data2, data3]) => console.log('All success'),
  (error) => console.error('At least one failed')
);
```

### Async Result

```typescript
const asyncResult = ResultAsync.fromPromise(
  fetch('/api/data'),
  (error) => ({ type: 'network', message: String(error) })
);

await asyncResult.match(
  (response) => console.log('Success'),
  (error) => console.error('Failed')
);
```

## Best Practices

### ✅ DO

- Use `useAsync` for manual execution control
- Use `useFetch` for automatic fetching on mount
- Use `useApiCall` when you need retry logic
- Always handle both success and error cases with `.match()`
- Use pattern matching for complex error handling
- Implement optimistic updates for better UX
- Add error boundaries at strategic points in component tree

### ❌ DON'T

- Don't mix imperative and FP patterns
- Don't use `.unwrap()` without checking `.isOk()` first
- Don't forget to handle loading states
- Don't ignore TypeScript errors
- Don't skip validation on user input
- Don't nest too many `.map()` calls (use pipe instead)

## TypeScript Tips

### Generic Constraints

```typescript
// Ensure T extends object
function useFormValidation<T extends Record<string, unknown>>(...)

// Ensure E extends AppError
function useAsync<T, E extends AppError>(...)
```

### Type Inference

```typescript
// TypeScript infers Contact type
const { data } = useFetch<Contact>('/api/contacts/1');

// data is Contact | null
if (data) {
  console.log(data.name); // ✅ Type-safe
}
```

### Discriminated Unions

```typescript
type AppError =
  | { type: 'network'; message: string; retryable: boolean }
  | { type: 'auth'; message: string }
  | { type: 'business'; message: string; code: string }
  | { type: 'validation'; errors: ValidationError[] };

// Exhaustive pattern matching
function handleError(error: AppError) {
  switch (error.type) {
    case 'network':
      return handleNetworkError(error); // error.retryable is available
    case 'auth':
      return handleAuthError(error);
    case 'business':
      return handleBusinessError(error); // error.code is available
    case 'validation':
      return handleValidationError(error); // error.errors is available
  }
}
```

## Troubleshooting

### Hook returns null result

**Problem:** `result` is `null` even after calling `execute()`

**Solution:** Check if async operation completed and returned a Result

```typescript
const { result, execute } = useAsync(asyncFn);

useEffect(() => {
  execute(); // Don't forget to call execute!
}, []);

if (!result) return <Loading />; // Handle null case
```

### Validation not triggering

**Problem:** Form validation not running on change

**Solution:** Set `validateOnChange: true` or use correct validation mode

```typescript
const form = useFormValidation({
  // ...
  mode: 'onChange', // or 'onBlur' or 'onSubmit'
});
```

### Retry logic not working

**Problem:** API calls not retrying on failure

**Solution:** Enable `retryOnError` and check error type

```typescript
const { execute } = useApiCall(apiFunc, {
  retryOnError: true, // Must be true
  maxRetries: 3,
});
```

### Memory leaks on unmount

**Problem:** State updates after component unmounts

**Solution:** Hooks already handle cleanup with AbortController

```typescript
// This is handled automatically by useAsync/useFetch
// No manual cleanup needed!
```

## Migration Checklist

- [ ] Replace useState/useEffect combos with useAsync
- [ ] Replace manual validation with useValidation
- [ ] Replace fetch calls with useFetch
- [ ] Add ErrorBoundary at app root
- [ ] Convert error handling to Result types
- [ ] Add pattern matching for complex errors
- [ ] Implement optimistic updates where appropriate
- [ ] Add retry logic to critical API calls
- [ ] Test all error scenarios
- [ ] Update tests to use Result types

## Next Steps

1. **Review Phase 5 implementation guide** for detailed examples
2. **Add tests** for all hooks in your components
3. **Migrate existing components** to use new hooks
4. **Proceed to Phase 6:** Business Logic Extraction
