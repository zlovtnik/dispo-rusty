import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'bun:test';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../test-utils/mocks/server';
import { renderWithAuth } from '../../test-utils/render';
import { TenantsPage } from '../TenantsPage';
import type { Tenant } from '../../types/auth';
import { asTenantId } from '../../types/ids';
import { getEnv } from '../../config/env';
import { mockTenants as backendMockTenants } from '../../test-utils/mocks/handlers';
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
    const { resetMockData } = require('../../test-utils/mocks/handlers');
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
        expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Tenants');
      });
    });

    it('should display create tenant button', () => {
      renderWithAuth(<TenantsPage />);

      expect(screen.getByRole('button', { name: /add|create|new/i })).toBeTruthy();
    });

    it('should render tenants table', async () => {
      renderWithAuth(<TenantsPage />);

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeTruthy();
      });
    });

    it('should display search input', () => {
      renderWithAuth(<TenantsPage />);

      expect(screen.getByPlaceholderText(/search/i)).toBeTruthy();
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

    it('should display tenant names in table', async () => {
      renderWithAuth(<TenantsPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Tenant 1')).toBeTruthy();
        expect(screen.getByText('Test Tenant 2')).toBeTruthy();
      });
    });

    it('should display tenant database URLs', async () => {
      renderWithAuth(<TenantsPage />);

      await waitFor(async () => {
        expect(await screen.findByText(/postgres:\/\/localhost:5432\/tenant1/)).toBeTruthy();
        expect(await screen.findByText(/postgres:\/\/localhost:5432\/tenant2/)).toBeTruthy();
      });
    });
  });

  describe('Search Functionality', () => {
    it('should filter tenants by name', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Tenant 1')).toBeTruthy();
      });

      const searchInput = screen.getByPlaceholderText(/search/i);
      await user.type(searchInput, 'Test Tenant 1');
      await waitFor(() => {
        expect(screen.getByText('Test Tenant 1')).toBeTruthy();
      });
    });

    it('should clear search results', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Tenant 1')).toBeTruthy();
      });

      const searchInput = screen.getByPlaceholderText(/search/i);
      await user.type(searchInput, 'Test Tenant 2');
      await user.clear(searchInput);

      await waitFor(() => {
        expect(screen.getByText('Test Tenant 1')).toBeTruthy();
      });
    });
  });

  describe('Create Tenant', () => {
    it('should open create modal on button click', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      const createButton = screen.getByRole('button', { name: /add|create|new/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByText(/create|new|add.*tenant/i)).toBeTruthy();
      });
    });

    it('should have form fields in create modal', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      const createButton = screen.getByRole('button', { name: /add|create|new/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/name/i)).toBeTruthy();
        expect(screen.getByPlaceholderText(/domain/i)).toBeTruthy();
      });
    });

    it('should validate required fields', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      const createButton = screen.getByRole('button', { name: /add|create|new/i });
      await user.click(createButton);

      const submitButton = await screen.findByRole('button', { name: /submit|save|create/i });
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

    it('should populate form with tenant data', async () => {
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

      const cancelButton = await screen.findByRole('button', { name: /cancel/i });
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

      const createButton = screen.getByRole('button', { name: /add|create|new/i });
      await user.click(createButton);

      const domainInput = await screen.findByPlaceholderText(/domain/i);
      await user.type(domainInput, 'test.example.com');

      const submitButton = screen.getByRole('button', { name: /submit|save/i });
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
      createButtons.forEach(button => {
        expect(button.getAttribute('aria-label') || button.textContent).toBeDefined();
      });
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      const createButtons = screen.getAllByRole('button', { name: /add|create|new/i });
      expect(createButtons.length).toBeGreaterThan(0);

      await user.keyboard('{Tab}');
      expect(document.activeElement).toBeDefined();
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
        expect(screen.queryByText('Test Tenant 1')).not.toBeTruthy();
        expect(screen.queryByText('Test Tenant 2')).not.toBeTruthy();
      });
    });
  });

  describe('Pagination', () => {
    it('should handle pagination', async () => {
      // Create mock data with 25 tenants for pagination test
      const manyTenants = Array.from({ length: 25 }, (_, i) => ({
        id: asTenantId(`tenant${i + 1}`),
        name: `Tenant ${i + 1}`,
        db_url: `postgresql://user:pass@host${i + 1}/db${i + 1}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      server.use(
        http.get(`${getEnv().apiUrl}/admin/tenants`, ({ request }) => {
          const url = new URL(request.url);
          const offset = url.searchParams.get('offset') || '0';
          const limit = url.searchParams.get('limit') || '10';

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

      // Should show first page with 12 items (default pageSize in component)
      expect(screen.getByText('Tenant 1')).toBeTruthy();
      expect(screen.getByText('Tenant 12')).toBeTruthy();
      expect(screen.queryByText('Tenant 13')).not.toBeTruthy();
    });
  });

  describe('Sorting', () => {
    it('should sort tenants by column', async () => {
      const user = userEvent.setup();

      // Create mock data with specific names for sorting test
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

      await waitFor(() => {
        expect(screen.getByText('Acme Corporation')).toBeTruthy();
      });

      // Click on the Name column header to sort
      const nameHeader = screen.getByRole('columnheader', { name: /name/i });
      await user.click(nameHeader);

      // After sorting ascending, Acme Corporation should come before Global Industries
      await waitFor(() => {
        const rows = screen.getAllByRole('row');
        // First data row should contain Acme Corporation (A comes before G)
        expect(rows).toHaveLength(3); // Header + 2 data rows
        expect(rows[1]?.textContent).toContain('Acme Corporation');
      });
    });
  });
});
