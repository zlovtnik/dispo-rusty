import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { authService } from '../services/api';
import type { AuthResponse, User, Tenant, LoginCredentials, TenantSettings } from '../types/auth';
import type { ApiResponse } from '../types/api';
import { isApiSuccess } from '../types/api';
import type { AppError } from '../types/errors';
import { asTenantId, asUserId } from '../types/ids';
import type { Result } from '../types/fp';

export interface AuthContextType {
  user: User | null;
  tenant: Tenant | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  // JWT Authentication Integration with backend API
  // - Real authentication endpoints integration with existing Actix Web backend
  // - JWT token storage and automatic Authorization header inclusion
  // - Robust error handling with proper logout on auth failures
}

interface JwtPayload {
  user: string;
  tenant_id: string;
  exp: number;
  iat?: number;
  [key: string]: unknown;
}

// JWT decoding utility
const decodeJwtPayload = (token: string): JwtPayload | null => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[1]) {
      throw new Error('Invalid JWT format');
    }
    const decoded = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(decoded) as JwtPayload;

    // Validate required fields
    if (!payload.user || !payload.tenant_id || typeof payload.exp !== 'number') {
      throw new Error('Invalid JWT payload structure');
    }

    return payload;
  } catch (error) {
    console.error('Failed to decode JWT:', error);
    return null;
  }
};

const unwrapApiResult = <T,>(result: Result<ApiResponse<T>, AppError>): T => {
  if (result.isErr()) {
    throw new Error(result.error.message);
  }

  const apiResponse = result.value;

  if (!isApiSuccess(apiResponse)) {
    throw new Error(apiResponse.error.message);
  }

  return apiResponse.data;
};

// Helper to attempt token refresh and validate/construct user and tenant objects
const attemptTokenRefresh = async (storedUser: string, storedTenant: string, signal?: AbortSignal): Promise<{ user: User; tenant: Tenant; token: string } | null> => {
  try {
    if (signal?.aborted) {
      console.log('Token refresh cancelled');
      return null;
    }

  const refreshResult = await authService.refreshToken();
  const refreshedAuth = unwrapApiResult(refreshResult);
  const newToken = refreshedAuth.token;
    if (!newToken) {
      console.log('No token received from refresh');
      return null;
    }

    if (signal?.aborted) {
      console.log('Token refresh cancelled after API call');
      return null;
    }

    const newPayload = decodeJwtPayload(newToken);
    if (!newPayload || typeof newPayload !== 'object') {
      console.log('Failed to decode refreshed JWT token');
      return null;
    }

    if (!newPayload.user?.trim() || !newPayload.tenant_id?.trim()) {
      console.log('JWT payload validation failed: missing or invalid user/tenant_id in refreshed token');
      return null;
    }

    let refreshedUser: User | null = null;
    let refreshedTenant: Tenant | null = null;

    try {
      const parsedUser = JSON.parse(storedUser);
      if (parsedUser && typeof parsedUser === 'object' &&
          typeof parsedUser.id === 'string' && parsedUser.id.trim() !== '' &&
          typeof parsedUser.email === 'string' && parsedUser.email.trim() !== '' &&
          typeof parsedUser.username === 'string' && parsedUser.username.trim() !== '' &&
          Array.isArray(parsedUser.roles) && parsedUser.roles.every((role: any) => typeof role === 'string')) {
        refreshedUser = {
          ...parsedUser,
          id: asUserId(newPayload.user),
          username: newPayload.user,
          tenantId: asTenantId(newPayload.tenant_id),
        };
      }
    } catch (parseError) {
      console.log('Failed to parse stored user data:', parseError);
    }

    try {
      const parsedTenant = JSON.parse(storedTenant);
      if (parsedTenant && typeof parsedTenant === 'object' &&
          typeof parsedTenant.id === 'string' && parsedTenant.id.trim() !== '' &&
          typeof parsedTenant.name === 'string' && parsedTenant.name.trim() !== '' &&
          typeof parsedTenant.settings === 'object' && parsedTenant.settings !== null) {
        refreshedTenant = {
          ...parsedTenant,
          id: asTenantId(newPayload.tenant_id),
        };
      }
    } catch (parseError) {
      console.log('Failed to parse stored tenant data:', parseError);
    }

    if (refreshedUser && refreshedTenant) {
      return { user: refreshedUser, tenant: refreshedTenant, token: newToken };
    } else {
      console.log('Stored user/tenant data validation failed after token refresh');
      return null;
    }
  } catch (refreshError) {
    if (signal?.aborted) {
      console.log('Token refresh cancelled due to abort');
      return null;
    }
    console.log('Token refresh failed:', refreshError);
    return null;
  }
};

// Context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Provider props
interface AuthProviderProps {
  children: ReactNode;
}

// Provider component
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isMountedRef = React.useRef(true);

  // In a multi-tenant system, authentication requires both user and tenant
  const isAuthenticated = !!user && !!tenant;

  // Initialize auth state by validating stored token and data
  useEffect(() => {
    const abortController = new AbortController();

    const initAuth = async () => {
      try {
        const storedTokenData = localStorage.getItem('auth_token');
        const storedUser = localStorage.getItem('user');
        const storedTenant = localStorage.getItem('tenant');

        if (storedTokenData && storedUser && storedTenant) {
          // Parse token data and extract JWT token
          let token: string;
          try {
            const tokenObj = JSON.parse(storedTokenData);
            token = tokenObj?.token;
            if (!token || typeof token !== 'string') {
              throw new Error('Invalid token data structure');
            }
          } catch {
            // Fallback for legacy plain string format (for backward compatibility)
            token = storedTokenData;
          }

          // Decode and validate the JWT token
          const tokenPayload = decodeJwtPayload(token);
          if (!tokenPayload) {
            throw new Error('Invalid stored token');
          }

          // Check if token is expired
          const now = Math.floor(Date.now() / 1000);
          if (tokenPayload.exp && tokenPayload.exp < now) {
            const result = await attemptTokenRefresh(storedUser, storedTenant, abortController.signal);
            if (result && !abortController.signal.aborted) {
              if (!abortController.signal.aborted) {
                localStorage.setItem('auth_token', JSON.stringify({ token: result.token }));
                localStorage.setItem('user', JSON.stringify(result.user));
                localStorage.setItem('tenant', JSON.stringify(result.tenant));
              }
              if (isMountedRef.current && !abortController.signal.aborted) {
                setUser(result.user);
                setTenant(result.tenant);
              }
            } else {
              if (!abortController.signal.aborted) {
                localStorage.removeItem('auth_token');
                localStorage.removeItem('user');
                localStorage.removeItem('tenant');
              }
            }
            return;
          } else {
            // Validate stored user and tenant data structure
            const parsedUser = JSON.parse(storedUser) as User;
            const parsedTenant = JSON.parse(storedTenant) as Tenant;

            const isValidUser = parsedUser &&
              typeof parsedUser.id === 'string' &&
              parsedUser.id.trim() !== '' &&
              typeof parsedUser.email === 'string' &&
              parsedUser.email.trim() !== '' &&
              typeof parsedUser.username === 'string' &&
              parsedUser.username.trim() !== '' &&
              Array.isArray(parsedUser.roles) &&
              parsedUser.roles.every(role => typeof role === 'string');

            const isValidTenant = parsedTenant &&
              typeof parsedTenant.id === 'string' &&
              parsedTenant.id.trim() !== '' &&
              typeof parsedTenant.name === 'string' &&
              parsedTenant.name.trim() !== '' &&
              typeof parsedTenant.settings === 'object' &&
              parsedTenant.settings !== null;

            if (isValidUser && isValidTenant) {
              // Cross-reference with token payload if possible
              const tokenUsername = tokenPayload.user;
              const tokenTenantId = tokenPayload.tenant_id;

              if (parsedUser.username === tokenUsername && parsedTenant.id === tokenTenantId) {
                if (isMountedRef.current && !abortController.signal.aborted) {
                  setUser(parsedUser);
                  setTenant(parsedTenant);
                }
              } else {
                console.warn('Token payload mismatch with stored data, clearing authentication');
                if (!abortController.signal.aborted) {
                  localStorage.removeItem('auth_token');
                  localStorage.removeItem('user');
                  localStorage.removeItem('tenant');
                }
              }
            } else {
              // Invalid data structure, clear stored data
              console.warn('Invalid stored user/tenant data structure');
              if (!abortController.signal.aborted) {
                localStorage.removeItem('auth_token');
                localStorage.removeItem('user');
                localStorage.removeItem('tenant');
              }
            }
          }
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          // Authentication initialization failed - clear all auth data
          localStorage.removeItem('auth_token');
          localStorage.removeItem('user');
          localStorage.removeItem('tenant');
          console.error('Authentication initialization failed:', error);
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

  const login = async (credentials: LoginCredentials): Promise<void> => {
    setIsLoading(true);
    try {
      // Use "tenant1" for demo purposes, as hardcoded in backend when tenant is missing
      const tenantId = credentials.tenantId ?? asTenantId('tenant1');
      const modifiedCredentials: LoginCredentials = { ...credentials, tenantId };
      const loginResult = await authService.login(modifiedCredentials);
      const authPayload = unwrapApiResult(loginResult);

      // Extract JWT token from response
      const token = authPayload.token;
      if (!token) {
        throw new Error('No token received from server');
      }

      // Store JWT token in localStorage as JSON object
      localStorage.setItem('auth_token', JSON.stringify({ token }));

      // Decode JWT to extract user and tenant information
      const tokenPayload = decodeJwtPayload(token);
      if (!tokenPayload) {
        throw new Error('Invalid token format');
      }

      // Validate token payload fields
      if (!tokenPayload.user || !tokenPayload.tenant_id) {
        throw new Error('Required fields missing in token');
      }

      const userId = asUserId(tokenPayload.user);
      const tenantIdentifier = asTenantId(tokenPayload.tenant_id);

      // Create user object from token payload (remove synthetic fallbacks)
      const now = new Date().toISOString();
      const user: User = {
        id: userId,
        email: credentials.usernameOrEmail,
        username: tokenPayload.user,
        firstName: tokenPayload.user.charAt(0).toUpperCase() + tokenPayload.user.slice(1),
        lastName: 'User',
        roles: ['user'], // Default role
        tenantId: tenantIdentifier,
        createdAt: now,
        updatedAt: now,
      };

      // Create tenant object
      if (!tokenPayload.tenant_id) {
        throw new Error('Tenant ID missing in token');
      }
      const tenant: Tenant = {
        id: tenantIdentifier,
        name: `Tenant ${tokenPayload.tenant_id}`,
        domain: `${tokenPayload.tenant_id}.demo.com`,
        settings: {
          theme: 'natural',
          language: 'en',
          timezone: 'UTC',
          dateFormat: 'MM/DD/YYYY',
          features: ['dashboard', 'address-book'],
          branding: {
            primaryColor: '#2d9d5a',
            secondaryColor: '#e29e26',
            accentColor: '#22c55e',
          },
        },
        subscription: {
          plan: 'basic',
          status: 'active',
          limits: {
            users: 10,
            contacts: 500,
            storage: 1024,
          },
        },
      };

      // Set state
      setUser(user);
      setTenant(tenant);

      // Persist user and tenant info to localStorage
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('tenant', JSON.stringify(tenant));

    } catch (error: any) {
      // Clear any partial data
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
      localStorage.removeItem('tenant');

      console.error('Login request failed:', error);

      // Re-throw with the actual error message from the server
      throw new Error(error?.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      const logoutResult = await authService.logout();

      if (logoutResult.isErr()) {
        console.error('Server-side logout failed, clearing local data anyway:', logoutResult.error);
      } else if (!isApiSuccess(logoutResult.value)) {
        console.error('Server-side logout returned error response, clearing local data anyway:', logoutResult.value.error);
      } else {
        console.log('Server-side logout successful');
      }
    } catch (error) {
      console.error('Server-side logout failed, clearing local data anyway:', error);
    } finally {
      // Always clear local data regardless of API call success
      setUser(null);
      setTenant(null);
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
      localStorage.removeItem('tenant');
    }
  };

  const refreshToken = async (): Promise<void> => {
    try {
      const refreshResult = await authService.refreshToken();

      if (refreshResult.isErr()) {
        const error = refreshResult.error;

        if (error.statusCode === 401 || error.statusCode === 403) {
          console.log('Authentication failed during refresh, logging out');
          await logout();
          throw new Error('Authentication expired');
        }

        console.log('Token refresh failed due to transient error:', error);
        throw new Error('Token refresh failed - please check your connection');
      }

      const refreshResponse = refreshResult.value;

      if (!isApiSuccess(refreshResponse)) {
        const error = refreshResponse.error;

        if (error.statusCode === 401 || error.statusCode === 403) {
          console.log('Authentication failed during refresh, logging out');
          await logout();
          throw new Error('Authentication expired');
        }

        console.log('Token refresh failed due to API error:', error);
        throw new Error(error.message || 'Token refresh failed');
      }

      const newToken = refreshResponse.data.token;
      if (!newToken) {
        throw new Error('No token received from server during refresh');
      }

      localStorage.setItem('auth_token', JSON.stringify({ token: newToken }));
      console.log('Token refresh successful');
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Authentication expired') {
          throw error;
        }

        console.log('Token refresh failed:', error);
        throw error;
      }

      console.log('Token refresh failed due to unknown error:', error);
      throw new Error('Token refresh failed');
    }
  };

  const value: AuthContextType = {
    user,
    tenant,
    isAuthenticated,
    isLoading,
    login,
    logout,
    refreshToken,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// Hook to use auth context
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
