/**
 * @module contexts/AuthContextFP
 * @description FP-based Authentication Context with Railway-Oriented Programming
 *
 * This is the functional programming version of AuthContext using:
 * - Discriminated union types for state
 * - AsyncResult<T, E> for all async operations
 * - Pure functions and no try-catch blocks
 * - Railway-oriented programming patterns
 *
 * Can be used in parallel with AuthContext during migration via feature flags.
 *
 * @example
 * ```typescript
 * const { state, login, logout } = useAuthFP();
 *
 * state.match(
 *   {
 *     idle: () => <LoginPage />,
 *     loading: () => <Spinner />,
 *     authenticated: ({ user, tenant }) => <Dashboard user={user} />,
 *     error: ({ error }) => <ErrorAlert error={error} />,
 *   }
 * );
 * ```
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { errAsync, okAsync } from 'neverthrow';
import type { AsyncResult } from '../types/fp';
import type { User, Tenant, LoginCredentials, AuthResponse } from '../types/auth';
import type { AppError } from '../types/errors';
import { createAuthError } from '../types/errors';
import { authService } from '../services/api';
import { asTenantId, asUserId } from '../types/ids';
import { decodeJwtPayload } from '../utils/parsing';

/**
 * Discriminated union type for authentication state
 * Represents all possible authentication states in the system
 */
export type AuthStateFP =
  | { type: 'idle' }
  | { type: 'loading' }
  | {
      type: 'authenticated';
      user: User;
      tenant: Tenant;
      token: string;
    }
  | {
      type: 'error';
      error: AppError;
      previousState?: Exclude<AuthStateFP, { type: 'error' }>;
    };

/**
 * FP-based authentication context interface
 * All operations return AsyncResult for type-safe error handling
 */
export interface AuthContextTypeFP {
  state: AuthStateFP;
  login: (credentials: LoginCredentials) => AsyncResult<AuthResponse, AppError>;
  logout: () => AsyncResult<void, AppError>;
  switchTenant: (tenantId: string) => AsyncResult<Tenant, AppError>;
  clearError: () => void;
  retry: () => AsyncResult<void, AppError>;
}

/**
 * Helper: Extract user and tenant from auth response or storage
 */
const extractAuthData = (
  jwtToken: string,
  authResponse: AuthResponse
): AsyncResult<{ user: User; tenant: Tenant; token: string }, AppError> => {
  try {
    const jwtResult = decodeJwtPayload(jwtToken);

    if (jwtResult.isErr()) {
      const parseError = jwtResult.error;
      const errorDetails =
        parseError.type === 'INVALID_JSON'
          ? parseError.reason
          : parseError.type === 'MISSING_JWT_FIELDS'
            ? `Missing fields: ${parseError.fields.join(', ')}`
            : 'Invalid JWT format';

      return errAsync(
        createAuthError('Invalid JWT token', {
          details: errorDetails,
        })
      );
    }

    const jwtPayload = jwtResult.value;

    const user: User = {
      ...authResponse.user,
      id: asUserId(jwtPayload.user),
      username: jwtPayload.user,
      tenantId: asTenantId(jwtPayload.tenant_id),
    };

    const tenant: Tenant = {
      ...authResponse.tenant,
      id: asTenantId(jwtPayload.tenant_id),
    };

    return okAsync({ user, tenant, token: jwtToken });
  } catch (error) {
    return errAsync(
      createAuthError('Failed to extract auth data', {
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    );
  }
};

/**
 * Helper: Validate and store authentication data
 */
const storeAuthData = (user: User, tenant: Tenant, token: string): AsyncResult<void, AppError> => {
  try {
    localStorage.setItem('auth_token', JSON.stringify({ token }));
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('tenant', JSON.stringify(tenant));
    return okAsync(undefined);
  } catch (error) {
    return errAsync(
      createAuthError('Failed to store authentication data', {
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    );
  }
};

/**
 * Helper: Clear all authentication data from storage
 */
const clearAuthStorage = (): AsyncResult<void, AppError> => {
  try {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    localStorage.removeItem('tenant');
    return okAsync(undefined);
  } catch (error) {
    return errAsync(
      createAuthError('Failed to clear authentication data', {
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    );
  }
};

/**
 * Helper: Load authentication data from storage
 */
const loadAuthData = (): AsyncResult<{ user: User; tenant: Tenant; token: string }, AppError> => {
  try {
    const tokenData = localStorage.getItem('auth_token');
    const userData = localStorage.getItem('user');
    const tenantData = localStorage.getItem('tenant');

    if (!tokenData || !userData || !tenantData) {
      return errAsync(createAuthError('No authentication data found in storage'));
    }

    const token = (JSON.parse(tokenData) as Record<string, unknown>).token as string;
    const user = JSON.parse(userData) as User;
    const tenant = JSON.parse(tenantData) as Tenant;

    return okAsync({ user, tenant, token });
  } catch (error) {
    return errAsync(
      createAuthError('Failed to load authentication data', {
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    );
  }
};

/**
 * Helper: Check if JWT token is expired
 */
const isTokenExpired = (token: string): AsyncResult<boolean, AppError> => {
  try {
    const jwtResult = decodeJwtPayload(token);

    if (jwtResult.isErr()) {
      return okAsync(true); // Treat invalid tokens as expired
    }

    const payload = jwtResult.value;
    const now = Math.floor(Date.now() / 1000);
    return okAsync(payload.exp < now);
  } catch {
    return okAsync(true);
  }
};

/**
 * FP-based authentication context
 */
const AuthContextFP = createContext<AuthContextTypeFP | undefined>(undefined);

export { AuthContextFP };

interface AuthProviderFPProps {
  children: ReactNode;
}

/**
 * FP-based authentication provider
 * Manages authentication state using discriminated unions and Result types
 */
export const AuthProviderFP: React.FC<AuthProviderFPProps> = ({ children }) => {
  const [state, setState] = useState<AuthStateFP>({ type: 'idle' });
  const isMountedRef = React.useRef(true);

  /**
   * Initialize authentication on component mount
   */
  useEffect(() => {
    const abortController = new AbortController();

    const initAuth = async () => {
      setState({ type: 'loading' });

      const authResult = await loadAuthData();

      if (abortController.signal.aborted) return;

      authResult.match(
        async ({ user, tenant, token }) => {
          // Check if token is expired
          const expiredResult = await isTokenExpired(token);

          if (abortController.signal.aborted) return;

          const isExpired = expiredResult.isOk() ? expiredResult.value : true;

          if (isExpired) {
            // Try to refresh token
            const refreshResult = await authService.refreshToken();

            if (abortController.signal.aborted) return;

            refreshResult.match(
              authResponse => {
                if (isMountedRef.current && !abortController.signal.aborted) {
                  extractAuthData(authResponse.token, authResponse).match(
                    ({ user: refreshedUser, tenant: refreshedTenant, token: newToken }) => {
                      if (isMountedRef.current && !abortController.signal.aborted) {
                        storeAuthData(refreshedUser, refreshedTenant, newToken).mapErr(error => {
                          console.error('Failed to store refreshed auth data:', error.message);
                        });

                        setState({
                          type: 'authenticated',
                          user: refreshedUser,
                          tenant: refreshedTenant,
                          token: newToken,
                        });
                      }
                    },
                    error => {
                      if (isMountedRef.current && !abortController.signal.aborted) {
                        clearAuthStorage();
                        setState({ type: 'error', error });
                      }
                    }
                  );
                }
              },
              error => {
                if (isMountedRef.current && !abortController.signal.aborted) {
                  clearAuthStorage();
                  setState({ type: 'error', error });
                }
              }
            );
          } else {
            // Token still valid
            if (isMountedRef.current && !abortController.signal.aborted) {
              setState({
                type: 'authenticated',
                user,
                tenant,
                token,
              });
            }
          }
        },
        error => {
          if (isMountedRef.current && !abortController.signal.aborted) {
            setState({ type: 'idle' });
          }
        }
      );
    };

    initAuth();

    return () => {
      abortController.abort();
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Login operation
   */
  const login = useCallback(
    (credentials: LoginCredentials): AsyncResult<AuthResponse, AppError> => {
      // Update state to loading
      setState({ type: 'loading' });

      // Ensure tenant ID is set
      const tenantId = credentials.tenantId ?? asTenantId('tenant1');
      const modifiedCredentials = { ...credentials, tenantId };

      // Execute login
      return authService
        .login(modifiedCredentials)
        .andThen(authResponse => {
          if (!authResponse.success) {
            const error = createAuthError(authResponse.message ?? 'Login failed');

            if (isMountedRef.current) {
              setState({
                type: 'error',
                error,
                previousState: { type: 'idle' },
              });
            }

            return errAsync(error);
          }

          // Extract and store auth data
          return extractAuthData(authResponse.token, authResponse).andThen(
            ({ user, tenant, token }) => {
              return storeAuthData(user, tenant, token).andThen(() => {
                if (isMountedRef.current) {
                  setState({
                    type: 'authenticated',
                    user,
                    tenant,
                    token,
                  });
                }

                return okAsync(authResponse);
              });
            }
          );
        })
        .mapErr(error => {
          if (isMountedRef.current) {
            setState({
              type: 'error',
              error,
              previousState: { type: 'idle' },
            });
          }
          return error;
        });
    },
    []
  );

  /**
   * Logout operation
   */
  const logout = useCallback((): AsyncResult<void, AppError> => {
    return clearAuthStorage().map(() => {
      if (isMountedRef.current) {
        setState({ type: 'idle' });
      }
    });
  }, []);

  /**
   * Switch tenant operation
   */
  const switchTenant = useCallback(
    (tenantId: string): AsyncResult<Tenant, AppError> => {
      if (state.type !== 'authenticated') {
        return errAsync(
          createAuthError('Not authenticated', {
            currentState: state.type,
          })
        );
      }

      // For now, just return the current tenant
      // In a real app, this would refresh context with new tenant
      return okAsync(state.tenant);
    },
    [state]
  );

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    if (state.type === 'error' && state.previousState) {
      setState(state.previousState);
    } else {
      setState({ type: 'idle' });
    }
  }, [state]);

  /**
   * Retry failed operation
   */
  const retry = useCallback((): AsyncResult<void, AppError> => {
    if (state.type === 'error') {
      // Retry by reinitializing
      setState({ type: 'loading' });
      return okAsync(undefined);
    }
    return okAsync(undefined);
  }, [state]);

  return (
    <AuthContextFP.Provider
      value={{
        state,
        login,
        logout,
        switchTenant,
        clearError,
        retry,
      }}
    >
      {children}
    </AuthContextFP.Provider>
  );
};

/**
 * Hook to use FP authentication context
 * Provides type-safe access to authentication state and operations
 *
 * @returns Authentication context with state and operations
 * @throws Error if used outside AuthProviderFP
 *
 * @example
 * ```typescript
 * const { state, login, logout } = useAuthFP();
 *
 * // Pattern match on state
 * state.type === 'authenticated' && <Dashboard user={state.user} />
 * ```
 */
export const useAuthFP = (): AuthContextTypeFP => {
  const context = useContext(AuthContextFP);

  if (context === undefined) {
    throw new Error('useAuthFP must be used within AuthProviderFP');
  }

  return context;
};
