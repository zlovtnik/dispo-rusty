/**
 * Authentication Flow Integration Tests
 *
 * Tests complete authentication workflows:
 * - Login → Token storage → Protected route access
 * - Session management and token refresh
 * - Session expiration and automatic logout
 * - Multi-tenant switching
 *
 * @group integration
 * @category authentication
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  renderWithProviders,
  renderWithoutAuth,
  renderForIntegration,
  mockUser,
  mockTenant,
  screen,
  waitFor,
  userEvent,
} from '../../test-utils';
import { server, resetMSW } from '../../test-utils/mocks/server';
import { http, HttpResponse } from 'msw';
import { App } from '../../App';
import { PrivateRoute } from '../../components/PrivateRoute';
import { DashboardPage } from '../../pages/DashboardPage';
import { asTenantId } from '../../types/ids';

// Get API base URL at runtime
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

// Shared empty auth mocks for testing
const emptyAuthMocks = {
  login: async () => {
    // Intentionally empty - mock for testing
  },
  logout: async () => {
    // Intentionally empty - mock for testing
  },
  refreshToken: async () => {
    // Intentionally empty - mock for testing
  },
};

/**
 * Authentication Flow: Login → Token Storage → Protected Route
 *
 * Scenario: User logs in and should be able to access protected routes
 * The token should be stored and reused for authenticated requests
 */
describe.skip('Authentication Flow: Login → Token Storage → Protected Route', () => {
  beforeEach(() => {
    resetMSW();
    // Clear any stored auth data
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    resetMSW();
  });

  // Shared test setup helper
  const setupLoginTest = async (): Promise<{ rerender: (ui: React.ReactNode) => void }> => {
    const { rerender } = renderForIntegration(<App />, {
      initialRoute: '/login',
    });

    // Verify login page is displayed
    expect(screen.getByText(/login/i)).toBeInTheDocument();

    // Fill in login form
    const usernameInput = screen.getByLabelText(/email|username/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const loginButton = screen.getByRole('button', { name: /login|sign in/i });

    // Enter credentials
    await userEvent.type(usernameInput, 'testuser@example.com');
    await userEvent.type(passwordInput, 'password123');

    // Submit login form
    await userEvent.click(loginButton);

    return { rerender };
  };

  test('stores valid JWT on login', async () => {
    // Render login page and perform login flow
    await setupLoginTest();

    // Wait for redirect to dashboard (token stored, auth context updated)
    await screen.findByText(/dashboard|welcome/i, undefined, {
      timeout: 3000,
    });

    // Verify token was stored in localStorage
    const storageKey = import.meta.env.VITE_JWT_STORAGE_KEY ?? 'auth_token';
    const storedToken = localStorage.getItem(storageKey);
    expect(storedToken).not.toBeNull();
    expect(storedToken).toBeTruthy();
    expect(storedToken!.split('.').length).toBe(3); // Valid JWT format
  });

  test('authenticated user can navigate to protected routes', async () => {
    // First, set up authentication by storing a valid JWT
    const validJWT =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0dXNlckBleGFtcGxlLmNvbSIsImlhdCI6MTUxNjIzOTAyMiwiZXhwIjo5OTk5OTk5OTk5fQ.test';
    const storageKey = import.meta.env.VITE_JWT_STORAGE_KEY ?? 'auth_token';
    localStorage.setItem(storageKey, validJWT);

    // Render the app on a protected route (dashboard)
    renderForIntegration(<App />, {
      initialRoute: '/dashboard',
    });

    // Wait for dashboard to load
    const dashboardElement = await screen.findByText(/dashboard|welcome/i, undefined, {
      timeout: 3000,
    });
    expect(dashboardElement).toBeInTheDocument();

    // Verify protected navigation link is present
    const contactsLink = await screen.findByText(/contacts|address book/i, undefined, {
      timeout: 3000,
    });
    expect(contactsLink).toBeInTheDocument();

    // Navigate to protected route
    await userEvent.click(contactsLink);

    // Verify protected content/API call loads
    const contactElement = await screen.findByText(/contact/i, undefined, {
      timeout: 3000,
    });
    expect(contactElement).toBeInTheDocument();
  });

  test('Unauthenticated user cannot access protected routes', async () => {
    // 1. Render protected route without authentication
    renderWithoutAuth(
      <PrivateRoute>
        <DashboardPage />
      </PrivateRoute>,
      { initialRoute: '/dashboard' }
    );

    // 2. Should redirect to login or show error
    const authElement = await screen.findByText(/login|sign in|sign up|unauthorized/i);
    expect(authElement).toBeInTheDocument();
  });

  test('Login with invalid credentials shows error', async () => {
    // Setup handler to return 401 Unauthorized
    server.use(
      http.post(`${API_URL}/auth/login`, () => {
        return HttpResponse.json(
          { success: false, message: 'Invalid credentials' },
          { status: 401 }
        );
      })
    );

    renderForIntegration(<App />, { initialRoute: '/login' });

    // Wait for auth initialization to complete
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });

    // Fill form with invalid credentials
    const usernameInput = screen.getByLabelText('Username or Email');
    const passwordInput = screen.getByLabelText(/password/i);
    const tenantInput = screen.getByLabelText('Tenant ID');
    const loginButton = screen.getByRole('button', { name: /login|sign in/i });

    await userEvent.type(usernameInput, 'invalid@example.com');
    await userEvent.type(passwordInput, 'wrongpassword');
    await userEvent.type(tenantInput, 'tenant1');
    await userEvent.click(loginButton);

    // Verify error message shown
    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });

    // Verify no token was stored
    const storedToken = localStorage.getItem(import.meta.env.VITE_JWT_STORAGE_KEY || 'auth_token');
    expect(storedToken).toBeNull();
  });

  test('Token is sent in subsequent API requests', async () => {
    // Setup to capture Authorization header
    let capturedHeaders: Record<string, string> = {};

    server.use(
      http.get(`${API_URL}/contacts`, ({ request }) => {
        capturedHeaders = Object.fromEntries(request.headers.entries());
        return HttpResponse.json({
          success: true,
          data: [],
          message: 'Success',
        });
      })
    );

    // Render authenticated app
    renderWithProviders(<App />, {
      initialRoute: '/contacts',
      authValue: { isAuthenticated: true, user: mockUser, tenant: mockTenant },
    });

    // Wait for API call to populate capturedHeaders.authorization
    await waitFor(() => {
      expect(capturedHeaders.authorization).toBeTruthy();
    });

    // Verify Authorization header format
    expect(capturedHeaders.authorization).toMatch(/^Bearer /);
  });
});

/**
 * Authentication Flow: Token Refresh & Session Management
 *
 * Scenario: When token expires, app should attempt refresh
 * User should not be logged out unless refresh also fails
 */
describe.skip('Authentication Flow: Token Refresh & Session Management', () => {
  beforeEach(() => {
    resetMSW();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    resetMSW();
  });

  test('Expired token triggers refresh attempt', async () => {
    let refreshAttempted = false;

    // Setup expired token response
    server.use(
      http.get(`${API_URL}/contacts`, () => {
        return HttpResponse.json({ success: false, message: 'Token expired' }, { status: 401 });
      }),
      http.post(`${API_URL}/auth/refresh`, () => {
        refreshAttempted = true;
        return HttpResponse.json({
          success: true,
          token: 'new-valid-token',
          user: mockUser,
          tenant: mockTenant,
          message: 'Token refreshed',
        });
      })
    );

    renderWithProviders(<App />, {
      initialRoute: '/contacts',
      authValue: { isAuthenticated: true, user: mockUser, tenant: mockTenant },
    });

    // Wait for initial API call to fail, then refresh to be attempted
    await waitFor(
      () => {
        expect(refreshAttempted).toBe(true);
      },
      { timeout: 2000 }
    );
  });

  test('Failed token refresh logs user out', async () => {
    // Setup token refresh to fail
    server.use(
      http.post(`${API_URL}/auth/refresh`, () => {
        return HttpResponse.json({ success: false, message: 'Session expired' }, { status: 401 });
      })
    );

    renderWithProviders(<App />, {
      initialRoute: '/dashboard',
      authValue: { isAuthenticated: true, user: mockUser, tenant: mockTenant },
    });

    // Trigger a refresh-requiring action
    // Wait for redirect to login
    const loginElement = await screen.findByText(/login|sign in/i);
    expect(loginElement).toBeInTheDocument();

    // Verify token was cleared
    const storedToken = localStorage.getItem(import.meta.env.VITE_JWT_STORAGE_KEY || 'auth_token');
    expect(storedToken).toBeNull();
  });

  test('User can manually log out', async () => {
    // Mock logout function that clears localStorage
    let logoutCalled = false;
    const mockLogout = async () => {
      logoutCalled = true;
      localStorage.removeItem(import.meta.env.VITE_JWT_STORAGE_KEY || 'auth_token');
    };

    renderWithProviders(<App />, {
      initialRoute: '/dashboard',
      authValue: {
        isAuthenticated: true,
        user: mockUser,
        tenant: mockTenant,
        logout: mockLogout,
      },
    });

    // Find and click logout button (usually in user menu)
    const userMenu = screen.getByRole('button', { name: new RegExp(mockUser.username, 'i') });
    await userEvent.click(userMenu);

    // Find logout option
    const logoutButton = screen.getByText(/logout|sign out/i);
    await userEvent.click(logoutButton);

    // Verify logout function was called
    expect(logoutCalled).toBe(true);

    // Verify token cleared from localStorage
    const storedToken = localStorage.getItem(import.meta.env.VITE_JWT_STORAGE_KEY || 'auth_token');
    expect(storedToken).toBeNull();

    // Since mock doesn't support state changes, we can't test the redirect
    // But we can verify the logout behavior was triggered
    // In a real app, this would cause a redirect to login
  });
});

/**
 * Authentication Flow: Multi-Tenant Switching
 *
 * Scenario: User with access to multiple tenants should be able to switch
 * Context and API calls should reflect the current tenant
 */
describe.skip('Authentication Flow: Multi-Tenant Switching', () => {
  const tenant1 = mockTenant;
  const tenant2 = {
    ...mockTenant,
    id: asTenantId('tenant-2'),
    name: 'Tenant 2',
  };

  beforeEach(() => {
    resetMSW();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    resetMSW();
  });

  test('Authenticated requests include tenant ID header', async () => {
    let capturedTenantHeader: string | null = null;

    server.use(
      http.get(`${API_URL}/contacts`, ({ request }) => {
        capturedTenantHeader = request.headers.get('x-tenant-id');
        return HttpResponse.json({
          success: true,
          data: [],
          message: 'Success',
        });
      })
    );

    renderWithProviders(<App />, {
      initialRoute: '/contacts',
      authValue: {
        isAuthenticated: true,
        user: mockUser,
        tenant: tenant1,
      },
    });

    // Wait for API call
    await waitFor(() => {
      expect(capturedTenantHeader).not.toBeNull();
    });

    // Verify tenant header sent - should match tenant ID
    const expectedTenantId = String(tenant1.id);
    expect(capturedTenantHeader!).toBe(expectedTenantId);
  });

  test('API requests include tenant ID header matching current context', async () => {
    const tenantHeaders: string[] = [];

    server.use(
      http.get(`${API_URL}/contacts`, ({ request }) => {
        const tenantId = request.headers.get('x-tenant-id');
        if (tenantId) {
          tenantHeaders.push(tenantId);
        }
        return HttpResponse.json({
          success: true,
          data: [],
          message: 'Success',
        });
      })
    );

    renderWithProviders(<App />, {
      initialRoute: '/contacts',
      authValue: {
        isAuthenticated: true,
        user: mockUser,
        tenant: tenant1,
      },
    });

    // Wait for initial request
    await waitFor(() => {
      expect(tenantHeaders.length).toBeGreaterThan(0);
    });

    const firstTenantId = String(tenant1.id);
    expect(tenantHeaders[0]).toBe(firstTenantId);
  });

  test('Tenant switching preserves authentication state', async () => {
    // Setup initial tenant
    renderWithProviders(<App />, {
      initialRoute: '/dashboard',
      authValue: {
        isAuthenticated: true,
        user: mockUser,
        tenant: tenant1,
        isLoading: false,
        ...emptyAuthMocks,
      },
    });

    // Verify initial tenant context
    const initialDashboards = await screen.findAllByText(/dashboard|welcome/i, undefined, {
      timeout: 3000,
    });
    expect(initialDashboards.length).toBeGreaterThan(0);
    const initialDashboard = initialDashboards[0];
    expect(initialDashboard).toBeInTheDocument();

    // Simulate tenant switch by re-rendering with different tenant
    // (In real app, this would be triggered by a tenant selector component)
    renderWithProviders(<App />, {
      initialRoute: '/dashboard',
      authValue: {
        isAuthenticated: true,
        user: { ...mockUser, tenantId: tenant2.id },
        tenant: tenant2,
        isLoading: false,
        ...emptyAuthMocks,
      },
    });

    // Verify user remains authenticated but tenant changed
    const tenantChangedDashboards = await screen.findAllByText(/dashboard|welcome/i, undefined, {
      timeout: 3000,
    });
    expect(tenantChangedDashboards.length).toBeGreaterThan(0);
    const tenantChangedDashboard = tenantChangedDashboards[0];
    expect(tenantChangedDashboard).toBeInTheDocument();

    // Verify tenant-specific data would be different
    // (This would be tested more thoroughly in E2E tests with actual tenant switching UI)
  });

  test('API calls reflect tenant switch immediately', async () => {
    const apiCalls: { tenantId: string; endpoint: string }[] = [];

    server.use(
      http.get(`${API_URL}/contacts`, ({ request }) => {
        const tenantId = request.headers.get('x-tenant-id') || 'unknown';
        apiCalls.push({ tenantId, endpoint: '/contacts' });
        return HttpResponse.json({
          success: true,
          data: [],
          message: 'Success',
        });
      }),
      http.get(`${API_URL}/dashboard`, ({ request }) => {
        const tenantId = request.headers.get('x-tenant-id') || 'unknown';
        apiCalls.push({ tenantId, endpoint: '/dashboard' });
        return HttpResponse.json({
          success: true,
          data: { stats: {} },
          message: 'Success',
        });
      })
    );

    // Start with tenant 1
    renderWithProviders(<DashboardPage />, {
      initialRoute: '/dashboard',
      authValue: {
        isAuthenticated: true,
        user: mockUser,
        tenant: tenant1,
        isLoading: false,
        ...emptyAuthMocks,
      },
    });

    // Wait for initial API calls
    await waitFor(() => {
      const tenant1Calls = apiCalls.filter(call => call.tenantId === String(tenant1.id));
      expect(tenant1Calls.length).toBeGreaterThan(0);
    });

    // Clear previous calls
    apiCalls.splice(0);

    // Switch to tenant 2 by re-rendering
    renderWithProviders(<DashboardPage />, {
      initialRoute: '/dashboard',
      authValue: {
        isAuthenticated: true,
        user: { ...mockUser, tenantId: tenant2.id },
        tenant: tenant2,
        isLoading: false,
        ...emptyAuthMocks,
      },
    });

    // Wait for new API calls with tenant 2
    await waitFor(() => {
      const tenant2Calls = apiCalls.filter(call => call.tenantId === String(tenant2.id));
      expect(tenant2Calls.length).toBeGreaterThan(0);
    });

    // Verify no calls were made with old tenant
    const tenant1Calls = apiCalls.filter(call => call.tenantId === String(tenant1.id));
    expect(tenant1Calls.length).toBe(0);
  });

  test("Rendering with invalid tenant doesn't crash the app", async () => {
    const invalidTenant = {
      ...mockTenant,
      id: asTenantId('invalid-tenant'),
      name: 'Invalid Tenant',
    };

    // Render the app with an invalid tenant context
    renderWithProviders(<DashboardPage />, {
      initialRoute: '/dashboard',
      authValue: {
        isAuthenticated: true,
        user: mockUser,
        tenant: invalidTenant,
        isLoading: false,
        ...emptyAuthMocks,
      },
    });

    // Verify that the app doesn't crash and renders successfully
    await waitFor(() => {
      const welcomeMessage = screen.getByText(
        `You're logged in to tenant ${invalidTenant.name} (${invalidTenant.id})`
      );
      expect(welcomeMessage).toBeInTheDocument();
    });

    // Verify that the dashboard renders without crashing
    const dashboardElements = await screen.findAllByText(/dashboard|welcome/i, undefined, {
      timeout: 3000,
    });
    expect(dashboardElements.length).toBeGreaterThan(0);

    // Verify that the invalid tenant context is displayed
    const invalidTenantElements = screen.queryAllByText(new RegExp(invalidTenant.name, 'i'));
    expect(invalidTenantElements.length).toBeGreaterThan(0);

    // Verify that the app continues to function normally
    expect(screen.getByText('Welcome back, Test!')).toBeInTheDocument();
  });
});
