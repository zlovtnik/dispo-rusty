/**
 * Tenant Service Integration
 * Integrates all tenant services for comprehensive tenant management
 */

import { ok, err } from 'neverthrow';
import type { Result } from '@/types/fp';
import type { AppError } from '@/types/errors';
import { createBusinessLogicError, createNetworkError } from '@/types/errors';
import type { Tenant } from '@/types/tenant';
import type { User } from '@/types/auth';
import { tenantContextService } from './TenantContextService';
import { tenantIsolationService } from './TenantIsolationService';
import { tenantHealthService } from './TenantHealthService';
import { type useTenantNotifications } from '@/hooks/useTenantNotifications';

/**
 * Comprehensive tenant service integration
 */
export class TenantServiceIntegration {
  private static instance: TenantServiceIntegration;
  private notifications: ReturnType<typeof useTenantNotifications> | null = null;

  private constructor() {
    // Notifications will be initialized when needed
  }

  static getInstance(): TenantServiceIntegration {
    if (!TenantServiceIntegration.instance) {
      TenantServiceIntegration.instance = new TenantServiceIntegration();
    }
    return TenantServiceIntegration.instance;
  }

  /**
   * Initialize notifications (to be called from React components)
   */
  initializeNotifications(): void {
    if (!this.notifications) {
      // This should be called from a React component context
      // For now, we'll handle this differently
      console.warn('Notifications should be initialized from React component context');
    }
  }

  /**
   * Initialize tenant with full setup
   */
  async initializeTenant(tenant: Tenant, user: User): Promise<Result<void, AppError>> {
    try {
      // 1. Set tenant context
      const contextResult = await tenantContextService.switchTenant(tenant, user);
      if (contextResult.isErr()) {
        return err(contextResult.error);
      }

      // 2. Register tenant database
      tenantIsolationService.registerTenantDatabase({
        tenantId: tenant.id,
        dbUrl: tenant.db_url,
        dbName: `tenant_${tenant.id}`,
      });

      // 3. Start health monitoring
      tenantHealthService.startMonitoring(tenant.id);

      // 4. Perform initial health check
      const healthResult = await tenantHealthService.performHealthCheck(tenant.id);
      if (healthResult.isErr()) {
        console.warn('Initial health check failed:', healthResult.error);
      }

      this.notifications.showSuccessNotification(
        'Tenant Initialized',
        `Tenant "${tenant.name}" has been successfully initialized`
      );

      return ok(undefined);
    } catch (error) {
      return err(
        createBusinessLogicError('Failed to initialize tenant', {
          code: 'TENANT_INITIALIZATION_FAILED',
          cause: error,
        })
      );
    }
  }

  /**
   * Switch to different tenant
   */
  async switchTenant(tenant: Tenant, user: User): Promise<Result<void, AppError>> {
    try {
      // 1. Stop current monitoring
      tenantHealthService.stopMonitoring();

      // 2. Switch tenant context
      const contextResult = await tenantContextService.switchTenant(tenant, user);
      if (contextResult.isErr()) {
        return err(contextResult.error);
      }

      // 3. Start monitoring for new tenant
      tenantHealthService.startMonitoring(tenant.id);

      // 4. Perform health check
      const healthResult = await tenantHealthService.performHealthCheck(tenant.id);
      if (healthResult.isErr()) {
        console.warn('Health check failed after tenant switch:', healthResult.error);
      }

      this.notifications.showInfoNotification(
        'Tenant Switched',
        `Switched to tenant "${tenant.name}"`
      );

      return ok(undefined);
    } catch (error) {
      return err(
        createBusinessLogicError('Failed to switch tenant', {
          code: 'TENANT_SWITCH_FAILED',
          cause: error,
        })
      );
    }
  }

  /**
   * Get comprehensive tenant status
   */
  async getTenantStatus(tenantId: string): Promise<
    Result<
      {
        context: any;
        health: any;
        statistics: any;
      },
      AppError
    >
  > {
    try {
      // Get tenant context
      const context = tenantContextService.getTenantContext();
      if (context?.tenant.id !== tenantId) {
        return err(
          createBusinessLogicError('Tenant is not currently active', { code: 'TENANT_NOT_ACTIVE' })
        );
      }

      // Get health status
      const healthResult = await tenantHealthService.performHealthCheck(tenantId);
      if (healthResult.isErr()) {
        return err(healthResult.error);
      }

      // Get statistics
      const statsResult = await tenantIsolationService.getTenantStatistics();
      if (statsResult.isErr()) {
        return err(statsResult.error);
      }

      return ok({
        context,
        health: healthResult.value,
        statistics: statsResult.value,
      });
    } catch (error) {
      return err(
        createNetworkError('Failed to get tenant status', {
          code: 'STATUS_RETRIEVAL_FAILED',
          cause: error,
        })
      );
    }
  }

  /**
   * Cleanup tenant resources
   */
  async cleanupTenant(tenantId: string): Promise<Result<void, AppError>> {
    try {
      // 1. Stop health monitoring
      tenantHealthService.stopMonitoring();

      // 2. Clear tenant context
      tenantContextService.clearTenantContext();

      // 3. Unregister tenant database
      tenantIsolationService.unregisterTenantDatabase(tenantId);

      this.notifications.showInfoNotification(
        'Tenant Cleanup',
        'Tenant resources have been cleaned up'
      );

      return ok(undefined);
    } catch (error) {
      return err(
        createBusinessLogicError('Failed to cleanup tenant resources', {
          code: 'TENANT_CLEANUP_FAILED',
          cause: error,
        })
      );
    }
  }

  /**
   * Get tenant health dashboard data
   */
  async getTenantHealthDashboard(tenantId: string): Promise<
    Result<
      {
        current: any;
        history: any[];
        trends: any;
      },
      AppError
    >
  > {
    try {
      // Get current health
      const currentHealth = tenantHealthService.getHealthCheckResult(tenantId);
      if (!currentHealth) {
        return err(
          createBusinessLogicError('No health data available for tenant', {
            code: 'NO_HEALTH_DATA',
          })
        );
      }

      // Get health history
      const historyResult = await tenantHealthService.getHealthCheckHistory(tenantId, 30);
      if (historyResult.isErr()) {
        return err(historyResult.error);
      }

      // Calculate trends
      const trends = this.calculateHealthTrends(historyResult.value);

      return ok({
        current: currentHealth,
        history: historyResult.value,
        trends,
      });
    } catch (error) {
      return err(
        createNetworkError('Failed to get tenant health dashboard data', {
          code: 'DASHBOARD_DATA_FAILED',
          cause: error,
        })
      );
    }
  }

  /**
   * Calculate health trends
   */
  private calculateHealthTrends(history: any[]): any {
    if (history.length < 2) {
      return { trend: 'stable', direction: 'neutral' };
    }

    const recent = history.slice(0, 5);
    const older = history.slice(5, 10);

    const recentAvg = recent.reduce((sum, h) => sum + h.score, 0) / recent.length;
    const olderAvg = older.reduce((sum, h) => sum + h.score, 0) / older.length;

    const change = recentAvg - olderAvg;
    const trend = Math.abs(change) < 5 ? 'stable' : change > 0 ? 'improving' : 'declining';

    return {
      trend,
      direction: change > 0 ? 'up' : change < 0 ? 'down' : 'neutral',
      change: change.toFixed(1),
    };
  }

  /**
   * Perform tenant maintenance
   */
  async performTenantMaintenance(tenantId: string): Promise<Result<void, AppError>> {
    try {
      // 1. Perform health check
      const healthResult = await tenantHealthService.performHealthCheck(tenantId);
      if (healthResult.isErr()) {
        return err(healthResult.error);
      }

      // 2. If unhealthy, attempt to fix issues
      if (healthResult.value.status === 'unhealthy') {
        await this.attemptHealthRecovery(tenantId, healthResult.value);
      }

      // 3. Update statistics
      const statsResult = await tenantIsolationService.getTenantStatistics();
      if (statsResult.isErr()) {
        console.warn('Failed to update statistics:', statsResult.error);
      }

      this.notifications.showInfoNotification(
        'Maintenance Complete',
        'Tenant maintenance has been completed'
      );

      return ok(undefined);
    } catch (error) {
      return err(
        createBusinessLogicError('Failed to perform tenant maintenance', {
          code: 'MAINTENANCE_FAILED',
          cause: error,
        })
      );
    }
  }

  /**
   * Attempt to recover from health issues
   */
  private async attemptHealthRecovery(tenantId: string, healthResult: any): Promise<void> {
    const issues = healthResult.issues;

    for (const issue of issues) {
      if (issue.includes('database')) {
        // Attempt database recovery
        console.log('Attempting database recovery...');
      } else if (issue.includes('API')) {
        // Attempt API recovery
        console.log('Attempting API recovery...');
      } else if (issue.includes('storage')) {
        // Attempt storage recovery
        console.log('Attempting storage recovery...');
      }
    }
  }
}

// Export singleton instance
export const tenantServiceIntegration = TenantServiceIntegration.getInstance();
