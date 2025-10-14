import React, { useEffect, useMemo, useCallback } from 'react';
import type { DependencyList } from 'react';
import type { Result, AsyncResult } from '../types/fp';
import { useAsync } from './useAsync';
import { ok, err } from 'neverthrow';
import type { AppError, NetworkError } from '../types/errors';
import { createBusinessLogicError, createNetworkError } from '../types/errors';

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

const globalFetchCache = new Map<string, CacheEntry<any>>();

// Migrate old cache entries on module initialization
for (const [key, entry] of globalFetchCache) {
  if (entry.version === undefined || entry.version !== CACHE_VERSION) {
    globalFetchCache.delete(key);
  }
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
  transformResponse?: (data: any) => any;
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
 * Hook for making HTTP requests with Result-based error handling
 *
 * Provides automatic error handling, retry logic, and transformation
 * using railway-oriented programming patterns.
 */
export function useFetch<T = any>(
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
        let timeoutId: NodeJS.Timeout | undefined;
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
            const isRetryable = retryOnNetworkError &&
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
          let data: any;

          if (contentType?.includes('application/json')) {
            data = await response.json();
          } else {
            data = await response.text();
          }

          // Transform response if needed
          const transformedData = transformResponse ? transformResponse(data) : data;

          return ok(transformedData);

        } catch (error) {
          const isNetworkError = error instanceof TypeError ||
                                (error instanceof Error && error.name === 'AbortError');

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
              cause: error instanceof Error ? error : undefined
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
 * Hook for optimistic updates with Result-based API
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
  const lastStableResult = React.useRef<Result<T, AppError> | null>(
    initialData !== undefined ? ok(initialData) : null
  );

  React.useEffect(() => {
    if (fetchState.result?.isOk()) {
      lastStableResult.current = fetchState.result;
      if (!isOptimistic) {
        setOptimisticResult(null);
      }
    }
  }, [fetchState.result, isOptimistic]);

  const applyOptimisticUpdate = React.useCallback((): Result<T, AppError> => {
    if (!optimisticUpdate) {
      return err(createBusinessLogicError('No optimistic update handler provided'));
    }

    const baseResult = (isOptimistic && optimisticResult) || fetchState.result || lastStableResult.current;
    const currentValue = baseResult?.isOk() ? baseResult.value : initialData ?? null;

    const updateResult = optimisticUpdate(currentValue);

    if (updateResult.isOk()) {
      setOptimisticResult(updateResult);
      setIsOptimistic(true);
    } else {
      setOptimisticResult(updateResult);
      setIsOptimistic(false);
    }

    return updateResult;
  }, [optimisticUpdate, isOptimistic, optimisticResult, fetchState.result, initialData]);

  const handleRollback = React.useCallback((error: AppError) => {
    if (!optimisticResult?.isOk()) {
      return;
    }

    let rollbackResult: Result<T, AppError>;
    if (rollbackUpdate) {
      rollbackResult = rollbackUpdate(optimisticResult.value, error);
    } else {
      rollbackResult = lastStableResult.current ?? err(error);
    }

    setOptimisticResult(rollbackResult);
    if (rollbackResult.isOk()) {
      lastStableResult.current = rollbackResult;
    }
    setIsOptimistic(false);
  }, [optimisticResult, rollbackUpdate]);

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
    return fetchState.result ?? optimisticResult ?? lastStableResult.current;
  }, [isOptimistic, optimisticResult, fetchState.result]);

  return {
    ...fetchState,
    data: activeResult?.isOk() ? activeResult.value : fetchState.data,
    error: activeResult?.isErr() ? activeResult.error : fetchState.error,
    result: activeResult ?? fetchState.result,
    applyOptimisticUpdate,
    isOptimistic,
  };
}

/**
 * Hook for cached fetch operations
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
  const isCacheValid = cachedEntry && (now - cachedEntry.timestamp) < cacheTime;
  const isCacheStale = cachedEntry && staleTime > 0 && (now - cachedEntry.timestamp) > staleTime;
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
      setCacheVersion((version) => version + 1);
    }
  }, [fetchState.loading, fetchState.result, cacheKey]);

  const activeResult = shouldUseCache && cachedEntry ? cachedEntry.result : fetchState.result;
  const data = activeResult?.isOk()
    ? activeResult.value
    : fetchState.result?.isOk()
      ? fetchState.result.value
      : null;
  const error = activeResult?.isErr()
    ? activeResult.error
    : fetchState.result?.isErr()
      ? fetchState.result.error
      : fetchState.error;
  const loading = fetchState.loading && (!shouldUseCache || isCacheStale);

  const refetch = useCallback((): AsyncResult<T, AppError> => {
    if (globalFetchCache.has(cacheKey)) {
      globalFetchCache.delete(cacheKey);
      setCacheVersion((version) => version + 1);
    }
    return fetchState.refetch();
  }, [cacheKey, fetchState.refetch]);

  React.useEffect(() => {
    if (refetchOnWindowFocus) {
      const handleFocus = () => {
        const entry = globalFetchCache.get(cacheKey);
        if (entry && isCacheStale) {
          globalFetchCache.set(cacheKey, { ...entry, isStale: true });
          setCacheVersion((version) => version + 1);
          refetch();
        }
      };
      window.addEventListener('focus', handleFocus);
      return () => window.removeEventListener('focus', handleFocus);
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
