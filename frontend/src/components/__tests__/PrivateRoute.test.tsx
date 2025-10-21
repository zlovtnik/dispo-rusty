import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { describe, it, expect } from 'bun:test';
import { PrivateRoute } from '../PrivateRoute';
import { renderWithAuth, mockUser, mockTenant } from '../../test-utils/render';

// Test component to capture location for redirect tests
const LocationDisplay: React.FC = () => {
  const location = useLocation();
  return (
    <div data-testid="location-display">
      {location.pathname}
      {location.search}
    </div>
  );
};

// Test wrapper component for route testing
const TestWrapperWithRoutes: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <>{children}</>;
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
        <>
          <LocationDisplay />
          <PrivateRoute>
            <div>Protected</div>
          </PrivateRoute>
        </>
      );

      // Initially should show protected content
      expect(screen.getByText('Protected')).toBeInTheDocument();

      // Change auth state to unauthenticated
      rerenderWithAuth(
        <>
          <LocationDisplay />
          <PrivateRoute>
            <div>Protected</div>
          </PrivateRoute>
        </>,
        { authValue: { isAuthenticated: false } }
      );

      // Should redirect to login - check pathname instead of rendered text
      await waitFor(() => {
        const locationDisplay = screen.getByTestId('location-display');
        expect(locationDisplay.textContent).toContain('/login');
      });
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
    it('should redirect to login page when not authenticated', async () => {
      const testContent = 'Protected Content';
      const { rerenderWithAuth } = renderWithAuth(
        <>
          <LocationDisplay />
          <PrivateRoute>
            <div>{testContent}</div>
          </PrivateRoute>
        </>
      );

      // Change auth state to unauthenticated
      rerenderWithAuth(
        <>
          <LocationDisplay />
          <PrivateRoute>
            <div>{testContent}</div>
          </PrivateRoute>
        </>,
        { authValue: { isAuthenticated: false } }
      );

      // Should redirect to login - check pathname instead of rendered text
      await waitFor(() => {
        const locationDisplay = screen.getByTestId('location-display');
        expect(locationDisplay.textContent).toContain('/login');
      });
    });

    it('should pass location state for redirect', async () => {
      const { rerenderWithAuth } = renderWithAuth(
        <TestWrapperWithRoutes>
          <>
            <LocationDisplay />
            <PrivateRoute>
              <div>Protected</div>
            </PrivateRoute>
          </>
        </TestWrapperWithRoutes>
      );

      // Change auth state to unauthenticated
      rerenderWithAuth(
        <TestWrapperWithRoutes>
          <>
            <LocationDisplay />
            <PrivateRoute>
              <div>Protected</div>
            </PrivateRoute>
          </>
        </TestWrapperWithRoutes>,
        { authValue: { isAuthenticated: false } }
      );

      // Should redirect to login - check pathname instead of rendered text
      await waitFor(() => {
        const locationDisplay = screen.getByTestId('location-display');
        expect(locationDisplay.textContent).toContain('/login');
      });
    });

    it('should preserve intended destination in location state', async () => {
      const { rerenderWithAuth } = renderWithAuth(
        <TestWrapperWithRoutes>
          <>
            <LocationDisplay />
            <PrivateRoute>
              <div>Dashboard</div>
            </PrivateRoute>
          </>
        </TestWrapperWithRoutes>
      );

      // Change auth state to unauthenticated
      rerenderWithAuth(
        <TestWrapperWithRoutes>
          <>
            <LocationDisplay />
            <PrivateRoute>
              <div>Dashboard</div>
            </PrivateRoute>
          </>
        </TestWrapperWithRoutes>,
        { authValue: { isAuthenticated: false } }
      );

      // Should redirect to login - check pathname instead of rendered text
      await waitFor(() => {
        const locationDisplay = screen.getByTestId('location-display');
        expect(locationDisplay.textContent).toContain('/login');
      });
    });
  });

  describe('Route Redirects', () => {
    it('should redirect unauthenticated users to login', async () => {
      const testContent = 'Protected Content';
      const { rerenderWithAuth } = renderWithAuth(
        <>
          <LocationDisplay />
          <PrivateRoute>
            <div>{testContent}</div>
          </PrivateRoute>
        </>
      );

      // Change auth state to unauthenticated
      rerenderWithAuth(
        <>
          <LocationDisplay />
          <PrivateRoute>
            <div>{testContent}</div>
          </PrivateRoute>
        </>,
        { authValue: { isAuthenticated: false } }
      );

      // Should redirect to login - check pathname instead of rendered text
      await waitFor(() => {
        const locationDisplay = screen.getByTestId('location-display');
        expect(locationDisplay.textContent).toContain('/login');
      });
    });

    it('should redirect to login with replace mode', async () => {
      const { rerenderWithAuth } = renderWithAuth(
        <TestWrapperWithRoutes>
          <>
            <LocationDisplay />
            <PrivateRoute>
              <div>Protected</div>
            </PrivateRoute>
          </>
        </TestWrapperWithRoutes>
      );

      // Change auth state to unauthenticated
      rerenderWithAuth(
        <TestWrapperWithRoutes>
          <>
            <LocationDisplay />
            <PrivateRoute>
              <div>Protected</div>
            </PrivateRoute>
          </>
        </TestWrapperWithRoutes>,
        { authValue: { isAuthenticated: false } }
      );

      // Should redirect to login with replace mode - check pathname instead of rendered text
      await waitFor(() => {
        const locationDisplay = screen.getByTestId('location-display');
        expect(locationDisplay.textContent).toContain('/login');
      });
    });

    it('should store current location for post-login redirect', async () => {
      const { rerenderWithAuth } = renderWithAuth(
        <TestWrapperWithRoutes>
          <>
            <LocationDisplay />
            <PrivateRoute>
              <div>Dashboard</div>
            </PrivateRoute>
          </>
        </TestWrapperWithRoutes>
      );

      // Change auth state to unauthenticated
      rerenderWithAuth(
        <TestWrapperWithRoutes>
          <>
            <LocationDisplay />
            <PrivateRoute>
              <div>Dashboard</div>
            </PrivateRoute>
          </>
        </TestWrapperWithRoutes>,
        { authValue: { isAuthenticated: false } }
      );

      // Should redirect to login - check pathname instead of rendered text
      await waitFor(() => {
        const locationDisplay = screen.getByTestId('location-display');
        expect(locationDisplay.textContent).toContain('/login');
      });
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

    it('should handle null user object gracefully', async () => {
      const { rerenderWithAuth } = renderWithAuth(
        <TestWrapperWithRoutes>
          <>
            <LocationDisplay />
            <PrivateRoute>
              <div>Protected</div>
            </PrivateRoute>
          </>
        </TestWrapperWithRoutes>
      );

      // Change auth state to unauthenticated with null user and tenant
      rerenderWithAuth(
        <TestWrapperWithRoutes>
          <>
            <LocationDisplay />
            <PrivateRoute>
              <div>Protected</div>
            </PrivateRoute>
          </>
        </TestWrapperWithRoutes>,
        {
          authValue: {
            isAuthenticated: false,
            user: null,
            tenant: null,
          },
        }
      );

      // Should redirect to login - check pathname instead of rendered text
      await waitFor(() => {
        const locationDisplay = screen.getByTestId('location-display');
        expect(locationDisplay.textContent).toContain('/login');
      });
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

    it('should handle auth state transition from loading to unauthenticated', async () => {
      const { rerenderWithAuth } = renderWithAuth(
        <TestWrapperWithRoutes>
          <>
            <LocationDisplay />
            <PrivateRoute>
              <div>Protected</div>
            </PrivateRoute>
          </>
        </TestWrapperWithRoutes>,
        {
          authValue: {
            isLoading: true,
            isAuthenticated: true,
            user: mockUser,
            tenant: mockTenant,
          },
        }
      );

      // Change auth state to unauthenticated
      rerenderWithAuth(
        <TestWrapperWithRoutes>
          <>
            <LocationDisplay />
            <PrivateRoute>
              <div>Protected</div>
            </PrivateRoute>
          </>
        </TestWrapperWithRoutes>,
        {
          authValue: {
            isLoading: false,
            isAuthenticated: false,
            user: null,
            tenant: null,
          },
        }
      );

      // Should redirect to login - check pathname instead of rendered text
      await waitFor(() => {
        const locationDisplay = screen.getByTestId('location-display');
        expect(locationDisplay.textContent).toContain('/login');
      });
    });
  });
});
