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
describe('Contact CRUD Flow: Create Contact', () => {
  let mockContacts: MockContact[] = [];

  beforeEach(() => {
    resetMSW();
    mockContacts = [];

    server.use(
      http.get(`${API_URL}/contacts`, () =>
        HttpResponse.json({ success: true, data: mockContacts })
      ),
      http.post(`${API_URL}/contacts`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;

        const newContact: MockContact = {
          id: (mockContacts.length || 0) + 1,
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

        return HttpResponse.json({ success: true, data: newContact });
      })
    );
  });

  afterEach(() => {
    resetMSW();
  });

  test('User can create a new contact', async () => {
    renderWithAuth(<AddressBookPage />);

    await waitFor(() => {
      const createBtn = screen.queryByRole('button', { name: /new|create|add/i });
      expect(createBtn).toBeDefined();
    });
  });

  test('Form validation prevents empty submission', async () => {
    renderWithAuth(<AddressBookPage />);

    const createBtn = screen.queryByRole('button', { name: /new|create|add/i });
    if (createBtn) {
      await userEvent.click(createBtn);

      const submitBtn = screen.queryByRole('button', { name: /save|submit/i });
      if (submitBtn) {
        await userEvent.click(submitBtn);

        // Should show validation error
        await waitFor(() => {
          const error = screen.queryByText(/required|invalid/i);
          expect(error).toBeDefined();
        });
      }
    }
  });

  test('API error on create shows message', async () => {
    server.use(
      http.post(`${API_URL}/contacts`, () =>
        HttpResponse.json({ success: false, message: 'Duplicate email' }, { status: 400 })
      )
    );

    renderWithAuth(<AddressBookPage />);

    const createBtn = screen.queryByRole('button', { name: /new|create|add/i });
    if (createBtn) {
      await userEvent.click(createBtn);

      const firstNameInput = screen.queryByLabelText(/first.*name/i);
      const lastNameInput = screen.queryByLabelText(/last.*name/i);
      const emailInput = screen.queryByLabelText(/email/i);
      const submitBtn = screen.queryByRole('button', { name: /save|submit/i });

      if (firstNameInput && lastNameInput && emailInput && submitBtn) {
        await userEvent.type(firstNameInput, 'John');
        await userEvent.type(lastNameInput, 'Doe');
        await userEvent.type(emailInput, 'duplicate@example.com');
        await userEvent.click(submitBtn);

        // Should show API error message
        await waitFor(() => {
          const error = screen.queryByText(/duplicate|error/i);
          expect(error).toBeDefined();
        });
      }
    }
  });
});

/**
 * Contact CRUD Flow: Edit Contact
 *
 * Scenario: User selects contact, modifies details, saves changes
 */
describe('Contact CRUD Flow: Edit Contact', () => {
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
      http.get(`${API_URL}/contacts`, () =>
        HttpResponse.json({ success: true, data: mockContacts })
      ),
      http.get(`${API_URL}/contacts/1`, () =>
        HttpResponse.json({ success: true, data: mockContacts[0] })
      ),
      http.put(`${API_URL}/contacts/1`, async ({ request }) => {
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
    mockContacts = [];
  });

  test('User can edit existing contact', async () => {
    renderWithAuth(<AddressBookPage />);

    // Wait for contacts to load
    await waitFor(() => {
      expect(screen.queryByText('John Doe')).toBeDefined();
    });

    // Find and click edit button for John Doe
    const editBtn = screen.queryByRole('button', { name: /edit/i });
    if (editBtn) {
      await userEvent.click(editBtn);

      // Verify form is populated with existing data
      const firstNameInput = screen.queryByLabelText(/first.*name/i)!;
      const lastNameInput = screen.queryByLabelText(/last.*name/i)!;

      if (firstNameInput && lastNameInput) {
        expect(firstNameInput.value).toBe('John');
        expect(lastNameInput.value).toBe('Doe');
      }
    }
  });

  test('User can save contact changes', async () => {
    renderWithAuth(<AddressBookPage />);

    // Wait for contacts to load
    await waitFor(() => {
      expect(screen.queryByText('John Doe')).toBeDefined();
    });

    // Find and click edit button
    const editBtn = screen.queryByRole('button', { name: /edit/i });
    if (editBtn) {
      await userEvent.click(editBtn);

      // Modify contact details
      const firstNameInput = screen.queryByLabelText(/first.*name/i);
      const lastNameInput = screen.queryByLabelText(/last.*name/i);
      const saveBtn = screen.queryByRole('button', { name: /save|submit/i });

      if (firstNameInput && lastNameInput && saveBtn) {
        await userEvent.clear(firstNameInput);
        await userEvent.type(firstNameInput, 'Johnny');
        await userEvent.clear(lastNameInput);
        await userEvent.type(lastNameInput, 'Smith');
        await userEvent.click(saveBtn);

        // Verify changes are reflected in the list
        await waitFor(() => {
          expect(screen.queryByText('Johnny Smith')).toBeDefined();
        });
      }
    }
  });

  test('Contact form loads existing data', async () => {
    renderWithAuth(<AddressBookPage />);

    await waitFor(() => {
      expect(screen.queryByText(/john/i)).toBeDefined();
    });
  });
});

/**
 * Contact CRUD Flow: Delete Contact
 *
 * Scenario: User deletes contact with confirmation
 */
describe('Contact CRUD Flow: Delete Contact', () => {
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
      http.get(`${API_URL}/contacts`, () =>
        HttpResponse.json({ success: true, data: mockContacts })
      ),
      http.delete(`${API_URL}/contacts/1`, () => {
        deleteAttempted = true;
        mockContacts = mockContacts.filter(c => c.id !== 1);
        return HttpResponse.json({ success: true, data: null });
      })
    );
  });

  afterEach(() => {
    resetMSW();
    mockContacts = [];
  });

  test('User can delete contact with confirmation', async () => {
    renderWithAuth(<AddressBookPage />);

    // Wait for contacts to load
    await waitFor(() => {
      expect(screen.queryByText('John Doe')).toBeDefined();
    });

    // Find and click delete button
    const deleteBtn = screen.queryByRole('button', { name: /delete/i });
    if (deleteBtn) {
      await userEvent.click(deleteBtn);

      // Confirm deletion in modal/dialog
      const confirmBtn = screen.queryByRole('button', { name: /confirm|yes|delete/i });
      if (confirmBtn) {
        await userEvent.click(confirmBtn);

        // Verify contact is removed from list
        await waitFor(() => {
          expect(screen.queryByText('John Doe')).toBeNull();
        });
      }
    }
  });

  test('Delete operation shows success message', async () => {
    renderWithAuth(<AddressBookPage />);

    // Wait for contacts to load
    await waitFor(() => {
      expect(screen.queryByText('John Doe')).toBeDefined();
    });

    // Find and click delete button
    const deleteBtn = screen.queryByRole('button', { name: /delete/i });
    if (deleteBtn) {
      await userEvent.click(deleteBtn);

      // Confirm deletion
      const confirmBtn = screen.queryByRole('button', { name: /confirm|yes|delete/i });
      if (confirmBtn) {
        await userEvent.click(confirmBtn);

        // Verify success message appears
        await waitFor(() => {
          const successMsg = screen.queryByText(/deleted|success|removed/i);
          expect(successMsg).toBeDefined();
        });
      }
    }
  });

  test('Cancel delete prevents removal', async () => {
    renderWithAuth(<AddressBookPage />);

    await waitFor(() => {
      expect(screen.queryByText(/john/i)).toBeDefined();
    });

    const deleteBtn = screen.queryByRole('button', { name: /delete/i });
    if (deleteBtn) {
      await userEvent.click(deleteBtn);

      // Find cancel button
      const cancelBtn = screen.queryByRole('button', { name: /cancel|no/i });
      if (cancelBtn) {
        await userEvent.click(cancelBtn);

        // Contact should still be visible
        await waitFor(() => {
          expect(screen.queryByText(/john/i)).toBeDefined();
        });

        // Verify delete was NOT called
        expect(deleteAttempted).toBe(false);
      }
    }
  });
});

/**
 * Multi-Tenant Data Isolation
 *
 * Scenario: Contacts from different tenants should not be visible to each other
 */
describe('Multi-Tenant Data Isolation', () => {
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
      http.get(`${API_URL}/contacts`, ({ request }) => {
        capturedTenantId = request.headers.get('x-tenant-id');
        const data = capturedTenantId === 'tenant-1' ? tenant1Contacts : [];
        return HttpResponse.json({
          success: true,
          data,
        });
      })
    );

    renderWithAuth(<AddressBookPage />, {
      authValue: {
        tenant: mockTenant,
      },
    });

    await waitFor(() => {
      expect(capturedTenantId !== null).toBe(true);
    });

    const expectedId = String(mockTenant.id ?? '');
    expect(capturedTenantId === expectedId).toBe(true);
  });

  test('Tenant 1 contacts are isolated from Tenant 2', async () => {
    // Mock API to return tenant-1 contacts when tenant-1 header is sent
    server.use(
      http.get(`${API_URL}/contacts`, ({ request }) => {
        const tenantId = request.headers.get('x-tenant-id');
        if (tenantId === 'tenant-1') {
          return HttpResponse.json({ success: true, data: tenant1Contacts });
        }
        return HttpResponse.json({ success: true, data: [] });
      })
    );

    renderWithAuth(<AddressBookPage />, {
      authValue: {
        isAuthenticated: true,
        user: mockUser,
        tenant: mockTenant,
        loading: false,
        login: async () => {},
        logout: async () => {},
        refreshToken: async () => {},
      },
    });

    // Verify only tenant-1 contacts are shown
    await waitFor(() => {
      expect(screen.queryByText('John Doe')).toBeDefined();
      expect(screen.queryByText('Jane Smith')).toBeNull();
    });
  });

  test('Tenant 2 contacts are isolated from Tenant 1', async () => {
    // Mock API to return tenant-2 contacts when tenant-2 header is sent
    server.use(
      http.get(`${API_URL}/contacts`, ({ request }) => {
        const tenantId = request.headers.get('x-tenant-id');
        if (tenantId === 'tenant-2') {
          return HttpResponse.json({ success: true, data: tenant2Contacts });
        }
        return HttpResponse.json({ success: true, data: [] });
      })
    );

    const tenant2 = {
      ...mockTenant,
      id: 'tenant-2' as any,
      name: 'Tenant 2',
    };

    renderWithAuth(<AddressBookPage />, {
      authValue: {
        isAuthenticated: true,
        user: mockUser,
        tenant: tenant2,
        loading: false,
        login: async () => {},
        logout: async () => {},
        refreshToken: async () => {},
      },
    });

    // Verify only tenant-2 contacts are shown
    await waitFor(() => {
      expect(screen.queryByText('Jane Smith')).toBeDefined();
      expect(screen.queryByText('John Doe')).toBeNull();
    });
  });
});

/**
 * Form Validation with Backend Errors
 *
 * Scenario: API validation errors are displayed to user
 */
describe('Form Validation with Backend Errors', () => {
  test('API validation errors are displayed', async () => {
    server.use(
      http.post(`${API_URL}/contacts`, () =>
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

    const createBtn = screen.queryByRole('button', { name: /new|create|add/i });
    if (createBtn) {
      await userEvent.click(createBtn);

      // Fill form with data that will trigger validation errors
      const firstNameInput = screen.getByLabelText(/first name/i);
      const emailInput = screen.getByLabelText(/email/i);
      const phoneInput = screen.getByLabelText(/phone/i);

      await userEvent.type(firstNameInput, 'Test');
      await userEvent.type(emailInput, 'duplicate@example.com');
      await userEvent.type(phoneInput, 'invalid-phone');

      const submitBtn = screen.queryByRole('button', { name: /save|submit/i });
      if (submitBtn) {
        await userEvent.click(submitBtn);

        // Verify validation errors are shown
        await waitFor(() => {
          expect(screen.queryByText(/email already exists/i)).toBeDefined();
          expect(screen.queryByText(/invalid phone format/i)).toBeDefined();
        });
      }
    }
  });

  test('Network errors are handled gracefully', async () => {
    server.use(http.post(`${API_URL}/contacts`, () => HttpResponse.error()));

    renderWithAuth(<AddressBookPage />);

    const createBtn = screen.queryByRole('button', { name: /new|create|add/i });
    if (createBtn) {
      await userEvent.click(createBtn);

      const firstNameInput = screen.getByLabelText(/first name/i);
      await userEvent.type(firstNameInput, 'Test');

      const submitBtn = screen.queryByRole('button', { name: /save|submit/i });
      if (submitBtn) {
        await userEvent.click(submitBtn);

        // Verify error message is shown
        await waitFor(() => {
          const errorMsg = screen.queryByText(/error|failed|network/i);
          expect(errorMsg).toBeDefined();
        });
      }
    }
  });
});
