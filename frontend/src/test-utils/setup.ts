/**
 * Test Setup and Configuration
 *
 * This file is preloaded before all tests via bunfig.toml.
 * It sets up the testing environment, including DOM environment,
 * jest-dom matchers, and global test utilities.
 */

import '@testing-library/jest-dom';
import { expect } from 'bun:test';
// Import matchers as a module (ESM-compatible)
import * as jestDomMatchers from '@testing-library/jest-dom/matchers';

// Extend expect with jest-dom matchers for Bun
// This is needed because Bun doesn't automatically extend expect like Jest does
expect.extend(jestDomMatchers as any);

// Ensure environment variables are available in import.meta.env
// Bun loads .env automatically, but we need to explicitly set import.meta.env for tests
if (!import.meta.env.VITE_API_URL) {
  const apiUrl = process.env.VITE_API_URL || 'http://localhost:8000/api';
  (import.meta.env as Record<string, string>).VITE_API_URL = apiUrl;
}
if (!import.meta.env.MODE) {
  (import.meta.env as Record<string, string>).MODE = process.env.NODE_ENV || 'test';
}
if (!import.meta.env.DEV) {
  (import.meta.env as Record<string, boolean>).DEV =
    (process.env.NODE_ENV || 'test') !== 'production';
}
if (!import.meta.env.PROD) {
  (import.meta.env as Record<string, boolean>).PROD =
    (process.env.NODE_ENV || 'test') === 'production';
}

// Type augmentation for Bun's expect to include jest-dom matchers
declare module 'bun:test' {
  interface Matchers<T> {
    toBeInTheDocument(): T;
    toHaveClass(...classNames: string[]): T;
    toHaveAttribute(attr: string, value?: string): T;
    toHaveValue(value?: string | number | string[]): T;
    toBeChecked(): T;
    toBeDisabled(): T;
    toBeEnabled(): T;
    toBeVisible(): T;
    toBeHidden(): T;
    toHaveFocus(): T;
    toHaveTextContent(text?: string | RegExp, options?: { normalizeWhitespace?: boolean }): T;
  }
}
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll, afterAll } from 'bun:test';
import { setupMSW, teardownMSW, resetMSW } from './mocks/server';

// Start MSW server before all tests
beforeAll(() => {
  setupMSW();
});

// Stop MSW server after all tests
afterAll(() => {
  teardownMSW();
});

// Automatically cleanup after each test
afterEach(() => {
  cleanup();
  resetMSW(); // Reset MSW handlers and mock data
});

// Mock window object if not defined (for non-DOM tests)
// NOTE: Only timeout functions are mocked. Tests requiring other browser APIs
// (document, navigator, location, etc.) must use JSDOM or provide their own mocks.
if (typeof window === 'undefined') {
  (global as Record<string, unknown>).window = {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
  };
}

// Mock localStorage for testing environment
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string): string | null => {
      return store[key] || null;
    },
    setItem: (key: string, value: string): void => {
      store[key] = value.toString();
    },
    removeItem: (key: string): void => {
      delete store[key];
    },
    clear: (): void => {
      store = {};
    },
    get length(): number {
      return Object.keys(store).length;
    },
    key: (index: number): string | null => {
      const keys = Object.keys(store);
      return keys[index] || null;
    },
  };
})();

// Mock sessionStorage
const sessionStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string): string | null => {
      return store[key] || null;
    },
    setItem: (key: string, value: string): void => {
      store[key] = value.toString();
    },
    removeItem: (key: string): void => {
      delete store[key];
    },
    clear: (): void => {
      store = {};
    },
    get length(): number {
      return Object.keys(store).length;
    },
    key: (index: number): string | null => {
      const keys = Object.keys(store);
      return keys[index] || null;
    },
  };
})();

// Assign mocks to global (guard against re-defining if already present)
if (typeof (globalThis as any).localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    writable: true,
    configurable: true,
  });
}

if (typeof (globalThis as any).sessionStorage === 'undefined') {
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: sessionStorageMock,
    writable: true,
    configurable: true,
  });
}

// Mock matchMedia for responsive components (guard against overwriting existing implementation)
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {}, // Deprecated
      removeListener: () => {}, // Deprecated
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    }),
  });
}

// Suppress console errors/warnings during tests (optional)
// Uncomment if you want cleaner test output
// const originalError = console.error;
// beforeEach(() => {
//   console.error = (...args: unknown[]) => {
//     if (
//       typeof args[0] === 'string' &&
//       args[0].includes('Warning: ReactDOM.render')
//     ) {
//       return;
//     }
//     originalError.call(console, ...args);
//   };
// });
