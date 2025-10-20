import { describe, it, expect } from 'bun:test';
import {
  decodeJwtPayload,
  checkTokenExpiry,
  parseStoredUser,
  parseStoredTenant,
  updateUserFromJwt,
  updateTenantFromJwt,
  verifyDataMatchesToken,
} from '../parsing';
import type { _User, _Tenant } from '../../types/auth';
import { mockUser, mockTenant } from '../../test-utils/render';
import { asTenantId } from '../../types/ids';

describe('parsing utilities', () => {
  describe('decodeJwtPayload', () => {
    it('should decode a valid JWT payload', () => {
      // Create a simple JWT payload
      const payload = { user: 'test-user', tenant_id: 'test-tenant', exp: 1234567890 };
      const header = { alg: 'HS256', typ: 'JWT' };

      // Encode to base64
      const encodedHeader = btoa(JSON.stringify(header));
      const encodedPayload = btoa(JSON.stringify(payload));
      const signature = 'signature'; // Mock signature

      const token = `${encodedHeader}.${encodedPayload}.${signature}`;

      const result = decodeJwtPayload(token);
      expect(result.isOk()).toBe(true);
      result.map(decoded => {
        expect(decoded.user).toBe('test-user');
        expect(decoded.tenant_id).toBe('test-tenant');
        expect(decoded.exp).toBe(1234567890);
      });
    });

    it('should reject invalid JWT format', () => {
      const result = decodeJwtPayload('invalid-token');
      expect(result.isErr()).toBe(true);
    });

    it('should reject JWT with invalid base64', () => {
      const token = 'header.invalid-base64.signature';
      const result = decodeJwtPayload(token);
      expect(result.isErr()).toBe(true);
    });

    it('should reject JWT with invalid JSON', () => {
      const invalidJson = btoa('invalid json');
      const token = `header.${invalidJson}.signature`;
      const result = decodeJwtPayload(token);
      expect(result.isErr()).toBe(true);
    });

    it('should reject JWT with non-object payload', () => {
      const payload = 'not an object';
      const encodedPayload = btoa(JSON.stringify(payload));
      const token = `header.${encodedPayload}.signature`;
      const result = decodeJwtPayload(token);
      expect(result.isErr()).toBe(true);
    });

    it('should reject JWT missing required fields', () => {
      const payload = { user: 'test-user' }; // missing tenant_id and exp
      const encodedPayload = btoa(JSON.stringify(payload));
      const token = `header.${encodedPayload}.signature`;
      const result = decodeJwtPayload(token);
      expect(result.isErr()).toBe(true);
    });

    it('should reject JWT with empty user field', () => {
      const payload = { user: '', tenant_id: 'test-tenant', exp: 1234567890 };
      const encodedPayload = btoa(JSON.stringify(payload));
      const token = `header.${encodedPayload}.signature`;
      const result = decodeJwtPayload(token);
      expect(result.isErr()).toBe(true);
    });

    it('should reject JWT with empty tenant_id field', () => {
      const payload = { user: 'test-user', tenant_id: '', exp: 1234567890 };
      const encodedPayload = btoa(JSON.stringify(payload));
      const token = `header.${encodedPayload}.signature`;
      const result = decodeJwtPayload(token);
      expect(result.isErr()).toBe(true);
    });

    it('should reject JWT with invalid exp field', () => {
      const payload = { user: 'test-user', tenant_id: 'test-tenant', exp: 'not-a-number' };
      const encodedPayload = btoa(JSON.stringify(payload));
      const token = `header.${encodedPayload}.signature`;
      const result = decodeJwtPayload(token);
      expect(result.isErr()).toBe(true);
    });
  });

  describe('checkTokenExpiry', () => {
    it('should return ok for non-expired token', () => {
      const validPayload = {
        user: 'test',
        tenant_id: 'test',
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      const result = checkTokenExpiry(validPayload);
      expect(result.isOk()).toBe(true);
    });

    it('should return error for expired token', () => {
      const expiredPayload = {
        user: 'test',
        tenant_id: 'test',
        exp: Math.floor(Date.now() / 1000) - 100,
      };
      const result = checkTokenExpiry(expiredPayload);
      expect(result.isErr()).toBe(true);
    });

    it('should handle custom now timestamp', () => {
      const payload = { user: 'test', tenant_id: 'test', exp: 1000 };
      const result = checkTokenExpiry(payload, 500); // exp > now, should be ok
      expect(result.isOk()).toBe(true);

      const result2 = checkTokenExpiry(payload, 1500); // exp < now, should be error
      expect(result2.isErr()).toBe(true);
    });
  });

  describe('parseStoredUser', () => {
    it('should parse valid user JSON', () => {
      const user = mockUser;
      const json = JSON.stringify(user);
      const result = parseStoredUser(json);
      expect(result.isOk()).toBe(true);
      result.map(parsed => {
        expect(parsed.id).toBe(user.id);
        expect(parsed.email).toBe(user.email);
      });
    });

    it('should reject invalid JSON', () => {
      const result = parseStoredUser('invalid json');
      expect(result.isErr()).toBe(true);
    });

    it('should reject non-object JSON', () => {
      const result = parseStoredUser('"string"');
      expect(result.isErr()).toBe(true);
    });

    it('should reject user missing required fields', () => {
      const invalidUser = { email: 'test@example.com' }; // missing id
      const json = JSON.stringify(invalidUser);
      const result = parseStoredUser(json);
      expect(result.isErr()).toBe(true);
    });

    it('should reject user with invalid ID format', () => {
      const invalidUser = { id: 'invalid-id', email: 'test@example.com' };
      const json = JSON.stringify(invalidUser);
      const result = parseStoredUser(json);
      expect(result.isErr()).toBe(true);
    });
  });

  describe('parseStoredTenant', () => {
    it('should parse valid tenant JSON', () => {
      const tenant = mockTenant;
      const json = JSON.stringify(tenant);
      const result = parseStoredTenant(json);
      expect(result.isOk()).toBe(true);
      result.map(parsed => {
        expect(parsed.id).toBe(tenant.id);
        expect(parsed.name).toBe(tenant.name);
      });
    });

    it('should reject invalid JSON', () => {
      const result = parseStoredTenant('invalid json');
      expect(result.isErr()).toBe(true);
    });

    it('should reject non-object JSON', () => {
      const result = parseStoredTenant('"string"');
      expect(result.isErr()).toBe(true);
    });

    it('should reject tenant missing required fields', () => {
      const invalidTenant = { name: 'Test Tenant' }; // missing id
      const json = JSON.stringify(invalidTenant);
      const result = parseStoredTenant(json);
      expect(result.isErr()).toBe(true);
    });

    it('should reject tenant missing settings and subscription', () => {
      const invalidTenant = { id: asTenantId('tenant-1'), name: 'Test Tenant' }; // missing settings and subscription
      const json = JSON.stringify(invalidTenant);
      const result = parseStoredTenant(json);
      expect(result.isErr()).toBe(true);
    });

    it('should reject tenant with empty name', () => {
      const tenant = mockTenant;
      const invalidTenant = { ...tenant, name: '' };
      const json = JSON.stringify(invalidTenant);
      const result = parseStoredTenant(json);
      expect(result.isErr()).toBe(true);
    });
  });

  describe('updateUserFromJwt', () => {
    it('should update user from JWT payload', () => {
      const user = mockUser;
      const payload = { user: 'new-username', tenant_id: 'new-tenant-id', exp: 1234567890 };
      const updated = updateUserFromJwt(user, payload);
      expect(updated.username).toBe('new-username');
      expect(updated.tenantId).toBe(asTenantId('new-tenant-id'));
    });

    it('should handle missing optional fields', () => {
      const user = mockUser;
      // Omit optional iat field (tenant_id and exp are required)
      const payload = {
        user: 'new-username',
        tenant_id: user.tenantId.toString(),
        exp: 1234567890,
        // iat is intentionally omitted (it's optional in JwtPayload)
      };

      const updated = updateUserFromJwt(user, payload);
      expect(updated.username).toBe('new-username');
      // tenantId should remain the same since it was not changed in payload
      expect(updated.tenantId).toBe(asTenantId(payload.tenant_id));
    });
  });

  describe('updateTenantFromJwt', () => {
    it('should update tenant from JWT payload', () => {
      const tenant = mockTenant;
      const payload = { user: 'test-user', tenant_id: 'new-tenant-id', exp: 1234567890 };
      const updated = updateTenantFromJwt(tenant, payload);
      expect(updated.id).toBe(asTenantId('new-tenant-id'));
    });
  });

  describe('verifyDataMatchesToken', () => {
    it('should return ok when data matches token', () => {
      const user = mockUser;
      const tenant = mockTenant;
      const payload = {
        user: user.username,
        tenant_id: String(tenant.id), // Convert branded type to string
        exp: 1234567890,
      };

      const result = verifyDataMatchesToken(user, tenant, payload);
      expect(result.isOk()).toBe(true);
    });

    it('should return error when user ID does not match', () => {
      const user = mockUser;
      const tenant = mockTenant;
      const payload = {
        user: 'different-username',
        tenant_id: String(tenant.id),
        exp: 1234567890,
      };

      const result = verifyDataMatchesToken(user, tenant, payload);
      expect(result.isErr()).toBe(true);
    });

    it('should return error when tenant ID does not match', () => {
      const user = mockUser;
      const tenant = mockTenant;
      const payload = {
        user: user.username,
        tenant_id: 'different-tenant-id',
        exp: 1234567890,
      };

      const result = verifyDataMatchesToken(user, tenant, payload);
      expect(result.isErr()).toBe(true);
    });

    it('should return error when both IDs do not match', () => {
      const user = mockUser;
      const tenant = mockTenant;
      const payload = {
        user: 'different-username',
        tenant_id: 'different-tenant-id',
        exp: 1234567890,
      };

      const result = verifyDataMatchesToken(user, tenant, payload);
      expect(result.isErr()).toBe(true);
    });
  });
});
