import { useState, useEffect, useRef, useCallback } from 'react';
import { err } from 'neverthrow';
import type { Result, AsyncResult } from '../types/fp';

/**
 * Represents the state of an async operation using railway-oriented programming
 */
export interface AsyncState<T, E> {
  /** Whether the operation is currently loading */
  loading: boolean;
  /** The result of the operation, null when loading */
  result: Result<T, E> | null;
  /** Function to execute the operation */
  execute: () => Promise<Result<T, E>>;
  /** Function to reset the state */
  reset: () => void;
}

/**
 * Custom hook for managing async operations with Railway-Oriented Programming
 *
 * Returns a Result<T, E> to handle success/failure without exceptions.
 *
 * IMPORTANT: To avoid infinite re-render loops, callers MUST memoize the asyncFn
 * parameter using useCallback. Passing an inline function will cause the hook to
 * re-execute on every render.
 *
 * @example
 * ```typescript
 * // CORRECT: Memoized function
 * const fetchData = useCallback(async () => {
 *   return apiCall();
 * }, [dependency1, dependency2]);
 * const { loading, result } = useAsync(fetchData, [dependency1]);
 *
 * // INCORRECT: Inline function will cause re-renders
 * const { loading, result } = useAsync(async () => apiCall(), [dependency1]);
 * ```
 *
 * @param asyncFn - The async function that returns an AsyncResult<T, E> or Promise<Result<T, E>>
 * @param deps - Dependencies that trigger re-execution when changed
 * @returns AsyncState containing loading state, result, and control functions
 */
export function useAsync<T, E>(
  asyncFn: () => AsyncResult<T, E> | Promise<Result<T, E>>,
  deps: React.DependencyList = []
): AsyncState<T, E> {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result<T, E> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Track asyncFn reference to warn about non-memoized functions in development
  const asyncFnRef = useRef(asyncFn);
  
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      if (asyncFnRef.current !== asyncFn) {
        console.warn(
          'useAsync: asyncFn reference changed. This can cause infinite re-renders. ' +
          'Please wrap asyncFn in useCallback to maintain a stable reference.'
        );
      }
    }
    asyncFnRef.current = asyncFn;
  }, [asyncFn]);

  const execute = useCallback(async (): Promise<Result<T, E>> => {
    // Cancel any previous operation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setResult(null);

    try {
      const asyncResult = asyncFn();

      // Check if it's an AsyncResult (has mapErr method) or Promise<Result>
      if ('mapErr' in asyncResult && typeof asyncResult.mapErr === 'function') {
        // For AsyncResult (neverthrow), we can map to handle abort
        const mappedResult = asyncResult.mapErr((error: E) => {
          if (abortControllerRef.current?.signal.aborted) {
            return error; // Return the original error when aborted
          }
          return error;
        });

        const finalResult = await mappedResult;
        if (!abortControllerRef.current?.signal.aborted) {
          setResult(finalResult);
        }
        return finalResult;
      } else {
        // For Promise<Result>, directly await it
        const finalResult = await asyncResult;
        if (!abortControllerRef.current?.signal.aborted) {
          setResult(finalResult);
        }
        return finalResult;
      }
    } catch (error) {
      const errorResult = err(error as E);
      if (!abortControllerRef.current?.signal.aborted) {
        setResult(errorResult);
      }
      return errorResult;
    } finally {
      if (!abortControllerRef.current?.signal.aborted) {
        setLoading(false);
      }
    }
  }, [asyncFn]);

  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoading(false);
    setResult(null);
  }, []);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Auto-execute when deps change
  // Note: deps is used as a single dependency for shallow reference check
  useEffect(() => {
    if (deps.length > 0) {
      execute();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execute, deps]);

  return {
    loading,
    result,
    execute,
    reset,
  };
}
