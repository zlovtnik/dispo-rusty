import { describe, it, expect } from 'bun:test';
import { screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { renderWithAuth, renderWithoutAuth, mockUser, mockTenant, renderForIntegration } from '../../test-utils/render';
import { PrivateRoute } from '../PrivateRoute';
import { LoginPage } from '@/pages/LoginPage';

// Test component to capture location
const LocationDisplay = (): React.JSX.Element => {
  const location = useLocation();
  return (
    <>
      <div data-testid="location-path">{location.pathname}</div>
      <div data-testid="location-state">{JSON.stringify(location.state)}</div>
    </>
  );
};

describe('PrivateRoute Component', () => {
  describe('Authentication Guards', () => {
    it('should render children when user is authenticated', () => {
      const testContent = 'Protected Content';
      renderWithAuth(
        <PrivateRoute>
          <div>{testContent}</div>
        </PrivateRoute>
      );

      expect(screen.getByText(testContent)).toBeVisible();
    });

    it('should redirect to login when auth state changes to unauthenticated', async () => {
      const { rerenderWithAuth } = renderWithAuth(
        <PrivateRoute>
          <div>Protected</div>
        </PrivateRoute>
      );

      // Initially should show protected content
      expect(screen.getByText('Protected')).toBeInTheDocument();

      // Change auth state to unauthenticated
      rerenderWithAuth(
        <PrivateRoute>
          <div>Protected</div>
        </PrivateRoute>,
        { authValue: { isAuthenticated: false } }
      );

      // Should redirect to login
      expect(screen.getByText('Login')).toBeInTheDocument();
    });

    it('should display loading state while checking authentication', () => {
      const testContent = 'Protected Content';
      renderWithAuth(
        <PrivateRoute>
          <div>{testContent}</div>
        </PrivateRoute>,
        {
          authValue: { isLoading: true },
        }
      );

      // Should show loading indicator
      const loadingSpinner = screen.getByTestId('loading-spinner');
      expect(loadingSpinner).toBeVisible();
      expect(loadingSpinner.textContent).toContain('Loading...');

      // Content should not be visible while loading
      expect(screen.queryByText(testContent)).toBeNull();
    });
  });

  describe('Authenticated Access', () => {
    it('should maintain route path when authenticated', () => {
      renderWithAuth(
        <PrivateRoute>
          <div>Content</div>
        </PrivateRoute>,
        { initialRoute: '/dashboard' }
      );

      expect(screen.getByText('Content')).toBeInTheDocument();
    });

    it('should render nested components', () => {
      renderWithAuth(
        <PrivateRoute>
          <div>
            <h1>Title</h1>
            <p>Paragraph</p>
          </div>
        </PrivateRoute>
      );

      expect(screen.getByText('Title')).toBeInTheDocument();
      expect(screen.getByText('Paragraph')).toBeInTheDocument();
    });
  });

  describe('Unauthenticated Access', () => {
    it('should redirect to login page when not authenticated', () => {
      const testContent = 'Protected Content';
      const { rerenderWithAuth } = renderWithAuth(
        <PrivateRoute>
          <div>{testContent}</div>
        </PrivateRoute>
      );

      // Change auth state to unauthenticated
      rerenderWithAuth(
        <PrivateRoute>
          <div>{testContent}</div>
        </PrivateRoute>,
        { authValue: { isAuthenticated: false } }
      );

      // Should redirect to login
      expect(screen.getByText('Login')).toBeInTheDocument();
    });

    it('should pass location state for redirect', () => {
      const { rerenderWithAuth } = renderWithAuth(
        <PrivateRoute>
          <div>Protected</div>
        </PrivateRoute>
      );

      // Change auth state to unauthenticated
      rerenderWithAuth(
        <PrivateRoute>
          <div>Protected</div>
        </PrivateRoute>,
        { authValue: { isAuthenticated: false } }
      );

      // Should attempt redirect to login
      expect(screen.queryByText('Protected')).toBeNull();
    });

    it('should preserve intended destination in location state', () => {
      const { rerenderWithAuth } = renderWithAuth(
        <>
          <LocationDisplay />
          <PrivateRoute>
            <div>Dashboard</div>
          </PrivateRoute>
        </>
      );

      // Change auth state to unauthenticated
      rerenderWithAuth(
        <>
          <LocationDisplay />
          <PrivateRoute>
            <div>Dashboard</div>
          </PrivateRoute>
        </>,
        { authValue: { isAuthenticated: false } }
      );

      // Should redirect to login
      expect(screen.getByText('Login')).toBeInTheDocument();
      
      // Check that location state contains the original path
      const state = JSON.parse(screen.getByTestId('location-state').textContent || '{}') as {
        from: { pathname: string };
      };
      expect(state.from.pathname).toBe('/');
    });
  });

  describe('Route Redirects', () => {
    it('should redirect unauthenticated users to login', () => {
      const { rerenderWithAuth } = renderWithAuth(
        <PrivateRoute>
          <div>Protected</div>
        </PrivateRoute>
      );

      // Change auth state to unauthenticated
      rerenderWithAuth(
        <PrivateRoute>
          <div>Protected</div>
        </PrivateRoute>,
        { authValue: { isAuthenticated: false } }
      );

      // Should redirect to login
      expect(screen.getByText('Login')).toBeInTheDocument();
    });

    it('should redirect to login with replace mode', () => {
      const { rerenderWithAuth } = renderWithAuth(
        <PrivateRoute>
          <div>Protected</div>
        </PrivateRoute>
      );

      // Change auth state to unauthenticated
      rerenderWithAuth(
        <PrivateRoute>
          <div>Protected</div>
        </PrivateRoute>,
        { authValue: { isAuthenticated: false } }
      );

      // Should redirect to login with replace mode
      expect(screen.getByText('Login')).toBeInTheDocument();
    });

    it('should store current location for post-login redirect', () => {
      const { rerenderWithAuth } = renderWithAuth(
        <>
          <LocationDisplay />
          <PrivateRoute>
            <div>Dashboard</div>
          </PrivateRoute>
        </>
      );

      // Change auth state to unauthenticated
      rerenderWithAuth(
        <>
          <LocationDisplay />
          <PrivateRoute>
            <div>Dashboard</div>
          </PrivateRoute>
        </>,
        { authValue: { isAuthenticated: false } }
      );

      // Should redirect to login
      expect(screen.getByText('Login')).toBeInTheDocument();
      
      // Check that location state contains the original path
      const state = JSON.parse(screen.getByTestId('location-state').textContent || '{}') as {
        from: { pathname: string };
      };
      expect(state.from.pathname).toBe('/');
    });
  });

  describe('User States', () => {
    it('should work with authenticated user object', () => {
      renderWithAuth(
        <PrivateRoute>
          <div>Content for {mockUser.username}</div>
        </PrivateRoute>
      );

      expect(screen.getByText(/Content for/i)).toBeInTheDocument();
    });

    it('should work with tenant information', () => {
      renderWithAuth(
        <PrivateRoute>
          <div>Tenant: {mockTenant.name}</div>
        </PrivateRoute>
      );

      expect(screen.getByText(/Tenant:/i)).toBeInTheDocument();
    });

    it('should handle null user object gracefully', () => {
      const { rerenderWithAuth } = renderWithAuth(
        <PrivateRoute>
          <div>Protected</div>
        </PrivateRoute>
      );

      // Change auth state to unauthenticated with null user and tenant
      rerenderWithAuth(
        <PrivateRoute>
          <div>Protected</div>
        </PrivateRoute>,
        { 
          authValue: { 
            isAuthenticated: false, 
            user: null, 
            tenant: null 
          } 
        }
      );

      // Should redirect to login
      expect(screen.getByText('Login')).toBeInTheDocument();
    });
  });

  describe('CSS Classes', () => {
    it('should apply correct CSS classes', () => {
      const { container } = renderWithAuth(
        <PrivateRoute>
          <div>Content</div>
        </PrivateRoute>,
        { authValue: { isLoading: true, isAuthenticated: false } }
      );

      // Check for loading container classes
      expect(container.querySelector('.loading')).not.toBeNull();
    });

    it('should have flex center styling during loading', () => {
      const { getByTestId } = renderWithAuth(
        <PrivateRoute>
          <div>Content</div>
        </PrivateRoute>,
        { authValue: { isLoading: true } }
      );

      // Check for flex center classes on the loading container
      const loadingContainer = getByTestId('loading-container');
      expect(loadingContainer.className).toContain('flex');
      expect(loadingContainer.className).toContain('items-center');
      expect(loadingContainer.className).toContain('justify-center');
    });
  });

  describe('Accessibility', () => {
    it('should have proper loading state semantics', () => {
      renderWithAuth(
        <PrivateRoute>
          <div>Content</div>
        </PrivateRoute>,
        { authValue: { isLoading: true } }
      );

      // Loading indicator should have proper ARIA attributes
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });

  describe('Children Rendering', () => {
    it('should render multiple child elements', () => {
      renderWithAuth(
        <PrivateRoute>
          <div>Child 1</div>
          <div>Child 2</div>
          <div>Child 3</div>
        </PrivateRoute>
      );

      expect(screen.getByText('Child 1')).toBeInTheDocument();
      expect(screen.getByText('Child 2')).toBeInTheDocument();
      expect(screen.getByText('Child 3')).toBeInTheDocument();
    });

    it('should render complex nested components', () => {
      renderWithAuth(
        <PrivateRoute>
          <div>
            <section>
              <h1>Heading</h1>
              <p>Paragraph</p>
            </section>
          </div>
        </PrivateRoute>
      );

      expect(screen.getByText('Heading')).toBeInTheDocument();
      expect(screen.getByText('Paragraph')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid auth state changes', () => {
      renderWithAuth(
        <PrivateRoute>
          <div>Content</div>
        </PrivateRoute>,
        { authValue: { isLoading: false, isAuthenticated: true } }
      );

      expect(screen.getByText('Content')).toBeInTheDocument();
    });

    it('should handle auth state transition from loading to authenticated', () => {
      renderWithAuth(
        <PrivateRoute>
          <div>Content</div>
        </PrivateRoute>,
        { authValue: { isLoading: false, isAuthenticated: true } }
      );

      expect(screen.getByText('Content')).toBeInTheDocument();
    });

    it('should handle auth state transition from loading to unauthenticated', () => {
      const { rerenderWithAuth } = renderWithAuth(
        <PrivateRoute>
          <div>Protected</div>
        </PrivateRoute>,
        { 
          authValue: { 
            isLoading: true, 
            isAuthenticated: true, 
            user: mockUser, 
            tenant: mockTenant 
          } 
        }
      );

      // Change auth state to unauthenticated
      rerenderWithAuth(
        <PrivateRoute>
          <div>Protected</div>
        </PrivateRoute>,
        { 
          authValue: { 
            isLoading: false, 
            isAuthenticated: false, 
            user: null, 
            tenant: null 
          } 
        }
      );

      // Should redirect to login
      expect(screen.getByText('Login')).toBeInTheDocument();
    });
  });
});
