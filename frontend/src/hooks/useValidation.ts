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
  /** Function to set value without validation */
  setValue: (newValue: T | undefined) => void;
}

/**
 * Custom hook for managing validation with Result types
 *
 * Provides synchronous validation using railway-oriented programming patterns.
 * Validates values and returns Result<T, E> for type-safe error handling.
 *
 * @param initialValue - Initial value to validate
 * @param validators - Array of validation functions (railway pattern)
 * @param options - Configuration options
 * @returns ValidationState containing validation result and control functions
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
  const validateValue = useCallback((value: T | undefined): ValidationResult<T, E> => {
    // Handle undefined/null as a validation error with typed error
    if (value === undefined || value === null) {
      // Use provided requiredError or requiredErrorFactory for type safety
      const undefinedError = requiredError ?? 
        (requiredErrorFactory ? requiredErrorFactory() : 'Value is required' as unknown as E);
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
    }

    if (errors.length > 0) {
      const combinedError = errorCombiner ? errorCombiner(errors) : errors[0];
      return {
        isValid: false,
        value: null,
        error: combinedError ?? null, // Handle case where errorCombiner returns undefined
        errors,
      };
    }

    return {
      isValid: true,
      value: currentValue,
      error: null,
      errors: [],
    };
  }, [memoizedValidators, errorCombiner, shortCircuit, requiredError, requiredErrorFactory]);

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

  // Validation function exposed to consumers
  const validate = useCallback((newValue: T | undefined): ValidationResult<T, E> => {
    setValidating(true);
    try {
      const validationResult = validateValue(newValue);
      setResult(validationResult);
      setValueState(newValue);
      return validationResult;
    } finally {
      setValidating(false);
    }
  }, [validateValue]);

  // Set value without validation
  const setValue = useCallback((newValue: T | undefined) => {
    setValueState(newValue);
    if (validateOnChange) {
      const validationResult = validateValue(newValue);
      setResult(validationResult);
    }
  }, [validateOnChange, validateValue]);

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
 * Helper hook for simple boolean validation state
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
  return useMemo(() => ({
    isValid: validationState.result.isValid,
    isInvalid: !validationState.result.isValid && validationState.result.errors.length > 0,
    error: validationState.result.error,
    errors: validationState.result.errors,
    isValidating: validationState.validating,
  }), [validationState.result, validationState.validating]);
}
