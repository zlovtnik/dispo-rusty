/**
 * Test Setup and Configuration
 *
 * This file is preloaded before all tests via bunfig.toml.
 * It sets up the testing environment, including DOM environment,
 * and global test utilities.
 */

import { expect } from 'bun:test';

// Ensure environment variables are available in import.meta.env
// Bun loads .env automatically, but we need to explicitly set import.meta.env for tests
if (!import.meta.env.VITE_API_URL) {
  const apiUrl =
    (typeof process !== 'undefined' && process.env ? process.env.VITE_API_URL : undefined) ||
    'http://localhost:8000/api';
  (import.meta.env as Record<string, string>).VITE_API_URL = apiUrl;
}
if (!import.meta.env.MODE) {
  (import.meta.env as Record<string, string>).MODE =
    (typeof process !== 'undefined' && process.env ? process.env.NODE_ENV : undefined) || 'test';
}
if (!import.meta.env.DEV) {
  (import.meta.env as Record<string, boolean>).DEV =
    ((typeof process !== 'undefined' && process.env ? process.env.NODE_ENV : undefined) ||
      'test') !== 'production';
}
if (!import.meta.env.PROD) {
  (import.meta.env as Record<string, boolean>).PROD =
    ((typeof process !== 'undefined' && process.env ? process.env.NODE_ENV : undefined) ||
      'test') === 'production';
}
import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';

// Extend Bun's expect with jest-dom matchers
expect.extend(matchers);

// Mock missing Jest utilities that jest-dom expects
if (typeof globalThis !== 'undefined') {
  // Mock RECEIVED_COLOR and other Jest utilities
  (globalThis as any).RECEIVED_COLOR = (text: string) => text;
  (globalThis as any).EXPECTED_COLOR = (text: string) => text;
  (globalThis as any).INVERTED_COLOR = (text: string) => text;
  (globalThis as any).BOLD_WEIGHT = (text: string) => text;
  (globalThis as any).DIM_COLOR = (text: string) => text;
}
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
// Using type-safe 'in' operator instead of typeof checks
if (!('localStorage' in globalThis)) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    writable: true,
    configurable: true,
  });
}

if (!('sessionStorage' in globalThis)) {
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
      addListener: () => {
        // Intentionally empty - deprecated method
      },
      removeListener: () => {
        // Intentionally empty - deprecated method
      },
      addEventListener: () => {
        // Intentionally empty - not needed for tests
      },
      removeEventListener: () => {
        // Intentionally empty - not needed for tests
      },
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
