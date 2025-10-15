# Domain Layer

This directory contains all **pure business logic** for the application, following **Clean Architecture** and **Functional Programming** principles.

## 📁 Structure

```
domain/
├── auth.ts              # Authentication domain logic
├── contacts.ts          # Contact management logic
├── tenants.ts           # Tenant management logic
├── index.ts             # Public API exports
└── rules/               # Business rules
    ├── authRules.ts     # Password validation, session timeouts
    ├── contactRules.ts  # Contact validation, quality scoring
    └── tenantRules.ts   # Subscription limits, feature access
```

## 🎯 Principles

### 1. Pure Functions Only

All functions in this layer are **pure** - same input always produces same output, no side effects.

```typescript
// ✅ Pure - always returns same Result for same inputs
function authenticateUser(
  credentials: LoginCredentials,
  authResponse: AuthResponse
): Result<Session, AuthFlowError>;

// ❌ Impure - has side effects (API call, state mutation)
async function authenticateUser(credentials: LoginCredentials) {
  const response = await api.call(credentials);
  setUser(response.user);
}
```

### 2. Railway-Oriented Programming

All operations return `Result<T, E>` for explicit error handling.

```typescript
import { ok, err } from 'neverthrow';

function verifyToken(token: string): Result<TokenPayload, TokenError> {
  if (!token) {
    return err({ type: 'INVALID_FORMAT', reason: 'Token is empty' });
  }

  const payload = decodeJWT(token);
  return ok(payload);
}
```

### 3. Zero Dependencies

This layer has **no dependencies** on:

- React (no hooks, components, contexts)
- API clients (no HTTP calls)
- Storage (no localStorage, cookies)
- UI frameworks (no Ant Design, CSS)

### 4. Type Safety

All errors are **discriminated unions** for exhaustive pattern matching.

```typescript
type TokenError =
  | { type: 'EXPIRED'; expiresAt: Date; now: Date }
  | { type: 'INVALID_FORMAT'; reason: string }
  | { type: 'MISSING_CLAIMS'; claims: string[] };

// TypeScript ensures all cases are handled
match(tokenError)
  .with({ type: 'EXPIRED' }, e => {
    /* handle expired */
  })
  .with({ type: 'INVALID_FORMAT' }, e => {
    /* handle invalid */
  })
  .with({ type: 'MISSING_CLAIMS' }, e => {
    /* handle missing */
  })
  .exhaustive(); // Compile error if any case missing
```

## 📦 Modules

### Authentication (`auth.ts`)

Pure functions for authentication operations.

**Key Functions:**

- `authenticateUser()` - Transform API response to Session
- `verifyToken()` - Validate and decode JWT
- `refreshSession()` - Update session with new tokens
- `validateSession()` - Check session validity
- `extractTenantId()` / `extractUserId()` - Extract claims from JWT
- `hasRole()` / `hasAnyRole()` / `hasAllRoles()` - Role checking

**Example:**

```typescript
import { authenticateUser, verifyToken } from '@/domain';

// In service layer (not domain)
const apiResponse = await authService.login(credentials);

// In domain layer (pure)
const sessionResult = authenticateUser(credentials, apiResponse);

sessionResult.match(
  session => console.log('Logged in:', session.user.email),
  error => console.error('Login failed:', error.type)
);
```

### Contact Management (`contacts.ts`)

Pure functions for contact CRUD operations.

**Key Functions:**

- `createContact()` - Create with validation and derived fields
- `updateContact()` - Update with field validation
- `mergeContacts()` - Merge two contacts (prefer-primary/prefer-secondary/combine)
- `hasContactInfo()` - Check if email/phone present
- `isCompleteContact()` - Check if all recommended fields present
- `formatContactDisplay()` - Format for display

**Example:**

```typescript
import { createContact, mergeContacts } from '@/domain';

const contactResult = createContact(formData, userId, tenantId);

if (contactResult.isOk()) {
  const contact = contactResult.value;
  console.log('Created:', contact.fullName, 'Age:', contact.age);
}

// Merge duplicates
const merged = mergeContacts(primary, secondary, 'combine', userId);
```

### Tenant Management (`tenants.ts`)

Pure functions for tenant operations and access control.

**Key Functions:**

- `validateTenantAccess()` - Check user can access tenant
- `switchTenant()` - Validate tenant switch
- `validateTenantSubscription()` - Check subscription status
- `validateFeatureAccess()` - Check feature available for plan
- `validateUsageLimit()` - Check within limits
- `getTenantDisplayName()` - Get display name
- `getDaysUntilExpiration()` - Calculate days remaining
- `getUsagePercentage()` - Calculate usage %
- `isApproachingLimit()` - Check if near limit

**Example:**

```typescript
import { validateTenantAccess, validateFeatureAccess } from '@/domain';

// Check access
const accessResult = validateTenantAccess(user, tenantId);
if (accessResult.isErr()) {
  return <AccessDenied />;
}

// Check feature
const featureResult = validateFeatureAccess(tenant, 'advanced_analytics');
if (featureResult.isErr()) {
  return <UpgradePrompt plan={tenant.subscription.plan} />;
}
```

## 📏 Business Rules

### Authentication Rules (`rules/authRules.ts`)

**Password Validation:**

```typescript
import { AuthRules } from '@/domain';

const validation = AuthRules.validatePasswordStrength(password, {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
});

const score = AuthRules.calculatePasswordStrength(password); // 0-100
const label = AuthRules.getPasswordStrengthLabel(score); // 'weak' | 'fair' | 'good' | 'strong' | 'very strong'
```

**Session Timeouts:**

```typescript
const shouldTimeout = AuthRules.shouldTimeoutFromIdle(lastActivity, {
  idleTimeout: 30, // 30 minutes
  absoluteTimeout: 8, // 8 hours
  warningBeforeTimeout: 5,
});

const showWarning = AuthRules.shouldShowTimeoutWarning(lastActivity);
const minutesLeft = AuthRules.getMinutesUntilTimeout(lastActivity);
```

### Contact Rules (`rules/contactRules.ts`)

**Validation:**

```typescript
import { ContactRules } from '@/domain';

const emailResult = ContactRules.validateEmailFormat(email);
const phoneResult = ContactRules.validatePhoneFormat(phone);
const ageResult = ContactRules.validateAgeRange(age, 0, 150);

const emailUnique = ContactRules.validateEmailUniqueness(email, existingContacts, excludeContactId);
```

**Quality Assessment:**

```typescript
const completeness = ContactRules.calculateContactCompleteness(contact); // 0-100%
const quality = ContactRules.getContactQualityScore(contact); // 0-100
const hasMinInfo = ContactRules.hasMinimumContactInfo(contact); // boolean
```

**Data Sanitization:**

```typescript
const sanitized = ContactRules.sanitizeContactData(contact);
const displayName = ContactRules.formatContactName(contact, 'full');
```

### Tenant Rules (`rules/tenantRules.ts`)

**Subscription Limits:**

```typescript
import { TenantRules } from '@/domain';

const limits = TenantRules.getPlanLimits('professional');
// { users: 25, contacts: 10000, storage: 10240, apiCallsPerMonth: 100000 }

const features = TenantRules.getAvailableFeatures('professional');
// ['contacts', 'advanced_search', 'api_access', ...]

const validation = TenantRules.validateSubscriptionLimit(tenant, 'contacts', currentCount);
```

**Usage Analytics:**

```typescript
const percentage = TenantRules.calculateUsagePercentage(tenant, 'users', 20);
const approaching = TenantRules.isApproachingLimit(tenant, 'users', 20, 80);
const recommended = TenantRules.getRecommendedPlan(currentUsage);
const benefitScore = TenantRules.calculateUpgradeBenefitScore(tenant, 'enterprise', usage);
```

## 🧪 Testing

All domain logic is **pure** and easily testable without mocks:

```typescript
import { describe, test, expect } from 'bun:test';
import { authenticateUser } from '@/domain';

describe('authenticateUser', () => {
  test('creates session from valid auth response', () => {
    const credentials = {
      /* ... */
    };
    const authResponse = {
      /* ... */
    };

    const result = authenticateUser(credentials, authResponse);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().user.email).toBe('user@example.com');
  });

  test('fails with missing tokens', () => {
    const credentials = {
      /* ... */
    };
    const authResponse = { token: '' /* ... */ };

    const result = authenticateUser(credentials, authResponse);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe('INVALID_CREDENTIALS');
  });
});
```

**Property-Based Testing:**

```typescript
import fc from 'fast-check';
import { ContactRules } from '@/domain';

test('email validation accepts all valid emails', () => {
  fc.assert(
    fc.property(fc.emailAddress(), email => {
      const result = ContactRules.validateEmailFormat(email);
      expect(result.isOk()).toBe(true);
    })
  );
});
```

## 📚 Usage in Application

### In Service Layer

```typescript
// services/authService.ts
import { authenticateUser } from '@/domain';

export const authService = {
  async login(credentials: LoginCredentials) {
    const apiResult = await httpClient.post('/auth/login', credentials);

    return apiResult.andThen(authResponse => authenticateUser(credentials, authResponse));
  },
};
```

### In Context

```typescript
// contexts/AuthContext.tsx
import { authenticateUser, validateSession } from '@/domain';

const login = async (credentials: LoginCredentials) => {
  const sessionResult = await authService.login(credentials);

  sessionResult.match(
    session => {
      setSession(session);
      storageService.set('session', session);
    },
    error => {
      setError(error);
    }
  );
};
```

### In Components

```typescript
// components/ProtectedFeature.tsx
import { validateTenantAccess, validateFeatureAccess } from '@/domain';

function ProtectedFeature({ feature }) {
  const { session } = useAuth();

  const accessResult = validateTenantAccess(session.user, session.tenant.id);
  const featureResult = validateFeatureAccess(session.tenant, feature);

  return Result.combine([accessResult, featureResult]).match(
    () => <FeatureContent />,
    (error) => <AccessDenied error={error} />
  );
}
```

## 🎓 Benefits

1. **Testability**: 100% unit testable without mocks or setup
2. **Composability**: Functions can be combined using Result composition
3. **Type Safety**: Exhaustive error handling with discriminated unions
4. **Reusability**: Pure functions usable anywhere in the app
5. **Maintainability**: Clear separation of business logic from infrastructure
6. **Documentation**: Self-documenting with explicit types and JSDoc

## 📖 Further Reading

- [PHASE_5_AND_6_IMPLEMENTATION.md](../docs/PHASE_5_AND_6_IMPLEMENTATION.md) - Full implementation guide
- [BEST-PRACTICES-FUNCTIONAL-PATTERNS.md](../../docs/BEST-PRACTICES-FUNCTIONAL-PATTERNS.md) - FP patterns
- [ADR-001-FUNCTIONAL-PATTERNS.md](../../docs/ADR-001-FUNCTIONAL-PATTERNS.md) - Architecture decisions

## 🤝 Contributing

When adding new domain logic:

1. **Pure Functions Only**: No side effects (API calls, storage, state mutation)
2. **Return Result<T, E>**: All operations should return Result
3. **Discriminated Unions**: Define explicit error types
4. **Write Tests**: Unit test all functions (target: 95% coverage)
5. **Add JSDoc**: Document all public functions with examples
6. **Update README**: Add examples to this file

---

**Last Updated:** October 14, 2025  
**Version:** 1.0.0
