/**
 * Lazy evaluation utilities for deferred execution
 *
 * Provides tools for deferring expensive computations:
 * - Lazy values that compute on demand
 * - Lazy Result computations
 * - Generator-based data streaming
 * - Deferred execution strategies
 *
 * @module utils/lazy
 */

import type { Result, AsyncResult } from '@/types/fp';

/**
 * Lazy value - computes result only when accessed
 *
 * @example
 * ```typescript
 * const expensiveValue = lazy(() => {
 *   console.log('Computing...');
 *   return fibonacci(100);
 * });
 *
 * // Nothing logged yet - computation deferred
 * const result1 = expensiveValue.value; // Logged: "Computing..."
 * const result2 = expensiveValue.value; // Nothing logged - cached from first call
 * ```
 */
export class Lazy<T> {
  private computed = false;
  private cachedValue: T | undefined;

  constructor(private thunk: () => T) {}

  /**
   * Get the value, computing if necessary
   */
  get value(): T {
    if (!this.computed) {
      this.cachedValue = this.thunk();
      this.computed = true;
    }
    return this.cachedValue as T;
  }

  /**
   * Apply a function to the lazy value
   */
  map<U>(fn: (value: T) => U): Lazy<U> {
    return new Lazy(() => fn(this.value));
  }

  /**
   * Chain lazy computations
   */
  flatMap<U>(fn: (value: T) => Lazy<U>): Lazy<U> {
    return new Lazy(() => fn(this.value).value);
  }

  /**
   * Force evaluation of the lazy value
   */
  force(): T {
    return this.value;
  }

  /**
   * Reset the cached value
   */
  reset(): void {
    this.computed = false;
    this.cachedValue = undefined;
  }
}

/**
 * Create a lazy value
 *
 * @param thunk - Function that computes the value
 * @returns Lazy value wrapper
 */
export function lazy<T>(thunk: () => T): Lazy<T> {
  return new Lazy(thunk);
}

/**
 * Lazy Result computation
 *
 * Defers Result computation until accessed, useful for expensive validation.
 *
 * @example
 * ```typescript
 * const lazyValidation = lazyResult(() => validateEmail(email));
 *
 * // Validation not run yet
 * const result = lazyValidation.value;
 * result.match(
 *   (email) => console.log('Valid:', email),
 *   (error) => console.log('Invalid:', error.message)
 * );
 * ```
 */
export class LazyResult<T, E> {
  private computed = false;
  private cachedResult: Result<T, E> | undefined;

  constructor(private thunk: () => Result<T, E>) {}

  /**
   * Get the Result value, computing if necessary
   */
  get value(): Result<T, E> {
    if (!this.computed) {
      this.cachedResult = this.thunk();
      this.computed = true;
    }
    return this.cachedResult!;
  }

  /**
   * Apply a function to the successful value
   */
  map<U>(fn: (value: T) => U): LazyResult<U, E> {
    return new LazyResult(() => this.value.map(fn));
  }

  /**
   * Apply a function to the error
   */
  mapErr<F>(fn: (error: E) => F): LazyResult<T, F> {
    return new LazyResult(() => this.value.mapErr(fn));
  }

  /**
   * Chain lazy Results
   */
  andThen<U>(fn: (value: T) => Result<U, E>): LazyResult<U, E> {
    return new LazyResult(() => this.value.andThen(fn));
  }

  /**
   * Force evaluation
   */
  force(): Result<T, E> {
    return this.value;
  }

  /**
   * Reset the cached result
   */
  reset(): void {
    this.computed = false;
    this.cachedResult = undefined;
  }
}

/**
 * Create a lazy Result
 */
export function lazyResult<T, E>(thunk: () => Result<T, E>): LazyResult<T, E> {
  return new LazyResult(thunk);
}

/**
 * Lazy async Result computation
 *
 * Defers async Result computation, useful for expensive API calls.
 */
export class LazyAsyncResult<T, E> {
  private computed = false;
  private cachedResult: Result<T, E> | undefined;
  private pending: Promise<Result<T, E>> | undefined;

  constructor(private thunk: () => AsyncResult<T, E> | Promise<Result<T, E>>) {}

  /**
   * Force evaluation of the async Result
   */
  async force(): Promise<Result<T, E>> {
    if (!this.computed) {
      if (this.pending) {
        return this.pending;
      }
      this.pending = Promise.resolve(this.thunk()).finally(() => {
        this.pending = undefined;
      });
      const result = await this.pending;
      this.cachedResult = result;
      this.computed = true;
    }
    return this.cachedResult!;
  }

  /**
   * Reset the cached result
   */
  reset(): void {
    this.computed = false;
    this.cachedResult = undefined;
    this.pending = undefined;
  }
}

/**
 * Generator-based data streaming for memory efficiency
 *
 * Yields results one at a time instead of loading all into memory.
 *
 * @example
 * ```typescript
 * function* streamLargeDataset() {
 *   for (let i = 0; i < 1000000; i++) {
 *     yield expensiveComputation(i);
 *   }
 * }
 *
 * for (const item of streamLargeDataset()) {
 *   processItem(item); // Each item computed on demand
 * }
 * ```
 */
export function* streamResults<T, E>(
  items: T[],
  processor: (item: T) => Result<T, E>
): Generator<Result<T, E>> {
  for (const item of items) {
    yield processor(item);
  }
}

/**
 * Lazy collection mapper that processes items on demand
 *
 * @example
 * ```typescript
 * const lazyMap = lazyMap([1, 2, 3, 4, 5], n => n * 2);
 *
 * const result = lazyMap.take(2); // Only first 2 computed: [2, 4]
 * ```
 */
export class LazyCollection<T, R> {
  private predicates: ((item: T) => boolean)[] = [];

  constructor(
    private items: T[],
    private mapper: (item: T) => R,
    predicates?: ((item: T) => boolean)[]
  ) {
    this.predicates = predicates ? [...predicates] : [];
  }

  /**
   * Get first N items (only compute N items)
   */
  take(n: number): R[] {
    const result: R[] = [];
    let count = 0;

    for (const item of this.items) {
      // Apply all predicates lazily
      if (this.predicates.every(predicate => predicate(item))) {
        result.push(this.mapper(item));
        count++;
        if (count >= n) break;
      }
    }

    return result;
  }

  /**
   * Filter items lazily
   */
  filter(predicate: (item: T) => boolean): LazyCollection<T, R> {
    return new LazyCollection(this.items, this.mapper, [...this.predicates, predicate]);
  }

  /**
   * Iterate lazily
   */
  *[Symbol.iterator](): Generator<R> {
    for (const item of this.items) {
      // Apply all predicates lazily
      if (this.predicates.every(predicate => predicate(item))) {
        yield this.mapper(item);
      }
    }
  }

  /**
   * Collect all items (forces full evaluation)
   */
  collect(): R[] {
    const result: R[] = [];

    for (const item of this.items) {
      // Apply all predicates lazily
      if (this.predicates.every(predicate => predicate(item))) {
        result.push(this.mapper(item));
      }
    }

    return result;
  }
}

/**
 * Create a lazy collection mapper
 */
export function lazyMap<T, R>(items: T[], mapper: (item: T) => R): LazyCollection<T, R> {
  return new LazyCollection(items, mapper);
}

/**
 * Deferred function execution
 *
 * Delays function call and allows cancellation.
 *
 * @example
 * ```typescript
 * const deferred = defer(() => expensiveOperation(), 1000);
 *
 * // Later, if still needed:
 * const result = deferred.execute();
 *
 * // Or cancel before execution:
 * deferred.cancel();
 * ```
 */
export class Deferred<T> {
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private cancelled = false;
  private executed = false;
  private result: T | undefined;

  constructor(
    private fn: () => T,
    delay: number
  ) {
    this.timeoutId = setTimeout(() => {
      if (!this.cancelled) {
        this.result = this.fn();
        this.executed = true;
        this.timeoutId = null;
      }
    }, delay);
  }

  /**
   * Execute immediately (cancels scheduled execution)
   */
  execute(): T {
    if (this.executed) {
      return this.result as T;
    }

    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    this.result = this.fn();
    this.executed = true;
    return this.result;
  }

  /**
   * Cancel execution
   */
  cancel(): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.cancelled = true;
  }

  /**
   * Check if deferred execution is still pending
   */
  isPending(): boolean {
    return this.timeoutId !== null && !this.cancelled;
  }
}

/**
 * Create a deferred function execution
 *
 * @param fn - Function to defer
 * @param delay - Delay in milliseconds
 * @returns Deferred execution wrapper
 */
export function defer<T>(fn: () => T, delay: number): Deferred<T> {
  return new Deferred(fn, delay);
}

/**
 * Batch lazy computations and execute in chunks
 *
 * Useful for processing large datasets without blocking.
 *
 * @example
 * ```typescript
 * const batcher = batchLazy(1000, (items) => {
 *   return items.map(validateItem);
 * });
 *
 * for (const item of largeList) {
 *   await batcher.add(item);
 * }
 * ```
 */
export class LazyBatcher<T, R> {
  private batch: T[] = [];
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private batchSize: number,
    private processor: (items: T[]) => Promise<R[]>
  ) {}

  /**
   * Add item to batch
   */
  async add(item: T): Promise<R[]> {
    this.batch.push(item);

    if (this.batch.length >= this.batchSize) {
      return this.flush();
    }

    // Schedule flush after delay if not already scheduled
    if (this.timeoutId === null) {
      this.timeoutId = setTimeout(() => {
        void this.flush();
        this.timeoutId = null;
      }, 100);
    }

    return [];
  }

  /**
   * Flush pending batch
   */
  private async flush(): Promise<R[]> {
    if (this.batch.length === 0) {
      return [];
    }

    // Capture pending items into a local variable
    const items = [...this.batch];

    // Call processor and await the results
    const results = await this.processor(items);
    // Only clear batch after processor succeeds
    this.batch = [];
    return results;
  }

  /**
   * Force flush remaining items
   */
  async flushAll(): Promise<R[]> {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    if (this.batch.length === 0) {
      return [];
    }

    // Capture pending items into a local variable
    const items = [...this.batch];

    // Call processor and await the results
    const results = await this.processor(items);
    // Only clear batch after processor succeeds
    this.batch = [];
    return results;
  }
}

/**
 * Create a lazy batcher
 */
export function batchLazy<T, R>(
  batchSize: number,
  processor: (items: T[]) => Promise<R[]>
): LazyBatcher<T, R> {
  return new LazyBatcher(batchSize, processor);
}
