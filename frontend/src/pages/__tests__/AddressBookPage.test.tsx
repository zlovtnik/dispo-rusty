import { describe, it, expect, beforeEach } from 'bun:test';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../test-utils/mocks/server';
import { renderWithAuth } from '../../test-utils/render';
import { AddressBookPage } from '../AddressBookPage';
import type { ContactApiDTO } from '../../transformers/dto';
import { getEnv } from '../../config/env';

const API_BASE_URL = getEnv().apiUrl;

// Mock data - using backend API format (snake_case)
const mockContacts: ContactApiDTO[] = [
  {
    id: 1,
    tenant_id: 'tenant-1',
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@example.com',
    phone: '555-0100',
    age: 30,
    gender: 'male',
    address: '123 Main St, Springfield, IL 62701, USA',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 2,
    tenant_id: 'tenant-1',
    first_name: 'Jane',
    last_name: 'Smith',
    email: 'jane@example.com',
    phone: '555-0101',
    age: 28,
    gender: 'female',
    address: '456 Oak Ave, Shelbyville, IL 62702, USA',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

describe('AddressBookPage Component', () => {
  beforeEach(() => {
    // Reset mockContacts to initial state before each test
    mockContacts.length = 0;
    mockContacts.push(
      {
        id: 1,
        tenant_id: 'tenant-1',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone: '555-0100',
        age: 30,
        gender: 'male',
        address: '123 Main St, Springfield, IL 62701, USA',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 2,
        tenant_id: 'tenant-1',
        first_name: 'Jane',
        last_name: 'Smith',
        email: 'jane@example.com',
        phone: '555-0101',
        age: 28,
        gender: 'female',
        address: '456 Oak Ave, Shelbyville, IL 62702, USA',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    );

    // Setup test-specific handlers using the global server
    server.use(
      http.get(`${API_BASE_URL}/address-book`, () => {
        return HttpResponse.json({
          message: 'Contacts retrieved',
          data: {
            contacts: mockContacts,
            total: mockContacts.length,
            currentPage: 1,
            totalPages: 1,
            limit: mockContacts.length,
            hasNext: false,
            hasPrev: false,
          },
        });
      }),

      http.post(`${API_BASE_URL}/address-book`, async ({ request }) => {
        const body = (await request.json()) as {
          name?: string;
          email?: string;
          phone?: string;
          gender?: string;
          age?: number;
          address?: string;
        };
        const nameParts = (body.name ?? 'Unknown User').split(' ');
        const newContact: ContactApiDTO = {
          id: mockContacts.length + 1,
          tenant_id: 'tenant-1',
          first_name: nameParts[0] ?? 'Unknown',
          last_name: nameParts.slice(1).join(' ') ?? 'User',
          email: body.email ?? '',
          phone: body.phone ?? '',
          age: body.age ?? 25,
          gender: body.gender ?? 'male',
          address: body.address ?? '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        mockContacts.push(newContact);
        return HttpResponse.json({
          message: 'Contact created',
          data: newContact,
        });
      }),

      http.put(`${API_BASE_URL}/address-book/:id`, async ({ request, params }) => {
        const contactId = Number(params.id);
        const body = (await request.json()) as {
          name?: string;
          email?: string;
          phone?: string;
          gender?: string;
          age?: number;
          address?: string;
        };
        const contactIndex = mockContacts.findIndex(c => c.id === contactId);
        if (contactIndex === -1) {
          return HttpResponse.json({ message: 'Contact not found', data: null }, { status: 404 });
        }

        // Apply updates
        const updates: Partial<ContactApiDTO> = {
          updated_at: new Date().toISOString(),
        };
        if (body.name) {
          const nameParts = body.name.split(' ');
          updates.first_name = nameParts[0] ?? 'Unknown';
          updates.last_name = nameParts.slice(1).join(' ') ?? 'User';
        }
        if (body.email !== undefined) updates.email = body.email;
        if (body.phone !== undefined) updates.phone = body.phone;
        if (body.age !== undefined) updates.age = body.age;
        if (body.gender !== undefined) updates.gender = body.gender;
        if (body.address !== undefined) updates.address = body.address;

        mockContacts[contactIndex] = { ...mockContacts[contactIndex], ...updates };
        return HttpResponse.json({
          message: 'Contact updated',
          data: mockContacts[contactIndex],
        });
      }),

      http.delete(`${API_BASE_URL}/address-book/:id`, ({ params }) => {
        const contactId = Number(params.id);
        const contactIndex = mockContacts.findIndex(c => c.id === contactId);
        if (contactIndex === -1) {
          return HttpResponse.json({ message: 'Contact not found', data: null }, { status: 404 });
        }
        // Remove the contact from the array
        mockContacts.splice(contactIndex, 1);
        return HttpResponse.json({
          message: 'Contact deleted',
          data: null,
        });
      })
    );
  });

  describe('Rendering', () => {
    it('should render the page title', async () => {
      renderWithAuth(<AddressBookPage />);

      expect(await screen.findByText(/address book/i)).toBeInTheDocument();
    });

    it('should display add contact button', () => {
      renderWithAuth(<AddressBookPage />);

      expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
    });

    it('should display search input', () => {
      renderWithAuth(<AddressBookPage />);

      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    });

    it('should render contacts table', async () => {
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });
    });
  });

  describe('Loading Contacts', () => {
    it('should fetch contacts from API on mount', async () => {
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      });
    });

    it('should display contact names in table', async () => {
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      });
    });

    it('should display contact emails in table', async () => {
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.getByText('john@example.com')).toBeInTheDocument();
        expect(screen.getByText('jane@example.com')).toBeInTheDocument();
      });
    });
  });

  describe('Search Functionality', () => {
    it('should filter contacts by search term', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search/i);
      await user.type(searchInput, 'John');
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.queryByText('Jane Smith')).not.toBeInTheDocument();
      });
    });

    it('should clear search results', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search/i);
      await user.type(searchInput, 'Jane');
      await user.clear(searchInput);
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      });
    });
  });

  describe('Create Contact', () => {
    it('should open create modal on add button click', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      const addButton = screen.getByRole('button', { name: /add/i });
      await user.click(addButton);
      await waitFor(() => {
        expect(screen.getByText(/create|edit|new contact/i)).toBeInTheDocument();
      });
    });

    it('should have form fields in create modal', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      const addButton = screen.getByRole('button', { name: /add/i });
      await user.click(addButton);
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/first name/i)).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/last name/i)).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument();
      });
    });

    it('should validate required fields', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      const addButton = screen.getByRole('button', { name: /add/i });
      await user.click(addButton);
      const submitButton = await screen.findByRole('button', { name: /submit|save|create/i });
      await user.click(submitButton);

      await waitFor(() => {
        const errorMessages = screen.getAllByText(/required|please enter/i);
        expect(errorMessages.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Edit Contact', () => {
    it('should open edit modal when clicking edit action', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByRole('button', { name: /edit/i });
      expect(editButtons.length).toBeGreaterThan(0);
      await user.click(editButtons[0]!);
      await waitFor(() => {
        expect(screen.getByDisplayValue('John')).toBeInTheDocument();
      });
    });
  });

  describe('Delete Contact', () => {
    it('should show delete confirmation modal', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByRole('button', { name: /delete|trash/i });
      expect(deleteButtons.length).toBeGreaterThan(0);
      await user.click(deleteButtons[0]!);
      await waitFor(() => {
        expect(screen.getByText(/confirm|are you sure/i)).toBeInTheDocument();
      });
    });

    it('should cancel delete when clicking cancel', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByRole('button', { name: /delete|trash/i });
      expect(deleteButtons.length).toBeGreaterThan(0);
      await user.click(deleteButtons[0]!);
      const cancelButton = await screen.findByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByText(/confirm|are you sure/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Validation', () => {
    it('should validate email format', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      const addButton = screen.getByRole('button', { name: /add/i });
      await user.click(addButton);
      const emailInput = await screen.findByPlaceholderText(/email/i);
      await user.type(emailInput, 'invalid-email');

      const submitButton = screen.getByRole('button', { name: /submit|save/i });
      await user.click(submitButton);
      await waitFor(() => {
        expect(screen.getByText(/email|invalid/i)).toBeInTheDocument();
      });
    });

    it('should validate phone format', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      const addButton = screen.getByRole('button', { name: /add/i });
      await user.click(addButton);
      const phoneInput = await screen.findByPlaceholderText(/phone|mobile/i);
      await user.type(phoneInput, 'invalid');
      const submitButton = screen.getByRole('button', { name: /submit|save/i });
      await user.click(submitButton);
      await waitFor(() => {
        expect(screen.getByText(/phone|format|invalid/i)).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should display error when API fails', async () => {
      server.use(
        http.get(`${API_BASE_URL}/address-book`, () => {
          return HttpResponse.json(
            { message: 'Failed to load contacts', data: null },
            { status: 500 }
          );
        })
      );

      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.getByText(/error|failed/i)).toBeInTheDocument();
      });
    });

    it('should provide retry option on error', async () => {
      server.use(
        http.get(`${API_BASE_URL}/address-book`, () => {
          return HttpResponse.json({ message: 'Failed to load', data: null }, { status: 500 });
        })
      );

      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry|reload/i })).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper table semantics', async () => {
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });
    });

    it('should have accessible buttons with proper labels', () => {
      renderWithAuth(<AddressBookPage />);

      const addButton = screen.getByRole('button', { name: /add/i });
      expect(addButton).toBeInTheDocument();

      // Get the descriptive text from aria-label or textContent
      const ariaLabel = addButton.getAttribute('aria-label');
      const textContent = addButton.textContent?.trim();
      const descriptiveText = ariaLabel || textContent;

      // Verify we have a descriptive string and it matches a meaningful pattern
      expect(descriptiveText).toBeTruthy();
      expect(descriptiveText).toMatch(/add( contact| address)?/i);
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      // Wait for the component to load
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add contact/i })).toBeInTheDocument();
      });

      // Get the expected tabbable elements
      const searchInput = screen.getByPlaceholderText('Search contacts...');
      const addButton = screen.getByRole('button', { name: /add contact/i });

      // Test initial tab order: Search input should be first
      await user.keyboard('{Tab}');
      expect(document.activeElement).toBe(searchInput);

      // Second tab should move to Add Contact button
      await user.keyboard('{Tab}');
      expect(document.activeElement).toBe(addButton);

      // Third tab should move to next focusable element (if any)
      await user.keyboard('{Tab}');
      // Verify focus moved to a focusable element, not stuck on body
      expect(document.activeElement).not.toBe(document.body);
      expect(document.activeElement?.tagName).toMatch(/BUTTON|INPUT|A/);
    });
  });

  describe('Empty State', () => {
    it('should display empty state when no contacts exist', async () => {
      server.use(
        http.get(`${API_BASE_URL}/address-book`, () => {
          return HttpResponse.json({
            message: 'Contacts retrieved',
            data: {
              contacts: [],
              total: 0,
              currentPage: 1,
              totalPages: 0,
              limit: 10,
              hasNext: false,
              hasPrev: false,
            },
          });
        })
      );

      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.getByText(/no|empty|data/i)).toBeInTheDocument();
      });
    });
  });

  describe('Pagination', () => {
    it.skip('should handle pagination', async () => {
      // TODO: Implement pagination test after backend supports limit/offset
      const _user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);
      // Pagination implementation needed
    });
  });

  describe('Sorting', () => {
    it.skip('should sort contacts by column', async () => {
      // TODO: Implement sorting test after backend supports sort parameters
      const _user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);
      // Sorting implementation needed
    });
  });
});
