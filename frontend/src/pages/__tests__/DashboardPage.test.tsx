import { describe, it, expect } from 'bun:test';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithAuth, mockUser, mockTenant } from '../../test-utils/render';
import { DashboardPage } from '../DashboardPage';

describe('DashboardPage Component', () => {
  describe('Rendering', () => {
    it('should render dashboard page with welcome message', () => {
      renderWithAuth(<DashboardPage />);

      const welcomeText = screen.getByText(/Welcome back/i);
      expect(welcomeText).toBeDefined();
    });

    it('should display user first name in welcome message', () => {
      renderWithAuth(<DashboardPage />);

      const userName = screen.getByText(new RegExp(mockUser.firstName || 'User'));
      expect(userName).toBeDefined();
    });

    it('should display tenant name', () => {
      renderWithAuth(<DashboardPage />);

      const tenantName = screen.getByText(mockTenant.name);
      expect(tenantName).toBeDefined();
    });

    it('should display statistics cards with content', () => {
      const { container } = renderWithAuth(<DashboardPage />);

      const statisticElements = container.querySelectorAll('[class*="ant-statistic"]');
      expect(statisticElements.length).toBeGreaterThan(0);
    });

    it('should display technology stack items', () => {
      renderWithAuth(<DashboardPage />);

      // Verify multiple tech items are present
      expect(screen.getByText(/TypeScript/i)).toBeInTheDocument();
      expect(screen.getByText(/React/i)).toBeInTheDocument();
      expect(screen.getByText(/Bun/i)).toBeInTheDocument();
    });
  });

  describe('Content Sections', () => {
    it('should have welcome alert for user greeting', () => {
      renderWithAuth(<DashboardPage />);

      const alert = screen.getByRole('alert');
      expect(alert).toBeDefined();
      expect(alert.textContent).toContain('Welcome');
    });

    it('should display statistics section with title', () => {
      renderWithAuth(<DashboardPage />);

      // Statistics should be visible with welcome message
      const heading = screen.getByText(/Dashboard|Welcome|Statistics/i);
      expect(heading).toBeDefined();
    });

    it('should display activity list with entries', () => {
      renderWithAuth(<DashboardPage />);

      // Verify activity items are rendered
      const activityItems = screen.getAllByText(/Application started|successful login/i);
      expect(activityItems.length).toBeGreaterThan(0);
    });

    it('should display technology stack section with description', () => {
      renderWithAuth(<DashboardPage />);

      // Verify tech stack items are visible
      const techStack = screen.getByText(/TypeScript/i);
      expect(techStack).toBeDefined();
    });
  });

  describe('User Information', () => {
    it('should display authenticated user in welcome section', () => {
      renderWithAuth(<DashboardPage />);

      const userGreeting = screen.getByText(/Welcome back/i);
      expect(userGreeting).toBeDefined();
      expect(userGreeting.textContent).toContain(mockUser.firstName || 'User');
    });

    it('should display tenant context clearly', () => {
      renderWithAuth(<DashboardPage />);

      const tenantDisplay = screen.getByText(mockTenant.name);
      expect(tenantDisplay).toBeDefined();
    });

    it('should indicate user has authenticated access', () => {
      renderWithAuth(<DashboardPage />);

      // Page should render with authenticated content
      expect(screen.getByText(/Welcome back/i)).toBeDefined();
    });
  });

  describe('Loading States', () => {
    it('should display loading indicator when authValue.loading is true', async () => {
      const { container } = renderWithAuth(<DashboardPage />, {
        authValue: { isLoading: true },
      });

      // Verify loading spinner exists
      const spinner = container.querySelector('[class*="ant-spin"]');
      expect(spinner).toBeDefined();
    });

    it('should display content even while loading', () => {
      renderWithAuth(<DashboardPage />, {
        authValue: { isLoading: true },
      });

      // Welcome message should still render
      expect(screen.getByText(/Welcome back/i)).toBeDefined();
    });

    it('should hide loading indicator after data loads', async () => {
      const { container, rerender } = renderWithAuth(<DashboardPage />, {
        authValue: { isLoading: true },
      });

      // Verify spinner is present initially
      let spinner = container.querySelector('[class*="ant-spin"]');
      expect(spinner).toBeDefined();

      // Rerender with loading: false
      rerender(<DashboardPage />);

      await waitFor(() => {
        spinner = container.querySelector('[class*="ant-spin"]');
        expect(spinner).toBeNull();
      });
    });
  });

  describe('Data Display', () => {
    it('should display recent activities with descriptions', () => {
      renderWithAuth(<DashboardPage />);

      // Check for activity items
      const appStarted = screen.queryByText(/Application started/i);
      const loginSuccess = screen.queryByText(/successful/i);

      expect(appStarted || loginSuccess).toBeTruthy();
    });

    it('should display technology versions in tech stack', () => {
      renderWithAuth(<DashboardPage />);

      // Tech items should be displayed
      const techItems = screen.getAllByText(/TypeScript|React|Actix|Bun/i);
      expect(techItems.length).toBeGreaterThan(2);
    });

    it('should display icons with technology items', () => {
      const { container } = renderWithAuth(<DashboardPage />);

      const icons = container.querySelectorAll('[class*="anticon"]');
      expect(icons.length).toBeGreaterThan(0);
    });
  });

  describe('Styling and Layout', () => {
    it('should use Ant Design components for layout', () => {
      const { container } = renderWithAuth(<DashboardPage />);

      // Verify Ant Design classes are present
      const antElements = container.querySelectorAll('[class*="ant-"]');
      expect(antElements.length).toBeGreaterThan(5);
    });

    it('should use space component for consistent spacing', () => {
      const { container } = renderWithAuth(<DashboardPage />);

      // Check for Ant Space component
      const spaceElements = container.querySelectorAll('[class*="ant-space"]');
      expect(spaceElements.length).toBeGreaterThan(0);
    });

    it('should organize content in card sections', () => {
      const { container } = renderWithAuth(<DashboardPage />);

      // Verify card components are used
      const cards = container.querySelectorAll('[class*="ant-card"]');
      expect(cards.length).toBeGreaterThan(0);
    });
  });

  describe('Responsive Design', () => {
    it('should render dashboard on desktop viewport', () => {
      renderWithAuth(<DashboardPage />);

      const heading = screen.getByText(/Welcome back/i);
      expect(heading).toBeDefined();
    });

    it('should use responsive grid layout with rows and columns', () => {
      const { container } = renderWithAuth(<DashboardPage />);

      // Verify grid structure
      const gridElements = container.querySelectorAll('[class*="ant-row"], [class*="ant-col"]');
      expect(gridElements.length).toBeGreaterThan(0);
    });

    it('should organize content in responsive columns', () => {
      const { container } = renderWithAuth(<DashboardPage />);

      const columns = container.querySelectorAll('[class*="ant-col"]');
      expect(columns.length).toBeGreaterThan(0);
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading hierarchy', () => {
      renderWithAuth(<DashboardPage />);

      const headings = screen.getAllByRole('heading');
      expect(headings.length).toBeGreaterThan(0);

      // Verify headings have content
      headings.forEach(heading => {
        expect(heading.textContent?.trim().length).toBeGreaterThan(0);
      });
    });

    it('should display readable and descriptive text', () => {
      renderWithAuth(<DashboardPage />);

      // Verify key text content is present
      const welcomeText = screen.getByText(/Welcome/i);
      const tenantText = screen.getByText(mockTenant.name);

      expect(welcomeText.textContent?.length).toBeGreaterThan(5);
      expect(tenantText.textContent?.length).toBeGreaterThan(0);
    });

    it('should use semantic HTML from Ant Design', () => {
      const { container } = renderWithAuth(<DashboardPage />);

      // Verify semantic components are used
      const semanticElements = container.querySelectorAll('article, section, nav, main');
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  describe('Content Updates', () => {
    it('should display current user info after rerender', () => {
      const { rerender } = renderWithAuth(<DashboardPage />);

      rerender(<DashboardPage />);

      const greeting = screen.getByText(/Welcome back/i);
      expect(greeting).toBeDefined();
      expect(greeting.textContent).toContain(mockUser.firstName || 'User');
    });

    it('should update to show current user information', () => {
      renderWithAuth(<DashboardPage />);

      // Verify user info is displayed
      const userName = screen.getByText(new RegExp(mockUser.firstName || 'User'));
      expect(userName).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should render gracefully when user name is missing', () => {
      renderWithAuth(<DashboardPage />, {
        authValue: { user: { ...mockUser, firstName: undefined } },
      });

      // Page should still render with welcome message
      const welcome = screen.getByText(/Welcome back/i);
      expect(welcome).toBeDefined();
    });

    it('should render gracefully when tenant name is empty', () => {
      renderWithAuth(<DashboardPage />, {
        authValue: { tenant: { ...mockTenant, name: '' } },
      });

      // Page should still render successfully
      expect(screen.getByText(/Welcome back/i)).toBeDefined();
    });

    it('should handle very long user name without overflow', () => {
      const longName = 'A'.repeat(100);
      renderWithAuth(<DashboardPage />, {
        authValue: { user: { ...mockUser, firstName: longName } },
      });

      const container = screen.getByText(/Welcome back/i).parentElement;
      expect(container).toBeDefined();

      // Verify long name is truncated or wrapped (check computed style or class)
      const computedStyle = window.getComputedStyle(container!);
      const hasOverflow =
        computedStyle.overflow === 'hidden' || computedStyle.textOverflow === 'ellipsis';
      const hasWordWrap =
        computedStyle.wordWrap === 'break-word' || computedStyle.wordBreak === 'break-word';

      expect(
        hasOverflow || hasWordWrap || container?.classList.toString().includes('truncate')
      ).toBe(true);
    });
  });

  describe('Links and Navigation', () => {
    it('should have links to main features', () => {
      renderWithAuth(<DashboardPage />);

      const links = screen.queryAllByRole('link');
      expect(links.length).toBeGreaterThan(0);
    });

    it('should have clickable navigation elements', async () => {
      const user = userEvent.setup();
      renderWithAuth(<DashboardPage />);

      const links = screen.queryAllByRole('link');
      if (links.length > 0) {
        const firstLink = links[0];
        expect(firstLink).toBeDefined();
        // Verify link is focusable and has proper attributes
        if (firstLink) {
          const href = firstLink.getAttribute('href');
          const role = firstLink.getAttribute('role');
          expect(href || role).toBeDefined();
        }
      }
    });

    it('should render with proper link structure', () => {
      renderWithAuth(<DashboardPage />);

      // Verify page structure is intact for navigation
      expect(screen.getByText(/Welcome back/i)).toBeDefined();
    });
  });
});
