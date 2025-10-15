/**
 * Test Utilities - Custom Render with Providers
 *
 * This file provides utilities for rendering React components
 * in tests with all necessary providers (Router, AuthContext, Ant Design).
 */

import React, { type ReactElement } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { App as AntApp } from 'antd';
import type { User, Tenant } from '../types/auth';
import { asTenantId, asUserId } from '../types/ids';
import { AuthContext, type AuthContextType } from '../contexts/AuthContext';

/**
 * Mock user data for testing
 */
export const mockUser: User = {
  id: asUserId('user-1'),
  username: 'testuser',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  roles: ['user'],
  tenantId: asTenantId('tenant-1'),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

/**
 * Mock tenant data for testing
 */
export const mockTenant: Tenant = {
  id: asTenantId('tenant-1'),
  name: 'Test Tenant',
  settings: {
    theme: 'light' as const,
    language: 'en',
    timezone: 'UTC',
    dateFormat: 'YYYY-MM-DD',
    features: ['contacts', 'dashboard'],
    branding: {
      primaryColor: '#1890ff',
      secondaryColor: '#52c41a',
      accentColor: '#faad14',
    },
  },
  subscription: {
    plan: 'professional' as const,
    status: 'active' as const,
    limits: {
      users: 25,
      contacts: 10000,
      storage: 10737418240, // 10GB
    },
  },
};

/**
 * Mock AuthContext value
 */
export interface MockAuthContextValue {
  isAuthenticated: boolean;
  user: User | null;
  tenant: Tenant | null;
  loading: boolean;
  login: (credentials: unknown) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
}

export const mockAuthContextValue: MockAuthContextValue = {
  isAuthenticated: true,
  user: mockUser,
  tenant: mockTenant,
  loading: false,
  login: async () => {},
  logout: async () => {},
  refreshToken: async () => {},
};

/**
 * Options for custom render function
 */
export interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  /**
   * Initial route for MemoryRouter
   */
  initialRoute?: string;

  /**
   * Initial routes history for MemoryRouter
   */
  initialRoutes?: string[];

  /**
   * Use BrowserRouter instead of MemoryRouter (default: false)
   */
  useBrowserRouter?: boolean;

  /**
   * Custom auth context value
   */
  authValue?: Partial<MockAuthContextValue>;

  /**
   * Whether to wrap with Ant Design App component (default: true)
   */
  withAntApp?: boolean;
}

/**
 * Mock AuthContext Provider for testing
 */
const MockAuthProvider: React.FC<{
  children: React.ReactNode;
  value?: Partial<MockAuthContextValue>;
}> = ({ children, value }) => {
  // Merge default mock values with provided overrides
  const mergedValue = { ...mockAuthContextValue, ...value };

  // Map MockAuthContextValue to AuthContextType
  const contextValue: AuthContextType = {
    user: mergedValue.user,
    tenant: mergedValue.tenant,
    isAuthenticated: mergedValue.isAuthenticated,
    isLoading: mergedValue.loading,
    login: mergedValue.login,
    logout: mergedValue.logout,
    refreshToken: mergedValue.refreshToken,
  };

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};

// Export for testing
export { MockAuthProvider };

/**
 * Custom render function with all providers
 *
 * @param ui - React component to render
 * @param options - Render options including router and auth configuration
 * @returns Render result with all utilities from @testing-library/react
 *
 * @example
 * ```typescript
 * const { getByText } = renderWithProviders(<MyComponent />, {
 *   initialRoute: '/contacts',
 *   authValue: { isAuthenticated: false }
 * });
 * ```
 */
export function renderWithProviders(
  ui: ReactElement,
  {
    initialRoute = '/',
    initialRoutes = [initialRoute],
    useBrowserRouter = false,
    authValue,
    withAntApp = true,
    ...renderOptions
  }: CustomRenderOptions = {}
) {
  // Choose router type
  const RouterComponent = useBrowserRouter ? BrowserRouter : MemoryRouter;
  const routerProps = useBrowserRouter ? {} : { initialEntries: initialRoutes, initialIndex: 0 };

  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    let content = (
      <RouterComponent {...routerProps}>
        <MockAuthProvider value={authValue}>{children}</MockAuthProvider>
      </RouterComponent>
    );

    // Optionally wrap with Ant Design App component for message, modal, notification
    if (withAntApp) {
      content = <AntApp>{content}</AntApp>;
    }

    return content;
  };

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}

/**
 * Render with authenticated user
 *
 * @param ui - React component to render
 * @param options - Render options
 * @returns Render result
 */
export function renderWithAuth(ui: ReactElement, options?: CustomRenderOptions) {
  return renderWithProviders(ui, {
    ...options,
    authValue: {
      isAuthenticated: true,
      user: mockUser,
      tenant: mockTenant,
      ...options?.authValue,
    },
  });
}

/**
 * Render with unauthenticated user
 *
 * @param ui - React component to render
 * @param options - Render options
 * @returns Render result
 */
export function renderWithoutAuth(ui: ReactElement, options?: CustomRenderOptions) {
  return renderWithProviders(ui, {
    ...options,
    authValue: {
      isAuthenticated: false,
      user: null,
      tenant: null,
      ...options?.authValue,
    },
  });
}

/**
 * Wait for async operations to complete
 * Useful for testing loading states
 *
 * @param ms - Milliseconds to wait
 * @returns Promise that resolves after the specified time
 */
export const waitFor = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

/**
 * Create a deferred promise for testing async behavior
 *
 * @returns Object with promise and resolve/reject functions
 *
 * @example
 * ```typescript
 * const deferred = createDeferred<string>();
 *
 * // In test
 * mockApi.login.mockReturnValue(deferred.promise);
 *
 * // Later, resolve or reject
 * deferred.resolve('success');
 * // or
 * deferred.reject(new Error('failed'));
 * ```
 */
export function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

// Re-export everything from @testing-library/react
export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
