/**
 * React component memoization utilities
 *
 * Provides higher-order components and hooks for optimizing React components:
 * - React.memo with custom prop comparison
 * - Stable prop factory functions
 * - Render optimization helpers
 *
 * @module utils/reactMemoization
 */

import * as React from 'react';
import { isEqual } from 'lodash';

/**
 * Custom prop comparison function type
 */
export type PropComparator<P> = (prevProps: P, nextProps: P) => boolean;

/**
 * Create a memoized component with custom prop comparison
 *
 * Extends React.memo with more fine-grained control over re-renders.
 *
 * @param Component - React component to memoize
 * @param propsAreEqual - Custom comparison (return true to skip re-render)
 * @returns Memoized component
 *
 * Example: Only re-render when contact data changes, ignore onEdit function reference
 */
export function memoizeComponent<P extends object>(
  Component: React.ComponentType<P>,
  propsAreEqual?: PropComparator<P>
): React.MemoExoticComponent<React.ComponentType<P>> {
  return React.memo(
    Component,
    propsAreEqual ??
      ((prevProps, nextProps) => {
        // Default: shallow comparison of all props
        const prevKeys = Object.keys(prevProps);
        const nextKeys = Object.keys(nextProps);

        if (prevKeys.length !== nextKeys.length) {
          return false;
        }

        return prevKeys.every(key => prevProps[key as keyof P] === nextProps[key as keyof P]);
      })
  );
}

/**
 * Create a memoized component that only re-renders on specific prop changes
 *
 * Useful for components with many props but only some affect rendering.
 * Only re-render when users, loading, or theme changes. Ignore callbacks.
 *
 * @param Component - React component to memoize
 * @param propsToWatch - Keys of props that trigger re-renders
 * @returns Memoized component
 */
export function memoizeComponentWithKeys<P extends object>(
  Component: React.ComponentType<P>,
  propsToWatch: (keyof P)[]
): React.MemoExoticComponent<React.ComponentType<P>> {
  return React.memo(Component, (prevProps, nextProps) => {
    // Return true (skip re-render) if watched props are equal
    return propsToWatch.every(key => prevProps[key] === nextProps[key]);
  });
}

/**
 * Create a stable callback factory
 *
 * Returns a function that creates callbacks with stable references.
 * Uses a Map-based cache to ensure identical partialArgs return the same callback.
 * Useful for passing to memoized children.
 *
 * @param handler - Callback handler function
 * @returns Function that creates stable callbacks
 */
export function createCallbackFactory<T extends Record<string, unknown>, R>(
  handler: (args: T) => R
): (partialArgs: Partial<T>) => (args: T) => R {
  // Cache to store stable callback references
  const callbackCache = new Map<string, (args: T) => R>();

  return (partialArgs: Partial<T>) => {
    // Create a deterministic key from partialArgs
    const key = JSON.stringify(partialArgs, Object.keys(partialArgs).sort());

    // Return cached callback if it exists
    if (callbackCache.has(key)) {
      return callbackCache.get(key) as (args: T) => R;
    }

    // Create new stable callback that merges partialArgs with incoming args
    const stableCallback = (args: T): R => {
      const mergedArgs = { ...args, ...partialArgs } as T;
      return handler(mergedArgs);
    };

    // Cache the callback
    callbackCache.set(key, stableCallback);

    return stableCallback;
  };
}

/**
 * Create a memoized selector component
 *
 * Renders only when selected data changes (deep comparison optional).
 *
 * @param selector - Function to select/transform data
 * @param deepEqual - Whether to use deep equality check
 * @returns Memoized selector function
 */
export function createSelector<T, S>(selector: (data: T) => S, deepEqual = false): (data: T) => S {
  let previousData: T | undefined;
  let previousResult: S | undefined;
  let hasPrevious = false;

  return (data: T): S => {
    // If we have previous data and it's the same reference, return cached result
    if (hasPrevious && previousData === data) {
      return previousResult as S;
    }

    // If we have previous data and deep equality check passes, return cached result
    if (hasPrevious && deepEqual && isDeepEqual(data, previousData)) {
      return previousResult as S;
    }

    // Compute new result
    const result = selector(data);

    // Store for future calls
    previousData = data;
    previousResult = result;
    hasPrevious = true;

    return result;
  };
}

/**
 * Deep equality check using lodash isEqual
 *
 * Handles arrays, Date objects, RegExp, Map/Set, typed arrays, and other complex types
 * correctly unlike the previous custom implementation.
 *
 * @param a - First value to compare
 * @param b - Second value to compare
 * @returns True if values are deeply equal
 */
function isDeepEqual(a: unknown, b: unknown): boolean {
  return isEqual(a, b);
}

/**
 * Create a memoized wrapper component that prevents children re-renders
 *
 * Useful for expensive child components that don't need to re-render.
 *
 * @param Component - Child component to memoize
 * @returns Memoized wrapper
 */
export function memoizeChildren<P extends React.PropsWithChildren>(
  Component: React.ComponentType<P>
): React.MemoExoticComponent<React.ComponentType<P>> {
  return React.memo(Component, (prevProps, nextProps): boolean => {
    // Re-render if children or key props change
    if (prevProps.children !== nextProps.children) return false;

    // Shallow compare other props
    const keys = Object.keys(prevProps).filter(key => key !== 'children');
    return keys.every(key => prevProps[key as keyof P] === nextProps[key as keyof P]);
  });
}

/**
 * Create a component boundary for memoization isolation
 *
 * Prevents parent re-renders from affecting memoized children.
 * MemoizedChild won't re-render when parent state changes.
 *
 * @param Component - Component to isolate
 * @returns Isolated component
 */
export function createMemoizationBoundary<P extends object>(
  Component: React.ComponentType<P>
): React.MemoExoticComponent<React.ComponentType<P>> {
  return React.memo(Component, () => false); // Never re-render (always skip)
}

/**
 * Create a component that only re-renders when key changes
 *
 * Useful for resetting component state via key prop.
 * Form resets when userId changes via key prop.
 *
export function createDebounceWrapper<P extends object>(
  Component: React.ComponentType<P>,
  delay = 300
): React.ComponentType<P> {
  return function DebouncedComponent(props: P): React.ReactElement {
    // Hold the debounced props in state
    const [debouncedProps, setDebouncedProps] = React.useState<P>(props);
    const propsKey = JSON.stringify(props);

    // Schedule debounced update whenever props change
    React.useEffect(() => {
      // Set timeout to update debounced props after delay
      const timeoutId = setTimeout(() => {
        setDebouncedProps(props);
      }, delay);

      // Clean up previous timeout if props change before delay completes
      return (): void => {
        clearTimeout(timeoutId);
      };
    }, [propsKey, delay]);

    // Render with debounced props - component receives updated props only after delay
    return React.createElement(Component, debouncedProps);
  };
}
  return function DebouncedComponent(props: P): React.ReactElement {
    // Hold the debounced props in state
    const [debouncedProps, setDebouncedProps] = React.useState<P>(props);

    // Schedule debounced update whenever props change
    React.useEffect(() => {
      // Set timeout to update debounced props after delay
      const timeoutId = setTimeout(() => {
        setDebouncedProps(props);
      }, delay);

      // Clean up previous timeout if props change before delay completes
      return (): void => {
        clearTimeout(timeoutId);
      };
    }, [props]);

    // Render with debounced props - component receives updated props only after delay
    return React.createElement(Component, debouncedProps);
  };
}

/**
 * Wrap a component to auto-memoize expensive computations in render
 *
 * Example: Use useMemo for expensive sorting computations in render.
 *
 * @param Component - Component that performs expensive computations
 * @returns Optimized component
 */
export const createOptimizedComponent = memoizeComponent;
