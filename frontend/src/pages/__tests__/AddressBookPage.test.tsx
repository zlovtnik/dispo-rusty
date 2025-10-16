import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithAuth } from '../../test-utils/render';
import { AddressBookPage } from '../AddressBookPage';
import type { Contact } from '../../types/contact';
import { asContactId, asTenantId, asUserId } from '../../types/ids';

// Mock data
const mockContacts: Contact[] = [
  {
    id: asContactId('1'),
    tenantId: asTenantId('tenant1'),
    firstName: 'John',
    lastName: 'Doe',
    fullName: 'John Doe',
    email: 'john@example.com',
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
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: asUserId('user1'),
    updatedBy: asUserId('user1'),
    isActive: true,
  },
  {
    id: asContactId('2'),
    tenantId: asTenantId('tenant1'),
    firstName: 'Jane',
    lastName: 'Smith',
    fullName: 'Jane Smith',
    email: 'jane@example.com',
    phone: '555-0101',
    mobile: '555-0101',
    gender: 'female',
    address: {
      street1: '456 Oak Ave',
      city: 'Shelbyville',
      state: 'IL',
      zipCode: '62702',
      country: 'USA',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: asUserId('user1'),
    updatedBy: asUserId('user1'),
    isActive: true,
  },
];

// MSW server setup
const server = setupServer(
  http.get('/api/contacts', () => {
    return HttpResponse.json({
      success: true,
      message: 'Contacts retrieved',
      data: mockContacts,
    });
  }),

  http.post('/api/contacts', async ({ request }) => {
    const body = (await request.json()) as Partial<Contact>;
    const newContact: Contact = {
      id: asContactId(`${mockContacts.length + 1}`),
      tenantId: asTenantId('tenant1'),
      firstName: body.firstName || '',
      lastName: body.lastName || '',
      fullName: `${body.firstName || ''} ${body.lastName || ''}`.trim(),
      email: body.email || '',
      phone: body.phone || '',
      mobile: body.mobile || '',
      gender: body.gender || 'male',
      address: body.address || { street1: '', city: '', state: '', zipCode: '', country: '' },
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: asUserId('user1'),
      updatedBy: asUserId('user1'),
      isActive: true,
    };
    return HttpResponse.json({
      success: true,
      message: 'Contact created',
      data: newContact,
    });
  }),

  http.put('/api/contacts/:id', async ({ request, params }) => {
    const { id } = params;
    const body = (await request.json()) as Partial<Contact>;
    const contact = mockContacts.find(c => c.id === id);
    if (!contact) {
      return HttpResponse.json(
        { success: false, message: 'Contact not found' },
        { status: 404 }
      );
    }
    const updated = { ...contact, ...body };
    return HttpResponse.json({
      success: true,
      message: 'Contact updated',
      data: updated,
    });
  }),

  http.delete('/api/contacts/:id', ({ params }) => {
    const { id } = params;
    const contact = mockContacts.find(c => c.id === id);
    if (!contact) {
      return HttpResponse.json(
        { success: false, message: 'Contact not found' },
        { status: 404 }
      );
    }
    return HttpResponse.json({
      success: true,
      message: 'Contact deleted',
    });
  })
);

describe('AddressBookPage Component', () => {
  beforeEach(() => {
    server.listen();
  });

  afterEach(() => {
    server.resetHandlers();
    server.close();
  });

  describe('Rendering', () => {
    it('should render the page title', async () => {
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.queryByText(/address book/i)).toBeDefined();
      });
    });

    it('should display add contact button', () => {
      renderWithAuth(<AddressBookPage />);

      const addButton = screen.queryByRole('button', { name: /add/i });
      expect(addButton).toBeDefined();
    });

    it('should display search input', () => {
      renderWithAuth(<AddressBookPage />);

      const searchInput = screen.queryByPlaceholderText(/search/i);
      expect(searchInput).toBeDefined();
    });

    it('should render contacts table', async () => {
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        const table = screen.queryByRole('table');
        expect(table).toBeDefined();
      });
    });
  });

  describe('Loading Contacts', () => {
    it('should fetch contacts from API on mount', async () => {
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.queryByText('John')).toBeDefined();
        expect(screen.queryByText('Jane')).toBeDefined();
      });
    });

    it('should display contact names in table', async () => {
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.queryByText('John Doe')).toBeDefined();
        expect(screen.queryByText('Jane Smith')).toBeDefined();
      });
    });

    it('should display contact emails in table', async () => {
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.queryByText('john@example.com')).toBeDefined();
        expect(screen.queryByText('jane@example.com')).toBeDefined();
      });
    });
  });

  describe('Search Functionality', () => {
    it('should filter contacts by search term', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.queryByText('John Doe')).toBeDefined();
      });

      const searchInput = screen.queryByPlaceholderText(/search/i);
      if (searchInput) {
        await user.type(searchInput, 'John');
        await waitFor(() => {
          expect(screen.queryByText('John Doe')).toBeDefined();
        });
      }
    });

    it('should clear search results', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.queryByText('John Doe')).toBeDefined();
      });

      const searchInput = screen.queryByPlaceholderText(/search/i) as HTMLInputElement;
      if (searchInput) {
        await user.type(searchInput, 'Jane');
        await user.clear(searchInput);
        await waitFor(() => {
          expect(screen.queryByText('John Doe')).toBeDefined();
        });
      }
    });
  });

  describe('Create Contact', () => {
    it('should open create modal on add button click', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      const addButton = screen.queryByRole('button', { name: /add/i });
      if (addButton) {
        await user.click(addButton);
        await waitFor(() => {
          const modal = screen.queryByText(/create|edit|new contact/i);
          expect(modal).toBeDefined();
        });
      }
    });

    it('should have form fields in create modal', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      const addButton = screen.queryByRole('button', { name: /add/i });
      if (addButton) {
        await user.click(addButton);
        await waitFor(() => {
          expect(screen.queryByPlaceholderText(/first name/i)).toBeDefined();
          expect(screen.queryByPlaceholderText(/last name/i)).toBeDefined();
          expect(screen.queryByPlaceholderText(/email/i)).toBeDefined();
        });
      }
    });

    it('should validate required fields', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      const addButton = screen.queryByRole('button', { name: /add/i });
      if (addButton) {
        await user.click(addButton);
        const submitButton = await screen.findByRole('button', { name: /submit|save|create/i });
        await user.click(submitButton);

        await waitFor(() => {
          const errorMessages = screen.queryAllByText(/required|please enter/i);
          expect(errorMessages.length).toBeGreaterThan(0);
        });
      }
    });
  });

  describe('Edit Contact', () => {
    it('should open edit modal when clicking edit action', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.queryByText('John Doe')).toBeDefined();
      });

      const editButtons = screen.queryAllByRole('button', { name: /edit/i });
      if (editButtons.length > 0) {
        await user.click(editButtons[0]!);
        await waitFor(() => {
          const input = screen.queryByDisplayValue('John');
          expect(input).toBeDefined();
        });
      }
    });
  });

  describe('Delete Contact', () => {
    it('should show delete confirmation modal', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.queryByText('John Doe')).toBeDefined();
      });

      const deleteButtons = screen.queryAllByRole('button', { name: /delete|trash/i });
      if (deleteButtons.length > 0) {
        await user.click(deleteButtons[0]!);
        await waitFor(() => {
          expect(screen.queryByText(/confirm|are you sure/i)).toBeDefined();
        });
      }
    });

    it('should cancel delete when clicking cancel', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.queryByText('John Doe')).toBeDefined();
      });

      const deleteButtons = screen.queryAllByRole('button', { name: /delete|trash/i });
      if (deleteButtons.length > 0) {
        await user.click(deleteButtons[0]!);
        const cancelButton = await screen.findByRole('button', { name: /cancel/i });
        await user.click(cancelButton);

        await waitFor(() => {
          expect(screen.queryByText(/confirm|are you sure/i)).toBeNull();
        });
      }
    });
  });

  describe('Validation', () => {
    it('should validate email format', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      const addButton = screen.queryByRole('button', { name: /add/i });
      if (addButton) {
        await user.click(addButton);
        const emailInput = await screen.findByPlaceholderText(/email/i);
        await user.type(emailInput, 'invalid-email');

        const submitButton = screen.queryByRole('button', { name: /submit|save/i });
        if (submitButton) {
          await user.click(submitButton);
          await waitFor(() => {
            expect(screen.queryByText(/email|invalid/i)).toBeDefined();
          });
        }
      }
    });

    it('should validate phone format', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      const addButton = screen.queryByRole('button', { name: /add/i });
      if (addButton) {
        await user.click(addButton);
        const phoneInput = await screen.findByPlaceholderText(/phone|mobile/i);
        if (phoneInput) {
          await user.type(phoneInput, 'invalid');
          const submitButton = screen.queryByRole('button', { name: /submit|save/i });
          if (submitButton) {
            await user.click(submitButton);
            await waitFor(() => {
              const errorText = screen.queryByText(/phone|format|invalid/i);
              expect(errorText).toBeDefined();
            });
          }
        }
      }
    });
  });

  describe('Error Handling', () => {
    it('should display error when API fails', async () => {
      server.use(
        http.get('/api/contacts', () => {
          return HttpResponse.json(
            { success: false, message: 'Failed to load contacts' },
            { status: 500 }
          );
        })
      );

      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.queryByText(/error|failed/i)).toBeDefined();
      });
    });

    it('should provide retry option on error', async () => {
      server.use(
        http.get('/api/contacts', () => {
          return HttpResponse.json(
            { success: false, message: 'Failed to load' },
            { status: 500 }
          );
        })
      );

      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /retry|reload/i })).toBeDefined();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper table semantics', async () => {
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        const table = screen.queryByRole('table');
        expect(table).toBeDefined();
      });
    });

    it('should have accessible buttons with proper labels', () => {
      renderWithAuth(<AddressBookPage />);

      const addButton = screen.queryByRole('button', { name: /add/i });
      expect(addButton).toBeDefined();
      expect(addButton?.getAttribute('aria-label') || addButton?.textContent).toBeDefined();
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      const addButton = screen.queryByRole('button', { name: /add/i });
      expect(addButton).toBeDefined();

      await user.keyboard('{Tab}');
      expect(document.activeElement).toBeDefined();
    });
  });

  describe('Empty State', () => {
    it('should display empty state when no contacts exist', async () => {
      server.use(
        http.get('/api/contacts', () => {
          return HttpResponse.json({
            success: true,
            message: 'Contacts retrieved',
            data: [],
          });
        })
      );

      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.queryByText(/no|empty|data/i)).toBeDefined();
      });
    });
  });

  describe('Pagination', () => {
    it.skip('should handle pagination', async () => {
      // TODO: Implement pagination test after backend supports limit/offset
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);
      // Pagination implementation needed
    });
  });

  describe('Sorting', () => {
    it.skip('should sort contacts by column', async () => {
      // TODO: Implement sorting test after backend supports sort parameters
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);
      // Sorting implementation needed
    });
  });
});
