/**
 * Common Passwords List Configuration
 *
 * This file contains a list of commonly used passwords that should be rejected
 * during password validation to prevent weak passwords.
 *
 * This list is loaded at runtime and can be updated without code changes.
 * See MIGRATION.md for instructions on updating this list.
 */

export const COMMON_PASSWORDS_FALLBACK: readonly string[] = [
  '123456',
  'password',
  '123456789',
  'qwerty',
  '111111',
  'abc123',
  'password1',
  'letmein',
  'welcome',
  'admin',
];

/**
 * Configuration for loading common passwords
 */
export interface CommonPasswordsConfig {
  /** Path to JSON file containing password list (relative to public/ or absolute URL) */
  filePath?: string;
  /** Whether to enable loading from external source */
  enabled: boolean;
  /** Cache TTL in milliseconds */
  cacheTtlMs: number;
  /** Request timeout in milliseconds */
  requestTimeoutMs: number;
}

/**
 * Default configuration for common passwords loading
 */
export const DEFAULT_COMMON_PASSWORDS_CONFIG: CommonPasswordsConfig = {
  filePath: '/config/common-passwords.json',
  enabled: true,
  cacheTtlMs: 24 * 60 * 60 * 1000, // 24 hours
  requestTimeoutMs: 5000,
};