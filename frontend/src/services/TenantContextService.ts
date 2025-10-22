/**
 * Tenant Context Service
 * Manages tenant context, JWT tokens, and tenant switching functionality
 */

import { ok, err } from 'neverthrow';
import type { Result } from '@/types/fp';
import type { AppError } from '@/types/errors';
import type { Tenant } from '@/types/tenant';
import type { User } from '@/types/auth';

/**
 * Tenant context interface
 */
export interface TenantContext {
  tenant: Tenant;
  role: string;
  permissions: string[];
  limits: TenantLimits;
  features: string[];
}

/**
 * Tenant limits interface
 */
export interface TenantLimits {
  maxUsers: number;
  maxContacts: number;
  maxStorage: number;
  maxApiCalls: number;
  currentUsers: number;
  currentContacts: number;
  currentStorage: number;
  currentApiCalls: number;
}

/**
 * JWT token structure for tenant context
 */
export interface TenantJWT {
  sub: string; // User ID
  tenant_id: string; // Current tenant ID
  tenant_role: string; // Role within tenant
  permissions: string[]; // Tenant-specific permissions
  tenant_limits: TenantLimits;
  iat: number;
  exp: number;
}

/**
 * Tenant context service class
 */
export class TenantContextService {
  private static instance: TenantContextService;
  private currentContext: TenantContext | null = null;
  private listeners: ((context: TenantContext | null) => void)[] = [];

  private constructor() {}

  static getInstance(): TenantContextService {
    if (!TenantContextService.instance) {
      TenantContextService.instance = new TenantContextService();
    }
    return TenantContextService.instance;
  }

  /**
   * Set tenant context
   */
  setTenantContext(context: TenantContext): void {
    this.currentContext = context;
    this.notifyListeners();
    this.persistContext();
  }

  /**
   * Get current tenant context
   */
  getTenantContext(): TenantContext | null {
    return this.currentContext;
  }

  /**
   * Clear tenant context
   */
  clearTenantContext(): void {
    this.currentContext = null;
    this.notifyListeners();
    this.clearPersistedContext();
  }

  /**
   * Check if user has permission in current tenant
   */
  hasPermission(permission: string): boolean {
    if (!this.currentContext) return false;
    return this.currentContext.permissions.includes(permission);
  }

  /**
   * Check if user has role in current tenant
   */
  hasRole(role: string): boolean {
    if (!this.currentContext) return false;
    return this.currentContext.role === role;
  }

  /**
   * Check if user has any of the specified roles
   */
  hasAnyRole(roles: string[]): boolean {
    if (!this.currentContext) return false;
    return roles.includes(this.currentContext.role);
  }

  /**
   * Check if tenant has feature enabled
   */
  hasFeature(feature: string): boolean {
    if (!this.currentContext) return false;
    return this.currentContext.features.includes(feature);
  }

  /**
   * Check if tenant is within limits
   */
  isWithinLimits(resource: keyof TenantLimits): boolean {
    if (!this.currentContext) return false;

    const limits = this.currentContext.limits;
    const currentKey =
      `current${resource.charAt(0).toUpperCase() + resource.slice(1)}` as keyof TenantLimits;
    const maxKey =
      `max${resource.charAt(0).toUpperCase() + resource.slice(1)}` as keyof TenantLimits;

    const current = limits[currentKey];
    const max = limits[maxKey];

    return current < max;
  }

  /**
   * Get remaining limit for resource
   */
  getRemainingLimit(resource: keyof TenantLimits): number {
    if (!this.currentContext) return 0;

    const limits = this.currentContext.limits;
    const currentKey =
      `current${resource.charAt(0).toUpperCase() + resource.slice(1)}` as keyof TenantLimits;
    const maxKey =
      `max${resource.charAt(0).toUpperCase() + resource.slice(1)}` as keyof TenantLimits;

    const current = limits[currentKey];
    const max = limits[maxKey];

    return Math.max(0, max - current);
  }

  /**
   * Subscribe to context changes
   */
  subscribe(listener: (context: TenantContext | null) => void): () => void {
    this.listeners.push(listener);

    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Notify listeners of context changes
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.currentContext);
      } catch (error) {
        console.error('Error in tenant context listener:', error);
      }
    });
  }

  /**
   * Persist context to localStorage
   */
  private persistContext(): void {
    if (this.currentContext) {
      localStorage.setItem('tenantContext', JSON.stringify(this.currentContext));
    }
  }

  /**
   * Load context from localStorage
   */
  loadPersistedContext(): Result<TenantContext, AppError> {
    try {
      const stored = localStorage.getItem('tenantContext');
      if (!stored) {
        return err(
          createBusinessLogicError('No persisted tenant context found', { code: 'NOT_FOUND' })
        );
      }

      const context = JSON.parse(stored) as TenantContext;
      this.currentContext = context;
      this.notifyListeners();

      return ok(context);
    } catch (error) {
      return err({
        type: 'PARSING_ERROR',
        message: 'Failed to parse persisted tenant context',
        cause: error,
      });
    }
  }

  /**
   * Clear persisted context
   */
  private clearPersistedContext(): void {
    localStorage.removeItem('tenantContext');
  }

  /**
   * Validate JWT token for tenant context
   */
  validateTenantJWT(token: string): Result<TenantJWT, AppError> {
    try {
      // In a real implementation, you would verify the JWT signature
      const payload = JSON.parse(atob(token.split('.')[1])) as TenantJWT;

      // Check expiration
      if (payload.exp < Date.now() / 1000) {
        return err({
          type: 'TOKEN_EXPIRED',
          message: 'JWT token has expired',
        });
      }

      return ok(payload);
    } catch (error) {
      return err({
        type: 'INVALID_TOKEN',
        message: 'Invalid JWT token format',
        cause: error,
      });
    }
  }

  /**
   * Extract tenant context from JWT
   */
  extractTenantContextFromJWT(jwt: TenantJWT, tenant: Tenant): TenantContext {
    return {
      tenant,
      role: jwt.tenant_role,
      permissions: jwt.permissions,
      limits: jwt.tenant_limits,
      features: tenant.settings?.features || [],
    };
  }

  /**
   * Switch to different tenant
   */
  async switchTenant(tenant: Tenant, user: User): Promise<Result<TenantContext, AppError>> {
    try {
      // In a real implementation, you would:
      // 1. Validate user has access to tenant
      // 2. Get user's role in tenant
      // 3. Get tenant limits and features
      // 4. Generate new JWT with tenant context

      // Mock implementation
      const context: TenantContext = {
        tenant,
        role: 'admin', // This would come from user-tenant relationship
        permissions: ['read:contacts', 'write:contacts', 'admin:tenant'],
        limits: {
          maxUsers: 100,
          maxContacts: 10000,
          maxStorage: 1000,
          maxApiCalls: 100000,
          currentUsers: 25,
          currentContacts: 1500,
          currentStorage: 250,
          currentApiCalls: 50000,
        },
        features: ['analytics', 'backup', 'api_access'],
      };

      this.setTenantContext(context);
      return ok(context);
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
   * Get tenant context for API requests
   */
  getTenantContextForAPI(): Record<string, string> {
    if (!this.currentContext) {
      return {};
    }

    return {
      'X-Tenant-ID': this.currentContext.tenant.id,
      'X-Tenant-Role': this.currentContext.role,
      'X-Tenant-Permissions': this.currentContext.permissions.join(','),
    };
  }

  /**
   * Check if context is valid
   */
  isContextValid(): boolean {
    if (!this.currentContext) return false;

    // Check if tenant is still active
    if (this.currentContext.tenant.status !== 'active') {
      return false;
    }

    // Check if user still has access (this would require API call in real implementation)
    return true;
  }

  /**
   * Refresh tenant context
   */
  async refreshContext(): Promise<Result<TenantContext, AppError>> {
    if (!this.currentContext) {
      return err({
        type: 'NO_CONTEXT',
        message: 'No tenant context to refresh',
      });
    }

    try {
      // In a real implementation, you would:
      // 1. Fetch updated tenant data
      // 2. Fetch updated user permissions
      // 3. Fetch updated limits and usage

      // Mock implementation - just return current context
      return ok(this.currentContext);
    } catch (error) {
      return err({
        type: 'REFRESH_FAILED',
        message: 'Failed to refresh tenant context',
        cause: error,
      });
    }
  }
}

/**
 * Hook for using tenant context in React components
 */
export const useTenantContext = () => {
  const service = TenantContextService.getInstance();
  const [context, setContext] = React.useState<TenantContext | null>(service.getTenantContext());

  React.useEffect(() => {
    const unsubscribe = service.subscribe(setContext);
    return unsubscribe;
  }, []);

  return {
    context,
    hasPermission: service.hasPermission.bind(service),
    hasRole: service.hasRole.bind(service),
    hasAnyRole: service.hasAnyRole.bind(service),
    hasFeature: service.hasFeature.bind(service),
    isWithinLimits: service.isWithinLimits.bind(service),
    getRemainingLimit: service.getRemainingLimit.bind(service),
    switchTenant: service.switchTenant.bind(service),
    refreshContext: service.refreshContext.bind(service),
  };
};

// Export singleton instance
export const tenantContextService = TenantContextService.getInstance();
