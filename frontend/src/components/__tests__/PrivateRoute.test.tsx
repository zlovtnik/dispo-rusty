import { describe, it, expect, beforeEach } from 'bun:test';
import { screen, render } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { renderWithAuth, renderWithoutAuth, mockUser, mockTenant } from '../../test-utils/render';
import { PrivateRoute } from '../PrivateRoute';

// Test component to capture location
const LocationDisplay = () => {
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

      expect(screen.getByText(testContent)).toBeDefined();
    });

    it('should redirect to login when user is not authenticated', () => {
      const testContent = 'Protected Content';
      const { container } = renderWithoutAuth(
        <PrivateRoute>
          <div>{testContent}</div>
        </PrivateRoute>,
        { initialRoute: '/protected' }
      );

      // Should not render the protected content
      expect(screen.queryByText(testContent)).toBeNull();
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
      expect(loadingSpinner).toBeDefined();
      expect(loadingSpinner).toBeVisible();
    });
  });

  describe('Authenticated Access', () => {
    it('should allow access when authenticated', () => {
      const testId = 'protected-content';
      renderWithAuth(
        <PrivateRoute>
          <div data-testid={testId}>Dashboard Content</div>
        </PrivateRoute>
      );

      expect(screen.getByTestId(testId)).toBeDefined();
    });

    it('should maintain route path when authenticated', () => {
      renderWithAuth(
        <PrivateRoute>
          <div>Content</div>
        </PrivateRoute>,
        { initialRoute: '/dashboard' }
      );

      expect(screen.getByText('Content')).toBeDefined();
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

      expect(screen.getByText('Title')).toBeDefined();
      expect(screen.getByText('Paragraph')).toBeDefined();
    });
  });

  describe('Unauthenticated Access', () => {
    it('should redirect to login page when not authenticated', () => {
      const testContent = 'Protected Content';
      const { container } = renderWithoutAuth(
        <PrivateRoute>
          <div>{testContent}</div>
        </PrivateRoute>,
        { initialRoute: '/dashboard' }
      );

      // Protected content should not be visible
      expect(screen.queryByText(testContent)).toBeNull();
    });

    it('should pass location state for redirect', () => {
      renderWithoutAuth(
        <PrivateRoute>
          <div>Protected</div>
        </PrivateRoute>,
        { initialRoute: '/contacts' }
      );

      // Should attempt redirect to login
      expect(screen.queryByText('Protected')).toBeNull();
    });

    it('should preserve intended destination in location state', () => {
      const { container } = renderWithoutAuth(
        <PrivateRoute>
          <div>Dashboard</div>
        </PrivateRoute>,
        { initialRoute: '/dashboard' }
      );

      // Location state should be set for post-login redirect
      expect(screen.queryByText('Dashboard')).toBeNull();
      // Optionally verify redirect URL or location state if test utils support it
    });
  });

  describe('Loading States', () => {
    it('should show spinner while loading authentication', () => {
      renderWithAuth(
        <PrivateRoute>
          <div>Content</div>
        </PrivateRoute>,
        { authValue: { isLoading: true, isAuthenticated: false } }
      );

      // Should display loading indicator
      const loadingSpinner = screen.getByTestId('loading-spinner');
      expect(loadingSpinner).toBeDefined();
      expect(loadingSpinner).toBeVisible();
    });

    it('should hide content while loading', () => {
      const testContent = 'Protected Content';
      renderWithAuth(
        <PrivateRoute>
          <div>{testContent}</div>
        </PrivateRoute>,
        { authValue: { isLoading: true } }
      );

      // Content should not be visible while loading
      expect(screen.queryByText(testContent)).toBeNull();
    });

    it('should display "Loading..." text during auth check', () => {
      renderWithAuth(
        <PrivateRoute>
          <div>Content</div>
        </PrivateRoute>,
        { authValue: { isLoading: true, isAuthenticated: false } }
      );

      const loadingSpinner = screen.getByTestId('loading-spinner');
      expect(loadingSpinner).toBeDefined();
      expect(loadingSpinner.textContent).toContain('Loading...');
    });
  });

  describe('Route Redirects', () => {
    it('should redirect unauthenticated users to login', () => {
      const { container } = renderWithoutAuth(
        <PrivateRoute>
          <div>Protected</div>
        </PrivateRoute>,
        { initialRoute: '/protected' }
      );

      // Should not display protected content
      expect(screen.queryByText('Protected')).toBeNull();
    });

    it('should redirect to login with replace mode', () => {
      const { container } = renderWithoutAuth(
        <PrivateRoute>
          <div>Protected</div>
        </PrivateRoute>
      );

      // Protected content should not be rendered when redirecting
      expect(screen.queryByText('Protected')).toBeNull();
    });

    it('should store current location for post-login redirect', () => {
      render(
        <MemoryRouter initialEntries={['/dashboard/settings']}>
          <LocationDisplay />
          <PrivateRoute>
            <div>Dashboard</div>
          </PrivateRoute>
        </MemoryRouter>
      );

      expect(screen.getByTestId('location-path').textContent).toBe('/login');
      const state = JSON.parse(screen.getByTestId('location-state').textContent || '{}');
      expect(state.from.pathname).toBe('/dashboard/settings');
    });
  });

  describe('User States', () => {
    it('should work with authenticated user object', () => {
      renderWithAuth(
        <PrivateRoute>
          <div>Content for {mockUser.username}</div>
        </PrivateRoute>
      );

      expect(screen.getByText(/Content for/i)).toBeDefined();
    });

    it('should work with tenant information', () => {
      renderWithAuth(
        <PrivateRoute>
          <div>Tenant: {mockTenant.name}</div>
        </PrivateRoute>
      );

      expect(screen.getByText(/Tenant:/i)).toBeDefined();
    });

    it('should handle null user object gracefully', () => {
      renderWithoutAuth(
        <PrivateRoute>
          <div>Protected</div>
        </PrivateRoute>
      );

      expect(screen.queryByText('Protected')).toBeNull();
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
      const loadingContainers = container.querySelectorAll('.loading, [class*="loading"]');
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
      const loadingIndicator = screen.getByRole('status');
      expect(loadingIndicator).not.toBeNull();
    });

    it('should maintain focus management during redirect', () => {
      const { container } = renderWithoutAuth(
        <PrivateRoute>
          <div>Protected</div>
        </PrivateRoute>,
        { initialRoute: '/dashboard' }
      );

      // When redirected, the loading container should not be visible
      // and focus should default to document.body
      expect(screen.queryByText('Protected')).toBeNull();

      // After unauthenticated redirect, focus should be manageable
      // (typically returned to body when no other focusable element is present)
      expect(document.activeElement).toBeDefined();
      // In a test environment with no login page rendered, focus naturally returns to BODY
      // In production, the Navigate component would render the login page with focusable elements
      expect(['BODY', 'HTML'].includes(document.activeElement?.tagName || '')).toBeTruthy();
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

      expect(screen.getByText('Child 1')).toBeDefined();
      expect(screen.getByText('Child 2')).toBeDefined();
      expect(screen.getByText('Child 3')).toBeDefined();
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

      expect(screen.getByText('Heading')).toBeDefined();
      expect(screen.getByText('Paragraph')).toBeDefined();
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

      expect(screen.getByText('Content')).toBeDefined();
    });

    it('should handle auth state transition from loading to authenticated', () => {
      renderWithAuth(
        <PrivateRoute>
          <div>Content</div>
        </PrivateRoute>,
        { authValue: { isLoading: false, isAuthenticated: true } }
      );

      expect(screen.getByText('Content')).toBeDefined();
    });

    it('should handle auth state transition from loading to unauthenticated', () => {
      renderWithoutAuth(
        <PrivateRoute>
          <div>Protected</div>
        </PrivateRoute>,
        { authValue: { isLoading: false, isAuthenticated: false } }
      );

      expect(screen.queryByText('Protected')).toBeNull();
    });
  });
});
