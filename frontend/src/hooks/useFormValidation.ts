import { useMemo, useCallback, useReducer, useEffect, useRef } from 'react';
import type { Result } from '../types/fp';
import type { FormValidationError } from '../utils/formValidation';
import type { ValidationFn } from './useValidation';

/**
 * Represents the state of a form field with its validation
 */
export interface FormField<T> {
  /** Current value of the field */
  value: T | undefined;
  /** Whether the field has been touched (focused) */
  touched: boolean;
  /** Whether the field has been modified */
  dirty: boolean;
  /** Validation result */
  validation: {
    isValid: boolean;
    error: FormValidationError | null;
    errors: FormValidationError[];
  };
}

/**
 * Complete form validation state
 */
export interface FormValidationState<T extends Record<string, unknown>> {
  /** Form field states */
  fields: { [K in keyof T]: FormField<T[K]> };
  /** Overall form validation state */
  form: {
    isValid: boolean;
    isDirty: boolean;
    errors: Record<keyof T, FormValidationError[]>;
    hasErrors: boolean;
  };
  /** Actions to manipulate form state */
  actions: {
    /** Set value for a specific field */
    setFieldValue: <K extends keyof T>(field: K, value: T[K]) => void;
    /** Mark a field as touched */
    setFieldTouched: <K extends keyof T>(field: K, touched?: boolean) => void;
    /** Validate a specific field */
    validateField: <K extends keyof T>(
      field: K
    ) => {
      isValid: boolean;
      value: T[K] | null | undefined;
      error: FormValidationError | null;
      errors: FormValidationError[];
    };
    /** Validate all fields */
    validateForm: () => {
      isValid: boolean;
      values: Partial<T>;
      errors: Record<keyof T, FormValidationError[]>;
    };
    /** Reset form to initial state */
    reset: () => void;
    /** Set values for multiple fields at once */
    setValues: (values: Partial<T>) => void;
  };
}

/**
 * Configuration for form validation
 */
export interface FormValidationConfig<T extends Record<string, unknown>> {
  /** Initial values for form fields */
  initialValues: Partial<T>;
  /** Validation functions for each field */
  validators: {
    [K in keyof T]?: ValidationFn<T[K], FormValidationError>[];
  };
  /** Validation mode */
  mode?: 'onChange' | 'onBlur' | 'onSubmit';
  /** Whether to validate on mount */
  validateOnMount?: boolean;
}

// Form state stored in reducer
interface FormState<T extends Record<string, unknown>> {
  fields: {
    [K in keyof T]: {
      value: T[K] | undefined;
      touched: boolean;
      dirty: boolean;
      errors: FormValidationError[];
    };
  };
  initialValues: Partial<T>;
}

// Actions for the reducer
type FormAction<T extends Record<string, unknown>> =
  | { type: 'SET_FIELD_VALUE'; field: keyof T; value: T[keyof T] }
  | { type: 'SET_FIELD_TOUCHED'; field: keyof T; touched: boolean }
  | { type: 'SET_FIELD_ERRORS'; field: keyof T; errors: FormValidationError[] }
  | { type: 'SET_VALUES'; values: Partial<T> }
  | { type: 'RESET' };

function createInitialState<T extends Record<string, unknown>>(
  initialValues: Partial<T>
): FormState<T> {
  const fields = {} as FormState<T>['fields'];

  for (const key of Object.keys(initialValues) as (keyof T)[]) {
    fields[key] = {
      value: initialValues[key],
      touched: false,
      dirty: false,
      errors: [],
    };
  }

  return { fields, initialValues };
}

function formReducer<T extends Record<string, unknown>>(
  state: FormState<T>,
  action: FormAction<T>
): FormState<T> {
  switch (action.type) {
    case 'SET_FIELD_VALUE': {
      const currentField = state.fields[action.field] || {
        value: state.initialValues[action.field],
        touched: false,
        dirty: false,
        errors: [],
      };
      const initialValue = state.initialValues[action.field];
      const isDirty = action.value !== initialValue;

      return {
        ...state,
        fields: {
          ...state.fields,
          [action.field]: {
            ...currentField,
            value: action.value,
            dirty: isDirty,
          },
        },
      };
    }

    case 'SET_FIELD_TOUCHED':
      return {
        ...state,
        fields: {
          ...state.fields,
          [action.field]: {
            ...(state.fields[action.field] || {
              value: state.initialValues[action.field],
              touched: false,
              dirty: false,
              errors: [],
            }),
            touched: action.touched,
          },
        },
      };

    case 'SET_FIELD_ERRORS':
      return {
        ...state,
        fields: {
          ...state.fields,
          [action.field]: {
            ...(state.fields[action.field] || {
              value: state.initialValues[action.field],
              touched: false,
              dirty: false,
            }),
            errors: action.errors,
          },
        },
      };

    case 'SET_VALUES': {
      const newFields = { ...state.fields };

      for (const [key, value] of Object.entries(action.values) as [keyof T, T[keyof T]][]) {
        const initialValue = state.initialValues[key];
        const isDirty = value !== initialValue;

        newFields[key] = {
          ...newFields[key],
          value,
          dirty: isDirty,
        };
      }

      return {
        ...state,
        fields: newFields,
      };
    }

    case 'RESET':
      return createInitialState(state.initialValues);

    default:
      return state;
  }
}

/**
 * Railway-oriented form validation hook.
 *
 * Provides comprehensive form validation using Result-based validators. The hook tracks field
 * dirtiness, touch state, and aggregates validation errors so submit handlers can reason about
 * both per-field and global validity.
 *
 * @template T Shape of the form values
 * @param config Form validation configuration object
 * @returns Form validation state and action helpers
 * @example
 * ```typescript
 * const form = useFormValidation<LoginFormValues>({
 *   initialValues: { email: '', password: '' },
 *   validators: {
 *     email: [validateEmail],
 *     password: [validatePassword],
 *   },
 *   mode: 'onSubmit',
 * });
 *
 * const onSubmit = () => {
 *   const validation = form.actions.validateForm();
 *   if (validation.isValid) {
 *     authService.login(validation.values as LoginFormValues);
 *   }
 * };
 * ```
 */
export function useFormValidation<T extends Record<string, unknown>>(
  config: FormValidationConfig<T>
): FormValidationState<T> {
  const { initialValues, validators, mode = 'onChange', validateOnMount = false } = config;

  // Use reducer to manage form state
  const [state, dispatch] = useReducer(formReducer<T>, initialValues, createInitialState);

  // Capture initial validateOnMount value to avoid re-running effect
  const initialValidateOnMount = useRef(validateOnMount);

  // Validation function for a field
  const validateFieldValue = useCallback(
    <K extends keyof T>(
      field: K,
      value: T[K] | undefined
    ): {
      isValid: boolean;
      value: T[K] | null | undefined;
      error: FormValidationError | null;
      errors: FormValidationError[];
    } => {
      const fieldValidators = validators[field] || [];
      const errors: FormValidationError[] = [];
      let currentValue: T[K] | undefined = value;

      // Only enforce REQUIRED_FIELD error if validators exist
      if ((value === undefined || value === null) && fieldValidators.length > 0) {
        return {
          isValid: false,
          value: null,
          error: {
            type: 'REQUIRED_FIELD',
            fieldName: String(field),
          } as FormValidationError,
          errors: [
            {
              type: 'REQUIRED_FIELD',
              fieldName: String(field),
            } as FormValidationError,
          ],
        };
      }

      // If no validators and value is null/undefined, consider it valid (optional field)
      if ((value === undefined || value === null) && fieldValidators.length === 0) {
        return {
          isValid: true,
          value: null,
          error: null,
          errors: [],
        };
      }

      // Run all validators in sequence (only if value is defined)
      if (currentValue !== undefined && currentValue !== null) {
        for (const validator of fieldValidators) {
          const result = validator(currentValue);
          if (result.isErr()) {
            errors.push(result.error);
          } else {
            currentValue = result.value;
          }
        }
      }

      const isValid = errors.length === 0;
      return {
        isValid,
        value: isValid ? currentValue : null,
        error: errors[0] || null,
        errors,
      };
    },
    [validators]
  );

  // Validate field and update errors
  const validateAndUpdateField = useCallback(
    <K extends keyof T>(field: K) => {
      const fieldState = state.fields[field];
      const result = validateFieldValue(field, fieldState?.value);
      dispatch({ type: 'SET_FIELD_ERRORS', field, errors: result.errors });
      return result;
    },
    [state.fields, validateFieldValue]
  );

  // Validate on mount if enabled (run only once)
  useEffect(() => {
    if (initialValidateOnMount.current) {
      const keys = Object.keys(state.fields) as (keyof T)[];
      for (const key of keys) {
        validateAndUpdateField(key);
      }
    }
  }, []); // Empty dependency array - run only once on mount

  // Field states with validation info
  const fieldStates = useMemo(() => {
    const states: { [K in keyof T]: FormField<T[K]> } = {} as { [K in keyof T]: FormField<T[K]> };

    for (const key of Object.keys(state.fields) as (keyof T)[]) {
      const field = state.fields[key];
      const hasErrors = field.errors.length > 0;

      states[key] = {
        value: field.value,
        touched: field.touched,
        dirty: field.dirty,
        validation: {
          isValid: !hasErrors,
          error: field.errors[0] || null,
          errors: field.errors,
        },
      };
    }

    return states;
  }, [state.fields]);

  // Overall form state
  const formState = useMemo(() => {
    const allErrors: Record<keyof T, FormValidationError[]> = {} as Record<
      keyof T,
      FormValidationError[]
    >;
    let isValid = true;
    let isDirty = false;

    for (const key of Object.keys(fieldStates) as (keyof T)[]) {
      const field = fieldStates[key];
      allErrors[key] = field.validation.errors;

      if (!field.validation.isValid) {
        isValid = false;
      }

      if (field.dirty) {
        isDirty = true;
      }
    }

    return {
      isValid,
      isDirty,
      errors: allErrors,
      hasErrors: !isValid,
    };
  }, [fieldStates]);

  // Actions
  const actions = useMemo(
    () => ({
      setFieldValue: <K extends keyof T>(field: K, value: T[K]) => {
        dispatch({ type: 'SET_FIELD_VALUE', field, value });

        // Validate on change if mode is onChange
        if (mode === 'onChange') {
          queueMicrotask(() => {
            const result = validateFieldValue(field, value);
            dispatch({ type: 'SET_FIELD_ERRORS', field, errors: result.errors });
          });
        }
      },

      setFieldTouched: <K extends keyof T>(field: K, touched = true) => {
        dispatch({ type: 'SET_FIELD_TOUCHED', field, touched });

        // Validate on blur if mode is onBlur and field is being touched
        if (mode === 'onBlur' && touched) {
          queueMicrotask(() => {
            validateAndUpdateField(field);
          });
        }
      },

      validateField: validateAndUpdateField,

      validateForm: () => {
        const values: Partial<T> = {};
        const errors: Record<keyof T, FormValidationError[]> = {} as Record<
          keyof T,
          FormValidationError[]
        >;

        let isValid = true;

        for (const key of Object.keys(state.fields) as (keyof T)[]) {
          const field = state.fields[key];
          const result = validateFieldValue(key, field.value);

          if (result.isValid && result.value !== null) {
            values[key] = result.value;
          } else {
            isValid = false;
          }

          errors[key] = result.errors;
          dispatch({ type: 'SET_FIELD_ERRORS', field: key, errors: result.errors });
        }

        return { isValid, values, errors };
      },

      reset: () => {
        dispatch({ type: 'RESET' });
      },

      setValues: (newValues: Partial<T>) => {
        dispatch({ type: 'SET_VALUES', values: newValues });

        // Validate changed fields if mode is onChange
        if (mode === 'onChange') {
          queueMicrotask(() => {
            for (const [key, value] of Object.entries(newValues) as [keyof T, T[keyof T]][]) {
              const result = validateFieldValue(key, value);
              dispatch({ type: 'SET_FIELD_ERRORS', field: key, errors: result.errors });
            }
          });
        }
      },
    }),
    [mode, state.fields, validateFieldValue, validateAndUpdateField]
  );

  return {
    fields: fieldStates,
    form: formState,
    actions,
  };
}

/**
 * Helper hook for simple form validation status
 */
export function useFormValidationStatus<T extends Record<string, unknown>>(
  formState: FormValidationState<T>
) {
  // Memoize errorsCount separately to avoid expensive reduce on every render
  const errorsCount = useMemo(
    () =>
      Object.values(formState.form.errors).reduce(
        (count, fieldErrors) => count + fieldErrors.length,
        0
      ),
    [formState.form.errors]
  );

  return useMemo(
    () => ({
      isValid: formState.form.isValid,
      isInvalid: formState.form.hasErrors,
      isDirty: formState.form.isDirty,
      errorsCount,
      fieldErrors: formState.form.errors,
      hasFieldErrors: (field: keyof T) => (formState.form.errors[field] ?? []).length > 0,
      getFieldError: (field: keyof T) => (formState.form.errors[field] ?? [])[0] || null,
      canSubmit: formState.form.isValid && formState.form.isDirty,
    }),
    [
      formState.form.isValid,
      formState.form.hasErrors,
      formState.form.isDirty,
      errorsCount,
      formState.form.errors,
    ]
  );
}
