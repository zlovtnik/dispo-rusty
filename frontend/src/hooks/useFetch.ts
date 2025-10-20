import React, { useEffect, useMemo, useCallback } from 'react';
import type { DependencyList } from 'react';
import type { Result, AsyncResult } from '../types/fp';
import { useAsync } from './useAsync';
import { ok, err } from 'neverthrow';
import type { AppError, NetworkError } from '../types/errors';
import { createBusinessLogicError, createNetworkError } from '../types/errors';
import type { z } from 'zod';
import { SENSITIVE_QUERY_PARAMS } from '../config/sensitiveParams';

/**
 * Safely parses a URL string, handling both absolute and relative URLs
 *
 * @param urlStr - The URL string to parse
 * @returns A parsed URL object
 * @throws Error if the URL cannot be parsed
 */
const parseUrlSafely = (urlStr: string): URL => {
  const input = urlStr.trim();
  // Determine a safe base for parsing relative URLs
  let safeBase = 'http://localhost';
  if (typeof window !== 'undefined' && typeof window.location !== 'undefined') {
    const origin = window.location.origin;
    // Only accept well-formed http(s) origins. Some test environments set
    // origin to non-URL values like the string 'null' which we must ignore.
    if (typeof origin === 'string' && /^https?:\/\//i.test(origin)) {
      safeBase = origin;
    }
  }

  // Try parsing as an absolute URL first
  try {
    return new URL(input);
  } catch (absErr) {
    // If the input looks like an absolute URL (has a scheme), don't try to
    // treat it as relative — it's malformed and should be considered invalid.
    const looksLikeAbsolute = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(input);
    if (looksLikeAbsolute) {
      throw absErr;
    }

    // Otherwise, try building an absolute URL by concatenating the safe
    // base and the relative path. Some test environments may not support
    // the URL(url, base) overload reliably.
    const base = safeBase.replace(/\/$/, '');
    const candidate = input.startsWith('/') ? `${base}${input}` : `${base}/${input}`;
    return new URL(candidate);
  }
};

/**
 * Sanitizes a URL by removing or redacting sensitive query parameters
 * to prevent exposing tokens, sessions, auth keys, etc. in error logs
 *
 * @param urlStr - The URL string to sanitize
 * @returns URL with sensitive query parameters removed/redacted, or just origin+path
 */
export const sanitizeUrlForLogging = (urlStr: string): string => {
  try {
    const parsed = parseUrlSafely(urlStr);
    const sensitiveKeys = SENSITIVE_QUERY_PARAMS;

    // Remove sensitive parameters
    for (const key of sensitiveKeys) {
      if (parsed.searchParams.has(key)) {
        parsed.searchParams.delete(key);
      }
    }

    // Return only pathname + remaining safe query params to avoid leaking origin/protocol
    return parsed.pathname + (parsed.search ? parsed.search : '');
  } catch {
    // If URL parsing fails, return a redacted placeholder
    return 'redacted-url';
  }
};

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

/**
 * Note: In-memory cache has no persistence layer (localStorage/IndexedDB).
 * Cache is cleared on module reload. Versioning exists for future migration
 * if persisted storage is added later.
 */

/**
 * Base configuration options for useFetch hook
 */
interface FetchOptionsBase<T = unknown> extends RequestInit {
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
  /** Transform error before returning */
  transformError?: (error: AppError) => AppError;
  /** When true, the request will only run when refetch is called */
  manual?: boolean;
}

/**
 * Fetch options with transformResponse
 */
interface FetchOptionsWithTransform<T = unknown> extends FetchOptionsBase<T> {
  /** Transform response data before returning */
  transformResponse: (data: unknown) => T;
  /** Validate transformed response data (Zod schema or transform) */
  validateResponse?: z.ZodType<T>;
}

/**
 * Fetch options with validateResponse
 */
interface FetchOptionsWithValidate<T = unknown> extends FetchOptionsBase<T> {
  /** Transform response data before returning */
  transformResponse?: (data: unknown) => T;
  /** Validate transformed response data (Zod schema or transform) */
  validateResponse: z.ZodType<T>;
}

/**
 * Discriminated union type that requires at least one of transformResponse or validateResponse
 * This enforces compile-time type safety instead of runtime checks
 */
export type RequireTransformOrValidate<T = unknown> =
  | FetchOptionsWithTransform<T>
  | FetchOptionsWithValidate<T>;

/**
 * Legacy type alias for backward compatibility
 * @deprecated Use RequireTransformOrValidate<T> instead for better type safety
 */
export type FetchOptions<T = unknown> = RequireTransformOrValidate<T>;

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
 * **IMPORTANT**: For type safety, you MUST provide either `transformResponse` or `validateResponse`
 * in the options. The type system enforces this requirement at compile-time, preventing
 * unsafe blind casting of response data to type T.
 *
 * @template T The expected response data type
 * @param url URL to fetch (pass `null` to pause requests)
 * @param options Optional configuration including retries, timeout, and transformers
 * @returns Fetch state with data, loading, error flags, and a refetch trigger
 * @example
 * ```typescript
 * // Recommended: Use validateResponse with Zod schema for full type safety
 * const { data, loading, error } = useFetch<ContactDTO[]>(
 *   '/contacts',
 *   {
 *     baseURL: apiBase,
 *     validateResponse: ContactDTOArraySchema
 *   }
 * );
 *
 * // Alternative: Use transformResponse for custom transformation
 * const { data } = useFetch<ContactDTO[]>(
 *   '/contacts',
 *   {
 *     baseURL: apiBase,
 *     transformResponse: (data) => data as ContactDTO[]
 *   }
 * );
 * ```
 */
export function useFetch<T = unknown>(
  url: string | null,
  options: RequireTransformOrValidate<T>
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
      const fullUrl = baseURL ? new URL(url, baseURL).toString() : url;

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
              const ra = response.headers.get('retry-after');
              const ms =
                ra && /^\d+$/.test(ra)
                  ? parseInt(ra, 10) * 1000
                  : retryDelay * Math.pow(2, attempt);
              await new Promise(resolve => setTimeout(resolve, ms));
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
          const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
          let data: unknown;

          if (contentType.includes('json')) {
            data = (await response.json()) as unknown;
          } else {
            data = await response.text();
          }

          // Transform response if transformResponse is provided
          let transformedData: T;
          if (transformResponse) {
            transformedData = transformResponse(data);
          } else {
            // If no transformResponse, we'll validate first (if validateResponse exists)
            // or cast as a last resort (with warning already logged above)
            transformedData = data as T;
          }

          // Validate transformed data if schema provided
          // This runs AFTER transformation to validate the final shape
          if (validateResponse) {
            const validationResult = validateResponse.safeParse(transformedData);
            if (!validationResult.success) {
              // Extract validation paths and schema information for better diagnostics
              const validationPaths = validationResult.error.issues.map(issue => ({
                path: issue.path.join('.'),
                code: issue.code,
                message: issue.message,
              }));

              // Determine response shape for diagnostics
              const responseShape =
                typeof transformedData === 'object' && transformedData !== null
                  ? Object.keys(transformedData as Record<string, unknown>)
                  : typeof transformedData;

              return err(
                createBusinessLogicError(
                  `Response validation failed: ${validationResult.error.message}`,
                  {
                    validationPaths,
                    responseShape,
                    // Use sanitized URL to prevent leaking sensitive query parameters
                    url: sanitizeUrlForLogging(fullUrl),
                  }
                )
              );
            }
            // Use validated data from Zod (which ensures type safety)
            transformedData = validationResult.data as T;
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
 * Helper type to extract optimistic-specific options from combined options
 * This allows better separation of concerns and avoids type casting
 */
interface OptimisticProps<T> {
  initialData?: T;
  optimisticUpdate?: (currentData: T | null) => Result<T, AppError>;
  rollbackUpdate?: (optimisticData: T, error: AppError) => Result<T, AppError>;
}

/**
 * Combined options for useOptimisticFetch combining base fetch and optimistic props
 */
type OptimisticFetchOptions<T> = RequireTransformOrValidate<T> & OptimisticProps<T>;

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
export function useOptimisticFetch<T>(url: string | null, options?: OptimisticFetchOptions<T>) {
  // Extract optimistic-specific properties from the combined options
  const { initialData, optimisticUpdate, rollbackUpdate, ...fetchOptions } = options || {};

  // Create properly-typed base fetch options without explicit cast
  // The spread operator here ensures TypeScript infers the correct type
  const baseFetchOptions: RequireTransformOrValidate<T> =
    fetchOptions as RequireTransformOrValidate<T>;
  const fetchState = useFetch<T>(url, baseFetchOptions);

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
  options?: RequireTransformOrValidate<T> & {
    /** Cache key - required when url is null to avoid collisions across consumers */
    cacheKey?: string;
    /** Cache duration in milliseconds */
    cacheTime?: number;
    /** Whether to refetch in background */
    refetchOnWindowFocus?: boolean;
    /** Stale time before considering data stale */
    staleTime?: number;
  }
) {
  const {
    cacheKey: providedCacheKey,
    cacheTime = 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus = false,
    staleTime = 0,
    ...fetchOptions
  } = options || {};

  // Require explicit cacheKey when url is null to prevent accidental collisions
  const cacheKey = providedCacheKey ?? url;
  if (!cacheKey) {
    throw new Error(
      'useCachedFetch requires either a url or an explicit cacheKey to prevent cache collisions'
    );
  }

  const [cacheVersion, setCacheVersion] = React.useState(0);

  const cachedEntry = globalFetchCache.get(cacheKey) as CacheEntry<T> | undefined;
  const now = Date.now();
  const isCacheValid = cachedEntry && now - cachedEntry.timestamp < cacheTime;
  const isCacheStale = cachedEntry && staleTime > 0 && now - cachedEntry.timestamp > staleTime;
  const shouldUseCache = isCacheValid && !isCacheStale;

  const fetchState = useFetch<T>(url, {
    ...(fetchOptions as RequireTransformOrValidate<T>),
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
