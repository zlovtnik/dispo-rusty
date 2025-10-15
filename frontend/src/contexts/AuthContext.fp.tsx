/**
 * AuthContext - Functional Programming Refactored Version
 *
 * This context manages authentication state using Result types and railway-oriented programming.
 * All operations return Results for type-safe error handling without exceptions.
 *
 * Key Features:
 * - Result-based error handling with neverthrow
 * - Railway-oriented programming for login flow
 * - Validation pipeline for credentials
 * - Type-safe storage operations
 * - JWT token parsing and validation
 *
 * @module AuthContext
 */

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { type Result, ok, err } from 'neverthrow';
import { authService } from '../services/api';
import type { User, Tenant, LoginCredentials } from '../types/auth';
import { asTenantId } from '../types/ids';
import type { TenantId } from '../types/ids';

// Import FP utilities
import { storageService, StorageKey, clearAuthData } from '../services/StorageService';
import { validateLoginCredentials } from '../utils/validation';
import {
  decodeJwtPayload,
  checkTokenExpiry,
  parseStoredUser,
  parseStoredTenant,
  updateUserFromJwt,
  updateTenantFromJwt,
  verifyDataMatchesToken,
  type JwtPayload,
} from '../utils/parsing';
import type {
  StorageError,
  ParseError,
  CredentialValidationError,
  AuthFlowError,
} from '../types/errors';
import {
  AuthFlowErrors,
  formatAuthFlowError,
  formatCredentialValidationError,
  isParseError,
} from '../types/errors';

/**
 * Authentication context type
 */
export interface AuthContextType {
  user: User | null;
  tenant: Tenant | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (
    credentials: LoginCredentials
  ) => Promise<Result<void, AuthFlowError | CredentialValidationError>>;
  logout: () => Promise<Result<void, AuthFlowError>>;
  refreshToken: () => Promise<Result<void, AuthFlowError>>;
  clearError: () => void;
}

/**
 * Authentication state for internal use
 */
interface AuthState {
  user: User;
  tenant: Tenant;
  token: string;
}

/**
 * Token data structure from storage
 */
interface TokenData {
  token: string;
}

// Context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Provider props
interface AuthProviderProps {
  children: ReactNode;
  defaultTenantId?: TenantId;
}

/**
 * Load authentication state from storage
 *
 * Railway-oriented function that:
 * 1. Loads token from storage
 * 2. Decodes and validates JWT
 * 3. Checks expiration
 * 4. Loads and validates user/tenant data
 * 5. Verifies data matches token
 *
 * @returns Result containing AuthState or error
 */
const loadAuthFromStorage = (): Result<AuthState, StorageError | ParseError> => {
  return (
    storageService
      .get<TokenData>(StorageKey.AUTH_TOKEN)
      // Decode and validate JWT
      .andThen(tokenData => {
        const token = tokenData.token;
        return decodeJwtPayload(token).map(payload => ({ token, payload }));
      })
      // Check token expiry
      .andThen(({ token, payload }) => {
        return checkTokenExpiry(payload).map(() => ({ token, payload }));
      })
      // Load and parse user data
      .andThen(({ token, payload }) => {
        return storageService
          .get<string>(StorageKey.USER)
          .andThen(userJson => parseStoredUser(userJson))
          .map(user => ({ token, payload, user }));
      })
      // Load and parse tenant data
      .andThen(({ token, payload, user }) => {
        return storageService
          .get<string>(StorageKey.TENANT)
          .andThen(tenantJson => parseStoredTenant(tenantJson))
          .map(tenant => ({ token, payload, user, tenant }));
      })
      // Verify data matches token
      .andThen(({ token, payload, user, tenant }) => {
        return verifyDataMatchesToken(user, tenant, payload).map(() => ({
          user,
          tenant,
          token,
        }));
      })
  );
};

/**
 * Attempt token refresh with stored data
 *
 * @param storedUser - Stored user data
 * @param storedTenant - Stored tenant data
 * @returns Result containing refreshed AuthState or error
 */
const attemptTokenRefresh = async (
  storedUser: string,
  storedTenant: string
): Promise<Result<AuthState, AuthFlowError | ParseError>> => {
  // Call refresh API
  const refreshResult = await authService.refreshToken();

  if (refreshResult.isErr()) {
    const apiError = refreshResult.error;
    if (apiError.statusCode === 401 || apiError.statusCode === 403) {
      return err(AuthFlowErrors.unauthorized('Token refresh failed - authentication expired'));
    }
    return err(
      AuthFlowErrors.tokenRefreshFailed(
        apiError.message || 'Token refresh failed due to network error'
      )
    );
  }

  const refreshResponse = refreshResult.value;

  if (!refreshResponse.success || !refreshResponse.token) {
    return err(
      AuthFlowErrors.tokenRefreshFailed(refreshResponse.message || 'No token received from server')
    );
  }

  const newToken = refreshResponse.token;

  // Decode new token
  return decodeJwtPayload(newToken)
    .mapErr(parseErr => AuthFlowErrors.tokenRefreshFailed(`Invalid token format: ${parseErr.type}`))
    .andThen(payload => {
      // Get user from response or parse from storage
      let userResult: Result<User, ParseError>;
      if (refreshResponse.user !== null && refreshResponse.user !== undefined) {
        userResult = ok(updateUserFromJwt(refreshResponse.user, payload));
      } else {
        userResult = parseStoredUser(storedUser).map(user => updateUserFromJwt(user, payload));
      }

      // Get tenant from response or parse from storage
      let tenantResult: Result<Tenant, ParseError>;
      if (refreshResponse.tenant !== null && refreshResponse.tenant !== undefined) {
        tenantResult = ok(updateTenantFromJwt(refreshResponse.tenant, payload));
      } else {
        tenantResult = parseStoredTenant(storedTenant).map(tenant =>
          updateTenantFromJwt(tenant, payload)
        );
      }

      // Combine results
      return userResult
        .andThen(user =>
          tenantResult.map(tenant => ({
            user,
            tenant,
            token: newToken,
          }))
        )
        .mapErr(parseErr =>
          AuthFlowErrors.tokenRefreshFailed(`Data validation failed: ${parseErr.type}`)
        );
    });
};

/**
 * Save authentication state to storage
 *
 * @param user - User data
 * @param tenant - Tenant data
 * @param token - JWT token
 * @returns Result containing void or StorageError
 */
const saveAuthToStorage = (
  user: User,
  tenant: Tenant,
  token: string
): Result<void, StorageError> => {
  return storageService
    .set(StorageKey.AUTH_TOKEN, { token })
    .andThen(() => storageService.set(StorageKey.USER, JSON.stringify(user)))
    .andThen(() => storageService.set(StorageKey.TENANT, JSON.stringify(tenant)));
};

/**
 * AuthProvider component
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({
  children,
  defaultTenantId = asTenantId('tenant1'),
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  // In a multi-tenant system, authentication requires both user and tenant
  const isAuthenticated = !!user && !!tenant;

  /**
   * Initialize auth state from storage
   */
  useEffect(() => {
    const abortController = new AbortController();

    const initAuth = async (): Promise<void> => {
      try {
        // Try to load from storage
        const loadResult = loadAuthFromStorage();

        if (loadResult.isOk()) {
          // Successfully loaded from storage
          const authState = loadResult.value;
          if (isMountedRef.current && !abortController.signal.aborted) {
            setUser(authState.user);
            setTenant(authState.tenant);
          }
        } else {
          // Failed to load - check if token is expired
          const isExpiredToken = loadResult.error.type === 'EXPIRED_TOKEN';

          if (isExpiredToken) {
            // Try to refresh token
            const storedUserResult = storageService.get<string>(StorageKey.USER);
            const storedTenantResult = storageService.get<string>(StorageKey.TENANT);

            if (storedUserResult.isOk() && storedTenantResult.isOk()) {
              const refreshResult = await attemptTokenRefresh(
                storedUserResult.value,
                storedTenantResult.value
              );

              if (refreshResult.isOk() && !abortController.signal.aborted) {
                const authState = refreshResult.value;

                // Save refreshed data
                const saveResult = saveAuthToStorage(
                  authState.user,
                  authState.tenant,
                  authState.token
                );
                if (saveResult.isErr()) {
                  console.error('Failed to save refreshed auth data:', saveResult.error);
                }

                if (isMountedRef.current) {
                  setUser(authState.user);
                  setTenant(authState.tenant);
                }
              } else {
                // Refresh failed - clear storage
                if (!abortController.signal.aborted) {
                  clearAuthData();
                }
              }
            }
          } else {
            // Other error - clear storage
            if (!abortController.signal.aborted) {
              clearAuthData();
            }
          }
        }
      } catch (initError) {
        if (!abortController.signal.aborted) {
          clearAuthData();
          console.error('Auth initialization failed:', initError);
        }
      } finally {
        if (isMountedRef.current && !abortController.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    initAuth();

    return () => {
      abortController.abort();
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Login with credentials
   *
   * Uses railway-oriented programming:
   * 1. Validate credentials
   * 2. Call login API
   * 3. Decode JWT token
   * 4. Extract user/tenant from response
   * 5. Save to storage
   * 6. Update state
   */
  const login = async (
    credentials: LoginCredentials
  ): Promise<Result<void, AuthFlowError | CredentialValidationError>> => {
    setIsLoading(true);
    setError(null);

    // Use default tenant if not provided
    const tenantId = credentials.tenantId ?? defaultTenantId;

    // Step 1: Validate credentials
    const validationResult = validateLoginCredentials(
      credentials.usernameOrEmail,
      credentials.password,
      tenantId
    );

    if (validationResult.isErr()) {
      const validationError = validationResult.error;
      const errorMessage = formatCredentialValidationError(validationError);
      setError(errorMessage);
      setIsLoading(false);
      return err(validationError);
    }

    // Step 2: Call login API
    const modifiedCredentials: LoginCredentials = {
      ...credentials,
      tenantId,
    };

    const loginResult = await authService.login(modifiedCredentials);

    if (loginResult.isErr()) {
      const apiError = loginResult.error;

      // Map error types appropriately based on status code and error type
      let authError: AuthFlowError;

      if (apiError.statusCode === 401) {
        authError = AuthFlowErrors.unauthorized(apiError.message || 'Invalid username or password');
      } else if (apiError.statusCode === 403) {
        authError = AuthFlowErrors.forbidden(apiError.message || 'Access denied');
      } else if (
        apiError.statusCode === 408 ||
        apiError.statusCode === 504 ||
        !apiError.statusCode
      ) {
        // Network errors or timeouts (no status code often indicates network failure)
        authError = AuthFlowErrors.networkError(
          apiError.message || 'Network connection failed',
          apiError.statusCode
        );
      } else if (apiError.statusCode && apiError.statusCode >= 400 && apiError.statusCode < 500) {
        // Client errors (4xx) - validation or request issues
        authError = AuthFlowErrors.invalidCredentials(
          apiError.message || 'Request validation failed'
        );
      } else if (apiError.statusCode && apiError.statusCode >= 500) {
        // Server errors (5xx)
        authError = AuthFlowErrors.serverError(
          apiError.statusCode,
          apiError.message || 'Server error occurred'
        );
      } else {
        // Other unexpected errors
        authError = AuthFlowErrors.serverError(
          apiError.statusCode || 500,
          apiError.message || 'Login failed'
        );
      }

      setError(formatAuthFlowError(authError));
      setIsLoading(false);
      return err(authError);
    }

    const authResponse = loginResult.value;

    if (!authResponse.success || !authResponse.token) {
      const authError = AuthFlowErrors.invalidCredentials(
        authResponse.message || 'Login failed - no token received'
      );
      setError(formatAuthFlowError(authError));
      setIsLoading(false);
      return err(authError);
    }

    // Step 3: Decode JWT token
    const token = authResponse.token;
    const payloadResult = decodeJwtPayload(token);

    if (payloadResult.isErr()) {
      const authError = AuthFlowErrors.invalidCredentials('Invalid token format received');
      setError(formatAuthFlowError(authError));
      setIsLoading(false);
      clearAuthData();
      return err(authError);
    }

    const payload = payloadResult.value;

    // Step 4: Extract and validate user/tenant
    const user = updateUserFromJwt(authResponse.user, payload);
    const tenant = updateTenantFromJwt(authResponse.tenant, payload);

    // Step 5: Save to storage
    const saveResult = saveAuthToStorage(user, tenant, token);

    if (saveResult.isErr()) {
      const authError = AuthFlowErrors.networkError('Failed to save authentication data');
      setError(formatAuthFlowError(authError));
      setIsLoading(false);
      return err(authError);
    }

    // Step 6: Update state
    setUser(user);
    setTenant(tenant);
    setIsLoading(false);

    return ok(undefined);
  };

  /**
   * Logout user
   */
  const logout = async (): Promise<Result<void, AuthFlowError>> => {
    try {
      // Call logout API
      const logoutResult = await authService.logout();

      if (logoutResult.isErr()) {
        console.error('Server-side logout failed:', logoutResult.error);
        // Continue with local cleanup even if server call fails
      }

      // Clear storage
      clearAuthData();

      // Clear state
      setUser(null);
      setTenant(null);
      setError(null);

      return ok(undefined);
    } catch (logoutError) {
      // Always clear local data even on error
      clearAuthData();
      setUser(null);
      setTenant(null);

      const error = AuthFlowErrors.logoutFailed(
        logoutError instanceof Error ? logoutError.message : 'Unknown error'
      );
      return err(error);
    }
  };

  /**
   * Refresh authentication token
   */
  const refreshToken = async (): Promise<Result<void, AuthFlowError>> => {
    try {
      const storedUserResult = storageService.get<string>(StorageKey.USER);
      const storedTenantResult = storageService.get<string>(StorageKey.TENANT);

      if (storedUserResult.isErr() || storedTenantResult.isErr()) {
        const error = AuthFlowErrors.missingToken();
        await logout();
        return err(error);
      }

      const refreshResult = await attemptTokenRefresh(
        storedUserResult.value,
        storedTenantResult.value
      );

      if (refreshResult.isErr()) {
        const error = refreshResult.error;

        // If unauthorized, logout user
        if (error.type === 'UNAUTHORIZED') {
          await logout();
        }

        // Map ParseError to AuthFlowError if needed - use type guard for safety
        if (isParseError(error)) {
          return err(AuthFlowErrors.tokenRefreshFailed(`Token validation failed: ${error.type}`));
        }

        return err(error as AuthFlowError);
      }

      const authState = refreshResult.value;

      // Save refreshed data
      const saveResult = saveAuthToStorage(authState.user, authState.tenant, authState.token);

      if (saveResult.isErr()) {
        return err(AuthFlowErrors.tokenRefreshFailed('Failed to save refreshed data'));
      }

      // Update state
      setUser(authState.user);
      setTenant(authState.tenant);

      return ok(undefined);
    } catch (refreshError) {
      const error = AuthFlowErrors.tokenRefreshFailed(
        refreshError instanceof Error ? refreshError.message : 'Unknown error'
      );
      return err(error);
    }
  };

  /**
   * Clear error state
   */
  const clearError = (): void => {
    setError(null);
  };

  const value: AuthContextType = {
    user,
    tenant,
    isAuthenticated,
    isLoading,
    error,
    login,
    logout,
    refreshToken,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/**
 * Hook to use auth context
 *
 * @throws Error if used outside AuthProvider
 */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
