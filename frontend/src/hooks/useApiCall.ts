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
          // Call success handler
          if (onSuccess) {
            onSuccess(result.value);
          }

          // Apply result transformation if provided
          const finalResult = transformResult ? transformResult(result) : result;
          return finalResult;
        } else {
          lastError = result.error as TError & ApiCallError;

          // Call error handler
          if (onError) {
            onError(lastError);
          }

          // If not retrying or last attempt, return error
          if (!retryOnError || attempt === maxRetries) {
            const transformedResult = transformResult
              ? transformResult(result as Result<TData, TError>)
              : result;
            return transformedResult as Result<TData, TError & ApiCallError>;
          }

          // Wait before retry
          if (retryDelay > 0 && attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          }
        }
      } catch (error) {
        lastError = error as TError & ApiCallError;

        if (onError) {
          onError(lastError);
        }

        if (!retryOnError || attempt === maxRetries) {
          const errorResult = err(lastError);
          return transformResult ? transformResult(errorResult as Result<TData, TError>) : errorResult as Result<TData, TError & ApiCallError>;
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

  // Override execute to use our enhanced version
  const execute = async (): Promise<Result<TData, TError & ApiCallError>> => {
    return enhancedApiCall();
  };

  return {
    ...asyncState,
    execute,
  };
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
