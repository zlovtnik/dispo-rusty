/**
 * Tenant Health Monitoring Service
 * Provides comprehensive health monitoring for tenant infrastructure
 */

import { ok, err } from 'neverthrow';
import type { Result } from '@/types/fp';
import type { AppError } from '@/types/errors';
import type { Tenant } from '@/types/tenant';
import { tenantContextService } from './TenantContextService';
import { tenantIsolationService } from './TenantIsolationService';

/**
 * Health check result interface
 */
export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  score: number; // 0-100
  checks: {
    database: HealthCheck;
    api: HealthCheck;
    storage: HealthCheck;
    performance: HealthCheck;
    features: HealthCheck;
  };
  timestamp: Date;
  issues: string[];
  recommendations: string[];
}

/**
 * Individual health check interface
 */
export interface HealthCheck {
  status: 'pass' | 'fail' | 'warn';
  message: string;
  details?: Record<string, any>;
  lastChecked: Date;
}

/**
 * Performance metrics interface
 */
export interface PerformanceMetrics {
  responseTime: number;
  errorRate: number;
  uptime: number;
  throughput: number;
  latency: number;
  memoryUsage: number;
  cpuUsage: number;
}

/**
 * Health monitoring configuration
 */
export interface HealthMonitoringConfig {
  checkInterval: number; // milliseconds
  timeout: number; // milliseconds
  retries: number;
  thresholds: {
    responseTime: number;
    errorRate: number;
    uptime: number;
    memoryUsage: number;
    cpuUsage: number;
  };
}

/**
 * Tenant health monitoring service class
 */
export class TenantHealthService {
  private static instance: TenantHealthService;
  private healthChecks = new Map<string, HealthCheckResult>();
  private monitoringConfig: HealthMonitoringConfig;
  private monitoringInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.monitoringConfig = {
      checkInterval: 60000, // 1 minute
      timeout: 30000, // 30 seconds
      retries: 3,
      thresholds: {
        responseTime: 500, // 500ms
        errorRate: 5, // 5%
        uptime: 95, // 95%
        memoryUsage: 80, // 80%
        cpuUsage: 80, // 80%
      },
    };
  }

  static getInstance(): TenantHealthService {
    if (!TenantHealthService.instance) {
      TenantHealthService.instance = new TenantHealthService();
    }
    return TenantHealthService.instance;
  }

  /**
   * Start health monitoring for tenant
   */
  startMonitoring(tenantId: string): void {
    if (this.monitoringInterval) {
      return; // Already monitoring
    }

    this.monitoringInterval = setInterval(async () => {
      await this.performHealthCheck(tenantId);
    }, this.monitoringConfig.checkInterval);
  }

  /**
   * Stop health monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck(tenantId: string): Promise<Result<HealthCheckResult, AppError>> {
    try {
      const checks = await Promise.all([
        this.checkDatabaseHealth(tenantId),
        this.checkApiHealth(tenantId),
        this.checkStorageHealth(tenantId),
        this.checkPerformanceHealth(tenantId),
        this.checkFeaturesHealth(tenantId),
      ]);

      const [databaseCheck, apiCheck, storageCheck, performanceCheck, featuresCheck] = checks;

      const healthResult: HealthCheckResult = {
        status: 'healthy',
        score: 100,
        checks: {
          database: databaseCheck,
          api: apiCheck,
          storage: storageCheck,
          performance: performanceCheck,
          features: featuresCheck,
        },
        timestamp: new Date(),
        issues: [],
        recommendations: [],
      };

      // Calculate overall health score
      const checkResults = [databaseCheck, apiCheck, storageCheck, performanceCheck, featuresCheck];
      const failedChecks = checkResults.filter(check => check.status === 'fail').length;
      const warningChecks = checkResults.filter(check => check.status === 'warn').length;

      if (failedChecks > 0) {
        healthResult.status = 'unhealthy';
        healthResult.score = Math.max(0, 100 - failedChecks * 20);
      } else if (warningChecks > 0) {
        healthResult.status = 'degraded';
        healthResult.score = Math.max(0, 100 - warningChecks * 10);
      }

      // Collect issues and recommendations
      checkResults.forEach(check => {
        if (check.status === 'fail') {
          healthResult.issues.push(check.message);
        } else if (check.status === 'warn') {
          healthResult.issues.push(check.message);
        }
      });

      // Generate recommendations
      this.generateRecommendations(healthResult);

      // Store health check result
      this.healthChecks.set(tenantId, healthResult);

      return ok(healthResult);
    } catch (error) {
      return err({
        type: 'HEALTH_CHECK_FAILED',
        message: 'Failed to perform health check',
        cause: error,
      });
    }
  }

  /**
   * Check database health
   */
  private async checkDatabaseHealth(tenantId: string): Promise<HealthCheck> {
    try {
      const startTime = Date.now();

      // Test database connection
      const connectionResult = await tenantIsolationService.getTenantConnection(tenantId);
      if (connectionResult.isErr()) {
        return {
          status: 'fail',
          message: 'Database connection failed',
          details: { error: connectionResult.error.message },
          lastChecked: new Date(),
        };
      }

      // Test query execution
      const queryResult = await tenantIsolationService.executeTenantQuery('SELECT 1 as test', []);

      if (queryResult.isErr()) {
        return {
          status: 'fail',
          message: 'Database query failed',
          details: { error: queryResult.error.message },
          lastChecked: new Date(),
        };
      }

      const responseTime = Date.now() - startTime;

      if (responseTime > this.monitoringConfig.thresholds.responseTime) {
        return {
          status: 'warn',
          message: `Database response time is high: ${responseTime}ms`,
          details: { responseTime, threshold: this.monitoringConfig.thresholds.responseTime },
          lastChecked: new Date(),
        };
      }

      return {
        status: 'pass',
        message: 'Database is healthy',
        details: { responseTime },
        lastChecked: new Date(),
      };
    } catch (error) {
      return {
        status: 'fail',
        message: 'Database health check failed',
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
        lastChecked: new Date(),
      };
    }
  }

  /**
   * Check API health
   */
  private async checkApiHealth(tenantId: string): Promise<HealthCheck> {
    try {
      // Mock API health check
      // In a real implementation, you would make actual API calls
      const responseTime = Math.random() * 200 + 50; // Mock response time
      const errorRate = Math.random() * 10; // Mock error rate

      if (errorRate > this.monitoringConfig.thresholds.errorRate) {
        return {
          status: 'fail',
          message: `API error rate is high: ${errorRate.toFixed(1)}%`,
          details: { errorRate, threshold: this.monitoringConfig.thresholds.errorRate },
          lastChecked: new Date(),
        };
      }

      if (responseTime > this.monitoringConfig.thresholds.responseTime) {
        return {
          status: 'warn',
          message: `API response time is high: ${responseTime.toFixed(0)}ms`,
          details: { responseTime, threshold: this.monitoringConfig.thresholds.responseTime },
          lastChecked: new Date(),
        };
      }

      return {
        status: 'pass',
        message: 'API is healthy',
        details: { responseTime, errorRate },
        lastChecked: new Date(),
      };
    } catch (error) {
      return {
        status: 'fail',
        message: 'API health check failed',
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
        lastChecked: new Date(),
      };
    }
  }

  /**
   * Check storage health
   */
  private async checkStorageHealth(tenantId: string): Promise<HealthCheck> {
    try {
      // Mock storage health check
      const storageUsed = Math.random() * 100; // Mock storage usage percentage
      const storageLimit = 100;

      if (storageUsed > this.monitoringConfig.thresholds.memoryUsage) {
        return {
          status: 'warn',
          message: `Storage usage is high: ${storageUsed.toFixed(1)}%`,
          details: { storageUsed, threshold: this.monitoringConfig.thresholds.memoryUsage },
          lastChecked: new Date(),
        };
      }

      return {
        status: 'pass',
        message: 'Storage is healthy',
        details: { storageUsed, storageLimit },
        lastChecked: new Date(),
      };
    } catch (error) {
      return {
        status: 'fail',
        message: 'Storage health check failed',
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
        lastChecked: new Date(),
      };
    }
  }

  /**
   * Check performance health
   */
  private async checkPerformanceHealth(tenantId: string): Promise<HealthCheck> {
    try {
      // Mock performance metrics
      const metrics: PerformanceMetrics = {
        responseTime: Math.random() * 300 + 50,
        errorRate: Math.random() * 5,
        uptime: Math.random() * 10 + 90,
        throughput: Math.random() * 1000 + 100,
        latency: Math.random() * 100 + 10,
        memoryUsage: Math.random() * 100,
        cpuUsage: Math.random() * 100,
      };

      const issues: string[] = [];

      if (metrics.responseTime > this.monitoringConfig.thresholds.responseTime) {
        issues.push(`Response time is high: ${metrics.responseTime.toFixed(0)}ms`);
      }

      if (metrics.errorRate > this.monitoringConfig.thresholds.errorRate) {
        issues.push(`Error rate is high: ${metrics.errorRate.toFixed(1)}%`);
      }

      if (metrics.uptime < this.monitoringConfig.thresholds.uptime) {
        issues.push(`Uptime is low: ${metrics.uptime.toFixed(1)}%`);
      }

      if (metrics.memoryUsage > this.monitoringConfig.thresholds.memoryUsage) {
        issues.push(`Memory usage is high: ${metrics.memoryUsage.toFixed(1)}%`);
      }

      if (metrics.cpuUsage > this.monitoringConfig.thresholds.cpuUsage) {
        issues.push(`CPU usage is high: ${metrics.cpuUsage.toFixed(1)}%`);
      }

      if (issues.length > 0) {
        return {
          status: issues.length > 2 ? 'fail' : 'warn',
          message: issues.join('; '),
          details: metrics,
          lastChecked: new Date(),
        };
      }

      return {
        status: 'pass',
        message: 'Performance is healthy',
        details: metrics,
        lastChecked: new Date(),
      };
    } catch (error) {
      return {
        status: 'fail',
        message: 'Performance health check failed',
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
        lastChecked: new Date(),
      };
    }
  }

  /**
   * Check features health
   */
  private async checkFeaturesHealth(tenantId: string): Promise<HealthCheck> {
    try {
      const context = tenantContextService.getTenantContext();
      if (!context) {
        return {
          status: 'fail',
          message: 'No tenant context available',
          lastChecked: new Date(),
        };
      }

      const features = context.features;
      const enabledFeatures = features.filter(feature => feature !== 'disabled');

      if (enabledFeatures.length === 0) {
        return {
          status: 'warn',
          message: 'No features are enabled',
          details: { features },
          lastChecked: new Date(),
        };
      }

      return {
        status: 'pass',
        message: 'Features are healthy',
        details: { enabledFeatures: enabledFeatures.length, totalFeatures: features.length },
        lastChecked: new Date(),
      };
    } catch (error) {
      return {
        status: 'fail',
        message: 'Features health check failed',
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
        lastChecked: new Date(),
      };
    }
  }

  /**
   * Generate health recommendations
   */
  private generateRecommendations(healthResult: HealthCheckResult): void {
    const recommendations: string[] = [];

    // Database recommendations
    if (healthResult.checks.database.status === 'warn') {
      recommendations.push(
        'Consider optimizing database queries or increasing connection pool size'
      );
    }

    // API recommendations
    if (healthResult.checks.api.status === 'warn') {
      recommendations.push('Consider implementing API caching or rate limiting');
    }

    // Storage recommendations
    if (healthResult.checks.storage.status === 'warn') {
      recommendations.push('Consider cleaning up old data or increasing storage capacity');
    }

    // Performance recommendations
    if (healthResult.checks.performance.status === 'warn') {
      recommendations.push('Consider scaling resources or optimizing application code');
    }

    // Features recommendations
    if (healthResult.checks.features.status === 'warn') {
      recommendations.push('Consider enabling additional features to improve functionality');
    }

    healthResult.recommendations = recommendations;
  }

  /**
   * Get health check result for tenant
   */
  getHealthCheckResult(tenantId: string): HealthCheckResult | null {
    return this.healthChecks.get(tenantId) || null;
  }

  /**
   * Get all health check results
   */
  getAllHealthCheckResults(): Map<string, HealthCheckResult> {
    return new Map(this.healthChecks);
  }

  /**
   * Get health check history
   */
  async getHealthCheckHistory(
    tenantId: string,
    limit = 100
  ): Promise<Result<HealthCheckResult[], AppError>> {
    try {
      // In a real implementation, you would fetch from a database
      // This is a mock implementation
      const history: HealthCheckResult[] = [];

      // Generate mock history
      for (let i = 0; i < limit; i++) {
        const timestamp = new Date(Date.now() - i * 60000); // 1 minute intervals
        history.push({
          status: Math.random() > 0.8 ? 'unhealthy' : Math.random() > 0.6 ? 'degraded' : 'healthy',
          score: Math.random() * 100,
          checks: {
            database: { status: 'pass', message: 'Database is healthy', lastChecked: timestamp },
            api: { status: 'pass', message: 'API is healthy', lastChecked: timestamp },
            storage: { status: 'pass', message: 'Storage is healthy', lastChecked: timestamp },
            performance: {
              status: 'pass',
              message: 'Performance is healthy',
              lastChecked: timestamp,
            },
            features: { status: 'pass', message: 'Features are healthy', lastChecked: timestamp },
          },
          timestamp,
          issues: [],
          recommendations: [],
        });
      }

      return ok(history);
    } catch (error) {
      return err({
        type: 'HISTORY_RETRIEVAL_FAILED',
        message: 'Failed to get health check history',
        cause: error,
      });
    }
  }

  /**
   * Update monitoring configuration
   */
  updateMonitoringConfig(config: Partial<HealthMonitoringConfig>): void {
    this.monitoringConfig = { ...this.monitoringConfig, ...config };
  }

  /**
   * Get monitoring configuration
   */
  getMonitoringConfig(): HealthMonitoringConfig {
    return { ...this.monitoringConfig };
  }
}

// Export singleton instance
export const tenantHealthService = TenantHealthService.getInstance();
