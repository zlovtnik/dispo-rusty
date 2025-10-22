interface LoggerConfig {
  captureUserAgent?: boolean;
  captureUrl?: boolean;
  sensitiveParams?: string[];
}

interface LogEntry {
  level: 'info' | 'warn' | 'error';
  message: string;
  data?: any;
  timestamp: string;
  userAgent?: string;
  url?: string;
}

/**
 * Logger class for structured logging with production monitoring support
 */
class Logger {
  private isProduction = import.meta.env.PROD;
  private logs: LogEntry[] = [];
  private config: LoggerConfig;

  /**
   * Creates a new Logger instance
   * @param config - Configuration options for the logger
   */
  constructor(config: LoggerConfig = {}) {
    this.config = {
      captureUserAgent: false,
      captureUrl: false,
      sensitiveParams: ['token', 'session', 'api_key', 'password', 'secret'],
      ...config,
    };
  }

  private sanitizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      // Remove sensitive query params
      this.config.sensitiveParams?.forEach(param => {
        urlObj.searchParams.delete(param);
      });
      // Clear URL fragments
      urlObj.hash = '';
      return urlObj.toString();
    } catch {
      // If parsing fails, return a placeholder
      return '<invalid-url>';
    }
  }

  private createLogEntry(level: LogEntry['level'], message: string, data?: any): LogEntry {
    // What is considered safe to log by default:
    // - level and message (required)
    // - timestamp (safe)
    // - data (caller responsibility)
    // - userAgent and url are opt-in and sanitized
    const entry: LogEntry = {
      level,
      message,
      data,
      timestamp: new Date().toISOString(),
    };

    if (this.config.captureUserAgent && typeof navigator !== 'undefined') {
      entry.userAgent = navigator.userAgent;
    }

    if (this.config.captureUrl && typeof window !== 'undefined') {
      entry.url = this.sanitizeUrl(window.location.href);
    }

    return entry;
  }

  private log(level: LogEntry['level'], message: string, data?: any) {
    const entry = this.createLogEntry(level, message, data);

    // Store in memory for development debugging
    if (!this.isProduction) {
      this.logs.push(entry);
      if (level === 'warn' || level === 'error') {
        console[level](`[${level.toUpperCase()}] ${message}`, data);
      }
    }

    // Send to monitoring service in production
    if (this.isProduction) {
      this.sendToMonitoringService(entry);
    }
  }

  /**
   * Log an info message
   * @param message - The message to log
   * @param data - Optional additional data to include
   */
  info(message: string, data?: any) {
    this.log('info', message, data);
  }

  /**
   * Log a warning message
   * @param message - The message to log
   * @param data - Optional additional data to include
   */
  warn(message: string, data?: any) {
    this.log('warn', message, data);
  }

  /**
   * Log an error message
   * @param message - The message to log
   * @param data - Optional additional data to include
   */
  error(message: string, data?: any) {
    this.log('error', message, data);
  }

  private sendToMonitoringService(entry: LogEntry) {
    // Replace with your monitoring service endpoint
    // Example: Sentry, LogRocket, or custom logging endpoint
    try {
      // For now, just store in localStorage for debugging
      const existingLogs = localStorage.getItem('app_logs') || '[]';
      const logs = JSON.parse(existingLogs);
      logs.push(entry);

      // Keep only last 100 entries
      if (logs.length > 100) {
        logs.splice(0, logs.length - 100);
      }

      localStorage.setItem('app_logs', JSON.stringify(logs));

      // Uncomment and configure for actual monitoring service
      /*
      fetch('/api/logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      
        /**
         * @deprecated Use performanceMonitor.mark and performanceMonitor.measure instead.
         * Starts a timing measurement (deprecated).
         * @param name - Name of the timing
         */
        startTiming(name: string) {
          console.warn(
            '[DEPRECATED] performanceMonitor.startTiming is deprecated. Use performanceMonitor.mark and performanceMonitor.measure instead.'
          );
          this.mark(`start-${name}`);
        },
      
        /**
         * @deprecated Use performanceMonitor.mark and performanceMonitor.measure instead.
         * Ends a timing measurement and logs the duration (deprecated).
         * @param name - Name of the timing
         */
        endTiming(name: string) {
          console.warn(
            '[DEPRECATED] performanceMonitor.endTiming is deprecated. Use performanceMonitor.mark and performanceMonitor.measure instead.'
          );
          const startMark = `start-${name}`;
          const endMark = `end-${name}`;
          this.mark(endMark);
          this.measure(name, startMark, endMark);
        },
        body: JSON.stringify(entry),
      }).catch(error => {
        console.error('Failed to send log:', error);
      });
      */
    } catch (error) {
      console.error('Failed to send log:', error);
    }
  }

  /**
   * Get recent logs for debugging (development only)
   * @param limit - Maximum number of logs to return
   * @returns Array of recent log entries
   */
  getRecentLogs(limit = 50): LogEntry[] {
    if (this.isProduction) {
      // In production, we don't expose logs for security
      return [];
    }
    return this.logs.slice(-limit);
  }

  /**
   * Clear stored logs
   */
  clearLogs() {
    this.logs = [];
    if (this.isProduction) {
      localStorage.removeItem('app_logs');
    }
  }

  /**
   * Check if running in production environment
   * @returns true if in production
   */
  static isProduction(): boolean {
    return import.meta.env.PROD;
  }
}

// Global error handler - with reentrancy guard to prevent infinite loops
let isLoggingError = false;

// Only add global error handlers if window is available (i.e., in browser environment)
if (typeof window !== 'undefined') {
  window.addEventListener('error', event => {
    if (isLoggingError) return; // Prevent reentrancy

    isLoggingError = true;
    try {
      logger.error('Global error', {
        message: event.error?.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
      });
    } catch (loggingError) {
      // Fallback to console if logging itself fails
      console.error('Global error:', event.error?.message, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    } finally {
      isLoggingError = false;
    }
  });

  window.addEventListener('unhandledrejection', event => {
    if (isLoggingError) return; // Prevent reentrancy

    isLoggingError = true;
    try {
      logger.error('Unhandled promise rejection', {
        reason: event.reason,
        promise: event.promise,
      });
    } catch (loggingError) {
      // Fallback to console if logging itself fails
      console.error('Unhandled promise rejection:', event.reason);
    } finally {
      isLoggingError = false;
    }
  });
}

/**
 * Global logger instance for application-wide logging
 */
export const logger = new Logger();

// Environment configuration for address parsing logger
const debugEnabled = import.meta.env.VITE_DEBUG_ADDRESS_PARSING === 'true';

/**
 * Determines if logging should occur based on environment settings
 * @returns true if logging should occur (not production OR debug enabled)
 */
const shouldLog = (): boolean => !Logger.isProduction() || debugEnabled;

/**
 * Specialized logger for address parsing operations that respects VITE_DEBUG_ADDRESS_PARSING environment variable
 */
export const addressParsingLogger = {
  /**
   * Log debug information for address parsing steps and intermediate values
   * @param message - Debug message
   * @param data - Optional additional data
   */
  debug(message: string, data?: any) {
    if (shouldLog()) {
      logger.info(`[DEBUG] ${message}`, data);
    }
  },

  /**
   * Log general information about address parsing operations
   * @param message - Info message
   * @param data - Optional additional data
   */
  info(message: string, data?: any) {
    if (shouldLog()) {
      logger.info(message, data);
    }
  },

  /**
   * Log warnings for non-critical issues during address parsing
   * @param message - Warning message
   * @param data - Optional additional data
   */
  warn(message: string, data?: any) {
    if (shouldLog()) {
      logger.warn(message, data);
    }
  },

  /**
   * Log critical errors in address parsing that prevent successful completion
   * @param message - Error message
   * @param data - Optional additional data
   */
  error(message: string, data?: any) {
    // Always emit critical errors in production
    logger.error(message, data);
    // TODO: add extra debug output here for non-production debugging
  },
};

/**
 * Performance monitoring utilities for measuring execution times
 */
export const performanceMonitor = {
  /**
   * Mark a performance point in time
   * @param name - Name of the performance mark
   */
  mark(name: string) {
    if (typeof window !== 'undefined' && 'performance' in window && performance.mark) {
      performance.mark(name);
    }
  },

  /**
   * Measure the duration between two performance marks
   * @param name - Name for the measurement
   * @param startMark - Starting performance mark
   * @param endMark - Ending performance mark
   */
  measure(name: string, startMark?: string, endMark?: string) {
    if (
      typeof window !== 'undefined' &&
      'performance' in window &&
      performance.measure &&
      performance.getEntriesByName
    ) {
      try {
        const measureName = `measure-${name}`;
        performance.measure(measureName, startMark, endMark);
        const measure = performance.getEntriesByName(measureName)[0];
        if (measure) {
          logger.info(`Performance measure: ${name}`, {
            duration: measure.duration,
            startTime: measure.startTime,
          });
        }
      } catch (error) {
        logger.warn(`Failed to measure performance: ${name}`, error);
      }
    }
  },
};
