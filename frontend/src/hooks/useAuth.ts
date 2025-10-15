import { useMemo } from 'react';
import { useAuth as useAuthContext } from '../contexts/AuthContext.fp';
import type { Result } from '../types/fp';
import { ok, err } from 'neverthrow';
import type { AuthFlowError, CredentialValidationError, StorageError } from '../types/errors';
import { AuthFlowErrors } from '../types/errors';
import { extractTenantId, extractUserId, type TokenError } from '../domain/auth';
import { validateTenantAccess, type AccessError } from '../domain/tenants';
import type { TenantId } from '../types/ids';
import { getAuthToken } from '../services/StorageService';
import type { LoginCredentials } from '../types/auth';

const mapStorageErrorToAuthFlowError = (error: StorageError): AuthFlowError => {
  switch (error.type) {
    case 'NOT_FOUND':
      return AuthFlowErrors.missingToken();
    case 'PARSE_ERROR':
      return AuthFlowErrors.initFailed(`Stored auth data is invalid: ${error.reason}`);
    case 'STRINGIFY_ERROR':
      return AuthFlowErrors.serverError(500, `Failed to serialize auth data: ${error.reason}`);
    case 'QUOTA_EXCEEDED':
      return AuthFlowErrors.serverError(507, 'Storage quota exceeded for authentication data');
    case 'STORAGE_UNAVAILABLE':
      return AuthFlowErrors.initFailed(`Storage unavailable: ${error.reason}`);
    case 'VERSION_MISMATCH':
      return AuthFlowErrors.initFailed(
        `Storage version mismatch for auth data (expected ${error.expected}, got ${error.got})`
      );
  }
};

const mapTokenErrorToAuthFlowError = (error: TokenError): AuthFlowError => {
  switch (error.type) {
    case 'EXPIRED':
      return AuthFlowErrors.tokenExpired();
    case 'INVALID_FORMAT':
      return AuthFlowErrors.tokenRefreshFailed(`Invalid token format: ${error.reason}`);
    case 'MISSING_CLAIMS':
      return AuthFlowErrors.tokenRefreshFailed(
        `Token missing required claims: ${error.claims.join(', ')}`
      );
    case 'VERIFICATION_FAILED':
      return AuthFlowErrors.tokenRefreshFailed(`Token verification failed: ${error.reason}`);
  }
};

/**
 * Enhanced auth hook that exposes Result-based methods for railway-oriented programming
 *
 * Wraps the existing useAuth context hook and provides Result-based API
 * for better error handling and composition.
 */
export function useAuth() {
  const auth = useAuthContext();

  const resultApi = useMemo(() => {
    const requireAuthResult = (): Result<boolean, AuthFlowError> => {
      if (auth.isAuthenticated) {
        return ok(true);
      }
      return err(AuthFlowErrors.unauthorized('User is not authenticated'));
    };

    const ensureAuthenticated = (): Result<void, AuthFlowError> =>
      requireAuthResult().map(() => undefined);

    const getUserResult = (): Result<NonNullable<typeof auth.user>, AuthFlowError> => {
      if (auth.user) {
        return ok(auth.user);
      }
      return err(AuthFlowErrors.unauthorized('User context is unavailable'));
    };

    const getTenantResult = (): Result<NonNullable<typeof auth.tenant>, AuthFlowError> => {
      if (auth.tenant) {
        return ok(auth.tenant);
      }
      return err(AuthFlowErrors.unauthorized('Tenant context is unavailable'));
    };

    const getTokenResult = (): Result<string, AuthFlowError> =>
      getAuthToken()
        .map(stored => stored.token)
        .mapErr(mapStorageErrorToAuthFlowError);

    const getTenantIdFromToken = (): Result<string, AuthFlowError> =>
      getTokenResult().andThen(token =>
        extractTenantId(token).mapErr(mapTokenErrorToAuthFlowError)
      );

    const getUserIdFromToken = (): Result<string, AuthFlowError> =>
      getTokenResult().andThen(token => extractUserId(token).mapErr(mapTokenErrorToAuthFlowError));

    const requireRole = (role: string): Result<void, AuthFlowError> =>
      getUserResult().andThen(user =>
        user.roles.includes(role)
          ? ok(undefined)
          : err(AuthFlowErrors.forbidden(`Missing required role: ${role}`))
      );

    const requireAnyRole = (roles: string[]): Result<void, AuthFlowError> =>
      getUserResult().andThen(user =>
        roles.some(role => user.roles.includes(role))
          ? ok(undefined)
          : err(AuthFlowErrors.forbidden(`User lacks required roles: ${roles.join(', ')}`))
      );

    const requireAllRoles = (roles: string[]): Result<void, AuthFlowError> =>
      getUserResult().andThen(user =>
        roles.every(role => user.roles.includes(role))
          ? ok(undefined)
          : err(AuthFlowErrors.forbidden(`User must have roles: ${roles.join(', ')}`))
      );

    const requireTenantAccess = (tenantId: TenantId): Result<void, AuthFlowError | AccessError> =>
      getUserResult().andThen(user => validateTenantAccess(user, tenantId));

    return {
      login: (credentials: LoginCredentials) => auth.login(credentials),
      logout: () => auth.logout(),
      refreshToken: () => auth.refreshToken(),
      requireAuth: requireAuthResult,
      ensureAuthenticated,
      getUserResult,
      getTenantResult,
      getTokenResult,
      getTenantIdFromToken,
      getUserIdFromToken,
      requireRole,
      requireAnyRole,
      requireAllRoles,
      requireTenantAccess,
    };
  }, [auth]);

  return {
    // Original auth state
    user: auth.user,
    tenant: auth.tenant,
    isAuthenticated: auth.isAuthenticated,
    isLoading: auth.isLoading,
    error: auth.error,
    clearError: auth.clearError,

    // Result-based API (spread last to ensure these override)
    ...resultApi,
  };
}
