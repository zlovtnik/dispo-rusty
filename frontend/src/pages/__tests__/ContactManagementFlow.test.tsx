import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { screen, waitFor, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithAuth, renderWithoutAuth } from '../../test-utils/render';
import { LoginPage } from '../../pages/LoginPage';
import { AddressBookPage } from '../../pages/AddressBookPage';
import { asContactId, asTenantId, asUserId } from '../../types/ids';
import type { Contact } from '../../types/contact';
import type { Gender } from '../../types/person';
import type { Address } from '../../types/contact';
import { createMockAuthJwt } from '../../test-utils/jwt';
import { decodeJwtPayload } from '../../utils/parsing';
import { mockUser, mockTenant } from '../../test-utils/render';

// Test environment variables are set via vitest globals
// VITE_API_URL defaults to API_URL constant
// VITE_DEFAULT_COUNTRY defaults to empty string

// Multi-tenant mock stores
// Use mockTenant.id (tenant-1) as the primary tenant to match the shared fixture
// Stable ID generator to avoid duplicate IDs after deletions
let nextContactId = 1000;

const tenantContacts: Record<string, Contact[]> = {
  'tenant-1': [
    {
      id: asContactId('101'),
      tenantId: mockTenant.id,
      firstName: 'John',
      lastName: 'Doe',
      fullName: 'John Doe',
      email: 'john@t1.example.com',
      phone: '555-0100',
      mobile: '555-0100',
      gender: 'male',
      address: {
        street1: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        zipCode: '62701',
        country: 'USA',
      },
      createdAt: new Date('2025-01-01T00:00:00Z'),
      updatedAt: new Date('2025-01-01T00:00:00Z'),
      createdBy: asUserId('user1'),
      updatedBy: asUserId('user1'),
      isActive: true,
    },
  ],
  'tenant-2': [
    {
      id: asContactId('1'),
      tenantId: asTenantId('tenant-2'),
      firstName: 'Alice',
      lastName: 'Jones',
      fullName: 'Alice Jones',
      email: 'alice@t2.example.com',
      phone: '555-0200',
      mobile: '555-0200',
      gender: 'female',
      address: {
        street1: '789 Pine Rd',
        city: 'Metropolis',
        state: 'NY',
        zipCode: '10001',
        country: 'USA',
      },
      createdAt: new Date('2025-01-01T00:00:00Z'),
      updatedAt: new Date('2025-01-01T00:00:00Z'),
      createdBy: asUserId('user2'),
      updatedBy: asUserId('user2'),
      isActive: true,
    },
  ],
};

// Simple session token store to simulate expiration/refresh
let currentToken: string | null = null;
let refreshTokenValid = true;

const server = setupServer(
  // Auth login endpoint
  http.post('/api/auth/login', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    // Accept any credentials for testing; include tenant_id if provided
    // Default to tenant-1 to match mockTenant fixture
    const tenantId = (body.tenantId as string) ?? 'tenant-1';
    const jwt = createMockAuthJwt((body.username as string) ?? 'test', tenantId);
    currentToken = jwt;
    refreshTokenValid = true;
    return HttpResponse.json({
      success: true,
      message: 'Logged in',
      data: {
        token: jwt,
        user: { ...mockUser, tenantId: asTenantId(tenantId) },
        tenant: { ...mockTenant, id: asTenantId(tenantId) },
      },
    });
  }),

  // Refresh token
  http.post('/api/auth/refresh', async () => {
    if (!refreshTokenValid) {
      return HttpResponse.json(
        { success: false, message: 'Refresh token expired' },
        { status: 401 }
      );
    }

    // Decode current token to extract tenant_id, fallback to mockTenant.id
    let tenantId = mockTenant.id;
    if (currentToken) {
      const decodeResult = decodeJwtPayload(currentToken);
      if (decodeResult.isOk()) {
        tenantId = asTenantId(decodeResult.value.tenant_id);
      }
    }

    const jwt = createMockAuthJwt('test', tenantId);
    currentToken = jwt;
    return HttpResponse.json({
      success: true,
      message: 'Token refreshed',
      data: {
        token: jwt,
        user: { ...mockUser, tenantId },
        tenant: { ...mockTenant, id: tenantId },
      },
    });
  }),

  // Get contacts per tenant
  http.get('/api/address-book', ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !currentToken) {
      return HttpResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    const tenantId = request.headers.get('x-tenant-id') || 'tenant-1';
    const contacts = tenantContacts[tenantId] || [];
    return HttpResponse.json({ success: true, message: 'Contacts retrieved', data: { contacts } });
  }),

  // Create contact
  http.post('/api/address-book', async ({ request }) => {
    const tenantId = request.headers.get('x-tenant-id') || 'tenant-1';
    const body = (await request.json()) as Record<string, any>;
    // simulate server-side validation error
    if (!body.firstName) {
      return HttpResponse.json(
        { success: false, message: 'First name required', errors: { firstName: 'required' } },
        { status: 400 }
      );
    }
    const arr = (tenantContacts[tenantId] ||= []);
    const newContact: Contact = {
      id: asContactId(String(++nextContactId)),
      tenantId: asTenantId(tenantId),
      firstName: body.firstName,
      lastName: body.lastName || '',
      fullName: `${body.firstName} ${body.lastName || ''}`.trim(),
      email: body.email || '',
      phone: body.phone || '',
      mobile: body.mobile || '',
      gender: body.gender || 'male',
      address: body.address || { street1: '', city: '', state: '', zipCode: '', country: '' },
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: asUserId('test'),
      updatedBy: asUserId('test'),
      isActive: true,
    };
    arr.push(newContact);
    return HttpResponse.json({ success: true, message: 'Contact created', data: newContact });
  }),

  // Update contact
  http.put('/api/address-book/:id', async ({ request, params }) => {
    const tenantId = request.headers.get('x-tenant-id') || 'tenant-1';
    const id = params.id;
    const arr = tenantContacts[tenantId] || [];
    const body = (await request.json()) as Record<string, unknown>;

    // Validate required fields
    if (body.firstName !== undefined && (body.firstName === null || body.firstName === '' || body.firstName === false)) {
      return HttpResponse.json({ success: false, message: 'First name required' }, { status: 400 });
    }

    const idx = arr.findIndex(c => c.id === id);
    if (idx === -1)
      return HttpResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    
    const existingContact = arr[idx];
    if (!existingContact) {
      return HttpResponse.json({ success: false, message: 'Contact not found' }, { status: 404 });
    }
    
    // Only update allowed fields
    arr[idx] = {
      ...existingContact,
      firstName: (body.firstName as string) ?? existingContact.firstName,
      lastName: (body.lastName as string) ?? existingContact.lastName,
      // ... other safe fields
      updatedAt: new Date(),
    } as Contact;
    return HttpResponse.json({ success: true, message: 'Contact updated', data: arr[idx] });
  }),

  // Delete contact
  http.delete('/api/address-book/:id', ({ request, params }) => {
    const tenantId = request.headers.get('x-tenant-id') || 'tenant-1';
    const arr = tenantContacts[tenantId] || [];
    const idx = arr.findIndex(c => c.id === params.id);
    if (idx === -1)
      return HttpResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    arr.splice(idx, 1);
    return HttpResponse.json({ success: true, message: 'Contact deleted' });
  }),

  // Tenants list
  http.get('/api/tenants', () => {
    return HttpResponse.json({
      success: true,
      message: 'Tenants',
      data: [
        { id: 'tenant-1', name: 'Tenant One' },
        { id: 'tenant-2', name: 'Tenant Two' },
      ],
    });
  })
);

// Common test helpers
const createAuthToken = (username = 'test', tenantId = 'tenant-1'): string => {
  return createMockAuthJwt(username, tenantId);
};

const setupAuthenticatedState = (tenantId = 'tenant-1'): void => {
  const token = createAuthToken('testuser', tenantId);
  localStorage.setItem('auth_token', JSON.stringify({ token }));
  localStorage.setItem('user', JSON.stringify({ ...mockUser, tenantId: asTenantId(tenantId) }));
  localStorage.setItem('tenant', JSON.stringify({ ...mockTenant, id: asTenantId(tenantId) }));
};

const resetTokenState = (): void => {
  currentToken = null;
  refreshTokenValid = true;
};

// Shared helper for authorization and tenant validation
const validateAuthAndGetTenantContacts = (request: Request, tenantId: string) => {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !currentToken) {
    return {
      error: HttpResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }),
    };
  }
  return { contacts: tenantContacts[tenantId] || [] };
};

const createContactCRUDHandlers = (tenantId = 'tenant-1') => {
  return [
    http.get('/api/address-book', ({ request }) => {
      const authResult = validateAuthAndGetTenantContacts(request, tenantId);
      if (authResult.error) return authResult.error;

      const contacts = authResult.contacts;
      return HttpResponse.json({
        success: true,
        message: 'Contacts retrieved',
        data: { contacts },
      });
    }),
    http.post('/api/address-book', async ({ request }) => {
      const authResult = validateAuthAndGetTenantContacts(request, tenantId);
      if (authResult.error) return authResult.error;

      const body = (await request.json()) as Record<string, unknown>;
      if (!body.firstName || body.firstName === null || body.firstName === '') {
        return HttpResponse.json(
          { success: false, message: 'First name required', errors: { firstName: 'required' } },
          { status: 400 }
        );
      }
      const arr = (tenantContacts[tenantId] ||= []);
      const newContact: Contact = {
        id: asContactId(String(++nextContactId)),
        tenantId: asTenantId(tenantId),
        firstName: body.firstName as string,
        lastName: (body.lastName as string) ?? '',
        fullName: `${body.firstName as string} ${(body.lastName as string) ?? ''}`.trim(),
        email: (body.email as string) ?? '',
        phone: (body.phone as string) ?? '',
        mobile: (body.mobile as string) ?? '',
        gender: ((body.gender as string) ?? 'male') as Gender,
        address: (body.address as Address) ?? { street1: '', city: '', state: '', zipCode: '', country: '' },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: asUserId('test'),
        updatedBy: asUserId('test'),
        isActive: true,
      };
      arr.push(newContact);
      return HttpResponse.json({ success: true, message: 'Contact created', data: newContact });
    }),
    http.put('/api/address-book/:id', async ({ request, params }) => {
      const authResult = validateAuthAndGetTenantContacts(request, tenantId);
      if (authResult.error) return authResult.error;

      const id = params.id;
      const arr = authResult.contacts;
      const body = (await request.json()) as Record<string, unknown>;

      if (body.firstName !== undefined && (body.firstName === null || body.firstName === '' || body.firstName === false)) {
        return HttpResponse.json(
          { success: false, message: 'First name required' },
          { status: 400 }
        );
      }

      const idx = arr.findIndex(c => c.id === id);
      if (idx === -1)
        return HttpResponse.json({ success: false, message: 'Not found' }, { status: 404 });
      const existingContact = arr[idx];
      if (!existingContact) {
        return HttpResponse.json({ success: false, message: 'Contact not found' }, { status: 404 });
      }
      const updatedContact: Contact = {
        ...existingContact,
        firstName: typeof body.firstName === 'string' ? body.firstName : existingContact.firstName,
        lastName: typeof body.lastName === 'string' ? body.lastName : existingContact.lastName,
        updatedAt: new Date(),
      } as Contact;
      arr[idx] = updatedContact;
      return HttpResponse.json({ success: true, message: 'Contact updated', data: arr[idx] });
    }),
    http.delete('/api/address-book/:id', ({ request, params }) => {
      const authResult = validateAuthAndGetTenantContacts(request, tenantId);
      if (authResult.error) return authResult.error;

      const arr = authResult.contacts;
      const idx = arr.findIndex(c => c.id === params.id);
      if (idx === -1)
        return HttpResponse.json({ success: false, message: 'Not found' }, { status: 404 });
      arr.splice(idx, 1);
      return HttpResponse.json({ success: true, message: 'Contact deleted' });
    }),
  ];
};

describe('Contact Management Flow - Integration', () => {
  beforeEach(() => {
    localStorage.clear();
    server.listen();
    resetTokenState();
  });
  afterEach(() => {
    server.resetHandlers();
    server.close();
  });

  describe('Login + Initial Contacts', () => {
    it('should handle login flow and load initial tenant contacts', async () => {
      const user = userEvent.setup();

      // Login flow
      renderWithoutAuth(<LoginPage />);

      const username = screen.getByPlaceholderText(/username|email/i);
      const password = screen.getByPlaceholderText(/password/i);

      await user.type(username, 'testuser');
      await user.type(password, 'password');

      const loginButton = screen.getByRole('button', { name: /sign in/i });
      await user.click(loginButton);

      // Wait for login to complete
      await waitFor(() => {
        const storedAuth = localStorage.getItem('auth_token');
        expect(storedAuth).toBeTruthy();
      });

      // After login completes, render AddressBookPage
      cleanup();
      renderWithAuth(<AddressBookPage />);

      // Verify tenant-1 contacts are shown (John)
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });
    });
  });

  describe('Contact CRUD Operations', () => {
    it('should handle create, edit, and delete contact operations', async () => {
      const user = userEvent.setup();

      // Set up authenticated state
      setupAuthenticatedState('tenant-1');

      // Use CRUD handlers for tenant-1
      server.use(...createContactCRUDHandlers('tenant-1'));

      renderWithAuth(<AddressBookPage />);

      // Verify initial contact is shown
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Create new contact with missing firstName -> expect backend validation error
      const addButton = screen.getByRole('button', { name: /add contact/i });
      await user.click(addButton);

      const dialog = await screen.findByRole('dialog');
      const modal = within(dialog);

      const emailInput = modal.getByLabelText(/email/i);
      await user.type(emailInput, 'new@t1.example.com');

      const submit = modal.getByRole('button', { name: /add contact/i });
      await user.click(submit);

      await waitFor(() => {
        expect(screen.getByText(/please enter first name/i)).toBeInTheDocument();
      });

      // Fill valid data and create
      const firstNameInput = modal.getByLabelText(/first name/i);
      const lastNameInput = modal.getByLabelText(/last name/i);
      await user.type(firstNameInput, 'Bob');
      await user.type(lastNameInput, 'Builder');
      await user.click(submit);

      // Verify created contact appears
      await waitFor(() => {
        expect(screen.getByText('Bob Builder')).toBeInTheDocument();
      });

      // Edit the contact - find Bob Builder's edit button by looking for the one in the row containing "Bob Builder"
      const editButtons = screen.getAllByRole('button', { name: /edit/i });
      const bobEditButton = editButtons.find(button => {
        const row = button.closest('tr');
        return row?.textContent.includes('Bob Builder') ?? false;
      });
      expect(bobEditButton).toBeTruthy();
      if (bobEditButton) {
        await user.click(bobEditButton);
      }

      const editFirstNameInput = await screen.findByDisplayValue('Bob');
      await user.clear(editFirstNameInput);
      await user.type(editFirstNameInput, 'Bobby');

      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('Bobby Builder')).toBeInTheDocument();
      });

      // Delete the contact
      const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
      const bobbyDeleteButton = deleteButtons.find(button =>
        button.closest('[data-testid="contact-row"]')?.textContent?.includes('Bobby Builder')
      );
      expect(bobbyDeleteButton).toBeTruthy();
      if (bobbyDeleteButton) {
        await user.click(bobbyDeleteButton);
      }

      const confirmDelete = screen.getByRole('button', { name: /confirm|yes|delete/i });
      await user.click(confirmDelete);

      await waitFor(() => {
        expect(screen.queryByText('Bobby Builder')).not.toBeInTheDocument();
      });
    });
  });

  describe('Tenant Switching', () => {
    it('should handle switching between tenants and display tenant-specific contacts', async () => {
      const user = userEvent.setup();

      // Start with tenant-1
      setupAuthenticatedState('tenant-1');
      server.use(...createContactCRUDHandlers('tenant-1'));

      renderWithAuth(<AddressBookPage />);

      // Verify tenant-1 contacts are displayed
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Switch to tenant-2 by logging in as different tenant
      cleanup();
      renderWithoutAuth(<LoginPage />);

      const tenant2UsernameInput = screen.getByLabelText(/username/i);
      const tenant2PasswordInput = screen.getByLabelText(/password/i);
      const tenant2TenantIdInput = screen.getByLabelText(/tenant.*id/i);
      const tenant2LoginButton = screen.getByRole('button', { name: /log in/i });

      await user.type(tenant2UsernameInput, 'tenant2user');
      await user.type(tenant2PasswordInput, 'password123');
      await user.type(tenant2TenantIdInput, 'tenant-2');
      await user.click(tenant2LoginButton);

      // Wait for tenant-2 login to complete
      await waitFor(() => {
        const storedTenant = localStorage.getItem('tenant');
        if (storedTenant) {
          const tenant = JSON.parse(storedTenant) as { id: string };
          expect(tenant.id).toBe('tenant-2');
        }
      });

      // Render AddressBookPage for tenant-2
      renderWithAuth(<AddressBookPage />, {
        authValue: {
          tenant: { ...mockTenant, id: asTenantId('tenant-2'), name: 'Tenant Two' },
          user: { ...mockUser, tenantId: asTenantId('tenant-2') },
        },
      });

      // Verify tenant-2 contacts are displayed
      await waitFor(() => {
        expect(screen.getByText('Alice Jones')).toBeInTheDocument();
      });
    });
  });

  describe('Token Refresh', () => {
    it('should handle session expiration and successful token refresh', async () => {
      // Set up initial authenticated state
      setupAuthenticatedState('tenant-2');

      // Mock endpoints to track calls
      let refreshCallCount = 0;

      server.use(
        http.get('/api/address-book', ({ request }) => {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader) {
            return HttpResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
          }
          const tenantId = request.headers.get('x-tenant-id') || 'tenant-2';
          const contacts = tenantContacts[tenantId] || [];
          return HttpResponse.json({
            success: true,
            message: 'Contacts retrieved',
            data: { contacts },
          });
        }),
        http.post('/api/auth/refresh', async () => {
          refreshCallCount++;
          if (!refreshTokenValid) {
            return HttpResponse.json(
              { success: false, message: 'Refresh token expired' },
              { status: 401 }
            );
          }
          const jwt = createMockAuthJwt('testuser', 'tenant-2');
          currentToken = jwt;
          return HttpResponse.json({
            success: true,
            message: 'Token refreshed',
            data: {
              token: jwt,
              user: { ...mockUser, tenantId: asTenantId('tenant-2') },
              tenant: { ...mockTenant, id: asTenantId('tenant-2') },
            },
          });
        })
      );

      renderWithAuth(<AddressBookPage />, {
        authValue: {
          tenant: { ...mockTenant, id: asTenantId('tenant-2') },
        },
      });

      // Wait for the refresh to complete and contacts to load
      await waitFor(() => {
        expect(screen.getByText('Alice Jones')).toBeInTheDocument();
      });

      // Assert that refresh was called
      expect(refreshCallCount).toBe(1);

      // Assert that a new token was saved to localStorage
      const storedAuth = JSON.parse(localStorage.getItem('auth_token') ?? '{}') as { token: string };
      expect(storedAuth.token).toBeDefined();
      expect(typeof storedAuth.token).toBe('string');

      // Assert that the UI displays the expected address book data after successful refresh
      expect(screen.getByText('Alice Jones')).toBeInTheDocument();
      expect(screen.getByText('alice@t2.example.com')).toBeInTheDocument();
    });

    it('should handle session expiration with failed refresh', async () => {
      // Set up initial authenticated state
      setupAuthenticatedState('tenant-1');

      renderWithAuth(<AddressBookPage />);

      // Verify initial state
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Simulate session expiration
      localStorage.removeItem('auth_token');
      refreshTokenValid = false; // Refresh will fail

      // Mock endpoints to track calls
      let addressBookCallCount = 0;
      let refreshCallCount = 0;

      server.use(
        http.get('/api/address-book', ({ request }) => {
          addressBookCallCount++;
          const authHeader = request.headers.get('Authorization');
          if (!authHeader) {
            return HttpResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
          }
          const tenantId = request.headers.get('x-tenant-id') || 'tenant-1';
          const contacts = tenantContacts[tenantId] || [];
          return HttpResponse.json({
            success: true,
            message: 'Contacts retrieved',
            data: { contacts },
          });
        }),
        http.post('/api/auth/refresh', async () => {
          refreshCallCount++;
          return HttpResponse.json(
            { success: false, message: 'Refresh token expired' },
            { status: 401 }
          );
        })
      );

      // Trigger API call by re-rendering
      cleanup();
      renderWithAuth(<AddressBookPage />);

      // Wait for redirect to login (assuming the app redirects on auth failure)
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
      });

      // Assert that refresh was attempted
      expect(refreshCallCount).toBe(1);

      // Assert that no new token was saved
      expect(localStorage.getItem('auth_token')).toBeNull();

      // Assert that the address book API was called once (failed, no retry)
      expect(addressBookCallCount).toBe(1);
    });
  });
});
