import { useAsync } from './useAsync';
import type { AsyncResult, Result } from '../types/fp';
import type { AppError, ApiCallError } from '../types/errors';
import { err } from 'neverthrow';

/**
 * Configuration options for API calls
 */
export interface ApiCallOptions<T, E> {
  /** Function to transform Result into a different Result type */
  transformResult?: (result: Result<T, E>) => Result<T, E>;
  /** Function to handle errors automatically */
  onError?: (error: E) => void;
  /** Function to handle success automatically */
  onSuccess?: (data: T) => void;
  /** Whether to retry on failure */
  retryOnError?: boolean;
  /** Maximum number of retries */
  maxRetries?: number;
  /** Delay between retries (ms) */
  retryDelay?: number;
}

/**
 * Enhanced API call hook with automatic error handling and Result composition
 *
 * Provides automatic error handling, retry logic, and Result transformation
 * using railway-oriented programming patterns.
 */
export function useApiCall<TData, TError extends AppError = AppError>(
  apiFunction: () => AsyncResult<TData, TError>,
  options: ApiCallOptions<TData, TError> = {}
) {
  const {
    transformResult,
    onError,
    onSuccess,
    retryOnError = false,
    maxRetries = 3,
    retryDelay = 1000,
  } = options;

  // Enhanced API function with error handling and retry logic
  const enhancedApiCall = async (): Promise<Result<TData, TError & ApiCallError>> => {
    // Initialize lastError with a default value
    let lastError: TError & ApiCallError = {
      type: 'network',
      message: 'Request failed',
    } as TError & ApiCallError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const asyncResult = apiFunction();

        // Await the AsyncResult
        const result = await asyncResult;

        if (result.isOk()) {
          // Apply result transformation if provided
          const finalResult = transformResult
            ? (transformResult(result as Result<TData, TError>) as Result<TData, TError & ApiCallError>)
            : (result as Result<TData, TError & ApiCallError>);
          
          // Call success handler with transformed value
          if (finalResult.isOk() && onSuccess) {
            onSuccess(finalResult.value);
          }
          
          return finalResult;
        } else {
          // Guard result.error and build safe baseError
          const baseError: Partial<TError> = typeof result.error === 'object' && result.error !== null
            ? result.error
            : { message: String(result.error) } as Partial<TError>;

          // Augment error with ApiCallError fields
          lastError = {
            ...baseError,
            attemptNumber: attempt,
            maxRetries,
            retryable: retryOnError && attempt < maxRetries,
          } as TError & ApiCallError;

          // Call error handler
          if (onError) {
            onError(lastError);
          }

          // If not retrying or last attempt, return enriched error (do not call transformResult on error)
          if (!retryOnError || attempt === maxRetries) {
            const enrichedErrorResult = err(lastError) as Result<TData, TError & ApiCallError>;
            return enrichedErrorResult;
          }

          // Wait before retry
          if (retryDelay > 0 && attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          }
        }
      } catch (error) {
        // Create defensive/type-guarded error object
        const safeError = error instanceof Error
          ? { type: 'unknown' as const, message: error.message, ...(error.stack && { stack: error.stack }) }
          : { type: 'unknown' as const, message: String(error) };

        // Augment error with ApiCallError fields
        lastError = {
          ...safeError,
          attemptNumber: attempt,
          maxRetries,
          retryable: retryOnError && attempt < maxRetries,
        } as unknown as TError & ApiCallError;

        if (onError) {
          onError(lastError);
        }

        if (!retryOnError || attempt === maxRetries) {
          const enrichedErrorResult = err(lastError) as Result<TData, TError & ApiCallError>;
          return enrichedErrorResult;
        }

        // Wait before retry
        if (retryDelay > 0 && attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }

    // Return the last error (always assigned in the loop above)
    return err(lastError) as Result<TData, TError & ApiCallError>;
  };

  // Use the useAsync hook with our enhanced API call
  const asyncState = useAsync<TData, TError & ApiCallError>(
    () => enhancedApiCall(),
    [] // We don't auto-execute, let the user control execution
  );

  // Return asyncState with the execute method from useAsync
  // This ensures loading/result state updates properly
  return asyncState;
}

/**
 * Factory function for creating typed API call hooks
 */
export function createApiCallHook<TData, TError extends AppError = AppError>(
  baseApiFunction: () => AsyncResult<TData, TError>
) {
  return (options?: ApiCallOptions<TData, TError>) =>
    useApiCall(baseApiFunction, options);
}
