/**
 * Authentication Domain Logic
 * 
 * Pure functions for authentication operations using Railway-Oriented Programming.
 * All functions return Result<T, E> for explicit error handling.
 * 
 * This module extracts business logic from the AuthContext and service layer,
 * making it pure, testable, and composable.
 */

import { ok, err } from 'neverthrow';
import type { Result, AsyncResult } from '../types/fp';
import type {
  User,
  Tenant,
  LoginCredentials,
  AuthResponse,
  TokenPayload,
} from '../types/auth';
import type { AuthFlowError, ParseError } from '../types/errors';
import { ParseErrors } from '../types/errors';

/**
 * Session represents an authenticated user session
 */
export interface Session {
  readonly user: User;
  readonly tenant: Tenant;
  readonly token: string;
  readonly refreshToken: string;
  readonly expiresAt: Date;
  readonly issuedAt: Date;
}

/**
 * Token errors
 */
export type TokenError =
  | { type: 'EXPIRED'; expiresAt: Date; now: Date }
  | { type: 'INVALID_FORMAT'; reason: string }
  | { type: 'MISSING_CLAIMS'; claims: string[] }
  | { type: 'VERIFICATION_FAILED'; reason: string };

/**
 * Session errors
 */
export type SessionError =
  | { type: 'EXPIRED'; expiresAt: Date }
  | { type: 'INVALID_TOKEN'; reason: string }
  | { type: 'REFRESH_FAILED'; reason: string }
  | { type: 'USER_NOT_FOUND' }
  | { type: 'TENANT_NOT_FOUND' };

/**
 * Authenticate a user with credentials
 * 
 * This is a pure function that transforms credentials and auth response
 * into a session. The actual API call should be done separately.
 * 
 * @param credentials - User login credentials
 * @param authResponse - Response from authentication API
 * @returns Result containing Session or AuthFlowError
 */
export function authenticateUser(
  credentials: LoginCredentials,
  authResponse: AuthResponse
): Result<Session, AuthFlowError> {
  try {
    // Validate auth response structure
    if (!authResponse.token || !authResponse.refreshToken) {
      return err({
        type: 'INVALID_CREDENTIALS',
        message: 'Invalid authentication response: missing tokens',
      });
    }

    if (!authResponse.user || !authResponse.tenant) {
      return err({
        type: 'INVALID_CREDENTIALS',
        message: 'Invalid authentication response: missing user or tenant data',
      });
    }

    // Calculate expiration time
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + authResponse.expiresIn * 1000);

    // Create session
    const session: Session = {
      user: authResponse.user,
      tenant: authResponse.tenant,
      token: authResponse.token,
      refreshToken: authResponse.refreshToken,
      expiresAt,
      issuedAt,
    };

    return ok(session);
  } catch (error) {
    return err({
      type: 'SERVER_ERROR',
      statusCode: 500,
      message: `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }
}

/**
 * Verify and decode a JWT token
 * 
 * This function validates token format and extracts payload.
 * Actual signature verification should be done server-side.
 * 
 * @param token - JWT token string
 * @returns Result containing TokenPayload or TokenError
 */
export function verifyToken(token: string): Result<TokenPayload, TokenError> {
  try {
    // Validate token format (should have 3 parts separated by dots)
    const parts = token.split('.');
    if (parts.length !== 3) {
      return err({
        type: 'INVALID_FORMAT',
        reason: 'JWT must have 3 parts separated by dots',
      });
    }

    // Decode payload (middle part)
    const payloadBase64Url = parts[1];
    if (!payloadBase64Url) {
      return err({
        type: 'INVALID_FORMAT',
        reason: 'JWT payload part is missing',
      });
    }
    let normalizedPayload = payloadBase64Url.replace(/-/g, '+').replace(/_/g, '/');
    while (normalizedPayload.length % 4 !== 0) {
      normalizedPayload += '=';
    }

    const payloadJson = atob(normalizedPayload);
    const payload = JSON.parse(payloadJson) as TokenPayload;

    // Validate required claims
    const requiredClaims = ['sub', 'email', 'tenantId', 'iat', 'exp'];
    const missingClaims = requiredClaims.filter(claim => !(claim in payload));
    
    if (missingClaims.length > 0) {
      return err({
        type: 'MISSING_CLAIMS',
        claims: missingClaims,
      });
    }

    // Check expiration
    const now = Date.now() / 1000; // Convert to seconds
    if (payload.exp < now) {
      return err({
        type: 'EXPIRED',
        expiresAt: new Date(payload.exp * 1000),
        now: new Date(now * 1000),
      });
    }

    return ok(payload);
  } catch (error) {
    return err({
      type: 'INVALID_FORMAT',
      reason: error instanceof Error ? error.message : 'Failed to parse JWT',
    });
  }
}

/**
 * Check if a session is expired
 * 
 * @param session - Current session
 * @returns true if session is expired
 */
export function isSessionExpired(session: Session): boolean {
  return new Date() > session.expiresAt;
}

/**
 * Check if a session needs refresh (within 5 minutes of expiration)
 * 
 * @param session - Current session
 * @returns true if session should be refreshed
 */
export function shouldRefreshSession(session: Session): boolean {
  const fiveMinutes = 5 * 60 * 1000;
  const timeUntilExpiry = session.expiresAt.getTime() - Date.now();
  return timeUntilExpiry < fiveMinutes && timeUntilExpiry > 0;
}

/**
 * Refresh an existing session
 * 
 * This is a pure function that transforms old session and new auth response
 * into a refreshed session. The actual API call should be done separately.
 * 
 * @param oldSession - Current session
 * @param authResponse - Response from refresh token API
 * @returns Result containing new Session or SessionError
 */
export function refreshSession(
  oldSession: Session,
  authResponse: AuthResponse
): Result<Session, SessionError> {
  try {
    // Validate auth response structure
    if (!authResponse.token || !authResponse.refreshToken) {
      return err({
        type: 'REFRESH_FAILED',
        reason: 'Invalid refresh response: missing tokens',
      });
    }

    // Verify token to ensure it's valid
    const tokenResult = verifyToken(authResponse.token);
    if (tokenResult.isErr()) {
      return err({
        type: 'INVALID_TOKEN',
        reason: `Token verification failed: ${tokenResult.error.type}`,
      });
    }

    // Calculate new expiration time
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + authResponse.expiresIn * 1000);

    // Create new session with updated tokens
    const newSession: Session = {
      ...oldSession,
      token: authResponse.token,
      refreshToken: authResponse.refreshToken,
      expiresAt,
      issuedAt,
      // Update user and tenant if provided in response
      ...(authResponse.user && { user: authResponse.user }),
      ...(authResponse.tenant && { tenant: authResponse.tenant }),
    };

    return ok(newSession);
  } catch (error) {
    return err({
      type: 'REFRESH_FAILED',
      reason: error instanceof Error ? error.message : 'Unknown error during refresh',
    });
  }
}

/**
 * Validate session integrity
 * 
 * Checks if session has all required fields and is not expired
 * 
 * @param session - Session to validate
 * @returns Result containing Session or SessionError
 */
export function validateSession(session: Session): Result<Session, SessionError> {
  // Check if session is expired
  if (isSessionExpired(session)) {
    return err({
      type: 'EXPIRED',
      expiresAt: session.expiresAt,
    });
  }

  // Validate user data
  if (!session.user || !session.user.id) {
    return err({ type: 'USER_NOT_FOUND' });
  }

  // Validate tenant data
  if (!session.tenant || !session.tenant.id) {
    return err({ type: 'TENANT_NOT_FOUND' });
  }

  // Validate tokens
  const tokenResult = verifyToken(session.token);
  if (tokenResult.isErr()) {
    return err({
      type: 'INVALID_TOKEN',
      reason: `Token verification failed: ${tokenResult.error.type}`,
    });
  }

  return ok(session);
}

/**
 * Extract tenant ID from token
 * 
 * @param token - JWT token
 * @returns Result containing tenant ID or TokenError
 */
export function extractTenantId(token: string): Result<string, TokenError> {
  return verifyToken(token).map(payload => payload.tenantId);
}

/**
 * Extract user ID from token
 * 
 * @param token - JWT token
 * @returns Result containing user ID or TokenError
 */
export function extractUserId(token: string): Result<string, TokenError> {
  return verifyToken(token).map(payload => payload.sub);
}

/**
 * Check if user has required role
 * 
 * @param session - Current session
 * @param requiredRole - Role to check for
 * @returns true if user has the role
 */
export function hasRole(session: Session, requiredRole: string): boolean {
  return session.user.roles.includes(requiredRole);
}

/**
 * Check if user has any of the required roles
 * 
 * @param session - Current session
 * @param requiredRoles - Roles to check for
 * @returns true if user has at least one role
 */
export function hasAnyRole(session: Session, requiredRoles: string[]): boolean {
  return requiredRoles.some(role => session.user.roles.includes(role));
}

/**
 * Check if user has all required roles
 * 
 * @param session - Current session
 * @param requiredRoles - Roles to check for
 * @returns true if user has all roles
 */
export function hasAllRoles(session: Session, requiredRoles: string[]): boolean {
  return requiredRoles.every(role => session.user.roles.includes(role));
}
