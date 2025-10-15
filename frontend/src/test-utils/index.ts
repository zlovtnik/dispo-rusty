/**
 * Test Utilities - Index
 *
 * Centralized exports for all testing utilities.
 * Import from here to access render functions, mocks, and test helpers.
 *
 * @example
 * ```typescript
 * import { renderWithProviders, mockUser, server } from './test-utils';
 * ```
 */

// Re-export render utilities
export * from './render';

// Re-export MSW utilities
export { server, setupMSW, teardownMSW, resetMSW } from './mocks/server';
export { getHandlers, resetMockData } from './mocks/handlers';

// Re-export test logger
export { testLogger, testConsoleError } from './logger';
