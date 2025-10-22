/**
 * @file auth.test.ts
 * @description Comprehensive tests for authorization services
 */

import { describe, expect, it, beforeEach } from 'bun:test';
import { hasTenantAccess, hasTenantPermission, getTenantAccess, type AuthConfig } from './auth';
import type { UserId, TenantId } from '../types/ids';
import type { TokenMetadata } from '../types/auth';

// Mock logger and metrics for testing
class MockSecurityLogger {
  public capturedLogs: string[] = [];

  logAuthFailure(
    userId: UserId,
    tenantId: TenantId,
    reason: string,
    metadata?: Record<string, unknown>
  ): void {
    this.capturedLogs.push(`[AUTH_FAILURE] User ${userId} denied access to tenant ${tenantId}: ${reason}`);
  }

  reset(): void {
    this.capturedLogs = [];
  }
}

class MockMetricsCollector {
  public failures: number = 0;
  public successes: number = 0;

  incrementAuthFailure(userId: UserId, tenantId: TenantId, reason: string): void {
    this.failures++;
  }

  incrementAuthSuccess(userId: UserId, tenantId: TenantId): void {
    this.successes++;
  }

  reset(): void {
    this.failures = 0;
    this.successes = 0;
  }
}

describe('hasTenantAccess', () => {
  let mockLogger: MockSecurityLogger;
  let mockMetrics: MockMetricsCollector;
  let testConfig: AuthConfig;

  beforeEach(() => {
    mockLogger = new MockSecurityLogger();
    mockMetrics = new MockMetricsCollector();
    testConfig = {
      logger: mockLogger,
      metrics: mockMetrics,
    };
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

      const result = hasTenantAccess(validUserId, validTenantId, tokenMetadata, testConfig);

      expect(result.isOk()).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should return true for valid member access', () => {
      const tokenMetadata: TokenMetadata = {
        issuedAt: Date.now() - 1000,
        tenantRole: 'member',
        permissions: ['read', 'write'],
      };

      const result = hasTenantAccess(validUserId, validTenantId, tokenMetadata, testConfig);

      expect(result.isOk()).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should return true for valid invited access', () => {
      const tokenMetadata: TokenMetadata = {
        issuedAt: Date.now() - 1000,
        tenantRole: 'invited',
        permissions: ['read'],
      };

      const result = hasTenantAccess(validUserId, validTenantId, tokenMetadata, testConfig);

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

      const result = hasTenantAccess(validUserId, validTenantId, tokenMetadata, testConfig);

      expect(result.isErr()).toBe(true);
      expect(result.error.code).toBe('TOKEN_BLACKLISTED');
      expect(mockLogger.capturedLogs.some(log => log.includes('AUTH_FAILURE'))).toBe(true);
    });

    it('should fail for revoked token', () => {
      const tokenMetadata: TokenMetadata = {
        issuedAt: Date.now() - 2000, // 2 seconds ago
        lastRevokeAt: Date.now() - 1000, // Revoked 1 second ago
        tenantRole: 'member',
        permissions: ['read', 'write'],
      };

      const result = hasTenantAccess(validUserId, validTenantId, tokenMetadata, testConfig);

      expect(result.isErr()).toBe(true);
      expect(result.error.code).toBe('TOKEN_REVOKED');
    });

    it('should allow token issued at revocation time (boundary case)', () => {
      const revokeTime = Date.now() - 1000;
      const tokenMetadata: TokenMetadata = {
        issuedAt: revokeTime, // Issued exactly at revocation time
        lastRevokeAt: revokeTime, // Revoked at same time
        tenantRole: 'member',
        permissions: ['read', 'write'],
      };

      const result = hasTenantAccess(validUserId, validTenantId, tokenMetadata, testConfig);

      expect(result.isOk()).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should fail for token that is too old', () => {
      const tokenMetadata: TokenMetadata = {
        issuedAt: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
        tenantRole: 'member',
        permissions: ['read', 'write'],
      };

      const result = hasTenantAccess(validUserId, validTenantId, tokenMetadata, testConfig);

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

      const result = hasTenantAccess(validUserId, validTenantId, tokenMetadata, testConfig);

      expect(result.isErr()).toBe(true);
      expect(result.error.code).toBe('NO_TENANT_ROLE');
    });

    it('should fail for insufficient role level', () => {
      const tokenMetadata: TokenMetadata = {
        issuedAt: Date.now() - 1000,
        tenantRole: 'guest', // Invalid role
        permissions: ['read'],
      };

      const result = hasTenantAccess(validUserId, validTenantId, tokenMetadata, testConfig);

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

      hasTenantAccess(validUserId, validTenantId, tokenMetadata, testConfig);

      // Check that failure was logged
      expect(
        mockLogger.capturedLogs.some(
          log =>
            log.includes('AUTH_FAILURE') && log.includes(validUserId) && log.includes(validTenantId)
        )
      ).toBe(true);

      // Check that metrics were incremented
      expect(mockMetrics.failures).toBe(1);
    });

    it('should increment success metrics on successful access', () => {
      const tokenMetadata: TokenMetadata = {
        issuedAt: Date.now() - 1000,
        tenantRole: 'member',
        permissions: ['read', 'write'],
      };

      hasTenantAccess(validUserId, validTenantId, tokenMetadata, testConfig);

      // Check that success metrics were incremented
      expect(mockMetrics.successes).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('should handle empty permissions array', () => {
      const tokenMetadata: TokenMetadata = {
        issuedAt: Date.now() - 1000,
        tenantRole: 'member',
        permissions: [],
      };

      const result = hasTenantAccess(validUserId, validTenantId, tokenMetadata, testConfig);

      expect(result.isOk()).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should handle undefined permissions', () => {
      const tokenMetadata: TokenMetadata = {
        issuedAt: Date.now() - 1000,
        tenantRole: 'member',
        // permissions is undefined
      };

      const result = hasTenantAccess(validUserId, validTenantId, tokenMetadata, testConfig);

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
  let mockLogger: MockSecurityLogger;
  let mockMetrics: MockMetricsCollector;
  let testConfig: AuthConfig;

  beforeEach(() => {
    mockLogger = new MockSecurityLogger();
    mockMetrics = new MockMetricsCollector();
    testConfig = {
      logger: mockLogger,
      metrics: mockMetrics,
    };
  });

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

    const result = hasTenantAccess(validUserId, validTenantId, tokenMetadata, testConfig);

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

    const result = hasTenantAccess(validUserId, validTenantId, tokenMetadata, testConfig);

    expect(result.isErr()).toBe(true);
    expect(result.error.code).toBe('TOKEN_REVOKED');
  });
});
