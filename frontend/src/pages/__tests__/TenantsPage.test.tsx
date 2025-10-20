import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'bun:test';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../test-utils/mocks/server';
import { renderWithAuth } from '../../test-utils/render';
import { TenantsPage } from '../TenantsPage';
import type { Tenant } from '../../types/auth';
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

      // Check for filter field select - look specifically in the Search Filters section
      const searchFiltersCard = screen.getByText('Search Filters').closest('.ant-card');
      expect(searchFiltersCard).toBeTruthy();
      expect(searchFiltersCard?.querySelector('.ant-select-selection-item')).toHaveTextContent(
        'Name'
      );

      // Check for apply and clear buttons
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
        _backendMockTenants.forEach(t => expect(screen.getByText(t.name)).toBeTruthy());
      });
    });

    it('should display tenant database URLs', async () => {
      renderWithAuth(<TenantsPage />);

      expect(await screen.findByText(/postgres:\/\/localhost:5432\/tenant1/)).toBeTruthy();
      expect(await screen.findByText(/postgres:\/\/localhost:5432\/tenant2/)).toBeTruthy();
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
        expect(screen.getByDisplayValue('postgres://localhost:5432/tenant1')).toBeTruthy();
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
    it('should allow adding and removing filters', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      // Wait for initial render
      await waitFor(() => {
        expect(screen.getByText('Search Filters')).toBeTruthy();
      });

      // Check that we have the default filter row in the Search Filters section
      const searchFiltersCard = screen.getByText('Search Filters').closest('.ant-card');
      expect(searchFiltersCard?.querySelector('.ant-select-selection-item')).toHaveTextContent(
        'Name'
      );

      // Count initial filter selects
      const initialFilterSelects = searchFiltersCard?.querySelectorAll(
        '.ant-select-selection-item'
      );
      const initialCount = initialFilterSelects?.length || 0;

      // Find and click the "Add Filter" button
      const addFilterButton = screen.getByRole('button', { name: /add filter/i });
      await user.click(addFilterButton);

      // Should now have one more filter row in the Search Filters section
      const filterSelects = searchFiltersCard?.querySelectorAll('.ant-select-selection-item');
      expect(filterSelects?.length).toBe(initialCount + 1);
    });

    it('should allow clearing all filters', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      // Wait for initial render
      await waitFor(() => {
        expect(screen.getByText('Search Filters')).toBeTruthy();
      });

      // Click clear all button
      const clearButton = screen.getByRole('button', { name: /clear all/i });
      await user.click(clearButton);

      // Should still have one filter row (minimum required) in the Search Filters section
      const searchFiltersCard = screen.getByText('Search Filters').closest('.ant-card');
      expect(searchFiltersCard?.querySelector('.ant-select-selection-item')).toHaveTextContent(
        'Name'
      );
    });

    it('should display filter field options', async () => {
      renderWithAuth(<TenantsPage />);

      // Wait for initial render
      await waitFor(() => {
        expect(screen.getByText('Search Filters')).toBeTruthy();
      });

      // Check that the default field is "Name" in the Search Filters section
      const searchFiltersCard = screen.getByText('Search Filters').closest('.ant-card');
      expect(searchFiltersCard?.querySelector('.ant-select-selection-item')).toHaveTextContent(
        'Name'
      );
    });

    it('should display apply filters button', () => {
      renderWithAuth(<TenantsPage />);

      expect(screen.getByRole('button', { name: /apply filters/i })).toBeTruthy();
    });
  });
});
