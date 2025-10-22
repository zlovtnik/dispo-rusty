import { err, errAsync, ok, okAsync } from 'neverthrow';
import type { AsyncResult, Result } from '../types/fp';
import { createValidationError } from '../types/errors';
import type { TypedValidationError } from '../types/errors';
import type { ZodType } from 'zod';

/**
 * Validates data against a Zod schema and returns a Result type
 * @param schema - The Zod schema to validate against
 * @param data - The data to validate
 * @returns A Result containing the validated data or a validation error
 */
export const validateAndDecode = <T>(
  schema: ZodType<T>,
  data: unknown
): Result<T, TypedValidationError> => {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    return err(
      createValidationError('Validation failed', {
        issues: parsed.error.issues,
      })
    );
  }
  return ok(parsed.data);
};

/**
 * Lifts a synchronous Result into an AsyncResult
 * @param result - The synchronous Result to lift
 * @returns An AsyncResult with the same success/error state
 */
export const liftResult = <T, E>(result: Result<T, E>): AsyncResult<T, E> =>
  result.match(
    value => okAsync(value),
    error => errAsync(error)
  );
