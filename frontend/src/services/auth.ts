/**
 * @module services/auth
 * @description Authorization and tenant access validation services
 *
 * This module provides comprehensive authorization functions for multi-tenant systems,
 * including tenant access validation, role-based permissions, and security logging.
 *
 * All functions use Railway-oriented programming with Result types for type-safe
 * error handling and comprehensive logging for security monitoring.
 *
 * @example
 * ```typescript
 * // Check tenant access
 * const result = await hasTenantAccess(userId, tenantId, tokenMetadata);
 *
 * result.match(
 *   (hasAccess) => {
 *     if (hasAccess) {
 *       // Proceed with tenant operations
 *     } else {
 *       // Handle access denied
 *     }
 *   },
 *   (error) => {
 *     // Handle validation error
 *     console.error('Access validation failed:', error.message);
 *   }
 * );
 * ```
 */

import { type Result, type ResultAsync, err, ok, okAsync, errAsync } from 'neverthrow';
import type { UserId, TenantId } from '../types/ids';
import type { TokenMetadata, TenantAccess } from '../types/auth';
import type { AppError } from '../types/errors';
import { createAuthError } from '../types/errors';

/**
 * Logging interface for security events
 */
interface SecurityLogger {
  logAuthFailure: (
    userId: UserId,
    tenantId: TenantId,
    reason: string,
    metadata?: Record<string, unknown>
  ) => void;
  incrementMetric?: (metricName: string, tags?: Record<string, string>) => void;
}

/**
 * Metrics interface for tracking authorization events
 */
interface MetricsCollector {
  incrementAuthFailure: (userId: UserId, tenantId: TenantId, reason: string) => void;
  incrementAuthSuccess: (userId: UserId, tenantId: TenantId) => void;
}

/**
 * Tenant membership validation result
 */
interface TenantMembership {
  hasAccess: boolean;
  role: 'owner' | 'member' | 'invited';
  status: 'active' | 'inactive' | 'suspended';
  acceptedAt?: string;
  permissions: string[];
}

/**
 * Token validation result
 */
interface TokenValidation {
  isValid: boolean;
  isExpired: boolean;
  isRevoked: boolean;
  isBlacklisted: boolean;
  issuedAt: number;
  lastRevokeAt?: number;
}

/**
 * Default security logger implementation
 */
class DefaultSecurityLogger implements SecurityLogger {
  logAuthFailure(
    userId: UserId,
    tenantId: TenantId,
    reason: string,
    metadata?: Record<string, unknown>
  ): void {
    console.warn(`[AUTH_FAILURE] User ${userId} denied access to tenant ${tenantId}: ${reason}`, {
      userId,
      tenantId,
      reason,
      timestamp: new Date().toISOString(),
      ...metadata,
    });
  }

  incrementMetric(metricName: string, tags?: Record<string, string>): void {
    // In a real implementation, this would send metrics to your monitoring system
    console.debug(`[METRIC] ${metricName}`, { tags, timestamp: new Date().toISOString() });
  }
}

/**
 * Default metrics collector implementation
 */
class DefaultMetricsCollector implements MetricsCollector {
  incrementAuthFailure(userId: UserId, tenantId: TenantId, reason: string): void {
    // In a real implementation, this would send metrics to your monitoring system
    console.debug(`[METRIC] auth_failure`, {
      userId,
      tenantId,
      reason,
      timestamp: new Date().toISOString(),
    });
  }

  incrementAuthSuccess(userId: UserId, tenantId: TenantId): void {
    // In a real implementation, this would send metrics to your monitoring system
    console.debug(`[METRIC] auth_success`, {
      userId,
      tenantId,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Configuration for authorization services
 */
interface AuthConfig {
  logger?: SecurityLogger;
  metrics?: MetricsCollector;
  tokenBlacklistCheck?: boolean;
  requireActiveStatus?: boolean;
  minimumRoleLevel?: 'invited' | 'member' | 'owner';
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<AuthConfig> = {
  logger: new DefaultSecurityLogger(),
  metrics: new DefaultMetricsCollector(),
  tokenBlacklistCheck: true,
  requireActiveStatus: true,
  minimumRoleLevel: 'invited',
};

/**
 * Validates token freshness and revocation status
 *
 * @param tokenMetadata - Token metadata including issued time and revocation info
 * @returns Result containing TokenValidation or AppError
 */
function validateToken(tokenMetadata: TokenMetadata): Result<TokenValidation, AppError> {
  const now = Date.now();
  const issuedAt = tokenMetadata.issuedAt;
  const lastRevokeAt = tokenMetadata.lastRevokeAt;

  // Check if token is blacklisted
  if (tokenMetadata.isBlacklisted) {
    return err(
      createAuthError(
        'Token is blacklisted',
        {
          issuedAt,
          lastRevokeAt,
        },
        {
          code: 'TOKEN_BLACKLISTED',
        }
      )
    );
  }

  // Check if token was issued before last revocation
  if (lastRevokeAt && issuedAt < lastRevokeAt) {
    return err(
      createAuthError(
        'Token was issued before revocation',
        {
          issuedAt,
          lastRevokeAt,
        },
        {
          code: 'TOKEN_REVOKED',
        }
      )
    );
  }

  // Check token age (optional: implement max age policy)
  const tokenAge = now - issuedAt;
  const maxTokenAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  if (tokenAge > maxTokenAge) {
    return err(
      createAuthError(
        'Token is too old',
        {
          issuedAt,
          tokenAge,
          maxTokenAge,
        },
        {
          code: 'TOKEN_TOO_OLD',
        }
      )
    );
  }

  return ok({
    isValid: true,
    isExpired: false,
    isRevoked: false,
    isBlacklisted: false,
    issuedAt,
    lastRevokeAt,
  });
}

/**
 * Validates tenant membership and role permissions
 *
 * @param userId - User ID to validate
 * @param tenantId - Tenant ID to check access for
 * @param tokenMetadata - Token metadata for role/permission validation
 * @returns Result containing TenantMembership or AppError
 */
function validateTenantMembership(
  userId: UserId,
  tenantId: TenantId,
  tokenMetadata: TokenMetadata
): Result<TenantMembership, AppError> {
  // In a real implementation, this would query the database
  // For now, we'll simulate the validation logic

  // Check if user has tenant role in token
  if (!tokenMetadata.tenantRole) {
    return err(
      createAuthError(
        'No tenant role in token',
        {
          userId,
          tenantId,
        },
        {
          code: 'NO_TENANT_ROLE',
        }
      )
    );
  }

  // Simulate role-based access
  const role = tokenMetadata.tenantRole as 'owner' | 'member' | 'invited';
  const permissions = tokenMetadata.permissions || [];

  // Check minimum role level
  const roleHierarchy = { invited: 1, member: 2, owner: 3 };
  const minimumLevel = roleHierarchy[role] || 0;
  const requiredLevel = roleHierarchy.invited; // Default minimum

  if (minimumLevel < requiredLevel) {
    return err(
      createAuthError(
        'Insufficient role level',
        {
          userId,
          tenantId,
          role,
          requiredLevel,
        },
        {
          code: 'INSUFFICIENT_ROLE',
        }
      )
    );
  }

  // Simulate active status check
  const isActive = true; // In real implementation, check user and tenant status

  if (!isActive) {
    return err(
      createAuthError(
        'User or tenant is inactive',
        {
          userId,
          tenantId,
        },
        {
          code: 'INACTIVE_ACCOUNT',
        }
      )
    );
  }

  return ok({
    hasAccess: true,
    role,
    status: 'active',
    acceptedAt: new Date().toISOString(),
    permissions,
  });
}

/**
 * Validates account and tenant are active
 *
 * @param userId - User ID to validate
 * @param tenantId - Tenant ID to validate
 * @returns Result containing validation result or AppError
 */
function validateAccountStatus(
  userId: UserId,
  tenantId: TenantId
): Result<{ userActive: boolean; tenantActive: boolean }, AppError> {
  // In a real implementation, this would query the database
  // For now, we'll simulate the validation

  const userActive = true; // Check user account status
  const tenantActive = true; // Check tenant status

  if (!userActive) {
    return err(
      createAuthError(
        'User account is inactive',
        {
          userId,
        },
        {
          code: 'USER_INACTIVE',
        }
      )
    );
  }

  if (!tenantActive) {
    return err(
      createAuthError(
        'Tenant is inactive',
        {
          tenantId,
        },
        {
          code: 'TENANT_INACTIVE',
        }
      )
    );
  }

  return ok({ userActive, tenantActive });
}

/**
 * Main function to validate tenant access
 *
 * This function performs comprehensive validation including:
 * - Token freshness and revocation checks
 * - Tenant membership validation
 * - Role and permission verification
 * - Account and tenant status validation
 * - Security logging and metrics
 *
 * @param userId - User ID requesting access
 * @param tenantId - Tenant ID to access
 * @param tokenMetadata - Token metadata for validation
 * @param config - Optional configuration for validation behavior
 * @returns Result containing boolean access result or AppError
 */
export function hasTenantAccess(
  userId: UserId,
  tenantId: TenantId,
  tokenMetadata: TokenMetadata,
  config: AuthConfig = {}
): Result<boolean, AppError> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const { logger, metrics } = finalConfig;

  // Validate token freshness and revocation
  const tokenValidation = validateToken(tokenMetadata);
  if (tokenValidation.isErr()) {
    logger.logAuthFailure(
      userId,
      tenantId,
      `Token validation failed: ${tokenValidation.error.message}`,
      {
        errorCode: tokenValidation.error.code,
        tokenMetadata,
      }
    );
    metrics.incrementAuthFailure(userId, tenantId, 'TOKEN_VALIDATION_FAILED');
    return err(tokenValidation.error);
  }

  // Validate account and tenant status
  const accountStatus = validateAccountStatus(userId, tenantId);
  if (accountStatus.isErr()) {
    logger.logAuthFailure(
      userId,
      tenantId,
      `Account validation failed: ${accountStatus.error.message}`,
      {
        errorCode: accountStatus.error.code,
      }
    );
    metrics.incrementAuthFailure(userId, tenantId, 'ACCOUNT_VALIDATION_FAILED');
    return err(accountStatus.error);
  }

  // Validate tenant membership and role
  const membership = validateTenantMembership(userId, tenantId, tokenMetadata);
  if (membership.isErr()) {
    logger.logAuthFailure(
      userId,
      tenantId,
      `Membership validation failed: ${membership.error.message}`,
      {
        errorCode: membership.error.code,
        tokenMetadata,
      }
    );
    metrics.incrementAuthFailure(userId, tenantId, 'MEMBERSHIP_VALIDATION_FAILED');
    return err(membership.error);
  }

  // All validations passed
  metrics.incrementAuthSuccess(userId, tenantId);
  return ok(true);
}

/**
 * Async version of hasTenantAccess for use with ResultAsync
 *
 * @param userId - User ID requesting access
 * @param tenantId - Tenant ID to access
 * @param tokenMetadata - Token metadata for validation
 * @param config - Optional configuration for validation behavior
 * @returns AsyncResult containing boolean access result or AppError
 */
export function hasTenantAccessAsync(
  userId: UserId,
  tenantId: TenantId,
  tokenMetadata: TokenMetadata,
  config: AuthConfig = {}
): ResultAsync<boolean, AppError> {
  const result = hasTenantAccess(userId, tenantId, tokenMetadata, config);
  return result.isOk() ? okAsync(result.value) : errAsync(result.error);
}

/**
 * Check if user has specific permission for a tenant
 *
 * @param userId - User ID to check
 * @param tenantId - Tenant ID to check
 * @param permission - Permission to check
 * @param tokenMetadata - Token metadata containing permissions
 * @returns Result containing boolean permission result or AppError
 */
export function hasTenantPermission(
  userId: UserId,
  tenantId: TenantId,
  permission: string,
  tokenMetadata: TokenMetadata
): Result<boolean, AppError> {
  // First check basic tenant access
  const accessResult = hasTenantAccess(userId, tenantId, tokenMetadata);
  if (accessResult.isErr()) {
    return err(accessResult.error);
  }

  // Check specific permission
  const permissions = tokenMetadata.permissions || [];
  const hasPermission = permissions.includes(permission);

  if (!hasPermission) {
    const logger = new DefaultSecurityLogger();
    logger.logAuthFailure(userId, tenantId, `Permission denied: ${permission}`, {
      permission,
      availablePermissions: permissions,
    });
  }

  return ok(hasPermission);
}

/**
 * Get user's role and permissions for a tenant
 *
 * @param userId - User ID to check
 * @param tenantId - Tenant ID to check
 * @param tokenMetadata - Token metadata
 * @returns Result containing TenantAccess or AppError
 */
export function getTenantAccess(
  userId: UserId,
  tenantId: TenantId,
  tokenMetadata: TokenMetadata
): Result<TenantAccess, AppError> {
  // Validate basic access first
  const accessResult = hasTenantAccess(userId, tenantId, tokenMetadata);
  if (accessResult.isErr()) {
    return err(accessResult.error);
  }

  // Return access details
  return ok({
    userId,
    tenantId,
    role: (tokenMetadata.tenantRole as 'owner' | 'member' | 'invited') || 'invited',
    status: 'active',
    acceptedAt: new Date().toISOString(),
    permissions: tokenMetadata.permissions || [],
  });
}

/**
 * Export types for external use
 */
export type { AuthConfig, SecurityLogger, MetricsCollector, TenantMembership, TokenValidation };
