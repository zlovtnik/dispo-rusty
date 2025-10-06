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

class Logger {
  private isProduction = import.meta.env.PROD;
  private logs: LogEntry[] = [];
  private config: LoggerConfig;

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

    if (this.config.captureUserAgent) {
      entry.userAgent = navigator.userAgent;
    }

    if (this.config.captureUrl) {
      entry.url = this.sanitizeUrl(window.location.href);
    }

    return entry;
  }

  private log(level: LogEntry['level'], message: string, data?: any) {
    const entry = this.createLogEntry(level, message, data);

    // Store in memory for development debugging
    if (!this.isProduction) {
      this.logs.push(entry);
      console[level](`[${level.toUpperCase()}] ${message}`, data || '');
    }

    // Send to monitoring service in production
    if (this.isProduction) {
      this.sendToMonitoringService(entry);
    }
  }

  info(message: string, data?: any) {
    this.log('info', message, data);
  }

  warn(message: string, data?: any) {
    this.log('warn', message, data);
  }

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
        body: JSON.stringify(entry),
      }).catch(error => {
        console.error('Failed to send log:', error);
      });
      */
    } catch (error) {
      console.error('Failed to send log:', error);
    }
  }

  // Get recent logs (for debugging)
  getRecentLogs(limit = 50): LogEntry[] {
    if (this.isProduction) {
      // In production, we don't expose logs for security
      return [];
    }
    return this.logs.slice(-limit);
  }

  // Clear logs
  clearLogs() {
    this.logs = [];
    if (this.isProduction) {
      localStorage.removeItem('app_logs');
    }
  }
}

// Global error handler - with reentrancy guard to prevent infinite loops
let isLoggingError = false;

window.addEventListener('error', (event) => {
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

window.addEventListener('unhandledrejection', (event) => {
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

export const logger = new Logger();

// Performance monitoring
export const performanceMonitor = {
  mark(name: string) {
    if ('performance' in window && performance.mark) {
      performance.mark(name);
    }
  },

  measure(name: string, startMark?: string, endMark?: string) {
    if ('performance' in window && performance.measure && performance.getEntriesByName) {
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

  startTiming(name: string) {
    this.mark(`${name}-start`);
  },

  endTiming(name: string) {
    this.mark(`${name}-end`);
    this.measure(name, `${name}-start`, `${name}-end`);
  },
};
