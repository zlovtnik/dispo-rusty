import { err, ok } from 'neverthrow';
import type { Result, Option } from '../types/fp';
import { fromNullable, isSome, none, some } from '../types/fp';
import type { AppError } from '../types/errors';
import { createValidationError } from '../types/errors';
import { Gender } from '../types/person';

const normalizeGenderValue = (value: unknown): Gender | null => {
  if (value === Gender.male || value === Gender.female || value === Gender.other) {
    return value;
  }

  if (typeof value === 'boolean') {
    return value ? Gender.male : Gender.female;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'male' || normalized === 'm') {
      return Gender.male;
    }
    if (normalized === 'female' || normalized === 'f') {
      return Gender.female;
    }
    if (
      normalized === 'other' ||
      normalized === 'non-binary' ||
      normalized === 'nonbinary' ||
      normalized === 'nb'
    ) {
      return Gender.other;
    }
  }

  return null;
};

const createGenderError = (message: string, details?: Record<string, unknown>): AppError =>
  createValidationError(message, details, { code: 'INVALID_GENDER_VALUE' });

const ensureGender = (value: unknown, context: string): Result<Gender, AppError> => {
  const normalized = normalizeGenderValue(value);

  if (!normalized) {
    return err(createGenderError(`Invalid ${context} value`, { value }));
  }

  return ok(normalized);
};

export const isGender = (value: unknown): value is Gender => normalizeGenderValue(value) !== null;

export const parseGender = (value: unknown): Result<Gender, AppError> =>
  ensureGender(value, 'gender');

export const parseOptionalGender = (value: unknown): Result<Option<Gender>, AppError> => {
  const option = fromNullable(value);

  if (!isSome(option)) {
    return ok(none());
  }

  return ensureGender(option.value, 'gender').map(some);
};

// Direct conversion from Gender enum to boolean (more efficient for existing Gender values)
export const genderEnumToBoolean = (gender: Gender): Result<boolean, AppError> => {
  if (gender === Gender.other) {
    return err(createGenderError('Cannot convert Gender.other to boolean', { value: gender }));
  }
  return ok(gender === Gender.male);
};

export const genderToBoolean = (value: string): Result<boolean, AppError> =>
  ensureGender(value, 'gender').andThen(genderEnumToBoolean);

export const booleanToGender = (value: boolean): Result<Gender, AppError> => {
  return ok(value ? Gender.male : Gender.female);
};

export interface GenderConversion {
  readonly toBoolean: (value: string) => Result<boolean, AppError>;
  readonly fromBoolean: (value: boolean) => Result<Gender, AppError>;
  readonly normalize: (value: unknown) => Result<Gender, AppError>;
  readonly normalizeOptional: (value: unknown) => Result<Option<Gender>, AppError>;
  readonly isGender: (value: unknown) => value is Gender;
}

export const genderConversion: GenderConversion = {
  toBoolean: genderToBoolean,
  fromBoolean: booleanToGender,
  normalize: parseGender,
  normalizeOptional: parseOptionalGender,
  isGender,
} as const;
