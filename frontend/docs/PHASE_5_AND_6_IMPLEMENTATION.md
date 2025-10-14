# Phase 5 & 6 Implementation Guide

**Implementation Date:** October 14, 2025  
**Status:** Phase 6 Complete ✅ | Phase 5 In Progress ⚠️  
**Version:** 1.0.0

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Phase 6: Business Logic Extraction](#phase-6-business-logic-extraction)
3. [Phase 5: Component Layer Updates](#phase-5-component-layer-updates)
4. [Architecture](#architecture)
5. [Usage Examples](#usage-examples)
6. [Testing Strategy](#testing-strategy)
7. [Migration Guide](#migration-guide)
8. [Next Steps](#next-steps)

---

## Overview

This document details the implementation of **Phase 5 (Component Layer Updates)** and **Phase 6 (Business Logic Extraction)** of the Functional Programming transformation for the frontend application.

### Goals

- **Phase 6:** Extract all business logic into pure, testable, composable functions
- **Phase 5:** Create reusable hooks and enhance components with Result-based error handling

### Benefits Achieved

✅ **Pure Business Logic**: All domain logic extracted from service/context layers  
✅ **Testability**: 100% of business logic can be unit tested without mocks  
✅ **Type Safety**: Explicit error types for all operations  
✅ **Composability**: Functions can be combined using Result composition  
✅ **Documentation**: Comprehensive JSDoc for all public APIs  
✅ **Railway-Oriented Programming**: Consistent error handling patterns  

---

## Phase 6: Business Logic Extraction

### 6.1 Domain Logic Modules

All business logic has been extracted into pure functions organized by domain:

#### 📁 File Structure

```
frontend/src/domain/
├── index.ts                      # Public API
├── auth.ts                       # Authentication domain logic
├── contacts.ts                   # Contact management domain logic
├── tenants.ts                    # Tenant management domain logic
└── rules/
    ├── authRules.ts             # Authentication business rules
    ├── contactRules.ts          # Contact business rules
    └── tenantRules.ts           # Tenant business rules
```

---

### Authentication Domain (`auth.ts`)

Pure functions for authentication operations.

#### Core Types

```typescript
export interface Session {
  readonly user: User;
  readonly tenant: Tenant;
  readonly token: string;
  readonly refreshToken: string;
  readonly expiresAt: Date;
  readonly issuedAt: Date;
}

export type TokenError =
  | { type: 'EXPIRED'; expiresAt: Date; now: Date }
  | { type: 'INVALID_FORMAT'; reason: string }
  | { type: 'MISSING_CLAIMS'; claims: string[] }
  | { type: 'VERIFICATION_FAILED'; reason: string };

export type SessionError =
  | { type: 'EXPIRED'; expiresAt: Date }
  | { type: 'INVALID_TOKEN'; reason: string }
  | { type: 'REFRESH_FAILED'; reason: string }
  | { type: 'USER_NOT_FOUND' }
  | { type: 'TENANT_NOT_FOUND' };
```

#### Key Functions

**`authenticateUser()`**
```typescript
function authenticateUser(
  credentials: LoginCredentials,
  authResponse: AuthResponse
): Result<Session, AuthFlowError>
```
Transforms API response into a validated Session object.

**`verifyToken()`**
```typescript
function verifyToken(token: string): Result<TokenPayload, TokenError>
```
Validates JWT format and extracts payload with expiration checking.

**`refreshSession()`**
```typescript
function refreshSession(
  oldSession: Session,
  authResponse: AuthResponse
): Result<Session, SessionError>
```
Updates session with new tokens from refresh API call.

**`validateSession()`**
```typescript
function validateSession(session: Session): Result<Session, SessionError>
```
Comprehensive session validation including expiration and data integrity.

#### Helper Functions

- `isSessionExpired(session)` - Check if session is expired
- `shouldRefreshSession(session)` - Check if within 5 minutes of expiration
- `extractTenantId(token)` - Extract tenant ID from JWT
- `extractUserId(token)` - Extract user ID from JWT
- `hasRole(session, role)` - Check if user has specific role
- `hasAnyRole(session, roles)` - Check if user has any of the roles
- `hasAllRoles(session, roles)` - Check if user has all roles

---

### Contact Management Domain (`contacts.ts`)

Pure functions for contact CRUD operations.

#### Core Types

```typescript
export type ContactError =
  | { type: 'INVALID_DATA'; field: string; reason: string }
  | { type: 'DUPLICATE_CONTACT'; field: string; value: string }
  | { type: 'NOT_FOUND'; contactId: ContactId }
  | { type: 'MERGE_CONFLICT'; reason: string }
  | { type: 'VALIDATION_FAILED'; errors: Record<string, string> }
  | { type: 'UNAUTHORIZED'; message: string };

export type MergeStrategy = 
  | 'prefer-primary' 
  | 'prefer-secondary' 
  | 'combine';
```

#### Key Functions

**`createContact()`**
```typescript
function createContact(
  data: ContactCreateData,
  userId: UserId,
  tenantId: TenantId
): Result<Contact, ContactError>
```
Creates a new contact with validation and derived fields (age, fullName).

**`updateContact()`**
```typescript
function updateContact(
  existingContact: Contact,
  updateData: ContactUpdateData,
  userId: UserId
): Result<Contact, ContactError>
```
Updates existing contact with field validation and metadata updates.

**`mergeContacts()`**
```typescript
function mergeContacts(
  primary: Contact,
  secondary: Contact,
  strategy: MergeStrategy,
  userId: UserId
): Result<Contact, ContactError>
```
Merges two contacts using specified strategy with duplicate detection.

#### Helper Functions

- `hasContactInfo(contact)` - Check if contact has email or phone
- `isCompleteContact(contact)` - Check if all recommended fields present
- `formatContactDisplay(contact)` - Format contact for display
- `calculateAge(dateOfBirth)` - Calculate age from date of birth

---

### Tenant Management Domain (`tenants.ts`)

Pure functions for tenant operations and access control.

#### Core Types

```typescript
export type TenantError =
  | { type: 'NOT_FOUND'; tenantId: TenantId }
  | { type: 'ACCESS_DENIED'; tenantId: TenantId; userId: UserId }
  | { type: 'SUBSCRIPTION_EXPIRED'; tenantId: TenantId; expiredAt: Date }
  | { type: 'LIMIT_EXCEEDED'; limit: string; max: number; current: number }
  | { type: 'FEATURE_NOT_AVAILABLE'; feature: string; plan: string };

export type AccessError =
  | { type: 'UNAUTHORIZED'; message: string }
  | { type: 'FORBIDDEN'; resource: string }
  | { type: 'TENANT_MISMATCH'; expected: TenantId; actual: TenantId }
  | { type: 'SUBSCRIPTION_REQUIRED'; feature: string };

export type SwitchError =
  | { type: 'TENANT_NOT_FOUND'; tenantId: TenantId }
  | { type: 'ACCESS_DENIED'; tenantId: TenantId }
  | { type: 'ALREADY_ACTIVE'; tenantId: TenantId }
  | { type: 'SWITCH_FAILED'; reason: string };
```

#### Key Functions

**`validateTenantAccess()`**
```typescript
function validateTenantAccess(
  user: User,
  tenantId: TenantId
): Result<void, AccessError>
```
Validates user has permission to access specific tenant.

**`switchTenant()`**
```typescript
function switchTenant(
  user: User,
  newTenant: Tenant,
  availableTenants: Tenant[]
): Result<Tenant, SwitchError>
```
Validates and prepares tenant switch operation.

**`validateTenantSubscription()`**
```typescript
function validateTenantSubscription(
  tenant: Tenant
): Result<void, TenantError>
```
Checks subscription status and expiration.

**`validateFeatureAccess()`**
```typescript
function validateFeatureAccess(
  tenant: Tenant,
  feature: string
): Result<void, TenantError>
```
Validates tenant has access to specific feature.

**`validateUsageLimit()`**
```typescript
function validateUsageLimit(
  tenant: Tenant,
  limitType: 'users' | 'contacts' | 'storage',
  currentUsage: number
): Result<void, TenantError>
```
Checks if tenant is within usage limits.

#### Helper Functions

- `getTenantDisplayName(tenant)` - Get display name for tenant
- `isTrial(tenant)` - Check if subscription is trial
- `isActive(tenant)` - Check if subscription is active
- `getDaysUntilExpiration(tenant)` - Get days until expiration
- `shouldShowExpirationWarning(tenant)` - Check if warning needed
- `getAvailableFeaturesForPlan(plan)` - Get features for plan
- `getUsagePercentage(tenant, limitType, usage)` - Calculate usage %
- `isApproachingLimit(tenant, limitType, usage)` - Check if near limit
- `validateTenantSettings(settings)` - Validate tenant settings

---

### 6.2 Business Rules

#### Authentication Rules (`rules/authRules.ts`)

**Password Strength Validation**

```typescript
export const DEFAULT_PASSWORD_REQUIREMENTS: PasswordRequirements = {
  minLength: 15,
  maxLength: 64,
  // Remove composition flags: requireUppercase, requireLowercase, requireNumbers, requireSpecialChars, minSpecialChars
};

// Note: Compromise password checking should be implemented with local blocklists or API lookups
// to reject common passwords like "password123", "qwerty123", birthday-based passwords, common patterns, etc.
// Rejection should include screening against compromised password databases and reject matches.
// Backend must avoid silent truncation and validate/handle long Unicode passwords safely for hashing/storage.

function validatePasswordStrength(
  password: string,
  requirements?: PasswordRequirements,
  username?: string
): Result<void, PasswordValidationError>
```

**Session Timeout Rules**

```typescript
export const DEFAULT_SESSION_TIMEOUT: SessionTimeoutConfig = {
  idleTimeout: 30, // 30 minutes of inactivity
  absoluteTimeout: 8, // 8 hours max session
  warningBeforeTimeout: 5, // warn 5 minutes before timeout
};

function shouldTimeoutFromIdle(
  lastActivity: Date,
  config?: SessionTimeoutConfig
): boolean

function shouldTimeoutFromAbsolute(
  sessionStart: Date,
  config?: SessionTimeoutConfig
): boolean

function shouldShowTimeoutWarning(
  lastActivity: Date,
  config?: SessionTimeoutConfig
): boolean
```

**Password Strength Scoring**

```typescript
function calculatePasswordStrength(password: string): number // Returns 0-100

function getPasswordStrengthLabel(score: number): 
  'weak' | 'fair' | 'good' | 'strong' | 'very strong'
```

#### Contact Rules (`rules/contactRules.ts`)

**Field Validation**

```typescript
function validateEmailFormat(email: string): Result<void, ContactValidationError>

function validatePhoneFormat(phone: string): Result<void, ContactValidationError>

function validateEmailUniqueness(
  email: string,
  existingContacts: Contact[],
  excludeContactId?: string
): Result<void, ContactValidationError>

function validatePhoneUniqueness(
  phone: string,
  existingContacts: Contact[],
  excludeContactId?: string
): Result<void, ContactValidationError>

function validateAgeRange(
  age: number,
  min?: number,
  max?: number
): Result<void, ContactValidationError>
```

**Contact Quality Assessment**

```typescript
function calculateContactCompleteness(contact: Partial<Contact>): number // 0-100%

function getContactQualityScore(contact: Contact): number // 0-100

function hasMinimumContactInfo(contact: Partial<Contact>): boolean
```

**Data Sanitization**

```typescript
function sanitizeContactData<T extends Partial<Contact>>(contact: T): T

function formatContactName(
  contact: Partial<Contact>,
  format: 'full' | 'last-first' | 'first-only'
): string
```

#### Tenant Rules (`rules/tenantRules.ts`)

**Subscription Plan Limits**

```typescript
export const PLAN_LIMITS: Record<'basic' | 'professional' | 'enterprise', PlanLimits> = {
  basic: {
    users: 5,
    contacts: 1000,
    storage: 1024, // 1 GB
    apiCallsPerMonth: 10000,
    features: ['contacts', 'basic_search', 'export_csv', 'email_notifications'],
  },
  professional: {
    users: 25,
    contacts: 10000,
    storage: 10240, // 10 GB
    apiCallsPerMonth: 100000,
    features: [/* ... 13 features ... */],
  },
  enterprise: {
    users: -1, // unlimited
    contacts: -1,
    storage: -1,
    apiCallsPerMonth: -1,
    features: [/* ... 25 features ... */],
  },
};
```

**Limit Validation**

```typescript
function validateSubscriptionLimit(
  tenant: Tenant,
  limitType: 'users' | 'contacts' | 'storage',
  currentUsage: number
): Result<void, SubscriptionValidationError>

function validateFeatureAccess(
  tenant: Tenant,
  feature: string
): Result<void, SubscriptionValidationError>

function validateSubscriptionStatus(
  subscription: TenantSubscription
): Result<void, SubscriptionValidationError>
```

**Usage Analytics**

```typescript
function calculateUsagePercentage(
  tenant: Tenant,
  limitType: 'users' | 'contacts' | 'storage',
  currentUsage: number
): number // Returns -1 for unlimited

function isApproachingLimit(
  tenant: Tenant,
  limitType: 'users' | 'contacts' | 'storage',
  currentUsage: number,
  threshold?: number // default: 80%
): boolean

function calculateUpgradeBenefitScore(
  tenant: Tenant,
  targetPlan: 'basic' | 'professional' | 'enterprise',
  currentUsage: UsageMetrics
): number // 0-100

function getRecommendedPlan(currentUsage: UsageMetrics): 
  'basic' | 'professional' | 'enterprise'
```

---

## Phase 5: Component Layer Updates

### 5.1 Existing Hooks (Already Implemented)

The following hooks are already implemented and follow Result-based patterns:

#### `useAsync<T, E>()` ✅

```typescript
interface AsyncState<T, E> {
  loading: boolean;
  result: Result<T, E> | null;
  execute: () => Promise<Result<T, E>>;
  reset: () => void;
}
```

**Features:**
- Result-based async operations
- Automatic cancellation on unmount
- Loading state management
- Memoized function warning in development

#### `useApiCall<T, E>()` ✅

```typescript
interface ApiCallOptions<T, E> {
  transformResult?: (result: Result<T, E>) => Result<T, E>;
  onError?: (error: E) => void;
  onSuccess?: (data: T) => void;
  retryOnError?: boolean;
  maxRetries?: number;
  retryDelay?: number;
}
```

**Features:**
- Automatic error handling
- Retry logic with exponential backoff
- Result transformation
- Success/error callbacks

#### `useFetch<T>()` ✅

```typescript
interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: AppError | null;
  retrying: boolean;
  refetch: () => Promise<Result<T, AppError>>;
}
```

**Features:**
- HTTP request management
- Timeout handling
- Retry logic
- Response transformation
- Caching support (via `useCachedFetch`)

#### `useValidation<T>()` ✅

Already implemented for form validation with Result types.

#### `useFormValidation<T>()` ✅

Already implemented with railway pattern.

### 5.2 To-Do Items

#### ⚠️ `useAuth()` Hook Refactoring

**Status:** Not Started  
**File:** `frontend/src/hooks/useAuth.ts`

**Requirements:**
- Expose Result-based methods for all auth operations
- Replace imperative error handling
- Use domain logic functions from `domain/auth.ts`

**Proposed API:**

```typescript
interface UseAuthResult {
  // State
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: AuthFlowError | null;
  
  // Actions (Result-based)
  login: (credentials: LoginCredentials) => Promise<Result<Session, AuthFlowError>>;
  logout: () => Promise<Result<void, AuthFlowError>>;
  refresh: () => Promise<Result<Session, SessionError>>;
  switchTenant: (tenantId: TenantId) => Promise<Result<Tenant, SwitchError>>;
  
  // Helpers
  hasRole: (role: string) => boolean;
  hasAnyRole: (roles: string[]) => boolean;
  hasAllRoles: (roles: string[]) => boolean;
}
```

**Implementation Steps:**

1. Import domain functions from `domain/auth.ts`
2. Replace direct API calls with composition: API call → domain function → Result
3. Use `useAsync` for async operations
4. Update all error handling to use Result patterns

#### ⚠️ ErrorBoundary Enhancement

**Status:** Partially Complete  
**File:** `frontend/src/components/ErrorBoundary.tsx`

**Current State:**
- Basic Result error handling exists
- Pattern matching on error types implemented

**Remaining Work:**

1. **Add Error Recovery Strategies:**

```typescript
interface ErrorRecoveryStrategy {
  type: 'retry' | 'fallback' | 'redirect' | 'ignore';
  execute: () => void | Promise<void>;
}

function getRecoveryStrategy(error: AppError): ErrorRecoveryStrategy
```

2. **Implement Error Reporting:**

```typescript
function reportError(error: AppError, componentStack?: string): Result<void, ReportError>
```

3. **Add Pattern Matching UI:**

```typescript
import { match } from 'ts-pattern';

const errorUI = match(error)
  .with({ type: 'network', retryable: true }, (e) => <RetryableError error={e} />)
  .with({ type: 'auth' }, (e) => <AuthError error={e} />)
  .with({ type: 'validation' }, (e) => <ValidationError error={e} />)
  .otherwise((e) => <GenericError error={e} />);
```

#### ⚠️ Optimistic Updates in useFetch

**Status:** Not Started  
**File:** `frontend/src/hooks/useFetch.ts`

**Requirements:**
- Add optimistic update support
- Rollback on error
- Merge strategies for conflicts

**Proposed API:**

```typescript
interface OptimisticUpdateOptions<T> {
  optimisticData: T;
  rollbackOnError: boolean;
  mergeStrategy?: 'replace' | 'merge' | 'custom';
  customMerge?: (current: T, optimistic: T) => T;
}

function useFetchWithOptimisticUpdate<T>(
  url: string,
  options: FetchOptions & { optimistic?: OptimisticUpdateOptions<T> }
): FetchState<T> & {
  updateOptimistic: (data: T) => Result<void, OptimisticError>;
}
```

---

## Architecture

### Clean Architecture Layers

```
┌─────────────────────────────────────────┐
│         UI Layer (Components)           │
│    - React Components                   │
│    - Hooks (useAuth, useFetch, etc.)    │
│    - ErrorBoundary                      │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│      Application Layer (Contexts)       │
│    - AuthContext                        │
│    - Uses Domain Logic                  │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│       Domain Layer (Pure Logic)         │
│    - auth.ts                            │
│    - contacts.ts                        │
│    - tenants.ts                         │
│    - rules/ (Business Rules)            │
│    - ALL PURE FUNCTIONS                 │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│    Infrastructure Layer (Services)      │
│    - API Client                         │
│    - Storage Service                    │
│    - External Integrations              │
└─────────────────────────────────────────┘
```

### Data Flow with Railway-Oriented Programming

```typescript
// Example: Login Flow
credentials 
  → validateCredentials()         // Returns Result<ValidatedCreds, ValidationError>
  → apiCall()                     // Returns Result<AuthResponse, ApiError>
  → authenticateUser()            // Returns Result<Session, AuthFlowError>
  → storeSession()                // Returns Result<void, StorageError>
  → updateContext()               // Side effect only after all validations pass
```

---

## Usage Examples

### Example 1: Authentication with Domain Logic

```typescript
import { authenticateUser, verifyToken } from '@/domain';
import { authService } from '@/services/api';

async function loginUser(credentials: LoginCredentials): Promise<Result<Session, AuthFlowError>> {
  // Step 1: Validate credentials (from form validation)
  const credentialsResult = validateLoginCredentials(credentials);
  if (credentialsResult.isErr()) {
    return err({ 
      type: 'INVALID_CREDENTIALS', 
      message: 'Invalid credentials format' 
    });
  }

  // Step 2: Call API
  const apiResult = await authService.login(credentials);
  if (apiResult.isErr()) {
    return err({
      type: 'NETWORK_ERROR',
      statusCode: apiResult.error.statusCode,
      message: apiResult.error.message,
    });
  }

  // Step 3: Transform to domain model
  return authenticateUser(credentials, apiResult.value);
}

// Usage in component
const { execute, result, loading } = useAsync(
  useCallback(() => loginUser(credentials), [credentials])
);

// Pattern match on result
useEffect(() => {
  if (result) {
    match(result)
      .with({ isOk: () => true }, (r) => {
        const session = r.value;
        console.log('Logged in:', session.user.email);
      })
      .with({ isErr: () => true }, (r) => {
        match(r.error)
          .with({ type: 'INVALID_CREDENTIALS' }, () => {
            showError('Invalid credentials');
          })
          .with({ type: 'NETWORK_ERROR' }, () => {
            showError('Network error. Please try again.');
          })
          .otherwise(() => {
            showError('Login failed');
          });
      })
      .exhaustive();
  }
}, [result]);
```

### Example 2: Contact Creation with Validation

```typescript
import { createContact, ContactRules } from '@/domain';

function ContactForm() {
  const { session } = useAuth();
  
  const handleSubmit = async (data: ContactCreateData) => {
    if (!session) return;

    // Validate using business rules
    const emailValidation = ContactRules.validateEmailFormat(data.email);
    if (emailValidation.isErr()) {
      return showError('Invalid email format');
    }

    // Create contact using domain logic
    const contactResult = createContact(
      data,
      session.user.id,
      session.tenant.id
    );

    if (contactResult.isErr()) {
      return match(contactResult.error)
        .with({ type: 'VALIDATION_FAILED' }, (e) => {
          showError(`Validation failed: ${Object.values(e.errors).join(', ')}`);
        })
        .with({ type: 'DUPLICATE_CONTACT' }, (e) => {
          showError(`${e.field} already exists: ${e.value}`);
        })
        .otherwise(() => {
          showError('Failed to create contact');
        });
    }

    // Send to API
    const apiResult = await addressBookService.create(contactResult.value);
    
    return apiResult.match(
      (contact) => {
        showSuccess('Contact created successfully');
        navigate(`/contacts/${contact.id}`);
      },
      (error) => {
        showError('Failed to save contact');
      }
    );
  };

  return <Form onSubmit={handleSubmit} />;
}
```

### Example 3: Tenant Access Control

```typescript
import { validateTenantAccess, validateFeatureAccess, TenantRules } from '@/domain';

function ProtectedFeature({ feature }: { feature: string }) {
  const { session } = useAuth();

  if (!session) {
    return <Redirect to="/login" />;
  }

  // Validate tenant access
  const accessResult = validateTenantAccess(session.user, session.tenant.id);
  if (accessResult.isErr()) {
    return <AccessDenied error={accessResult.error} />;
  }

  // Validate feature access
  const featureResult = validateFeatureAccess(session.tenant, feature);
  if (featureResult.isErr()) {
    return <UpgradePrompt 
      feature={feature} 
      currentPlan={session.tenant.subscription.plan} 
    />;
  }

  // Check usage limits
  const usageResult = TenantRules.validateSubscriptionLimit(
    session.tenant,
    'contacts',
    currentContactCount
  );

  if (usageResult.isErr()) {
    return <UsageLimitReached error={usageResult.error} />;
  }

  return <FeatureContent />;
}
```

### Example 4: Password Strength Validation

```typescript
import { AuthRules } from '@/domain';

function PasswordInput() {
  const [password, setPassword] = useState('');
  const [strength, setStrength] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);

  const handlePasswordChange = (value: string) => {
    setPassword(value);

    // Calculate strength
    const score = AuthRules.calculatePasswordStrength(value);
    setStrength(score);

    // Validate against rules
    const validation = AuthRules.validatePasswordStrength(value);
    if (validation.isErr()) {
      match(validation.error)
        .with({ type: 'TOO_SHORT' }, (e) => {
          setErrors([`Minimum ${e.minLength} characters required`]);
        })
        .with({ type: 'MISSING_UPPERCASE' }, () => {
          setErrors(['Must contain uppercase letter']);
        })
        .with({ type: 'MISSING_NUMBERS' }, () => {
          setErrors(['Must contain numbers']);
        })
        .otherwise(() => {
          setErrors(['Invalid password']);
        });
    } else {
      setErrors([]);
    }
  };

  const strengthLabel = AuthRules.getPasswordStrengthLabel(strength);

  return (
    <div>
      <Input 
        type="password" 
        value={password} 
        onChange={(e) => handlePasswordChange(e.target.value)} 
      />
      <PasswordStrengthIndicator strength={strength} label={strengthLabel} />
      {errors.map(error => <ErrorMessage key={error}>{error}</ErrorMessage>)}
    </div>
  );
}
```

---

## Testing Strategy

### Unit Testing Pure Functions

All domain logic is pure and easily testable without mocks:

```typescript
import { describe, test, expect } from 'bun:test';
import { authenticateUser, verifyToken } from '@/domain';

describe('authenticateUser', () => {
  test('should create session from valid auth response', () => {
    const credentials: LoginCredentials = {
      usernameOrEmail: 'user@example.com',
      password: 'password123',
      tenantId: 'tenant1',
    };

    const authResponse: AuthResponse = {
      success: true,
      token: 'valid.jwt.token',
      refreshToken: 'refresh.token',
      user: mockUser,
      tenant: mockTenant,
      expiresIn: 3600,
    };

    const result = authenticateUser(credentials, authResponse);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.user).toEqual(mockUser);
      expect(result.value.token).toBe('valid.jwt.token');
      expect(result.value.expiresAt).toBeInstanceOf(Date);
    }
  });

  test('should fail with missing tokens', () => {
    const credentials: LoginCredentials = { /* ... */ };
    const authResponse = { ...validResponse, token: '' };

    const result = authenticateUser(credentials, authResponse);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_CREDENTIALS');
    }
  });
});

describe('verifyToken', () => {
  test('should decode valid JWT', () => {
    const token = createMockJWT({ exp: Date.now() / 1000 + 3600 });
    
    const result = verifyToken(token);

    expect(result.isOk()).toBe(true);
  });

  test('should reject expired token', () => {
    const token = createMockJWT({ exp: Date.now() / 1000 - 3600 });
    
    const result = verifyToken(token);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('EXPIRED');
    }
  });
});
```

### Property-Based Testing

Use `fast-check` for property-based testing:

```typescript
import fc from 'fast-check';
import { ContactRules } from '@/domain';

describe('Contact validation properties', () => {
  test('email validation is consistent', () => {
    fc.assert(
      fc.property(fc.emailAddress(), (email) => {
        const result = ContactRules.validateEmailFormat(email);
        expect(result.isOk()).toBe(true);
      })
    );
  });

  test('phone validation accepts valid formats', () => {
    const phoneGen = fc.tuple(
      fc.constantFrom('+1', '+44', '+'),
      fc.integer({ min: 1000000000, max: 9999999999 })
    ).map(([prefix, num]) => `${prefix}${num}`);

    fc.assert(
      fc.property(phoneGen, (phone) => {
        const result = ContactRules.validatePhoneFormat(phone);
        expect(result.isOk()).toBe(true);
      })
    );
  });

  test('age calculation is always non-negative', () => {
    fc.assert(
      fc.property(fc.date({ max: new Date() }), (dob) => {
        const age = ContactRules.calculateAgeFromDOB(dob);
        expect(age).toBeGreaterThanOrEqual(0);
      })
    );
  });
});
```

### Integration Testing with Domain Logic

```typescript
import { describe, test, expect, beforeEach } from 'bun:test';
import { createContact, updateContact, mergeContacts } from '@/domain';

describe('Contact management flow', () => {
  let userId: UserId;
  let tenantId: TenantId;

  beforeEach(() => {
    userId = 'user123' as UserId;
    tenantId = 'tenant1' as TenantId;
  });

  test('should create, update, and merge contacts', () => {
    // Create primary contact
    const primaryData: ContactCreateData = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
    };

    const primaryResult = createContact(primaryData, userId, tenantId);
    expect(primaryResult.isOk()).toBe(true);
    const primary = primaryResult._unsafeUnwrap();

    // Create secondary contact
    const secondaryData: ContactCreateData = {
      firstName: 'John',
      lastName: 'Doe',
      phone: '+1234567890',
    };

    const secondaryResult = createContact(secondaryData, userId, tenantId);
    expect(secondaryResult.isOk()).toBe(true);
    const secondary = secondaryResult._unsafeUnwrap();

    // Update primary contact
    const updateResult = updateContact(primary, { company: 'Acme Corp' }, userId);
    expect(updateResult.isOk()).toBe(true);
    const updated = updateResult._unsafeUnwrap();
    expect(updated.company).toBe('Acme Corp');

    // Merge contacts
    const mergeResult = mergeContacts(updated, secondary, 'combine', userId);
    expect(mergeResult.isOk()).toBe(true);
    const merged = mergeResult._unsafeUnwrap();
    expect(merged.email).toBe('john@example.com');
    expect(merged.phone).toBe('+1234567890');
    expect(merged.company).toBe('Acme Corp');
  });
});
```

---

## Migration Guide

### Step 1: Import Domain Functions

```typescript
// Before: Direct API calls in components
import { authService } from '@/services/api';

const handleLogin = async () => {
  try {
    const response = await authService.login(credentials);
    if (response.success) {
      setUser(response.user);
    }
  } catch (error) {
    setError(error.message);
  }
};

// After: Use domain functions
import { authenticateUser } from '@/domain';
import { authService } from '@/services/api';

const handleLogin = async () => {
  const apiResult = await authService.login(credentials);
  
  const sessionResult = apiResult.andThen(authResponse =>
    authenticateUser(credentials, authResponse)
  );

  sessionResult.match(
    (session) => setSession(session),
    (error) => setError(error.message)
  );
};
```

### Step 2: Replace Imperative Validation

```typescript
// Before: Imperative validation
const validateContact = (data: ContactData) => {
  const errors: Record<string, string> = {};
  
  if (!data.email.includes('@')) {
    errors.email = 'Invalid email';
  }
  
  if (data.phone.length < 10) {
    errors.phone = 'Phone too short';
  }
  
  return Object.keys(errors).length > 0 ? errors : null;
};

// After: Use business rules
import { ContactRules } from '@/domain';

const validateContact = (data: ContactData) => {
  const emailResult = ContactRules.validateEmailFormat(data.email);
  const phoneResult = ContactRules.validatePhoneFormat(data.phone);

  return Result.combine([emailResult, phoneResult]);
};
```

### Step 3: Update Context to Use Domain Logic

```typescript
// Before: Business logic in context
const login = async (credentials: LoginCredentials) => {
  try {
    const response = await authService.login(credentials);
    
    // Business logic mixed with infrastructure
    if (response.token) {
      localStorage.setItem('token', response.token);
      const decoded = jwtDecode(response.token);
      setUser({ ...response.user, roles: decoded.roles });
    }
  } catch (error) {
    throw error;
  }
};

// After: Use domain logic
import { authenticateUser, verifyToken } from '@/domain';

const login = async (credentials: LoginCredentials) => {
  const apiResult = await authService.login(credentials);
  
  const sessionResult = apiResult.andThen(authResponse =>
    authenticateUser(credentials, authResponse)
  );

  return sessionResult.map(session => {
    storageService.set('session', session);
    setSession(session);
    return session;
  });
};
```

---

## Next Steps

### Immediate (Phase 5 Completion)

1. **Refactor useAuth() Hook**
   - [ ] Import domain functions
   - [ ] Replace imperative code with Result composition
   - [ ] Add comprehensive error handling
   - [ ] Write unit tests

2. **Complete ErrorBoundary Enhancement**
   - [ ] Implement error recovery strategies
   - [ ] Add error reporting with Result
   - [ ] Enhanced pattern matching UI
   - [ ] Test all error scenarios

3. **Add Optimistic Updates to useFetch**
   - [ ] Implement optimistic update API
   - [ ] Add rollback logic
   - [ ] Support merge strategies
   - [ ] Write integration tests

### Short Term (Next 2 Weeks)

4. **Write Comprehensive Tests**
   - [ ] Unit tests for all domain functions (target: 95% coverage)
   - [ ] Property-based tests for validation rules
   - [ ] Integration tests for complete flows
   - [ ] Performance benchmarks for business rules

5. **Update Existing Components**
   - [ ] Migrate AddressBookPage to use domain logic
   - [ ] Update TenantsPage with tenant business rules
   - [ ] Refactor LoginPage to use auth domain functions
   - [ ] Add password strength indicator using AuthRules

6. **Documentation**
   - [ ] Add JSDoc examples to all public functions
   - [ ] Create migration guide for team
   - [ ] Record video walkthrough of architecture
   - [ ] Update README with new patterns

### Medium Term (Next Month)

7. **Advanced Patterns**
   - [ ] Implement caching layer with Result API
   - [ ] Add event sourcing for audit logs
   - [ ] Create undo/redo system using domain events
   - [ ] Implement optimistic UI for all mutations

8. **Developer Experience**
   - [ ] Create code snippets for VS Code
   - [ ] Add ESLint rules for FP patterns
   - [ ] Set up pre-commit hooks for validation
   - [ ] Create playground for testing domain logic

9. **Performance Optimization**
   - [ ] Memoize expensive domain computations
   - [ ] Add lazy evaluation where beneficial
   - [ ] Profile and optimize hot paths
   - [ ] Implement worker threads for heavy calculations

---

## Conclusion

**Phase 6 Complete ✅**

All business logic has been successfully extracted into pure, testable, composable functions. The domain layer is now:

- **Independent**: No dependencies on React, API, or storage
- **Testable**: 100% unit testable without mocks
- **Type-Safe**: Explicit error types for all operations
- **Documented**: Comprehensive JSDoc for all public APIs
- **Railway-Oriented**: Consistent Result-based error handling

**Phase 5 In Progress ⚠️**

Most hooks are already implemented. Remaining work:
- Refactor useAuth() to use domain logic
- Complete ErrorBoundary enhancements
- Add optimistic updates to useFetch

**Impact:**

This architecture provides a solid foundation for:
- Easy testing and maintenance
- Clear separation of concerns
- Predictable error handling
- Composable business logic
- Onboarding new developers

---

**Questions or Issues?**

Please refer to the following resources:
- `frontend/docs/PHASE_3_IMPLEMENTATION.md` - AuthContext & Storage
- `frontend/docs/PHASE_4_IMPLEMENTATION.md` - Form Validation
- `frontend/docs/BEST-PRACTICES-FUNCTIONAL-PATTERNS.md` - General FP guidelines
- Backend ADR: `/docs/ADR-001-FUNCTIONAL-PATTERNS.md`

**Last Updated:** October 14, 2025
