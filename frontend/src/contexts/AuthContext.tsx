import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

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
  logout: () => void;
  refreshToken: () => Promise<void>;
  // Token refresh implemented with robust error handling:
  // - Only logs out on 401/403 (auth failures), not network errors
  // - Built-in retry logic for transient failures
  // - TODO: Plan migration to httpOnly cookies - implement /me endpoint to remove client-side token storage
  // Currently using demo/mock implementation. In production, token should be managed server-side with httpOnly cookies.
}

export interface LoginCredentials {
  usernameOrEmail: string;
  password: string;
  tenantId: string;
  rememberMe?: boolean;
}

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

  // In a multi-tenant system, authentication requires both user and tenant
  const isAuthenticated = !!user && !!tenant;

  // Initialize auth state by simulating /me endpoint call
  // TODO: Replace with actual API call to /me endpoint once backend supports httpOnly cookies
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Simulate /me endpoint call - browser will automatically send httpOnly cookie
        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate API delay

        // For demo purposes, check if there's valid stored user/tenant from previous sessions
        // In production, this would be replaced by calling /me endpoint
        const storedUser = localStorage.getItem('user');
        const storedTenant = localStorage.getItem('tenant');

        if (storedUser && storedTenant) {
          const parsedUser = JSON.parse(storedUser) as User;
          const parsedTenant = JSON.parse(storedTenant) as Tenant;

          // Strengthen shape validation
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
            setUser(parsedUser);
            setTenant(parsedTenant);
            // Note: No token stored client-side - authentication verified via httpOnly cookie
            // isAuthenticated is now computed from user && tenant
          } else {
            // Invalid data structure, clear stored data
            localStorage.removeItem('user');
            localStorage.removeItem('tenant');
          }
        }
      } catch (error) {
        // Authentication failed or /me endpoint call failed - user not authenticated
        localStorage.removeItem('user');
        localStorage.removeItem('tenant');
        console.error('Authentication check failed:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = async (credentials: LoginCredentials): Promise<void> => {
    setIsLoading(true);
    try {
      // Demo implementation - accept any credentials
      // TODO: Replace with actual login API call that sets httpOnly cookie server-side
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API delay

      // Mock successful login - in production, backend would set httpOnly cookie
      const mockUser: User = {
        id: 'user_' + Date.now(),
        email: credentials.usernameOrEmail,
        username: credentials.usernameOrEmail.split('@')[0] || 'demo',
        firstName: credentials.usernameOrEmail.split('.')[0] || 'Demo',
        lastName: 'User',
        roles: ['user'],
      };

      const mockTenant: Tenant = {
        id: credentials.tenantId,
        name: `Tenant ${credentials.tenantId}`,
        domain: `${credentials.tenantId}.demo.com`,
        settings: {
          theme: 'default',
          features: ['dashboard', 'address-book'],
        } as TenantSettings,
      };

      // Store user and tenant info (token stored server-side in httpOnly cookie)
      setUser(mockUser);
      setTenant(mockTenant);
      // isAuthenticated will be computed as !!user && !!tenant

      // Persist only user/tenant info to localStorage, no sensitive tokens
      localStorage.setItem('user', JSON.stringify(mockUser));
      localStorage.setItem('tenant', JSON.stringify(mockTenant));
      // Note: Token not stored client-side - managed server-side with httpOnly cookie

    } catch (error) {
      throw new Error('Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = (): void => {
    // TODO: Call logout endpoint to clear server-side session/httpOnly cookie
    setUser(null);
    setTenant(null);
    // isAuthenticated will be computed as false when both are null
    // Clear stored user/tenant data
    localStorage.removeItem('user');
    localStorage.removeItem('tenant');
    // Token is cleared server-side via logout endpoint
  };

  const refreshToken = async (): Promise<void> => {
    try {
      // Call backend refresh endpoint to validate and refresh the session
      await import('../services/api').then(({ authService }) => authService.refreshToken());
      console.log('Token refresh successful');
    } catch (error: any) {
      // Only logout on authentication failures (401/403), not on network/timeout errors
      if (error?.statusCode === 401 || error?.statusCode === 403) {
        console.log('Authentication failed, logging out');
        logout();
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
