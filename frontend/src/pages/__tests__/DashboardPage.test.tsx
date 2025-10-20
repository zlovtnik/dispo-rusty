import { describe, it, expect } from 'bun:test';
import { screen } from '@testing-library/react';
import { renderWithAuth, mockUser, mockTenant } from '../../test-utils/render';
import { DashboardPage } from '../DashboardPage';

describe('DashboardPage Component', () => {
  describe('Rendering', () => {
    it('displays welcome message with user name', () => {
      renderWithAuth(<DashboardPage />);

      expect(
        screen.getByText(`Welcome back, ${mockUser.firstName ?? 'User'}!`)
      ).toBeInTheDocument();
    });

    it('displays tenant information', () => {
      renderWithAuth(<DashboardPage />);

      expect(
        screen.getByText(`You're logged in to tenant ${mockTenant.name} (${mockTenant.id})`)
      ).toBeInTheDocument();
    });

    it('displays user profile information', () => {
      renderWithAuth(<DashboardPage />);

      expect(screen.getByText(mockUser.email)).toBeInTheDocument();
      expect(screen.getByText(mockUser.username)).toBeInTheDocument();
      expect(screen.getByText(mockUser.roles?.join(', ') || 'None')).toBeInTheDocument();
    });

    it('displays main feature cards', () => {
      renderWithAuth(<DashboardPage />);

      expect(screen.getByText('Address Book')).toBeInTheDocument();
      expect(screen.getByText('Manage your contacts and addresses')).toBeInTheDocument();

      expect(screen.getByText('System Health')).toBeInTheDocument();
      expect(screen.getByText('Check API and system status')).toBeInTheDocument();

      expect(screen.getByText('User Profile')).toBeInTheDocument();
      expect(screen.getByText('Manage your account settings')).toBeInTheDocument();
    });

    it('displays recent activity section', () => {
      renderWithAuth(<DashboardPage />);

      expect(screen.getByText('Recent Activity')).toBeInTheDocument();
      expect(screen.getByText(/Application started|successful login/)).toBeInTheDocument();
    });

    it('displays technology stack', () => {
      renderWithAuth(<DashboardPage />);

      expect(screen.getByText('Technology Stack')).toBeInTheDocument();
      expect(screen.getByText('TypeScript')).toBeInTheDocument();
      expect(screen.getByText('React')).toBeInTheDocument();
      expect(screen.getByText('Actix Web')).toBeInTheDocument();
      expect(screen.getByText('Bun')).toBeInTheDocument();
    });

    it('displays authentication status alert', () => {
      renderWithAuth(<DashboardPage />);

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent('Welcome');
    });
  });

  describe('Behavior', () => {
    it('renders content during loading state', () => {
      renderWithAuth(<DashboardPage />, {
        authValue: { isLoading: true },
      });

      expect(screen.getByText(/Welcome back/)).toBeInTheDocument();
    });

    it('updates content when user data changes', () => {
      // Create initial auth value with mockUser
      const initialAuthValue = {
        isAuthenticated: true,
        user: mockUser,
        tenant: mockTenant,
      };

      const { rerender, unmount } = renderWithAuth(<DashboardPage />, { authValue: initialAuthValue });

      // Verify initial greeting
      expect(
        screen.getByText(`Welcome back, ${mockUser.firstName ?? 'User'}!`)
      ).toBeInTheDocument();

      // Create updated auth value with different firstName
      const updatedAuthValue = {
        isAuthenticated: true,
        user: { ...mockUser, firstName: 'Updated' },
        tenant: mockTenant,
      };

      // Unmount the first render before mounting the second
      unmount();

      // Test that the component responds to different auth values
      // by rendering with the updated auth value
      renderWithAuth(<DashboardPage />, { authValue: updatedAuthValue });

      // Assert the greeting reflects the new firstName
      expect(screen.getByText(`Welcome back, Updated!`)).toBeInTheDocument();
    });

    it('handles missing user name gracefully', () => {
      renderWithAuth(<DashboardPage />, {
        authValue: { user: { ...mockUser, firstName: undefined } },
      });

      expect(screen.getByText(/Welcome back/)).toBeInTheDocument();
    });

    it('handles empty tenant name gracefully', () => {
      renderWithAuth(<DashboardPage />, {
        authValue: { tenant: { ...mockTenant, name: '' } },
      });

      expect(screen.getByText(/Welcome back/)).toBeInTheDocument();
    });

    it('displays welcome message with long user names correctly', () => {
      const longName = 'A'.repeat(100);
      renderWithAuth(<DashboardPage />, {
        authValue: { user: { ...mockUser, firstName: longName } },
      });

      // Verify the welcome message contains the user's name
      const welcomeElement = screen.getByText(new RegExp(`Welcome back, ${longName}!`));
      expect(welcomeElement).toBeInTheDocument();

      // Verify the full name is accessible in the text content
      expect(welcomeElement.textContent).toContain(longName);

      // Note: Accessibility fallbacks (title/aria-label) are optional and not implemented
      // The component displays long names directly in the alert message
    });

    it('provides navigation links', () => {
      renderWithAuth(<DashboardPage />);

      const links = screen.getAllByRole('link');
      expect(links.length).toBeGreaterThan(0);

      // Verify first link has proper attributes
      const firstLink = links[0]!;
      const href = firstLink.getAttribute('href');
      expect(href).toBeTruthy();
      expect(href).toMatch(/^(\/|https?:\/\/)/);
    });
  });

  describe('Accessibility', () => {
    it('has proper heading hierarchy', () => {
      renderWithAuth(<DashboardPage />);

      const headings = screen.getAllByRole('heading');
      expect(headings.length).toBeGreaterThan(0);

      // Map heading elements to their numeric levels (H1 -> 1, H2 -> 2, etc.)
      const headingLevels = headings.map(heading => {
        const tagName = heading.tagName.toLowerCase();
        return parseInt(tagName.replace('h', ''), 10);
      });

      // Assert there is exactly one level 1 (H1)
      const h1Count = headingLevels.filter(level => level === 1).length;
      expect(h1Count).toBe(1);

      // Assert the first heading level is 1
      expect(headingLevels[0]).toBe(1);

      // Assert the sequence never skips levels when going deeper
      // (can go from H1 to H2 but not H1 to H3)
      for (let i = 1; i < headingLevels.length; i++) {
        const prevLevel = headingLevels[i - 1];
        const currentLevel = headingLevels[i];

        // When going deeper (increasing level number), can only increase by 1
        if (
          typeof prevLevel === 'number' &&
          typeof currentLevel === 'number' &&
          !Number.isNaN(prevLevel) &&
          !Number.isNaN(currentLevel) &&
          currentLevel > prevLevel
        ) {
          expect(currentLevel - prevLevel).toBeLessThanOrEqual(1);
        }
        // Going back up (decreasing) or staying same is always allowed
      }

      // Verify all headings have non-empty text
      headings.forEach(heading => {
        expect(heading.textContent?.trim().length).toBeGreaterThan(0);
      });
    });

    it('provides accessible user and tenant information', () => {
      renderWithAuth(<DashboardPage />);

      // Check for accessible welcome message with proper heading or landmark
      const welcomeHeading = screen.getByRole('heading', {
        name: new RegExp(`Welcome.*${mockUser.firstName || 'User'}`),
      });
      expect(welcomeHeading).toBeInTheDocument();

      // Check for accessible tenant information with proper labeling
      const tenantInfo =
        screen.getByLabelText(/tenant/i) ||
        screen.getByRole('region', { name: /tenant/i }) ||
        screen.getByText(new RegExp(`tenant ${mockTenant.name}`));
      expect(tenantInfo).toBeInTheDocument();

      // Verify alert has proper ARIA attributes for accessibility
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      // Alert role should be assertive by default, not polite
      expect(alert).toHaveAttribute('aria-live', 'assertive');
    });

    it('uses semantic HTML elements', () => {
      renderWithAuth(<DashboardPage />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});
