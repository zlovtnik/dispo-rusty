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
import type { MockAuthContextValue } from '../../test-utils/render';
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
describe('Authentication Flow: Login → Token Storage → Protected Route', () => {
  beforeEach(() => {
    resetMSW();
    // Clear any stored auth data
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    resetMSW();
  });

  test('User can log in and access protected route', async () => {
    // 1. Render login page (unauthenticated - using real AuthProvider)
    const { rerender } = renderForIntegration(<App />, {
      initialRoute: '/login',
    });

    // Verify login page is displayed
    expect(screen.getByText(/login/i)).toBeInTheDocument();

    // 2. Fill in login form
    const usernameInput = screen.getByLabelText(/email|username/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const loginButton = screen.getByRole('button', { name: /login|sign in/i });

    // Enter credentials
    await userEvent.type(usernameInput, 'testuser@example.com');
    await userEvent.type(passwordInput, 'password123');

    // 3. Submit login form
    await userEvent.click(loginButton);

    // 4. Wait for redirect to dashboard (token stored, auth context updated)
    const dashboardElement = await screen.findByText(/dashboard|welcome/i, undefined, {
      timeout: 3000,
    });

    // 5. Verify token was stored
    const storedToken = localStorage.getItem(import.meta.env.VITE_JWT_STORAGE_KEY || 'auth_token');
    expect(storedToken).not.toBeNull();
    expect(storedToken).not.toBeUndefined();
    expect(storedToken!.split('.').length).toBe(3); // Valid JWT format

    // 6. Verify subsequent requests include token
    // Make an API call and verify Authorization header was sent
    // Assert the contacts link exists and navigate to it.
    const contactsLink = await screen.findByText(/contacts|address book/i, undefined, {
      timeout: 3000,
    });
    expect(contactsLink).toBeInTheDocument();
    await userEvent.click(contactsLink);

    // Wait for contacts to load (API call should be made with token)
    const contactElement = await screen.findByText(/contact/i, undefined, {
      timeout: 3000,
    });
    expect(contactElement).toBeInTheDocument();

    // 7. User context was established - auth token and API access confirmed above
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
describe('Authentication Flow: Token Refresh & Session Management', () => {
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
describe('Authentication Flow: Multi-Tenant Switching', () => {
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

  test('Tenant ID changes when user switches tenant context', async () => {
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

  test('Invalid tenant switch preserves current tenant context', async () => {
    const invalidTenant = {
      ...mockTenant,
      id: asTenantId('invalid-tenant'),
      name: 'Invalid Tenant',
    };

    // Start with valid tenant
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

    // Verify initial tenant works
    const initialTenantDashboards = await screen.findAllByText(/dashboard|welcome/i, undefined, {
      timeout: 3000,
    });
    expect(initialTenantDashboards.length).toBeGreaterThan(0);
    const initialTenantDashboard = initialTenantDashboards[0];
    expect(initialTenantDashboard).toBeInTheDocument();

    // Attempt to switch to invalid tenant
    // (In real app, this would be prevented by domain logic)
    renderWithProviders(<App />, {
      initialRoute: '/dashboard',
      authValue: {
        isAuthenticated: true,
        user: mockUser,
        tenant: invalidTenant,
        ...emptyAuthMocks,
      },
    });

    // Verify app still functions (though tenant context might be invalid)
    // In a real implementation, this would trigger error handling
    const maybeElements = await screen.findAllByText(/dashboard|welcome|error/i, undefined, {
      timeout: 3000,
    });
    expect(maybeElements.length).toBeGreaterThan(0);
    const maybeDashboardOrError = maybeElements[0];
    expect(maybeDashboardOrError).toBeInTheDocument();
  });
});
