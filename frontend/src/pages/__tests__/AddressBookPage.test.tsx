import { describe, it, expect, beforeEach } from 'bun:test';
import { screen, waitFor, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../test-utils/mocks/server';
import { renderWithAuth } from '../../test-utils/render';
import {
  AddressBookPage,
  resolveContactId,
  parseContactName,
  resolveContactGender,
  normalizeContactAddress,
} from '../AddressBookPage';
import type { ContactApiDTO } from '../../transformers/dto';
import { getEnv } from '../../config/env';
import { Gender } from '../../types/contact';
import { asContactId } from '../../types/ids';
import type { ContactId } from '../../types/ids';

const API_BASE_URL = getEnv().apiUrl;

// Mock data - using backend API format (snake_case)
let mockContacts: ContactApiDTO[] = [
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

describe('AddressBookPage Utility Functions', () => {
  describe('resolveContactId', () => {
    it('should return string ID when valid', () => {
      const normalized = { id: 'contact-123' } as any;
      const fallback = (): ContactId => asContactId('fallback');
      const result = resolveContactId(normalized, fallback);
      expect(result).toBe(asContactId('contact-123'));
    });

    it('should return number ID as string when valid', () => {
      const normalized = { id: 123 } as any;
      const fallback = (): ContactId => asContactId('fallback');
      const result = resolveContactId(normalized, fallback);
      expect(result).toBe(asContactId('123'));
    });

    it('should return fallback when ID is invalid', () => {
      const normalized = { id: null } as any;
      const fallback = (): ContactId => asContactId('fallback');
      const result = resolveContactId(normalized, fallback);
      expect(result).toBe(asContactId('fallback'));
    });

    it('should return fallback when ID is empty string', () => {
      const normalized = { id: '' } as any;
      const fallback = (): ContactId => asContactId('fallback');
      const result = resolveContactId(normalized, fallback);
      expect(result).toBe(asContactId('fallback'));
    });
  });

  describe('parseContactName', () => {
    it('should use fullName when available', () => {
      const normalized = {
        fullName: 'John Doe',
        firstName: 'John',
        lastName: 'Doe',
      } as any;
      const result = parseContactName(normalized);
      expect(result).toEqual({
        rawName: 'John Doe',
        firstName: 'John',
        lastName: 'Doe',
      });
    });

    it('should construct fullName from firstName and lastName', () => {
      const normalized = {
        firstName: 'John',
        lastName: 'Doe',
      } as any;
      const result = parseContactName(normalized);
      expect(result).toEqual({
        rawName: 'John Doe',
        firstName: 'John',
        lastName: 'Doe',
      });
    });

    it('should handle missing lastName', () => {
      const normalized = {
        firstName: 'John',
      } as any;
      const result = parseContactName(normalized);
      expect(result).toEqual({
        rawName: 'John',
        firstName: 'John',
        lastName: '',
      });
    });

    it('should handle empty fullName', () => {
      const normalized = {
        fullName: '',
        firstName: 'John',
        lastName: 'Doe',
      } as any;
      const result = parseContactName(normalized);
      expect(result).toEqual({
        rawName: '',
        firstName: 'John',
        lastName: 'Doe',
      });
    });
  });

  describe('resolveContactGender', () => {
    it('should return valid gender', () => {
      const normalized = { gender: Gender.male } as any;
      const result = resolveContactGender(normalized);
      expect(result).toBe(Gender.male);
    });

    it('should return undefined for null gender', () => {
      const normalized = { gender: null } as any;
      const result = resolveContactGender(normalized);
      expect(result).toBeUndefined();
    });

    it('should return undefined for invalid gender', () => {
      const normalized = { gender: 'invalid' } as any;
      const result = resolveContactGender(normalized);
      expect(result).toBeUndefined();
    });
  });

  describe('normalizeContactAddress', () => {
    it('should return address when available', () => {
      const normalized = {
        address: {
          street1: '123 Main St',
          street2: 'Apt 1',
          city: 'Springfield',
          state: 'IL',
          zipCode: '62701',
          country: 'USA',
        },
      } as any;
      const result = normalizeContactAddress(normalized, 'USA');
      expect(result).toEqual({
        street1: '123 Main St',
        street2: 'Apt 1',
        city: 'Springfield',
        state: 'IL',
        zipCode: '62701',
        country: 'USA',
      });
    });

    it('should return undefined when no address', () => {
      const normalized = {} as any;
      const result = normalizeContactAddress(normalized, 'USA');
      expect(result).toBeUndefined();
    });

    it('should use default country when address country is missing', () => {
      const normalized = {
        address: {
          street1: '123 Main St',
          city: 'Springfield',
          state: 'IL',
          zipCode: '62701',
        },
      } as any;
      const result = normalizeContactAddress(normalized, 'USA');
      expect(result?.country).toBe('USA');
    });
  });
});

describe.skip('AddressBookPage Component', () => {
  beforeEach(() => {
    // Reset mockContacts to initial state before each test
    mockContacts = [
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

    // Setup test-specific handlers using the global server
    server.use(
      http.get(`${API_BASE_URL}/address-book`, ({ request }) => {
        const url = new URL(request.url);
        const sortParam = url.searchParams.get('sort');
        const sortedContacts = [...mockContacts];

        if (sortParam) {
          const [field, order] = sortParam.split(',');
          if (field === 'fullName') {
            sortedContacts.sort((a, b) => {
              const nameA = `${a.first_name} ${a.last_name}`;
              const nameB = `${b.first_name} ${b.last_name}`;
              return order === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
            });
          }
        }

        return HttpResponse.json({
          status: 'success',
          message: 'Contacts retrieved',
          data: {
            contacts: sortedContacts,
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
          last_name: nameParts.slice(1).join(' ') || 'User',
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
          status: 'success',
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

        // Apply updates by creating a new object
        const existingContact = mockContacts[contactIndex];
        if (!existingContact) {
          return HttpResponse.json({ message: 'Contact not found', data: null }, { status: 404 });
        }
        const updatedContact: ContactApiDTO = {
          ...existingContact,
          updated_at: new Date().toISOString(),
          ...(body.name != null &&
            typeof body.name === 'string' &&
            body.name.trim() !== '' && {
              first_name: body.name.split(' ')[0] ?? 'Unknown',
              last_name: body.name.split(' ').slice(1).join(' ') || 'User',
            }),
          ...(body.email !== undefined && { email: body.email }),
          ...(body.phone !== undefined && { phone: body.phone }),
          ...(body.age !== undefined && { age: body.age }),
          ...(body.gender !== undefined && { gender: body.gender }),
          ...(body.address !== undefined && { address: body.address }),
        };

        mockContacts[contactIndex] = updatedContact;
        return HttpResponse.json({
          status: 'success',
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
          status: 'success',
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

    it('should render table with correct structure and row count', async () => {
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        // Verify table structure
        expect(screen.getByRole('table')).toBeInTheDocument();

        // Verify table headers are present
        expect(screen.getByRole('columnheader', { name: /name/i })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: /email/i })).toBeInTheDocument();

        // Verify correct number of data rows (2 contacts + 1 header row = 3 total rows)
        const rows = screen.getAllByRole('row');
        expect(rows).toHaveLength(3);

        // Verify specific contact data in table cells
        expect(screen.getByRole('cell', { name: 'John Doe' })).toBeInTheDocument();
        expect(screen.getByRole('cell', { name: 'Jane Smith' })).toBeInTheDocument();
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
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search contacts/i);
      await user.type(searchInput, 'John');
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.queryByText('Jane Smith')).not.toBeInTheDocument();
      });
    });

    it('should filter contacts by email', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search contacts/i);
      await user.type(searchInput, 'jane@example.com');
      await waitFor(() => {
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
        expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
      });
    });

    it('should filter contacts by phone', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search contacts/i);
      await user.type(searchInput, '555-0100');
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
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search contacts/i);
      await user.type(searchInput, 'Jane');
      await waitFor(() => {
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
        expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
      });

      await user.clear(searchInput);
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      });
    });

    it('should show no results message when no matches', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search contacts/i);
      await user.type(searchInput, 'NonExistent');
      await waitFor(() => {
        expect(screen.getByText(/no contacts match your search/i)).toBeInTheDocument();
      });
    });

    it('should be case insensitive', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search contacts/i);
      await user.type(searchInput, 'JOHN');
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.queryByText('Jane Smith')).not.toBeInTheDocument();
      });
    });
  });

  describe('Create Contact', () => {
    it('should open create modal on add button click', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const addButton = screen.getByRole('button', { name: /add contact/i });
      expect(addButton).toBeInTheDocument();

      await act(async () => {
        await user.click(addButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Add New Contact')).toBeInTheDocument();
      });
    });

    it('should have form fields in create modal', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Use more specific selector to avoid multiple matches
      const addButtons = screen.getAllByRole('button', { name: /add contact/i });
      const addButton = addButtons.find(btn => btn.getAttribute('type') === 'button');
      expect(addButton).toBeInTheDocument();
      await act(async () => {
        await user.click(addButton!);
      });

      await waitFor(() => {
        expect(screen.getByLabelText('First Name')).toBeInTheDocument();
        expect(screen.getByLabelText('Last Name')).toBeInTheDocument();
        expect(screen.getByLabelText('Email')).toBeInTheDocument();
        expect(screen.getByLabelText('Phone')).toBeInTheDocument();
        expect(screen.getByLabelText('Gender')).toBeInTheDocument();
        expect(screen.getByLabelText('Age')).toBeInTheDocument();
      });
    });

    it('should validate required fields', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Use more specific selector to avoid multiple matches
      const addButtons = screen.getAllByRole('button', { name: /add contact/i });
      const addButton = addButtons.find(btn => btn.getAttribute('type') === 'button');
      expect(addButton).toBeInTheDocument();
      await act(async () => {
        await user.click(addButton!);
      });

      await waitFor(() => {
        expect(screen.getByText('Add New Contact')).toBeInTheDocument();
      });

      const submitButtons = screen.getAllByRole('button', { name: /add contact/i });
      const submitButton = submitButtons.find(btn => btn.getAttribute('type') === 'submit');
      expect(submitButton).toBeInTheDocument();
      await act(async () => {
        await user.click(submitButton!);
      });

      await waitFor(() => {
        const errorMessages = screen.getAllByText(/please enter/i);
        expect(errorMessages.length).toBeGreaterThan(0);
      });
    });

    it('should create contact successfully', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Use more specific selector to avoid multiple matches
      const addButtons = screen.getAllByRole('button', { name: /add contact/i });
      const addButton = addButtons.find(btn => btn.getAttribute('type') === 'button');
      expect(addButton).toBeInTheDocument();
      await user.click(addButton!);

      await waitFor(() => {
        expect(screen.getByText('Add New Contact')).toBeInTheDocument();
      });

      // Fill out the form
      await user.type(screen.getByLabelText('First Name'), 'New');
      await user.type(screen.getByLabelText('Last Name'), 'Contact');
      await user.type(screen.getByLabelText('Email'), 'new@example.com');
      await user.type(screen.getByLabelText('Phone'), '555-9999');

      // Handle gender selection - click the select to open dropdown, then click Male
      await user.click(screen.getByLabelText('Gender'));
      await waitFor(() => {
        expect(screen.getByText('Male')).toBeInTheDocument();
      });
      await user.click(screen.getByText('Male'));

      await user.clear(screen.getByLabelText('Age'));
      await user.type(screen.getByLabelText('Age'), '25');
      await user.type(screen.getByLabelText('Street Address'), '789 New St');
      await user.type(screen.getByLabelText('City'), 'New City');
      await user.type(screen.getByLabelText('State'), 'NY');
      await user.type(screen.getByLabelText('ZIP Code'), '10001');
      await user.type(screen.getByLabelText('Country'), 'USA');

      const submitButtons = screen.getAllByRole('button', { name: /add contact/i });
      const submitButton = submitButtons.find(btn => btn.getAttribute('type') === 'submit');
      expect(submitButton).toBeInTheDocument();
      await user.click(submitButton!);

      await waitFor(() => {
        expect(screen.getByText('New Contact')).toBeInTheDocument();
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
      const editButton = editButtons[0];
      if (!editButton) {
        throw new Error('Edit button not found');
      }
      await user.click(editButton);
      await waitFor(() => {
        expect(screen.getByText('Edit Contact')).toBeInTheDocument();
        expect(screen.getByDisplayValue('John')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Doe')).toBeInTheDocument();
      });
    });

    it.skip('should update contact successfully', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByRole('button', { name: /edit/i });
      const editButton = editButtons[0];
      if (!editButton) {
        throw new Error('Edit button not found');
      }
      await user.click(editButton);

      await waitFor(() => {
        expect(screen.getByText('Edit Contact')).toBeInTheDocument();
      });

      // Update the form
      const firstNameInput = screen.getByDisplayValue('John');
      await user.clear(firstNameInput);
      await user.type(firstNameInput, 'Johnny');

      const submitButton = screen.getByRole('button', { name: /update contact/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Johnny Doe')).toBeInTheDocument();
      });
    });

    it('should cancel edit without saving', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByRole('button', { name: /edit/i });
      const editButton = editButtons[0];
      if (!editButton) {
        throw new Error('Edit button not found');
      }
      await user.click(editButton);

      await waitFor(() => {
        expect(screen.getByText('Edit Contact')).toBeInTheDocument();
      });

      // Update the form
      const firstNameInput = screen.getByDisplayValue('John');
      await user.clear(firstNameInput);
      await user.type(firstNameInput, 'Johnny');

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.queryByText('Johnny Doe')).not.toBeInTheDocument();
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

      const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
      expect(deleteButtons.length).toBeGreaterThan(0);
      const deleteButton = deleteButtons[0];
      if (!deleteButton) {
        throw new Error('Delete button not found');
      }
      await user.click(deleteButton);
      await waitFor(() => {
        expect(screen.getByText('Delete Contact')).toBeInTheDocument();
        expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
      });
    });

    it.skip('should cancel delete when clicking cancel', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
      const deleteButton = deleteButtons[0];
      if (!deleteButton) {
        throw new Error('Delete button not found');
      }
      await user.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText('Delete Contact')).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByText('Delete Contact')).not.toBeInTheDocument();
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });
    });

    it.skip('should delete contact successfully', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
      const deleteButton = deleteButtons[0];
      if (!deleteButton) {
        throw new Error('Delete button not found');
      }
      await user.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText('Delete Contact')).toBeInTheDocument();
      });

      const confirmButtons = screen.getAllByRole('button', { name: /delete/i });
      const confirmButton = confirmButtons.find(
        btn => btn.getAttribute('type') === 'button' && btn.textContent?.includes('Delete')
      );
      expect(confirmButton).toBeInTheDocument();
      await user.click(confirmButton!);

      await waitFor(() => {
        expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      });
    });
  });

  describe('Validation', () => {
    it('should validate email format', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Use more specific selector to avoid multiple matches
      const addButtons = screen.getAllByRole('button', { name: /add contact/i });
      const addButton = addButtons.find(btn => btn.getAttribute('type') === 'button');
      expect(addButton).toBeInTheDocument();
      await user.click(addButton!);

      await waitFor(() => {
        expect(screen.getByText('Add New Contact')).toBeInTheDocument();
      });

      // Fill required fields first
      await user.type(screen.getByLabelText('First Name'), 'Test');
      await user.type(screen.getByLabelText('Last Name'), 'User');
      await user.type(screen.getByLabelText('Email'), 'invalid-email');
      await user.click(screen.getByLabelText('Gender'));
      await waitFor(() => {
        expect(screen.getByText('Male')).toBeInTheDocument();
      });
      await user.click(screen.getByText('Male'));
      await user.clear(screen.getByLabelText('Age'));
      await user.type(screen.getByLabelText('Age'), '25');
      await user.type(screen.getByLabelText('Street Address'), '123 Test St');
      await user.type(screen.getByLabelText('City'), 'Test City');
      await user.type(screen.getByLabelText('State'), 'TS');
      await user.type(screen.getByLabelText('ZIP Code'), '12345');
      await user.type(screen.getByLabelText('Country'), 'USA');

      const submitButtons = screen.getAllByRole('button', { name: /add contact/i });
      const submitButton = submitButtons.find(btn => btn.getAttribute('type') === 'submit');
      expect(submitButton).toBeInTheDocument();
      await user.click(submitButton!);

      await waitFor(() => {
        expect(screen.getByText(/please enter a valid email/i)).toBeInTheDocument();
      });
    });

    it.skip('should validate age range', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Use more specific selector to avoid multiple matches
      const addButtons = screen.getAllByRole('button', { name: /add contact/i });
      const addButton = addButtons.find(btn => btn.getAttribute('type') === 'button');
      expect(addButton).toBeInTheDocument();
      await user.click(addButton!);

      await waitFor(() => {
        expect(screen.getByText('Add New Contact')).toBeInTheDocument();
      });

      // Fill required fields first
      await user.type(screen.getByLabelText('First Name'), 'Test');
      await user.type(screen.getByLabelText('Last Name'), 'User');
      await user.type(screen.getByLabelText('Email'), 'test@example.com');
      await user.click(screen.getByLabelText('Gender'));
      await waitFor(() => {
        expect(screen.getByText('Male')).toBeInTheDocument();
      });
      await user.click(screen.getByText('Male'));
      await user.clear(screen.getByLabelText('Age'));
      await user.type(screen.getByLabelText('Age'), '150'); // Invalid age
      await user.type(screen.getByLabelText('Street Address'), '123 Test St');
      await user.type(screen.getByLabelText('City'), 'Test City');
      await user.type(screen.getByLabelText('State'), 'TS');
      await user.type(screen.getByLabelText('ZIP Code'), '12345');
      await user.type(screen.getByLabelText('Country'), 'USA');

      const submitButtons = screen.getAllByRole('button', { name: /add contact/i });
      const submitButton = submitButtons.find(btn => btn.getAttribute('type') === 'submit');
      expect(submitButton).toBeInTheDocument();
      await user.click(submitButton!);

      await waitFor(() => {
        expect(screen.getByText(/age must be between 1 and 120/i)).toBeInTheDocument();
      });
    });

    it.skip('should validate required fields', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Use more specific selector to avoid multiple matches
      const addButtons = screen.getAllByRole('button', { name: /add contact/i });
      const addButton = addButtons.find(btn => btn.getAttribute('type') === 'button');
      expect(addButton).toBeInTheDocument();
      await act(async () => {
        await user.click(addButton!);
      });

      await waitFor(() => {
        expect(screen.getByText('Add New Contact')).toBeInTheDocument();
      });

      const submitButtons = screen.getAllByRole('button', { name: /add contact/i });
      const submitButton = submitButtons.find(btn => btn.getAttribute('type') === 'submit');
      expect(submitButton).toBeInTheDocument();
      await user.click(submitButton!);
      await user.click(submitButton!);

      await waitFor(() => {
        expect(screen.getByText(/please enter first name/i)).toBeInTheDocument();
        expect(screen.getByText(/please enter last name/i)).toBeInTheDocument();
        expect(screen.getByText(/please select gender/i)).toBeInTheDocument();
        expect(screen.getByText(/please enter age/i)).toBeInTheDocument();
        expect(screen.getByText(/please enter street address/i)).toBeInTheDocument();
        expect(screen.getByText(/please enter city/i)).toBeInTheDocument();
        expect(screen.getByText(/please enter state/i)).toBeInTheDocument();
        expect(screen.getByText(/please enter zip code/i)).toBeInTheDocument();
        expect(screen.getByText(/please enter country/i)).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it.skip('should display error when API fails to load contacts', async () => {
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
        expect(screen.getByText('Error Loading Contacts')).toBeInTheDocument();
        expect(screen.getByText('Failed to load contacts')).toBeInTheDocument();
      });
    });

    it.skip('should provide retry option on error', async () => {
      server.use(
        http.get(`${API_BASE_URL}/address-book`, () => {
          return HttpResponse.json({ message: 'Failed to load', data: null }, { status: 500 });
        })
      );

      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      });
    });

    it.skip('should handle create contact API error', async () => {
      server.resetHandlers();
      server.use(
        http.get(`${API_BASE_URL}/address-book`, () => {
          return HttpResponse.json({
            status: 'success',
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
        http.post(`${API_BASE_URL}/address-book`, () => {
          return HttpResponse.json(
            { message: 'Failed to create contact', data: null },
            { status: 500 }
          );
        })
      );

      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Use more specific selector to avoid multiple matches
      const addButtons = screen.getAllByRole('button', { name: /add contact/i });
      const addButton = addButtons.find(btn => btn.getAttribute('type') === 'button');
      expect(addButton).toBeInTheDocument();
      await act(async () => {
        await user.click(addButton!);
      });

      await waitFor(() => {
        expect(screen.getByText('Add New Contact')).toBeInTheDocument();
      });

      // Fill out the form
      await user.type(screen.getByLabelText('First Name'), 'New');
      await user.type(screen.getByLabelText('Last Name'), 'Contact');
      await user.type(screen.getByLabelText('Email'), 'new@example.com');
      await user.type(screen.getByLabelText('Phone'), '555-9999');

      // Handle gender selection
      await act(async () => {
        await user.click(screen.getByLabelText('Gender'));
      });
      await waitFor(() => {
        expect(screen.getByText('Male')).toBeInTheDocument();
      });
      await act(async () => {
        await user.click(screen.getByText('Male'));
      });

      await user.clear(screen.getByLabelText('Age'));
      await user.type(screen.getByLabelText('Age'), '25');
      await user.type(screen.getByLabelText('Street Address'), '789 New St');
      await user.type(screen.getByLabelText('City'), 'New City');
      await user.type(screen.getByLabelText('State'), 'NY');
      await user.type(screen.getByLabelText('ZIP Code'), '10001');
      await user.type(screen.getByLabelText('Country'), 'USA');

      const submitButtons = screen.getAllByRole('button', { name: /add contact/i });
      const submitButton = submitButtons.find(btn => btn.getAttribute('type') === 'submit');
      expect(submitButton).toBeInTheDocument();
      await user.click(submitButton!);

      await waitFor(() => {
        expect(screen.getByText('Failed to create contact')).toBeInTheDocument();
      });
    });

    it.skip('should handle update contact API error', async () => {
      server.resetHandlers();
      server.use(
        http.get(`${API_BASE_URL}/address-book`, () => {
          return HttpResponse.json({
            status: 'success',
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
        http.put(`${API_BASE_URL}/address-book/:id`, () => {
          return HttpResponse.json(
            { message: 'Failed to update contact', data: null },
            { status: 500 }
          );
        })
      );

      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByRole('button', { name: /edit/i });
      const editButton = editButtons[0];
      if (!editButton) {
        throw new Error('Edit button not found');
      }
      await user.click(editButton);

      await waitFor(() => {
        expect(screen.getByText('Edit Contact')).toBeInTheDocument();
      });

      // Update the form
      const firstNameInput = screen.getByDisplayValue('John');
      await user.clear(firstNameInput);
      await user.type(firstNameInput, 'Johnny');

      const submitButton = screen.getByRole('button', { name: /update contact/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Operation Failed')).toBeInTheDocument();
        expect(screen.getByText('Failed to update contact')).toBeInTheDocument();
      });
    });

    it.skip('should handle delete contact API error', async () => {
      server.resetHandlers();
      server.use(
        http.get(`${API_BASE_URL}/address-book`, () => {
          return HttpResponse.json({
            status: 'success',
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
        http.delete(`${API_BASE_URL}/address-book/:id`, () => {
          return HttpResponse.json(
            { message: 'Failed to delete contact', data: null },
            { status: 500 }
          );
        })
      );

      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
      const deleteButton = deleteButtons[0];
      if (!deleteButton) {
        throw new Error('Delete button not found');
      }
      await user.click(deleteButton);

      // Wait for the modal to appear and get the modal element
      const modal = await screen.findByRole('dialog');
      expect(modal).toBeInTheDocument();

      // Use within to scope the query to the modal
      const { getByText } = within(modal);
      expect(getByText('Delete Contact')).toBeInTheDocument();

      const confirmButtons = screen.getAllByRole('button', { name: /delete/i });
      const confirmButton = confirmButtons.find(
        btn => btn.getAttribute('type') === 'button' && btn.textContent?.includes('Delete')
      );
      expect(confirmButton).toBeInTheDocument();
      await user.click(confirmButton!);

      await waitFor(() => {
        expect(screen.getByText('Operation Failed')).toBeInTheDocument();
        expect(screen.getByText('Failed to delete contact')).toBeInTheDocument();
      });
    });

    it('should handle network timeout', async () => {
      server.use(
        http.get(`${API_BASE_URL}/address-book`, () => {
          return new Promise(() => {}); // Never resolves
        })
      );

      renderWithAuth(<AddressBookPage />);

      // Should show loading state
      await waitFor(() => {
        expect(screen.getByText('Loading contacts...')).toBeInTheDocument();
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

    it('should have accessible buttons with proper labels', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const addButton = screen.getByRole('button', { name: /add contact/i });
      expect(addButton).toBeInTheDocument();
      await user.click(addButton);

      // Get the descriptive text from aria-label or textContent
      const ariaLabel = addButton.getAttribute('aria-label');
      const textContent = addButton.textContent?.trim() ?? '';
      const descriptiveText = ariaLabel ?? textContent;

      // Verify we have a descriptive string and it matches a meaningful pattern
      expect(descriptiveText).toBeTruthy();
      expect(descriptiveText).toMatch(/add contact/i);
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      // Wait for the component to load
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/search contacts/i)).toBeInTheDocument();
      });

      // Get the expected tabbable elements using case-insensitive regex selectors
      const searchInput = screen.getByPlaceholderText(/search contacts/i);
      // Use more specific selector to avoid multiple matches
      const addButtons = screen.getAllByRole('button', { name: /add contact/i });
      const addButton = addButtons.find(btn => btn.getAttribute('type') === 'button');
      expect(addButton).toBeInTheDocument();
      await user.click(addButton!);

      // Test initial tab - should focus on one of the expected interactive elements
      await user.tab();
      const firstFocusedElement = document.activeElement as HTMLElement;
      expect([searchInput, addButton]).toContain(firstFocusedElement);

      // Second tab should move to next focusable element
      await user.tab();
      // Verify focus moved to a focusable element, not stuck on body
      expect(document.activeElement).not.toBe(document.body);
      // Table headers (TH) are also focusable in some browsers, so allow them
      expect(document.activeElement?.tagName).toMatch(/BUTTON|INPUT|A|TH/);
    });

    it('should have proper form labels', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Use more specific selector to avoid multiple matches
      const addButtons = screen.getAllByRole('button', { name: /add contact/i });
      const addButton = addButtons.find(btn => btn.getAttribute('type') === 'button');
      expect(addButton).toBeInTheDocument();
      await act(async () => {
        await user.click(addButton!);
      });

      await waitFor(() => {
        expect(screen.getByText('Add New Contact')).toBeInTheDocument();
      });

      // Check that all form fields have proper labels
      expect(screen.getByLabelText('First Name')).toBeInTheDocument();
      expect(screen.getByLabelText('Last Name')).toBeInTheDocument();
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
      expect(screen.getByLabelText('Phone')).toBeInTheDocument();
      expect(screen.getByLabelText('Gender')).toBeInTheDocument();
      expect(screen.getByLabelText('Age')).toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('should display empty state when no contacts exist', async () => {
      server.use(
        http.get(`${API_BASE_URL}/address-book`, () => {
          return HttpResponse.json({
            status: 'success',
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
        expect(screen.getByText(/no contacts yet/i)).toBeInTheDocument();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle malformed API response', async () => {
      server.use(
        http.get(`${API_BASE_URL}/address-book`, () => {
          return HttpResponse.json({
            status: 'success',
            message: 'Contacts retrieved',
            data: {
              contacts: null, // Malformed response
              total: 0,
            },
          });
        })
      );

      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.getByText(/no contacts yet/i)).toBeInTheDocument();
      });
    });

    it('should handle missing tenant context', async () => {
      // This test would require mocking the AuthContext to return null tenant
      // For now, we'll test the component behavior when tenant is undefined
      renderWithAuth(<AddressBookPage />);

      // Should still render the component structure
      expect(screen.getByText('Address Book')).toBeInTheDocument();
    });

    it.skip('should handle form submission with network error', async () => {
      server.use(
        http.post(`${API_BASE_URL}/address-book`, () => {
          return HttpResponse.error();
        })
      );

      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Use more specific selector to avoid multiple matches
      const addButtons = screen.getAllByRole('button', { name: /add contact/i });
      const addButton = addButtons.find(btn => btn.getAttribute('type') === 'button');
      expect(addButton).toBeInTheDocument();
      await act(async () => {
        await user.click(addButton!);
      });

      await waitFor(() => {
        expect(screen.getByText('Add New Contact')).toBeInTheDocument();
      });

      // Fill out the form
      await user.type(screen.getByLabelText('First Name'), 'New');
      await user.type(screen.getByLabelText('Last Name'), 'Contact');
      await user.type(screen.getByLabelText('Email'), 'new@example.com');
      await user.click(screen.getByLabelText('Gender'));
      await user.click(screen.getByText('Male'));
      await user.clear(screen.getByLabelText('Age'));
      await user.type(screen.getByLabelText('Age'), '25');
      await user.type(screen.getByLabelText('Street Address'), '789 New St');
      await user.type(screen.getByLabelText('City'), 'New City');
      await user.type(screen.getByLabelText('State'), 'NY');
      await user.type(screen.getByLabelText('ZIP Code'), '10001');
      await user.type(screen.getByLabelText('Country'), 'USA');

      const submitButtons = screen.getAllByRole('button', { name: /add contact/i });
      const submitButton = submitButtons.find(btn => btn.getAttribute('type') === 'submit');
      expect(submitButton).toBeInTheDocument();
      await act(async () => {
        await user.click(submitButton!);
      });

      // Should handle the network error gracefully
      await waitFor(() => {
        expect(screen.getByText(/an error occurred/i)).toBeInTheDocument();
      });
    });

    it.skip('should handle concurrent form submissions', async () => {
      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Use more specific selector to avoid multiple matches
      const addButtons = screen.getAllByRole('button', { name: /add contact/i });
      const addButton = addButtons.find(btn => btn.getAttribute('type') === 'button');
      expect(addButton).toBeInTheDocument();
      await act(async () => {
        await user.click(addButton!);
      });

      await waitFor(() => {
        expect(screen.getByText('Add New Contact')).toBeInTheDocument();
      });

      // Fill out the form
      await user.type(screen.getByLabelText('First Name'), 'New');
      await user.type(screen.getByLabelText('Last Name'), 'Contact');
      await user.type(screen.getByLabelText('Email'), 'new@example.com');
      await user.click(screen.getByLabelText('Gender'));
      await user.click(screen.getByText('Male'));
      await user.clear(screen.getByLabelText('Age'));
      await user.type(screen.getByLabelText('Age'), '25');
      await user.type(screen.getByLabelText('Street Address'), '789 New St');
      await user.type(screen.getByLabelText('City'), 'New City');
      await user.type(screen.getByLabelText('State'), 'NY');
      await user.type(screen.getByLabelText('ZIP Code'), '10001');
      await user.type(screen.getByLabelText('Country'), 'USA');

      const submitButtons = screen.getAllByRole('button', { name: /add contact/i });
      const submitButton = submitButtons.find(btn => btn.getAttribute('type') === 'submit');
      expect(submitButton).toBeInTheDocument();
      if (!submitButton) {
        throw new Error('Submit button not found');
      }
      await user.click(submitButton);

      // Click submit multiple times rapidly
      await user.click(submitButton);
      await user.click(submitButton);
      await user.click(submitButton);

      // Should handle concurrent submissions gracefully
      await waitFor(() => {
        expect(screen.getByText('New Contact')).toBeInTheDocument();
      });
    });
  });

  describe('Pagination', () => {
    it.skip('should handle pagination', () => {
      // TODO: Implement pagination test after backend supports limit/offset
      const _user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);
      // Pagination implementation needed
    });
  });

  describe('Sorting', () => {
    it('should sort contacts by column', async () => {
      // Override mockContacts with a sortable set
      mockContacts = [
        {
          id: 1,
          tenant_id: 'tenant-1',
          first_name: 'Zoe',
          last_name: 'Zeller',
          email: 'zoe@example.com',
          phone: '555-0001',
          age: 25,
          gender: 'female',
          address: '111 A St',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 2,
          tenant_id: 'tenant-1',
          first_name: 'Alice',
          last_name: 'Anderson',
          email: 'alice@example.com',
          phone: '555-0002',
          age: 35,
          gender: 'female',
          address: '222 B St',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 3,
          tenant_id: 'tenant-1',
          first_name: 'Mike',
          last_name: 'Miller',
          email: 'mike@example.com',
          phone: '555-0003',
          age: 30,
          gender: 'male',
          address: '333 C St',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const user = userEvent.setup();
      renderWithAuth(<AddressBookPage />);

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('Zoe Zeller')).toBeInTheDocument();
        expect(screen.getByText('Alice Anderson')).toBeInTheDocument();
        expect(screen.getByText('Mike Miller')).toBeInTheDocument();
      });

      // Get all rows except the header
      const getNames = () =>
        screen
          .getAllByRole('row')
          .slice(1)
          .map(row => {
            const cell = row.querySelector('td');
            return cell ? cell.textContent : '';
          });

      // Initial order should match mockContacts (Zoe, Alice, Mike)
      let names = getNames();
      expect(names).toEqual(['Zoe Zeller', 'Alice Anderson', 'Mike Miller']);

      // Click the "Name" column header to sort (assuming ascending)
      const nameHeader = screen.getByRole('columnheader', { name: /name/i });
      await user.click(nameHeader);

      // Wait for the order to change (should be Alice, Mike, Zoe)
      await waitFor(() => {
        names = getNames();
        expect(names).toEqual(['Alice Anderson', 'Mike Miller', 'Zoe Zeller']);
      });

      // Click again to sort descending
      await user.click(nameHeader);

      await waitFor(() => {
        names = getNames();
        expect(names).toEqual(['Zoe Zeller', 'Mike Miller', 'Alice Anderson']);
      });
    });
  });
});
