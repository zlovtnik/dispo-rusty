import React, { useEffect, useMemo, useState, useCallback } from 'react';
import type { Result, AsyncResult } from '../types/fp';
import { useAsync } from './useAsync';
import { ok, err } from 'neverthrow';
import type { AppError, NetworkError } from '../types/errors';
import { createNetworkError } from '../types/errors';

/**
 * Module-level cache for useCachedFetch to persist across component lifecycles
 * 
 * Note: For production applications, consider using:
 * - React Query (TanStack Query) for more sophisticated caching
 * - SWR for stale-while-revalidate caching strategy
 * - A context provider for app-wide cache management
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  isStale: boolean;
}

const globalFetchCache = new Map<string, CacheEntry<any>>();

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
  refetch: () => Promise<Result<T, AppError>>;
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
        try {
          // Create AbortController for timeout and cancellation
          const controller = new AbortController();

          // Set up timeout
          const timeoutId = setTimeout(() => {
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

  const asyncState = useAsync<T, AppError>(fetchData, url ? [url] : []);

  return {
    data: asyncState.result?.isOk() ? asyncState.result.value : null,
    loading: asyncState.loading,
    error: asyncState.result?.isErr() ? asyncState.result.error : null,
    retrying: false, // Would need more complex state management for this
    refetch: asyncState.execute,
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
    optimisticUpdate?: (currentData: T | null) => T;
    /** Function to rollback optimistic update on error */
    rollbackUpdate?: (optimisticData: T, error: AppError) => T;
  } = {}
) {
  const fetchState = useFetch<T>(url, options);
  const { initialData, optimisticUpdate, rollbackUpdate } = options;

  // Optimistic state management
  const [optimisticData, setOptimisticData] = React.useState<T | null>(initialData || null);
  const [isOptimistic, setIsOptimistic] = React.useState(false);

  // Apply optimistic update
  const applyOptimisticUpdate = React.useCallback(() => {
    if (optimisticUpdate && optimisticData !== null) {
      setOptimisticData(optimisticUpdate(optimisticData));
      setIsOptimistic(true);
    }
  }, [optimisticUpdate, optimisticData]);

  // Handle fetch completion - Note: This simulates result checking, full implementation would need access to result
  React.useEffect(() => {
    // In a real implementation, we'd check fetchState.result here
    // For now, this is simplified
    setIsOptimistic(false);
  }, [fetchState.loading]);

  return {
    ...fetchState,
    data: isOptimistic ? optimisticData : fetchState.data,
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

  // Use module-level cache for persistence across component lifecycles
  // Local state only to trigger re-renders when cache is updated
  const [cacheVersion, setCacheVersion] = React.useState(0);

  // Check if cached data is available and fresh
  const cachedEntry = globalFetchCache.get(cacheKey) as CacheEntry<T> | undefined;
  const now = Date.now();
  const isCacheValid = cachedEntry && (now - cachedEntry.timestamp) < cacheTime;
  const isCacheStale = cachedEntry && staleTime > 0 && (now - cachedEntry.timestamp) > staleTime;

  // Use cached data if available and valid
  const shouldUseCache = isCacheValid && !isCacheStale;

  const fetchState = useFetch<T>(shouldUseCache ? null : url, fetchOptions);

  // Update cache when fetch completes successfully
  React.useEffect(() => {
    if (fetchState.data && !fetchState.loading && !fetchState.error) {
      const transformedData = fetchOptions.transformResponse 
        ? fetchOptions.transformResponse(fetchState.data) 
        : fetchState.data;
      
      globalFetchCache.set(cacheKey, {
        data: transformedData,
        timestamp: Date.now(),
        isStale: false
      });
      
      // Trigger re-render
      setCacheVersion(v => v + 1);
    }
  }, [fetchState.data, fetchState.loading, fetchState.error, cacheKey, fetchOptions]);

  // Return cached data if available
  const data = shouldUseCache ? cachedEntry!.data : fetchState.data;
  const loading = fetchState.loading && !shouldUseCache;

  // Handle window focus refetch
  React.useEffect(() => {
    const { refetch } = fetchState;
    if (refetchOnWindowFocus) {
      const handleFocus = () => {
        const entry = globalFetchCache.get(cacheKey);
        if (entry && isCacheStale) {
          // Mark as stale and trigger refetch
          globalFetchCache.set(cacheKey, { ...entry, isStale: true });
          setCacheVersion(v => v + 1);
          refetch();
        }
      };
      window.addEventListener('focus', handleFocus);
      return () => window.removeEventListener('focus', handleFocus);
    }
  }, [refetchOnWindowFocus, cacheKey, isCacheStale, fetchState.refetch]);

  return {
    ...fetchState,
    data,
    loading,
    isCached: shouldUseCache,
    isStale: isCacheStale,
  };
}
