# Functional Programming (FP) Refactoring Strategy

## Overview

This document outlines the strategy for migrating the frontend codebase from imperative error handling patterns to Railway-Oriented Programming (ROP) using `neverthrow` and discriminated union types.

**Status**: Phase 1 Complete - Foundation laid, Feature Flags Implemented, Ready for Gradual Migration

## Architecture

### Existing FP Foundation ✅

The following are already implemented using FP patterns:

- **api.ts**: HttpClient with AsyncResult, retry logic, circuit breaker
- **auth.ts**: Authorization validation with Result types
- **validation/**: Zod schemas with FP validation pipelines
- **services/**: TenantIsolationService with Result-based error handling

### New FP Components

#### 1. **AuthContextFP** - FP-based Authentication
- Location: `src/contexts/AuthContextFP.tsx`
- Replaces imperative AuthContext with discriminated union state
- All async operations return AsyncResult<T, AppError>
- No try-catch blocks in user-facing code

**State Shape:**
```typescript
type AuthStateFP =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'authenticated'; user: User; tenant: Tenant; token: string }
  | { type: 'error'; error: AppError; previousState?: ... };
```

**Usage:**
```typescript
const { state, login, logout } = useAuthFP();

// Pattern match on state
state.match({
  idle: () => <LoginPage />,
  loading: () => <Spinner />,
  authenticated: ({ user }) => <Dashboard />,
  error: ({ error }) => <ErrorAlert error={error} />,
});

// Use Result-based operations
const result = await login(credentials);
result.match(
  (response) => console.log('Success!', response),
  (error) => console.error('Failed:', error.message)
);
```

#### 2. **Feature Flags** - Gradual Migration
- Location: `src/config/featureFlags.ts`
- Enables running both old and new implementations in parallel
- Environment variables: `VITE_USE_FP_AUTH`, `VITE_USE_FP_SERVICES`, `VITE_USE_FP_HOOKS`
- Runtime updates via localStorage for testing

**Available Flags:**
```typescript
interface FeatureFlags {
  useFPAuth: boolean;           // Use AuthContextFP instead of AuthContext
  useFPServices: boolean;       // Use FP patterns in service layer
  useFPHooks: boolean;          // Use FP patterns in React hooks
  verboseFPLogging: boolean;    // Enable debug logging
}
```

**Usage:**
```typescript
import { isFeatureEnabled, updateFeatureFlags } from '@/config/featureFlags';

if (isFeatureEnabled('useFPAuth')) {
  // Use FP implementation
} else {
  // Use traditional implementation
}

// Enable at runtime for testing
updateFeatureFlags({ useFPAuth: true });
```

#### 3. **useAuthAdapter Hook** - Unified Interface
- Location: `src/hooks/useAuthAdapter.ts`
- Provides uniform interface regardless of which auth implementation is active
- Automatically switches between old and new based on feature flags
- Zero API change for components

**Usage:**
```typescript
import { useAuthAdapter } from '@/hooks/useAuthAdapter';

const { state, operations } = useAuthAdapter();

// Same interface works with both implementations
if (state.isLoading) return <Spinner />;
if (!state.isAuthenticated) return <LoginPage onLogin={operations.login} />;
return <Dashboard user={state.user} />;
```

## Migration Strategy

### Phase 1: Foundation & Gradual Migration (Complete ✅)

**What's Done:**
- ✅ Created AuthContextFP with discriminated union state
- ✅ Implemented feature flags system
- ✅ Created useAuthAdapter for gradual component migration
- ✅ All tests passing (701 pass/0 fail)
- ✅ No breaking changes (backward compatible)

**How to Use:**
1. Components can optionally use `useAuthAdapter` instead of `useAuth`
2. Enable feature flags to test new implementation: `VITE_USE_FP_AUTH=true`
3. Traditional code continues working unchanged

### Phase 2: Gradual Component Migration

**Next Steps:**
1. Update high-value components to use `useAuthAdapter`
2. Test both implementations in parallel
3. Incrementally move components to FP patterns
4. Monitor test coverage and error rates

**Prioritization:**
```
1. LoginPage (most critical, highest impact)
2. PrivateRoute (fundamental routing logic)
3. Layout/Navigation components
4. Dashboard & main pages
5. Modal components
6. Forms & validation
```

### Phase 3: Service Layer Migration

**Scope:**
- useAsync, useFetch hooks → useAsyncFP, useFetchFP
- Component error handling → Result types
- Form validation → Zod + Result patterns

### Phase 4: Complete & Document

- Remove feature flags (all components using FP)
- Update documentation and examples
- Performance metrics and optimization

## Patterns & Best Practices

### 1. Railway-Oriented Programming

**Imperative (Old Pattern):**
```typescript
try {
  const user = await fetchUser(id);
  const tenant = await fetchTenant(user.tenantId);
  return { user, tenant };
} catch (error) {
  console.error('Failed:', error);
  throw error;
}
```

**FP Pattern (New):**
```typescript
const result = await fetchUser(id)
  .andThen((user) => fetchTenant(user.tenantId)
    .map((tenant) => ({ user, tenant }))
  );

result.match(
  ({ user, tenant }) => console.log('Success'),
  (error) => console.error('Failed:', error.message)
);
```

### 2. State Machines with Discriminated Unions

**Imperative (Old Pattern):**
```typescript
const [isLoading, setIsLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
const [user, setUser] = useState<User | null>(null);
// Problem: Can represent invalid states (loading + user both true)
```

**FP Pattern (New):**
```typescript
type State =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'success'; user: User }
  | { type: 'error'; error: Error };

// Impossible to represent invalid states
```

### 3. Async Result Patterns

**Error Handling:**
```typescript
// FP pattern - all errors are values, not exceptions
async function login(creds: Credentials): AsyncResult<User, AuthError> {
  return authService.login(creds)
    .andThen((response) => validateResponse(response))
    .andThen((validated) => storeAuth(validated))
    .map(({ user }) => user);
}

// Usage
const result = await login(credentials);
result.match(
  (user) => { /* success path */ },
  (error) => { /* error path */ }
);
```

## Testing Strategy

### Unit Tests

Test Result type handling:
```typescript
import { describe, it, expect } from 'bun:test';
import { ok, err } from 'neverthrow';

describe('login', () => {
  it('returns ok with user on success', async () => {
    const result = await login(validCredentials);
    
    expect(result.isOk()).toBe(true);
    result.map((user) => {
      expect(user.id).toBe('123');
    });
  });

  it('returns err with AuthError on failure', async () => {
    const result = await login(invalidCredentials);
    
    expect(result.isErr()).toBe(true);
    result.mapErr((error) => {
      expect(error.code).toBe('INVALID_CREDENTIALS');
    });
  });
});
```

### Integration Tests

Test state transitions:
```typescript
describe('AuthContextFP', () => {
  it('transitions from idle → loading → authenticated', async () => {
    const { state, login } = renderWithAuthFP(<App />);
    
    expect(state.type).toBe('idle');
    
    const loginPromise = login(credentials);
    expect(state.type).toBe('loading');
    
    await loginPromise;
    expect(state.type).toBe('authenticated');
  });
});
```

### Feature Flag Testing

Test both implementations in parallel:
```typescript
describe('Auth Flow (Both Implementations)', () => {
  test.each([
    { flag: false, name: 'Traditional' },
    { flag: true, name: 'FP-Based' },
  ])('$name - login succeeds', async ({ flag }) => {
    updateFeatureFlags({ useFPAuth: flag });
    const { state, operations } = renderWithAuthAdapter(<App />);
    
    await operations.login(credentials);
    expect(state.isAuthenticated).toBe(true);
  });
});
```

## Environment Configuration

### Development

Enable FP features for testing:
```bash
# .env.local
VITE_USE_FP_AUTH=true
VITE_USE_FP_SERVICES=false
VITE_USE_FP_HOOKS=false
VITE_VERBOSE_FP_LOGGING=true
```

### Production

Start with features disabled, gradually enable:
```bash
# .env.production
VITE_USE_FP_AUTH=false
VITE_USE_FP_SERVICES=false
VITE_USE_FP_HOOKS=false
VITE_VERBOSE_FP_LOGGING=false
```

### Runtime Testing

Update features without rebuilding:
```typescript
// In browser console
import { updateFeatureFlags } from '@/config/featureFlags';
updateFeatureFlags({ useFPAuth: true });
```

## Rollback Plan

If issues occur:

1. **Immediate**: Disable feature flag
   ```bash
   VITE_USE_FP_AUTH=false
   ```

2. **Runtime**: Reset from browser console
   ```typescript
   import { resetFeatureFlags } from '@/config/featureFlags';
   resetFeatureFlags();
   ```

3. **Complete**: Revert to previous git state
   ```bash
   git revert <commit-hash>
   ```

## Metrics & Monitoring

### Track During Migration:

1. **Error Rates**: Count errors pre/post FP adoption
2. **Type Safety**: % of functions using Result types
3. **Test Coverage**: Maintain 85%+ coverage
4. **Performance**: Bundle size, runtime performance
5. **Developer Experience**: Time to implement features

### Commands:

```bash
# Type checking
bun run type-check

# Linting
bun run lint

# Testing with coverage
bun run test:coverage

# Build
bun run build
```

## FAQ

### Q: Will this break existing code?
**A:** No. Feature flags default to `false`, so existing code runs unchanged. New FP features are opt-in.

### Q: How long will migration take?
**A:** Estimated 2-4 weeks with 1-2 developers working gradually on components. Can be parallelized.

### Q: Do I need to refactor all at once?
**A:** No. Use feature flags to enable FP gradually per component. Recommend 1-2 components per week.

### Q: What if I'm not familiar with FP patterns?
**A:** Start with the examples above. The `useAuthAdapter` provides a familiar interface while using FP under the hood. Team training recommended.

### Q: How is error handling different?
**A:** Instead of try-catch and throwing, use `match()` to handle success/failure. All errors are values (Result types) not exceptions.

### Q: Can I use both implementations simultaneously?
**A:** Yes! That's the point of feature flags. Enables A/B testing and gradual migration.

## Resources

- [neverthrow Documentation](https://github.com/supermacro/neverthrow)
- [Railway-Oriented Programming](https://fsharpforfunandprofit.com/rop/)
- [Discriminated Unions in TypeScript](https://www.typescriptlang.org/docs/handbook/2/types-from-types.html#discriminated-unions)
- [Async Result Patterns](https://github.com/supermacro/neverthrow#asyncresult)

## Next Steps

1. **Immediate**: Review this document and AuthContextFP implementation
2. **Week 1**: Convert LoginPage to use useAuthAdapter
3. **Week 2**: Convert PrivateRoute and Layout components
4. **Week 3**: Convert dashboard and pages
5. **Week 4**: Enable feature flag in production (with monitoring)
6. **Week 5-6**: Gradual rollout to all users

---

**Last Updated**: Phase 1 Complete - Ready for Phase 2 Migration
**Test Status**: 701 pass / 0 fail / 71.12% coverage
**Breaking Changes**: None (fully backward compatible)
