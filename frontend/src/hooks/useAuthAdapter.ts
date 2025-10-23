/**
 * @module hooks/useAuthAdapter
 * @description Adapter hook for switching between traditional and FP auth implementations
 *
 * Provides a uniform interface regardless of which auth context is active,
 * enabling gradual migration from imperative to FP-based patterns.
 */

import { useAuth as useAuthTraditional } from './useAuth';
import { useAuthFP } from '../contexts/AuthContextFP';
import { isFeatureEnabled } from '../config/featureFlags';
import type { LoginCredentials, AuthResponse, User, Tenant } from '../types/auth';
import type { AsyncResult } from '../types/fp';
import type { AppError } from '../types/errors';

/**
 * Unified authentication state (works with both implementations)
 */
export interface UnifiedAuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: User | null;
  tenant: Tenant | null;
  error: AppError | Error | string | null;
}

/**
 * Unified authentication operations
 */
export interface UnifiedAuthOperations {
  login: (credentials: LoginCredentials) => Promise<AuthResponse | undefined>;
  logout: () => Promise<void>;
  isReady: boolean;
}

/**
 * Adapter hook that provides unified interface for both auth implementations
 *
 * When VITE_USE_FP_AUTH is enabled, uses FP context.
 * Otherwise, uses traditional context.
 *
 * @returns Unified authentication state and operations
 * @throws Error if used outside both auth providers
 *
 * @example
 * ```typescript
 * const { state, operations } = useAuthAdapter();
 *
 * if (state.isLoading) return <Spinner />;
 * if (!state.isAuthenticated) return <LoginPage onLogin={operations.login} />;
 * return <Dashboard user={state.user} />;
 * ```
 */
export const useAuthAdapter = (): {
  state: UnifiedAuthState;
  operations: UnifiedAuthOperations;
} => {
  const useFPAuth = isFeatureEnabled('useFPAuth');

  if (useFPAuth) {
    // Use FP implementation
    const fpContext = useAuthFP();
    const fpState = fpContext.state;

    const unifiedState: UnifiedAuthState = {
      isLoading: fpState.type === 'loading',
      isAuthenticated: fpState.type === 'authenticated',
      user: fpState.type === 'authenticated' ? fpState.user : null,
      tenant: fpState.type === 'authenticated' ? fpState.tenant : null,
      error: fpState.type === 'error' ? fpState.error : null,
    };

    const unifiedOperations: UnifiedAuthOperations = {
      login: async (credentials: LoginCredentials) => {
        const result = await fpContext.login(credentials);
        return result.match(
          response => response,
          error => {
            console.error('[useAuthAdapter] Login failed:', error.message);
            return undefined;
          }
        );
      },
      logout: async () => {
        const result = await fpContext.logout();
        result.match(
          () => undefined,
          error => {
            console.error('[useAuthAdapter] Logout failed:', error.message);
          }
        );
      },
      isReady: fpState.type !== 'loading',
    };

    return { state: unifiedState, operations: unifiedOperations };
  } else {
    // Use traditional implementation
    const traditionalContext = useAuthTraditional();

    const unifiedState: UnifiedAuthState = {
      isLoading: traditionalContext.isLoading,
      isAuthenticated: traditionalContext.isAuthenticated,
      user: traditionalContext.user,
      tenant: traditionalContext.tenant,
      error: traditionalContext.error || null,
    };

    const unifiedOperations: UnifiedAuthOperations = {
      login: async (credentials: LoginCredentials) => {
        try {
          const response = await traditionalContext.login(credentials);
          if (response) {
            return response;
          }
          return undefined;
        } catch (error) {
          console.error('[useAuthAdapter] Login failed:', error);
          return undefined;
        }
      },
      logout: async () => {
        try {
          await traditionalContext.logout();
        } catch (error) {
          console.error('[useAuthAdapter] Logout failed:', error);
        }
      },
      isReady: !traditionalContext.isLoading,
    };

    return { state: unifiedState, operations: unifiedOperations };
  }
};
