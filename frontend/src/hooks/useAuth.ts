import { useMemo } from 'react';
import { useAuth as useAuthContext } from '../contexts/AuthContext.fp';
import type { Result } from '../types/fp';
import { ok, err } from 'neverthrow';
import type { AuthFlowError, CredentialValidationError } from '../types/errors';
import { AuthFlowErrors } from '../types/errors';
import type { LoginCredentials } from '../types/auth';

/**
 * Enhanced auth hook that exposes Result-based methods for railway-oriented programming
 *
 * Wraps the existing useAuth context hook and provides Result-based API
 * for better error handling and composition.
 */
export function useAuth() {
  const auth = useAuthContext();

  const resultApi = useMemo(() => ({
    /**
     * Login with Result-based error handling
     * Returns Promise<Result<void, AuthFlowError | CredentialValidationError>>
     */
    login: (credentials: LoginCredentials) =>
      auth.login(credentials),

    /**
     * Logout with Result-based error handling
     * Returns Promise<Result<void, AuthFlowError>>
     */
    logout: () =>
      auth.logout(),

    /**
     * Refresh token with Result-based error handling
     * Returns Promise<Result<void, AuthFlowError>>
     */
    refreshToken: () =>
      auth.refreshToken(),

    /**
     * Check if user is authenticated (convenience method)
     * Returns Result<boolean, AuthFlowError>
     */
    requireAuth: (): Result<boolean, AuthFlowError> => {
      if (auth.isAuthenticated) {
        return ok(true);
      }
      return err(AuthFlowErrors.unauthorized('User is not authenticated'));
    },

  }), [auth]);

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
