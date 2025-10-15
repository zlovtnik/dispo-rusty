/**
 * Test Logger Utility
 *
 * Provides a test-specific logger that can be controlled via environment variables
 * to avoid polluting test output during normal test runs.
 *
 * @example
 * ```typescript
 * import { testLogger } from './test-utils/logger';
 *
 * testLogger.error('This will only log if DEBUG_TEST_LOGS is set');
 * ```
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Test logger that respects environment variables for controlling output
 */
export const testLogger = {
  /**
   * Log debug messages - only shown when DEBUG_TEST_LOGS includes 'debug' or 'all'
   */
  debug: (...args: unknown[]): void => {
    if (shouldLog('debug')) {
      console.debug('[TEST:DEBUG]', ...args);
    }
  },

  /**
   * Log info messages - only shown when DEBUG_TEST_LOGS includes 'info' or 'all'
   */
  info: (...args: unknown[]): void => {
    if (shouldLog('info')) {
      console.info('[TEST:INFO]', ...args);
    }
  },

  /**
   * Log warning messages - only shown when DEBUG_TEST_LOGS includes 'warn' or 'all'
   */
  warn: (...args: unknown[]): void => {
    if (shouldLog('warn')) {
      console.warn('[TEST:WARN]', ...args);
    }
  },

  /**
   * Log error messages - only shown when DEBUG_TEST_LOGS includes 'error' or 'all'
   */
  error: (...args: unknown[]): void => {
    if (shouldLog('error')) {
      console.error('[TEST:ERROR]', ...args);
    }
  },
};

/**
 * Check if logging should be enabled for a given level
 */
function shouldLog(level: LogLevel): boolean {
  // Check for DEBUG_TEST_LOGS environment variable
  const debugLogs = process.env.DEBUG_TEST_LOGS;

  if (!debugLogs) {
    return false;
  }

  const enabledLevels = debugLogs.toLowerCase().split(',').map(s => s.trim());

  return enabledLevels.includes('all') || enabledLevels.includes(level);
}

/**
 * Legacy console.error wrapper for backward compatibility
 * @deprecated Use testLogger.error instead
 */
export const testConsoleError = (...args: unknown[]): void => {
  testLogger.error(...args);
};