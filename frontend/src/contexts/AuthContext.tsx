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
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<void>;
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
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize auth state from localStorage
  useEffect(() => {
    const initAuth = () => {
      try {
        const storedUser = localStorage.getItem('user');
        const storedTenant = localStorage.getItem('tenant');
        const storedToken = localStorage.getItem('token');

        if (storedUser && storedTenant && storedToken) {
          const parsedUser = JSON.parse(storedUser) as User;
          const parsedTenant = JSON.parse(storedTenant) as Tenant;
          const parsedToken = storedToken as string;

          // Validate shape
          if (parsedUser.id && parsedUser.email && parsedTenant.id && parsedTenant.name && parsedToken) {
            setUser(parsedUser);
            setTenant(parsedTenant);
            setToken(parsedToken);
          }
        }
      } catch (error) {
        // Invalid data, remove corrupt keys
        localStorage.removeItem('user');
        localStorage.removeItem('tenant');
        localStorage.removeItem('token');
        console.error('Error initializing auth state:', error);
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
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API delay

      // Mock successful login
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

      const mockToken = `demo_token_${Date.now()}`;

      // Store in state
      setUser(mockUser);
      setTenant(mockTenant);
      setToken(mockToken);

      // Persist to localStorage
      localStorage.setItem('user', JSON.stringify(mockUser));
      localStorage.setItem('tenant', JSON.stringify(mockTenant));
      localStorage.setItem('token', mockToken);

      // Login successful
    } catch (error) {
      throw new Error('Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = (): void => {
    setUser(null);
    setTenant(null);
    setToken(null);
    localStorage.removeItem('user');
    localStorage.removeItem('tenant');
    localStorage.removeItem('token');
  };

  const refreshToken = async (): Promise<void> => {
    try {
      // TODO: Implement token refresh
      console.log('Token refresh attempt');
    } catch (error) {
      logout();
      throw new Error('Token refresh failed');
    }
  };

  const value: AuthContextType = {
    user,
    tenant,
    token,
    isAuthenticated: !!token && !!user,
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
