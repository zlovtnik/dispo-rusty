import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { authService } from '../services/api';
import type { AuthResponse } from '../services/api';

// Types
export interface User {
  id: string;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  roles: string[];
}

export interface TenantSettings {
  theme: string;
  features: string[];
  [key: string]: unknown;
}

export interface Tenant {
  id: string;
  name: string;
  domain?: string;
  settings: TenantSettings;
}

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

export interface LoginCredentials {
  usernameOrEmail: string;
  password: string;
  tenantId: string;
  rememberMe?: boolean;
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
    const initAuth = async () => {
      try {
        const storedToken = localStorage.getItem('auth_token');
        const storedUser = localStorage.getItem('user');
        const storedTenant = localStorage.getItem('tenant');

        if (storedToken && storedUser && storedTenant) {
          // Decode and validate the JWT token
          const tokenPayload = decodeJwtPayload(storedToken);
          if (!tokenPayload) {
            throw new Error('Invalid stored token');
          }

          // Check if token is expired
          const now = Math.floor(Date.now() / 1000);
          if (tokenPayload.exp && tokenPayload.exp < now) {
            console.log('Stored token expired, attempting refresh');
            try {
              // Attempt to refresh the token
              const response = await authService.refreshToken();
              const newToken = response.token;
              if (newToken) {
                localStorage.setItem('auth_token', newToken);

                // Decode the new token to get fresh user/tenant info
                const newPayload = decodeJwtPayload(newToken);
                if (newPayload && typeof newPayload === 'object') {
                  // Since newPayload is already validated in decodeJwtPayload, we can trust it has the required fields
                  // but double-check for runtime safety
                  if (!newPayload.user?.trim() || !newPayload.tenant_id?.trim()) {
                    console.log('JWT payload validation failed: missing or invalid user/tenant_id in refreshed token');
                    localStorage.removeItem('auth_token');
                    localStorage.removeItem('user');
                    localStorage.removeItem('tenant');
                    return;
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
                      refreshedUser = parsedUser;
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
                      refreshedTenant = parsedTenant;
                    }
                  } catch (parseError) {
                    console.log('Failed to parse stored tenant data:', parseError);
                  }

                  // Only update if all validations passed
                  if (refreshedUser && refreshedTenant) {
                    // Update stored data if needed (in case username or tenant changed)
                    refreshedUser.username = newPayload.user;
                    refreshedTenant.id = newPayload.tenant_id;

                    localStorage.setItem('user', JSON.stringify(refreshedUser));
                    localStorage.setItem('tenant', JSON.stringify(refreshedTenant));

                    if (isMountedRef.current) {
                      setUser(refreshedUser);
                      setTenant(refreshedTenant);
                    }
                  } else {
                    console.log('Stored user/tenant data validation failed after token refresh');
                    localStorage.removeItem('auth_token');
                    localStorage.removeItem('user');
                    localStorage.removeItem('tenant');
                  }
                } else {
                  console.log('Failed to decode refreshed JWT token');
                  localStorage.removeItem('auth_token');
                  localStorage.removeItem('user');
                  localStorage.removeItem('tenant');
                }
              }
            } catch (refreshError) {
              console.log('Token refresh failed during init, clearing authentication');
              localStorage.removeItem('auth_token');
              localStorage.removeItem('user');
              localStorage.removeItem('tenant');
            }
            return;
          }
        }

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
              if (isMountedRef.current) {
                setUser(parsedUser);
                setTenant(parsedTenant);
              }
            } else {
              console.warn('Token payload mismatch with stored data, clearing authentication');
              localStorage.removeItem('auth_token');
              localStorage.removeItem('user');
              localStorage.removeItem('tenant');
            }
          } else {
            // Invalid data structure, clear stored data
            console.warn('Invalid stored user/tenant data structure');
            localStorage.removeItem('auth_token');
            localStorage.removeItem('user');
            localStorage.removeItem('tenant');
          }
        }
      } catch (error) {
        // Authentication initialization failed - clear all auth data
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
        localStorage.removeItem('tenant');
        console.error('Authentication initialization failed:', error);
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    initAuth();

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const login = async (credentials: LoginCredentials): Promise<void> => {
    setIsLoading(true);
    try {
      // Call actual login API endpoint
      const response: AuthResponse = await authService.login(credentials);

      // Extract JWT token from response
      const token = response.token;
      if (!token) {
        throw new Error('No token received from server');
      }

      // Store JWT token in localStorage
      localStorage.setItem('auth_token', token);

      // Decode JWT to extract user and tenant information
      const tokenPayload = decodeJwtPayload(token);
      if (!tokenPayload) {
        throw new Error('Invalid token format');
      }

      // Create user object from token payload
      const user: User = {
        id: tokenPayload.user || `user_${Date.now()}`,
        email: credentials.usernameOrEmail.includes('@') ? credentials.usernameOrEmail : `${tokenPayload.user}@demo.com`,
        username: tokenPayload.user || credentials.usernameOrEmail.split('@')[0] || 'user',
        firstName: tokenPayload.user ? tokenPayload.user.charAt(0).toUpperCase() + tokenPayload.user.slice(1) : 'Demo',
        lastName: 'User',
        roles: ['user'], // Default role, could be extracted from token if available
      };

      // Create tenant object
      const tenant: Tenant = {
        id: credentials.tenantId || tokenPayload.tenant_id,
        name: `Tenant ${credentials.tenantId || tokenPayload.tenant_id}`,
        domain: `${credentials.tenantId || tokenPayload.tenant_id}.demo.com`,
        settings: {
          theme: 'default',
          features: ['dashboard', 'address-book'],
        } as TenantSettings,
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

      // Re-throw with a user-friendly message
      if (error?.statusCode === 401) {
        throw new Error('Invalid username or password');
      } else if (error?.statusCode === 400) {
        throw new Error('Tenant not found or invalid request');
      } else {
        throw new Error(error?.message || 'Login failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      // Call logout endpoint to clear server-side session
      await authService.logout();
      console.log('Server-side logout successful');
    } catch (error) {
      // Even if the API call fails, we should clear local data
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
      // Call backend refresh endpoint to validate and refresh the session
      const response: AuthResponse = await authService.refreshToken();

      // Extract new JWT token from response
      const newToken = response.token;
      if (!newToken) {
        throw new Error('No token received from server during refresh');
      }

      // Store the new JWT token in localStorage
      localStorage.setItem('auth_token', newToken);

      console.log('Token refresh successful');
    } catch (error: any) {
      // Only logout on authentication failures (401/403), not on network/timeout errors
      if (error?.statusCode === 401 || error?.statusCode === 403) {
        console.log('Authentication failed during refresh, logging out');
        await logout(); // Call logout to clear everything
        throw new Error('Authentication expired');
      } else {
        // For network errors, timeouts, or other transient failures, don't logout
        console.log('Token refresh failed due to transient error:', error);
        throw new Error('Token refresh failed - please check your connection');
      }
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
