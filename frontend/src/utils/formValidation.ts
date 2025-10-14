/**
 * Form Validation Library - Extended Validators
 * 
 * Pure validation functions for form fields using Result types and branded types.
 * Implements railway-oriented programming patterns for composable validation.
 * 
 * @module formValidation
 */

import { Result, ok, err } from 'neverthrow';

/**
 * Form validation error types (discriminated unions)
 */
export type FormValidationError =
  | { type: 'INVALID_EMAIL'; email: string; reason: string }
  | { type: 'INVALID_PHONE'; phone: string; reason: string }
  | { type: 'INVALID_PASSWORD'; reason: string }
  | { type: 'INVALID_AGE'; age: number; reason: string }
  | { type: 'INVALID_ZIP_CODE'; zipCode: string; reason: string }
  | { type: 'REQUIRED_FIELD'; fieldName: string }
  | { type: 'STRING_TOO_SHORT'; fieldName: string; min: number; actual: number }
  | { type: 'STRING_TOO_LONG'; fieldName: string; max: number; actual: number }
  | { type: 'PATTERN_MISMATCH'; fieldName: string; pattern: string }
  | { type: 'CUSTOM_VALIDATION'; fieldName: string; message: string };

/**
 * Branded types for validated form fields
 */
export type Email = string & { readonly __brand: 'Email' };
export type Phone = string & { readonly __brand: 'Phone' };
export type Password = string & { readonly __brand: 'Password' };
export type Age = number & { readonly __brand: 'Age' };
export type ZipCode = string & { readonly __brand: 'ZipCode' };

/**
 * Validation constants
 */
const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const PHONE_PATTERNS = {
  // US format: +1-234-567-8900, (234) 567-8900, 234-567-8900, 2345678900
  US: /^(\+1)?[-.\s]?(\()?[0-9]{3}(\))?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}$/,
  // International format: +XX followed by spaces, dashes, or digits (10-15 digits total)
  INTERNATIONAL: /^\+?[1-9]\d{0,3}[\s.-]?\d{1,4}[\s.-]?\d{1,4}[\s.-]?\d{1,9}$/,
};
const ZIP_CODE_PATTERNS = {
  // US: 12345 or 12345-6789
  US: /^\d{5}(-\d{4})?$/,
  // Canada: A1A 1A1
  CANADA: /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/,
  // Generic international
  INTERNATIONAL: /^[A-Za-z0-9]{3,10}$/,
};
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

/**
 * Error factory functions
 */
export const FormValidationErrors = {
  invalidEmail: (email: string, reason: string): FormValidationError => 
    ({ type: 'INVALID_EMAIL', email, reason }),
  invalidPhone: (phone: string, reason: string): FormValidationError => 
    ({ type: 'INVALID_PHONE', phone, reason }),
  invalidPassword: (reason: string): FormValidationError => 
    ({ type: 'INVALID_PASSWORD', reason }),
  invalidAge: (age: number, reason: string): FormValidationError => 
    ({ type: 'INVALID_AGE', age, reason }),
  invalidZipCode: (zipCode: string, reason: string): FormValidationError => 
    ({ type: 'INVALID_ZIP_CODE', zipCode, reason }),
  requiredField: (fieldName: string): FormValidationError => 
    ({ type: 'REQUIRED_FIELD', fieldName }),
  stringTooShort: (fieldName: string, min: number, actual: number): FormValidationError => 
    ({ type: 'STRING_TOO_SHORT', fieldName, min, actual }),
  stringTooLong: (fieldName: string, max: number, actual: number): FormValidationError => 
    ({ type: 'STRING_TOO_LONG', fieldName, max, actual }),
  patternMismatch: (fieldName: string, pattern: string): FormValidationError => 
    ({ type: 'PATTERN_MISMATCH', fieldName, pattern }),
  customValidation: (fieldName: string, message: string): FormValidationError => 
    ({ type: 'CUSTOM_VALIDATION', fieldName, message }),
};

/**
 * Validate email address (RFC 5322 simplified)
 * 
 * @param email - Email address to validate
 * @returns Result with branded Email type or validation error
 * 
 * @example
 * ```typescript
 * const result = validateEmail('user@example.com');
 * result.match(
 *   (email) => console.log('Valid email:', email),
 *   (error) => console.log('Error:', formatFormValidationError(error))
 * );
 * ```
 */
export const validateEmail = (email: string): Result<Email, FormValidationError> => {
  const trimmed = email.trim().toLowerCase();

  if (trimmed.length === 0) {
    return err(FormValidationErrors.requiredField('email'));
  }

  if (trimmed.length > 254) {
    return err(FormValidationErrors.invalidEmail(email, 'Email address too long (max 254 characters)'));
  }

  if (!EMAIL_PATTERN.test(trimmed)) {
    return err(FormValidationErrors.invalidEmail(email, 'Invalid email format'));
  }

  // Additional validation: check for common typos
  const [localPart, domain] = trimmed.split('@');
  if (localPart && localPart.length > 64) {
    return err(FormValidationErrors.invalidEmail(email, 'Local part too long (max 64 characters)'));
  }

  // Check for consecutive dots in local part
  if (localPart && localPart.includes('..')) {
    return err(FormValidationErrors.invalidEmail(email, 'Email contains consecutive dots'));
  }

  if (domain && domain.includes('..')) {
    return err(FormValidationErrors.invalidEmail(email, 'Domain contains consecutive dots'));
  }

  return ok(trimmed as Email);
};

/**
 * Validate phone number (supports US and international formats)
 * 
 * @param phone - Phone number to validate
 * @param format - Optional format specification ('US', 'INTERNATIONAL', or 'AUTO')
 * @returns Result with branded Phone type or validation error
 * 
 * @example
 * ```typescript
 * const result = validatePhone('+1-234-567-8900');
 * ```
 */
export const validatePhone = (
  phone: string, 
  format: 'US' | 'INTERNATIONAL' | 'AUTO' = 'AUTO'
): Result<Phone, FormValidationError> => {
  const trimmed = phone.trim();

  if (trimmed.length === 0) {
    return err(FormValidationErrors.requiredField('phone'));
  }

  // Remove all non-digit characters for length check
  const digitsOnly = trimmed.replace(/\D/g, '');

  if (digitsOnly.length < 10) {
    return err(FormValidationErrors.invalidPhone(phone, 'Phone number must have at least 10 digits'));
  }

  if (digitsOnly.length > 15) {
    return err(FormValidationErrors.invalidPhone(phone, 'Phone number too long (max 15 digits)'));
  }

  // Validate based on format
  if (format === 'US' && !PHONE_PATTERNS.US.test(trimmed)) {
    return err(FormValidationErrors.invalidPhone(phone, 'Invalid US phone number format'));
  }

  if (format === 'INTERNATIONAL' && !PHONE_PATTERNS.INTERNATIONAL.test(trimmed)) {
    return err(FormValidationErrors.invalidPhone(phone, 'Invalid international phone number format'));
  }

  if (format === 'AUTO') {
    const isValidUS = PHONE_PATTERNS.US.test(trimmed);
    const isValidInternational = PHONE_PATTERNS.INTERNATIONAL.test(trimmed);
    
    if (!isValidUS && !isValidInternational) {
      return err(FormValidationErrors.invalidPhone(phone, 'Invalid phone number format'));
    }
  }

  return ok(trimmed as Phone);
};

/**
 * Common weak passwords and patterns to block
 * Curated list of most commonly used passwords from security research
 * Source: Based on top compromised passwords from Have I Been Pwned and similar databases
 */
const COMMON_WEAK_PASSWORDS = [
  // Extremely common patterns
  'password', 'password123', 'password1', 'pass', 'passwd',
  // Number sequences
  '12345678', '123456789', '1234567890', '12345', '123456', '1234567',
  // Keyboard patterns
  'qwerty', 'qwertyuiop', 'qwerty123', 'asdfgh', 'asdfghjkl', 'zxcvbn',
  'qazwsx', '1qaz2wsx', 'qwertyui',
  // Simple patterns
  'abc123', 'abc12345', '123abc', 'abc', 'abcd1234', 'a1b2c3',
  // Common words
  'welcome', 'monkey', 'dragon', 'master', 'letmein', 'login',
  'admin', 'administrator', 'root', 'user', 'guest', 'test',
  // Names and dates
  'sunshine', 'princess', 'football', 'soccer', 'baseball',
  'iloveyou', 'trustno1', 'starwars',
  // Weak combinations
  'password!', 'Password1', 'Pass1234', 'Welcome1', 'Admin123',
  '000000', '111111', '123123', '696969',
];

/**
 * Validate password with comprehensive strength requirements
 * 
 * @param password - Password to validate
 * @returns Result with branded Password type or validation error
 * 
 * @example
 * ```typescript
 * const result = validatePassword('SecureP@ss123');
 * ```
 */
export const validatePassword = (password: string): Result<Password, FormValidationError> => {
  if (password.length === 0) {
    return err(FormValidationErrors.requiredField('password'));
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return err(FormValidationErrors.invalidPassword(
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`
    ));
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    return err(FormValidationErrors.invalidPassword(
      `Password must be at most ${PASSWORD_MAX_LENGTH} characters long`
    ));
  }

  // Check password strength requirements
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

  const missingRequirements: string[] = [];
  if (!hasUpperCase) missingRequirements.push('one uppercase letter');
  if (!hasLowerCase) missingRequirements.push('one lowercase letter');
  if (!hasNumber) missingRequirements.push('one number');
  
  // Special char is recommended but not required for basic validation
  const strengthScore = [hasUpperCase, hasLowerCase, hasNumber, hasSpecialChar]
    .filter(Boolean).length;

  if (missingRequirements.length > 0) {
    return err(FormValidationErrors.invalidPassword(
      `Password must contain at least: ${missingRequirements.join(', ')}`
    ));
  }

  // Check for common weak passwords - check if password matches exactly (not just contains)
  const passwordLower = password.toLowerCase();
  if (COMMON_WEAK_PASSWORDS.some(weak => passwordLower === weak.toLowerCase())) {
    return err(FormValidationErrors.invalidPassword(
      'Password is too common'
    ));
  }

  return ok(password as Password);
};

/**
 * Validate age (must be a positive integer within reasonable range)
 * 
 * @param age - Age to validate
 * @param options - Optional min/max age constraints
 * @returns Result with branded Age type or validation error
 * 
 * @example
 * ```typescript
 * const result = validateAge(25, { min: 18, max: 120 });
 * ```
 */
export const validateAge = (
  age: number,
  options: { min?: number; max?: number } = {}
): Result<Age, FormValidationError> => {
  const { min = 0, max = 150 } = options;

  if (!Number.isFinite(age)) {
    return err(FormValidationErrors.invalidAge(age, 'Age must be a valid number'));
  }

  if (!Number.isInteger(age)) {
    return err(FormValidationErrors.invalidAge(age, 'Age must be a whole number'));
  }

  if (age < min) {
    return err(FormValidationErrors.invalidAge(age, `Age must be at least ${min}`));
  }

  if (age > max) {
    return err(FormValidationErrors.invalidAge(age, `Age must be at most ${max}`));
  }

  return ok(age as Age);
};

/**
 * Validate ZIP/postal code (supports US and Canada)
 * 
 * @param zipCode - ZIP/postal code to validate
 * @param country - Country code ('US', 'CANADA', or 'INTERNATIONAL')
 * @returns Result with branded ZipCode type or validation error
 * 
 * @example
 * ```typescript
 * const result = validateZipCode('12345', 'US');
 * ```
 */
export const validateZipCode = (
  zipCode: string,
  country: 'US' | 'CANADA' | 'INTERNATIONAL' = 'US'
): Result<ZipCode, FormValidationError> => {
  const trimmed = zipCode.trim();

  if (trimmed.length === 0) {
    return err(FormValidationErrors.requiredField('zipCode'));
  }

  const pattern = ZIP_CODE_PATTERNS[country];
  if (!pattern.test(trimmed)) {
    return err(FormValidationErrors.invalidZipCode(
      zipCode,
      `Invalid ${country} ZIP/postal code format`
    ));
  }

  return ok(trimmed as ZipCode);
};

/**
 * Combinator: Validate all fields in parallel
 * Returns the first error encountered, or all validated values
 * 
 * @param validations - Array of validation Result objects (can be mixed types)
 * @returns Result with array of validated values or first error
 * 
 * @example
 * ```typescript
 * const result = validateAll([
 *   validateEmail(email),
 *   validatePhone(phone),
 *   validateAge(age)
 * ]);
 * ```
 */
export const validateAll = <E>(
  validations: Result<unknown, E>[]
): Result<unknown[], E> => {
  const results: unknown[] = [];
  
  for (const validation of validations) {
    if (validation.isErr()) {
      return err(validation.error);
    }
    results.push(validation.value);
  }
  
  return ok(results);
};

/**
 * Combinator: Validate fields in sequence (railway-oriented programming)
 * Each validation only runs if the previous one succeeded
 * 
 * @param validations - Array of validation functions
 * @returns Result with array of validated values or first error
 * 
 * @example
 * ```typescript
 * const result = validateSequence([
 *   () => validateEmail(email),
 *   () => validatePassword(password),
 *   () => validateAge(age)
 * ]);
 * ```
 */
export const validateSequence = <T, E>(
  validations: (() => Result<T, E>)[]
): Result<T[], E> => {
  const results: T[] = [];
  
  for (const validate of validations) {
    const result = validate();
    if (result.isErr()) {
      return err(result.error);
    }
    results.push(result.value);
  }
  
  return ok(results);
};

/**
 * Combinator: Validate optional field
 * Returns Ok(undefined) if empty/null, validates if present
 * 
 * @param value - Optional value to validate
 * @param validator - Validation function to apply if value exists
 * @returns Result with validated value, undefined, or error
 * 
 * @example
 * ```typescript
 * const result = validateOptional(maybePhone, validatePhone);
 * ```
 */
export const validateOptional = <T, V, E>(
  value: V | undefined | null,
  validator: (v: V) => Result<T, E>
): Result<T | undefined, E> => {
  if (value === undefined || value === null) {
    return ok(undefined);
  }
  
  if (typeof value === 'string' && value.trim().length === 0) {
    return ok(undefined);
  }
  
  return validator(value);
};

/**
 * Combinator: Collect all validation errors instead of failing fast
 * Useful for form validation where you want to show all errors at once
 * 
 * @param validations - Object mapping field names to validation results
 * @returns Result with validated values or all errors
 * 
 * @example
 * ```typescript
 * const result = validateAllOrCollectErrors({
 *   email: validateEmail(formData.email),
 *   phone: validatePhone(formData.phone),
 *   age: validateAge(formData.age)
 * });
 * ```
 */
export const validateAllOrCollectErrors = <T extends Record<string, unknown>, E>(
  validations: { [K in keyof T]: Result<T[K], E> }
): Result<T, Record<keyof T, E>> => {
  const errors: Partial<Record<keyof T, E>> = {};
  const values: Partial<T> = {};
  
  for (const [key, validation] of Object.entries(validations)) {
    if (validation.isErr()) {
      errors[key as keyof T] = validation.error;
    } else {
      values[key as keyof T] = validation.value as T[keyof T];
    }
  }
  
  if (Object.keys(errors).length > 0) {
    return err(errors as Record<keyof T, E>);
  }
  
  return ok(values as T);
};

/**
 * Format validation error to user-friendly message
 * 
 * @param error - Form validation error
 * @returns Human-readable error message
 */
export const formatFormValidationError = (error: FormValidationError): string => {
  switch (error.type) {
    case 'INVALID_EMAIL':
      return `Invalid email: ${error.reason}`;
    case 'INVALID_PHONE':
      return `Invalid phone number: ${error.reason}`;
    case 'INVALID_PASSWORD':
      return error.reason;
    case 'INVALID_AGE':
      return `Invalid age: ${error.reason}`;
    case 'INVALID_ZIP_CODE':
      return `Invalid ZIP code: ${error.reason}`;
    case 'REQUIRED_FIELD':
      return `${error.fieldName} is required`;
    case 'STRING_TOO_SHORT':
      return `${error.fieldName} must be at least ${error.min} characters (got ${error.actual})`;
    case 'STRING_TOO_LONG':
      return `${error.fieldName} must be at most ${error.max} characters (got ${error.actual})`;
    case 'PATTERN_MISMATCH':
      return `${error.fieldName} format is invalid`;
    case 'CUSTOM_VALIDATION':
      return error.message;
  }
};
