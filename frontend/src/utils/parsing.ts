/**
 * JWT and Data Parsing Utilities
 *
 * Pure functions for parsing and validating JWT tokens and stored data.
 * All functions return Result types for type-safe error handling.
 *
 * @module parsing
 */

import { type Result, ok, err } from 'neverthrow';
import type { ParseError } from '../types/errors';
import { ParseErrors } from '../types/errors';
import type { User, Tenant } from '../types/auth';
import { asTenantId, asUserId } from '../types/ids';
import type { TenantId, UserId } from '../types/ids';

/**
 * JWT Payload interface
 */
export interface JwtPayload {
  user: string;
  tenant_id: string;
  exp: number;
  iat?: number;
  [key: string]: unknown;
}

/**
 * Decode and validate JWT payload
 *
 * @param token - The JWT token string
 * @returns Result containing decoded payload or ParseError
 *
 * @example
 * ```typescript
 * const result = decodeJwtPayload(token);
 * result.match(
 *   (payload) => console.log('User:', payload.user),
 *   (error) => console.log('Error:', formatParseError(error))
 * );
 * ```
 */
export const decodeJwtPayload = (token: string): Result<JwtPayload, ParseError> => {
  try {
    // Split token into parts
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[1]) {
      return err(ParseErrors.invalidJwtFormat(token));
    }

    // Decode base64 (handle URL-safe base64) using browser-native APIs
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    // Add padding if needed
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);

    // Use browser-native atob for base64 decoding
    let binaryString: string;
    try {
      binaryString = atob(padded);
    } catch (atobError) {
      const reason = atobError instanceof Error ? atobError.message : 'Base64 decode failed';
      return err(ParseErrors.invalidJson(token, reason));
    }

    // Convert binary string to Uint8Array
    const uint8Array = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      uint8Array[i] = binaryString.charCodeAt(i);
    }

    // Decode UTF-8 using TextDecoder
    const decoded = new TextDecoder('utf-8').decode(uint8Array);

    // Parse JSON
    let payload: unknown;
    try {
      payload = JSON.parse(decoded);
    } catch (parseError) {
      const reason = parseError instanceof Error ? parseError.message : 'JSON parse failed';
      return err(ParseErrors.invalidJson(decoded, reason));
    }

    // Validate payload structure
    if (!payload || typeof payload !== 'object') {
      return err(ParseErrors.invalidJson(decoded, 'Payload is not an object'));
    }

    const payloadObj = payload as Record<string, unknown>;

    // Helper to validate required fields
    const validateRequiredField = (
      obj: Record<string, unknown>,
      field: string,
      type: 'string' | 'number',
      missingFields: string[]
    ): void => {
      const value = obj[field];
      if (type === 'string') {
        // For strings, check if missing, not a string, or empty after trimming
        if (!value || typeof value !== 'string' || value.trim() === '') {
          missingFields.push(field);
        }
      } else if (type === 'number') {
        // For numbers, check if not a number type
        if (typeof value !== 'number') {
          missingFields.push(field);
        }
      }
    };

    // Check required fields using helper
    const missingFields: string[] = [];
    validateRequiredField(payloadObj, 'user', 'string', missingFields);
    validateRequiredField(payloadObj, 'tenant_id', 'string', missingFields);
    validateRequiredField(payloadObj, 'exp', 'number', missingFields);

    if (missingFields.length > 0) {
      return err(ParseErrors.missingJwtFields(missingFields));
    }

    return ok(payloadObj as JwtPayload);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown decode error';
    return err(ParseErrors.invalidJson(token, reason));
  }
};

/**
 * Check if JWT token is expired
 *
 * @param payload - The decoded JWT payload
 * @param nowSeconds - Current time in seconds (defaults to now)
 * @returns Result containing void if valid, or ParseError if expired
 */
export const checkTokenExpiry = (
  payload: JwtPayload,
  nowSeconds?: number
): Result<void, ParseError> => {
  const now = nowSeconds ?? Math.floor(Date.now() / 1000);

  if (payload.exp < now) {
    return err(ParseErrors.expiredToken(payload.exp, now));
  }

  return ok(undefined);
};

/**
 * Parse and validate stored User data
 *
 * @param raw - Raw JSON string from storage
 * @returns Result containing parsed User or ParseError
 *
 * @example
 * ```typescript
 * const result = parseStoredUser(storedData);
 * result.match(
 *   (user) => console.log('User:', user.username),
 *   (error) => console.log('Error:', formatParseError(error))
 * );
 * ```
 */
export const parseStoredUser = (raw: string): Result<User, ParseError> => {
  try {
    const parsed: unknown = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object') {
      return err(ParseErrors.invalidUserStructure('Parsed value is not an object'));
    }

    const obj = parsed as Record<string, unknown>;

    // Validate required fields
    if (typeof obj.id !== 'string' || obj.id.trim() === '') {
      return err(ParseErrors.invalidUserStructure('Missing or invalid id'));
    }
    if (typeof obj.email !== 'string' || obj.email.trim() === '') {
      return err(ParseErrors.invalidUserStructure('Missing or invalid email'));
    }
    if (typeof obj.username !== 'string' || obj.username.trim() === '') {
      return err(ParseErrors.invalidUserStructure('Missing or invalid username'));
    }
    if (!Array.isArray(obj.roles) || !obj.roles.every(role => typeof role === 'string')) {
      return err(ParseErrors.invalidUserStructure('Missing or invalid roles array'));
    }
    if (typeof obj.tenantId !== 'string' || obj.tenantId.trim() === '') {
      return err(ParseErrors.invalidUserStructure('Missing or invalid tenantId'));
    }
    if (typeof obj.createdAt !== 'string') {
      return err(ParseErrors.invalidUserStructure('Missing or invalid createdAt'));
    }
    if (typeof obj.updatedAt !== 'string') {
      return err(ParseErrors.invalidUserStructure('Missing or invalid updatedAt'));
    }

    // Construct validated User object
    const user: User = {
      id: asUserId(obj.id),
      email: obj.email,
      username: obj.username,
      firstName: typeof obj.firstName === 'string' ? obj.firstName : undefined,
      lastName: typeof obj.lastName === 'string' ? obj.lastName : undefined,
      avatar: typeof obj.avatar === 'string' ? obj.avatar : undefined,
      roles: obj.roles,
      tenantId: asTenantId(obj.tenantId),
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };

    return ok(user);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'JSON parse failed';
    return err(ParseErrors.invalidJson(raw, reason));
  }
};

/**
 * Parse and validate stored Tenant data
 *
 * @param raw - Raw JSON string from storage
 * @returns Result containing parsed Tenant or ParseError
 *
 * @example
 * ```typescript
 * const result = parseStoredTenant(storedData);
 * result.match(
 *   (tenant) => console.log('Tenant:', tenant.name),
 *   (error) => console.log('Error:', formatParseError(error))
 * );
 * ```
 */
export const parseStoredTenant = (raw: string): Result<Tenant, ParseError> => {
  try {
    const parsed: unknown = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object') {
      return err(ParseErrors.invalidTenantStructure('Parsed value is not an object'));
    }

    const obj = parsed as Record<string, unknown>;

    // Validate required fields
    if (typeof obj.id !== 'string' || obj.id.trim() === '') {
      return err(ParseErrors.invalidTenantStructure('Missing or invalid id'));
    }
    if (typeof obj.name !== 'string' || obj.name.trim() === '') {
      return err(ParseErrors.invalidTenantStructure('Missing or invalid name'));
    }
    if (!obj.settings || typeof obj.settings !== 'object') {
      return err(ParseErrors.invalidTenantStructure('Missing or invalid settings object'));
    }
    if (!obj.subscription || typeof obj.subscription !== 'object') {
      return err(ParseErrors.invalidTenantStructure('Missing or invalid subscription object'));
    }

    // Construct validated Tenant object
    const tenant: Tenant = {
      id: asTenantId(obj.id),
      name: obj.name,
      domain: typeof obj.domain === 'string' ? obj.domain : undefined,
      logo: typeof obj.logo === 'string' ? obj.logo : undefined,
      settings: obj.settings as Tenant['settings'],
      subscription: obj.subscription as Tenant['subscription'],
    };

    return ok(tenant);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'JSON parse failed';
    return err(ParseErrors.invalidJson(raw, reason));
  }
};

/**
 * Update User with data from JWT payload
 *
 * Ensures that user data matches the JWT token claims
 *
 * @param user - The user object to update
 * @param payload - The JWT payload
 * @returns Updated user object
 */
export const updateUserFromJwt = (user: User, payload: JwtPayload): User => {
  return {
    ...user,
    username: payload.user,
    tenantId: asTenantId(payload.tenant_id),
  };
};

/**
 * Update Tenant with data from JWT payload
 *
 * Ensures that tenant data matches the JWT token claims
 *
 * @param tenant - The tenant object to update
 * @param payload - The JWT payload
 * @returns Updated tenant object
 */
export const updateTenantFromJwt = (tenant: Tenant, payload: JwtPayload): Tenant => {
  return {
    ...tenant,
    id: asTenantId(payload.tenant_id),
  };
};

/**
 * Verify that user and tenant match JWT payload
 *
 * @param user - The user object
 * @param tenant - The tenant object
 * @param payload - The JWT payload
 * @returns Result containing void if valid, or ParseError if mismatch
 */
export const verifyDataMatchesToken = (
  user: User,
  tenant: Tenant,
  payload: JwtPayload
): Result<void, ParseError> => {
  if (user.username !== payload.user) {
    return err(
      ParseErrors.invalidUserStructure(
        `Username mismatch: token has '${payload.user}', user has '${user.username}'`
      )
    );
  }

  // Compare branded TenantId as strings
  if (String(tenant.id) !== payload.tenant_id) {
    return err(
      ParseErrors.invalidTenantStructure(
        `Tenant ID mismatch: token has '${payload.tenant_id}', tenant has '${tenant.id}'`
      )
    );
  }

  return ok(undefined);
};
