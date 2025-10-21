# Custom React Hooks

This directory contains custom React hooks following Railway-Oriented Programming principles with `Result` types for type-safe async operations and state management.

## Philosophy

All hooks in this directory follow these principles:

1. **Result-Based**: Return `Result<T, E>` or `AsyncResult<T, E>` instead of throwing errors
2. **Pure Functions**: Side effects are isolated and explicit
3. **Composable**: Hooks can be combined to build complex functionality
4. **Type-Safe**: Full TypeScript support with strict typing
5. **Testable**: Pure functional approach makes testing straightforward

## Available Hooks

### Data Fetching & Async Operations

#### `useAsync<T, E>`

Foundation for async operations with Railway-Oriented Programming.

```typescript
import { useAsync } from './hooks/useAsync';

function MyComponent() {
  const fetchData = useCallback(async () => {
    return apiCall(); // Returns AsyncResult<Data, Error>
  }, []);

  const { loading, result, execute, reset } = useAsync(fetchData, []);

  return result?.match(
    (data) => <div>{data.name}</div>,
    (error) => <div>Error: {error.message}</div>
  );
}
```

**Features:**

- Automatic execution on mount (unless manual: true)
- Loading state management
- Result-based error handling
- Manual execution control
- Reset capability

**Important:** Always memoize the async function parameter with `useCallback` to avoid infinite re-renders.

#### `useFetch<T>`

HTTP request hook with retry logic and caching support.

```typescript
import { useFetch } from './hooks/useFetch';

function UserProfile({ userId }: { userId: string }) {
  const { data, loading, error, refetch } = useFetch<User>(
    `/users/${userId}`,
    {
      timeout: 5000,
      retries: 3,
      retryDelay: 1000,
      transformResponse: (raw) => mapUserFromApi(raw)
    },
    [userId] // Re-fetch when userId changes
  );

  if (loading) return <Spinner />;
  if (error) return <ErrorDisplay error={error} />;
  if (!data) return null;

  return (
    <div>
      <h1>{data.name}</h1>
      <button onClick={() => refetch()}>Refresh</button>
    </div>
  );
}
```

**Features:**

- Automatic retry with exponential backoff
- Request timeout
- Response transformation
- Error transformation
- Manual refetch
- Caching support (via `useCachedFetch`)

#### `useCachedFetch<T>`

`useFetch` variant with built-in caching and stale-while-revalidate pattern.

```typescript
import { useCachedFetch } from './hooks/useFetch';

function ProductList() {
  const { data, loading, error, refetch, cached } = useCachedFetch<Product[]>(
    '/products',
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheKey: 'products-list'
    }
  );

  return (
    <div>
      {cached && <Badge>Cached</Badge>}
      {data?.map(product => <ProductCard key={product.id} {...product} />)}
    </div>
  );
}
```

**Features:**

- Automatic cache invalidation based on `staleTime`
- Stale-while-revalidate pattern
- Custom cache keys
- Cache inspection

#### `useApiCall<T, E>`

Higher-level hook for making API calls with automatic loading and error states.

```typescript
import { useApiCall } from './hooks/useApiCall';
import { addressBookService } from '../services/api';

function ContactForm() {
  const { execute, loading, error } = useApiCall(addressBookService.create);

  const handleSubmit = async (data: ContactData) => {
    const result = await execute(data);

    result.match(
      (contact) => {
        message.success(`Contact ${contact.name} created!`);
        navigate('/contacts');
      },
      (err) => {
        message.error(err.message);
      }
    );
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* form fields */}
      <button type="submit" disabled={loading}>
        {loading ? 'Creating...' : 'Create Contact'}
      </button>
      {error && <Alert message={error.message} type="error" />}
    </form>
  );
}
```

**Features:**

- Automatic loading state
- Error state management
- Result-based returns
- Works with any service method

### Form Validation

#### `useFormValidation<T>`

Form validation hook with Railway-Oriented Programming.

```typescript
import { useFormValidation } from './hooks/useFormValidation';
import { validateEmail, validatePassword } from '../utils/formValidation';

function LoginForm() {
  const { values, errors, handleChange, handleSubmit, isValid } = useFormValidation({
    initialValues: { email: '', password: '' },
    validators: {
      email: validateEmail,
      password: validatePassword
    },
    onSubmit: async (validatedData) => {
      return authService.login(validatedData);
    }
  });

  return (
    <form onSubmit={handleSubmit}>
      <input
        name="email"
        value={values.email}
        onChange={handleChange}
      />
      {errors.email && <span>{errors.email}</span>}

      <input
        name="password"
        type="password"
        value={values.password}
        onChange={handleChange}
      />
      {errors.password && <span>{errors.password}</span>}

      <button type="submit" disabled={!isValid}>Login</button>
    </form>
  );
}
```

**Features:**

- Field-level validation
- Form-level validation
- Railway-oriented validation pipeline
- Automatic error state management
- Dirty/touched tracking
- Validation on change or blur

#### `useValidation<T>`

Lower-level validation hook for custom validation logic.

```typescript
import { useValidation } from './hooks/useValidation';

function PasswordStrength({ password }: { password: string }) {
  const validation = useValidation(password, validatePasswordStrength);

  return validation.match(
    (strength) => (
      <ProgressBar
        percent={strength.score}
        status={strength.level}
        label={strength.feedback}
      />
    ),
    (error) => <span className="error">{error.message}</span>
  );
}
```

**Features:**

- Single-value validation
- Real-time validation
- Result-based returns
- Memoized for performance

### Authentication

#### `useAuth`

Authentication context consumer with typed user and tenant data.

```typescript
import { useAuth } from './hooks/useAuth';

function UserMenu() {
  const { user, tenant, isAuthenticated, login, logout } = useAuth();

  if (!isAuthenticated) {
    return <LoginButton onClick={() => navigate('/login')} />;
  }

  return (
    <Dropdown>
      <Avatar src={user.avatar} alt={user.username} />
      <Menu>
        <Menu.Item>Tenant: {tenant.name}</Menu.Item>
        <Menu.Divider />
        <Menu.Item onClick={logout}>Logout</Menu.Item>
      </Menu>
    </Dropdown>
  );
}
```

**Features:**

- Global authentication state
- User and tenant context
- Login/logout methods
- Token refresh handling
- Automatic token expiration handling

## Hook Composition

Hooks can be composed to build complex functionality:

```typescript
function UserDashboard() {
  const { user } = useAuth();

  // Fetch user's data
  const { data: profile, loading: profileLoading } = useCachedFetch<UserProfile>(
    `/users/${user.id}/profile`,
    { staleTime: 60000 },
    [user.id]
  );

  // API call for updating profile
  const { execute: updateProfile, loading: updating } = useApiCall(
    userService.updateProfile
  );

  // Form validation
  const { values, errors, handleChange, handleSubmit } = useFormValidation({
    initialValues: profile || {},
    validators: profileValidators,
    onSubmit: async (data) => {
      return updateProfile(user.id, data);
    }
  });

  if (profileLoading) return <Skeleton />;

  return (
    <form onSubmit={handleSubmit}>
      {/* form fields with values, errors, handleChange */}
      <button type="submit" disabled={updating}>
        {updating ? 'Saving...' : 'Save Profile'}
      </button>
    </form>
  );
}
```

## Best Practices

### 1. Always Memoize Async Functions

```typescript
// ✅ Good - memoized
const fetchData = useCallback(async () => {
  return apiCall();
}, [dependency]);

const { result } = useAsync(fetchData, [dependency]);

// ❌ Bad - creates new function on every render
const { result } = useAsync(async () => apiCall(), [dependency]);
```

### 2. Handle Both Success and Error Cases

```typescript
// ✅ Good - handles both cases
result?.match(
  (data) => <SuccessView data={data} />,
  (error) => <ErrorView error={error} />
);

// ❌ Bad - doesn't handle error case
if (result?.isOk()) {
  return <SuccessView data={result.value} />;
}
```

### 3. Use Loading States for Better UX

```typescript
// ✅ Good - shows loading state
if (loading) return <Skeleton />;
if (error) return <ErrorView error={error} />;
if (!data) return null;
return <DataView data={data} />;

// ❌ Bad - no feedback during loading
if (!data) return null;
return <DataView data={data} />;
```

### 4. Provide Fallback Values

```typescript
// ✅ Good - safe defaults
const { data = [], loading } = useFetch<Product[]>('/products');

// ❌ Bad - potential null/undefined errors
const { data, loading } = useFetch<Product[]>('/products');
// data might be null, causing errors in .map()
```

### 5. Clean Up Side Effects

```typescript
// ✅ Good - cleanup function
useEffect(() => {
  const subscription = observable.subscribe(handleData);
  return () => subscription.unsubscribe();
}, []);

// ❌ Bad - no cleanup
useEffect(() => {
  observable.subscribe(handleData);
}, []);
```

## Common Patterns

### Loading with Skeleton

```typescript
function DataTable() {
  const { data, loading, error } = useFetch<Item[]>('/items');

  if (loading) return <TableSkeleton rows={5} />;
  if (error) return <ErrorAlert error={error} />;
  if (!data || data.length === 0) return <EmptyState />;

  return <Table data={data} />;
}
```

### Optimistic Updates

```typescript
function TodoItem({ todo }: { todo: Todo }) {
  const [optimisticState, setOptimisticState] = useState(todo);
  const { execute: updateTodo } = useApiCall(todoService.update);

  const handleToggle = async () => {
    // Optimistic update
    setOptimisticState({ ...todo, completed: !todo.completed });

    const result = await updateTodo(todo.id, {
      completed: !todo.completed
    });

    // Revert on error
    result.mapErr(() => {
      setOptimisticState(todo);
      message.error('Failed to update');
    });
  };

  return (
    <Checkbox
      checked={optimisticState.completed}
      onChange={handleToggle}
    >
      {optimisticState.title}
    </Checkbox>
  );
}
```

### Polling

```typescript
function LiveData() {
  const [enabled, setEnabled] = useState(true);

  const { data, refetch } = useFetch<Stats>('/stats', {}, []);

  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      refetch();
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [enabled, refetch]);

  return (
    <div>
      <Switch checked={enabled} onChange={setEnabled}>
        Live Updates
      </Switch>
      {data && <StatsDisplay {...data} />}
    </div>
  );
}
```

### Dependent Queries

```typescript
function UserPosts({ userId }: { userId: string }) {
  // First fetch user
  const { data: user, loading: userLoading } = useFetch<User>(
    `/users/${userId}`,
    {},
    [userId]
  );

  // Then fetch user's posts (only when user is loaded)
  const { data: posts, loading: postsLoading } = useFetch<Post[]>(
    user ? `/users/${user.id}/posts` : null,
    { manual: !user },
    [user?.id]
  );

  if (userLoading) return <Skeleton />;
  if (!user) return <NotFound />;
  if (postsLoading) return <Skeleton />;

  return (
    <div>
      <UserHeader user={user} />
      <PostList posts={posts || []} />
    </div>
  );
}
```

## Testing Hooks

### Unit Testing with React Testing Library

```typescript
import { renderHook, act, waitFor } from '@testing-library/react';
import { useFetch } from './useFetch';

describe('useFetch', () => {
  it('fetches data successfully', async () => {
    const { result } = renderHook(() => useFetch<User>('/users/1'));

    // Initially loading
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBe(null);

    // Wait for data to load
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual({ id: '1', name: 'John' });
    expect(result.current.error).toBe(null);
  });

  it('handles errors', async () => {
    // Mock fetch to fail
    global.fetch = jest.fn(() => Promise.reject('Network error'));

    const { result } = renderHook(() => useFetch<User>('/users/1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBe(null);
    expect(result.current.error).toBeTruthy();
    expect(result.current.error?.type).toBe('network');
  });

  it('refetches data', async () => {
    const { result } = renderHook(() => useFetch<User>('/users/1'));

    await waitFor(() => {
      expect(result.current.data).toBeTruthy();
    });

    // Trigger refetch
    act(() => {
      result.current.refetch();
    });

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });
});
```

## Performance Tips

### 1. Memoize Expensive Computations

```typescript
const transformedData = useMemo(() => {
  if (!data) return [];
  return data.map(item => expensiveTransform(item));
}, [data]);
```

### 2. Debounce Search Queries

```typescript
import { useMemo } from 'react';
import { debounce } from 'lodash';

function SearchResults() {
  const [query, setQuery] = useState('');

  const debouncedSearch = useMemo(
    () =>
      debounce((q: string) => {
        // Trigger search
      }, 300),
    []
  );

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    debouncedSearch(e.target.value);
  };

  // ...
}
```

### 3. Cache Hook Results

Use `useCachedFetch` instead of `useFetch` for data that doesn't change frequently.

## Migration from Try-Catch

### Before (Try-Catch)

```typescript
function OldComponent() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/data');
        const json = await response.json();
        setData(json);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  return <div>{data}</div>;
}
```

### After (Result-Based)

```typescript
function NewComponent() {
  const { data, loading, error } = useFetch<Data>('/api/data');

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  return <div>{data}</div>;
}
```

## Related Documentation

- [Services Layer](../services/README.md) - API client and services
- [Validation](../utils/validation.ts) - Validation utilities
- [Error Types](../types/errors.ts) - Error type definitions
- [FP Types](../types/fp.ts) - Result and AsyncResult types
- [React Hook Form Integration](../utils/formPipeline.ts) - Form validation pipeline
