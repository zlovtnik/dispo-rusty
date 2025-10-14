/**
 * Tenant Business Rules
 * 
 * Pure business logic for tenant management operations.
 * These rules define subscription limits, feature access, and tenant validation.
 */

import type { Result } from 'neverthrow';
import { ok, err } from 'neverthrow';
import type { Tenant, TenantSubscription } from '../../types/auth';

/**
 * Subscription plan limits
 */
export interface PlanLimits {
  users: number;
  contacts: number;
  storage: number; // in MB
  apiCallsPerMonth: number;
  features: string[];
}

/**
 * Plan limits by subscription tier
 */
export const PLAN_LIMITS: Record<'basic' | 'professional' | 'enterprise', PlanLimits> = {
  basic: {
    users: 5,
    contacts: 1000,
    storage: 1024, // 1 GB
    apiCallsPerMonth: 10000,
    features: [
      'contacts',
      'basic_search',
      'export_csv',
      'email_notifications',
    ],
  },
  professional: {
    users: 25,
    contacts: 10000,
    storage: 10240, // 10 GB
    apiCallsPerMonth: 100000,
    features: [
      'contacts',
      'basic_search',
      'advanced_search',
      'export_csv',
      'export_excel',
      'custom_fields',
      'bulk_operations',
      'integrations',
      'api_access',
      'email_notifications',
      'sms_notifications',
      'webhooks',
    ],
  },
  enterprise: {
    users: -1, // unlimited
    contacts: -1, // unlimited
    storage: -1, // unlimited
    apiCallsPerMonth: -1, // unlimited
    features: [
      'contacts',
      'basic_search',
      'advanced_search',
      'export_csv',
      'export_excel',
      'export_api',
      'custom_fields',
      'bulk_operations',
      'integrations',
      'api_access',
      'advanced_analytics',
      'custom_branding',
      'sso',
      'saml',
      'audit_logs',
      'priority_support',
      'email_notifications',
      'sms_notifications',
      'webhooks',
      'custom_webhooks',
      'data_retention',
    ],
  },
};

/**
 * Subscription validation error
 */
export type SubscriptionValidationError =
  | { type: 'LIMIT_EXCEEDED'; limit: string; max: number; current: number }
  | { type: 'FEATURE_NOT_AVAILABLE'; feature: string; plan: string }
  | { type: 'SUBSCRIPTION_EXPIRED'; expiredAt: Date }
  | { type: 'SUBSCRIPTION_CANCELLED' }
  | { type: 'INVALID_PLAN'; plan: string };

/**
 * Validate subscription limits
 * 
 * @param tenant - Tenant to validate
 * @param limitType - Type of limit to check
 * @param currentUsage - Current usage count
 * @returns Result containing void on success or error
 */
export function validateSubscriptionLimit(
  tenant: Tenant,
  limitType: 'users' | 'contacts' | 'storage',
  currentUsage: number
): Result<void, SubscriptionValidationError> {
  const planLimits = PLAN_LIMITS[tenant.subscription.plan];
  const limit = planLimits[limitType];
  
  // -1 means unlimited
  if (limit === -1) {
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
 * Validate feature access for tenant
 * 
 * @param tenant - Tenant to validate
 * @param feature - Feature to check
 * @returns Result containing void on success or error
 */
export function validateFeatureAccess(
  tenant: Tenant,
  feature: string
): Result<void, SubscriptionValidationError> {
  const planLimits = PLAN_LIMITS[tenant.subscription.plan];
  
  if (!planLimits.features.includes(feature)) {
    return err({
      type: 'FEATURE_NOT_AVAILABLE',
      feature,
      plan: tenant.subscription.plan,
    });
  }
  
  return ok(undefined);
}

/**
 * Validate subscription status
 * 
 * @param subscription - Subscription to validate
 * @returns Result containing void on success or error
 */
export function validateSubscriptionStatus(
  subscription: TenantSubscription
): Result<void, SubscriptionValidationError> {
  // Check if cancelled
  if (subscription.status === 'cancelled') {
    return err({ type: 'SUBSCRIPTION_CANCELLED' });
  }
  
  // Check if expired
  if (subscription.status === 'expired') {
    return err({
      type: 'SUBSCRIPTION_EXPIRED',
      expiredAt: subscription.expiresAt || new Date(),
    });
  }
  
  // Check trial expiration
  if (subscription.status === 'trial' && subscription.expiresAt) {
    const now = new Date();
    if (now > subscription.expiresAt) {
      return err({
        type: 'SUBSCRIPTION_EXPIRED',
        expiredAt: subscription.expiresAt,
      });
    }
  }
  
  return ok(undefined);
}

/**
 * Get available features for a subscription plan
 * 
 * @param plan - Subscription plan
 * @returns Array of available feature names
 */
export function getAvailableFeatures(plan: 'basic' | 'professional' | 'enterprise'): string[] {
  return PLAN_LIMITS[plan].features;
}

/**
 * Get plan limits for a subscription plan
 * 
 * @param plan - Subscription plan
 * @returns Plan limits
 */
export function getPlanLimits(plan: 'basic' | 'professional' | 'enterprise'): PlanLimits {
  return PLAN_LIMITS[plan];
}

/**
 * Check if plan has unlimited limit for a resource
 * 
 * @param plan - Subscription plan
 * @param limitType - Type of limit to check
 * @returns true if unlimited
 */
export function hasUnlimitedLimit(
  plan: 'basic' | 'professional' | 'enterprise',
  limitType: 'users' | 'contacts' | 'storage' | 'apiCallsPerMonth'
): boolean {
  return PLAN_LIMITS[plan][limitType] === -1;
}

/**
 * Calculate usage percentage for a limit
 * 
 * @param tenant - Tenant
 * @param limitType - Type of limit
 * @param currentUsage - Current usage count
 * @returns Usage percentage (0-100), or -1 for unlimited
 */
export function calculateUsagePercentage(
  tenant: Tenant,
  limitType: 'users' | 'contacts' | 'storage',
  currentUsage: number
): number {
  const planLimits = PLAN_LIMITS[tenant.subscription.plan];
  const limit = planLimits[limitType];
  
  // -1 means unlimited
  if (limit === -1) {
    return -1;
  }
  
  if (limit === 0) {
    return currentUsage > 0 ? 100 : 0;
  }
  
  return Math.min(100, Math.round((currentUsage / limit) * 100));
}

/**
 * Check if approaching usage limit
 * 
 * @param tenant - Tenant
 * @param limitType - Type of limit
 * @param currentUsage - Current usage count
 * @param threshold - Warning threshold percentage (default: 80)
 * @returns true if approaching limit
 */
export function isApproachingLimit(
  tenant: Tenant,
  limitType: 'users' | 'contacts' | 'storage',
  currentUsage: number,
  threshold: number = 80
): boolean {
  const percentage = calculateUsagePercentage(tenant, limitType, currentUsage);
  
  // -1 means unlimited
  if (percentage === -1) {
    return false;
  }
  
  return percentage >= threshold;
}

/**
 * Get days remaining in subscription
 * 
 * @param subscription - Subscription
 * @returns Days remaining, or null if no expiration
 */
export function getDaysRemaining(subscription: TenantSubscription): number | null {
  if (!subscription.expiresAt) {
    return null;
  }
  
  const now = new Date();
  const expiresAt = new Date(subscription.expiresAt);
  const diffTime = expiresAt.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

/**
 * Check if subscription is in trial period
 * 
 * @param subscription - Subscription
 * @returns true if in trial
 */
export function isTrial(subscription: TenantSubscription): boolean {
  return subscription.status === 'trial';
}

/**
 * Check if subscription is active
 * 
 * @param subscription - Subscription
 * @returns true if active or trial
 */
export function isActive(subscription: TenantSubscription): boolean {
  return subscription.status === 'active' || subscription.status === 'trial';
}

/**
 * Check if should show renewal warning
 * 
 * @param subscription - Subscription
 * @param warningDays - Days before expiration to show warning (default: 7)
 * @returns true if should show warning
 */
export function shouldShowRenewalWarning(
  subscription: TenantSubscription,
  warningDays: number = 7
): boolean {
  const daysRemaining = getDaysRemaining(subscription);
  
  if (daysRemaining === null) {
    return false;
  }
  
  return daysRemaining <= warningDays && daysRemaining > 0;
}

/**
 * Calculate upgrade benefit score
 * 
 * Scores how beneficial an upgrade would be based on current usage
 * 
 * @param tenant - Current tenant
 * @param targetPlan - Target plan to upgrade to
 * @param currentUsage - Current usage metrics
 * @returns Benefit score (0-100)
 */
export function calculateUpgradeBenefitScore(
  tenant: Tenant,
  targetPlan: 'basic' | 'professional' | 'enterprise',
  currentUsage: {
    users: number;
    contacts: number;
    storage: number;
  }
): number {
  const currentLimits = PLAN_LIMITS[tenant.subscription.plan];
  const targetLimits = PLAN_LIMITS[targetPlan];
  
  let score = 0;
  
  // Check if approaching limits
  const usersPercentage = calculateUsagePercentage(tenant, 'users', currentUsage.users);
  const contactsPercentage = calculateUsagePercentage(tenant, 'contacts', currentUsage.contacts);
  const storagePercentage = calculateUsagePercentage(tenant, 'storage', currentUsage.storage);
  
  // Add points for each limit that's being approached
  if (usersPercentage >= 80) score += 30;
  else if (usersPercentage >= 60) score += 15;
  
  if (contactsPercentage >= 80) score += 30;
  else if (contactsPercentage >= 60) score += 15;
  
  if (storagePercentage >= 80) score += 20;
  else if (storagePercentage >= 60) score += 10;
  
  // Add points for new features
  const newFeatures = targetLimits.features.filter(
    f => !currentLimits.features.includes(f)
  );
  score += Math.min(20, newFeatures.length * 2);
  
  return Math.min(100, score);
}

/**
 * Get recommended plan based on usage
 * 
 * @param currentUsage - Current usage metrics
 * @returns Recommended plan
 */
export function getRecommendedPlan(currentUsage: {
  users: number;
  contacts: number;
  storage: number;
  apiCallsPerMonth: number;
}): 'basic' | 'professional' | 'enterprise' {
  // Check if usage exceeds professional limits
  const proLimits = PLAN_LIMITS.professional;
  if (
    (proLimits.users !== -1 && currentUsage.users > proLimits.users) ||
    (proLimits.contacts !== -1 && currentUsage.contacts > proLimits.contacts) ||
    (proLimits.storage !== -1 && currentUsage.storage > proLimits.storage) ||
    (proLimits.apiCallsPerMonth !== -1 && currentUsage.apiCallsPerMonth > proLimits.apiCallsPerMonth)
  ) {
    return 'enterprise';
  }

  // Check if usage exceeds basic limits
  const basicLimits = PLAN_LIMITS.basic;
  if (
    (basicLimits.users !== -1 && currentUsage.users > basicLimits.users) ||
    (basicLimits.contacts !== -1 && currentUsage.contacts > basicLimits.contacts) ||
    (basicLimits.storage !== -1 && currentUsage.storage > basicLimits.storage) ||
    (basicLimits.apiCallsPerMonth !== -1 && currentUsage.apiCallsPerMonth > basicLimits.apiCallsPerMonth)
  ) {
    return 'professional';
  }

  return 'basic';
}
