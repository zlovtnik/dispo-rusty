/**
 * Contact Management Flow Integration Tests
 *
 * Tests complete contact CRUD workflows and multi-tenant data isolation
 *
 * @group integration
 * @category contacts
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { renderWithAuth, mockUser, mockTenant, screen, waitFor, userEvent } from '../../test-utils';
import { server, resetMSW } from '../../test-utils/mocks/server';
import { http, HttpResponse } from 'msw';
import { AddressBookPage } from '../../pages/AddressBookPage';
import { asTenantId } from '../../types/ids';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

interface MockContact {
  id: number;
  tenant_id: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  age?: number | null;
  gender?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Contact CRUD Flow: Create Contact
 *
 * Scenario: User fills out contact form, submits, and sees contact in list
 */
describe.skip('Contact CRUD Flow: Create Contact', () => {
  let mockContacts: MockContact[] = [];

  beforeEach(() => {
    resetMSW();
    mockContacts = [];

    server.use(
      http.get(`${API_URL}/address-book`, () =>
        HttpResponse.json({
          success: true,
          data: {
            contacts: mockContacts,
            total: mockContacts.length,
            page: 1,
            limit: 10,
            totalPages: 1,
            hasNext: false,
            hasPrev: false,
          },
        })
      ),
      http.post(`${API_URL}/address-book`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;

        const newContact: MockContact = {
          id: mockContacts.length + 1,
          tenant_id: mockTenant.id,
          first_name: (body.first_name as string) || '',
          last_name: (body.last_name as string) || '',
          email: (body.email as string) || null,
          phone: null,
          age: null,
          gender: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        mockContacts.push(newContact);

        return HttpResponse.json({
          success: true,
          data: {
            contacts: [newContact],
          },
        });
      })
    );
  });

  afterEach(() => {
    resetMSW();
  });

  test('Create button is rendered', async () => {
    renderWithAuth(<AddressBookPage />);

    const createBtn = await screen.findByRole('button', { name: /new|create|add/i });
    expect(createBtn).toBeInTheDocument();
  });

  test('Form validation prevents empty submission', async () => {
    renderWithAuth(<AddressBookPage />);

    const createBtn = await screen.findByRole('button', { name: /new|create|add/i });
    await userEvent.click(createBtn);

    const submitBtn = await screen.findByRole('button', { name: /save|submit/i });
    await userEvent.click(submitBtn);

    // Should show validation error
    const error = await screen.findByText(/required|invalid/i);
    expect(error).toBeInTheDocument();
  });

  test('API error on create shows message', async () => {
    server.use(
      http.post(`${API_URL}/address-book`, () =>
        HttpResponse.json({ success: false, message: 'Validation error' }, { status: 400 })
      )
    );

    renderWithAuth(<AddressBookPage />);

    const createBtn = await screen.findByRole('button', { name: /new|create|add/i });
    await userEvent.click(createBtn);

    const firstNameInput = await screen.findByLabelText(/first.*name/i);
    const lastNameInput = await screen.findByLabelText(/last.*name/i);
    const emailInput = await screen.findByLabelText(/email/i);
    const submitBtn = await screen.findByRole('button', { name: /save|submit/i });

    await userEvent.type(firstNameInput, 'John');
    await userEvent.type(lastNameInput, 'Doe');
    await userEvent.type(emailInput, 'duplicate@example.com');
    await userEvent.click(submitBtn);

    // Should show API error message inside the alert
    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/Validation error/i);
  });
});

/**
 * Contact CRUD Flow: Edit Contact
 *
 * Scenario: User selects contact, modifies details, saves changes
 */
describe.skip('Contact CRUD Flow: Edit Contact', () => {
  let mockContacts: MockContact[] = [];

  beforeEach(() => {
    resetMSW();
    mockContacts = [
      {
        id: 1,
        tenant_id: mockTenant.id,
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone: null,
        age: null,
        gender: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    server.use(
      http.get(`${API_URL}/address-book`, () =>
        HttpResponse.json({
          success: true,
          data: {
            contacts: mockContacts,
            total: mockContacts.length,
            page: 1,
            limit: 10,
            totalPages: 1,
            hasNext: false,
            hasPrev: false,
          },
        })
      ),
      http.get(`${API_URL}/address-book/1`, () =>
        HttpResponse.json({ success: true, data: mockContacts[0] })
      ),
      http.put(`${API_URL}/address-book/1`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;

        if (mockContacts[0]) {
          mockContacts[0].first_name = (body.first_name as string) || mockContacts[0].first_name;
          mockContacts[0].last_name = (body.last_name as string) || mockContacts[0].last_name;
          mockContacts[0].updated_at = new Date().toISOString();
        }

        return HttpResponse.json({ success: true, data: mockContacts[0] });
      })
    );
  });

  afterEach(() => {
    resetMSW();
  });

  test('User can edit existing contact', async () => {
    renderWithAuth(<AddressBookPage />);

    // Wait for contacts to load
    expect(await screen.findByText('John Doe')).toBeInTheDocument();

    // Find and click edit button for John Doe
    const editBtn = screen.getByRole('button', { name: /edit/i });
    await userEvent.click(editBtn);

    // Verify form is populated with existing data
    const firstNameInput = screen.getByLabelText(/first.*name/i);
    const lastNameInput = screen.getByLabelText(/last.*name/i);

    expect((firstNameInput as HTMLInputElement).value).toBe('John');
    expect((lastNameInput as HTMLInputElement).value).toBe('Doe');
  });

  test('User can save contact changes', async () => {
    renderWithAuth(<AddressBookPage />);

    // Wait for contacts to load
    expect(await screen.findByText('John Doe')).toBeInTheDocument();

    // Find and click edit button
    const editBtn = screen.getByRole('button', { name: /edit/i });
    await userEvent.click(editBtn);

    // Modify contact details
    const firstNameInput = screen.getByLabelText(/first.*name/i);
    const lastNameInput = screen.getByLabelText(/last.*name/i);
    const saveBtn = screen.getByRole('button', { name: /save|submit/i });

    await userEvent.clear(firstNameInput);
    await userEvent.type(firstNameInput, 'Johnny');
    await userEvent.clear(lastNameInput);
    await userEvent.type(lastNameInput, 'Smith');
    await userEvent.click(saveBtn);

    // Verify changes are reflected in the list
    expect(await screen.findByText('Johnny Smith')).toBeInTheDocument();
  });
});

/**
 * Contact CRUD Flow: Delete Contact
 *
 * Scenario: User deletes contact with confirmation
 */
describe.skip('Contact CRUD Flow: Delete Contact', () => {
  let mockContacts: MockContact[] = [];
  let deleteAttempted = false;

  beforeEach(() => {
    resetMSW();
    deleteAttempted = false;
    mockContacts = [
      {
        id: 1,
        tenant_id: mockTenant.id,
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone: null,
        age: null,
        gender: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    server.use(
      http.get(`${API_URL}/address-book`, () =>
        HttpResponse.json({
          success: true,
          data: {
            contacts: mockContacts,
            total: mockContacts.length,
            page: 1,
            limit: 10,
            totalPages: 1,
            hasNext: false,
            hasPrev: false,
          },
        })
      ),
      http.delete(`${API_URL}/address-book/1`, () => {
        deleteAttempted = true;
        mockContacts = mockContacts.filter(c => c.id !== 1);
        return HttpResponse.json({ success: true, data: null });
      })
    );
  });

  afterEach(() => {
    resetMSW();
  });

  test('User can delete contact with confirmation', async () => {
    renderWithAuth(<AddressBookPage />);

    // Wait for contacts to load
    expect(await screen.findByText('John Doe')).toBeInTheDocument();

    // Find and click delete button
    const deleteBtn = screen.getByRole('button', { name: /delete/i });
    await userEvent.click(deleteBtn);

    // Confirm deletion in modal/dialog
    const confirmBtn = screen.getByRole('button', { name: /confirm|yes|delete/i });
    await userEvent.click(confirmBtn);

    // Verify contact is removed from list
    expect(screen.queryByText('John Doe')).toBeNull();
  });

  test('Delete operation shows success message', async () => {
    renderWithAuth(<AddressBookPage />);

    // Wait for contacts to load
    expect(await screen.findByText('John Doe')).toBeInTheDocument();

    // Find and click delete button
    const deleteBtn = screen.getByRole('button', { name: /delete/i });
    await userEvent.click(deleteBtn);

    // Confirm deletion
    const confirmBtn = screen.getByRole('button', { name: /confirm|yes|delete/i });
    await userEvent.click(confirmBtn);

    // Verify success message appears
    const successMsg = await screen.findByText(/deleted|success|removed/i);
    expect(successMsg).toBeInTheDocument();
  });

  test('Cancel delete prevents removal', async () => {
    renderWithAuth(<AddressBookPage />);

    expect(await screen.findByText(/john/i)).toBeInTheDocument();

    const deleteBtn = screen.getByRole('button', { name: /delete/i });
    await userEvent.click(deleteBtn);

    // Find cancel button
    const cancelBtn = screen.getByRole('button', { name: /cancel|no/i });
    await userEvent.click(cancelBtn);

    // Contact should still be visible
    expect(await screen.findByText(/john/i)).toBeInTheDocument();

    // Verify delete was NOT called
    expect(deleteAttempted).toBe(false);
  });
});

/**
 * Multi-Tenant Data Isolation
 *
 * Scenario: Contacts from different tenants should not be visible to each other
 */
describe.skip('Multi-Tenant Data Isolation', () => {
  const tenant1Contacts: MockContact[] = [
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
  ];

  const tenant2Contacts: MockContact[] = [
    {
      id: 2,
      tenant_id: 'tenant-2',
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

  beforeEach(() => {
    resetMSW();
  });

  afterEach(() => {
    resetMSW();
  });

  test('Contacts are isolated by tenant', async () => {
    let capturedTenantId: string | null = null;

    server.use(
      http.get(`${API_URL}/address-book`, ({ request }) => {
        capturedTenantId = request.headers.get('x-tenant-id');
        const contacts = capturedTenantId === 'tenant-1' ? tenant1Contacts : [];
        return HttpResponse.json({
          success: true,
          data: {
            contacts,
            total: contacts.length,
            page: 1,
            limit: 10,
            totalPages: 1,
            hasNext: false,
            hasPrev: false,
          },
        });
      })
    );

    renderWithAuth(<AddressBookPage />, {
      authValue: {
        tenant: mockTenant,
      },
    });

    await waitFor(() => {
      expect(capturedTenantId).not.toBeNull();
    });

    const expectedId = String(mockTenant.id);
    expect(capturedTenantId!).toBe(expectedId);
  });

  test('Tenant 1 contacts are isolated from Tenant 2', async () => {
    // Mock API to return tenant-1 contacts when tenant-1 header is sent
    server.use(
      http.get(`${API_URL}/address-book`, ({ request }) => {
        const tenantId = request.headers.get('x-tenant-id');
        const contacts = tenantId === 'tenant-1' ? tenant1Contacts : [];
        return HttpResponse.json({
          success: true,
          data: {
            contacts,
            total: contacts.length,
            page: 1,
            limit: 10,
            totalPages: 1,
            hasNext: false,
            hasPrev: false,
          },
        });
      })
    );

    renderWithAuth(<AddressBookPage />, {
      authValue: {
        isAuthenticated: true,
        user: mockUser,
        tenant: mockTenant,
      },
    });

    // Verify only tenant-1 contacts are shown
    expect(await screen.findByText('John Doe')).toBeInTheDocument();
    expect(screen.queryByText('Jane Smith')).toBeNull();
  });

  test('Tenant 2 contacts are isolated from Tenant 1', async () => {
    // Mock API to return tenant-2 contacts when tenant-2 header is sent
    server.use(
      http.get(`${API_URL}/address-book`, ({ request }) => {
        const tenantId = request.headers.get('x-tenant-id');
        const contacts = tenantId === 'tenant-2' ? tenant2Contacts : [];
        return HttpResponse.json({
          success: true,
          data: {
            contacts,
            total: contacts.length,
            page: 1,
            limit: 10,
            totalPages: 1,
            hasNext: false,
            hasPrev: false,
          },
        });
      })
    );

    const tenant2 = {
      ...mockTenant,
      id: asTenantId('tenant-2'),
      name: 'Tenant 2',
    };

    renderWithAuth(<AddressBookPage />, {
      authValue: {
        tenant: tenant2,
      },
    });

    // Verify only tenant-2 contacts are shown
    expect(await screen.findByText('Jane Smith')).toBeInTheDocument();
    expect(screen.queryByText('John Doe')).toBeNull();
  });
});

/**
 * Form Validation with Backend Errors
 *
 * Scenario: API validation errors are displayed to user
 */
describe.skip('Form Validation with Backend Errors', () => {
  test('API validation errors are displayed', async () => {
    server.use(
      http.post(`${API_URL}/address-book`, () =>
        HttpResponse.json(
          {
            success: false,
            message: 'Validation failed',
            errors: {
              email: ['Email already exists'],
              phone: ['Invalid phone format'],
            },
          },
          { status: 400 }
        )
      )
    );

    renderWithAuth(<AddressBookPage />);

    const createBtn = screen.getByRole('button', { name: /new|create|add/i });
    await userEvent.click(createBtn);

    // Fill form with data that will trigger validation errors
    const firstNameInput = screen.getByLabelText(/first name/i);
    const emailInput = screen.getByLabelText(/email/i);
    const phoneInput = screen.getByLabelText(/phone/i);

    await userEvent.type(firstNameInput, 'Test');
    await userEvent.type(emailInput, 'duplicate@example.com');
    await userEvent.type(phoneInput, 'invalid-phone');

    const submitBtn = screen.getByRole('button', { name: /save|submit/i });
    await userEvent.click(submitBtn);

    // Verify validation errors are shown
    expect(await screen.findByText(/email already exists/i)).toBeInTheDocument();
    expect(await screen.findByText(/invalid phone format/i)).toBeInTheDocument();
  });

  test('Network errors are handled gracefully', async () => {
    server.use(http.post(`${API_URL}/address-book`, () => HttpResponse.error()));

    renderWithAuth(<AddressBookPage />);

    const createBtn = screen.getByRole('button', { name: /new|create|add/i });
    await userEvent.click(createBtn);

    const firstNameInput = screen.getByLabelText(/first name/i);
    await userEvent.type(firstNameInput, 'Test');

    const submitBtn = screen.getByRole('button', { name: /save|submit/i });
    await userEvent.click(submitBtn);

    // Verify error message is shown - check for the specific error message displayed by the app
    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(
      /Network error: Unable to reach the server|Error Loading Contacts/i
    );
  });
});
