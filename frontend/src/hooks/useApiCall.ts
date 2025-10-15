import { useAsync } from './useAsync';
import type { AsyncResult, Result } from '../types/fp';
import type { AppError, ApiCallError } from '../types/errors';
import { createNetworkError } from '../types/errors';
import { err } from 'neverthrow';

/**
 * Configuration options for API calls
 */
export interface ApiCallOptions<TIn, EIn, TOut = TIn, EOut = EIn> {
  /** Function to transform the Result before consumers receive it */
  transformResult?: (result: Result<TIn, EIn>) => Result<TOut, EOut>;
  /** Optional mapper for unexpected errors (sync throws, etc.) */
  transformError?: (error: unknown) => EOut;
  /** Function to handle errors automatically */
  onError?: (error: EOut & ApiCallError) => void;
  /** Function to handle success automatically */
  onSuccess?: (data: TOut) => void;
  /** Whether to retry on failure */
  retryOnError?: boolean;
  /** Maximum number of retries */
  maxRetries?: number;
  /** Delay between retries (ms) */
  retryDelay?: number;
}

/**
 * Executes an async API request with retry support and Result composition semantics.
 *
 * The hook keeps transport concerns (retry metadata, transient error mapping) outside of
 * the component tree, letting callers focus on handling `Result` values. Automatic retry
 * metadata is attached to errors so the UI can present actionable feedback.
 *
 * @template TIn The raw data type returned by the API function
 * @template EIn The error type returned by the API function
 * @template TOut The transformed success type exposed to consumers
 * @template EOut The transformed error type exposed to consumers
 * @param apiFunction Async function that returns a `ResultAsync`
 * @param options Optional configuration for transforming results and handling retries
 * @returns Async state containing loading status, latest `Result`, and an `execute` trigger
 * @example
 * ```typescript
 * const fetchContacts = useCallback(
 *   () => addressBookService.list(),
 *   []
 * );
 *
 * const { loading, result, execute } = useApiCall(fetchContacts, {
 *   onError: error => notification.error({ message: error.message }),
 *   onSuccess: data => console.log('Loaded', data),
 * });
 *
 * useEffect(() => {
 *   execute();
 * }, [execute]);
 * ```
 */
export function useApiCall<
  TIn,
  EIn extends AppError = AppError,
  TOut = TIn,
  EOut extends AppError = EIn,
>(apiFunction: () => AsyncResult<TIn, EIn>, options: ApiCallOptions<TIn, EIn, TOut, EOut> = {}) {
  const {
    transformResult,
    transformError,
    onError,
    onSuccess,
    retryOnError = false,
    maxRetries = 3,
    retryDelay = 1000,
  } = options;

  // Enhanced API function with error handling and retry logic
  const enhancedApiCall = async (): Promise<Result<TOut, EOut & ApiCallError>> => {
    const withRetryMetadata = (error: EOut, attempt: number): EOut & ApiCallError => ({
      ...error,
      attemptNumber: attempt,
      maxRetries,
      retryable: retryOnError && attempt < maxRetries,
    });

    let lastError: (EOut & ApiCallError) | null = null;

    const coerceResult = (result: Result<TIn, EIn>): Result<TOut, EOut> => {
      if (transformResult) {
        return transformResult(result);
      }

      return result as unknown as Result<TOut, EOut>;
    };

    const mapUnknownError = (error: unknown): EOut => {
      if (transformError) {
        return transformError(error);
      }

      if (error && typeof error === 'object' && 'type' in (error as Record<string, unknown>)) {
        return error as EOut;
      }

      // Normalize unexpected failures into a network error so consumers can rely on typed errors
      const base = createNetworkError(
        error instanceof Error ? error.message : 'Unexpected request failure',
        undefined,
        {
          cause: error instanceof Error ? error : undefined,
        }
      );

      return base as unknown as EOut;
    };

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const asyncResult = apiFunction();
        const rawResult = await asyncResult;
        const finalResult = coerceResult(rawResult);

        if (finalResult.isOk()) {
          if (onSuccess) {
            onSuccess(finalResult.value);
          }

          return finalResult as Result<TOut, EOut & ApiCallError>;
        } else {
          const normalizedError = finalResult.error;
          const enrichedError = withRetryMetadata(normalizedError, attempt);
          lastError = enrichedError;

          // Call error handler
          if (onError) {
            onError(enrichedError);
          }

          // If not retrying or last attempt, return enriched error (do not call transformResult on error)
          if (!retryOnError || attempt === maxRetries) {
            return err(enrichedError);
          }

          // Wait before retry
          if (retryDelay > 0 && attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          }
        }
      } catch (error) {
        const mappedError = mapUnknownError(error);
        lastError = withRetryMetadata(mappedError, attempt);

        if (onError) {
          onError(lastError);
        }

        if (!retryOnError || attempt === maxRetries) {
          return err(lastError);
        }

        // Wait before retry
        if (retryDelay > 0 && attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }

    const fallbackError =
      lastError ??
      withRetryMetadata(mapUnknownError(new Error('Request failed without details')), maxRetries);

    return err(fallbackError);
  };

  // Use the useAsync hook with our enhanced API call
  const asyncState = useAsync<TOut, EOut & ApiCallError>(
    () => enhancedApiCall(),
    [] // We don't auto-execute, let the user control execution
  );

  // Return asyncState with the execute method from useAsync
  // This ensures loading/result state updates properly
  return asyncState;
}

/**
 * Creates a typed wrapper hook that pre-binds an API function and forwards optional options.
 *
 * @template TData Success payload type
 * @template TError Error type emitted by the API function
 * @param baseApiFunction Async function to execute when the generated hook runs
 * @returns Hook that can be used directly inside components while still accepting options
 * @example
 * ```typescript
 * const useFetchTenants = createApiCallHook(tenantService.list);
 *
 * export const TenantsPage: React.FC = () => {
 *   const { loading, result, execute } = useFetchTenants();
 *   useEffect(() => {
 *     execute();
 *   }, [execute]);
 *   // ...
 * };
 * ```
 */
export function createApiCallHook<TData, TError extends AppError = AppError>(
  baseApiFunction: () => AsyncResult<TData, TError>
) {
  return (options?: ApiCallOptions<TData, TError>) => useApiCall(baseApiFunction, options);
}
