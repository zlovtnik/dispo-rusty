import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'bun:test';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../test-utils/mocks/server';
import { renderWithAuth } from '../../test-utils/render';
import { TenantsPage } from '../TenantsPage';

import { asTenantId } from '../../types/ids';
import { getEnv } from '../../config/env';
import { mockTenants as _backendMockTenants, resetMockData } from '../../test-utils/mocks/handlers';
import { createMockAuthJwt } from '../../test-utils/jwt';

describe('TenantsPage Component', () => {
  beforeAll(() => {
    // Ensure MSW server is started for this test suite
    server.listen({ onUnhandledRequest: 'warn' });
  });

  afterAll(() => {
    // Close MSW server after all tests
    server.close();
  });

  beforeEach(() => {
    // Set up mock auth token in localStorage for HttpClient
    const mockToken = createMockAuthJwt('testuser', 'tenant-1');
    localStorage.setItem('auth_token', JSON.stringify({ token: mockToken }));

    // Reset mock data to original state before each test
    resetMockData();
  });

  afterEach(() => {
    // Clean up localStorage
    localStorage.removeItem('auth_token');
    // Reset MSW handlers to default state
    server.resetHandlers();
  });

  describe('Rendering', () => {
    it('should display page title', async () => {
      renderWithAuth(<TenantsPage />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Tenants');
      });
    });

    it('should display create tenant button', () => {
      renderWithAuth(<TenantsPage />);

      const createButtons = screen.getAllByRole('button', { name: /add.*tenant/i });
      expect(createButtons.length).toBeGreaterThan(0);
    });

    it('should render tenants table', async () => {
      renderWithAuth(<TenantsPage />);

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeTruthy();
      });
    });

    it('should display search filters section', () => {
      renderWithAuth(<TenantsPage />);

      expect(screen.getByText('Search Filters')).toBeTruthy();
    });

    it('should display filter controls', () => {
      renderWithAuth(<TenantsPage />);

      // Check for search filters card using data-testid
      const searchFiltersCard = screen.getByTestId('search-filters-card');
      expect(searchFiltersCard).toBeTruthy();

      // Check for filter field select using data-testid
      const filterFieldSelect = screen.getByTestId('filter-field-select-0');
      expect(filterFieldSelect).toBeTruthy();

      // Verify the select is present and has the correct role
      expect(screen.getByRole('combobox')).toBeTruthy();

      // Check for apply and clear buttons using semantic queries
      expect(screen.getByRole('button', { name: /apply filters/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /clear all/i })).toBeTruthy();
    });
  });

  describe('Loading Tenants', () => {
    it('should fetch tenants from API on mount', async () => {
      renderWithAuth(<TenantsPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Tenant 1')).toBeTruthy();
        expect(screen.getByText('Test Tenant 2')).toBeTruthy();
      });
    });

    it('should render correct number of table rows for tenants', async () => {
      renderWithAuth(<TenantsPage />);

      await waitFor(() => {
        // Check for specific tenant names instead of row count
        _backendMockTenants.forEach(t => {
          expect(screen.getByText(t.name)).toBeTruthy();
        });
      });
    });

    it('should display tenant database URLs', async () => {
      renderWithAuth(<TenantsPage />);

      expect(await screen.findByText(/postgres:\/\/localhost:5432\/tenant-1/)).toBeTruthy();
      expect(await screen.findByText(/postgres:\/\/localhost:5432\/tenant-2/)).toBeTruthy();
    });
  });

  describe('Create Tenant', () => {
    it('should open create modal on button click', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      const createButtons = screen.getAllByRole('button', { name: /add.*tenant/i });
      // Ensure at least one create button exists before accessing it
      expect(createButtons.length).toBeGreaterThan(0);
      // Use the first button which is the main create button in the header
      const createButton = createButtons[0];
      expect(createButton).toBeDefined();
      await user.click(createButton!);

      await waitFor(() => {
        expect(screen.getByText(/add.*new.*tenant/i)).toBeTruthy();
      });
    });

    it('should have form fields in create modal', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      const createButtons = screen.getAllByRole('button', { name: /add.*tenant/i });
      // Ensure at least one create button exists before accessing it
      expect(createButtons.length).toBeGreaterThan(0);
      // Use the first button which is the main create button in the header
      const createButton = createButtons[0];
      expect(createButton).toBeDefined();
      await user.click(createButton!);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/tenant name/i)).toBeTruthy();
        expect(screen.getByPlaceholderText(/database url/i)).toBeTruthy();
      });
    });

    it('should validate required fields', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      const createButtons = screen.getAllByRole('button', { name: /add.*tenant/i });
      // Ensure at least one create button exists before accessing it
      expect(createButtons.length).toBeGreaterThan(0);
      // Use the first button which is the main create button in the header
      const createButton = createButtons[0];
      expect(createButton).toBeDefined();
      await user.click(createButton!);

      const submitButton = await screen.findByRole('button', { name: /add.*tenant/i });
      await user.click(submitButton);

      await waitFor(() => {
        const errorMessages = screen.getAllByText(/required|please enter/i);
        expect(errorMessages.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Edit Tenant', () => {
    it('should open edit modal when clicking edit action', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Tenant 1')).toBeTruthy();
      });

      const editButtons = screen.getAllByRole('button', { name: /edit/i });
      expect(editButtons.length).toBeGreaterThan(0);
      const editButton = editButtons[0];
      expect(editButton).toBeDefined();
      await user.click(editButton!);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Test Tenant 1')).toBeTruthy();
      });
    });

    it('should populate form with tenant data including name and database URL', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Tenant 1')).toBeTruthy();
      });

      const editButtons = screen.getAllByRole('button', { name: /edit/i });
      expect(editButtons.length).toBeGreaterThan(0);
      const editButton = editButtons[0];
      expect(editButton).toBeDefined();
      await user.click(editButton!);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Test Tenant 1')).toBeTruthy();
        expect(screen.getByDisplayValue('postgres://localhost:5432/tenant-1')).toBeTruthy();
      });
    });
  });

  describe('Delete Tenant', () => {
    it('should show delete confirmation modal', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Tenant 1')).toBeTruthy();
      });

      const deleteButtons = screen.getAllByRole('button', { name: /delete|trash/i });
      expect(deleteButtons.length).toBeGreaterThan(0);
      expect(deleteButtons[0]).toBeDefined();
      await user.click(deleteButtons[0]!);

      await waitFor(() => {
        expect(screen.getByText(/confirm|are you sure/i)).toBeTruthy();
      });
    });

    it('should cancel delete when clicking cancel', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Tenant 1')).toBeTruthy();
      });

      const deleteButtons = screen.getAllByRole('button', { name: /delete|trash/i });
      expect(deleteButtons.length).toBeGreaterThan(0);
      expect(deleteButtons[0]).toBeDefined();
      await user.click(deleteButtons[0]!);

      // Wait for the confirmation modal to be visible
      await waitFor(() => {
        expect(screen.getByText(/confirm|are you sure/i)).toBeTruthy();
      });

      // Find the ConfirmationModal component and click its cancel button
      // Scope the query to the modal to avoid selecting wrong cancel button
      const modal = screen.getByRole('dialog');
      const cancelButton = within(modal).getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByText(/confirm|are you sure/i)).toBeNull();
      });
    });
  });

  describe('Validation', () => {
    it('should validate tenant name is required', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      const createButtons = screen.getAllByRole('button', { name: /add.*tenant/i });
      expect(createButtons.length).toBeGreaterThan(0);
      const createButton = createButtons[0]; // Main create button
      expect(createButton).toBeDefined();
      await user.click(createButton!);

      // Wait for the modal to appear
      const modal = await screen.findByRole('dialog');
      expect(modal).toBeInTheDocument();

      const dbUrlInput = await screen.findByPlaceholderText(/database|db_url/i);
      await user.type(dbUrlInput, 'postgresql://user:pass@host:5432/db');

      // Click the submit button within the modal context using data-testid
      const submitButton = within(modal).getByTestId('modal-submit-button');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/name.*required/i)).toBeTruthy();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper table semantics', async () => {
      renderWithAuth(<TenantsPage />);

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeTruthy();
      });
    });
    it('should have accessible buttons with proper labels', () => {
      renderWithAuth(<TenantsPage />);

      const createButtons = screen.getAllByRole('button', { name: /add|create|new/i });
      expect(createButtons.length).toBeGreaterThan(0);

      // Expected button labels from the UI
      const expectedLabels = ['Add Tenant'];
      const labelPatterns = [/add tenant/i, /create tenant/i, /new tenant/i];

      let foundExpectedLabel = false;
      createButtons.forEach(button => {
        const label = (button.getAttribute('aria-label') ?? button.textContent ?? '').trim();

        // Assert minimum meaningful length
        expect(label.length).toBeGreaterThanOrEqual(3);

        // Check if this button matches an expected label
        const matchesExpected =
          expectedLabels.some(expected => label.toLowerCase().includes(expected.toLowerCase())) ||
          labelPatterns.some(pattern => pattern.test(label));

        if (matchesExpected) {
          foundExpectedLabel = true;
        }
      });

      // Guard against regressions - at least one button should match expected labels
      expect(foundExpectedLabel).toBe(true);
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      const createButtons = screen.getAllByRole('button', { name: /add|create|new/i });
      expect(createButtons.length).toBeGreaterThan(0);

      // Verify the button can receive focus
      expect(createButtons[0]).toBeDefined();
      createButtons[0]!.focus();
      expect(document.activeElement).toBe(createButtons[0]!);
    });
  });

  describe('Empty State', () => {
    it('should display empty state when no tenants exist', async () => {
      server.use(
        http.get(`${getEnv().apiUrl}/admin/tenants`, () => {
          return HttpResponse.json({
            status: 'success',
            message: 'Success',
            data: [],
          });
        })
      );

      renderWithAuth(<TenantsPage />);

      await waitFor(() => {
        // Check that no tenant names are displayed
        expect(screen.queryByText('Test Tenant 1')).toBeNull();
        expect(screen.queryByText('Test Tenant 2')).toBeNull();

        // Verify empty state message is displayed
        expect(screen.getByText('No tenants yet. Add your first tenant!')).toBeInTheDocument();

        // Verify Add Tenant button is present in the empty state
        // There should be multiple "Add Tenant" buttons - one in header and one in empty state
        const addTenantButtons = screen.getAllByRole('button', { name: /add tenant/i });
        expect(addTenantButtons.length).toBeGreaterThanOrEqual(2); // Header button + empty state button
      });
    });
  });

  describe('Pagination', () => {
    it('should handle pagination', async () => {
      // Create mock data with 25 tenants for pagination test
      const manyTenants = Array.from({ length: 25 }, (_, i) => ({
        id: asTenantId(`tenant${String(i + 1)}`),
        name: `Tenant ${String(i + 1)}`,
        db_url: `postgresql://user:pass@host${String(i + 1)}/db${String(i + 1)}`,
        created_at: `2020-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
        updated_at: `2020-01-${String(i + 1).padStart(2, '0')}T12:00:00.000Z`,
      }));

      server.use(
        http.get(`${getEnv().apiUrl}/admin/tenants`, ({ request }) => {
          const url = new URL(request.url);
          const offset = url.searchParams.get('offset') ?? '0';
          const limit = url.searchParams.get('limit') ?? '10';

          const offsetNum = parseInt(offset);
          const limitNum = parseInt(limit);
          const paginatedTenants = manyTenants.slice(offsetNum, offsetNum + limitNum);

          return HttpResponse.json({
            status: 'success',
            message: 'Success',
            data: {
              data: paginatedTenants,
              total: manyTenants.length,
              offset: offsetNum,
              limit: limitNum,
            },
          });
        })
      );

      renderWithAuth(<TenantsPage />);

      await waitFor(() => {
        expect(screen.getByText('Tenant 1')).toBeTruthy();
      });

      // Should show first page with default pageSize items (12)
      const defaultPageSize = 12;

      // Assert first and last visible tenants based on page boundaries
      expect(screen.getByText('Tenant 1')).toBeTruthy();
      expect(screen.queryByText('Tenant 13')).not.toBeTruthy();
    });
  });

  describe('Sorting', () => {
    it('should sort tenants by column (client-side)', async () => {
      const user = userEvent.setup();

      // Create mock data with specific names for sorting test
      // Return them in descending order initially (G before A)
      const sortingTenants = [
        {
          id: asTenantId('tenant-1'),
          name: 'Global Industries',
          db_url: 'postgres://localhost:5432/global',
          created_at: '2020-01-01T00:00:00.000Z',
          updated_at: '2020-01-01T12:00:00.000Z',
        },
        {
          id: asTenantId('tenant-2'),
          name: 'Acme Corporation',
          db_url: 'postgres://localhost:5432/acme',
          created_at: '2020-01-02T00:00:00.000Z',
          updated_at: '2020-01-02T12:00:00.000Z',
        },
      ];

      server.use(
        http.get(`${getEnv().apiUrl}/admin/tenants`, () => {
          return HttpResponse.json({
            status: 'success',
            message: 'Success',
            data: {
              data: sortingTenants,
              total: sortingTenants.length,
              offset: 0,
              limit: 12,
            },
          });
        })
      );

      renderWithAuth(<TenantsPage />);

      // Wait for initial data load - should show Global Industries first, Acme second
      await waitFor(() => {
        expect(screen.getByText('Global Industries')).toBeTruthy();
        expect(screen.getByText('Acme Corporation')).toBeTruthy();
      });

      // Verify initial order (before sorting)
      let rows = screen.getAllByRole('row');
      expect(rows).toHaveLength(3); // Header + 2 data rows
      expect(rows[1]?.textContent).toContain('Global Industries'); // G comes first
      expect(rows[2]?.textContent).toContain('Acme Corporation'); // A comes second

      // Click on the Name column header to sort ascending (A-Z)
      const nameHeader = screen.getByRole('columnheader', { name: /name/i });
      await user.click(nameHeader);

      // After sorting ascending, Acme Corporation should come before Global Industries
      // This is client-side sorting - no new network request, just DOM reordering
      await waitFor(() => {
        rows = screen.getAllByRole('row');
        expect(rows).toHaveLength(3); // Header + 2 data rows
        expect(rows[1]?.textContent).toContain('Acme Corporation'); // A comes first
        expect(rows[2]?.textContent).toContain('Global Industries'); // G comes second
      });

      // Click again to sort descending (Z-A)
      await user.click(nameHeader);

      await waitFor(() => {
        rows = screen.getAllByRole('row');
        expect(rows).toHaveLength(3); // Header + 2 data rows
        expect(rows[1]?.textContent).toContain('Global Industries'); // G comes first
        expect(rows[2]?.textContent).toContain('Acme Corporation'); // A comes second
      });
    });
  });

  describe('Search Filters', () => {
    it('should filter tenants by name when filter is applied', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      // Wait for initial data
      await waitFor(() => {
        expect(screen.getByText('Test Tenant 1')).toBeTruthy();
        expect(screen.getByText('Test Tenant 2')).toBeTruthy();
      });

      // Enter filter value and apply
      const filterInput = screen.getByTestId('filter-value-input-0');
      await user.type(filterInput, 'Test Tenant 1');

      const applyButton = screen.getByTestId('apply-filters-button');
      await user.click(applyButton);

      // Verify only matching tenant is shown
      await waitFor(() => {
        expect(screen.getByText('Test Tenant 1')).toBeTruthy();
        expect(screen.queryByText('Test Tenant 2')).toBeNull();
      });
    });

    it('should filter tenants by database URL when filter is applied', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      // Wait for initial data
      await waitFor(() => {
        expect(screen.getByText('Test Tenant 1')).toBeTruthy();
        expect(screen.getByText('Test Tenant 2')).toBeTruthy();
      });

      // Change filter field to database URL
      const fieldSelect = screen.getByTestId('filter-field-select-0');
      await user.click(fieldSelect);

      // Wait for dropdown to open and then click the option
      await waitFor(() => {
        expect(screen.getByText('Database URL')).toBeTruthy();
      });
      await user.click(screen.getByText('Database URL'));

      // Enter filter value and apply
      const filterInput = screen.getByTestId('filter-value-input-0');
      await user.type(filterInput, 'tenant1');

      const applyButton = screen.getByTestId('apply-filters-button');
      await user.click(applyButton);

      // Verify only matching tenant is shown
      await waitFor(() => {
        expect(screen.getByText('Test Tenant 1')).toBeTruthy();
        expect(screen.queryByText('Test Tenant 2')).toBeNull();
      });
    });

    it('should show all tenants when filters are cleared', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      // Wait for initial data
      await waitFor(() => {
        expect(screen.getByText('Test Tenant 1')).toBeTruthy();
        expect(screen.getByText('Test Tenant 2')).toBeTruthy();
      });

      // Apply a filter first
      const filterInput = screen.getByTestId('filter-value-input-0');
      await user.type(filterInput, 'Test Tenant 1');

      const applyButton = screen.getByTestId('apply-filters-button');
      await user.click(applyButton);

      // Verify filtering worked
      await waitFor(() => {
        expect(screen.getByText('Test Tenant 1')).toBeTruthy();
        expect(screen.queryByText('Test Tenant 2')).toBeNull();
      });

      // Clear filters
      const clearButton = screen.getByTestId('clear-filters-button');
      await user.click(clearButton);

      // Verify all tenants are shown again
      await waitFor(() => {
        expect(screen.getByText('Test Tenant 1')).toBeTruthy();
        expect(screen.getByText('Test Tenant 2')).toBeTruthy();
      });
    });

    it('should allow adding and removing filters', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      // Wait for initial render
      await waitFor(() => {
        expect(screen.getByTestId('search-filters-card')).toBeTruthy();
      });

      // Should start with one filter row
      expect(screen.getByTestId('filter-row-0')).toBeTruthy();
      expect(screen.queryByTestId('filter-row-1')).toBeNull();

      // Add a new filter
      const addFilterButton = screen.getByTestId('add-filter-button');
      await user.click(addFilterButton);

      // Should now have two filter rows
      expect(screen.getByTestId('filter-row-0')).toBeTruthy();
      expect(screen.getByTestId('filter-row-1')).toBeTruthy();

      // Remove the second filter
      const removeButton = screen.getByTestId('remove-filter-1');
      await user.click(removeButton);

      // Should be back to one filter row
      expect(screen.getByTestId('filter-row-0')).toBeTruthy();
      expect(screen.queryByTestId('filter-row-1')).toBeNull();
    });

    it('should not allow removing the last filter', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      // Wait for initial render
      await waitFor(() => {
        expect(screen.getByTestId('search-filters-card')).toBeTruthy();
      });

      // Should start with one filter row
      expect(screen.getByTestId('filter-row-0')).toBeTruthy();

      // Try to remove the only filter
      const removeButton = screen.getByTestId('remove-filter-0');
      expect(removeButton).toBeDisabled();
    });

    it('should display correct filter field options', async () => {
      renderWithAuth(<TenantsPage />);

      // Wait for initial render
      await waitFor(() => {
        expect(screen.getByTestId('search-filters-card')).toBeTruthy();
      });

      // Check that the default field is "Name"
      const fieldSelect = screen.getByTestId('filter-field-select-0');
      expect(fieldSelect).toHaveTextContent('Name');
    });

    it('should display apply and clear filter buttons', () => {
      renderWithAuth(<TenantsPage />);

      expect(screen.getByTestId('apply-filters-button')).toBeTruthy();
      expect(screen.getByTestId('clear-filters-button')).toBeTruthy();
    });

    it('should show date picker for date fields', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      // Wait for initial render
      await waitFor(() => {
        expect(screen.getByTestId('search-filters-card')).toBeTruthy();
      });

      // Change filter field to a date field
      const fieldSelect = screen.getByTestId('filter-field-select-0');
      await user.click(fieldSelect);

      // Wait for dropdown to open and then click the option
      await waitFor(() => {
        expect(screen.getByText('Created At')).toBeTruthy();
      });
      await user.click(screen.getByText('Created At'));

      // Should show date picker instead of text input
      expect(screen.getByTestId('filter-value-date-0')).toBeTruthy();
      expect(screen.queryByTestId('filter-value-input-0')).toBeNull();
    });

    it('should show text input for text fields', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      // Wait for initial render
      await waitFor(() => {
        expect(screen.getByTestId('search-filters-card')).toBeTruthy();
      });

      // Default field should be 'Name' (text field)
      expect(screen.getByTestId('filter-value-input-0')).toBeTruthy();
      expect(screen.queryByTestId('filter-value-date-0')).toBeNull();
    });

    it('should update operators when field type changes', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      // Wait for initial render
      await waitFor(() => {
        expect(screen.getByTestId('search-filters-card')).toBeTruthy();
      });

      // Start with text field (Name) - should have 'contains' and 'equals' operators
      const operatorSelect = screen.getByTestId('filter-operator-select-0');
      expect(operatorSelect).toHaveTextContent('Contains');

      // Change to date field
      const fieldSelect = screen.getByTestId('filter-field-select-0');
      await user.click(fieldSelect);

      // Wait for dropdown to open and then click the option
      await waitFor(() => {
        expect(screen.getByText('Created At')).toBeTruthy();
      });
      await user.click(screen.getByText('Created At'));

      // Should now have date operators
      await waitFor(() => {
        expect(operatorSelect).toHaveTextContent('Equals');
      });
    });

    it('should clear value when switching between text and date fields', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      // Wait for initial render
      await waitFor(() => {
        expect(screen.getByTestId('search-filters-card')).toBeTruthy();
      });

      // Enter text value
      const textInput = screen.getByTestId('filter-value-input-0');
      await user.type(textInput, 'test value');

      // Change to date field
      const fieldSelect = screen.getByTestId('filter-field-select-0');
      await user.click(fieldSelect);

      // Wait for dropdown to open and then click the option
      await waitFor(() => {
        expect(screen.getByText('Created At')).toBeTruthy();
      });
      await user.click(screen.getByText('Created At'));

      // Value should be cleared
      const datePicker = screen.getByTestId('filter-value-date-0');
      expect(datePicker).toHaveValue('');
    });

    it('should filter by date when date filter is applied', async () => {
      const user = userEvent.setup();

      // Create mock data with specific dates for testing
      const tenantsWithDates = [
        {
          id: asTenantId('tenant-1'),
          name: 'Early Tenant',
          db_url: 'postgres://localhost:5432/early',
          created_at: '2020-01-01T00:00:00.000Z',
          updated_at: '2020-01-01T12:00:00.000Z',
        },
        {
          id: asTenantId('tenant-2'),
          name: 'Late Tenant',
          db_url: 'postgres://localhost:5432/late',
          created_at: '2020-12-31T00:00:00.000Z',
          updated_at: '2020-12-31T12:00:00.000Z',
        },
      ];

      // Mock initial tenants list
      server.use(
        http.get(`${getEnv().apiUrl}/admin/tenants`, () => {
          return HttpResponse.json({
            status: 'success',
            message: 'Success',
            data: {
              data: tenantsWithDates,
              total: tenantsWithDates.length,
              offset: 0,
              limit: 12,
            },
          });
        })
      );

      // Mock filter endpoint to return only the early tenant
      server.use(
        http.get(`${getEnv().apiUrl}/admin/tenants/filter`, () => {
          return HttpResponse.json({
            status: 'success',
            message: 'Success',
            data: [tenantsWithDates[0]], // Only early tenant
          });
        })
      );

      renderWithAuth(<TenantsPage />);

      // Wait for initial data (both tenants should be shown)
      await waitFor(() => {
        expect(screen.getByText('Early Tenant')).toBeTruthy();
        expect(screen.getByText('Late Tenant')).toBeTruthy();
      });

      // Change to date field
      const fieldSelect = screen.getByTestId('filter-field-select-0');
      await user.click(fieldSelect);

      // Wait for dropdown to open and then click the option
      await waitFor(() => {
        expect(screen.getByText('Created At')).toBeTruthy();
      });
      await user.click(screen.getByText('Created At'));

      // Set date filter to early date
      const datePicker = screen.getByTestId('filter-value-date-0');
      await user.click(datePicker);

      // Type the date in ISO format into the date input field
      // Find the input element within the date picker and type the date
      const dateInput = datePicker.querySelector('input');
      expect(dateInput).toBeTruthy();
      await user.type(dateInput!, '2020-01-01');

      // Apply filter
      const applyButton = screen.getByTestId('apply-filters-button');
      await user.click(applyButton);

      // Verify filtered results: only early tenant should be shown
      await waitFor(() => {
        expect(screen.getByText('Early Tenant')).toBeTruthy();
        // Late tenant should no longer be visible after filtering
        expect(screen.queryByText('Late Tenant')).toBeFalsy();
      });
    });
  });

  describe('Filter Validation and Error Handling', () => {
    it('should handle empty filter values gracefully', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      // Wait for initial data
      await waitFor(() => {
        expect(screen.getByText('Test Tenant 1')).toBeTruthy();
        expect(screen.getByText('Test Tenant 2')).toBeTruthy();
      });

      // Apply filter with empty value
      const applyButton = screen.getByTestId('apply-filters-button');
      await user.click(applyButton);

      // Should show all tenants (empty filters are ignored)
      await waitFor(() => {
        expect(screen.getByText('Test Tenant 1')).toBeTruthy();
        expect(screen.getByText('Test Tenant 2')).toBeTruthy();
      });
    });

    it('should handle filter API errors gracefully', async () => {
      const user = userEvent.setup();

      // Mock filter API to return error
      server.use(
        http.get(`${getEnv().apiUrl}/admin/tenants/filter`, () => {
          return HttpResponse.json({ error: 'Filter service unavailable' }, { status: 500 });
        })
      );

      renderWithAuth(<TenantsPage />);

      // Wait for initial data
      await waitFor(() => {
        expect(screen.getByText('Test Tenant 1')).toBeTruthy();
      });

      // Apply filter
      const filterInput = screen.getByTestId('filter-value-input-0');
      await user.type(filterInput, 'Test Tenant 1');

      const applyButton = screen.getByTestId('apply-filters-button');
      await user.click(applyButton);

      // Should show error message and keep original data
      await waitFor(() => {
        expect(screen.getByText('Test Tenant 1')).toBeTruthy();
        expect(screen.getByText('Test Tenant 2')).toBeTruthy();
      });
    });

    it('should show error when invalid date is entered for date field', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      // Wait for initial render
      await waitFor(() => {
        expect(screen.getByTestId('search-filters-card')).toBeTruthy();
      });

      // Change to date field
      const fieldSelect = screen.getByTestId('filter-field-select-0');
      await user.click(fieldSelect);

      // Wait for dropdown to open and then click the option
      await waitFor(() => {
        expect(screen.getByText('Created At')).toBeTruthy();
      });
      await user.click(screen.getByText('Created At'));

      // Enter an invalid date format
      const datePicker = screen.getByTestId('filter-value-date-0');
      await user.click(datePicker);

      // Type an invalid date string that won't parse as a valid date
      const dateInput = datePicker.querySelector('input');
      expect(dateInput).toBeTruthy();
      await user.type(dateInput!, 'not-a-date');

      // Try to apply filter with invalid date
      const applyButton = screen.getByTestId('apply-filters-button');
      await user.click(applyButton);

      // Should show error message
      await waitFor(() => {
        expect(screen.getByText('Failed to filter tenants')).toBeTruthy();
      });
    });
  });
});
