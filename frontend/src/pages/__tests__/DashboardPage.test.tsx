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

    it.skip('updates content when user data changes', () => {
      // TODO: rerenderWithAuth doesn't properly support changing auth context values
      // because React Router doesn't allow multiple routers. This should be tested
      // with a different approach or in integration tests instead.
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

      // Verify all headings exist (at least one heading must be present)
      expect(headingLevels.length).toBeGreaterThan(0);

      // Assert the sequence never skips levels when going deeper
      // (can go from H2 to H3 but not H2 to H4)
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

      // First assertion: REQUIRE the welcome message via the alert role (semantic, accessible element)
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent(`Welcome back, ${mockUser.firstName || 'User'}!`);

      // Second assertion: REQUIRE accessible role name for tenant information within the alert
      // The tenant info must be accessible within the alert (via role-based query or text that doesn't fall back to plain text)
      expect(alert).toHaveTextContent(new RegExp(`tenant ${mockTenant.name}`));

      // Third assertion: Verify alert has proper ARIA attributes for accessibility
      // Alert role should be assertive by default (set explicitly or by default browser behavior)
      const ariaLiveValue = alert.getAttribute('aria-live');
      expect(ariaLiveValue === 'assertive' || ariaLiveValue === null).toBe(true);
    });

    it('uses semantic HTML elements', () => {
      renderWithAuth(<DashboardPage />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});
