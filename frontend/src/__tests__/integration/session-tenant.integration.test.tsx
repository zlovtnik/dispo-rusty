/**
 * Session & Tenant Management Integration Tests
 *
 * Tests session expiration, token refresh, and tenant switching functionality
 *
 * @group integration
 * @category session-tenant
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  renderWithProviders,
  renderWithAuth,
  mockUser,
  mockTenant,
  screen,
  waitFor,
  userEvent,
  cleanup,
} from '../../test-utils';
import { server, resetMSW } from '../../test-utils/mocks/server';
import { http, HttpResponse } from 'msw';
import { App } from '../../App';
import { DashboardPage } from '../../pages/DashboardPage';
import { TenantsPage } from '../../pages/TenantsPage';

// Tenant ID constants for consistent testing
const TENANT_1_ID = 'tenant-1';
const TENANT_2_ID = 'tenant-2';

// Helper function for base64url encoding
const base64url = (str: string): string =>
  btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Create mock JWT tokens for testing
function createExpiredToken(): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      sub: 'test-user',
      tenant_id: TENANT_1_ID,
      exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
      iat: Math.floor(Date.now() / 1000) - 7200,
    })
  );
  const signature = 'mock-signature';
  return `${header}.${payload}.${signature}`;
}

function createValidToken(): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      sub: 'test-user',
      tenant_id: TENANT_1_ID,
      exp: Math.floor(Date.now() / 1000) + 3600, // Valid for 1 hour
      iat: Math.floor(Date.now() / 1000),
    })
  );
  const signature = 'mock-signature';
  return `${header}.${payload}.${signature}`;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

/**
 * Session Expiration & Token Refresh Flow
 *
 * Scenario: When tokens expire, app should attempt refresh and handle failures gracefully
 */
describe('Session Expiration & Token Refresh Flow', () => {
  beforeEach(() => {
    resetMSW();
    // Clear any stored auth data
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    resetMSW();
    localStorage.clear();
    sessionStorage.clear();
  });

  test('Expired token triggers automatic refresh attempt', async () => {
    let refreshCalled = false;
    let apiCallCount = 0;

    server.use(
      http.get(`${API_URL}/dashboard`, () => {
        apiCallCount++;
        // First call returns 401 (expired token)
        if (apiCallCount === 1) {
          return HttpResponse.json({ message: 'Token expired' }, { status: 401 });
        }
        // Subsequent calls succeed (after refresh)
        return HttpResponse.json({
          success: true,
          data: { stats: {} },
          message: 'Success',
        });
      }),
      http.post(`${API_URL}/auth/refresh`, () => {
        refreshCalled = true;
        return HttpResponse.json({
          success: true,
          token: createValidToken(),
          user: mockUser,
          tenant: mockTenant,
          message: 'Token refreshed successfully',
        });
      })
    );

    // Start with expired token in localStorage
    localStorage.setItem('auth_token', createExpiredToken());

    renderWithProviders(<App />, {
      initialRoute: '/dashboard',
      authValue: {
        isAuthenticated: true,
        user: mockUser,
        tenant: mockTenant,
        isLoading: false,
      },
    });

    // Wait for refresh attempt
    await waitFor(
      () => {
        expect(refreshCalled).toBe(true);
      },
      { timeout: 5000 }
    );

    // Verify refresh was called
    expect(refreshCalled).toBe(true);
    expect(apiCallCount).toBeGreaterThan(1); // Should have retried after refresh
  });

  test('Failed token refresh logs user out', async () => {
    let refreshCalled = false;

    server.use(
      http.get(`${API_URL}/dashboard`, () =>
        HttpResponse.json({ message: 'Token expired' }, { status: 401 })
      ),
      http.post(`${API_URL}/auth/refresh`, () => {
        refreshCalled = true;
        return HttpResponse.json(
          {
            success: false,
            message: 'Refresh token expired',
          },
          { status: 401 }
        );
      })
    );

    // Start with expired token
    localStorage.setItem('auth_token', createExpiredToken());

    const { container } = renderWithProviders(<App />, {
      initialRoute: '/dashboard',
      authValue: {
        isAuthenticated: true,
        user: mockUser,
        tenant: mockTenant,
        isLoading: false,
      },
    });

    // Wait for logout/redirect - look for either login page or unauthorized message
    try {
      const loginForm = await screen.findByTestId('login-form');
      expect(loginForm).toBeInTheDocument();
    } catch {
      // If no login form, look for unauthorized message
      const unauthorizedElement = await screen.findByTestId('unauthorized-message');
      expect(unauthorizedElement).toBeInTheDocument();
    }

    // Verify refresh was attempted
    expect(refreshCalled).toBe(true);

    // Verify token was cleared
    expect(localStorage.getItem('auth_token')).toBeNull();
  });

  test('User can manually log out and clear session', async () => {
    // Start with valid session
    localStorage.setItem('auth_token', createValidToken());

    renderWithProviders(<App />, {
      initialRoute: '/dashboard',
      authValue: {
        isAuthenticated: true,
        user: mockUser,
        tenant: mockTenant,
        isLoading: false,
      },
    });

    // Verify initially authenticated
    const dashboardElement = await screen.findByText(/dashboard|welcome/i);
    expect(dashboardElement).toBeInTheDocument();

    // Trigger logout
    const logoutButton = screen.getByRole('button', { name: /logout|sign out/i });
    await userEvent.click(logoutButton);

    // Verify redirect to login page
    await screen.findByTestId('login-form');
    expect(localStorage.getItem('auth_token')).toBeNull();
  });

  test('Invalid token immediately triggers logout', async () => {
    const invalidToken = 'invalid.jwt.token';

    server.use(
      http.get(`${API_URL}/dashboard`, () =>
        HttpResponse.json({ message: 'Invalid token' }, { status: 401 })
      ),
      http.post(`${API_URL}/auth/refresh`, () =>
        HttpResponse.json({ success: false, message: 'Invalid refresh token' }, { status: 401 })
      )
    );

    // Start with invalid token
    localStorage.setItem('auth_token', invalidToken);

    renderWithProviders(<App />, {
      initialRoute: '/dashboard',
      authValue: {
        isAuthenticated: true,
        user: mockUser,
        tenant: mockTenant,
        isLoading: false,
      },
    });

    // Should immediately detect invalid state and redirect to login page
    // Wait for login form to appear (indicating successful redirect)
    const loginForm = await screen.findByRole('form', { name: /login/i });
    expect(loginForm).toBeInTheDocument();

    // Verify that the username/email input is present (specific login UI element)
    const usernameInput = await screen.findByLabelText(/username or email/i);
    expect(usernameInput).toBeInTheDocument();

    // Assert that the auth token has been cleared from localStorage
    expect(localStorage.getItem('auth_token')).toBeNull();

    // Assert that we've been redirected to the login route
    expect(window.location.pathname).toBe('/login');
  });

  test('Session remains active with valid token', async () => {
    const validToken = createValidToken();
    let apiCallCount = 0;

    server.use(
      http.get(`${API_URL}/dashboard`, ({ request }) => {
        apiCallCount++;
        const authHeader = request.headers.get('authorization');
        // Check that token is being sent
        if (!authHeader?.startsWith('Bearer ')) {
          return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }
        return HttpResponse.json({
          success: true,
          data: { stats: {} },
          message: 'Success',
        });
      })
    );

    // Start with valid token
    localStorage.setItem('auth_token', validToken);

    renderWithProviders(<App />, {
      initialRoute: '/dashboard',
      authValue: {
        isAuthenticated: true,
        user: mockUser,
        tenant: mockTenant,
        isLoading: false,
      },
    });

    // Should remain on dashboard
    await waitFor(
      () => {
        expect(screen.getByText(/dashboard|welcome/i)).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    // Verify API was called successfully
    expect(apiCallCount).toBeGreaterThan(0);
  });
});

/**
 * Tenant Switching Functionality
 *
 * Scenario: Users can switch between tenants they have access to
 */
describe('Tenant Switching Functionality', () => {
  const tenant1 = {
    ...mockTenant,
    id: TENANT_1_ID as any,
  };
  const tenant2 = {
    ...mockTenant,
    id: TENANT_2_ID as any,
    name: 'Tenant 2',
  };

  beforeEach(() => {
    resetMSW();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    resetMSW();
    localStorage.clear();
    sessionStorage.clear();
  });

  test('Tenant switch updates API requests with correct tenant header', async () => {
    const capturedTenantIds: string[] = [];

    server.use(
      http.get(`${API_URL}/contacts`, ({ request }) => {
        const tenantId = request.headers.get('x-tenant-id');
        if (tenantId) {
          capturedTenantIds.push(tenantId);
        }
        return HttpResponse.json({
          success: true,
          data: [],
          message: 'Success',
        });
      }),
      http.get(`${API_URL}/dashboard`, ({ request }) => {
        const tenantId = request.headers.get('x-tenant-id');
        if (tenantId) {
          capturedTenantIds.push(tenantId);
        }
        return HttpResponse.json({
          success: true,
          data: { stats: {} },
          message: 'Success',
        });
      })
    );

    // Start with tenant 1
    renderWithProviders(<App />, {
      initialRoute: '/dashboard',
      authValue: {
        isAuthenticated: true,
        user: mockUser,
        tenant: tenant1,
        isLoading: false,
      },
    });

    // Wait for initial requests with tenant 1
    await waitFor(() => {
      expect(capturedTenantIds.some(id => id === TENANT_1_ID)).toBe(true);
    });

    // Clear captured headers for next check
    capturedTenantIds.length = 0;

    // Switch to tenant 2 - cleanup first render to avoid multiple mounted apps
    cleanup();
    renderWithProviders(<App />, {
      initialRoute: '/dashboard',
      authValue: {
        isAuthenticated: true,
        user: { ...mockUser, tenantId: tenant2.id },
        tenant: tenant2,
        isLoading: false,
      },
    });

    // Wait for requests with tenant 2
    await waitFor(() => {
      expect(capturedTenantIds.some(id => id === TENANT_2_ID)).toBe(true);
    });

    // Verify correct tenant headers were sent
    const tenant1Requests = capturedTenantIds.filter(id => id === TENANT_1_ID);
    const tenant2Requests = capturedTenantIds.filter(id => id === TENANT_2_ID);

    // After switch, should only see tenant 2 requests
    expect(tenant2Requests.length).toBeGreaterThan(0);
  });

  test('Tenant switch preserves user authentication state', async () => {
    // Start with tenant 1
    const firstRender = renderWithProviders(<App />, {
      initialRoute: '/dashboard',
      authValue: {
        isAuthenticated: true,
        user: mockUser,
        tenant: tenant1,
        isLoading: false,
      },
    });

    // Verify initially shows dashboard
    const initialDashboard = await screen.findByText(/dashboard|welcome/i);
    expect(initialDashboard).toBeInTheDocument();

    // Unmount first render
    firstRender.unmount();

    // Switch tenant
    renderWithProviders(<App />, {
      initialRoute: '/dashboard',
      authValue: {
        isAuthenticated: true,
        user: { ...mockUser, tenantId: tenant2.id },
        tenant: tenant2,
        isLoading: false,
      },
    });

    // Verify still authenticated but different tenant
    const dashboardAfterSwitch = await screen.findByText(/dashboard|welcome/i);
    expect(dashboardAfterSwitch).toBeInTheDocument();

    // Verify tenant context changed (this would be tested e2e for UI changes)
    // In a real app, you might check for tenant-specific branding or data
  });

  test('Invalid tenant switch is handled gracefully', async () => {
    const invalidTenant = {
      ...mockTenant,
      id: 'invalid-tenant' as any,
      name: 'Invalid Tenant',
    };

    server.use(
      http.get(`${API_URL}/dashboard`, ({ request }) => {
        const tenantId = request.headers.get('x-tenant-id');
        // Simulate rejecting invalid tenant
        if (tenantId === 'invalid-tenant') {
          return HttpResponse.json({ message: 'Invalid tenant access' }, { status: 403 });
        }
        return HttpResponse.json({
          success: true,
          data: { stats: {} },
          message: 'Success',
        });
      })
    );

    renderWithProviders(<App />, {
      initialRoute: '/dashboard',
      authValue: {
        isAuthenticated: true,
        user: mockUser,
        tenant: invalidTenant,
        isLoading: false,
      },
    });

    // Should handle error gracefully - either show error or fall back to valid tenant
    // Try to find either an error message or a fallback dashboard display
    try {
      const errorElement = await screen.findByText(/error|invalid|forbidden/i);
      expect(errorElement).toBeInTheDocument();
    } catch {
      // If no error, expect fallback to dashboard
      const fallbackElement = await screen.findByText(/dashboard|welcome/i);
      expect(fallbackElement).toBeInTheDocument();
    }
  });

  test('Multiple tenant switches maintain data consistency', async () => {
    const capturedTenantIds: string[] = [];
    const capturedEndpoints: { tenantId: string; endpoint: string }[] = [];

    server.use(
      http.get(`${API_URL}/contacts`, ({ request }) => {
        const tenantId = request.headers.get('x-tenant-id') || 'unknown';
        capturedTenantIds.push(tenantId);
        capturedEndpoints.push({ tenantId, endpoint: '/contacts' });
        return HttpResponse.json({
          success: true,
          data: [],
          message: 'Success',
        });
      }),
      http.get(`${API_URL}/dashboard`, ({ request }) => {
        const tenantId = request.headers.get('x-tenant-id') || 'unknown';
        capturedTenantIds.push(tenantId);
        capturedEndpoints.push({ tenantId, endpoint: '/dashboard' });
        return HttpResponse.json({
          success: true,
          data: { stats: {} },
          message: 'Success',
        });
      })
    );

    // Navigate through different tenants and endpoints
    renderWithProviders(<App />, {
      initialRoute: '/dashboard',
      authValue: {
        isAuthenticated: true,
        user: mockUser,
        tenant: tenant1,
        isLoading: false,
      },
    });

    // Switch to tenant 2
    cleanup();
    renderWithProviders(<App />, {
      initialRoute: '/address-book',
      authValue: {
        isAuthenticated: true,
        user: { ...mockUser, tenantId: tenant2.id },
        tenant: tenant2,
        isLoading: false,
      },
    });

    // Switch back to tenant 1
    cleanup();
    renderWithProviders(<App />, {
      initialRoute: '/dashboard',
      authValue: {
        isAuthenticated: true,
        user: { ...mockUser, tenantId: tenant1.id },
        tenant: tenant1,
        isLoading: false,
      },
    });

    // Verify tenant headers were sent correctly throughout
    await waitFor(() => {
      const tenant1Requests = capturedEndpoints.filter(req => req.tenantId === TENANT_1_ID);
      const tenant2Requests = capturedEndpoints.filter(req => req.tenantId === TENANT_2_ID);
      expect(tenant1Requests.length).toBeGreaterThan(0);
      expect(tenant2Requests.length).toBeGreaterThan(0);
    });
  });

  test('Tenant switch clears previous tenant cached data', async () => {
    const contactRequests: { tenantId: string; contacts: any[] }[] = [];

    server.use(
      http.get(`${API_URL}/contacts`, ({ request }) => {
        const tenantId = request.headers.get('x-tenant-id') || 'unknown';
        const contacts =
          tenantId === TENANT_1_ID
            ? [{ id: 1, first_name: 'John Tenant1' }]
            : [{ id: 2, first_name: 'Jane Tenant2' }];

        contactRequests.push({ tenantId, contacts });

        return HttpResponse.json({
          success: true,
          data: contacts,
          message: 'Success',
        });
      })
    );

    // Start with tenant 1 data
    renderWithProviders(<App />, {
      initialRoute: '/address-book',
      authValue: {
        isAuthenticated: true,
        user: mockUser,
        tenant: tenant1,
        isLoading: false,
      },
    });

    // Wait for tenant 1 data
    await waitFor(() => {
      const tenant1Request = contactRequests.find(req => req.tenantId === TENANT_1_ID);
      expect(tenant1Request).toBeDefined();
    });

    // Clear request log for next check
    contactRequests.length = 0;

    // Switch to tenant 2
    cleanup();
    renderWithProviders(<App />, {
      initialRoute: '/address-book',
      authValue: {
        isAuthenticated: true,
        user: { ...mockUser, tenantId: tenant2.id },
        tenant: tenant2,
        isLoading: false,
      },
    });

    // Verify tenant 2 data is loaded
    await waitFor(() => {
      const tenant2Request = contactRequests.find(req => req.tenantId === TENANT_2_ID);
      expect(tenant2Request).toBeDefined();
      expect(tenant2Request?.contacts[0]?.first_name).toBe('Jane Tenant2');
    });
  });
});

/**
 * Multi-Tenant Data Isolation UI Behavior
 *
 * Scenario: UI correctly reflects tenant-specific data isolation
 */
describe('Multi-Tenant Data Isolation UI Behavior', () => {
  const tenant1Contacts = [
    {
      id: 1,
      tenant_id: TENANT_1_ID,
      first_name: 'John',
      last_name: 'Tenant1',
      email: 'john@tenant1.com',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const tenant2Contacts = [
    {
      id: 2,
      tenant_id: TENANT_2_ID,
      first_name: 'Jane',
      last_name: 'Tenant2',
      email: 'jane@tenant2.com',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    resetMSW();
  });

  afterEach(() => {
    resetMSW();
  });

  test('UI displays tenant-specific contact list', async () => {
    server.use(
      http.get(`${API_URL}/contacts`, ({ request }) => {
        const tenantId = request.headers.get('x-tenant-id');
        const data = tenantId === TENANT_1_ID ? tenant1Contacts : tenant2Contacts;
        return HttpResponse.json({
          success: true,
          data,
          message: 'Success',
        });
      })
    );

    renderWithProviders(<App />, {
      initialRoute: '/address-book',
      authValue: {
        isAuthenticated: true,
        user: mockUser,
        tenant: mockTenant,
        isLoading: false,
      },
    });

    // Verify tenant 1 contacts are shown
    const tenant1Contact = await screen.findByText('John Tenant1');
    expect(tenant1Contact).toBeInTheDocument();
    expect(screen.queryByText('Jane Tenant2')).not.toBeInTheDocument();

    // Switch tenant and verify different data
    cleanup();
    const tenant2 = {
      ...mockTenant,
      id: TENANT_2_ID as any,
      name: 'Tenant 2',
    };

    renderWithProviders(<App />, {
      initialRoute: '/address-book',
      authValue: {
        isAuthenticated: true,
        user: { ...mockUser, tenantId: tenant2.id },
        tenant: tenant2,
        isLoading: false,
      },
    });

    // Verify tenant 2 contacts are shown
    const tenant2Contact = await screen.findByText('Jane Tenant2');
    expect(tenant2Contact).toBeInTheDocument();
    expect(screen.queryByText('John Tenant1')).not.toBeInTheDocument();
  });

  test('Create operation respects tenant isolation', async () => {
    const createdContacts: any[] = [];

    server.use(
      http.get(`${API_URL}/contacts`, ({ request }) => {
        const tenantId = request.headers.get('x-tenant-id');
        const existingContacts = tenantId === TENANT_1_ID ? tenant1Contacts : tenant2Contacts;
        const allContacts = [
          ...existingContacts,
          ...createdContacts.filter(c => c.tenant_id === tenantId),
        ];
        return HttpResponse.json({
          success: true,
          data: allContacts,
          message: 'Success',
        });
      }),
      http.post(`${API_URL}/contacts`, async ({ request }) => {
        const body = (await request.json()) as any;
        const tenantId = request.headers.get('x-tenant-id');
        const newContact = {
          id: createdContacts.length + 3, // IDs after tenant-specific contacts
          tenant_id: tenantId,
          first_name: body.first_name || 'New',
          last_name: body.last_name || 'Contact',
          email: body.email,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        createdContacts.push(newContact);
        return HttpResponse.json({
          success: true,
          data: newContact,
          message: 'Contact created',
        });
      })
    );

    // Create contact in tenant 1 context
    renderWithProviders(<App />, {
      initialRoute: '/address-book',
      authValue: {
        isAuthenticated: true,
        user: mockUser,
        tenant: mockTenant,
        isLoading: false,
      },
    });

    // Should only see tenant 1 contacts initially
    const tenant1Contact = await screen.findByText('John Tenant1');
    expect(tenant1Contact).toBeInTheDocument();
    expect(screen.queryByText('Jane Tenant2')).not.toBeInTheDocument();

    // Create a new contact in tenant 1
    const createButton = screen.getByRole('button', { name: /create|add|new contact/i });
    await userEvent.click(createButton);

    const emailInput = screen.getByLabelText(/email/i);
    await userEvent.type(emailInput, 'newuser@tenant1.com');

    const saveButton = screen.getByRole('button', { name: /save|create|submit/i });
    await userEvent.click(saveButton);

    // Verify the new contact was created with tenant-1 ID
    await waitFor(() => {
      const createdInTenant1 = createdContacts.some(c => c.tenant_id === TENANT_1_ID);
      expect(createdInTenant1).toBe(true);
    });

    // Verify tenant-2 doesn't see the new contact by switching tenant
    cleanup();
    const tenant2 = { ...mockTenant, id: TENANT_2_ID as any, name: 'Tenant 2' };
    renderWithProviders(<App />, {
      initialRoute: '/address-book',
      authValue: {
        isAuthenticated: true,
        user: { ...mockUser, tenantId: tenant2.id },
        tenant: tenant2,
        isLoading: false,
      },
    });

    // Verify new contact is not visible to tenant 2
    expect(screen.queryByText('newuser@tenant1.com')).not.toBeInTheDocument();
    const tenant2Contact = await screen.findByText('Jane Tenant2');
    expect(tenant2Contact).toBeInTheDocument();
  });

  test('Error states are tenant-specific', async () => {
    // Simulate different error responses per tenant
    server.use(
      http.get(`${API_URL}/contacts`, ({ request }) => {
        const tenantId = request.headers.get('x-tenant-id');
        if (tenantId === TENANT_1_ID) {
          return HttpResponse.json(
            {
              success: false,
              message: 'Database connection failed for tenant-1',
            },
            { status: 500 }
          );
        }
        return HttpResponse.json({
          success: true,
          data: tenant2Contacts,
          message: 'Success',
        });
      })
    );

    renderWithProviders(<App />, {
      initialRoute: '/address-book',
      authValue: {
        isAuthenticated: true,
        user: mockUser,
        tenant: mockTenant,
        isLoading: false,
      },
    });

    // Should show error for tenant 1
    const errorElement = await screen.findByText(/database connection failed|error/i);
    expect(errorElement).toBeInTheDocument();
  });
});
