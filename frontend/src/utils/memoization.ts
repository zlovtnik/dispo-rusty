/**
 * Memoization utilities for pure functions
 *
 * Provides memoization strategies for FP patterns including:
 * - Simple memoization for pure functions
 * - Result-based memoization for Result-returning functions
 * - TTL-based memoization with expiration
 * - N-ary function memoization
 *
 * @module utils/memoization
 */

import type { Result, AsyncResult } from '@/types/fp';
import type { AppError } from '@/types/errors';

/**
 * Memoization cache key generator
 */
export type KeyGenerator<T extends unknown[]> = (...args: T) => string;

/**
 * Simple memoization cache for sync functions
 */
interface MemoCache<T> {
  value: T;
  timestamp: number;
}

/**
 * Memoized function with clear method
 */
export interface MemoizedFunction<T extends unknown[], R> {
  (...args: T): R;
  clear(): void;
}

/**
 * Async memoized function with clear method
 */
export interface MemoizedAsyncFunction<T extends unknown[], R, E> {
  (...args: T): Promise<Result<R, E>>;
  clear(): void;
}

/**
 * Memoize a pure synchronous function with optional TTL
 *
 * @param fn - Pure function to memoize
 * @param options - Memoization options
 * @returns Memoized version of the function
 *
 * @example
 * ```typescript
 * // Simple memoization
 * const expensiveCalculation = memoize((n: number) => {
 *   return fibonacci(n);
 * });
 *
 * const result1 = expensiveCalculation(10); // Calculated
 * const result2 = expensiveCalculation(10); // From cache
 *
 * // With custom key generator
 * const memoizedValidator = memoize(
 *   validateEmail,
 *   {
 *     keyGenerator: (email) => email.toLowerCase(),
 *     ttl: 5 * 60 * 1000 // 5 minutes
 *   }
 * );
 * ```
 */
export function memoize<T extends unknown[], R>(
  fn: (...args: T) => R,
  options?: {
    keyGenerator?: KeyGenerator<T>;
    ttl?: number;
    maxSize?: number;
  }
): MemoizedFunction<T, R> {
  const cache = new Map<string, MemoCache<R>>();
  const {
    keyGenerator = (...args: T) => JSON.stringify(args),
    ttl = undefined,
    maxSize = 128,
  } = options ?? {};

  const memoized = (...args: T): R => {
    const key = keyGenerator(...args);
    const cached = cache.get(key);

    // Check if cache entry exists and is not expired
    if (cached) {
      if (!ttl || Date.now() - cached.timestamp < ttl) {
        // Move to end for LRU (delete and re-add to update position)
        cache.delete(key);
        cache.set(key, cached);
        return cached.value;
      }
      // Cache expired, remove it
      cache.delete(key);
    }

    // Compute and cache the result
    const value = fn(...args);

    // Enforce cache size limit with LRU eviction
    if (cache.size >= maxSize) {
      // Remove least recently used (oldest insertion)
      const firstKey = cache.keys().next().value;
      if (firstKey) {
        cache.delete(firstKey);
      }
    }

    cache.set(key, {
      value,
      timestamp: Date.now(),
    });

    return value;
  };

  memoized.clear = () => {
    cache.clear();
  };

  return memoized;
}

/**
 * Memoize a Result-returning function
 *
 * Caches both Ok and Err results separately.
 *
 * @param fn - Pure function returning Result<T, E>
 * @param options - Memoization options
 * @returns Memoized version of the function
 *
 * @example
 * ```typescript
 * const memoizedValidator = memoizeResult(
 *   (email: string) => validateEmail(email),
 *   {
 *     keyGenerator: (email) => email.toLowerCase(),
 *     ttl: 10 * 60 * 1000 // Cache for 10 minutes
 *   }
 * );
 *
 * const result1 = memoizedValidator('user@example.com'); // Validated and cached
 * const result2 = memoizedValidator('user@example.com'); // From cache
 * ```
 */
export function memoizeResult<T extends unknown[], R, E>(
  fn: (...args: T) => Result<R, E>,
  options?: {
    keyGenerator?: KeyGenerator<T>;
    ttl?: number;
    maxSize?: number;
  }
): MemoizedFunction<T, Result<R, E>> {
  return memoize(fn, options);
}

/**
 * Memoize an async Result-returning function
 *
 * Caches AsyncResult computations to avoid redundant async operations.
 *
 * @param fn - Function returning AsyncResult<T, E>
 * @param options - Memoization options
 * @returns Memoized version of the function
 *
 * @example
 * ```typescript
 * const memoizedFetch = memoizeAsync(
 *   async (userId: string) => authService.getUser(userId),
 *   {
 *     keyGenerator: (userId) => `user-${userId}`,
 *     ttl: 5 * 60 * 1000 // Cache for 5 minutes
 *   }
 * );
 *
 * const result1 = await memoizedFetch('user123'); // Fetched and cached
 * const result2 = await memoizedFetch('user123'); // From cache
 * ```
 */
export function memoizeAsync<T extends unknown[], R, E>(
  fn: (...args: T) => AsyncResult<R, E> | Promise<Result<R, E>>,
  options?: {
    keyGenerator?: KeyGenerator<T>;
    ttl?: number;
    maxSize?: number;
  }
): MemoizedAsyncFunction<T, R, E> {
  const cache = new Map<string, { value: Result<R, E>; timestamp: number }>();
  const pending = new Map<string, Promise<Result<R, E>>>();
  const {
    keyGenerator = (...args: T) => JSON.stringify(args),
    ttl = undefined,
    maxSize = 128,
  } = options ?? {};

  const memoized = async (...args: T): Promise<Result<R, E>> => {
    const key = keyGenerator(...args);
    const cached = cache.get(key);

    // Check if cache entry exists and is not expired
    if (cached) {
      if (!ttl || Date.now() - cached.timestamp < ttl) {
        // Move to end for LRU (delete and re-add to update position)
        cache.delete(key);
        cache.set(key, cached);
        return cached.value;
      }
      // Cache expired, remove it
      cache.delete(key);
    }

    // Check if already pending
    const pendingPromise = pending.get(key);
    if (pendingPromise) {
      return pendingPromise;
    }

    // Compute the result
    const promise = Promise.resolve(fn(...args)).finally(() => {
      pending.delete(key);
    });
    pending.set(key, promise);
    const result = await promise;

    // Enforce cache size limit with LRU eviction
    if (cache.size >= maxSize) {
      // Remove least recently used (oldest insertion)
      const firstKey = cache.keys().next().value;
      if (firstKey) {
        cache.delete(firstKey);
      }
    }

    cache.set(key, {
      value: result,
      timestamp: Date.now(),
    });

    return result;
  };

  memoized.clear = () => {
    cache.clear();
    pending.clear();
  };

  return memoized;
}

/**
 * Create a memoized version of a validation function
 *
 * Specialized memoization for validation functions that return Result types.
 * Only caches successful validations by default.
 *
 * @param validator - Validation function returning Result
 * @param options - Memoization options
 * @returns Memoized validation function
 *
 * @example
 * ```typescript
 * const memoizedEmailValidator = memoizeValidator(validateEmail, {
 *   cacheErrors: false, // Only cache successful validations
 *   ttl: 15 * 60 * 1000 // Cache for 15 minutes
 * });
 *
 * const result = memoizedEmailValidator('user@example.com');
 * ```
 */
export function memoizeValidator<T extends unknown[], R, E>(
  validator: (...args: T) => Result<R, E>,
  options?: {
    keyGenerator?: KeyGenerator<T>;
    ttl?: number;
    maxSize?: number;
    cacheErrors?: boolean;
  }
): MemoizedFunction<T, Result<R, E>> {
  const cache = new Map<string, { value: Result<R, E>; timestamp: number }>();
  const {
    keyGenerator = (...args: T) => JSON.stringify(args),
    ttl = 15 * 60 * 1000, // 15 minutes default
    maxSize = 256,
    cacheErrors = false,
  } = options ?? {};

  const memoized = (...args: T): Result<R, E> => {
    const key = keyGenerator(...args);
    const cached = cache.get(key);

    // Check if cache entry exists and is not expired
    if (cached) {
      if (!ttl || Date.now() - cached.timestamp < ttl) {
        // Move to end for LRU (delete and re-add to update position)
        cache.delete(key);
        cache.set(key, cached);
        return cached.value;
      }
      cache.delete(key);
    }

    const result = validator(...args);

    // Only cache if enabled or if result is Ok
    if (cacheErrors || result.isOk()) {
      // Enforce cache size limit with LRU eviction
      if (cache.size >= maxSize) {
        // Remove least recently used (oldest insertion)
        const firstKey = cache.keys().next().value;
        if (firstKey) {
          cache.delete(firstKey);
        }
      }

      cache.set(key, {
        value: result,
        timestamp: Date.now(),
      });
    }

    return result;
  };

  memoized.clear = () => {
    cache.clear();
  };

  return memoized;
}

/**
 * Debounce function to prevent excessive re-computations
 *
 * Delays function execution and cancels pending calls if new calls arrive.
 *
 * @param fn - Function to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced function
 *
 * @example
 * ```typescript
 * const debouncedSearch = debounce((query: string) => {
 *   return searchContacts(query);
 * }, 300);
 *
 * // Only the last call after 300ms of silence will execute
 * debouncedSearch('alice');
 * debouncedSearch('alice smith'); // Previous call cancelled
 * ```
 */
export function debounce<T extends unknown[], R>(
  fn: (...args: T) => R,
  delay: number
): {
  (...args: T): void;
  cancel(): void;
} {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const debounced = (...args: T) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  };

  debounced.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return debounced;
}

/**
 * Throttle function to limit execution frequency
 *
 * Ensures function executes at most once per specified interval.
 *
 * @param fn - Function to throttle
 * @param interval - Minimum interval between calls in milliseconds
 * @returns Throttled function
 *
 * @example
 * ```typescript
 * const throttledScroll = throttle(() => {
 *   updateScrollPosition();
 * }, 100);
 *
 * window.addEventListener('scroll', throttledScroll);
 * // updateScrollPosition called at most once per 100ms
 * ```
 */
export function throttle<T extends unknown[], R>(
  fn: (...args: T) => R,
  interval: number
): (...args: T) => void {
  let lastCallTime = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: T) => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCallTime;

    if (timeSinceLastCall >= interval) {
      // Execute immediately
      lastCallTime = now;
      fn(...args);

      // Cancel pending execution
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    } else if (timeoutId === null) {
      // Schedule execution for later
      const remainingDelay = interval - timeSinceLastCall;
      timeoutId = setTimeout(() => {
        lastCallTime = Date.now();
        fn(...args);
        timeoutId = null;
      }, remainingDelay);
    }
  };
}

/**
 * Clear all memoized results in batch
 *
 * Useful for cache invalidation strategies.
 *
 * @param memoizedFunctions - Array of memoized functions to clear
 *
 * @example
 * ```typescript
 * const memoizedValidators = [
 *   memoizeValidator(validateEmail),
 *   memoizeValidator(validatePhone)
 * ];
 *
 * // Clear all caches after user context changes
 * clearMemoizationCache(memoizedValidators);
 * ```
 */
export function clearMemoizationCache(memoizedFunctions: { clear?: () => void }[]): void {
  memoizedFunctions.forEach(fn => {
    if (typeof fn.clear === 'function') {
      fn.clear();
    }
  });
}
