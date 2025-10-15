/**
 * Result-based cache layer for data fetching
 *
 * Provides a simple in-memory cache with TTL (time-to-live) support
 * and Result-based API for FP consistency.
 *
 * @module utils/cache
 */

import { type Result, ok, err } from 'neverthrow';
import type { AppError } from '@/types/errors';
import { createBusinessLogicError } from '@/types/errors';

/**
 * Cache entry with data and expiration metadata
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
  typeTag?: string; // Optional type identifier for runtime type safety
}

/**
 * Cache statistics for monitoring
 */
export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: number;
}

/**
 * Result-based cache implementation
 *
 * Usage:
 * ```typescript
 * const cache = new ResultCache();
 *
 * // Set value with 5 minute TTL
 * cache.set('user-123', userData, 5 * 60 * 1000);
 *
 * // Get value
 * const result = cache.get<User>('user-123');
 * result.match(
 *   (user) => console.log('Cache hit!', user),
 *   (error) => console.log('Cache miss:', error.code)
 * );
 * ```
 */
export class ResultCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private stats = {
    hits: 0,
    misses: 0,
  };

  /**
   * Get value from cache
   *
   * @param key - Cache key
   * @param maxAge - Maximum age in milliseconds (overrides entry TTL)
   * @param typeTag - Optional type identifier for runtime type checking
   * @returns Result with cached data or error
   */
  get<T>(key: string, maxAge?: number, typeTag?: string): Result<T, AppError> {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      this.stats.misses++;
      return err(createBusinessLogicError('Cache miss', undefined, { code: 'CACHE_MISS' }));
    }

    // Validate type tag if provided
    if (typeTag && entry.typeTag && entry.typeTag !== typeTag) {
      this.stats.misses++;
      return err(
        createBusinessLogicError(
          `Type mismatch: expected ${typeTag}, got ${entry.typeTag}`,
          undefined,
          { code: 'CACHE_TYPE_MISMATCH' }
        )
      );
    }

    const now = Date.now();
    const expiresAt = maxAge ? entry.timestamp + maxAge : entry.expiresAt;

    if (now > expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return err(createBusinessLogicError('Cache expired', undefined, { code: 'CACHE_EXPIRED' }));
    }

    this.stats.hits++;
    return ok(entry.data);
  }

  /**
   * Set value in cache with TTL
   *
   * @param key - Cache key
   * @param data - Data to cache
   * @param ttl - Time to live in milliseconds (default: 5 minutes)
   * @param typeTag - Optional type identifier for runtime type safety
   * @returns Result indicating success or failure
   */
  set<T>(
    key: string,
    data: T,
    ttl: number = 5 * 60 * 1000,
    typeTag?: string
  ): Result<void, AppError> {
    try {
      const now = Date.now();
      this.cache.set(key, {
        data,
        timestamp: now,
        expiresAt: now + ttl,
        typeTag,
      });
      return ok(undefined);
    } catch (error) {
      return err(
        createBusinessLogicError(
          'Failed to set cache',
          { error: error instanceof Error ? error.message : String(error) },
          { code: 'CACHE_SET_ERROR' }
        )
      );
    }
  }

  /**
   * Check if key exists and is not expired
   *
   * @param key - Cache key
   * @returns true if key exists and is valid
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    const now = Date.now();
    if (now > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Invalidate (delete) cache entry
   *
   * @param key - Cache key to invalidate
   * @returns Result indicating success
   */
  invalidate(key: string): Result<void, AppError> {
    this.cache.delete(key);
    return ok(undefined);
  }

  /**
   * Invalidate all cache entries matching a pattern
   *
   * @param pattern - RegExp pattern to match keys
   * @returns Result with count of invalidated entries
   */
  invalidatePattern(pattern: RegExp): Result<number, AppError> {
    try {
      let count = 0;
      for (const key of this.cache.keys()) {
        if (pattern.test(key)) {
          this.cache.delete(key);
          count++;
        }
      }
      return ok(count);
    } catch (error) {
      return err(
        createBusinessLogicError(
          'Failed to invalidate pattern',
          { error: error instanceof Error ? error.message : String(error) },
          { code: 'CACHE_INVALIDATE_ERROR' }
        )
      );
    }
  }

  /**
   * Clear entire cache
   *
   * @returns Result indicating success
   */
  clear(): Result<void, AppError> {
    this.cache.clear();
    this.stats.hits = 0;
    this.stats.misses = 0;
    return ok(undefined);
  }

  /**
   * Get cache statistics
   *
   * @returns Cache stats with hit rate
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? this.stats.hits / total : 0;

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      size: this.cache.size,
      hitRate,
    };
  }

  /**
   * Reset cache statistics
   */
  resetStats(): void {
    this.stats.hits = 0;
    this.stats.misses = 0;
  }

  /**
   * Clean up expired entries
   *
   * @returns Result with count of removed entries
   */
  cleanup(): Result<number, AppError> {
    try {
      const now = Date.now();
      let count = 0;

      for (const [key, entry] of this.cache.entries()) {
        if (now > entry.expiresAt) {
          this.cache.delete(key);
          count++;
        }
      }

      return ok(count);
    } catch (error) {
      return err(
        createBusinessLogicError(
          'Failed to cleanup cache',
          { error: error instanceof Error ? error.message : String(error) },
          { code: 'CACHE_CLEANUP_ERROR' }
        )
      );
    }
  }
}

/**
 * Global cache instance
 *
 * Usage:
 * ```typescript
 * import { resultCache } from '@/utils/cache';
 *
 * // Set cache
 * resultCache.set('key', data, 5000);
 *
 * // Get cache
 * const result = resultCache.get<Type>('key');
 * ```
 */
export const resultCache = new ResultCache();

/**
 * Cache key generators
 */
export const CacheKeys = {
  user: (id: string) => `user-${id}`,
  userList: () => 'users-list',
  contact: (id: string) => `contact-${id}`,
  contactList: () => 'contacts-list',
  tenant: (id: string) => `tenant-${id}`,
  auth: () => 'auth-user',
} as const;

/**
 * Default TTL values (in milliseconds)
 */
export const CacheTTL = {
  SHORT: 1 * 60 * 1000, // 1 minute
  MEDIUM: 5 * 60 * 1000, // 5 minutes
  LONG: 15 * 60 * 1000, // 15 minutes
  HOUR: 60 * 60 * 1000, // 1 hour
  DAY: 24 * 60 * 60 * 1000, // 1 day
} as const;

/**
 * Cache decorator for functions
 *
 * Wraps a function to cache its results based on arguments.
 *
 * @param fn - Function to cache
 * @param keyFn - Function to generate cache key from arguments
 * @param ttl - Time to live in milliseconds
 * @returns Cached version of function
 *
 * @example
 * ```typescript
 * const cachedFetchUser = withCache(
 *   fetchUser,
 *   (id) => CacheKeys.user(id),
 *   CacheTTL.MEDIUM
 * );
 *
 * const result = await cachedFetchUser('user-123');
 * ```
 */
export function withCache<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<Result<TResult, AppError>>,
  keyFn: (...args: TArgs) => string,
  ttl: number = CacheTTL.MEDIUM
): (...args: TArgs) => Promise<Result<TResult, AppError>> {
  return async (...args: TArgs) => {
    const key = keyFn(...args);

    // Try cache first
    const cached = resultCache.get<TResult>(key);
    if (cached.isOk()) {
      return cached;
    }

    // Cache miss - execute function
    const result = await fn(...args);

    // Cache successful results
    if (result.isOk()) {
      resultCache.set(key, result.value, ttl);
    }

    return result;
  };
}

/**
 * Invalidate all cache entries for a specific entity type
 *
 * @param entityType - Entity type prefix (e.g., 'user', 'contact')
 * @returns Result with count of invalidated entries or error
 *
 * @example
 * ```typescript
 * // Invalidate all user caches
 * invalidateEntity('user');
 *
 * // Invalidate all contact caches
 * invalidateEntity('contact');
 * ```
 */
export function invalidateEntity(entityType: string): Result<number, AppError> {
  // Sanitize entityType to prevent ReDoS - escape regex metacharacters
  const sanitized = entityType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${sanitized}-`);
  return resultCache.invalidatePattern(pattern);
}

/**
 * Auto-cleanup scheduler
 *
 * Automatically cleans up expired entries at specified interval.
 *
 * @param intervalMs - Cleanup interval in milliseconds (default: 5 minutes)
 * @param onError - Optional callback invoked when cleanup fails
 * @returns Function to stop auto-cleanup
 *
 * @example
 * ```typescript
 * // Start auto-cleanup with error handling
 * const stopCleanup = startAutoCleanup(60000, (error) => {
 *   logErrorToService(error); // Custom error handling
 * });
 *
 * // Later...
 * stopCleanup();
 * ```
 */
export function startAutoCleanup(
  intervalMs: number = 5 * 60 * 1000,
  onError?: (error: unknown) => void
): () => void {
  const intervalId = setInterval(() => {
    try {
      resultCache.cleanup();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Cache cleanup failed:', errorMessage);

      // Invoke optional error callback
      if (onError) {
        onError(error);
      }
    }
  }, intervalMs);

  return () => {
    clearInterval(intervalId);
  };
}
