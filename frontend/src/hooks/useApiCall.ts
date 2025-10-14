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
          // Augment error with ApiCallError fields
          lastError = {
            ...result.error,
            attemptNumber: attempt,
            maxRetries,
            retryable: retryOnError && attempt < maxRetries,
          } as TError & ApiCallError;

          // Call error handler
          if (onError) {
            onError(lastError);
          }

          // If not retrying or last attempt, return enriched error
          if (!retryOnError || attempt === maxRetries) {
            const enrichedErrorResult = err(lastError) as Result<TData, TError & ApiCallError>;
            const transformedResult = transformResult
              ? (transformResult(enrichedErrorResult as Result<TData, TError>) as Result<TData, TError & ApiCallError>)
              : enrichedErrorResult;
            return transformedResult;
          }

          // Wait before retry
          if (retryDelay > 0 && attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          }
        }
      } catch (error) {
        // Augment error with ApiCallError fields
        lastError = {
          ...(error as TError),
          attemptNumber: attempt,
          maxRetries,
          retryable: retryOnError && attempt < maxRetries,
        } as TError & ApiCallError;

        if (onError) {
          onError(lastError);
        }

        if (!retryOnError || attempt === maxRetries) {
          const enrichedErrorResult = err(lastError) as Result<TData, TError & ApiCallError>;
          const transformedResult = transformResult 
            ? (transformResult(enrichedErrorResult as Result<TData, TError>) as Result<TData, TError & ApiCallError>)
            : enrichedErrorResult;
          return transformedResult;
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
  return {
    ...asyncState,
    // Use asyncState.execute to ensure proper state management
    execute: asyncState.execute,
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
