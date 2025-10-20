import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'bun:test';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../test-utils/mocks/server';
import { renderWithAuth } from '../../test-utils/render';
import { TenantsPage } from '../TenantsPage';
import type { _Tenant } from '../../types/auth';
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

    // Reset MSW handlers to default state
    server.resetHandlers();
  });

  afterEach(() => {
    // Clean up localStorage
    localStorage.removeItem('auth_token');
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
        const rows = screen.getAllByRole('row');
        // Should have header row + 2 tenant data rows (from backendMockTenants)
        expect(rows.length).toBe(3);
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
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByText(/add.*new.*tenant/i)).toBeTruthy();
      });
    });

    it('should have form fields in create modal', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      const createButtons = screen.getAllByRole('button', { name: /add.*tenant/i });
      // Use the first button which is the main create button in the header
      const createButton = createButtons[0]!;
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/tenant name/i)).toBeTruthy();
        expect(screen.getByPlaceholderText(/database url/i)).toBeTruthy();
      });
    });

    it('should validate required fields', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      const createButtons = screen.getAllByRole('button', { name: /add.*tenant/i });
      // Use the first button which is the main create button in the header
      const createButton = createButtons[0]!;
      await user.click(createButton);

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
      await user.click(editButtons[0]!);

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
      await user.click(editButtons[0]!);

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
      await user.click(deleteButtons[0]!);

      // Wait for the confirmation modal to be visible
      await waitFor(() => {
        expect(screen.getByText(/confirm|are you sure/i)).toBeTruthy();
      });

      // Find the ConfirmationModal component and click its cancel button
      const cancelButton = screen.getAllByRole('button', { name: /cancel/i })[0]!;
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
      const createButton = createButtons[0]!; // Main create button
      await user.click(createButton);

      const dbUrlInput = await screen.findByPlaceholderText(/database|db_url/i);
      await user.type(dbUrlInput, 'postgresql://user:pass@host:5432/db');

      // Click the submit button in the modal (should be the second "Add Tenant" button)
      const allButtonsWithAddTenant = screen.getAllByRole('button', { name: /add.*tenant/i });
      const submitButton = allButtonsWithAddTenant[1]!; // The modal submit button
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

      await user.keyboard('{Tab}');
      expect(document.activeElement).toBe(createButtons[0]);
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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
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

      // Get all tenant rows to determine actual page size
      const tenantRows = screen.getAllByRole('row').slice(1); // Skip header row
      const actualPageSize = tenantRows.length;

      // Assert we have the expected number of items
      expect(actualPageSize).toBe(defaultPageSize);

      // Assert first and last visible tenants based on page size
      expect(screen.getByText('Tenant 1')).toBeTruthy();
      expect(screen.getByText(`Tenant ${String(defaultPageSize)}`)).toBeTruthy();
      expect(screen.queryByText(`Tenant ${String(defaultPageSize + 1)}`)).not.toBeTruthy();
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
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: asTenantId('tenant-2'),
          name: 'Acme Corporation',
          db_url: 'postgres://localhost:5432/acme',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
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
});
