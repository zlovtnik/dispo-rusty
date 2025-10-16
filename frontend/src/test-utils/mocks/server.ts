/**
 * Mock Service Worker (MSW) Server Setup
 * 
 * This file configures the MSW server for intercepting API calls in tests.
 */

import { setupServer } from 'msw/node';
import { getHandlers, resetMockData } from './handlers';

/**
 * Lazy-initialized MSW Server instance
 * Delayed until first use to ensure environment variables are loaded
 */
let _server: ReturnType<typeof setupServer> | null = null;

function ensureServer() {
  if (!_server) {
    _server = setupServer(...getHandlers());
  }
  return _server;
}

/**
 * Get the MSW server instance
 * Lazily initializes on first call
 */
export function getServer() {
  return ensureServer();
}

// Create a lazy proxy for backward compatibility
export const server = new Proxy({} as unknown as ReturnType<typeof setupServer>, {
  get(_target, prop, _receiver) {
    const inst = ensureServer() as unknown as Record<string, unknown>;
    const value = (inst as any)[prop as string];
    // Bind functions to preserve 'this' context
    return typeof value === 'function' ? value.bind(inst) : value;
  },
  has(_target, prop) {
    const inst = ensureServer() as unknown as Record<string, unknown>;
    return prop in inst;
  },
});

/**
 * Setup MSW server for all tests
 * Call this in your test setup file or beforeAll hooks
 */
export function setupMSW(): void {
  // Start server before all tests
  ensureServer().listen({
    onUnhandledRequest: 'warn', // Warn about unhandled requests
  });
}

/**
 * Cleanup MSW server after all tests
 * Call this in your test teardown file or afterAll hooks
 */
export function teardownMSW(): void {
  // Close server after all tests
  if (_server) {
    _server.close();
  }
}

/**
 * Reset handlers and mock data between tests
 * Call this in beforeEach or afterEach hooks
 */
export function resetMSW(): void {
  // Reset handlers to initial state
  if (_server) {
    _server.resetHandlers();
  }
  
  // Reset mock data
  resetMockData();
}

// Re-export utilities
export { getHandlers, resetMockData } from './handlers';
export { http, HttpResponse } from 'msw';
