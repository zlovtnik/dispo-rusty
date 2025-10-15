/**
 * Common Passwords List Configuration
 *
 * This file contains a list of commonly used passwords that should be rejected
 * during password validation to prevent weak passwords.
 *
 * This list is loaded at runtime and can be updated without code changes.
 * See MIGRATION.md for instructions on updating this list.
 */

import { TOP_1000_COMMON_PASSWORDS } from './top1000CommonPasswords';

/**
 * Fallback list of common passwords (top 1000 most breached passwords from OWASP, Have I Been Pwned, and RockYou datasets)
 * Used when the remote password list cannot be loaded.
 * Count: 1000 entries
 */
export const COMMON_PASSWORDS_FALLBACK: readonly string[] = TOP_1000_COMMON_PASSWORDS;

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
  /** Maximum number of password entries to keep in cache (count-based limit to prevent unbounded memory growth) */
  maxCacheEntries?: number;
}

/**
 * Default configuration for common passwords loading
 */
export const DEFAULT_COMMON_PASSWORDS_CONFIG: CommonPasswordsConfig = {
  filePath: '/config/common-passwords.json',
  enabled: true,
  cacheTtlMs: 24 * 60 * 60 * 1000, // 24 hours
  requestTimeoutMs: 5000,
  maxCacheEntries: 10000, // Default to 10,000 entries (count-based limit)
};