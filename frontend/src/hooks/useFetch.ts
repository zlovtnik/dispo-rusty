import React, { useEffect, useMemo, useCallback } from 'react';
import type { DependencyList } from 'react';
import type { Result, AsyncResult } from '../types/fp';
import { useAsync } from './useAsync';
import { ok, err } from 'neverthrow';
import type { AppError, NetworkError } from '../types/errors';
import { createBusinessLogicError, createNetworkError } from '../types/errors';
import type { z } from 'zod';

/**
 * Module-level cache for useCachedFetch to persist across component lifecycles
 *
 * Note: For production applications, consider using:
 * - React Query (TanStack Query) for more sophisticated caching
 * - SWR for stale-while-revalidate caching strategy
 * - A context provider for app-wide cache management
 */
interface CacheEntry<T> {
  result: Result<T, AppError>;
  timestamp: number;
  isStale: boolean;
  version?: number;
}

const CACHE_VERSION = 1;

const globalFetchCache = new Map<string, CacheEntry<unknown>>();

// Module-scoped flag to ensure cache migration runs only once per session
let cacheMigrated = false;

// Migrate old cache entries on first module import (runs once per session)
// This migration can be removed when all clients have upgraded past CACHE_VERSION
if (!cacheMigrated) {
  for (const [key, entry] of globalFetchCache) {
    if (entry.version === undefined || entry.version !== CACHE_VERSION) {
      globalFetchCache.delete(key);
    }
  }
  cacheMigrated = true;
}

/**
 * Configuration options for fetch operations
 */
export interface FetchOptions extends RequestInit {
  /** Timeout in milliseconds */
  timeout?: number;
  /** Number of retries on failure */
  retries?: number;
  /** Delay between retries (ms) */
  retryDelay?: number;
  /** Whether to automatically retry on network errors */
  retryOnNetworkError?: boolean;
  /** Base URL to prepend to the endpoint */
  baseURL?: string;
  /** Transform response data before returning */
  transformResponse?: <T>(data: unknown) => T;
  /** Validate transformed response data (Zod schema) */
  validateResponse?: z.ZodSchema;
  /** Transform error before returning */
  transformError?: (error: AppError) => AppError;
  /** When true, the request will only run when refetch is called */
  manual?: boolean;
}

/**
 * State of a fetch operation
 */
export interface FetchState<T> {
  /** The fetched data */
  data: T | null;
  /** Whether data is currently being fetched */
  loading: boolean;
  /** Any error that occurred during fetching */
  error: AppError | null;
  /** Whether the operation is retrying */
  retrying: boolean;
  /** Refetch function */
  refetch: () => AsyncResult<T, AppError>;
  /** Latest Result<T, AppError> emitted by the hook */
  result: Result<T, AppError> | null;
}

/**
 * Hook for making HTTP requests with Result-based error handling.
 *
 * Provides automatic error handling, retry logic, and payload transformation using
 * railway-oriented programming patterns.
 *
 * @template T The expected response data type
 * @param url URL to fetch (pass `null` to pause requests)
 * @param options Optional configuration including retries, timeout, and transformers
 * @returns Fetch state with data, loading, error flags, and a refetch trigger
 * @example
 * ```typescript
 * const { data, loading, error, refetch } = useFetch<ContactDTO[]>(
 *   '/contacts',
 *   { baseURL: apiBase }
 * );
 *
 * useEffect(() => {
 *   if (!loading && error) {
 *     notification.error({ message: error.message });
 *   }
 * }, [loading, error]);
 * ```
 */
export function useFetch<T = unknown>(
  url: string | null,
  options: FetchOptions = {}
): FetchState<T> {
  // Destructure options for stable dependencies
  const {
    timeout = 10000,
    retries = 3,
    retryDelay = 1000,
    retryOnNetworkError = true,
    baseURL,
    transformResponse,
    validateResponse,
    transformError,
    manual = false,
    ...fetchOptions
  } = options;

  // Enhanced fetch function with error handling and retry logic
  const fetchData = useMemo(() => {
    if (!url) {
      return () => Promise.resolve(err(createNetworkError('No URL provided')));
    }

    return async (): Promise<Result<T, AppError>> => {
      const fullUrl = baseURL ? `${baseURL}${url}` : url;

      for (let attempt = 0; attempt <= retries; attempt++) {
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        try {
          // Create AbortController for timeout and cancellation
          const controller = new AbortController();

          // Set up timeout
          timeoutId = setTimeout(() => {
            controller.abort();
          }, timeout);

          const response = await fetch(fullUrl, {
            ...fetchOptions,
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            const isRetryable =
              retryOnNetworkError &&
              attempt < retries &&
              (response.status >= 500 || response.status === 408 || response.status === 429);

            if (isRetryable) {
              // Wait before retry
              await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, attempt)));
              continue;
            }

            const error = createNetworkError(
              `Request failed with status ${response.status}`,
              { statusCode: response.status },
              { retryable: isRetryable }
            );
            return err(transformError ? transformError(error) : error);
          }

          // Parse response
          const contentType = response.headers.get('content-type');
          let data: unknown;

          if (contentType?.includes('application/json')) {
            data = (await response.json()) as unknown;
          } else {
            data = await response.text();
          }

          // Transform response if needed
          const transformedData: T = transformResponse ? transformResponse<T>(data) : (data as T);

          // Validate transformed data if schema provided
          if (validateResponse) {
            const validationResult = validateResponse.safeParse(transformedData);
            if (!validationResult.success) {
              return err(createBusinessLogicError(
                `Response validation failed: ${validationResult.error.message}`,
                { validationErrors: validationResult.error.issues }
              ));
            }
          }

          return ok(transformedData);
        } catch (error) {
          const isAbort =
            (typeof DOMException !== 'undefined' &&
              error instanceof DOMException &&
              error.name === 'AbortError') ||
            (error instanceof Error && error.name === 'AbortError');
          const isTypeErr = error instanceof TypeError;
          const isNetworkError = isAbort || isTypeErr;

          if (isNetworkError && retryOnNetworkError && attempt < retries) {
            // Exponential backoff for network errors
            await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, attempt)));
            continue;
          }

          // Create appropriate error
          const netError = createNetworkError(
            error instanceof Error ? error.message : 'Network request failed',
            undefined,
            {
              retryable: isNetworkError && retryOnNetworkError,
              cause: error instanceof Error ? error : undefined,
            }
          );

          return err(transformError ? transformError(netError) : netError);
        } finally {
          // Always clear timeout
          if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
          }
        }
      }

      // Should never reach here, but TypeScript requires it
      return err(createNetworkError('Max retries exceeded'));
    };
  }, [
    url,
    timeout,
    retries,
    retryDelay,
    retryOnNetworkError,
    baseURL,
    transformResponse,
    validateResponse,
    transformError,
    // Use JSON.stringify for complex fetchOptions to detect changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(fetchOptions),
  ]);

  const dependencies: DependencyList = manual ? [] : url ? [url] : [];
  const asyncState = useAsync<T, AppError>(fetchData, dependencies);

  // Note: useFetch returns Result<T, AppError> via asyncState.result for FP patterns
  // For consumers needing ApiResponseWrapper, wrap at the service boundary
  return {
    data: asyncState.result?.isOk() ? asyncState.result.value : null,
    loading: asyncState.loading,
    error: asyncState.result?.isErr() ? asyncState.result.error : null,
    retrying: false, // Would need more complex state management for this
    refetch: asyncState.execute,
    result: asyncState.result,
  };
}

/**
 * Adds optimistic update helpers on top of `useFetch` for latency-sensitive flows.
 *
 * @template T Response data type
 * @param url URL to fetch (pass `null` to disable)
 * @param options Fetch options plus optimistic configuration
 * @returns Fetch state extended with optimistic helpers
 * @example
 * ```typescript
 * const fetchState = useOptimisticFetch<ContactDTO[]>('/contacts', {
 *   baseURL: apiBase,
 *   optimisticUpdate: current => ok([newContact, ...(current ?? [])]),
 *   rollbackUpdate: (_optimistic, error) => err(error),
 * });
 *
 * const handleCreate = async () => {
 *   const optimistic = fetchState.applyOptimisticUpdate();
 *   if (optimistic.isOk()) {
 *     await createContact(optimistic.value[0]);
 *     await fetchState.refetch();
 *   }
 * };
 * ```
 */
export function useOptimisticFetch<T>(
  url: string | null,
  options: FetchOptions & {
    /** Initial data to show while loading */
    initialData?: T;
    /** Function to update data optimistically before the request */
    optimisticUpdate?: (currentData: T | null) => Result<T, AppError>;
    /** Function to rollback optimistic update on error */
    rollbackUpdate?: (optimisticData: T, error: AppError) => Result<T, AppError>;
  } = {}
) {
  const fetchState = useFetch<T>(url, options);
  const { initialData, optimisticUpdate, rollbackUpdate } = options;

  const [optimisticResult, setOptimisticResult] = React.useState<Result<T, AppError> | null>(
    initialData !== undefined ? ok(initialData) : null
  );
  const [isOptimistic, setIsOptimistic] = React.useState(false);
  const [lastStableResult, setLastStableResult] = React.useState<Result<T, AppError> | null>(
    initialData !== undefined ? ok(initialData) : null
  );

  const optimisticResultRef = React.useRef<Result<T, AppError> | null>(optimisticResult);
  const lastStableResultRef = React.useRef<Result<T, AppError> | null>(lastStableResult);
  const fetchResultRef = React.useRef<Result<T, AppError> | null>(fetchState.result ?? null);
  const initialDataRef = React.useRef<T | undefined>(initialData);
  const optimisticUpdateRef = React.useRef<typeof optimisticUpdate>(optimisticUpdate);
  const isOptimisticRef = React.useRef<boolean>(isOptimistic);

  React.useEffect(() => {
    optimisticResultRef.current = optimisticResult;
  }, [optimisticResult]);

  React.useEffect(() => {
    lastStableResultRef.current = lastStableResult;
  }, [lastStableResult]);

  React.useEffect(() => {
    fetchResultRef.current = fetchState.result ?? null;
  }, [fetchState.result]);

  React.useEffect(() => {
    initialDataRef.current = initialData;
  }, [initialData]);

  React.useEffect(() => {
    optimisticUpdateRef.current = optimisticUpdate;
  }, [optimisticUpdate]);

  React.useEffect(() => {
    isOptimisticRef.current = isOptimistic;
  }, [isOptimistic]);

  React.useEffect(() => {
    if (fetchState.result?.isOk()) {
      setLastStableResult(fetchState.result);
      if (!isOptimistic) {
        setOptimisticResult(null);
      }
    }
  }, [fetchState.result, isOptimistic]);

  const applyOptimisticUpdate = React.useCallback((): Result<T, AppError> => {
    const updateFn = optimisticUpdateRef.current;
    if (!updateFn) {
      return err(createBusinessLogicError('No optimistic update handler provided'));
    }

    // Derive baseResult: use optimistic result when isOptimistic is true, otherwise use fetch or stable result
    // Precedence: 1. if isOptimistic use optimisticResult, 2. otherwise prefer latest server fetchState.result, 3. fallback to lastStableResult
    const baseResult =
      (isOptimisticRef.current && optimisticResultRef.current
        ? optimisticResultRef.current
        : fetchResultRef.current) ?? lastStableResultRef.current;

    // Compute currentValue from baseResult if it's ok, falling back to initialData or null
    const currentValue = baseResult?.isOk() ? baseResult.value : (initialDataRef.current ?? null);

    const updateResult = updateFn(currentValue);

    // Always set the optimistic result
    setOptimisticResult(updateResult);

    // Only set isOptimistic to true when update succeeds, leave unchanged on error
    if (updateResult.isOk()) {
      setIsOptimistic(true);
    }

    return updateResult;
  }, []);

  const handleRollback = React.useCallback(
    (error: AppError) => {
      if (!optimisticResult?.isOk()) {
        return;
      }

      let rollbackResult: Result<T, AppError>;
      if (rollbackUpdate) {
        rollbackResult = rollbackUpdate(optimisticResult.value, error);
      } else {
        rollbackResult = lastStableResult ?? err(error);
      }

      setOptimisticResult(rollbackResult);
      if (rollbackResult.isOk()) {
        setLastStableResult(rollbackResult);
      }
      setIsOptimistic(false);
    },
    [optimisticResult, rollbackUpdate, lastStableResult]
  );

  React.useEffect(() => {
    if (!isOptimistic) {
      return;
    }

    if (fetchState.result?.isOk()) {
      setIsOptimistic(false);
      setOptimisticResult(null);
      return;
    }

    if (fetchState.error) {
      handleRollback(fetchState.error);
    }
  }, [isOptimistic, fetchState.error, fetchState.result, handleRollback]);

  const activeResult = useMemo(() => {
    if (isOptimistic && optimisticResult) {
      return optimisticResult;
    }
    return fetchState.result ?? optimisticResult ?? lastStableResult;
  }, [isOptimistic, optimisticResult, fetchState.result, lastStableResult]);

  // Consolidate data/error derivation from a single source of truth
  const result = activeResult ?? fetchState.result ?? null;
  const data = result?.isOk() ? result.value : null;
  const error = result?.isErr() ? result.error : (fetchState.error ?? null);

  return {
    ...fetchState,
    data,
    error,
    result: activeResult ?? fetchState.result,
    applyOptimisticUpdate,
    isOptimistic,
  };
}

/**
 * Provides caching semantics for fetch operations with stale-time awareness.
 *
 * @template T Response data type
 * @param url URL to fetch (pass `null` to disable)
 * @param options Fetch options plus cache configuration
 * @returns Fetch state whose data is hydrated from cache when available
 * @example
 * ```typescript
 * const tenants = useCachedFetch<PaginatedTenantResponse>('/tenants', {
 *   baseURL: apiBase,
 *   cacheKey: 'tenants:list',
 *   cacheTime: CacheTTL.MEDIUM,
 * });
 *
 * useEffect(() => {
 *   tenants.refetch();
 * }, [tenants.refetch]);
 * ```
 */
export function useCachedFetch<T>(
  url: string | null,
  options: FetchOptions & {
    /** Cache key */
    cacheKey?: string;
    /** Cache duration in milliseconds */
    cacheTime?: number;
    /** Whether to refetch in background */
    refetchOnWindowFocus?: boolean;
    /** Stale time before considering data stale */
    staleTime?: number;
  } = {}
) {
  const {
    cacheKey = url || '',
    cacheTime = 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus = false,
    staleTime = 0,
    ...fetchOptions
  } = options;

  const [cacheVersion, setCacheVersion] = React.useState(0);

  const cachedEntry = globalFetchCache.get(cacheKey) as CacheEntry<T> | undefined;
  const now = Date.now();
  const isCacheValid = cachedEntry && now - cachedEntry.timestamp < cacheTime;
  const isCacheStale = cachedEntry && staleTime > 0 && now - cachedEntry.timestamp > staleTime;
  const shouldUseCache = isCacheValid && !isCacheStale;

  const fetchState = useFetch<T>(url, {
    ...fetchOptions,
    manual: shouldUseCache && !isCacheStale,
  });

  React.useEffect(() => {
    if (!fetchState.loading && fetchState.result) {
      globalFetchCache.set(cacheKey, {
        result: fetchState.result,
        timestamp: Date.now(),
        isStale: false,
        version: CACHE_VERSION,
      });
      setCacheVersion(version => version + 1);
    }
  }, [fetchState.loading, fetchState.result, cacheKey]);

  const activeResult = shouldUseCache && cachedEntry ? cachedEntry.result : fetchState.result;

  // Derive data: check activeResult first, then fetchState.result, then null
  let data: T | null = null;
  if (activeResult?.isOk()) {
    data = activeResult.value;
  } else if (fetchState.result?.isOk()) {
    data = fetchState.result.value;
  }

  // Derive error: check activeResult first, then fetchState.result, then fetchState.error
  let error: AppError | null = null;
  if (activeResult?.isErr()) {
    error = activeResult.error;
  } else if (fetchState.result?.isErr()) {
    error = fetchState.result.error;
  } else if (fetchState.error) {
    error = fetchState.error;
  }

  const loading = fetchState.loading && (!shouldUseCache || isCacheStale);

  const refetch = useCallback((): AsyncResult<T, AppError> => {
    if (globalFetchCache.has(cacheKey)) {
      globalFetchCache.delete(cacheKey);
      setCacheVersion(version => version + 1);
    }
    return fetchState.refetch();
  }, [cacheKey, fetchState.refetch]);

  React.useEffect(() => {
    if (refetchOnWindowFocus) {
      const handleFocus = () => {
        const entry = globalFetchCache.get(cacheKey);
        if (entry && isCacheStale) {
          globalFetchCache.set(cacheKey, { ...entry, isStale: true });
          setCacheVersion(version => version + 1);
          refetch();
        }
      };
      window.addEventListener('focus', handleFocus);
      return () => {
        window.removeEventListener('focus', handleFocus);
      };
    }
  }, [refetchOnWindowFocus, cacheKey, isCacheStale, refetch]);

  return {
    ...fetchState,
    data,
    error,
    result: activeResult ?? fetchState.result,
    loading,
    refetch,
    isCached: shouldUseCache,
    isStale: isCacheStale,
  };
}
