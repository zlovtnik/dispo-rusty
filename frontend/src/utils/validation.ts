/**
 * Validation Utilities for Credentials
 *
 * Pure functions for validating user input using Result types.
 * All validation functions return Result<T, ValidationError> for type-safe error handling.
 *
 * @module validation
 */

import { type Result, ok, err } from 'neverthrow';
import type { CredentialValidationError } from '../types/errors';
import { ValidationErrors, formatCredentialValidationError } from '../types/errors';
import type { TenantId } from '../types/ids';

// Re-export for convenience
export type { CredentialValidationError } from '../types/errors';
export { formatCredentialValidationError } from '../types/errors';

/**
 * Username validation constants
 */
const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 50;
const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]+$/;

/**
 * Password validation constants
 */
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_REQUIREMENTS = [
  'At least one uppercase letter',
  'At least one lowercase letter',
  'At least one number',
];

/**
 * Tenant ID validation pattern
 */
const TENANT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Email validation pattern (RFC 5322 simplified)
 */
const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/**
 * Validated username type (branded type)
 */
export type ValidatedUsername = string & { readonly __brand: 'ValidatedUsername' };

/**
 * Validated password type (branded type)
 */
export type ValidatedPassword = string & { readonly __brand: 'ValidatedPassword' };

/**
 * Validated email type (branded type)
 */
export type ValidatedEmail = string & { readonly __brand: 'ValidatedEmail' };

/**
 * Validate username
 *
 * Rules:
 * - Cannot be empty
 * - Must be between 3-50 characters
 * - Can only contain alphanumeric characters, underscores, dots, and hyphens
 *
 * @param username - The username to validate
 * @returns Result containing validated username or validation error
 *
 * @example
 * ```typescript
 * const result = validateUsername('john_doe');
 * result.match(
 *   (username) => console.log('Valid:', username),
 *   (error) => console.log('Invalid:', formatCredentialValidationError(error))
 * );
 * ```
 */
export const validateUsername = (
  username: string
): Result<ValidatedUsername, CredentialValidationError> => {
  // Check if empty
  if (username?.trim().length === 0) {
    return err(ValidationErrors.emptyUsername());
  }

  const trimmed = username.trim();

  // Check minimum length
  if (trimmed.length < USERNAME_MIN_LENGTH) {
    return err(ValidationErrors.usernameTooShort(USERNAME_MIN_LENGTH, trimmed.length));
  }

  // Check maximum length
  if (trimmed.length > USERNAME_MAX_LENGTH) {
    return err(ValidationErrors.usernameTooLong(USERNAME_MAX_LENGTH, trimmed.length));
  }

  // Check format
  if (!USERNAME_PATTERN.test(trimmed)) {
    return err(ValidationErrors.invalidUsernameFormat(USERNAME_PATTERN.source));
  }

  return ok(trimmed as ValidatedUsername);
};

/**
 * Validate password
 *
 * Rules:
 * - Cannot be empty
 * - Must be at least 8 characters
 * - Must contain at least one uppercase letter, one lowercase letter, and one number
 *
 * @param password - The password to validate
 * @returns Result containing validated password or validation error
 *
 * @example
 * ```typescript
 * const result = validatePassword('MyP@ssw0rd');
 * result.match(
 *   (password) => console.log('Valid password'),
 *   (error) => console.log('Invalid:', formatCredentialValidationError(error))
 * );
 * ```
 */
export const validatePassword = (
  password: string
): Result<ValidatedPassword, CredentialValidationError> => {
  // Check if empty
  if (password?.length === 0) {
    return err(ValidationErrors.emptyPassword());
  }

  // Check minimum length
  if (password.length < PASSWORD_MIN_LENGTH) {
    return err(ValidationErrors.passwordTooShort(PASSWORD_MIN_LENGTH, password.length));
  }

  // Check password strength
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);

  const missingRequirements: string[] = [];
  if (!hasUpperCase) missingRequirements.push(PASSWORD_REQUIREMENTS[0] ?? 'uppercase');
  if (!hasLowerCase) missingRequirements.push(PASSWORD_REQUIREMENTS[1] ?? 'lowercase');
  if (!hasNumber) missingRequirements.push(PASSWORD_REQUIREMENTS[2] ?? 'number');

  if (missingRequirements.length > 0) {
    return err(ValidationErrors.passwordTooWeak(missingRequirements));
  }

  return ok(password as ValidatedPassword);
};

/**
 * Validate tenant ID
 *
 * Rules:
 * - Cannot be empty
 * - Can only contain alphanumeric characters, underscores, and hyphens
 *
 * @param tenantId - The tenant ID to validate
 * @returns Result containing validated tenant ID or validation error
 *
 * @example
 * ```typescript
 * const result = validateTenantId('tenant1');
 * result.match(
 *   (tenantId) => console.log('Valid:', tenantId),
 *   (error) => console.log('Invalid:', formatCredentialValidationError(error))
 * );
 * ```
 */
export const validateTenantId = (
  tenantId: string | TenantId
): Result<TenantId, CredentialValidationError> => {
  const id = String(tenantId);

  // Check if empty
  if (id?.trim().length === 0) {
    return err(ValidationErrors.emptyTenantId());
  }

  const trimmed = id.trim();

  // Check format
  if (!TENANT_ID_PATTERN.test(trimmed)) {
    return err(ValidationErrors.invalidTenantIdFormat(TENANT_ID_PATTERN.source));
  }

  return ok(trimmed as TenantId);
};

/**
 * Validate email address
 *
 * Rules:
 * - Must match standard email format (RFC 5322 simplified)
 *
 * @param email - The email address to validate
 * @returns Result containing validated email or validation error
 *
 * @example
 * ```typescript
 * const result = validateEmail('user@example.com');
 * result.match(
 *   (email) => console.log('Valid:', email),
 *   (error) => console.log('Invalid:', formatCredentialValidationError(error))
 * );
 * ```
 */
export const validateEmail = (email: string): Result<ValidatedEmail, CredentialValidationError> => {
  const trimmed = email.trim();

  // Check format
  if (!EMAIL_PATTERN.test(trimmed)) {
    return err(ValidationErrors.invalidEmailFormat(trimmed));
  }

  return ok(trimmed as ValidatedEmail);
};

/**
 * Validate all login credentials at once
 *
 * Uses railway-oriented programming to validate all fields and return
 * the first validation error encountered, or all validated values.
 *
 * @param username - The username to validate
 * @param password - The password to validate
 * @param tenantId - The tenant ID to validate (optional)
 * @returns Result containing validated credentials or validation error
 *
 * @example
 * ```typescript
 * const result = validateLoginCredentials('john_doe', 'MyP@ssw0rd', 'tenant1');
 * result.match(
 *   ({ username, password, tenantId }) => console.log('All valid'),
 *   (error) => console.log('Validation failed:', formatCredentialValidationError(error))
 * );
 * ```
 */
export const validateLoginCredentials = (
  username: string,
  password: string,
  tenantId?: string | TenantId
): Result<
  {
    username: ValidatedUsername;
    password: ValidatedPassword;
    tenantId?: TenantId;
  },
  CredentialValidationError
> => {
  // Validate username first
  return validateUsername(username).andThen(validatedUsername =>
    // Then validate password
    validatePassword(password).andThen(validatedPassword => {
      // If tenant ID provided, validate it too
      if (tenantId) {
        return validateTenantId(tenantId).map(validatedTenantId => ({
          username: validatedUsername,
          password: validatedPassword,
          tenantId: validatedTenantId,
        }));
      }

      // No tenant ID to validate
      return ok({
        username: validatedUsername,
        password: validatedPassword,
      });
    })
  );
};

/**
 * Validate optional field (returns Ok(undefined) if empty, validates if present)
 *
 * @param value - The optional value to validate
 * @param validator - The validation function to use
 * @returns Result containing validated value, undefined, or validation error
 *
 * @example
 * ```typescript
 * const result = validateOptional(maybeEmail, validateEmail);
 * ```
 */
export const validateOptional = <T, E>(
  value: string | undefined | null,
  validator: (v: string) => Result<T, E>
): Result<T | undefined, E> => {
  // Explicit emptiness check: returns Ok(undefined) for null, undefined, or empty/whitespace-only strings
  if (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim().length === 0)
  ) {
    return ok(undefined);
  }
  return validator(value);
};
