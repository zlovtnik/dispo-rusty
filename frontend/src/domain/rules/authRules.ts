/**
 * Authentication Business Rules
 *
 * Pure business logic for authentication-related operations.
 * These rules define password policies, session timeouts, and auth requirements.
 */

import type { Result } from 'neverthrow';
import { ok, err } from 'neverthrow';

import { getEnv } from '@/config/env';
import { getCommonPasswords } from '@/utils/commonPasswordsLoader';

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
  | { type: 'COMMON_PASSWORD'; source: 'REMOTE' | 'LOCAL'; occurrences?: number }
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

type FetchImplementation = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface PasswordBreachCheckOutcome {
  compromised: boolean;
  occurrences?: number;
  source: 'REMOTE' | 'LOCAL';
  warning?: string;
}

export interface PasswordBreachCheckConfig {
  enabled: boolean;
  endpoint: string;
  cacheTtlMs: number;
  requestTimeoutMs: number;
  maxRetries: number;
  initialBackoffMs: number;
  maxBackoffMs: number;
  backoffFactor: number;
  rateLimitIntervalMs: number;
  userAgent: string;
  fetchImplementation?: FetchImplementation;
}

const createDefaultPasswordBreachCheckConfig = (): PasswordBreachCheckConfig => {
  const env = getEnv();
  return {
    enabled: env.enablePwnedPasswordCheck,
    endpoint: 'https://api.pwnedpasswords.com/range',
    cacheTtlMs: 5 * 60 * 1000,
    requestTimeoutMs: 5000,
    maxRetries: 2,
    initialBackoffMs: 500,
    maxBackoffMs: 4000,
    backoffFactor: 2,
    rateLimitIntervalMs: 1500,
    userAgent: `${env.appName}/password-breach-check`,
  };
};

/**
 * Get the common passwords list
 * Loads from external source with fallback to built-in list
 */
let commonPasswordsCache: ReadonlyArray<string> | null = null;
let commonPasswordsPromise: Promise<ReadonlyArray<string>> | null = null;

async function getCommonPasswordsList(): Promise<ReadonlyArray<string>> {
  if (commonPasswordsCache) {
    return commonPasswordsCache;
  }

  if (commonPasswordsPromise) {
    return commonPasswordsPromise;
  }

  commonPasswordsPromise = getCommonPasswords();
  try {
    commonPasswordsCache = await commonPasswordsPromise;
  } finally {
    commonPasswordsPromise = null;
  }

  return commonPasswordsCache;
}

/**
 * Preload common passwords for synchronous access
 * Call this during app initialization
 */
export async function preloadCommonPasswords(): Promise<void> {
  await getCommonPasswordsList();
}

/**
 * Check if password is in common passwords list (synchronous, requires preload)
 */
export function isCommonPassword(password: string): boolean {
  if (!commonPasswordsCache) {
    // Fallback to minimal list if not preloaded
    const fallbackPasswords = ['123456', 'password', 'qwerty', '111111', 'abc123', 'password1!'];
    return fallbackPasswords.includes(password.toLowerCase());
  }
  return commonPasswordsCache.includes(password.toLowerCase());
}

class PwnedPasswordChecker {
  private readonly options: PasswordBreachCheckConfig;

  private readonly cache = new Map<string, { expiresAt: number; suffixes: Map<string, number> }>();

  private readonly pending = new Map<string, Promise<Map<string, number>>>();

  private lastRequestTimestamp = 0;

  constructor(options: PasswordBreachCheckConfig) {
    this.options = options;
  }

  private async isPasswordLocallyCompromised(password: string): Promise<boolean> {
    try {
      const commonPasswords = await getCommonPasswordsList();
      return commonPasswords.includes(password.toLowerCase());
    } catch (error) {
      // Fallback to a minimal hardcoded list if loading fails
      const fallbackPasswords = ['123456', 'password', 'qwerty', '111111', 'abc123', 'password1!'];
      return fallbackPasswords.includes(password.toLowerCase());
    }
  }

  async isCompromised(password: string): Promise<PasswordBreachCheckOutcome> {
    const localCompromised = await this.isPasswordLocallyCompromised(password);

    if (!this.options.enabled) {
      return {
        compromised: localCompromised,
        source: localCompromised ? 'LOCAL' : 'REMOTE',
        warning: 'Remote breach checking disabled by configuration.',
      };
    }

    try {
      const hash = await sha1Hex(password);
      const prefix = hash.slice(0, 5);
      const suffix = hash.slice(5);
      const suffixes = await this.fetchPrefix(prefix);
      const occurrences = suffixes.get(suffix);

      if (occurrences !== undefined) {
        return {
          compromised: true,
          occurrences,
          source: 'REMOTE',
        };
      }

      if (localCompromised) {
        return {
          compromised: true,
          source: 'LOCAL',
        };
      }

      return {
        compromised: false,
        source: 'REMOTE',
      };
    } catch (error) {
      const warning =
        error instanceof Error
          ? error.message
          : 'Unknown error when querying Have I Been Pwned API';
      console.warn('[AuthRules] Falling back to local password breach list:', warning);

      return {
        compromised: localCompromised,
        source: 'LOCAL',
        warning,
      };
    }
  }

  private async fetchPrefix(prefix: string): Promise<Map<string, number>> {
    const now = Date.now();
    const cached = this.cache.get(prefix);

    if (cached && cached.expiresAt > now) {
      return cached.suffixes;
    }

    const inFlight = this.pending.get(prefix);
    if (inFlight) {
      return inFlight;
    }

    const requestPromise = this.requestWithRetry(prefix)
      .then(result => {
        this.cache.set(prefix, {
          suffixes: result,
          expiresAt: Date.now() + this.options.cacheTtlMs,
        });
        return result;
      })
      .finally(() => {
        this.pending.delete(prefix);
      });

    this.pending.set(prefix, requestPromise);
    return requestPromise;
  }

  private async requestWithRetry(prefix: string): Promise<Map<string, number>> {
    let attempt = 0;
    let backoffDelay = this.options.initialBackoffMs;
    let lastError: unknown;

    // Loop continues while attempt <= maxRetries, resulting in (maxRetries + 1) total attempts.
    // For example, if maxRetries=3, attempts are: 0, 1, 2, 3 (4 total attempts)
    // This is intentional: maxRetries controls additional retries beyond the first attempt.
    while (attempt <= this.options.maxRetries) {
      try {
        await this.applyRateLimit();
        return await this.performRequest(prefix);
      } catch (error) {
        lastError = error;
        attempt += 1;
        if (attempt > this.options.maxRetries) {
          break;
        }
        await this.delay(Math.min(backoffDelay, this.options.maxBackoffMs));
        backoffDelay = Math.min(
          backoffDelay * this.options.backoffFactor,
          this.options.maxBackoffMs
        );
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async performRequest(prefix: string): Promise<Map<string, number>> {
    const controller = typeof AbortController === 'undefined' ? undefined : new AbortController();
    const timeoutId =
      controller && this.options.requestTimeoutMs > 0
        ? setTimeout(() => {
            controller.abort();
          }, this.options.requestTimeoutMs)
        : undefined;

    try {
      // Build headers conditionally - only include User-Agent in non-browser environments
      const headers: Record<string, string> = {
        'Add-Padding': 'true',
      };
      
      // Only add User-Agent when in non-browser environment (e.g., Node.js, server)
      if (typeof window === 'undefined' && typeof navigator === 'undefined') {
        headers['User-Agent'] = this.options.userAgent;
      }

      const response = await this.fetchImpl(`${this.options.endpoint}/${prefix}`, {
        method: 'GET',
        headers,
        signal: controller?.signal,
      });

      if (!response.ok) {
        throw new Error(`HIBP responded with status ${response.status}`);
      }

      const body = await response.text();
      const parsed = this.parseRangeResponse(body);
      this.lastRequestTimestamp = Date.now();
      return parsed;
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }

  private parseRangeResponse(payload: string): Map<string, number> {
    const suffixes = new Map<string, number>();

    payload.split(/\r?\n/).forEach(line => {
      const [suffix, count] = line.trim().split(':');
      if (!suffix || !count) return;
      const normalisedSuffix = suffix.trim().toUpperCase();
      const occurrences = Number.parseInt(count.trim(), 10);
      if (!Number.isNaN(occurrences)) {
        suffixes.set(normalisedSuffix, occurrences);
      }
    });

    return suffixes;
  }

  private async applyRateLimit(): Promise<void> {
    if (this.lastRequestTimestamp === 0) {
      return;
    }

    const elapsed = Date.now() - this.lastRequestTimestamp;
    if (elapsed < this.options.rateLimitIntervalMs) {
      await this.delay(this.options.rateLimitIntervalMs - elapsed);
    }
  }

  private async delay(durationMs: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, durationMs));
  }

  private get fetchImpl(): FetchImplementation {
    return this.options.fetchImplementation ?? fetch;
  }
}

let cachedDefaultPwnedPasswordChecker: PwnedPasswordChecker | null = null;

const getDefaultPwnedPasswordChecker = (): PwnedPasswordChecker => {
  if (!cachedDefaultPwnedPasswordChecker) {
    cachedDefaultPwnedPasswordChecker = new PwnedPasswordChecker(
      createDefaultPasswordBreachCheckConfig()
    );
  }

  return cachedDefaultPwnedPasswordChecker;
};

const getPasswordBreachChecker = (
  override: Partial<PasswordBreachCheckConfig>
): PwnedPasswordChecker => {
  if (!override || Object.keys(override).length === 0) {
    return getDefaultPwnedPasswordChecker();
  }

  return new PwnedPasswordChecker({
    ...createDefaultPasswordBreachCheckConfig(),
    ...override,
  });
};

async function sha1Hex(value: string): Promise<string> {
  const subtle = await getSubtleCrypto();
  const data = new TextEncoder().encode(value);
  const digest = await subtle.digest('SHA-1', data);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

async function getSubtleCrypto(): Promise<SubtleCrypto> {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    return globalThis.crypto.subtle;
  }

  throw new Error('SubtleCrypto API is not available in this environment.');
}

/**
 * Validate password against strength requirements
 *
 * @param password - Password to validate
 * @param requirements - Password requirements (optional, uses defaults)
 * @param username - Username to check against (optional)
 * @returns Result containing void on success or PasswordValidationError
 */
export async function validatePasswordStrength(
  password: string,
  requirements: PasswordRequirements = DEFAULT_PASSWORD_REQUIREMENTS,
  username?: string,
  breachConfig: Partial<PasswordBreachCheckConfig> = {}
): Promise<Result<void, PasswordValidationError>> {
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

  const checker = getPasswordBreachChecker(breachConfig);
  const breachResult = await checker.isCompromised(password);

  if (breachResult.compromised) {
    return err({
      type: 'COMMON_PASSWORD',
      source: breachResult.source,
      occurrences: breachResult.occurrences,
    });
  }

  if (breachResult.warning) {
    console.warn('[AuthRules] Password breach check warning:', breachResult.warning);
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

export const __resetPasswordBreachCheckerForTests = (): void => {
  cachedDefaultPwnedPasswordChecker = null;
};
