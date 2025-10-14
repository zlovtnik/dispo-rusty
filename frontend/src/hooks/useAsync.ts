import { useState, useEffect, useRef, useCallback } from 'react';
import type { DependencyList } from 'react';
import { err, ok, ResultAsync, errAsync } from 'neverthrow';
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
  execute: () => AsyncResult<T, E>;
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
  deps: DependencyList = []
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

  const toAsyncResult = useCallback((value: AsyncResult<T, E> | Promise<Result<T, E>>): AsyncResult<T, E> => {
    if (value instanceof ResultAsync) {
      return value;
    }

    const promise = Promise.resolve(value)
      .then(resolved => {
        if (resolved.isOk()) {
          return resolved.value;
        }
        throw resolved.error;
      });

    return ResultAsync.fromPromise(promise, (error: unknown) => error as E);
  }, []);

  const execute = useCallback((): AsyncResult<T, E> => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setResult(null);

    let asyncResult: AsyncResult<T, E>;

    try {
      asyncResult = toAsyncResult(asyncFn());
    } catch (syncError) {
      const failure = errAsync<T, E>(syncError as E);

      failure
        .match({
          ok: () => undefined,
          err: (error: E) => {
            if (abortControllerRef.current === controller && !controller.signal.aborted) {
              setResult(err(error));
            }
            return error;
          },
        })
        .finally(() => {
          if (abortControllerRef.current === controller && !controller.signal.aborted) {
            setLoading(false);
          }
        });

      return failure;
    }

    asyncResult
      .match({
        ok: (value: T) => {
          if (abortControllerRef.current === controller && !controller.signal.aborted) {
            setResult(ok(value));
          }
          return value;
        },
        err: (error: E) => {
          if (abortControllerRef.current === controller && !controller.signal.aborted) {
            setResult(err(error));
          }
          return error;
        },
      })
      .finally(() => {
        if (abortControllerRef.current === controller && !controller.signal.aborted) {
          setLoading(false);
        }
      });

    return asyncResult;
  }, [asyncFn, toAsyncResult]);

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
  // Spread deps array so React tracks individual dependency changes
  useEffect(() => {
    if (deps.length > 0) {
      execute();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execute, ...deps]);

  return {
    loading,
    result,
    execute,
    reset,
  };
}
