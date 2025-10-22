/**
 * Enhanced Tenant Notifications Hook
 * Provides comprehensive feedback for tenant operations
 */

import { useCallback } from 'react';
import { App } from 'antd';
import type { Tenant } from '@/types/tenant';

export interface TenantNotificationOptions {
  showSuccess?: boolean;
  showError?: boolean;
  showWarning?: boolean;
  showInfo?: boolean;
  duration?: number;
  placement?: 'top' | 'topLeft' | 'topRight' | 'bottom' | 'bottomLeft' | 'bottomRight';
}

export interface TenantOperationResult {
  success: boolean;
  message: string;
  tenant?: Tenant;
  error?: string;
  warnings?: string[];
}

/**
 * Hook for managing tenant-related notifications
 * @param options - Configuration options for notifications
 * @returns Object with notification methods
 */
export const useTenantNotifications = (options: TenantNotificationOptions = {}) => {
  const { notification } = App.useApp();
  const {
    showSuccess = true,
    showError = true,
    showWarning = true,
    showInfo = true,
    duration = 4.5,
    placement = 'topRight',
  } = options;

  const showSuccessNotification = useCallback(
    (content: string, description?: string) => {
      if (!showSuccess) return;

      notification.success({
        message: content,
        description,
        duration,
        placement,
        style: {
          marginTop: 24,
        },
      });
    },
    [notification, showSuccess, duration, placement]
  );

  const showErrorNotification = useCallback(
    (content: string, description?: string) => {
      if (!showError) return;

      notification.error({
        message: content,
        description,
        duration: 0, // Error notifications stay until manually closed
        placement,
        style: {
          marginTop: 24,
        },
      });
    },
    [notification, showError, placement]
  );

  const showWarningNotification = useCallback(
    (content: string, description?: string) => {
      if (!showWarning) return;

      notification.warning({
        message: content,
        description,
        duration,
        placement,
        style: {
          marginTop: 24,
        },
      });
    },
    [notification, showWarning, duration, placement]
  );

  const showInfoNotification = useCallback(
    (content: string, description?: string) => {
      if (!showInfo) return;

      notification.info({
        message: content,
        description,
        duration,
        placement,
        style: {
          marginTop: 24,
        },
      });
    },
    [notification, showInfo, duration, placement]
  );

  // Tenant-specific notification methods
  const notifyTenantCreated = useCallback(
    (tenant: Tenant) => {
      showSuccessNotification(
        'Tenant Created Successfully',
        `Tenant "${tenant.name}" has been created and is ready to use.`
      );
    },
    [showSuccessNotification]
  );

  const notifyTenantUpdated = useCallback(
    (tenant: Tenant) => {
      showSuccessNotification(
        'Tenant Updated Successfully',
        `Tenant "${tenant.name}" has been updated with new configuration.`
      );
    },
    [showSuccessNotification]
  );

  const notifyTenantDeleted = useCallback(
    (tenantName: string) => {
      showSuccessNotification(
        'Tenant Deleted Successfully',
        `Tenant "${tenantName}" and all associated data have been removed.`
      );
    },
    [showSuccessNotification]
  );

  const notifyTenantError = useCallback(
    (operation: string, error: string, tenantName?: string) => {
      showErrorNotification(
        `Failed to ${operation} Tenant`,
        tenantName
          ? `Unable to ${operation.toLowerCase()} tenant "${tenantName}": ${error}`
          : `Unable to ${operation.toLowerCase()} tenant: ${error}`
      );
    },
    [showErrorNotification]
  );

  const notifyValidationError = useCallback(
    (errors: Record<string, string>) => {
      const errorMessages = Object.entries(errors).map(([field, error]) => `${field}: ${error}`);
      showErrorNotification(
        'Validation Failed',
        `Please correct the following errors:\n${errorMessages.join('\n')}`
      );
    },
    [showErrorNotification]
  );

  const notifyDatabaseConnectionWarning = useCallback(
    (tenant: Tenant) => {
      showWarningNotification(
        'Database Connection Warning',
        `Tenant "${tenant.name}" has an invalid or missing database URL. Please update the configuration.`
      );
    },
    [showWarningNotification]
  );

  const notifyTenantHealthCheck = useCallback(
    (tenant: Tenant, isHealthy: boolean) => {
      if (isHealthy) {
        showInfoNotification(
          'Tenant Health Check Passed',
          `Tenant "${tenant.name}" is running normally.`
        );
      } else {
        showWarningNotification(
          'Tenant Health Check Failed',
          `Tenant "${tenant.name}" is experiencing issues. Please check the configuration.`
        );
      }
    },
    [showInfoNotification, showWarningNotification]
  );

  const notifyBulkOperation = useCallback(
    (operation: string, successCount: number, totalCount: number) => {
      if (successCount === totalCount) {
        showSuccessNotification(
          `Bulk ${operation} Completed`,
          `Successfully ${operation.toLowerCase()}ed ${successCount} tenant${successCount !== 1 ? 's' : ''}.`
        );
      } else if (successCount > 0) {
        showWarningNotification(
          `Partial ${operation} Success`,
          `${operation}ed ${successCount} of ${totalCount} tenants. ${totalCount - successCount} failed.`
        );
      } else {
        showErrorNotification(
          `Bulk ${operation} Failed`,
          `Failed to ${operation.toLowerCase()} any of the ${totalCount} selected tenants.`
        );
      }
    },
    [showSuccessNotification, showWarningNotification, showErrorNotification]
  );

  const notifyTenantLimitReached = useCallback(
    (current: number, limit: number) => {
      showWarningNotification(
        'Tenant Limit Reached',
        `You have reached the maximum number of tenants (${current}/${limit}). Please upgrade your plan to create more tenants.`
      );
    },
    [showWarningNotification]
  );

  const notifyTenantFeatureUnavailable = useCallback(
    (feature: string, plan: string) => {
      showInfoNotification(
        'Feature Not Available',
        `${feature} is not available in your current plan (${plan}). Please upgrade to access this feature.`
      );
    },
    [showInfoNotification]
  );

  // Operation result handler
  const handleOperationResult = useCallback(
    (result: TenantOperationResult, operation: string) => {
      if (result.success) {
        if (result.tenant) {
          switch (operation) {
            case 'create':
              notifyTenantCreated(result.tenant);
              break;
            case 'update':
              notifyTenantUpdated(result.tenant);
              break;
            case 'delete':
              notifyTenantDeleted(result.tenant.name);
              break;
            default:
              showSuccessNotification(result.message);
          }
        } else {
          showSuccessNotification(result.message);
        }
      } else {
        if (result.error) {
          notifyTenantError(operation, result.error, result.tenant?.name);
        }

        if (result.warnings && result.warnings.length > 0) {
          result.warnings.forEach(warning => {
            showWarningNotification('Warning', warning);
          });
        }
      }
    },
    [
      notifyTenantCreated,
      notifyTenantUpdated,
      notifyTenantDeleted,
      notifyTenantError,
      showSuccessNotification,
      showWarningNotification,
    ]
  );

  return {
    // Basic notifications
    showSuccessNotification,
    showErrorNotification,
    showWarningNotification,
    showInfoNotification,

    // Tenant-specific notifications
    notifyTenantCreated,
    notifyTenantUpdated,
    notifyTenantDeleted,
    notifyTenantError,
    notifyValidationError,
    notifyDatabaseConnectionWarning,
    notifyTenantHealthCheck,
    notifyBulkOperation,
    notifyTenantLimitReached,
    notifyTenantFeatureUnavailable,

    // Result handler
    handleOperationResult,
  };
};
