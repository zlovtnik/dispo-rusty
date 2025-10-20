import { useMemo, useCallback, useState } from 'react';
import type { Result } from '../types/fp';

/**
 * Validation function type that returns a Result
 */
export type ValidationFn<T, E> = (value: T) => Result<T, E>;

/**
 * Represents the result of a validation operation
 */
export interface ValidationResult<T, E> {
  /** Whether the value is valid */
  isValid: boolean;
  /** The validated value if valid, null if invalid */
  value: T | null;
  /** The validation error if present */
  error: E | null;
  /** Array of all errors encountered */
  errors: E[];
}

/**
 * State for validation operations
 */
export interface ValidationState<T, E> {
  /** Current value being validated */
  value: T | undefined;
  /** Current validation result */
  result: ValidationResult<T, E>;
  /** Whether validation is currently running */
  validating: boolean;
  /** Function to validate a new value */
  validate: (newValue: T | undefined) => ValidationResult<T, E>;
  /** Function to reset validation state */
  reset: () => void;
  /** Function to set value conditionally triggers validation when validateOnChange is true */
  setValue: (newValue: T | undefined) => void;
}

/**
 * Custom hook for managing validation with Result types.
 *
 * Provides synchronous validation using railway-oriented programming patterns. Validates values
 * and returns `Result<T, E>` for type-safe error handling.
 *
 * @param initialValue Initial value to validate
 * @param validators Array of validation functions (railway pattern)
 * @param options Optional configuration flags
 * @returns Validation state containing validation result and control functions
 * @example
 * ```typescript
 * const emailValidation = useValidation<string, ValidationError>(
 *   '',
 *   [validateEmail],
 *   { validateOnMount: true }
 * );
 *
 * const onChange = (value: string) => {
 *   emailValidation.setValue(value);
 * };
 *
 * if (emailValidation.result.isValid) {
 *   console.log('Email ready', emailValidation.result.value);
 * }
 * ```
 */
export function useValidation<T, E = string>(
  initialValue?: T,
  validators: ValidationFn<T, E>[] = [],
  options: {
    /** Whether to validate immediately on mount */
    validateOnMount?: boolean;
    /** Whether to validate on every value change */
    validateOnChange?: boolean;
    /** Custom error combiner for multiple validation errors */
    errorCombiner?: (errors: E[]) => E;
    /** Whether to stop validation after first error (default: false) */
    shortCircuit?: boolean;
    /** Error to return when value is undefined/null (required for type safety) */
    requiredError?: E;
    /** Factory function to create error when value is undefined/null */
    requiredErrorFactory?: () => E;
  } = {}
): ValidationState<T, E> {
  const {
    validateOnMount = false,
    validateOnChange = true,
    errorCombiner,
    shortCircuit = false,
    requiredError,
    requiredErrorFactory,
  } = options;

  // Memoized validators array
  const memoizedValidators = useMemo(() => validators, [validators]);

  // Validation function that runs all validators in sequence (railway pattern)
  const validateValue = useCallback(
    (value: T | undefined): ValidationResult<T, E> => {
      // Handle undefined/null as a validation error with typed error
      if (value === undefined || value === null) {
        // Use provided requiredError or requiredErrorFactory for type safety
        const undefinedError =
          requiredError ??
          (requiredErrorFactory ? requiredErrorFactory() : ('Value is required' as unknown as E));
        return {
          isValid: false,
          value: null,
          error: undefinedError,
          errors: [undefinedError],
        };
      }

      const errors: E[] = [];
      let currentValue: T = value;

      // Run all validators in sequence
      for (const validator of memoizedValidators) {
        try {
          const result = validator(currentValue);
          if (result.isErr()) {
            errors.push(result.error);
            // Break early if shortCircuit is enabled
            if (shortCircuit) {
              break;
            }
          } else {
            // Update value if transformed by validator
            currentValue = result.value;
          }
        } catch (e) {
          // Convert thrown errors to validation errors
          errors.push(e as E);
          if (shortCircuit) {
            break;
          }
        }
      }

      if (errors.length > 0) {
        const combinedError = errorCombiner ? errorCombiner(errors) : errors[0];
        return {
          isValid: false,
          value: null,
          error: combinedError ?? errors[0]!, // Ensure error is always populated when validation fails
          errors,
        };
      }

      return {
        isValid: true,
        value: currentValue,
        error: null,
        errors: [],
      };
    },
    [memoizedValidators, errorCombiner, shortCircuit, requiredError, requiredErrorFactory]
  );

  // Initial validation result
  const initialResult = useMemo(() => {
    if (validateOnMount && initialValue !== undefined) {
      return validateValue(initialValue);
    }
    return {
      isValid: false,
      value: null,
      error: null,
      errors: [],
    };
  }, [initialValue, validateOnMount, validateValue]);

  // Current validation state
  const [result, setResult] = useState<ValidationResult<T, E>>(initialResult);
  const [value, setValueState] = useState<T | undefined>(initialValue);
  const [validating, setValidating] = useState(false);

  // Helper to select transformed value or fallback to original
  const selectValueFromResult = useCallback(
    (validationResult: ValidationResult<T, E>, originalValue: T | undefined): T | undefined => {
      return validationResult.isValid && validationResult.value !== null
        ? validationResult.value
        : originalValue;
    },
    []
  );

  // Validation function exposed to consumers
  const validate = useCallback(
    (newValue: T | undefined): ValidationResult<T, E> => {
      setValidating(true);
      try {
        const validationResult = validateValue(newValue);
        setResult(validationResult);
        setValueState(selectValueFromResult(validationResult, newValue));
        return validationResult;
      } finally {
        setValidating(false);
      }
    },
    [validateValue, selectValueFromResult]
  );

  // Set value conditionally triggers validation when validateOnChange is true
  // Clearing a field (undefined/null) will run validation so consumers know required-field errors may appear immediately
  const setValue = useCallback(
    (newValue: T | undefined) => {
      if (validateOnChange) {
        const validationResult = validateValue(newValue);
        setResult(validationResult);
        setValueState(selectValueFromResult(validationResult, newValue));
      } else {
        setValueState(newValue);
      }
    },
    [validateOnChange, validateValue, selectValueFromResult]
  );

  // Reset validation state
  const reset = useCallback(() => {
    setValueState(initialValue);
    setResult({
      isValid: false,
      value: null,
      error: null,
      errors: [],
    });
    setValidating(false);
  }, [initialValue]);

  return {
    value,
    result,
    validating,
    validate,
    reset,
    setValue,
  };
}

/**
 * Helper hook for deriving boolean validation flags from `useValidation` state.
 *
 * @param validationState Validation state returned by `useValidation`
 * @returns Boolean flags and errors to simplify UI rendering
 * @example
 * ```typescript
 * const validation = useValidation(...);
 * const status = useValidationStatus(validation);
 *
 * return status.isInvalid ? <Error>{status.error?.message}</Error> : null;
 * ```
 */
export function useValidationStatus<T, E>(
  validationState: ValidationState<T, E>
): {
  isValid: boolean;
  isInvalid: boolean;
  error: E | null;
  errors: E[];
  isValidating: boolean;
} {
  return useMemo(
    () => ({
      isValid: validationState.result.isValid,
      isInvalid: !validationState.result.isValid && validationState.result.errors.length > 0,
      error: validationState.result.error,
      errors: validationState.result.errors,
      isValidating: validationState.validating,
    }),
    [validationState.result, validationState.validating]
  );
}
