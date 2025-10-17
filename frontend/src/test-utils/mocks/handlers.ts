/**
 * Mock API Handlers using MSW (Mock Service Worker)
 *
 * This file defines mock HTTP handlers for all API endpoints.
 * These handlers intercept API calls during tests and return mock responses.
 */

import { http, HttpResponse } from 'msw';
import type { LoginCredentials, AuthResponse } from '../../types/auth';
import { mockUser, mockTenant } from '../render';
import type { Tenant as BackendTenant } from '../../types/tenant';
import type { ContactApiDTO } from '../../transformers/dto';
import { asTenantId } from '../../types/ids';
import { createMockAuthJwt } from '../jwt';
import { testLogger } from '../logger';

// Get API base URL from environment (delay until runtime to ensure env vars are loaded)
import { getEnv } from '../../config/env';

// Create a function to get the base URL at runtime instead of module load time
function getApiBaseUrl(): string {
  // In tests, prioritize process.env which Bun loads from .env files
  // Fall back to import.meta.env for browser/build time
  const apiUrl =
    process.env.VITE_API_URL || import.meta.env?.VITE_API_URL || 'http://localhost:8000/api';

  if (!apiUrl) {
    throw new Error('Missing required environment variable: VITE_API_URL');
  }
  return apiUrl;
}

/**
 * Factory function for mock contacts
 */
function createMockContacts(): ContactApiDTO[] {
  return [
    {
      id: 1,
      tenant_id: 'tenant-1',
      first_name: 'John',
      last_name: 'Doe',
      email: 'john.doe@example.com',
      phone: '+1234567890',
      age: 30,
      gender: 'male',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 2,
      tenant_id: 'tenant-1',
      first_name: 'Jane',
      last_name: 'Smith',
      email: 'jane.smith@example.com',
      phone: '+0987654321',
      age: 28,
      gender: 'female',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];
}

/**
 * Factory function for mock tenants
 */
function createMockTenants(): BackendTenant[] {
  return [
    {
      id: asTenantId('tenant-1'),
      name: 'Test Tenant 1',
      db_url: 'postgres://localhost:5432/tenant1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: asTenantId('tenant-2'),
      name: 'Test Tenant 2',
      db_url: 'postgres://localhost:5432/tenant2',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];
}

/**
 * Mock contacts database
 */
let mockContacts: ContactApiDTO[] = createMockContacts();

/**
 * Mock tenants database
 */
export let mockTenants: BackendTenant[] = createMockTenants();

/**
 * Helper to assert request headers for tenant-scoped operations
 * Returns tenant ID if valid, throws error if headers are missing
 */
function getTenantIdFromHeaders(request: Request): string {
  const tenantId = request.headers.get('x-tenant-id');
  if (!tenantId) {
    throw new Error('Missing required x-tenant-id header');
  }
  return tenantId;
}

/**
 * Helper to assert Authorization header
 * Returns the token value if present, throws error if missing
 */
function getAuthorizationFromHeaders(request: Request): string {
  const auth = request.headers.get('authorization');
  if (!auth) {
    throw new Error('Missing required Authorization header');
  }
  return auth;
}

/**
 * API Request Handlers
 */
export function getHandlers() {
  const API_BASE_URL = getApiBaseUrl();
  return [
    // ============ Authentication ============

    /**
     * POST /auth/login - Login endpoint
     */
    http.post(`${API_BASE_URL}/auth/login`, async ({ request }) => {
      const credentials = (await request.json()) as {
        username_or_email?: string;
        password?: string;
        tenant_id?: string;
      };

      // Simulate validation
      if (!credentials.username_or_email || !credentials.password) {
        return HttpResponse.json(
          {
            message: 'Invalid credentials',
            data: null,
          },
          { status: 400 }
        );
      }

      // Create a valid mock JWT token
      const mockJwt = createMockAuthJwt(
        credentials.username_or_email,
        credentials.tenant_id || 'tenant1'
      );

      // Simulate successful login - backend returns TokenBodyResponse
      return HttpResponse.json(
        {
          message: 'Login successful',
          data: {
            access_token: mockJwt,
            refresh_token: 'mock-refresh-token-67890',
            token_type: 'bearer',
          },
        },
        { status: 200 }
      );
    }),

    /**
     * POST /auth/logout - Logout endpoint
     */
    http.post(`${API_BASE_URL}/auth/logout`, ({ request }) => {
      // Validate required headers for authenticated operation
      try {
        getAuthorizationFromHeaders(request);
        getTenantIdFromHeaders(request);
      } catch (e) {
        return HttpResponse.json({ message: (e as Error).message, data: null }, { status: 401 });
      }

      return HttpResponse.json(
        {
          message: 'Logout successful',
          data: {},
        },
        { status: 200 }
      );
    }),

    /**
     * POST /auth/refresh - Refresh token endpoint
     */
    http.post(`${API_BASE_URL}/auth/refresh`, ({ request }) => {
      // Validate required headers for authenticated operation
      try {
        getAuthorizationFromHeaders(request);
      } catch (e) {
        return HttpResponse.json({ message: (e as Error).message, data: null }, { status: 401 });
      }

      // Create a valid mock JWT token for refresh
      const mockJwt = createMockAuthJwt('refreshed-user', 'tenant1');

      return HttpResponse.json(
        {
          message: 'Token refreshed',
          data: {
            access_token: mockJwt,
            refresh_token: 'mock-new-refresh-token-67890',
            token_type: 'bearer',
          },
        },
        { status: 200 }
      );
    }),

    // ============ Tenants ============

    /**
     * GET /admin/tenants - Get all tenants (with or without pagination support)
     */
    http.get(`${API_BASE_URL}/admin/tenants`, ({ request }) => {
      // Validate required headers for authenticated operation
      try {
        getAuthorizationFromHeaders(request);
      } catch (e) {
        return HttpResponse.json({ message: (e as Error).message, data: null }, { status: 401 });
      }

      const url = new URL(request.url);
      const offset = url.searchParams.get('offset');
      const limit = url.searchParams.get('limit');

      // If pagination parameters are present, return paginated response
      if (offset !== null || limit !== null) {
        const offsetNum = parseInt(offset || '0');
        const limitNum = parseInt(limit || '10');

        // Simple pagination
        const paginatedTenants = mockTenants.slice(offsetNum, offsetNum + limitNum);

        return HttpResponse.json(
          {
            status: 'success',
            message: 'Success',
            data: {
              data: paginatedTenants,
              total: mockTenants.length,
              offset: offsetNum,
              limit: limitNum,
            },
          },
          { status: 200 }
        );
      }

      // Otherwise return simple array for getAll()
      return HttpResponse.json(
        {
          status: 'success',
          message: 'Success',
          data: mockTenants,
        },
        { status: 200 }
      );
    }),

    /**
     * GET /admin/tenants/filter - Filter tenants (MUST be before /:id to match specific path)
     */
    http.get(`${API_BASE_URL}/admin/tenants/filter`, ({ request }) => {
      // Validate required headers for authenticated operation
      try {
        getAuthorizationFromHeaders(request);
      } catch (e) {
        return HttpResponse.json({ message: (e as Error).message, data: null }, { status: 401 });
      }

      try {
        const url = new URL(request.url);
        const cursor = parseInt(url.searchParams.get('cursor') || '0');
        const pageSize = parseInt(url.searchParams.get('page_size') || '10');

        // Parse filters from query parameters (qs.stringify with arrayFormat: 'indices')
        const filters: any[] = [];
        const filterKeys = Array.from(url.searchParams.keys()).filter(key =>
          key.startsWith('filters[')
        );

        // Group filter parameters by index
        const filterGroups: Record<string, any> = {};
        filterKeys.forEach(key => {
          const match = /^filters\[(\d+)\]\[(\w+)\]$/.exec(key);
          if (match) {
            const [, indexStr, field] = match;
            const value = url.searchParams.get(key);
            const index = indexStr!;
            if (!(filterGroups as any)[index]) {
              (filterGroups as any)[index] = {};
            }
            // @ts-expect-error - Dynamic property access
            (filterGroups as any)[index][field] = value;
          }
        });

        // Convert to array
        Object.values(filterGroups).forEach(group => {
          if (group.field && group.operator && group.value !== undefined) {
            filters.push({
              field: group.field,
              operator: group.operator,
              value: group.value,
            });
          }
        });

        let filteredTenants = [...mockTenants];

        // Apply filters
        if (filters.length > 0) {
          filteredTenants = mockTenants.filter(tenant => {
            return filters.every((filter: any) => {
              const { field, operator, value } = filter;
              const tenantValue = (tenant as any)[field];

              switch (operator) {
                case 'eq':
                  return tenantValue === value;
                case 'ne':
                  return tenantValue !== value;
                case 'like':
                  return (
                    typeof tenantValue === 'string' &&
                    tenantValue.toLowerCase().includes(value.toLowerCase())
                  );
                case 'gt':
                  return typeof tenantValue === 'number' && tenantValue > Number(value);
                case 'lt':
                  return typeof tenantValue === 'number' && tenantValue < Number(value);
                default:
                  return true; // Unknown operator, include item
              }
            });
          });
        }

        // Apply cursor-based pagination
        const startIndex = cursor;
        const endIndex = startIndex + pageSize;
        const paginatedTenants = filteredTenants.slice(startIndex, endIndex);

        return HttpResponse.json(
          {
            message: 'Success',
            data: {
              data: paginatedTenants,
              total: filteredTenants.length,
              offset: startIndex,
              limit: pageSize,
            },
          },
          { status: 200 }
        );
      } catch (error) {
        testLogger.error('Filter handler error:', error);
        return HttpResponse.json(
          {
            message: 'Internal server error',
            error: 'Failed to process filter request',
          },
          { status: 500 }
        );
      }
    }),

    /**
     * GET /admin/tenants/:id - Get tenant by ID
     */
    http.get(`${API_BASE_URL}/admin/tenants/:id`, ({ params, request }) => {
      // Validate required headers for authenticated operation
      try {
        getAuthorizationFromHeaders(request);
      } catch (e) {
        return HttpResponse.json({ message: (e as Error).message, data: null }, { status: 401 });
      }

      const { id } = params;
      const tenant = mockTenants.find(t => t.id === id);

      if (!tenant) {
        return HttpResponse.json(
          {
            message: 'Tenant not found',
            data: null,
          },
          { status: 404 }
        );
      }

      return HttpResponse.json(
        {
          message: 'Success',
          data: tenant,
        },
        { status: 200 }
      );
    }),

    /**
     * POST /admin/tenants - Create tenant
     */
    http.post(`${API_BASE_URL}/admin/tenants`, async ({ request }) => {
      // Validate required headers for authenticated operation
      try {
        getAuthorizationFromHeaders(request);
      } catch (e) {
        return HttpResponse.json({ message: (e as Error).message, data: null }, { status: 401 });
      }

      const body = (await request.json()) as Partial<BackendTenant>;

      const newTenant: BackendTenant = {
        id: asTenantId(`tenant-${mockTenants.length + 1}`),
        name: body.name || 'New Tenant',
        db_url: body.db_url || 'postgres://localhost:5432/new_tenant',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockTenants.push(newTenant);

      return HttpResponse.json(
        {
          message: 'Tenant created',
          data: newTenant,
        },
        { status: 201 }
      );
    }),

    /**
     * PUT /admin/tenants/:id - Update tenant
     */
    http.put(`${API_BASE_URL}/admin/tenants/:id`, async ({ params, request }) => {
      // Validate required headers for authenticated operation
      try {
        getAuthorizationFromHeaders(request);
      } catch (e) {
        return HttpResponse.json({ message: (e as Error).message, data: null }, { status: 401 });
      }

      const { id } = params;
      const body = (await request.json()) as Partial<BackendTenant>;
      const tenantIndex = mockTenants.findIndex(t => t.id === id);

      if (tenantIndex === -1) {
        return HttpResponse.json(
          {
            message: 'Tenant not found',
            data: null,
          },
          { status: 404 }
        );
      }

      const existingTenant = mockTenants[tenantIndex];
      if (!existingTenant) {
        return HttpResponse.json(
          {
            message: 'Tenant not found',
            data: null,
          },
          { status: 404 }
        );
      }

      const updatedTenant: BackendTenant = {
        id: existingTenant.id,
        name: body.name ?? existingTenant.name,
        db_url: body.db_url ?? existingTenant.db_url,
        created_at: existingTenant.created_at,
        updated_at: new Date().toISOString(),
      };

      mockTenants[tenantIndex] = updatedTenant;

      return HttpResponse.json(
        {
          message: 'Tenant updated',
          data: mockTenants[tenantIndex],
        },
        { status: 200 }
      );
    }),

    /**
     * DELETE /admin/tenants/:id - Delete tenant
     */
    http.delete(`${API_BASE_URL}/admin/tenants/:id`, ({ params, request }) => {
      // Validate required headers for authenticated operation
      try {
        getAuthorizationFromHeaders(request);
      } catch (e) {
        return HttpResponse.json({ message: (e as Error).message, data: null }, { status: 401 });
      }

      const { id } = params;
      const tenantIndex = mockTenants.findIndex(t => t.id === id);

      if (tenantIndex === -1) {
        return HttpResponse.json(
          {
            message: 'Tenant not found',
            data: null,
          },
          { status: 404 }
        );
      }

      mockTenants.splice(tenantIndex, 1);

      return HttpResponse.json(
        {
          message: 'Tenant deleted',
          data: null,
        },
        { status: 200 }
      );
    }),

    // ============ Contacts / Address Book ============

    /**
     * GET /address-book - Get all contacts (with pagination support)
     */
    http.get(`${API_BASE_URL}/address-book`, ({ request }) => {
      // Validate required headers for authenticated operation
      try {
        getAuthorizationFromHeaders(request);
        getTenantIdFromHeaders(request);
      } catch (e) {
        const status = (e as Error).message.includes('Authorization') ? 401 : 400;
        return HttpResponse.json({ message: (e as Error).message, data: null }, { status });
      }

      const url = new URL(request.url);
      const page = parseInt(url.searchParams.get('page') || '1');
      const limit = parseInt(url.searchParams.get('limit') || '10');
      const search = url.searchParams.get('search');

      // Simple search implementation
      let filteredContacts = mockContacts;
      if (search) {
        filteredContacts = mockContacts.filter(
          contact =>
            (contact.first_name?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
            (contact.last_name?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
            (contact.email?.toLowerCase().includes(search.toLowerCase()) ?? false)
        );
      }

      // Simple pagination
      const offset = (page - 1) * limit;
      const paginatedContacts = filteredContacts.slice(offset, offset + limit);
      const totalPages = Math.ceil(filteredContacts.length / limit);

      return HttpResponse.json(
        {
          message: 'Success',
          data: {
            contacts: paginatedContacts,
            total: filteredContacts.length,
            page,
            limit,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1,
          },
        },
        { status: 200 }
      );
    }),

    /**
     * GET /address-book/:id - Get contact by ID
     */
    http.get(`${API_BASE_URL}/address-book/:id`, ({ params }) => {
      const id = Number(params.id);
      const contact = mockContacts.find(c => c.id === id);

      if (!contact) {
        return HttpResponse.json(
          {
            message: 'Contact not found',
            data: null,
          },
          { status: 404 }
        );
      }

      return HttpResponse.json(
        {
          message: 'Success',
          data: contact,
        },
        { status: 200 }
      );
    }),

    /**
     * POST /address-book - Create contact
     */
    http.post(`${API_BASE_URL}/address-book`, async ({ request }) => {
      const body = (await request.json()) as any;

      // Safely parse name into first and last name parts
      const name =
        body.name && typeof body.name === 'string' && body.name.trim() ? body.name.trim() : '';
      const parts = name ? name.split(/\s+/) : [];
      const first_name = parts[0] || 'Unknown';
      const last_name = parts.slice(1).join(' ') || 'User';

      const newContact = {
        id: Math.max(0, ...mockContacts.map(c => Number(c.id))) + 1,
        tenant_id: 'tenant1', // Mock tenant ID
        first_name,
        last_name,
        email: body.email,
        phone: body.phone,
        age: body.age,
        gender: body.gender,
        address: body.address,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockContacts.push(newContact);

      return HttpResponse.json(
        {
          message: 'Contact created',
          data: newContact,
        },
        { status: 201 }
      );
    }),

    /**
     * PUT /address-book/:id - Update contact
     */
    http.put(`${API_BASE_URL}/address-book/:id`, async ({ params, request }) => {
      const id = Number(params.id);
      const body = (await request.json()) as any; // API request format
      const contactIndex = mockContacts.findIndex(c => c.id === id);

      if (contactIndex === -1) {
        return HttpResponse.json(
          {
            message: 'Contact not found',
            data: null,
          },
          { status: 404 }
        );
      }

      // Convert API request format to ContactApiDTO format
      const updates: Record<string, unknown> = {};
      if (body.name) {
        const nameParts = body.name.split(' ');
        updates.first_name = nameParts[0] || 'Unknown';
        updates.last_name = nameParts.slice(1).join(' ') || 'User';
      }
      if (body.email !== undefined) updates.email = body.email;
      if (body.phone !== undefined) updates.phone = body.phone;
      if (body.age !== undefined) updates.age = body.age;
      if (body.gender !== undefined) updates.gender = body.gender;
      if (body.address !== undefined) updates.address = body.address;

      mockContacts[contactIndex] = {
        ...mockContacts[contactIndex],
        ...updates,
        updated_at: new Date().toISOString(),
      } as ContactApiDTO;

      return HttpResponse.json(
        {
          message: 'Contact updated',
          data: mockContacts[contactIndex],
        },
        { status: 200 }
      );
    }),

    /**
     * DELETE /address-book/:id - Delete contact
     */
    http.delete(`${API_BASE_URL}/address-book/:id`, ({ params }) => {
      const id = Number(params.id);
      const contactIndex = mockContacts.findIndex(c => c.id === id);

      if (contactIndex === -1) {
        return HttpResponse.json(
          {
            message: 'Contact not found',
            data: null,
          },
          { status: 404 }
        );
      }

      mockContacts.splice(contactIndex, 1);

      return HttpResponse.json(
        {
          message: 'Contact deleted',
          data: null,
        },
        { status: 200 }
      );
    }),

    // ============ Health Check ============

    /**
     * GET /health - Health check endpoint
     */
    http.get(`${API_BASE_URL}/health`, () => {
      return HttpResponse.json(
        {
          message: 'Service is healthy',
          data: {
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: 123456,
          },
        },
        { status: 200 }
      );
    }),

    /**
     * GET /ping - Simple ping endpoint
     */
    http.get(`${API_BASE_URL}/ping`, () => {
      return HttpResponse.json(
        {
          message: 'pong',
          data: { timestamp: new Date().toISOString() },
        },
        { status: 200 }
      );
    }),
  ];
}

/**
 * Reset mock databases to initial state
 * Useful for cleaning up between tests
 */
export function resetMockData(): void {
  mockContacts = createMockContacts();
  mockTenants = createMockTenants();
}
