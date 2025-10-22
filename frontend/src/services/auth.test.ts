/**
 * @file auth.test.ts
 * @description Comprehensive tests for authorization services
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { hasTenantAccess, hasTenantPermission, getTenantAccess } from './auth';
import type { UserId, TenantId } from '../types/ids';
import type { TokenMetadata } from '../types/auth';

// Mock console methods to capture logs
const originalConsoleWarn = console.warn;
const originalConsoleDebug = console.debug;

describe('hasTenantAccess', () => {
  let capturedLogs: string[] = [];
  let capturedMetrics: string[] = [];

  beforeEach(() => {
    capturedLogs = [];
    capturedMetrics = [];

    // Mock console methods
    console.warn = (...args: unknown[]) => {
      capturedLogs.push(`[WARN] ${args.join(' ')}`);
    };

    console.debug = (...args: unknown[]) => {
      capturedMetrics.push(`[DEBUG] ${args.join(' ')}`);
    };
  });

  afterEach(() => {
    // Restore original console methods
    console.warn = originalConsoleWarn;
    console.debug = originalConsoleDebug;
  });

  const validUserId: UserId = 'user-123' as UserId;
  const validTenantId: TenantId = 'tenant-456' as TenantId;

  describe('successful access validation', () => {
    it('should return true for valid owner access', () => {
      const tokenMetadata: TokenMetadata = {
        issuedAt: Date.now() - 1000, // 1 second ago
        tenantRole: 'owner',
        permissions: ['read', 'write', 'delete', 'admin'],
      };

      const result = hasTenantAccess(validUserId, validTenantId, tokenMetadata);

      expect(result.isOk()).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should return true for valid member access', () => {
      const tokenMetadata: TokenMetadata = {
        issuedAt: Date.now() - 1000,
        tenantRole: 'member',
        permissions: ['read', 'write'],
      };

      const result = hasTenantAccess(validUserId, validTenantId, tokenMetadata);

      expect(result.isOk()).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should return true for valid invited access', () => {
      const tokenMetadata: TokenMetadata = {
        issuedAt: Date.now() - 1000,
        tenantRole: 'invited',
        permissions: ['read'],
      };

      const result = hasTenantAccess(validUserId, validTenantId, tokenMetadata);

      expect(result.isOk()).toBe(true);
      expect(result.value).toBe(true);
    });
  });

  describe('token validation failures', () => {
    it('should fail for blacklisted token', () => {
      const tokenMetadata: TokenMetadata = {
        issuedAt: Date.now() - 1000,
        isBlacklisted: true,
        tenantRole: 'member',
        permissions: ['read', 'write'],
      };

      const result = hasTenantAccess(validUserId, validTenantId, tokenMetadata);

      expect(result.isErr()).toBe(true);
      expect(result.error.code).toBe('TOKEN_BLACKLISTED');
      expect(capturedLogs.some(log => log.includes('AUTH_FAILURE'))).toBe(true);
    });

    it('should fail for revoked token', () => {
      const tokenMetadata: TokenMetadata = {
        issuedAt: Date.now() - 2000, // 2 seconds ago
        lastRevokeAt: Date.now() - 1000, // Revoked 1 second ago
        tenantRole: 'member',
        permissions: ['read', 'write'],
      };

      const result = hasTenantAccess(validUserId, validTenantId, tokenMetadata);

      expect(result.isErr()).toBe(true);
      expect(result.error.code).toBe('TOKEN_REVOKED');
    });

    it('should fail for token issued before revocation', () => {
      const tokenMetadata: TokenMetadata = {
        issuedAt: Date.now() - 2000, // Issued 2 seconds ago
        lastRevokeAt: Date.now() - 1000, // Revoked 1 second ago
        tenantRole: 'member',
        permissions: ['read', 'write'],
      };

      const result = hasTenantAccess(validUserId, validTenantId, tokenMetadata);

      expect(result.isErr()).toBe(true);
      expect(result.error.code).toBe('TOKEN_REVOKED');
    });

    it('should fail for token that is too old', () => {
      const tokenMetadata: TokenMetadata = {
        issuedAt: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
        tenantRole: 'member',
        permissions: ['read', 'write'],
      };

      const result = hasTenantAccess(validUserId, validTenantId, tokenMetadata);

      expect(result.isErr()).toBe(true);
      expect(result.error.code).toBe('TOKEN_TOO_OLD');
    });
  });

  describe('membership validation failures', () => {
    it('should fail when no tenant role in token', () => {
      const tokenMetadata: TokenMetadata = {
        issuedAt: Date.now() - 1000,
        permissions: ['read', 'write'],
        // Missing tenantRole
      };

      const result = hasTenantAccess(validUserId, validTenantId, tokenMetadata);

      expect(result.isErr()).toBe(true);
      expect(result.error.code).toBe('NO_TENANT_ROLE');
    });

    it('should fail for insufficient role level', () => {
      const tokenMetadata: TokenMetadata = {
        issuedAt: Date.now() - 1000,
        tenantRole: 'guest', // Invalid role
        permissions: ['read'],
      };

      const result = hasTenantAccess(validUserId, validTenantId, tokenMetadata);

      expect(result.isErr()).toBe(true);
      expect(result.error.code).toBe('INSUFFICIENT_ROLE');
    });
  });

  describe('security logging and metrics', () => {
    it('should log auth failure and increment metrics on failure', () => {
      const tokenMetadata: TokenMetadata = {
        issuedAt: Date.now() - 1000,
        isBlacklisted: true,
        tenantRole: 'member',
        permissions: ['read', 'write'],
      };

      hasTenantAccess(validUserId, validTenantId, tokenMetadata);

      // Check that failure was logged
      expect(
        capturedLogs.some(
          log =>
            log.includes('AUTH_FAILURE') && log.includes(validUserId) && log.includes(validTenantId)
        )
      ).toBe(true);

      // Check that metrics were incremented
      expect(capturedMetrics.some(metric => metric.includes('auth_failure'))).toBe(true);
    });

    it('should increment success metrics on successful access', () => {
      const tokenMetadata: TokenMetadata = {
        issuedAt: Date.now() - 1000,
        tenantRole: 'member',
        permissions: ['read', 'write'],
      };

      hasTenantAccess(validUserId, validTenantId, tokenMetadata);

      // Check that success metrics were incremented
      expect(capturedMetrics.some(metric => metric.includes('auth_success'))).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty permissions array', () => {
      const tokenMetadata: TokenMetadata = {
        issuedAt: Date.now() - 1000,
        tenantRole: 'member',
        permissions: [],
      };

      const result = hasTenantAccess(validUserId, validTenantId, tokenMetadata);

      expect(result.isOk()).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should handle undefined permissions', () => {
      const tokenMetadata: TokenMetadata = {
        issuedAt: Date.now() - 1000,
        tenantRole: 'member',
        // permissions is undefined
      };

      const result = hasTenantAccess(validUserId, validTenantId, tokenMetadata);

      expect(result.isOk()).toBe(true);
      expect(result.value).toBe(true);
    });
  });
});

describe('hasTenantPermission', () => {
  const validUserId: UserId = 'user-123' as UserId;
  const validTenantId: TenantId = 'tenant-456' as TenantId;

  it('should return true for valid permission', () => {
    const tokenMetadata: TokenMetadata = {
      issuedAt: Date.now() - 1000,
      tenantRole: 'member',
      permissions: ['read', 'write', 'delete'],
    };

    const result = hasTenantPermission(validUserId, validTenantId, 'write', tokenMetadata);

    expect(result.isOk()).toBe(true);
    expect(result.value).toBe(true);
  });

  it('should return false for invalid permission', () => {
    const tokenMetadata: TokenMetadata = {
      issuedAt: Date.now() - 1000,
      tenantRole: 'member',
      permissions: ['read', 'write'],
    };

    const result = hasTenantPermission(validUserId, validTenantId, 'delete', tokenMetadata);

    expect(result.isOk()).toBe(true);
    expect(result.value).toBe(false);
  });

  it('should fail if basic tenant access fails', () => {
    const tokenMetadata: TokenMetadata = {
      issuedAt: Date.now() - 1000,
      isBlacklisted: true,
      tenantRole: 'member',
      permissions: ['read', 'write'],
    };

    const result = hasTenantPermission(validUserId, validTenantId, 'read', tokenMetadata);

    expect(result.isErr()).toBe(true);
    expect(result.error.code).toBe('TOKEN_BLACKLISTED');
  });
});

describe('getTenantAccess', () => {
  const validUserId: UserId = 'user-123' as UserId;
  const validTenantId: TenantId = 'tenant-456' as TenantId;

  it('should return tenant access details for valid access', () => {
    const tokenMetadata: TokenMetadata = {
      issuedAt: Date.now() - 1000,
      tenantRole: 'member',
      permissions: ['read', 'write'],
    };

    const result = getTenantAccess(validUserId, validTenantId, tokenMetadata);

    expect(result.isOk()).toBe(true);
    expect(result.value).toEqual({
      userId: validUserId,
      tenantId: validTenantId,
      role: 'member',
      status: 'active',
      acceptedAt: expect.any(String),
      permissions: ['read', 'write'],
    });
  });

  it('should fail if basic tenant access fails', () => {
    const tokenMetadata: TokenMetadata = {
      issuedAt: Date.now() - 1000,
      isBlacklisted: true,
      tenantRole: 'member',
      permissions: ['read', 'write'],
    };

    const result = getTenantAccess(validUserId, validTenantId, tokenMetadata);

    expect(result.isErr()).toBe(true);
    expect(result.error.code).toBe('TOKEN_BLACKLISTED');
  });
});

describe('integration scenarios', () => {
  const validUserId: UserId = 'user-123' as UserId;
  const validTenantId: TenantId = 'tenant-456' as TenantId;

  it('should handle complete authorization flow', () => {
    const tokenMetadata: TokenMetadata = {
      issuedAt: Date.now() - 1000,
      tenantRole: 'owner',
      permissions: ['read', 'write', 'delete', 'admin'],
    };

    // Test basic access
    const accessResult = hasTenantAccess(validUserId, validTenantId, tokenMetadata);
    expect(accessResult.isOk()).toBe(true);
    expect(accessResult.value).toBe(true);

    // Test specific permissions
    const readResult = hasTenantPermission(validUserId, validTenantId, 'read', tokenMetadata);
    expect(readResult.isOk()).toBe(true);
    expect(readResult.value).toBe(true);

    const adminResult = hasTenantPermission(validUserId, validTenantId, 'admin', tokenMetadata);
    expect(adminResult.isOk()).toBe(true);
    expect(adminResult.value).toBe(true);

    // Test access details
    const detailsResult = getTenantAccess(validUserId, validTenantId, tokenMetadata);
    expect(detailsResult.isOk()).toBe(true);
    expect(detailsResult.value.role).toBe('owner');
    expect(detailsResult.value.permissions).toContain('admin');
  });

  it('should handle expired token scenario', () => {
    const tokenMetadata: TokenMetadata = {
      issuedAt: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
      tenantRole: 'member',
      permissions: ['read', 'write'],
    };

    const result = hasTenantAccess(validUserId, validTenantId, tokenMetadata);

    expect(result.isErr()).toBe(true);
    expect(result.error.code).toBe('TOKEN_TOO_OLD');
  });

  it('should handle revoked token scenario', () => {
    const tokenMetadata: TokenMetadata = {
      issuedAt: Date.now() - 2000,
      lastRevokeAt: Date.now() - 1000,
      tenantRole: 'member',
      permissions: ['read', 'write'],
    };

    const result = hasTenantAccess(validUserId, validTenantId, tokenMetadata);

    expect(result.isErr()).toBe(true);
    expect(result.error.code).toBe('TOKEN_REVOKED');
  });
});
