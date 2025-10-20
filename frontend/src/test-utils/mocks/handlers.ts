/**
 * Mock API Handlers using MSW (Mock Service Worker)
 *
 * This file defines mock HTTP handlers for all API endpoints.
 * These handlers intercept API calls during tests and return mock responses.
 */

import { http, HttpResponse } from 'msw';
import type { _LoginCredentials, _AuthResponse } from '../../types/auth';
import { mockUser, mockTenant } from '../render';
import type { Tenant as BackendTenant } from '../../types/tenant';
import type { ContactApiDTO } from '../../transformers/dto';
import { asTenantId } from '../../types/ids';
import { createMockAuthJwt } from '../jwt';
import { testLogger } from '../logger';

/**
 * Request interfaces for type safety in mock handlers
 */
interface ContactRequestBase {
  readonly name?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly age?: number;
  readonly gender?: string;
  readonly address?: string;
}

export type CreateContactRequest = ContactRequestBase;
export type UpdateContactRequest = ContactRequestBase;

// Get API base URL from environment (delay until runtime to ensure env vars are loaded)
import { getEnv } from '../../config/env';

/**
 * Custom error classes for better error handling
 */
export class HttpError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class AuthError extends HttpError {
  constructor(message: string, statusCode = 401) {
    super(message, statusCode);
    this.name = 'AuthError';
  }
}

// Create a function to get the base URL at runtime instead of module load time
function getApiBaseUrl(): string {
  // In tests, prioritize process.env which Bun loads from .env files
  // Fall back to import.meta.env for browser/build time
  const apiUrl =
    (typeof process !== 'undefined' && process.env ? process.env.VITE_API_URL : undefined) || 
    import.meta.env?.VITE_API_URL || 
    'http://localhost:8000/api';

  return apiUrl;
}

/**
 * Interface for filter group parsed from query parameters
 */
interface FilterGroup {
  field?: string;
  operator?: string;
  value?: string;
}

/**
 * Type-safe parsed filter with validated field and operator
 */
interface ParsedFilter {
  field: keyof BackendTenant;
  operator: Operator;
  value: string;
}

/**
 * Allowed filter operators
 */
type Operator = 'eq' | 'ne' | 'like' | 'gt' | 'lt';

/**
 * Valid tenant field names that can be filtered
 */
type TenantFilterField = keyof BackendTenant;

/**
 * Type guard to validate if a filter group can be converted to a ParsedFilter
 */
function isValidFilterGroup(group: FilterGroup): group is FilterGroup & {
  field: string;
  operator: string;
  value: string;
} {
  return !!(group.field && group.operator && group.value !== undefined);
}

/**
 * Type guard to validate if a field is a valid tenant field
 *
 * IMPORTANT: The validFields array below must be kept in sync with the keys of the BackendTenant type.
 * BackendTenant is defined as `Tenant` in src/types/tenant.ts (lines 3-9).
 * If the Tenant interface changes, this array must be updated accordingly.
 */
function isValidTenantField(field: string): field is TenantFilterField {
  const validFields: TenantFilterField[] = ['id', 'name', 'db_url', 'created_at', 'updated_at'];
  return validFields.includes(field as TenantFilterField);
}

/**
 * Type guard to validate if an operator is a valid operator
 */
function isValidOperator(operator: string): operator is Operator {
  const validOperators: Operator[] = ['eq', 'ne', 'like', 'gt', 'lt'];
  return validOperators.includes(operator as Operator);
}

/**
 * Parse and validate a filter group into a ParsedFilter
 * Returns null if the filter is invalid
 */
function parseFilterGroup(group: FilterGroup): ParsedFilter | null {
  if (!isValidFilterGroup(group)) {
    return null;
  }

  if (!isValidTenantField(group.field)) {
    testLogger.warn(`Invalid tenant field in filter: "${group.field}"`);
    return null;
  }

  if (!isValidOperator(group.operator)) {
    testLogger.warn(`Invalid filter operator: "${group.operator}"`);
    return null;
  }

  return {
    field: group.field,
    operator: group.operator,
    value: group.value,
  };
}

/**
 * Factory function for mock contacts
 */
function createMockContacts(baseDate: Date | string = '2024-01-15T10:30:00.000Z'): ContactApiDTO[] {
  const timestamp = new Date(baseDate).toISOString();

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
      created_at: timestamp,
      updated_at: timestamp,
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
      created_at: timestamp,
      updated_at: timestamp,
    },
  ];
}

/**
 * Factory function for mock tenants
 */
function createMockTenants(baseDate: Date | string = '2024-01-15T10:30:00.000Z'): BackendTenant[] {
  const timestamp = new Date(baseDate).toISOString();

  return [
    {
      id: asTenantId('tenant-1'),
      name: 'Test Tenant 1',
      db_url: 'postgres://localhost:5432/tenant-1',
      created_at: timestamp,
      updated_at: timestamp,
    },
    {
      id: asTenantId('tenant-2'),
      name: 'Test Tenant 2',
      db_url: 'postgres://localhost:5432/tenant2',
      created_at: timestamp,
      updated_at: timestamp,
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
    throw new HttpError('Missing required x-tenant-id header', 400);
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
    throw new AuthError('Missing required Authorization header', 401);
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
        credentials.tenant_id || 'tenant-1'
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
      const mockJwt = createMockAuthJwt('refreshed-user', 'tenant-1');

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
        const filters: ParsedFilter[] = [];
        const filterKeys = Array.from(url.searchParams.keys()).filter(key =>
          key.startsWith('filters[')
        );

        // Group filter parameters by index
        const filterGroups: Record<string, FilterGroup> = {};
        filterKeys.forEach(key => {
          const match = /^filters\[(\d+)\]\[(\w+)\]$/.exec(key);
          if (match) {
            const [, indexStr, field] = match;
            const value = url.searchParams.get(key);
            const index = indexStr;
            if (index && field) {
              if (!filterGroups[index]) {
                filterGroups[index] = {};
              }
              filterGroups[index][field as keyof FilterGroup] = value || undefined;
            }
          }
        });

        // Convert to array with type-safe validation
        Object.values(filterGroups).forEach(group => {
          const parsedFilter = parseFilterGroup(group);
          if (parsedFilter) {
            filters.push(parsedFilter);
          }
        });

        let filteredTenants = [...mockTenants];

        // Apply filters
        if (filters.length > 0) {
          filteredTenants = mockTenants.filter(tenant => {
            return filters.every((filter: ParsedFilter) => {
              const { field, operator, value } = filter;
              const tenantValue = tenant[field];

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
                  // This should never happen due to type guards, but keeping for safety
                  throw new Error(
                    `Invalid filter operator in mock handler: "${operator}" for field "${field}" with value "${value}". ` +
                      `Supported operators: eq, ne, like, gt, lt`
                  );
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

      const existingTenant = mockTenants[tenantIndex]!;

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
        const status = e instanceof HttpError ? e.statusCode : 500;
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

    http.get(`${API_BASE_URL}/address-book/:id`, ({ params, request }) => {
      // Validate required headers for authenticated operation
      try {
        getAuthorizationFromHeaders(request);
        getTenantIdFromHeaders(request);
      } catch (e) {
        const status = e instanceof HttpError ? e.statusCode : 500;
        return HttpResponse.json({ message: (e as Error).message, data: null }, { status });
      }

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
      const body = (await request.json()) as CreateContactRequest;

      // Safely parse name into first and last name parts
      const name = body.name?.trim() ?? '';
      const parts = name.split(/\s+/).filter(part => part.length > 0);
      const first_name = parts[0] ?? 'Unknown';
      const last_name = parts.slice(1).join(' ') ?? 'User';

      const newContact = {
        id: Math.max(0, ...mockContacts.map(c => Number(c.id)).filter(id => !isNaN(id))) + 1,
        tenant_id: 'tenant-1', // Mock tenant ID
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
      const body = (await request.json()) as UpdateContactRequest;
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

      // Convert API request format to ContactApiDTO format using typed body
      const updates: Record<string, unknown> = {};
      if (body.name) {
        const name = body.name.trim() ?? '';
        const parts = name.split(/\s+/).filter(part => part.length > 0);
        updates.first_name = parts[0] ?? 'Unknown';
        updates.last_name = parts.slice(1).join(' ') ?? 'User';
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
    http.delete(`${API_BASE_URL}/address-book/:id`, ({ params, request }) => {
      // Validate required headers for authenticated operation
      try {
        getAuthorizationFromHeaders(request);
        getTenantIdFromHeaders(request);
      } catch (e) {
        const status = e instanceof HttpError ? e.statusCode : 500;
        return HttpResponse.json({ message: (e as Error).message, data: null }, { status });
      }

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

/**
 * Runtime validation to ensure tenant filter fields match BackendTenant keys
 * This will throw an error if the hardcoded validFields array doesn't match
 * the actual keys of the BackendTenant type.
 */
function validateTenantFilterFieldsSync(): void {
  const validFields: TenantFilterField[] = ['id', 'name', 'db_url', 'created_at', 'updated_at'];
  const backendTenantKeys: (keyof BackendTenant)[] = [
    'id',
    'name',
    'db_url',
    'created_at',
    'updated_at',
  ];

  // Check that all valid fields are present in BackendTenant
  for (const field of validFields) {
    if (!backendTenantKeys.includes(field)) {
      throw new Error(`Field '${field}' is not a valid BackendTenant key`);
    }
  }

  // Check that all BackendTenant keys are present in valid fields
  for (const key of backendTenantKeys) {
    if (!validFields.includes(key)) {
      throw new Error(`BackendTenant key '${key}' is missing from validFields array`);
    }
  }
}

// Run validation on module load to catch mismatches early
validateTenantFilterFieldsSync();
