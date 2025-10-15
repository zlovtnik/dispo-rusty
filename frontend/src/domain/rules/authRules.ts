/**
 * Authentication Business Rules
 *
 * Pure business logic for authentication-related operations.
 * These rules define password policies, session timeouts, and auth requirements.
 */

import type { Result } from 'neverthrow';
import { ok, err } from 'neverthrow';

/**
 * Password strength requirements
 */
export interface PasswordRequirements {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  minSpecialChars: number;
  maxLength: number;
}

/**
 * Default password requirements
 */
export const DEFAULT_PASSWORD_REQUIREMENTS: PasswordRequirements = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  minSpecialChars: 1,
  maxLength: 128,
};

/**
 * Password validation error
 */
export type PasswordValidationError =
  | { type: 'TOO_SHORT'; minLength: number; actualLength: number }
  | { type: 'TOO_LONG'; maxLength: number; actualLength: number }
  | { type: 'MISSING_UPPERCASE' }
  | { type: 'MISSING_LOWERCASE' }
  | { type: 'MISSING_NUMBERS' }
  | { type: 'MISSING_SPECIAL_CHARS'; required: number }
  | { type: 'COMMON_PASSWORD' }
  | { type: 'CONTAINS_USERNAME' };

/**
 * Session timeout configuration
 */
export interface SessionTimeoutConfig {
  /** Idle timeout in minutes */
  idleTimeout: number;
  /** Absolute timeout in hours */
  absoluteTimeout: number;
  /** Warning before timeout in minutes */
  warningBeforeTimeout: number;
}

/**
 * Default session timeout configuration
 */
export const DEFAULT_SESSION_TIMEOUT: SessionTimeoutConfig = {
  idleTimeout: 30, // 30 minutes of inactivity
  absoluteTimeout: 8, // 8 hours max session
  warningBeforeTimeout: 5, // warn 5 minutes before timeout
};

/**
 * Validate password against strength requirements
 *
 * @param password - Password to validate
 * @param requirements - Password requirements (optional, uses defaults)
 * @param username - Username to check against (optional)
 * @returns Result containing void on success or PasswordValidationError
 */
export function validatePasswordStrength(
  password: string,
  requirements: PasswordRequirements = DEFAULT_PASSWORD_REQUIREMENTS,
  username?: string
): Result<void, PasswordValidationError> {
  // Check length
  if (password.length < requirements.minLength) {
    return err({
      type: 'TOO_SHORT',
      minLength: requirements.minLength,
      actualLength: password.length,
    });
  }

  if (password.length > requirements.maxLength) {
    return err({
      type: 'TOO_LONG',
      maxLength: requirements.maxLength,
      actualLength: password.length,
    });
  }

  // Check uppercase
  if (requirements.requireUppercase && !/[A-Z]/.test(password)) {
    return err({ type: 'MISSING_UPPERCASE' });
  }

  // Check lowercase
  if (requirements.requireLowercase && !/[a-z]/.test(password)) {
    return err({ type: 'MISSING_LOWERCASE' });
  }

  // Check numbers
  if (requirements.requireNumbers && !/\d/.test(password)) {
    return err({ type: 'MISSING_NUMBERS' });
  }

  // Check special characters
  if (requirements.requireSpecialChars) {
    const specialChars = password.match(/[^a-zA-Z0-9]/g);
    const specialCharCount = specialChars ? specialChars.length : 0;

    if (specialCharCount < requirements.minSpecialChars) {
      return err({
        type: 'MISSING_SPECIAL_CHARS',
        required: requirements.minSpecialChars,
      });
    }
  }

  // Check if password contains username
  if (username && password.toLowerCase().includes(username.toLowerCase())) {
    return err({ type: 'CONTAINS_USERNAME' });
  }

  // Check against common passwords
  if (isCommonPassword(password)) {
    return err({
      type: 'COMMON_PASSWORD',
    });
  }

  return ok(undefined);
}

/**
 * Check if session should timeout based on idle time
 *
 * @param lastActivity - Last activity timestamp
 * @param config - Session timeout configuration (optional, uses defaults)
 * @returns true if session should timeout
 */
export function shouldTimeoutFromIdle(
  lastActivity: Date,
  config: SessionTimeoutConfig = DEFAULT_SESSION_TIMEOUT
): boolean {
  const now = new Date();
  const idleMinutes = (now.getTime() - lastActivity.getTime()) / (1000 * 60);
  return idleMinutes >= config.idleTimeout;
}

/**
 * Check if session should timeout based on absolute time
 *
 * @param sessionStart - Session start timestamp
 * @param config - Session timeout configuration (optional, uses defaults)
 * @returns true if session should timeout
 */
export function shouldTimeoutFromAbsolute(
  sessionStart: Date,
  config: SessionTimeoutConfig = DEFAULT_SESSION_TIMEOUT
): boolean {
  const now = new Date();
  const sessionHours = (now.getTime() - sessionStart.getTime()) / (1000 * 60 * 60);
  return sessionHours >= config.absoluteTimeout;
}

/**
 * Check if should show timeout warning
 *
 * @param lastActivity - Last activity timestamp
 * @param config - Session timeout configuration (optional, uses defaults)
 * @returns true if warning should be shown
 */
export function shouldShowTimeoutWarning(
  lastActivity: Date,
  config: SessionTimeoutConfig = DEFAULT_SESSION_TIMEOUT
): boolean {
  const now = new Date();
  const idleMinutes = (now.getTime() - lastActivity.getTime()) / (1000 * 60);
  const warningThreshold = config.idleTimeout - config.warningBeforeTimeout;
  return idleMinutes >= warningThreshold && idleMinutes < config.idleTimeout;
}

/**
 * Get minutes until session timeout
 *
 * @param lastActivity - Last activity timestamp
 * @param config - Session timeout configuration (optional, uses defaults)
 * @returns Minutes until timeout, or 0 if already timed out
 */
export function getMinutesUntilTimeout(
  lastActivity: Date,
  config: SessionTimeoutConfig = DEFAULT_SESSION_TIMEOUT
): number {
  const now = new Date();
  const idleMinutes = (now.getTime() - lastActivity.getTime()) / (1000 * 60);
  const remaining = config.idleTimeout - idleMinutes;
  return Math.max(0, Math.floor(remaining));
}

/**
 * Check if password is in common passwords list
 *
 * **PRODUCTION WARNING**: This is a minimal dev-only list with only 25 entries.
 * Replace before release with one of:
 * - Have I Been Pwned API (https://haveibeenpwned.com/API/v3#PwnedPasswords)
 * - Loading a comprehensive password list (e.g., 10 million passwords)
 * - Using a Bloom filter for efficient checking
 *
 * TODO: Replace this implementation before production release
 *
 * @param password - Password to check
 * @returns true if password is common
 */
function isCommonPassword(password: string): boolean {
  const commonPasswords = [
    'password',
    'password123',
    '123456',
    '12345678',
    'qwerty',
    'abc123',
    'monkey',
    '1234567',
    'letmein',
    'trustno1',
    'dragon',
    'baseball',
    'iloveyou',
    'master',
    'sunshine',
    'ashley',
    'bailey',
    'passw0rd',
    'shadow',
    '123123',
    '654321',
    'superman',
    'qazwsx',
    'michael',
    'football',
  ];

  return commonPasswords.includes(password.toLowerCase());
}

/**
 * Calculate password strength score (0-100)
 *
 * @param password - Password to score
 * @returns Strength score from 0 (weakest) to 100 (strongest)
 */
export function calculatePasswordStrength(password: string): number {
  let score = 0;

  // Length score (max 30 points)
  score += Math.min(30, password.length * 2);

  // Variety score (max 40 points)
  if (/[a-z]/.test(password)) score += 10;
  if (/[A-Z]/.test(password)) score += 10;
  if (/\d/.test(password)) score += 10;
  if (/[^a-zA-Z0-9]/.test(password)) score += 10;

  // Complexity score (max 30 points)
  const hasRepeats = /(.)\1{2,}/.test(password); // 3+ repeated chars
  if (!hasRepeats) score += 10;

  const hasSequence = /(abc|bcd|cde|123|234|345)/i.test(password);
  if (!hasSequence) score += 10;

  const hasCommon = isCommonPassword(password);
  if (!hasCommon) score += 10;

  return Math.min(100, score);
}

/**
 * Get password strength label
 *
 * @param score - Password strength score (0-100)
 * @returns Human-readable strength label
 */
export function getPasswordStrengthLabel(
  score: number
): 'weak' | 'fair' | 'good' | 'strong' | 'very strong' {
  if (score < 30) return 'weak';
  if (score < 50) return 'fair';
  if (score < 70) return 'good';
  if (score < 90) return 'strong';
  return 'very strong';
}

/**
 * Multi-factor authentication rules
 * (Future implementation)
 */
export interface MfaRules {
  required: boolean;
  methods: ('totp' | 'sms' | 'email')[];
  gracePeriodDays: number;
}

export const DEFAULT_MFA_RULES: MfaRules = {
  required: false,
  methods: ['totp', 'email'],
  gracePeriodDays: 7,
};
