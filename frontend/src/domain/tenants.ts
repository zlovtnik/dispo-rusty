/**
 * Tenant Management Domain Logic
 *
 * Pure functions for tenant management operations using Railway-Oriented Programming.
 * All functions return Result<T, E> for explicit error handling.
 *
 * This module extracts business logic from the service layer,
 * making it pure, testable, and composable.
 */

import { ok, err, type Result } from 'neverthrow';
import type { Tenant, TenantSettings, TenantSubscription } from '../types/auth';
import type { User } from '../types/auth';
import type { TenantId, UserId } from '../types/ids';

/**
 * Tenant-specific errors
 */
export type TenantError =
  | { type: 'NOT_FOUND'; tenantId: TenantId }
  | { type: 'ACCESS_DENIED'; tenantId: TenantId; userId: UserId }
  | { type: 'SUBSCRIPTION_EXPIRED'; tenantId: TenantId; expiredAt: Date }
  | { type: 'LIMIT_EXCEEDED'; limit: string; max: number; current: number }
  | { type: 'FEATURE_NOT_AVAILABLE'; feature: string; plan: string }
  | { type: 'SWITCH_FAILED'; reason: string }
  | { type: 'VALIDATION_FAILED'; errors: Record<string, string> };

/**
 * Access errors
 */
export type AccessError =
  | { type: 'UNAUTHORIZED'; message: string }
  | { type: 'FORBIDDEN'; resource: string }
  | { type: 'TENANT_MISMATCH'; expected: TenantId; actual: TenantId }
  | { type: 'SUBSCRIPTION_REQUIRED'; feature: string };

/**
 * Switch tenant errors
 */
export type SwitchError =
  | { type: 'TENANT_NOT_FOUND'; tenantId: TenantId }
  | { type: 'ACCESS_DENIED'; tenantId: TenantId }
  | { type: 'ALREADY_ACTIVE'; tenantId: TenantId }
  | { type: 'SWITCH_FAILED'; reason: string };

/**
 * Validate tenant access for a user
 *
 * Checks if user has permission to access the tenant
 *
 * @param user - User attempting access
 * @param tenantId - Tenant ID to access
 * @returns Result containing void on success or AccessError
 */
export function validateTenantAccess(user: User, tenantId: TenantId): Result<void, AccessError> {
  // Check if user's tenant matches
  if (user.tenantId !== tenantId) {
    return err({
      type: 'TENANT_MISMATCH',
      expected: user.tenantId,
      actual: tenantId,
    });
  }

  // Additional role-based checks could go here
  // For example, check if user has 'tenant:access' role

  return ok(undefined);
}

/**
 * Switch user to a different tenant
 *
 * Validates access and prepares tenant switch
 *
 * @param user - Current user
 * @param newTenant - Tenant to switch to
 * @param availableTenants - List of tenants user has access to
 * @returns Result containing new Tenant or SwitchError
 */
export function switchTenant(
  user: User,
  newTenant: Tenant,
  availableTenants: Tenant[]
): Result<Tenant, SwitchError> {
  // Check if tenant exists in available tenants
  const hasAccess = availableTenants.some(t => t.id === newTenant.id);
  if (!hasAccess) {
    return err({
      type: 'ACCESS_DENIED',
      tenantId: newTenant.id,
    });
  }

  // Check if already on this tenant
  if (user.tenantId === newTenant.id) {
    return err({
      type: 'ALREADY_ACTIVE',
      tenantId: newTenant.id,
    });
  }

  // Validate tenant subscription is active
  const subscriptionCheck = validateTenantSubscription(newTenant);
  if (subscriptionCheck.isErr()) {
    return err({
      type: 'SWITCH_FAILED',
      reason: `Tenant subscription is not active: ${subscriptionCheck.error.type}`,
    });
  }

  return ok(newTenant);
}

/**
 * Validate tenant subscription status
 *
 * @param tenant - Tenant to validate
 * @returns Result containing void on success or TenantError
 */
export function validateTenantSubscription(tenant: Tenant): Result<void, TenantError> {
  const { subscription } = tenant;

  // Check if subscription is active
  if (subscription.status === 'expired' || subscription.status === 'cancelled') {
    return err({
      type: 'SUBSCRIPTION_EXPIRED',
      tenantId: tenant.id,
      expiredAt: subscription.expiresAt || new Date(),
    });
  }

  // Check if trial has expired
  if (subscription.status === 'trial' && subscription.expiresAt) {
    const now = new Date();
    if (now > subscription.expiresAt) {
      return err({
        type: 'SUBSCRIPTION_EXPIRED',
        tenantId: tenant.id,
        expiredAt: subscription.expiresAt,
      });
    }
  }

  return ok(undefined);
}

/**
 * Check if tenant has access to a specific feature
 *
 * @param tenant - Tenant to check
 * @param feature - Feature name
 * @returns Result containing void on success or TenantError
 */
export function validateFeatureAccess(tenant: Tenant, feature: string): Result<void, TenantError> {
  // First check subscription
  const subscriptionCheck = validateTenantSubscription(tenant);
  if (subscriptionCheck.isErr()) {
    return subscriptionCheck;
  }

  // Check if feature is available in tenant settings
  if (!tenant.settings.features.includes(feature)) {
    return err({
      type: 'FEATURE_NOT_AVAILABLE',
      feature,
      plan: tenant.subscription.plan,
    });
  }

  return ok(undefined);
}

/**
 * Check if tenant is within usage limits
 *
 * @param tenant - Tenant to check
 * @param limitType - Type of limit to check ('users', 'contacts', 'storage')
 * @param currentUsage - Current usage count
 * @returns Result containing void on success or TenantError
 */
export function validateUsageLimit(
  tenant: Tenant,
  limitType: 'users' | 'contacts' | 'storage',
  currentUsage: number
): Result<void, TenantError> {
  const limit = tenant.subscription.limits[limitType];

  if (limit === -1 || limit === Infinity) {
    return ok(undefined);
  }

  if (limit === 0) {
    if (currentUsage > 0) {
      return err({
        type: 'LIMIT_EXCEEDED',
        limit: limitType,
        max: limit,
        current: currentUsage,
      });
    }
    return ok(undefined);
  }

  if (currentUsage >= limit) {
    return err({
      type: 'LIMIT_EXCEEDED',
      limit: limitType,
      max: limit,
      current: currentUsage,
    });
  }

  return ok(undefined);
}

/**
 * Get tenant display name
 *
 * @param tenant - Tenant
 * @returns Display name
 */
export function getTenantDisplayName(tenant: Tenant): string {
  return tenant.name || tenant.domain || tenant.id;
}

/**
 * Check if tenant subscription is trial
 *
 * @param tenant - Tenant
 * @returns true if subscription is in trial period
 */
export function isTrial(tenant: Tenant): boolean {
  return tenant.subscription.status === 'trial';
}

/**
 * Check if tenant subscription is active
 *
 * @param tenant - Tenant
 * @returns true if subscription is active
 */
export function isActive(tenant: Tenant): boolean {
  return tenant.subscription.status === 'active' || tenant.subscription.status === 'trial';
}

/**
 * Get days until subscription expires
 *
 * @param tenant - Tenant
 * @returns Number of days until expiration, or null if not applicable
 */
export function getDaysUntilExpiration(tenant: Tenant): number | null {
  if (!tenant.subscription.expiresAt) {
    return null;
  }

  const now = new Date();
  const expiresAt = new Date(tenant.subscription.expiresAt);
  const diffTime = expiresAt.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}

/**
 * Check if tenant should show expiration warning
 *
 * @param tenant - Tenant
 * @param warningThreshold - Days threshold for warning (default: 7)
 * @returns true if warning should be shown
 */
export function shouldShowExpirationWarning(tenant: Tenant, warningThreshold = 7): boolean {
  const daysUntilExpiration = getDaysUntilExpiration(tenant);

  if (daysUntilExpiration === null) {
    return false;
  }

  return daysUntilExpiration <= warningThreshold && daysUntilExpiration > 0;
}

const BASIC_FEATURES = ['contacts', 'basic_search', 'export_csv'] as const;

const PROFESSIONAL_FEATURES = [
  ...BASIC_FEATURES,
  'advanced_search',
  'custom_fields',
  'bulk_operations',
  'integrations',
  'api_access',
] as const;

const ENTERPRISE_FEATURES = [
  ...PROFESSIONAL_FEATURES,
  'advanced_analytics',
  'custom_branding',
  'sso',
  'audit_logs',
  'priority_support',
  'unlimited_users',
] as const;

/**
 * Get available features for tenant based on subscription plan
 *
 * @param plan - Subscription plan
 * @returns Array of available feature names
 */
export function getAvailableFeaturesForPlan(
  plan: 'basic' | 'professional' | 'enterprise'
): string[] {
  switch (plan) {
    case 'basic':
      return [...BASIC_FEATURES];
    case 'professional':
      return [...PROFESSIONAL_FEATURES];
    case 'enterprise':
      return [...ENTERPRISE_FEATURES];
  }
}

/**
 * Get usage percentage for a specific limit
 *
 * @param tenant - Tenant
 * @param limitType - Type of limit
 * @param currentUsage - Current usage count
 * @returns Usage percentage (0-100)
 */
export function getUsagePercentage(
  tenant: Tenant,
  limitType: 'users' | 'contacts' | 'storage',
  currentUsage: number
): number {
  const limit = tenant.subscription.limits[limitType];

  if (limit === -1 || limit === Infinity) {
    return 0;
  }

  if (limit === 0) {
    return currentUsage > 0 ? 100 : 0;
  }

  return Math.min(100, Math.round((currentUsage / limit) * 100));
}

/**
 * Check if usage is approaching limit
 *
 * @param tenant - Tenant
 * @param limitType - Type of limit
 * @param currentUsage - Current usage count
 * @param threshold - Warning threshold percentage (default: 80)
 * @returns true if usage is above threshold
 */
export function isApproachingLimit(
  tenant: Tenant,
  limitType: 'users' | 'contacts' | 'storage',
  currentUsage: number,
  threshold = 80
): boolean {
  const percentage = getUsagePercentage(tenant, limitType, currentUsage);
  return percentage >= threshold;
}

/**
 * Validate tenant settings
 *
 * @param settings - Tenant settings to validate
 * @returns Result containing settings or TenantError
 */
export function validateTenantSettings(
  settings: TenantSettings
): Result<TenantSettings, TenantError> {
  const errors: Record<string, string> = {};

  // Validate theme
  if (!['light', 'dark', 'natural'].includes(settings.theme)) {
    errors.theme = 'Invalid theme value';
  }

  // Validate language (ISO 639-1 with optional region)
  const languageRegex = /^[a-z]{2}(-[A-Z]{2})?$/;
  if (!settings.language || !languageRegex.test(settings.language)) {
    errors.language = 'Invalid language code format (expected: ISO 639-1, e.g., "en" or "en-US")';
  }

  // Validate branding colors (hex format)
  const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
  if (!hexColorRegex.test(settings.branding.primaryColor)) {
    errors.primaryColor = 'Invalid primary color format';
  }
  if (!hexColorRegex.test(settings.branding.secondaryColor)) {
    errors.secondaryColor = 'Invalid secondary color format';
  }
  if (!hexColorRegex.test(settings.branding.accentColor)) {
    errors.accentColor = 'Invalid accent color format';
  }

  if (Object.keys(errors).length > 0) {
    return err({
      type: 'VALIDATION_FAILED',
      errors,
    });
  }

  return ok(settings);
}
