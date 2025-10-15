/**
 * JWT Mock Utilities for Testing
 *
 * Provides helper functions to create mock JWT tokens for tests.
 */

/**
 * Creates a mock JWT token with the given payload
 *
 * @param payload - The payload to encode in the JWT
 * @returns A mock JWT token string (header.payload.signature)
 *
 * @example
 * ```typescript
 * const token = createMockJwt({ user: 'testuser', tenant_id: 'tenant1', exp: Date.now() / 1000 + 3600 });
 * ```
 */
export const createMockJwt = (payload: Record<string, unknown>): string => {
  // JWT header (standard HS256)
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  // Encode header and payload to base64
  const encodedHeader = btoa(JSON.stringify(header));
  const encodedPayload = btoa(JSON.stringify(payload));

  // Mock signature (not cryptographically valid, but structurally correct for decoding)
  const mockSignature = 'mock-signature-for-testing';

  return `${encodedHeader}.${encodedPayload}.${mockSignature}`;
};

/**
 * Creates a mock JWT for a specific user and tenant
 *
 * @param username - The username to include in the token
 * @param tenantId - The tenant ID to include in the token
 * @param expiresInSeconds - How long the token should be valid (default: 1 hour)
 * @returns A mock JWT token string
 */
export const createMockAuthJwt = (
  username: string,
  tenantId: string,
  expiresInSeconds = 3600
): string => {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    user: username,
    tenant_id: tenantId,
    exp: now + expiresInSeconds,
    iat: now,
  };

  return createMockJwt(payload);
};
