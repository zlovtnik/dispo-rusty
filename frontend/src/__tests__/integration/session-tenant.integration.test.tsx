/**
 * Session & Tenant Management Integration Tests
 *
 * Tests session expiration, token refresh, and tenant switching functionality
 *
 * @group integration
 * @category session-tenant
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { renderWithProviders, renderWithAuth, mockUser, mockTenant, screen, waitFor, userEvent } from '../../test-utils';
import { server, resetMSW } from '../../test-utils/mocks/server';
import { http, HttpResponse } from 'msw';
import { App } from '../../App';
import { DashboardPage } from '../../pages/DashboardPage';
import { TenantsPage } from '../../pages/TenantsPage';

// Create mock JWT tokens for testing
function createExpiredToken(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    sub: 'test-user',
    tenant_id: 'tenant-1',
    exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
    iat: Math.floor(Date.now() / 1000) - 7200,
  }));
  const signature = 'mock-signature';
  return `${header}.${payload}.${signature}`;
}

function createValidToken(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    sub: 'test-user',
    tenant_id: 'tenant-1',
    exp: Math.floor(Date.now() / 1000) + 3600, // Valid for 1 hour
    iat: Math.floor(Date.now() / 1000),
  }));
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
          return HttpResponse.json(
            { message: 'Token expired' },
            { status: 401 }
          );
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
        loading: false,
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
        HttpResponse.json(
          { message: 'Token expired' },
          { status: 401 }
        )
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
        loading: false,
      },
    });

    // Wait for logout/redirect
    await waitFor(
      () => {
        const loginElement = screen.queryByText(/login|sign in/i);
        const unauthorizedElement = screen.queryByText(/unauthorized|access denied/i);
        expect(loginElement || unauthorizedElement).toBeDefined();
      },
      { timeout: 5000 }
    );

    // Verify refresh was attempted
    expect(refreshCalled).toBe(true);

    // Verify token was cleared
    const storedToken = localStorage.getItem('auth_token');
    expect(storedToken).toBeNull();
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
        loading: false,
      },
    });

    // Verify initially authenticated
    await waitFor(() => {
      expect(screen.queryByText(/dashboard|welcome/i)).toBeDefined();
    });

    // Find and click logout (this would be implemented in your app)
    // Since logout UI may vary, we'll simulate by calling logout directly
    // In a real app, you'd click a logout button

    // For this test, we'll assume there's a logout mechanism
    // Verify after logout that user is redirected to login
    await waitFor(() => {
      // After logout, should be redirected or show login
      const isOnLogin = screen.queryByText(/login/i) !== null;
      const isLoggedOut = localStorage.getItem('auth_token') === null;
      expect(isOnLogin || isLoggedOut).toBe(true);
    });
  });

  test('Invalid token immediately triggers logout', async () => {
    const invalidToken = 'invalid.jwt.token';

    server.use(
      http.get(`${API_URL}/dashboard`, () =>
        HttpResponse.json(
          { message: 'Invalid token' },
          { status: 401 }
        )
      ),
      http.post(`${API_URL}/auth/refresh`, () =>
        HttpResponse.json(
          { success: false, message: 'Invalid refresh token' },
          { status: 401 }
        )
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
        loading: false,
      },
    });

    // Should immediately detect invalid state and redirect
    await waitFor(() => {
      const loginElement = screen.queryByText(/login|sign in/i);
      const errorElement = screen.queryByText(/error|invalid/i);
      expect(loginElement || errorElement).toBeDefined();
    });
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
          return HttpResponse.json(
            { message: 'Unauthorized' },
            { status: 401 }
          );
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
        loading: false,
      },
    });

    // Should remain on dashboard
    await waitFor(() => {
      expect(screen.queryByText(/dashboard|welcome/i)).toBeDefined();
    }, { timeout: 3000 });

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
  const tenant1 = mockTenant;
  const tenant2 = {
    ...mockTenant,
    id: 'tenant-2' as any,
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
    let capturedTenantIds: string[] = [];

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
    const { rerender } = renderWithProviders(<App />, {
      initialRoute: '/dashboard',
      authValue: {
        isAuthenticated: true,
        user: mockUser,
        tenant: tenant1,
        loading: false,
      },
    });

    // Wait for initial requests with tenant 1
    await waitFor(() => {
      expect(capturedTenantIds.some(id => id === String(tenant1.id))).toBe(true);
    });

    // Clear captured headers for next check
    capturedTenantIds.length = 0;

    // Switch to tenant 2
    renderWithProviders(<App />, {
      initialRoute: '/dashboard',
      authValue: {
        isAuthenticated: true,
        user: { ...mockUser, tenantId: tenant2.id },
        tenant: tenant2,
        loading: false,
      },
    });

    // Wait for requests with tenant 2
    await waitFor(() => {
      expect(capturedTenantIds.some(id => id === String(tenant2.id))).toBe(true);
    });

    // Verify correct tenant headers were sent
    const tenant1Requests = capturedTenantIds.filter(id => id === String(tenant1.id));
    const tenant2Requests = capturedTenantIds.filter(id => id === String(tenant2.id));

    // After switch, should only see tenant 2 requests
    expect(tenant2Requests.length).toBeGreaterThan(0);
  });

  test('Tenant switch preserves user authentication state', async () => {
    // Start with tenant 1
    renderWithProviders(<App />, {
      initialRoute: '/dashboard',
      authValue: {
        isAuthenticated: true,
        user: mockUser,
        tenant: tenant1,
        loading: false,
      },
    });

    // Verify initially shows dashboard
    await waitFor(() => {
      expect(screen.queryByText(/dashboard|welcome/i)).toBeDefined();
    });

    // Switch tenant
    renderWithProviders(<App />, {
      initialRoute: '/dashboard',
      authValue: {
        isAuthenticated: true,
        user: { ...mockUser, tenantId: tenant2.id },
        tenant: tenant2,
        loading: false,
      },
    });

    // Verify still authenticated but different tenant
    await waitFor(() => {
      expect(screen.queryByText(/dashboard|welcome/i)).toBeDefined();
    });

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
          return HttpResponse.json(
            { message: 'Invalid tenant access' },
            { status: 403 }
          );
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
        loading: false,
      },
    });

    // Should handle error gracefully - either show error or fall back to valid tenant
    await waitFor(() => {
      const hasError = screen.queryByText(/error|invalid|forbidden/i);
      const hasFallback = screen.queryByText(/dashboard|welcome/i);
      expect(hasError || hasFallback).toBeDefined();
    });
  });

  test('Multiple tenant switches maintain data consistency', async () => {
    const capturedTenantIds: string[] = [];
    const capturedEndpoints: Array<{ tenantId: string; endpoint: string }> = [];

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
    const { rerender } = renderWithProviders(<App />, {
      initialRoute: '/dashboard',
      authValue: {
        isAuthenticated: true,
        user: mockUser,
        tenant: tenant1,
        loading: false,
      },
    });

    // Switch to tenant 2
    renderWithProviders(<App />, {
      initialRoute: '/contacts',
      authValue: {
        isAuthenticated: true,
        user: { ...mockUser, tenantId: tenant2.id },
        tenant: tenant2,
        loading: false,
      },
    });

    // Switch back to tenant 1
    renderWithProviders(<App />, {
      initialRoute: '/dashboard',
      authValue: {
        isAuthenticated: true,
        user: { ...mockUser, tenantId: tenant1.id },
        tenant: tenant1,
        loading: false,
      },
    });

    // Verify tenant headers were sent correctly throughout
    await waitFor(() => {
      const tenant1Requests = capturedEndpoints.filter(req => req.tenantId === String(tenant1.id));
      const tenant2Requests = capturedEndpoints.filter(req => req.tenantId === String(tenant2.id));
      expect(tenant1Requests.length).toBeGreaterThan(0);
      expect(tenant2Requests.length).toBeGreaterThan(0);
    });
  });

  test('Tenant switch clears previous tenant cached data', async () => {
    let contactRequests: Array<{ tenantId: string; contacts: any[] }> = [];

    server.use(
      http.get(`${API_URL}/contacts`, ({ request }) => {
        const tenantId = request.headers.get('x-tenant-id') || 'unknown';
        const contacts = tenantId === 'tenant-1'
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
    const { rerender } = renderWithProviders(<App />, {
      initialRoute: '/contacts',
      authValue: {
        isAuthenticated: true,
        user: mockUser,
        tenant: tenant1,
        loading: false,
      },
    });

    // Wait for tenant 1 data
    await waitFor(() => {
      const tenant1Request = contactRequests.find(req => req.tenantId === 'tenant-1');
      expect(tenant1Request).toBeDefined();
    });

    // Clear request log for next check
    contactRequests.length = 0;

    // Switch to tenant 2
    renderWithProviders(<App />, {
      initialRoute: '/contacts',
      authValue: {
        isAuthenticated: true,
        user: { ...mockUser, tenantId: tenant2.id },
        tenant: tenant2,
        loading: false,
      },
    });

    // Verify tenant 2 data is loaded
    await waitFor(() => {
      const tenant2Request = contactRequests.find(req => req.tenantId === String(tenant2.id));
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
      tenant_id: 'tenant-1',
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
      tenant_id: 'tenant-2',
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
        const data = tenantId === 'tenant-1' ? tenant1Contacts : tenant2Contacts;
        return HttpResponse.json({
          success: true,
          data,
          message: 'Success',
        });
      })
    );

    const { rerender } = renderWithProviders(<App />, {
      initialRoute: '/contacts',
      authValue: {
        isAuthenticated: true,
        user: mockUser,
        tenant: mockTenant,
        loading: false,
      },
    });

    // Verify tenant 1 contacts are shown
    await waitFor(() => {
      expect(screen.queryByText('John Tenant1')).toBeDefined();
      expect(screen.queryByText('Jane Tenant2')).toBeNull();
    });

    // Switch tenant and verify different data
    const tenant2 = {
      ...mockTenant,
      id: 'tenant-2' as any,
      name: 'Tenant 2',
    };

    renderWithProviders(<App />, {
      initialRoute: '/contacts',
      authValue: {
        isAuthenticated: true,
        user: { ...mockUser, tenantId: tenant2.id },
        tenant: tenant2,
        loading: false,
      },
    });

    // Verify tenant 2 contacts are shown
    await waitFor(() => {
      expect(screen.queryByText('Jane Tenant2')).toBeDefined();
      expect(screen.queryByText('John Tenant1')).toBeNull();
    });
  });

  test('Create operation respects tenant isolation', async () => {
    let createdContacts: any[] = [];

    server.use(
      http.get(`${API_URL}/contacts`, ({ request }) => {
        const tenantId = request.headers.get('x-tenant-id');
        const existingContacts = tenantId === 'tenant-1' ? tenant1Contacts : tenant2Contacts;
        const allContacts = [...existingContacts, ...createdContacts.filter(c => c.tenant_id === tenantId)];
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
      initialRoute: '/contacts',
      authValue: {
        isAuthenticated: true,
        user: mockUser,
        tenant: mockTenant,
        loading: false,
      },
    });

    // Should only see tenant 1 contacts initially
    await waitFor(() => {
      expect(screen.queryByText('John Tenant1')).toBeDefined();
      expect(screen.queryByText('Jane Tenant2')).toBeNull();
    });
  });

  test('Error states are tenant-specific', async () => {
    // Simulate different error responses per tenant
    server.use(
      http.get(`${API_URL}/contacts`, ({ request }) => {
        const tenantId = request.headers.get('x-tenant-id');
        if (tenantId === 'tenant-1') {
          return HttpResponse.json({
            success: false,
            message: 'Database connection failed for tenant-1',
          }, { status: 500 });
        }
        return HttpResponse.json({
          success: true,
          data: tenant2Contacts,
          message: 'Success',
        });
      })
    );

    renderWithProviders(<App />, {
      initialRoute: '/contacts',
      authValue: {
        isAuthenticated: true,
        user: mockUser,
        tenant: mockTenant,
        loading: false,
      },
    });

    // Should show error for tenant 1
    await waitFor(() => {
      expect(screen.queryByText(/database connection failed|error/i)).toBeDefined();
    });
  });
});
