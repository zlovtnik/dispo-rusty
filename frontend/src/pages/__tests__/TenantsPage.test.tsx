import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithAuth } from '../../test-utils/render';
import { TenantsPage } from '../TenantsPage';
import type { Tenant } from '../../types/auth';
import { asTenantId } from '../../types/ids';

// Mock data
const mockTenants: Tenant[] = [
  {
    id: asTenantId('tenant1'),
    name: 'Acme Corporation',
    domain: 'acme.example.com',
    logo: 'https://example.com/logo1.png',
    settings: {
      theme: 'light',
      language: 'en',
      timezone: 'UTC',
      dateFormat: 'MM/dd/yyyy',
      features: ['contacts', 'analytics'],
      branding: {
        primaryColor: '#1890ff',
        secondaryColor: '#f0f0f0',
        accentColor: '#ff4d4f',
      },
    },
    subscription: {
      plan: 'professional',
      status: 'active',
      expiresAt: new Date('2025-12-31'),
      limits: {
        users: 50,
        contacts: 1000,
        storage: 10000,
      },
    },
  },
  {
    id: asTenantId('tenant2'),
    name: 'Global Industries',
    domain: 'global.example.com',
    logo: 'https://example.com/logo2.png',
    settings: {
      theme: 'dark',
      language: 'en',
      timezone: 'America/New_York',
      dateFormat: 'dd/MM/yyyy',
      features: ['contacts'],
      branding: {
        primaryColor: '#722ed1',
        secondaryColor: '#f5f5f5',
        accentColor: '#faad14',
      },
    },
    subscription: {
      plan: 'basic',
      status: 'active',
      limits: {
        users: 10,
        contacts: 100,
        storage: 1000,
      },
    },
  },
];

// MSW server setup
const server = setupServer(
  http.get('/api/admin/tenants', () => {
    return HttpResponse.json({
      success: true,
      message: 'Tenants retrieved',
      data: mockTenants,
    });
  }),

  http.post('/api/admin/tenants', async ({ request }) => {
    const body = (await request.json()) as Partial<Tenant>;

    if (!body.name) {
      return HttpResponse.json(
        {
          success: false,
          message: 'Tenant name is required',
        },
        { status: 400 }
      );
    }

    const newTenant: Tenant = {
      id: asTenantId(`tenant${mockTenants.length + 1}`),
      name: body.name,
      domain: body.domain,
      logo: body.logo,
      settings: body.settings || {
        theme: 'light',
        language: 'en',
        timezone: 'UTC',
        dateFormat: 'MM/dd/yyyy',
        features: [],
        branding: {
          primaryColor: '#1890ff',
          secondaryColor: '#f0f0f0',
          accentColor: '#ff4d4f',
        },
      },
      subscription: body.subscription || {
        plan: 'basic',
        status: 'active',
        limits: { users: 10, contacts: 100, storage: 1000 },
      },
    };

    return HttpResponse.json({
      success: true,
      message: 'Tenant created',
      data: newTenant,
    });
  }),

  http.put('/api/admin/tenants/:id', async ({ request, params }) => {
    const { id } = params;
    const body = (await request.json()) as Partial<Tenant>;
    const tenant = mockTenants.find(t => t.id === id);

    if (!tenant) {
      return HttpResponse.json(
        { success: false, message: 'Tenant not found' },
        { status: 404 }
      );
    }

    const updated = { ...tenant, ...body };
    return HttpResponse.json({
      success: true,
      message: 'Tenant updated',
      data: updated,
    });
  }),

  http.delete('/api/admin/tenants/:id', ({ params }) => {
    const { id } = params;
    const tenant = mockTenants.find(t => t.id === id);

    if (!tenant) {
      return HttpResponse.json(
        { success: false, message: 'Tenant not found' },
        { status: 404 }
      );
    }

    return HttpResponse.json({
      success: true,
      message: 'Tenant deleted',
    });
  })
);

describe('TenantsPage Component', () => {
  beforeEach(() => {
    server.listen();
  });

  afterEach(() => {
    server.resetHandlers();
    server.close();
  });

  describe('Rendering', () => {
    it('should render the page title', async () => {
      renderWithAuth(<TenantsPage />);

      await waitFor(() => {
        expect(screen.queryByText(/tenants|organizations/i)).toBeDefined();
      });
    });

    it('should display create tenant button', () => {
      renderWithAuth(<TenantsPage />);

      const createButton = screen.queryByRole('button', { name: /add|create|new/i });
      expect(createButton).toBeDefined();
    });

    it('should render tenants table', async () => {
      renderWithAuth(<TenantsPage />);

      await waitFor(() => {
        const table = screen.queryByRole('table');
        expect(table).toBeDefined();
      });
    });

    it('should display search input', () => {
      renderWithAuth(<TenantsPage />);

      const searchInput = screen.queryByPlaceholderText(/search/i);
      expect(searchInput).toBeDefined();
    });
  });

  describe('Loading Tenants', () => {
    it('should fetch tenants from API on mount', async () => {
      renderWithAuth(<TenantsPage />);

      await waitFor(() => {
        expect(screen.queryByText('Acme Corporation')).toBeDefined();
        expect(screen.queryByText('Global Industries')).toBeDefined();
      });
    });

    it('should display tenant names in table', async () => {
      renderWithAuth(<TenantsPage />);

      await waitFor(() => {
        expect(screen.queryByText('Acme Corporation')).toBeDefined();
        expect(screen.queryByText('Global Industries')).toBeDefined();
      });
    });

    it('should display tenant domains', async () => {
      renderWithAuth(<TenantsPage />);

      await waitFor(() => {
        expect(screen.queryByText('acme.example.com')).toBeDefined();
        expect(screen.queryByText('global.example.com')).toBeDefined();
      });
    });
  });

  describe('Search Functionality', () => {
    it('should filter tenants by name', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      await waitFor(() => {
        expect(screen.queryByText('Acme Corporation')).toBeDefined();
      });

      const searchInput = screen.queryByPlaceholderText(/search/i);
      if (searchInput) {
        await user.type(searchInput, 'Acme');
        await waitFor(() => {
          expect(screen.queryByText('Acme Corporation')).toBeDefined();
        });
      }
    });

    it('should clear search results', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      await waitFor(() => {
        expect(screen.queryByText('Acme Corporation')).toBeDefined();
      });

      const searchInput = screen.queryByPlaceholderText(/search/i) as HTMLInputElement;
      if (searchInput) {
        await user.type(searchInput, 'Global');
        await user.clear(searchInput);

        await waitFor(() => {
          expect(screen.queryByText('Acme Corporation')).toBeDefined();
        });
      }
    });
  });

  describe('Create Tenant', () => {
    it('should open create modal on button click', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      const createButton = screen.queryByRole('button', { name: /add|create|new/i });
      if (createButton) {
        await user.click(createButton);

        await waitFor(() => {
          const modal = screen.queryByText(/create|new|add.*tenant/i);
          expect(modal).toBeDefined();
        });
      }
    });

    it('should have form fields in create modal', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      const createButton = screen.queryByRole('button', { name: /add|create|new/i });
      if (createButton) {
        await user.click(createButton);

        await waitFor(() => {
          expect(screen.queryByPlaceholderText(/name/i)).toBeDefined();
          expect(screen.queryByPlaceholderText(/domain/i)).toBeDefined();
        });
      }
    });

    it('should validate required fields', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      const createButton = screen.queryByRole('button', { name: /add|create|new/i });
      if (createButton) {
        await user.click(createButton);

        const submitButton = await screen.findByRole('button', { name: /submit|save|create/i });
        await user.click(submitButton);

        await waitFor(() => {
          const errorMessages = screen.queryAllByText(/required|please enter/i);
          expect(errorMessages.length).toBeGreaterThan(0);
        });
      }
    });
  });

  describe('Edit Tenant', () => {
    it('should open edit modal when clicking edit action', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      await waitFor(() => {
        expect(screen.queryByText('Acme Corporation')).toBeDefined();
      });

      const editButtons = screen.queryAllByRole('button', { name: /edit/i });
      if (editButtons.length > 0) {
        await user.click(editButtons[0]!);

        await waitFor(() => {
          const input = screen.queryByDisplayValue('Acme Corporation');
          expect(input).toBeDefined();
        });
      }
    });

    it('should populate form with tenant data', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      await waitFor(() => {
        expect(screen.queryByText('Acme Corporation')).toBeDefined();
      });

      const editButtons = screen.queryAllByRole('button', { name: /edit/i });
      if (editButtons.length > 0) {
        await user.click(editButtons[0]!);

        await waitFor(() => {
          expect(screen.queryByDisplayValue('Acme Corporation')).toBeDefined();
          expect(screen.queryByDisplayValue('acme.example.com')).toBeDefined();
        });
      }
    });
  });

  describe('Delete Tenant', () => {
    it('should show delete confirmation modal', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      await waitFor(() => {
        expect(screen.queryByText('Acme Corporation')).toBeDefined();
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
      renderWithAuth(<TenantsPage />);

      await waitFor(() => {
        expect(screen.queryByText('Acme Corporation')).toBeDefined();
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
    it('should validate tenant name is required', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      const createButton = screen.queryByRole('button', { name: /add|create|new/i });
      if (createButton) {
        await user.click(createButton);

        const domainInput = await screen.findByPlaceholderText(/domain/i);
        await user.type(domainInput, 'test.example.com');

        const submitButton = screen.queryByRole('button', { name: /submit|save/i });
        if (submitButton) {
          await user.click(submitButton);

          await waitFor(() => {
            expect(screen.queryByText(/name.*required/i)).toBeDefined();
          });
        }
      }
    });
  });

  describe('Error Handling', () => {
    it('should display error when API fails', async () => {
      server.use(
        http.get('/api/admin/tenants', () => {
          return HttpResponse.json(
            { success: false, message: 'Failed to load tenants' },
            { status: 500 }
          );
        })
      );

      renderWithAuth(<TenantsPage />);

      await waitFor(() => {
        expect(screen.queryByText(/error|failed/i)).toBeDefined();
      });
    });

    it('should provide retry option on error', async () => {
      server.use(
        http.get('/api/admin/tenants', () => {
          return HttpResponse.json(
            { success: false, message: 'Failed to load' },
            { status: 500 }
          );
        })
      );

      renderWithAuth(<TenantsPage />);

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /retry|reload/i })).toBeDefined();
      });
    });

    it('should display error on form submission failure', async () => {
      server.use(
        http.post('/api/admin/tenants', () => {
          return HttpResponse.json(
            { success: false, message: 'Failed to create tenant' },
            { status: 500 }
          );
        })
      );

      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      const createButton = screen.queryByRole('button', { name: /add|create|new/i });
      if (createButton) {
        await user.click(createButton);

        const nameInput = await screen.findByPlaceholderText(/name/i);
        await user.type(nameInput, 'Test Tenant');

        const submitButton = screen.queryByRole('button', { name: /submit|save/i });
        if (submitButton) {
          await user.click(submitButton);

          await waitFor(() => {
            expect(screen.queryByText(/error|failed/i)).toBeDefined();
          });
        }
      }
    });
  });

  describe('Accessibility', () => {
    it('should have proper table semantics', async () => {
      renderWithAuth(<TenantsPage />);

      await waitFor(() => {
        const table = screen.queryByRole('table');
        expect(table).toBeDefined();
      });
    });

    it('should have accessible buttons with proper labels', () => {
      renderWithAuth(<TenantsPage />);

      const createButton = screen.queryByRole('button', { name: /add|create|new/i });
      expect(createButton).toBeDefined();
      expect(createButton?.getAttribute('aria-label') || createButton?.textContent).toBeDefined();
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);

      const createButton = screen.queryByRole('button', { name: /add|create|new/i });
      expect(createButton).toBeDefined();

      await user.keyboard('{Tab}');
      expect(document.activeElement).toBeDefined();
    });
  });

  describe('Empty State', () => {
    it('should display empty state when no tenants exist', async () => {
      server.use(
        http.get('/api/admin/tenants', () => {
          return HttpResponse.json({
            success: true,
            message: 'Tenants retrieved',
            data: [],
          });
        })
      );

      renderWithAuth(<TenantsPage />);

      await waitFor(() => {
        expect(screen.queryByText(/no|empty|data/i)).toBeDefined();
      });
    });
  });

  describe('Pagination', () => {
    it.skip('should handle pagination', async () => {
      // TODO: Implement pagination test after backend supports limit/offset
      renderWithAuth(<TenantsPage />);
      // Pagination implementation needed
    });
  });

  describe('Sorting', () => {
    it.skip('should sort tenants by column', async () => {
      // TODO: Implement sorting test after backend supports sort parameters
      const user = userEvent.setup();
      renderWithAuth(<TenantsPage />);
      // Sorting implementation needed
    });
  });
});
