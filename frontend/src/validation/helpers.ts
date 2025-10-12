import { err, errAsync, ok, okAsync } from 'neverthrow';
import type { AsyncResult, Result } from '../types/fp';
import { createValidationError } from '../types/errors';
import type { ValidationError } from '../types/errors';
import type { ZodSchema } from 'zod';

export const validateAndDecode = <T>(schema: ZodSchema<T>, data: unknown): Result<T, ValidationError> => {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    return err(
      createValidationError('Validation failed', {
        issues: parsed.error.issues,
      }),
    );
  }
  return ok(parsed.data);
};

export const liftResult = <T, E>(result: Result<T, E>): AsyncResult<T, E> =>
  result.match(
    value => okAsync(value),
    error => errAsync(error),
  );
