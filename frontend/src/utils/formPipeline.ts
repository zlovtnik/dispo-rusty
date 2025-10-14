/**
 * Form Processing Pipeline with Railway-Oriented Programming
 * 
 * Implements form submission pipeline: validate → sanitize → transform → submit
 * Uses Result types for type-safe error handling throughout the pipeline.
 * 
 * @module formPipeline
 */

import { Result, ok, err } from 'neverthrow';
import type { FormValidationError } from './formValidation';

/**
 * Pipeline error types
 * Generic E allows different validation error types
 */
export type PipelineError<E = FormValidationError> =
  | { type: 'VALIDATION_ERROR'; errors: E | Record<string, E> }
  | { type: 'SANITIZATION_ERROR'; reason: string }
  | { type: 'TRANSFORMATION_ERROR'; reason: string }
  | { type: 'SUBMISSION_ERROR'; statusCode?: number; message: string };

/**
 * Form validator type with railway pattern
 * Generic E allows any error type (FormValidationError, CredentialValidationError, etc.)
 */
export type FormValidator<TForm, TValidated, E = FormValidationError> = (
  form: TForm
) => Result<TValidated, E | Record<string, E>>;

/**
 * Sanitizer function type
 * 
 * @warning Sanitizers may mutate field values (e.g., converting "" to undefined, deleting nullish values).
 * The returned type T should be compatible with these transformations. For example, fields that may
 * be removed should be optional in the type definition.
 */
export type Sanitizer<T, E = FormValidationError> = (data: T) => Result<T, PipelineError<E>>;

/**
 * Transformer function type (DTO conversion)
 */
export type Transformer<TInput, TOutput, E = FormValidationError> = (input: TInput) => Result<TOutput, PipelineError<E>>;

/**
 * Submission function type
 */
export type Submitter<TData, TResponse, E = FormValidationError> = (data: TData) => Promise<Result<TResponse, PipelineError<E>>>;

/**
 * Complete form pipeline configuration
 */
export interface FormPipelineConfig<TForm, TValidated, TDTO, TResponse, E = FormValidationError> {
  validate: FormValidator<TForm, TValidated, E>;
  sanitize?: Sanitizer<TValidated, E>;
  transform: Transformer<TValidated, TDTO, E>;
  submit: Submitter<TDTO, TResponse, E>;
}

/**
 * Pipeline execution result states (discriminated union)
 */
export type PipelineState<T, E = FormValidationError> =
  | { status: 'idle' }
  | { status: 'validating' }
  | { status: 'sanitizing' }
  | { status: 'transforming' }
  | { status: 'submitting' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: PipelineError<E> };

/**
 * Create a form submission pipeline with railway-oriented programming
 * 
 * @param config - Pipeline configuration with validate, sanitize, transform, submit steps
 * @returns Function that executes the complete pipeline
 * 
 * @example
 * ```typescript
 * const pipeline = createFormPipeline({
 *   validate: validateLoginForm,
 *   sanitize: sanitizeLoginData,
 *   transform: transformToLoginDTO,
 *   submit: submitLogin
 * });
 * 
 * const result = await pipeline(formData);
 * result.match(
 *   (response) => console.log('Success:', response),
 *   (error) => console.log('Error:', formatPipelineError(error))
 * );
 * ```
 */
export const createFormPipeline = <TForm, TValidated, TDTO, TResponse, E = FormValidationError>(
  config: FormPipelineConfig<TForm, TValidated, TDTO, TResponse, E>
) => {
  return async (formData: TForm): Promise<Result<TResponse, PipelineError<E>>> => {
    // Step 1: Validate
    const validationResult = config.validate(formData);
    if (validationResult.isErr()) {
      return err({
        type: 'VALIDATION_ERROR',
        errors: validationResult.error,
      });
    }

    const validated = validationResult.value;

    // Step 2: Sanitize (optional)
    let sanitized = validated;
    if (config.sanitize) {
      const sanitizeResult = config.sanitize(validated);
      if (sanitizeResult.isErr()) {
        return err(sanitizeResult.error);
      }
      sanitized = sanitizeResult.value;
    }

    // Step 3: Transform to DTO
    const transformResult = config.transform(sanitized);
    if (transformResult.isErr()) {
      return err(transformResult.error);
    }

    const dto = transformResult.value;

    // Step 4: Submit
    const submitResult = await config.submit(dto);
    if (submitResult.isErr()) {
      return err(submitResult.error);
    }

    return ok(submitResult.value);
  };
};

/**
 * Default sanitization functions
 * 
 * @warning These sanitizers mutate field values and may remove or transform fields.
 * Ensure your type definitions account for these changes (e.g., optional fields).
 */
export const Sanitizers = {
  /**
   * Trim whitespace from all string fields
   * 
   * @warning Only modifies string fields. Safe for most types but ensure trimmed values
   * are acceptable for your validation logic (e.g., minimum length checks).
   */
  trimStrings: <T extends Record<string, unknown>>(data: T): Result<T, PipelineError> => {
    try {
      const sanitized = { ...data };
      
      for (const [key, value] of Object.entries(sanitized)) {
        if (typeof value === 'string') {
          // Safe mutation - trimming preserves string type
          sanitized[key as keyof T] = value.trim() as T[keyof T];
        }
      }
      
      return ok(sanitized);
    } catch (error) {
      return err({
        type: 'SANITIZATION_ERROR',
        reason: error instanceof Error ? error.message : 'Unknown sanitization error',
      });
    }
  },

  /**
   * Remove null and undefined values
   * 
   * @warning Deletes fields with null/undefined values. Ensure your type definition
   * marks these fields as optional (e.g., field?: string) or use Partial<T> for the result.
   * This may violate type contracts if fields are non-optional.
   */
  removeNullish: <T extends Record<string, unknown>>(data: T): Result<T, PipelineError> => {
    try {
      const sanitized = { ...data };
      
      for (const [key, value] of Object.entries(sanitized)) {
        if (value === null || value === undefined) {
          delete sanitized[key as keyof T];
        }
      }
      
      // Type assertion: caller must ensure deleted fields are optional in T
      return ok(sanitized);
    } catch (error) {
      return err({
        type: 'SANITIZATION_ERROR',
        reason: error instanceof Error ? error.message : 'Unknown sanitization error',
      });
    }
  },

  /**
   * Convert empty strings to undefined
   * 
   * @warning Mutates string fields from "" to undefined. Ensure your type definition
   * allows undefined for string fields (e.g., field?: string | undefined).
   * This may violate type contracts if fields are non-nullable strings.
   */
  emptyStringsToUndefined: <T extends Record<string, unknown>>(data: T): Result<T, PipelineError> => {
    try {
      const sanitized = { ...data };
      
      for (const [key, value] of Object.entries(sanitized)) {
        if (value === '') {
          // Type assertion: caller must ensure field accepts undefined
          sanitized[key as keyof T] = undefined as T[keyof T];
        }
      }
      
      return ok(sanitized);
    } catch (error) {
      return err({
        type: 'SANITIZATION_ERROR',
        reason: error instanceof Error ? error.message : 'Unknown sanitization error',
      });
    }
  },

  /**
   * Compose multiple sanitizers
   */
  compose: <T>(...sanitizers: Sanitizer<T>[]): Sanitizer<T> => {
    return (data: T) => {
      let result: Result<T, PipelineError> = ok(data);
      
      for (const sanitizer of sanitizers) {
        if (result.isErr()) {
          return result;
        }
        result = sanitizer(result.value);
      }
      
      return result;
    };
  },
};

/**
 * Helper to create field-level validators for React Hook Form
 * 
 * @param validator - Validation function
 * @returns Validator compatible with React Hook Form
 * 
 * @example
 * ```typescript
 * const emailValidator = createFieldValidator(validateEmail);
 * 
 * <input {...register('email', { validate: emailValidator })} />
 * ```
 */
export const createFieldValidator = <T>(
  validator: (value: string | number) => Result<T, FormValidationError>
) => {
  return (value: string | number): true | string => {
    const result = validator(value);
    return result.match(
      () => true,
      (error) => {
        // Import and use formatFormValidationError
        switch (error.type) {
          case 'INVALID_EMAIL':
            return `Invalid email: ${error.reason}`;
          case 'INVALID_PHONE':
            return `Invalid phone: ${error.reason}`;
          case 'INVALID_PASSWORD':
            return error.reason;
          case 'INVALID_AGE':
            return `Invalid age: ${error.reason}`;
          case 'INVALID_ZIP_CODE':
            return `Invalid ZIP code: ${error.reason}`;
          case 'REQUIRED_FIELD':
            return `${error.fieldName} is required`;
          default:
            return 'Validation failed';
        }
      }
    );
  };
};

/**
 * Create custom resolver for React Hook Form using Result types
 * 
 * @param validator - Form validator function
 * @returns Resolver compatible with React Hook Form
 * 
 * @example
 * ```typescript
 * const resolver = createFormResolver(validateLoginForm);
 * 
 * const { register, handleSubmit } = useForm({
 *   resolver
 * });
 * ```
 */
export const createFormResolver = <TForm extends Record<string, unknown>, TValidated>(
  validator: FormValidator<TForm, TValidated>
) => {
  return async (values: TForm) => {
    const result = validator(values);

    if (result.isOk()) {
      return {
        values: result.value as unknown as TForm,
        errors: {},
      };
    }

    // Handle single validation error
    if ('type' in result.error) {
      return {
        values: {},
        errors: {
          root: {
            type: 'validation',
            message: formatSingleValidationError(result.error as FormValidationError),
          },
        },
      };
    }

    // Handle multiple field errors
    const formattedErrors: Record<string, { type: string; message: string }> = {};
    for (const [field, error] of Object.entries(result.error)) {
      formattedErrors[field] = {
        type: 'validation',
        message: formatSingleValidationError(error as FormValidationError),
      };
    }

    return {
      values: {},
      errors: formattedErrors,
    };
  };
};

/**
 * Format single validation error helper
 */
const formatSingleValidationError = (error: FormValidationError): string => {
  switch (error.type) {
    case 'INVALID_EMAIL':
      return `Invalid email: ${error.reason}`;
    case 'INVALID_PHONE':
      return `Invalid phone: ${error.reason}`;
    case 'INVALID_PASSWORD':
      return error.reason;
    case 'INVALID_AGE':
      return `Invalid age: ${error.reason}`;
    case 'INVALID_ZIP_CODE':
      return `Invalid ZIP code: ${error.reason}`;
    case 'REQUIRED_FIELD':
      return `${error.fieldName} is required`;
    case 'STRING_TOO_SHORT':
      return `${error.fieldName} must be at least ${error.min} characters`;
    case 'STRING_TOO_LONG':
      return `${error.fieldName} must be at most ${error.max} characters`;
    case 'PATTERN_MISMATCH':
      return `${error.fieldName} format is invalid`;
    case 'CUSTOM_VALIDATION':
      return error.message;
  }
};

/**
 * Format pipeline error to user-friendly message
 * Supports any validation error type with optional formatter
 */
export const formatPipelineError = <E = FormValidationError>(
  error: PipelineError<E>,
  errorFormatter?: (err: E) => string
): string => {
  switch (error.type) {
    case 'VALIDATION_ERROR':
      if (typeof error.errors === 'object' && error.errors !== null && 'type' in error.errors) {
        // Single validation error
        return errorFormatter 
          ? errorFormatter(error.errors as E)
          : formatSingleValidationError(error.errors as unknown as FormValidationError);
      }
      
      // Multiple field errors - format each field error individually
      if (typeof error.errors === 'object' && error.errors !== null) {
        const fieldErrors: string[] = [];
        
        for (const [fieldName, fieldError] of Object.entries(error.errors)) {
          const formattedError = errorFormatter
            ? errorFormatter(fieldError as E)
            : formatSingleValidationError(fieldError as FormValidationError);
          
          fieldErrors.push(`${fieldName}: ${formattedError}`);
        }
        
        if (fieldErrors.length > 0) {
          return `Form validation failed: ${fieldErrors.join(', ')}`;
        }
      }
      
      return 'Form validation failed. Please check your inputs.';
    case 'SANITIZATION_ERROR':
      return `Data sanitization error: ${error.reason}`;
    case 'TRANSFORMATION_ERROR':
      return `Data transformation error: ${error.reason}`;
    case 'SUBMISSION_ERROR':
      return error.statusCode 
        ? `Submission failed (${error.statusCode}): ${error.message}`
        : `Submission failed: ${error.message}`;
  }
};

/**
 * Pipeline state machine helpers
 */
export const PipelineStates = {
  idle: <T, E = FormValidationError>(): PipelineState<T, E> => ({ status: 'idle' }),
  validating: <T, E = FormValidationError>(): PipelineState<T, E> => ({ status: 'validating' }),
  sanitizing: <T, E = FormValidationError>(): PipelineState<T, E> => ({ status: 'sanitizing' }),
  transforming: <T, E = FormValidationError>(): PipelineState<T, E> => ({ status: 'transforming' }),
  submitting: <T, E = FormValidationError>(): PipelineState<T, E> => ({ status: 'submitting' }),
  success: <T, E = FormValidationError>(data: T): PipelineState<T, E> => ({ status: 'success', data }),
  error: <T, E = FormValidationError>(error: PipelineError<E>): PipelineState<T, E> => ({ status: 'error', error }),
};

/**
 * Check if pipeline is in loading state
 */
export const isPipelineLoading = <T, E = FormValidationError>(state: PipelineState<T, E>): boolean => {
  return state.status === 'validating' ||
         state.status === 'sanitizing' ||
         state.status === 'transforming' ||
         state.status === 'submitting';
};
