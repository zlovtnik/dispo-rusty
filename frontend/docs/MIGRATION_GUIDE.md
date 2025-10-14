# Migration Guide: Integrating Domain Layer

This guide helps you migrate existing code to use the new domain layer functions.

## 🎯 Migration Overview

**What's changing:**
- Business logic moves from hooks/components → domain layer
- Imperative error handling → Railway-Oriented Programming with Result<T, E>
- Mixed concerns → Clean separation (Domain / Application / Infrastructure)

**What's staying the same:**
- API endpoints and contracts
- UI components and styling
- State management (AuthContext, etc.)
- Database schema

## 📋 Migration Checklist

### Phase 1: Understand Domain Layer (15 minutes)

- [ ] Read `src/domain/README.md` - Overview and principles
- [ ] Read `src/domain/QUICK_REFERENCE.md` - Common patterns
- [ ] Review example in `docs/PHASE_5_AND_6_IMPLEMENTATION.md`

### Phase 2: Update Imports (5 minutes per file)

**Before:**
```typescript
// components/LoginForm.tsx
import { useAuth } from '@/contexts/AuthContext';

function LoginForm() {
  const { login } = useAuth();
  
  const handleSubmit = async (credentials) => {
    try {
      await login(credentials);
      navigate('/dashboard');
    } catch (error) {
      setError(error.message);
    }
  };
}
```

**After:**
```typescript
// components/LoginForm.tsx
import { useAuth } from '@/contexts/AuthContext';
import { authenticateUser } from '@/domain';

function LoginForm() {
  const { login } = useAuth();
  
  const handleSubmit = async (credentials) => {
    const result = await login(credentials); // Returns Result<Session, AuthFlowError>
    
    result.match(
      (session) => navigate('/dashboard'),
      (error) => setError(error.type)
    );
  };
}
```

### Phase 3: Refactor Service Layer (1 hour)

**Target Files:**
- `services/authService.ts`
- `services/contactService.ts` (when implementing)
- `services/tenantService.ts` (when implementing)

**Migration Pattern:**

```typescript
// BEFORE: services/authService.ts
export const authService = {
  async login(credentials: LoginCredentials) {
    try {
      const response = await api.post('/auth/login', credentials);
      
      if (!response.token) {
        throw new Error('No token received');
      }
      
      return {
        user: response.user,
        token: response.token,
        refreshToken: response.refreshToken,
      };
    } catch (error) {
      throw new Error('Login failed: ' + error.message);
    }
  },
};
```

```typescript
// AFTER: services/authService.ts
import { authenticateUser } from '@/domain';
import { Result } from 'neverthrow';

export const authService = {
  async login(credentials: LoginCredentials): AsyncResult<Session, AuthFlowError> {
    const apiResult = await httpClient.post<AuthResponse>('/auth/login', credentials);
    
    return apiResult.andThen(authResponse =>
      authenticateUser(credentials, authResponse)
    );
  },
};
```

**Key Changes:**
1. Return `AsyncResult<T, E>` instead of throwing exceptions
2. Use `andThen()` to chain domain logic after API call
3. Let domain layer handle validation and transformation

### Phase 4: Update Context (2 hours)

**Target File:** `contexts/AuthContext.tsx`

**Current State:**
```typescript
const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const login = async (credentials: LoginCredentials) => {
    try {
      const session = await authService.login(credentials);
      setUser(session.user);
      storageService.set('session', session);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };
  
  // ...
};
```

**Updated State:**
```typescript
import { authenticateUser, validateSession, hasRole } from '@/domain';

const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<AuthFlowError | null>(null);
  
  const login = async (credentials: LoginCredentials) => {
    const sessionResult = await authService.login(credentials);
    
    sessionResult.match(
      (newSession) => {
        setSession(newSession);
        storageService.set('session', newSession);
        setError(null);
      },
      (authError) => {
        setError(authError);
        setSession(null);
      }
    );
    
    return sessionResult; // Return Result for caller to handle
  };
  
  const hasUserRole = (role: string): boolean => {
    return session ? hasRole(session, role) : false;
  };
  
  // Validate session on mount
  useEffect(() => {
    const storedSession = storageService.get<Session>('session');
    if (storedSession) {
      const validationResult = validateSession(storedSession);
      validationResult.match(
        (validSession) => setSession(validSession),
        (validationError) => {
          console.error('Invalid stored session:', validationError);
          storageService.remove('session');
        }
      );
    }
  }, []);
  
  // ...
};
```

**Key Changes:**
1. Store `Session` object instead of just `User`
2. Use domain functions: `authenticateUser()`, `validateSession()`, `hasRole()`
3. Return `Result` from login/logout/refresh for caller handling
4. Store error as typed `AuthFlowError` instead of string

### Phase 5: Update Components (30 minutes per component)

**Pattern 1: Protected Routes**

```typescript
// BEFORE
function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user } = useAuth();
  
  if (!user) {
    return <Navigate to="/login" />;
  }
  
  if (requiredRole && !user.roles.includes(requiredRole)) {
    return <AccessDenied />;
  }
  
  return <>{children}</>;
}
```

```typescript
// AFTER
import { validateSession, hasRole } from '@/domain';

function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { session } = useAuth();
  
  if (!session) {
    return <Navigate to="/login" />;
  }
  
  const sessionCheck = validateSession(session);
  if (sessionCheck.isErr()) {
    return <Navigate to="/login" state={{ error: sessionCheck.error }} />;
  }
  
  if (requiredRole && !hasRole(session, requiredRole)) {
    return <AccessDenied role={requiredRole} />;
  }
  
  return <>{children}</>;
}
```

**Pattern 2: Form Validation**

```typescript
// BEFORE
function ContactForm({ onSubmit }: ContactFormProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const handleSubmit = (data: ContactFormData) => {
    const newErrors: Record<string, string> = {};
    
    if (!data.email || !isValidEmail(data.email)) {
      newErrors.email = 'Invalid email format';
    }
    
    if (!data.phone || !isValidPhone(data.phone)) {
      newErrors.phone = 'Invalid phone format';
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    onSubmit(data);
  };
  
  // ...
}
```

```typescript
// AFTER
import { ContactRules, createContact } from '@/domain';
import { Result } from 'neverthrow';

function ContactForm({ onSubmit }: ContactFormProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { session } = useAuth();
  
  const handleSubmit = (data: ContactFormData) => {
    // Validate using business rules
    const emailValidation = ContactRules.validateEmailFormat(data.email);
    const phoneValidation = ContactRules.validatePhoneFormat(data.phone);
    
    const validationResult = Result.combine([emailValidation, phoneValidation]);
    
    if (validationResult.isErr()) {
      setErrors({
        email: emailValidation.isErr() ? emailValidation.error.reason : '',
        phone: phoneValidation.isErr() ? phoneValidation.error.reason : '',
      });
      return;
    }
    
    // Create contact using domain logic
    const contactResult = createContact(
      data,
      session.user.id,
      session.tenant.id
    );
    
    contactResult.match(
      (contact) => {
        console.log('Contact created:', contact.fullName);
        console.log('Completeness:', ContactRules.calculateContactCompleteness(contact), '%');
        onSubmit(contact);
      },
      (error) => {
        if (error.type === 'DUPLICATE_CONTACT') {
          setErrors({ [error.field]: 'This contact already exists' });
        } else {
          setErrors({ general: error.reason });
        }
      }
    );
  };
  
  // ...
}
```

**Pattern 3: Feature Flags**

```typescript
// BEFORE
function AdvancedFeature() {
  const { user, tenant } = useAuth();
  
  if (!tenant.subscription.features.includes('advanced_analytics')) {
    return <UpgradeCTA />;
  }
  
  return <AdvancedAnalytics />;
}
```

```typescript
// AFTER
import { validateFeatureAccess } from '@/domain';

function AdvancedFeature() {
  const { session } = useAuth();
  
  const featureCheck = validateFeatureAccess(
    session.tenant,
    'advanced_analytics'
  );
  
  return featureCheck.match(
    () => <AdvancedAnalytics />,
    (error) => (
      <UpgradeCTA 
        currentPlan={session.tenant.subscription.plan}
        feature="advanced_analytics"
        error={error}
      />
    )
  );
}
```

## 🧪 Testing Migration

### Before (Mixed Integration Test)

```typescript
describe('LoginForm', () => {
  test('submits login form', async () => {
    const mockApi = jest.fn().mockResolvedValue({
      token: 'test-token',
      user: { id: '1', email: 'test@example.com' },
    });
    
    render(<LoginForm api={mockApi} />);
    
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });
    
    fireEvent.click(screen.getByText('Login'));
    
    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith('/auth/login', {
        email: 'test@example.com',
        password: 'password123',
      });
    });
  });
});
```

### After (Pure Unit Test + Component Test)

```typescript
// domain.test.ts (Pure unit test)
import { describe, test, expect } from 'bun:test';
import { authenticateUser } from '@/domain';

describe('authenticateUser', () => {
  test('creates session from valid auth response', () => {
    const credentials = { email: 'test@example.com', password: 'password123' };
    const authResponse = {
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      refreshToken: 'refresh-token',
      user: { id: '1', email: 'test@example.com', roles: ['user'] },
    };
    
    const result = authenticateUser(credentials, authResponse);
    
    expect(result.isOk()).toBe(true);
    const session = result._unsafeUnwrap();
    expect(session.user.email).toBe('test@example.com');
    expect(session.token).toBe(authResponse.token);
  });
  
  test('fails with missing token', () => {
    const credentials = { email: 'test@example.com', password: 'password123' };
    const authResponse = {
      token: '',
      refreshToken: '',
      user: { id: '1', email: 'test@example.com', roles: [] },
    };
    
    const result = authenticateUser(credentials, authResponse);
    
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe('MISSING_TOKEN');
  });
});
```

```typescript
// LoginForm.test.tsx (Component test with mock service)
describe('LoginForm', () => {
  test('handles successful login', async () => {
    const mockLogin = jest.fn().mockResolvedValue(
      ok({ /* valid session */ })
    );
    
    render(<LoginForm />, {
      wrapper: ({ children }) => (
        <AuthContext.Provider value={{ login: mockLogin }}>
          {children}
        </AuthContext.Provider>
      ),
    });
    
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });
    
    fireEvent.click(screen.getByText('Login'));
    
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
    });
  });
  
  test('displays error on login failure', async () => {
    const mockLogin = jest.fn().mockResolvedValue(
      err({ type: 'INVALID_CREDENTIALS', reason: 'Wrong password' })
    );
    
    render(<LoginForm />, {
      wrapper: ({ children }) => (
        <AuthContext.Provider value={{ login: mockLogin }}>
          {children}
        </AuthContext.Provider>
      ),
    });
    
    // ... submit form
    
    await waitFor(() => {
      expect(screen.getByText('Wrong password')).toBeInTheDocument();
    });
  });
});
```

**Benefits of New Approach:**
- ✅ Domain tests are **pure** - no mocks, no setup, instant execution
- ✅ Component tests focus on UI behavior, not business logic
- ✅ Clear separation: domain tests verify correctness, component tests verify integration
- ✅ Property-based testing possible for domain logic

## 🚀 Rollout Strategy

### Week 1: Preparation
- [ ] Team reads documentation (`README.md`, `QUICK_REFERENCE.md`)
- [ ] Review code examples in `PHASE_5_AND_6_IMPLEMENTATION.md`
- [ ] Run workshop on Railway-Oriented Programming
- [ ] Set up testing infrastructure (fast-check, bun test)

### Week 2: Service Layer Migration
- [ ] Migrate `authService.ts` to use domain functions
- [ ] Update API client to return Result<T, E>
- [ ] Write comprehensive unit tests for domain logic
- [ ] Update mocks in existing tests

### Week 3: Context Migration
- [ ] Update `AuthContext.tsx` to use domain functions
- [ ] Store `Session` instead of just `User`
- [ ] Implement session validation on mount
- [ ] Add role checking helpers

### Week 4: Component Migration (Phase 1)
- [ ] Update authentication-related components (LoginForm, RegisterForm)
- [ ] Update protected routes and access control
- [ ] Add proper error boundaries with Result handling
- [ ] Write integration tests

### Week 5: Component Migration (Phase 2)
- [ ] Update form validation to use business rules
- [ ] Add contact quality indicators
- [ ] Implement feature access checks
- [ ] Add usage limit displays

### Week 6: Testing & Cleanup
- [ ] Achieve 95%+ test coverage on domain layer
- [ ] Remove deprecated imperative error handling
- [ ] Update documentation
- [ ] Performance profiling and optimization

## 🔍 Common Pitfalls

### Pitfall 1: Unwrapping Results Unsafely

❌ **Bad:**
```typescript
const session = authenticateUser(credentials, response)._unsafeUnwrap();
// Throws if Result is Err
```

✅ **Good:**
```typescript
const sessionResult = authenticateUser(credentials, response);
sessionResult.match(
  (session) => {/* handle success */},
  (error) => {/* handle error */}
);
```

### Pitfall 2: Mixing Imperative and Railway-Oriented Styles

❌ **Bad:**
```typescript
try {
  const result = authenticateUser(credentials, response);
  if (result.isErr()) {
    throw new Error(result.error.type); // Don't throw from Result!
  }
  const session = result.value;
} catch (error) {
  // ...
}
```

✅ **Good:**
```typescript
const sessionResult = authenticateUser(credentials, response);
return sessionResult.andThen(session => {
  // Chain more operations
  return validateSession(session);
});
```

### Pitfall 3: Calling Domain Functions from Domain Layer

❌ **Bad:**
```typescript
// domain/auth.ts
export function authenticateUser(credentials, response) {
  const apiResponse = await api.post('/auth/login', credentials); // NO! API call in domain
  // ...
}
```

✅ **Good:**
```typescript
// services/authService.ts
export const authService = {
  async login(credentials) {
    const apiResult = await httpClient.post('/auth/login', credentials);
    return apiResult.andThen(response => authenticateUser(credentials, response));
  },
};
```

### Pitfall 4: Not Validating Session on Restore

❌ **Bad:**
```typescript
useEffect(() => {
  const storedSession = storageService.get<Session>('session');
  if (storedSession) {
    setSession(storedSession); // Session might be expired!
  }
}, []);
```

✅ **Good:**
```typescript
useEffect(() => {
  const storedSession = storageService.get<Session>('session');
  if (storedSession) {
    const validationResult = validateSession(storedSession);
    validationResult.match(
      (validSession) => setSession(validSession),
      (error) => {
        console.error('Invalid stored session:', error);
        storageService.remove('session');
      }
    );
  }
}, []);
```

### Pitfall 5: Forgetting to Handle All Error Cases

❌ **Bad:**
```typescript
result.match(
  (success) => {/* ... */},
  (error) => {
    console.error('Error:', error); // Generic handling
  }
);
```

✅ **Good:**
```typescript
import { match } from 'ts-pattern';

result.match(
  (success) => {/* ... */},
  (error) => {
    match(error)
      .with({ type: 'INVALID_CREDENTIALS' }, (e) => {
        showError('Wrong email or password');
      })
      .with({ type: 'EXPIRED_TOKEN' }, (e) => {
        showError('Session expired. Please login again.');
        navigate('/login');
      })
      .with({ type: 'MISSING_TOKEN' }, (e) => {
        showError('Authentication failed. Please try again.');
      })
      .exhaustive(); // Compile error if case missing
  }
);
```

## 📚 Additional Resources

- **Documentation:**
  - `src/domain/README.md` - Complete domain layer guide
  - `src/domain/QUICK_REFERENCE.md` - Quick reference with examples
  - `docs/PHASE_5_AND_6_IMPLEMENTATION.md` - Full implementation details

- **Examples:**
  - Login flow: See `QUICK_REFERENCE.md` "Common Use Cases #1"
  - Contact validation: See `QUICK_REFERENCE.md` "Common Use Cases #2"
  - Feature access: See `QUICK_REFERENCE.md` "Common Use Cases #3"

- **External Resources:**
  - [Railway-Oriented Programming](https://fsharpforfunandprofit.com/rop/) - Original concept
  - [neverthrow docs](https://github.com/supermacro/neverthrow) - Result library
  - [ts-pattern docs](https://github.com/gvergnaud/ts-pattern) - Pattern matching

## 🤝 Getting Help

**Questions?** Ask in:
- Team Slack: `#frontend-architecture`
- Code reviews: Tag `@architecture-team`
- Office hours: Tuesdays 2-3 PM

**Issues?** Create ticket with:
- Code snippet showing the problem
- Expected behavior
- Actual behavior
- Link to relevant documentation

---

**Last Updated:** October 14, 2025  
**Maintained by:** Frontend Architecture Team
