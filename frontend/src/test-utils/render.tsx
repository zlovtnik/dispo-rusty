/**
 * Test Utilities - Custom Render with Providers
 *
 * This file provides utilities for rendering React components
 * in tests with all necessary providers (Router, AuthContext, Ant Design).
 */

import React, { type ReactElement } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, useLocation } from 'react-router-dom';
import { App as AntApp } from 'antd';
import type { User, LoginCredentials, Tenant } from '../types/auth';
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
  domain: 'test.example.com',
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
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
}

/**
 * Mock AuthContext value - define functions separately to ensure stability
 */

/**
 * Fallback mock for login function. Returns a resolved promise and can be overridden
 * by test-specific mocks.
 */
const mockLogin = async () => {
  return Promise.resolve();
};

/**
 * Fallback mock for logout function. Returns a resolved promise and can be overridden
 * by test-specific mocks.
 */
const mockLogout = async () => {
  return Promise.resolve();
};

/**
 * Fallback mock for refreshToken function. Returns a resolved promise and can be overridden
 * by test-specific mocks.
 */
const mockRefreshToken = async () => {
  return Promise.resolve();
};

export const mockAuthContextValue: MockAuthContextValue = {
  isAuthenticated: true,
  user: mockUser,
  tenant: mockTenant,
  isLoading: false,
  login: mockLogin,
  logout: mockLogout,
  refreshToken: mockRefreshToken,
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
  value?: Partial<MockAuthContextValue> | (() => Partial<MockAuthContextValue>);
}> = ({ children, value }) => {
  // Merge default mock values with provided overrides
  const resolvedValue = typeof value === 'function' ? value() : value;
  const mergedValue = { ...mockAuthContextValue, ...resolvedValue };

  return <AuthContext.Provider value={mergedValue}>{children}</AuthContext.Provider>;
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

  // Create a direct functional Wrapper component
  const Wrapper = ({ children }: { children: React.ReactNode }) => {
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
 * @returns Render result with enhanced rerender function
 */
export function renderWithAuth(ui: ReactElement, options?: CustomRenderOptions) {
  const renderResult = renderWithProviders(ui, {
    ...options,
    authValue: {
      isAuthenticated: true,
      user: mockUser,
      tenant: mockTenant,
      ...options?.authValue,
    },
  });

  // Enhanced rerender function that supports updating auth values
  const rerenderWithAuth = (newUi: ReactElement, newOptions?: CustomRenderOptions) => {
    const mergedOptions = {
      ...options,
      ...newOptions,
      authValue: {
        isAuthenticated: true,
        user: mockUser,
        tenant: mockTenant,
        ...options?.authValue,
        ...newOptions?.authValue,
      },
    };

    // Create a new AuthProvider wrapper that only updates the auth context
    const AuthWrapper = ({ children }: { children: React.ReactNode }) => {
      return <MockAuthProvider value={mergedOptions.authValue}>{children}</MockAuthProvider>;
    };

    // Use the existing renderResult.rerender to update the same tree
    // Only wrap with the new AuthProvider, not a new Router
    renderResult.rerender(<AuthWrapper>{newUi}</AuthWrapper>);

    return renderResult;
  };

  return {
    ...renderResult,
    rerenderWithAuth,
  };
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
 * Render with authenticated user and navigation tracking
 * Returns the current location for testing redirects
 *
 * @param ui - React component to render
 * @param options - Render options
 * @returns Render result with location tracking
 */
export function renderWithAuthAndNavigation(ui: ReactElement, options?: CustomRenderOptions) {
  let capturedLocation: { pathname: string } = { pathname: options?.initialRoute ?? '/' };

  // Memoize the location change handler to prevent dependency issues in LocationTracker
  const handleLocationChange = React.useCallback((location: { pathname: string }) => {
    capturedLocation = location;
  }, []);

  const LocationTracker: React.FC<{
    children: React.ReactNode;
  }> = ({ children }) => {
    const location = useLocation();
    React.useEffect(() => {
      handleLocationChange(location);
    }, [location, handleLocationChange]);
    return <>{children}</>;
  };

  const renderResult = renderWithProviders(
    <LocationTracker>{ui}</LocationTracker>,
    {
      ...options,
      authValue: {
        isAuthenticated: true,
        user: mockUser,
        tenant: mockTenant,
        ...options?.authValue,
      },
    }
  );

  return {
    ...renderResult,
    getCurrentLocation: () => capturedLocation,
  };
}

/**
 * Render for integration tests without mock auth provider
 * Allows the App's AuthProvider to work normally with mocked API calls
 *
 * @param ui - React component to render
 * @param options - Render options
 * @returns Render result
 */
export function renderForIntegration(
  ui: ReactElement,
  {
    initialRoute = '/',
    initialRoutes = [initialRoute],
    useBrowserRouter = false,
    withAntApp = true,
    ...renderOptions
  }: Omit<CustomRenderOptions, 'authValue'> = {}
) {
  // Choose router type
  const RouterComponent = useBrowserRouter ? BrowserRouter : MemoryRouter;
  const routerProps = useBrowserRouter ? {} : { initialEntries: initialRoutes, initialIndex: 0 };

  // Create wrapper component without MockAuthProvider
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    let content = <RouterComponent {...routerProps}>{children}</RouterComponent>;

    // Optionally wrap with Ant Design App component for message, modal, notification
    if (withAntApp) {
      content = <AntApp>{content}</AntApp>;
    }

    return content;
  };

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}

/**
 * Wait for async operations to complete
 * Useful for testing loading states
 *
 * @param ms - Milliseconds to wait
 * @returns Promise that resolves after the specified time
 */
export const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

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
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
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
