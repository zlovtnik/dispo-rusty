# Phase 4: Form Validation - Quick Reference

## Validation Functions

### Email Validation
```typescript
import { validateEmail, type Email } from '@/utils/formValidation';

const result = validateEmail('user@example.com');
result.match(
  (email: Email) => console.log('Valid:', email),
  (error) => console.error('Invalid:', formatFormValidationError(error))
);
```

### Phone Validation
```typescript
import { validatePhone, type Phone } from '@/utils/formValidation';

// Auto-detect format (US or International)
validatePhone('+1-234-567-8900')

// Force US format
validatePhone('(234) 567-8900', 'US')

// International format
validatePhone('+44 20 7123 4567', 'INTERNATIONAL')
```

### Password Validation
```typescript
import { validatePassword, type Password } from '@/utils/formValidation';

// Must have 8+ chars, uppercase, lowercase, and number
const result = validatePassword('MyP@ssw0rd');
```

### Age Validation
```typescript
import { validateAge, type Age } from '@/utils/formValidation';

// Basic validation
validateAge(25)

// With constraints
validateAge(17, { min: 18, max: 120 })  // Will fail
```

### ZIP Code Validation
```typescript
import { validateZipCode, type ZipCode } from '@/utils/formValidation';

validateZipCode('12345', 'US')           // US: 12345 or 12345-6789
validateZipCode('K1A 0B1', 'CANADA')     // Canada: A1A 1A1
validateZipCode('SW1A1AA', 'INTERNATIONAL')
```

## Combinator Functions

### Validate All (Parallel)
```typescript
import { validateAll } from '@/utils/formValidation';

const result = validateAll([
  validateEmail(email),
  validatePhone(phone),
  validateAge(age)
]);

// Returns first error or array of validated values
```

### Validate Optional
```typescript
import { validateOptional } from '@/utils/formValidation';

const phoneResult = validateOptional(
  formData.phone,  // May be undefined
  validatePhone
);

// Returns Ok(undefined) if empty, validates if present
```

### Collect All Errors
```typescript
import { validateAllOrCollectErrors } from '@/utils/formValidation';

const result = validateAllOrCollectErrors({
  email: validateEmail(formData.email),
  phone: validatePhone(formData.phone),
  age: validateAge(formData.age)
});

// Returns all errors for all fields (useful for forms)
```

## Form Pipeline

### Basic Pipeline
```typescript
import { createFormPipeline } from '@/utils/formPipeline';

const pipeline = createFormPipeline({
  validate: validateMyForm,
  transform: transformToDTO,
  submit: submitToAPI
});

const result = await pipeline(formData);
```

### With Sanitization
```typescript
import { createFormPipeline, Sanitizers } from '@/utils/formPipeline';

const pipeline = createFormPipeline({
  validate: validateMyForm,
  sanitize: Sanitizers.compose(
    Sanitizers.trimStrings,
    Sanitizers.emptyStringsToUndefined
  ),
  transform: transformToDTO,
  submit: submitToAPI
});
```

### Pipeline State Management
```typescript
import { PipelineStates, isPipelineLoading, type PipelineState } from '@/utils/formPipeline';

const [state, setState] = useState<PipelineState<Response>>(
  PipelineStates.idle()
);

// During pipeline execution
setState(PipelineStates.validating());
setState(PipelineStates.submitting());

// Success or error
setState(PipelineStates.success(data));
setState(PipelineStates.error(error));

// Check if loading
const isLoading = isPipelineLoading(state);
```

## React Hook Form Integration

### Custom Resolver
```typescript
import { createFormResolver } from '@/utils/formPipeline';
import { useForm } from 'react-hook-form';

const resolver = createFormResolver(validateLoginForm);

const { register, handleSubmit, formState: { errors } } = useForm({
  resolver
});
```

### Field Validator
```typescript
import { createFieldValidator } from '@/utils/formPipeline';

const emailValidator = createFieldValidator(validateEmail);

<Form.Item name="email">
  <Input {...register('email', { validate: emailValidator })} />
</Form.Item>
```

## Pattern Matching

### Match on Pipeline State
```typescript
import { match } from 'ts-pattern';

const buttonText = match(pipelineState)
  .with({ status: 'idle' }, () => 'Submit')
  .with({ status: 'validating' }, () => 'Validating...')
  .with({ status: 'submitting' }, () => 'Submitting...')
  .with({ status: 'success' }, () => 'Success!')
  .with({ status: 'error' }, () => 'Try Again')
  .exhaustive();
```

### Match on Result
```typescript
result.match(
  (data) => {
    // Success case
    console.log('Data:', data);
  },
  (error) => {
    // Error case
    console.error('Error:', error);
  }
);
```

## Error Formatting

```typescript
import { formatFormValidationError, formatPipelineError } from '@/utils/formValidation';

// Format single validation error
const message = formatFormValidationError(error);

// Format pipeline error
const message = formatPipelineError(pipelineError);
```

## Complete Example

```typescript
import { createFormPipeline, PipelineStates } from '@/utils/formPipeline';
import { validateEmail, validatePhone, validateAllOrCollectErrors } from '@/utils/formValidation';

interface ContactFormData {
  email: string;
  phone: string;
}

// 1. Define validation
const validateContactForm = (data: ContactFormData) => {
  return validateAllOrCollectErrors({
    email: validateEmail(data.email),
    phone: validatePhone(data.phone)
  });
};

// 2. Define transformation
const transformToDTO = (validated: ValidatedData) => {
  return ok({
    email: validated.email,
    phone: validated.phone
  });
};

// 3. Define submission
const submitContact = async (dto: ContactDTO) => {
  const response = await api.createContact(dto);
  return ok(response);
};

// 4. Create pipeline
const contactPipeline = createFormPipeline({
  validate: validateContactForm,
  transform: transformToDTO,
  submit: submitContact
});

// 5. Use in component
const [state, setState] = useState(PipelineStates.idle());

const onSubmit = async (formData: ContactFormData) => {
  const result = await contactPipeline(formData);
  
  result.match(
    (response) => setState(PipelineStates.success(response)),
    (error) => setState(PipelineStates.error(error))
  );
};
```

## Testing

### Test Validators
```typescript
import { validateEmail } from '@/utils/formValidation';

describe('validateEmail', () => {
  it('accepts valid email', () => {
    const result = validateEmail('user@example.com');
    expect(result.isOk()).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = validateEmail('invalid');
    expect(result.isErr()).toBe(true);
  });
});
```

### Test Pipeline
```typescript
import { createFormPipeline } from '@/utils/formPipeline';

describe('contactPipeline', () => {
  it('validates and submits form', async () => {
    const result = await contactPipeline({
      email: 'user@example.com',
      phone: '+1-234-567-8900'
    });
    
    expect(result.isOk()).toBe(true);
  });
});
```

## Tips

1. **Always use branded types** - prevents mixing validated/unvalidated data
2. **Fail fast with validateAll** - stops at first error
3. **Collect all errors** - use validateAllOrCollectErrors for forms
4. **Pattern match exhaustively** - ensures all cases handled
5. **Compose sanitizers** - build complex sanitization pipelines
6. **Test pure functions** - easy to test, deterministic behavior

## See Also

- Full Documentation: `frontend/docs/PHASE_4_IMPLEMENTATION.md`
- Implementation: `frontend/src/utils/formValidation.ts`
- Pipeline: `frontend/src/utils/formPipeline.ts`
- Example: `frontend/src/pages/LoginPage.fp.tsx`
