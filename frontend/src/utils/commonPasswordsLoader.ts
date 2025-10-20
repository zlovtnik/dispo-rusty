/**
 * Common Passwords Loader
 *
 * Loads common passwords list from external sources with caching and fallback support.
 * This allows the password list to be updated without code changes.
 */

import type { CommonPasswordsConfig } from '@/config/commonPasswords';
import {
  COMMON_PASSWORDS_FALLBACK,
  DEFAULT_COMMON_PASSWORDS_CONFIG,
} from '@/config/commonPasswords';
import { _getEnv } from '@/config/env';
import { testLogger } from '@/test-utils/logger';

interface PasswordListResponse {
  version: string;
  description: string;
  lastUpdated: string;
  source: string;
  passwords: string[];
}

interface CachedPasswordList {
  passwords: readonly string[];
  loadedAt: number;
  expiresAt: number;
  source: string;
  version?: string;
}

/**
 * Common passwords loader with caching and fallback
 */
export class CommonPasswordsLoader {
  private static instance: CommonPasswordsLoader | null = null;
  private cachedList: CachedPasswordList | null = null;
  private loadingPromise: Promise<readonly string[]> | null = null;

  private constructor(private readonly config: CommonPasswordsConfig) {}

  /**
   * Validate configuration values
   */
  private static validateConfig(config: CommonPasswordsConfig): void {
    if (config.maxCacheEntries !== undefined) {
      if (!Number.isInteger(config.maxCacheEntries) || config.maxCacheEntries < 1) {
        throw new Error(
          `Invalid maxCacheEntries: must be a positive integer, got ${String(config.maxCacheEntries)}`
        );
      }
    }
    if (config.cacheTtlMs < 0) {
      throw new Error(`Invalid cacheTtlMs: must be non-negative, got ${String(config.cacheTtlMs)}`);
    }
    if (config.requestTimeoutMs < 0) {
      throw new Error(
        `Invalid requestTimeoutMs: must be non-negative, got ${String(config.requestTimeoutMs)}`
      );
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<CommonPasswordsConfig>): CommonPasswordsLoader {
    if (!CommonPasswordsLoader.instance) {
      const finalConfig = {
        ...DEFAULT_COMMON_PASSWORDS_CONFIG,
        ...config,
      };
      CommonPasswordsLoader.validateConfig(finalConfig);
      CommonPasswordsLoader.instance = new CommonPasswordsLoader(finalConfig);
    } else if (config) {
      // Reconfigure existing instance by merging configs
      const currentConfig = CommonPasswordsLoader.instance.config;
      const newConfig = { ...currentConfig, ...config };
      CommonPasswordsLoader.validateConfig(newConfig);
      CommonPasswordsLoader.instance = new CommonPasswordsLoader(newConfig);
      // Invalidate cached state
      CommonPasswordsLoader.instance.cachedList = null;
      CommonPasswordsLoader.instance.loadingPromise = null;
    }
    return CommonPasswordsLoader.instance;
  }

  /**
   * Get the common passwords list
   * Loads from cache, external source, or falls back to built-in list
   */
  async getCommonPasswords(): Promise<readonly string[]> {
    // Return cached list if still valid
    if (this.cachedList && this.cachedList.expiresAt > Date.now()) {
      return this.cachedList.passwords;
    }

    // Return in-flight request if one exists
    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    // Start loading
    this.loadingPromise = this.loadPasswords();

    try {
      const passwords = await this.loadingPromise;
      return passwords;
    } finally {
      this.loadingPromise = null;
    }
  }

  /**
   * Force reload the password list (bypasses cache)
   */
  async reload(): Promise<readonly string[]> {
    this.cachedList = null;
    this.loadingPromise = null;
    return this.getCommonPasswords();
  }

  /**
   * Get cache status for debugging
   */
  getCacheStatus(): {
    hasCache: boolean;
    isExpired: boolean;
    source?: string;
    version?: string;
  } | null {
    if (!this.cachedList) {
      return null;
    }

    return {
      hasCache: true,
      isExpired: this.cachedList.expiresAt <= Date.now(),
      source: this.cachedList.source,
      version: this.cachedList.version,
    };
  }

  /**
   * Get the maximum number of cache entries allowed
   * Centralized to ensure consistent behavior across the codebase
   */
  private getMaxCacheEntries(): number {
    return this.config.maxCacheEntries ?? 10000;
  }

  private async loadPasswords(): Promise<readonly string[]> {
    if (!this.config.enabled) {
      testLogger.debug('[CommonPasswordsLoader] Loading disabled, using fallback');
      return COMMON_PASSWORDS_FALLBACK;
    }

    if (!this.config.filePath) {
      testLogger.debug('[CommonPasswordsLoader] No file path configured, using fallback');
      return COMMON_PASSWORDS_FALLBACK;
    }

    try {
      const response = await this.fetchPasswordList();
      const passwordList = this.validateAndNormalizeResponse(response);

      // Cache the result
      this.cachedList = {
        passwords: Object.freeze(passwordList),
        loadedAt: Date.now(),
        expiresAt: Date.now() + this.config.cacheTtlMs,
        source: this.config.filePath,
        version: response.version,
      };

      testLogger.info(
        `[CommonPasswordsLoader] Loaded ${passwordList.length} passwords from ${this.config.filePath}`
      );
      return this.cachedList.passwords;
    } catch (error) {
      testLogger.warn(
        `[CommonPasswordsLoader] Failed to load passwords from ${this.config.filePath}, using fallback:`,
        error
      );

      // Cache fallback with shorter TTL, applying maxCacheEntries limit
      const maxEntries = this.getMaxCacheEntries();
      const truncatedFallback =
        maxEntries > 0 && COMMON_PASSWORDS_FALLBACK.length > maxEntries
          ? COMMON_PASSWORDS_FALLBACK.slice(0, maxEntries)
          : COMMON_PASSWORDS_FALLBACK;

      this.cachedList = {
        passwords: Object.freeze(truncatedFallback),
        loadedAt: Date.now(),
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
        source: 'fallback',
      };

      return this.cachedList.passwords;
    }
  }

  private async fetchPasswordList(): Promise<PasswordListResponse> {
    if (!this.config.filePath) {
      throw new Error('File path not configured');
    }

    // Resolve URL: use absolute URLs as-is, or resolve relative paths against the appropriate base URL.
    // For SSR (server-side rendering), we use the configured ssrBaseUrl or environment variable SSR_BASE_URL
    // to construct the full URL. Defaults to the configured ssrBaseUrl (e.g., http://localhost:5173).
    const ssrBase =
      this.config.ssrBaseUrl ??
      (typeof process !== 'undefined' ? process.env?.SSR_BASE_URL : undefined) ??
      'http://localhost:5173';

    const url = this.config.filePath.startsWith('http')
      ? this.config.filePath
      : new URL(
          this.config.filePath,
          typeof window !== 'undefined' ? window.location.origin : ssrBase
        ).toString();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.config.requestTimeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private validateAndNormalizeResponse(response: any): string[] {
    if (!response || typeof response !== 'object') {
      throw new Error('Invalid response format: expected object');
    }

    if (!Array.isArray(response.passwords)) {
      throw new Error('Invalid response format: passwords must be an array');
    }

    // Validate and normalize passwords
    const passwords: string[] = [];
    for (const password of response.passwords) {
      if (typeof password === 'string' && password.trim()) {
        passwords.push(password.trim().toLowerCase());
      }
    }

    if (passwords.length === 0) {
      throw new Error('No valid passwords found in response');
    }

    // Remove duplicates
    const uniquePasswords = [...new Set(passwords)];

    // Enforce maxCacheEntries limit (count-based eviction)
    const maxEntries = this.getMaxCacheEntries();
    if (maxEntries > 0 && uniquePasswords.length > maxEntries) {
      testLogger.warn(
        `[CommonPasswordsLoader] Password list (${uniquePasswords.length}) exceeds maxCacheEntries (${maxEntries}). ` +
          `Truncating to limit cache memory growth.`
      );
      return uniquePasswords.slice(0, maxEntries);
    }

    return uniquePasswords;
  }

  /**
   * Reset loader for testing
   */
  static __resetForTests(): void {
    CommonPasswordsLoader.instance = null;
  }
}

/**
 * Get common passwords list (convenience function)
 */
export async function getCommonPasswords(): Promise<readonly string[]> {
  const loader = CommonPasswordsLoader.getInstance();
  return loader.getCommonPasswords();
}
