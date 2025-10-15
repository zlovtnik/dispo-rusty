/**
 * Mock Service Worker (MSW) Server Setup
 * 
 * This file configures the MSW server for intercepting API calls in tests.
 */

import { setupServer } from 'msw/node';
import { handlers, resetMockData } from './handlers';

/**
 * MSW Server instance
 * Use this in tests to control API behavior
 */
export const server = setupServer(...handlers);

/**
 * Setup MSW server for all tests
 * Call this in your test setup file or beforeAll hooks
 */
export function setupMSW(): void {
  // Start server before all tests
  server.listen({
    onUnhandledRequest: 'warn', // Warn about unhandled requests
  });
}

/**
 * Cleanup MSW server after all tests
 * Call this in your test teardown file or afterAll hooks
 */
export function teardownMSW(): void {
  // Close server after all tests
  server.close();
}

/**
 * Reset handlers and mock data between tests
 * Call this in beforeEach or afterEach hooks
 */
export function resetMSW(): void {
  // Reset handlers to initial state
  server.resetHandlers();
  
  // Reset mock data
  resetMockData();
}

// Re-export utilities
export { handlers, resetMockData } from './handlers';
export { http, HttpResponse } from 'msw';
