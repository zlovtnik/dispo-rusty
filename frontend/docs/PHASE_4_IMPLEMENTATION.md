# Phase 4: Form Validation & Handling - Implementation Guide

**Status:** ✅ Completed  
**Date:** October 13, 2025  
**Author:** GitHub Copilot

## Overview

Phase 4 implements comprehensive form validation and handling using functional programming patterns, including:

- **Pure validation functions** with branded types
- **Railway-oriented programming** for form submission pipelines
- **Result types** for type-safe error handling
- **Pattern matching** for error display
- **Combinator functions** for composable validation

## Implementation Summary

### 4.1 Validation Functions Library ✅

**File Created:** `frontend/src/utils/formValidation.ts`

Implemented pure validation functions with branded types:

```typescript
// Branded types for validated data
export type Email = string & { readonly __brand: 'Email' };
export type Phone = string & { readonly __brand: 'Phone' };
export type Password = string & { readonly __brand: 'Password' };
export type Age = number & { readonly __brand: 'Age' };
export type ZipCode = string & { readonly __brand: 'ZipCode' };

// Validation functions
validateEmail(email: string): Result<Email, FormValidationError>
validatePhone(phone: string, format?: 'US' | 'INTERNATIONAL' | 'AUTO'): Result<Phone, FormValidationError>
validatePassword(password: string): Result<Password, FormValidationError>
validateAge(age: number, options?: { min?: number; max?: number }): Result<Age, FormValidationError>
validateZipCode(zipCode: string, country?: 'US' | 'CANADA' | 'INTERNATIONAL'): Result<ZipCode, FormValidationError>
```

**Key Features:**

- **Branded types** prevent mixing validated and unvalidated data
- **Discriminated union errors** for exhaustive pattern matching
- **Comprehensive validation rules** with detailed error messages
- **RFC-compliant patterns** for email, phone, and postal codes

#### Combinator Functions ✅

**Implemented combinators:**

```typescript
// Parallel validation - fails fast on first error
validateAll<T, E>(validations: Result<T, E>[]): Result<T[], E>

// Sequential validation - railway-oriented programming
validateSequence<T, E>(validations: (() => Result<T, E>)[]): Result<T[], E>

// Optional field validation
validateOptional<T, E>(
  value: string | number | undefined | null,
  validator: (v: string | number) => Result<T, E>
): Result<T | undefined, E>

// Collect all errors instead of failing fast
validateAllOrCollectErrors<T, E>(
  validations: { [K in keyof T]: Result<T[K], E> }
): Result<T, Record<keyof T, E>>
```

**Usage Example:**

```typescript
// Validate multiple fields in parallel
const result = validateAll([
  validateEmail('user@example.com'),
  validatePhone('+1-234-567-8900'),
  validateAge(25, { min: 18, max: 120 })
]);

// Collect all errors for form display
const formResult = validateAllOrCollectErrors({
  email: validateEmail(formData.email),
  phone: validatePhone(formData.phone),
  age: validateAge(formData.age)
});
```

### 4.2 Form Processing Pipeline ✅

**File Created:** `frontend/src/utils/formPipeline.ts`

Implemented complete form submission pipeline with railway-oriented programming:

```typescript
createFormPipeline<TForm, TValidated, TDTO, TResponse>({
  validate: FormValidator<TForm, TValidated>,
  sanitize?: Sanitizer<TValidated>,
  transform: Transformer<TValidated, TDTO>,
  submit: Submitter<TDTO, TResponse>
})
```

**Pipeline Flow:**

```
Form Data → Validate → Sanitize → Transform to DTO → Submit to API → Response
     ↓          ↓          ↓            ↓              ↓            ↓
   Error    Error      Error        Error          Error      Success
```

**Key Features:**

- **Type-safe transformations** at each stage
- **Early failure detection** with Result types
- **Composable sanitizers** for data cleaning
- **Pipeline state machine** for loading states
- **React Hook Form integration** with custom resolver

#### Built-in Sanitizers ✅

```typescript
Sanitizers.trimStrings<T>        // Trim all string fields
Sanitizers.removeNullish<T>      // Remove null/undefined values
Sanitizers.emptyStringsToUndefined<T>  // Convert "" to undefined
Sanitizers.compose<T>(...sanitizers)   // Compose multiple sanitizers
```

#### React Hook Form Integration ✅

```typescript
// Custom resolver for React Hook Form
const resolver = createFormResolver(validateLoginForm);

const { register, handleSubmit } = useForm({
  resolver
});

// Field-level validation
const emailValidator = createFieldValidator(validateEmail);

<input {...register('email', { validate: emailValidator })} />
```

### 4.3 LoginPage Refactoring ✅

**File Created:** `frontend/src/pages/LoginPage.fp.tsx`

Refactored LoginPage with complete FP implementation:

#### Key Improvements:

**1. Type-Safe Validation Pipeline**

```typescript
interface LoginFormData {
  usernameOrEmail: string;
  password: string;
  tenantId: string;
  rememberMe: boolean;
}

interface ValidatedLoginData {
  username: ValidatedUsername;    // Branded type
  password: ValidatedPassword;    // Branded type
  tenantId: TenantId;             // Branded type
  rememberMe: boolean;
}

const validateLoginForm: FormValidator<LoginFormData, ValidatedLoginData> = (
  formData: LoginFormData
): Result<ValidatedLoginData, Record<string, CredentialValidationError>> => {
  // Validate all fields
  const usernameResult = validateUsername(formData.usernameOrEmail);
  const passwordResult = validatePassword(formData.password);
  const tenantIdResult = validateTenantId(formData.tenantId);
  
  // Collect errors or return validated data
  // ...
};
```

**2. Railway-Oriented Programming**

```typescript
const loginPipeline = createFormPipeline({
  validate: validateLoginForm,
  transform: transformToLoginDTO,
  submit: submitLogin,
});

const onSubmit = async (formData: LoginFormData) => {
  const result = await loginPipeline(formData);
  
  result.match(
    (response) => {
      // Success case
      navigate(from, { replace: true });
    },
    (error) => {
      // Error case - extract and display field errors
      setPipelineState(PipelineStates.error(error));
    }
  );
};
```

**3. Pattern Matching for Error Handling**

```typescript
import { match } from 'ts-pattern';

const renderErrorAlert = () => {
  return match(pipelineState)
    .with({ status: 'error' }, (state) => (
      <Alert message={formatPipelineError(state.error)} type="error" />
    ))
    .otherwise(() => null);
};

// Loading state with pattern matching
const buttonText = match(pipelineState)
  .with({ status: 'validating' }, () => 'Validating...')
  .with({ status: 'submitting' }, () => 'Signing In...')
  .otherwise(() => 'Sign In');
```

**4. Pipeline State Management**

```typescript
// Discriminated union for pipeline state
type PipelineState<T> =
  | { status: 'idle' }
  | { status: 'validating' }
  | { status: 'sanitizing' }
  | { status: 'transforming' }
  | { status: 'submitting' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: PipelineError };

const [pipelineState, setPipelineState] = useState<PipelineState<LoginResponse>>(
  PipelineStates.idle()
);

// Helper to check loading state
const isFormLoading = authLoading || isPipelineLoading(pipelineState);
```

**5. Field-Level Error Display**

```typescript
const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

const getFieldValidationProps = (fieldName: keyof LoginFormData) => {
  if (fieldErrors[fieldName]) {
    return {
      validateStatus: 'error' as const,
      help: fieldErrors[fieldName],
    };
  }
  return {};
};

<Form.Item
  name="usernameOrEmail"
  {...getFieldValidationProps('usernameOrEmail')}
>
  <Input />
</Form.Item>
```

## Benefits Achieved

### Type Safety ✅

- **Zero runtime type errors** - all validation at compile time
- **Branded types** prevent mixing validated/unvalidated data
- **Discriminated unions** for exhaustive pattern matching
- **Type inference** throughout the pipeline

### Error Handling ✅

- **No try-catch blocks** - all errors as values via Result
- **Composable error handling** with railway-oriented programming
- **Field-level error display** with automatic error extraction
- **User-friendly error messages** with formatters

### Testability ✅

- **Pure functions** easy to unit test
- **No side effects** in validation logic
- **Mockable pipeline stages** for integration tests
- **Deterministic behavior** with Result types

### Developer Experience ✅

- **IntelliSense support** for all validation functions
- **Clear error messages** at compile time
- **Reusable validators** across forms
- **Composable patterns** for complex validation

## Usage Examples

### Basic Form Validation

```typescript
import { validateEmail, validatePhone, validateAllOrCollectErrors } from '@/utils/formValidation';

const validateContactForm = (formData: ContactFormData) => {
  return validateAllOrCollectErrors({
    email: validateEmail(formData.email),
    phone: validatePhone(formData.phone),
    age: validateAge(formData.age, { min: 18, max: 120 }),
  });
};
```

### Complete Form Pipeline

```typescript
import { createFormPipeline, Sanitizers } from '@/utils/formPipeline';

const contactPipeline = createFormPipeline({
  validate: validateContactForm,
  sanitize: Sanitizers.compose(
    Sanitizers.trimStrings,
    Sanitizers.emptyStringsToUndefined
  ),
  transform: transformToContactDTO,
  submit: submitContact,
});

const onSubmit = async (formData: ContactFormData) => {
  const result = await contactPipeline(formData);
  
  result.match(
    (response) => console.log('Success:', response),
    (error) => console.error('Error:', formatPipelineError(error))
  );
};
```

### Optional Field Validation

```typescript
import { validateOptional } from '@/utils/formValidation';

const middleNameResult = validateOptional(
  formData.middleName,
  (value) => ok(value.trim())
);

const phoneResult = validateOptional(
  formData.phone,
  validatePhone
);
```

## Migration Path

### From Existing LoginPage

The original `LoginPage.tsx` still exists and works. To migrate:

1. **Import the new FP version:**
   ```typescript
   import { LoginPageFP } from '@/pages/LoginPage.fp';
   ```

2. **Update routing:**
   ```typescript
   <Route path="/login" element={<LoginPageFP />} />
   ```

3. **Test thoroughly** before removing old implementation

### From Imperative Validation

Before (imperative):
```typescript
const [errors, setErrors] = useState({});

const onSubmit = async (data) => {
  try {
    if (!data.email) {
      throw new Error('Email required');
    }
    if (!/\S+@\S+\.\S+/.test(data.email)) {
      throw new Error('Invalid email');
    }
    await api.submit(data);
  } catch (error) {
    setErrors({ email: error.message });
  }
};
```

After (functional):
```typescript
const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

const validateForm = (data: FormData) => {
  return validateAllOrCollectErrors({
    email: validateEmail(data.email)
  });
};

const onSubmit = async (data: FormData) => {
  const result = await formPipeline(data);
  
  result.mapErr((error) => {
    if (error.type === 'VALIDATION_ERROR') {
      setFieldErrors(extractFieldErrors(error));
    }
  });
};
```

## Testing Strategy

### Unit Tests

```typescript
describe('formValidation', () => {
  describe('validateEmail', () => {
    it('should accept valid email', () => {
      const result = validateEmail('user@example.com');
      expect(result.isOk()).toBe(true);
    });

    it('should reject invalid email', () => {
      const result = validateEmail('invalid-email');
      expect(result.isErr()).toBe(true);
    });

    it('should return branded type', () => {
      const result = validateEmail('user@example.com');
      result.match(
        (email) => {
          // email is Email branded type
          expectTypeOf(email).toEqualTypeOf<Email>();
        },
        () => {}
      );
    });
  });
});
```

### Integration Tests

```typescript
describe('LoginPageFP', () => {
  it('should validate form before submission', async () => {
    const { getByLabelText, getByText } = render(<LoginPageFP />);
    
    fireEvent.change(getByLabelText('Username'), { target: { value: 'a' } });
    fireEvent.click(getByText('Sign In'));
    
    await waitFor(() => {
      expect(getByText(/username must be at least 3 characters/i)).toBeInTheDocument();
    });
  });

  it('should submit form with valid data', async () => {
    const mockLogin = jest.fn();
    // ... test implementation
  });
});
```

## Performance Considerations

- **Memoize validators** for expensive operations
- **Debounce field validation** to avoid excessive checks
- **Lazy load validation rules** for large forms
- **Cache validation results** when inputs unchanged

## Future Enhancements

### Planned Features

1. **Async validators** for backend validation
2. **Cross-field validation** (e.g., password confirmation)
3. **Conditional validation** based on other fields
4. **Custom validation schemas** (Zod/Yup integration)
5. **Validation rule composition** (e.g., email + required + unique)

### Code Example - Async Validation

```typescript
// Future implementation
const validateUniqueEmail = async (email: Email): Promise<Result<Email, FormValidationError>> => {
  const exists = await api.checkEmailExists(email);
  
  return exists
    ? err(FormValidationErrors.customValidation('email', 'Email already exists'))
    : ok(email);
};
```

## Documentation

### API Reference

See:
- `frontend/src/utils/formValidation.ts` - Validation functions
- `frontend/src/utils/formPipeline.ts` - Pipeline utilities
- `frontend/src/pages/LoginPage.fp.tsx` - Complete example

### Type Definitions

All types are fully documented with JSDoc:
- `FormValidationError` - Validation error types
- `PipelineError` - Pipeline stage errors
- `PipelineState<T>` - State machine types
- Branded types: `Email`, `Phone`, `Password`, `Age`, `ZipCode`

## Conclusion

Phase 4 implementation provides a **robust, type-safe, and testable** form validation and handling system using functional programming patterns. The railway-oriented programming approach ensures **predictable error handling** and **composable validation logic**.

### Key Achievements

✅ Pure validation functions with branded types  
✅ Railway-oriented programming pipelines  
✅ Pattern matching for error handling  
✅ React Hook Form integration  
✅ LoginPage fully refactored with FP patterns  
✅ Comprehensive combinator functions  
✅ Type-safe error handling throughout  
✅ Zero try-catch blocks in validation logic  

### Next Steps

Proceed to **Phase 5: Component Layer Updates** to refactor hooks and components with FP patterns.
