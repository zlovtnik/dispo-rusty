/**
 * Test Setup and Configuration
 *
 * This file is preloaded before all tests via bunfig.toml.
 * It sets up the testing environment, including DOM environment,
 * jest-dom matchers, and global test utilities.
 */

import '@testing-library/jest-dom';
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

// Assign mocks to global
Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

Object.defineProperty(global, 'sessionStorage', {
  value: sessionStorageMock,
  writable: true,
  configurable: true,
});

// Mock matchMedia for responsive components
if (typeof window !== 'undefined') {
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
