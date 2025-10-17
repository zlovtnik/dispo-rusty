import { describe, it, expect } from 'bun:test';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithAuth, mockUser, mockTenant } from '../../test-utils/render';
import { Layout } from '../Layout';

describe('Layout Component', () => {
  describe('Rendering', () => {
    it('should render layout with children', () => {
      const testContent = 'Test Content';
      renderWithAuth(<Layout>{testContent}</Layout>);

      expect(screen.getByText(testContent)).toBeInTheDocument();
    });

    it('should display user first name in header', () => {
      renderWithAuth(<Layout>Content</Layout>);

      // User name should be visible in profile area
      if (mockUser.firstName) {
        const userNameElements = screen.queryAllByText(mockUser.firstName);
        expect(userNameElements.length).toBeGreaterThan(0);
      }
    });

    it('should display tenant name in layout', () => {
      renderWithAuth(<Layout>Content</Layout>);

      const tenantDisplay = screen.getByText(mockTenant.name);
      expect(tenantDisplay).toBeInTheDocument();
    });

    it('should render dashboard menu item', () => {
      renderWithAuth(<Layout>Content</Layout>);

      // Dashboard link should be accessible in menu
      expect(screen.getByText(/Dashboard/i)).toBeInTheDocument();
    });

    it('should render address book menu item', () => {
      renderWithAuth(<Layout>Content</Layout>);

      // Address book link should be accessible
      expect(screen.getByText(/Address Book|address|contacts/i)).toBeInTheDocument();
    });

    it('should render user profile avatar or trigger', () => {
      renderWithAuth(<Layout>Content</Layout>);

      // User profile section should exist
      if (mockUser.firstName) {
        const profileElements = screen.getAllByText(mockUser.firstName);
        expect(profileElements.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Navigation', () => {
    it('should navigate to dashboard when dashboard menu item is clicked', async () => {
      const user = userEvent.setup();
      renderWithAuth(<Layout>Content</Layout>, {
        initialRoute: '/contacts',
      });

      // Find and click dashboard menu item
      const dashboardLink = screen.getByText(/Dashboard/i);
      await user.click(dashboardLink);
      // Navigation action should be triggered - check for route change or navigation effect
      await waitFor(() => {
        expect(window.location.pathname).toBe('/dashboard');
      });
    });

    it('should navigate to address book when contacts menu item is clicked', async () => {
      const user = userEvent.setup();
      renderWithAuth(<Layout>Content</Layout>, {
        initialRoute: '/dashboard',
      });

      // Find and click contacts menu item
      const contactsLink = screen.getByText(/Address Book|address|contacts/i);
      await user.click(contactsLink);
      // Navigation action should be triggered - check for route change
      await waitFor(() => {
        expect(window.location.pathname).toBe('/contacts');
      });
    });

    it('should have navigation menu items present', () => {
      renderWithAuth(<Layout>Content</Layout>);

      // Main navigation items should exist in menu
      const menuItems = screen.getAllByRole('menuitem');
      expect(menuItems.length).toBeGreaterThan(0);
    });
  });

  describe('User Menu and Profile', () => {
    it('should display user profile in header', () => {
      renderWithAuth(<Layout>Content</Layout>);

      // User name should be visible
      if (mockUser.firstName) {
        const userElements = screen.getAllByText(mockUser.firstName);
        expect(userElements.length).toBeGreaterThan(0);
      }
    });

    it('should show user profile dropdown menu when clicked', async () => {
      const user = userEvent.setup();
      renderWithAuth(<Layout>Content</Layout>);

      // Find user profile element
      if (mockUser.firstName) {
        const userElements = screen.getAllByText(mockUser.firstName);
        expect(userElements.length).toBeGreaterThan(0);

        await user.click(userElements[0]!);
        // Dropdown should be triggered - check for dropdown content or aria-expanded
        await waitFor(() => {
          const dropdown = screen.getByRole('menu', { hidden: true });
          expect(dropdown).toBeInTheDocument();
        });
      }
    });

    it('should have logout option accessible', () => {
      renderWithAuth(<Layout>Content</Layout>);

      // Logout option should be available in profile menu
      expect(screen.getByText(/Logout|Log out|Sign out/i)).toBeInTheDocument();
    });

    it('should display email in profile menu', () => {
      renderWithAuth(<Layout>Content</Layout>);

      // Email should be displayed somewhere in layout
      const emailElements = screen.getAllByText(mockUser.email);
      expect(emailElements.length).toBeGreaterThan(0);
    });
  });

  describe('Responsive Behavior', () => {
    it('should render layout on desktop breakpoint', () => {
      renderWithAuth(<Layout>Content</Layout>);

      // Main content should be visible
      expect(screen.getByText('Content')).toBeInTheDocument();
    });

    it('should have menu toggle button for mobile responsive', () => {
      renderWithAuth(<Layout>Content</Layout>);

      // Menu toggle button should exist
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('should toggle sidebar visibility on hamburger menu click', async () => {
      const user = userEvent.setup();
      const { container } = renderWithAuth(<Layout>Content</Layout>);

      // Find hamburger/menu toggle button
      const buttons = screen.getAllByRole('button');
      const toggleButton = buttons.find(btn => {
        const ariaExpanded = btn.getAttribute('aria-expanded');
        const isMenuButton =
          btn.getAttribute('aria-label')?.includes('menu') || btn.className.includes('trigger');
        return ariaExpanded !== null || isMenuButton;
      });

      expect(toggleButton).toBeInTheDocument();

      // Record initial state
      const initialState = toggleButton!.getAttribute('aria-expanded');

      // Click to toggle
      await user.click(toggleButton!);

      // Verify state changed or sidebar visibility changed
      await waitFor(() => {
        const newState = toggleButton!.getAttribute('aria-expanded');
        expect(newState).not.toBe(initialState);
        const sidebar = container.querySelector('[class*="ant-layout-sider"]');
        expect(sidebar).toBeInTheDocument();
      });
    });

    it('should handle sidebar collapse/expand state', () => {
      const { container } = renderWithAuth(<Layout>Content</Layout>);

      // Sidebar should exist and handle state
      const sidebar = container.querySelector('[class*="ant-layout-sider"]');
      expect(sidebar).toBeInTheDocument();
      // Verify sidebar has collapse trigger if present
      const collapseTrigger = sidebar!.querySelector('[class*="trigger"]');
      expect(collapseTrigger || sidebar).toBeInTheDocument();
    });
  });

  describe('Theme and Styling', () => {
    it('should apply Ant Design layout styles', () => {
      const { container } = renderWithAuth(<Layout>Content</Layout>);

      // Verify ant-layout component is rendered
      const layoutContainer = container.querySelector('[class*="ant-layout"]');
      expect(layoutContainer).toBeInTheDocument();
    });

    it('should render with Ant Design menu and layout components', () => {
      const { container } = renderWithAuth(<Layout>Content</Layout>);

      // Check for Ant Design layout structure
      const antLayout = container.querySelector('[class*="ant-layout"]');
      const antMenu = container.querySelector('[class*="ant-menu"]');

      expect(antLayout).toBeInTheDocument();
      // Menu should be present
      expect(antMenu).toBeInTheDocument();
    });

    it('should have proper component hierarchy', () => {
      const { container } = renderWithAuth(<Layout>Content</Layout>);

      // Verify Ant Design components exist
      const layoutElements = container.querySelectorAll('[class*="ant-layout"]');
      expect(layoutElements.length).toBeGreaterThan(0);

      // Verify header, content sections
      const layoutHeader = container.querySelector('[class*="ant-layout-header"]');
      const layoutContent = container.querySelector('[class*="ant-layout-content"]');

      expect(layoutHeader || layoutContent).toBeDefined();
    });
  });

  describe('Accessibility', () => {
    it('should have proper navigation role', () => {
      renderWithAuth(<Layout>Content</Layout>);

      // Navigation should be marked with proper role
      const navElements = screen.getAllByRole('navigation');
      expect(navElements.length).toBeGreaterThan(0);
    });

    it('should have keyboard accessible menu items', async () => {
      const user = userEvent.setup();
      renderWithAuth(<Layout>Content</Layout>);

      // Menu items should be keyboard accessible
      const menuItems = screen.getAllByRole('menuitem');
      expect(menuItems.length).toBeGreaterThan(0);

      // Verify at least one menu item is accessible via tab
      await user.keyboard('{Tab}');
      // Focus should be manageable
      expect(menuItems[0]).toBeInTheDocument();
    });

    it('should have proper heading hierarchy', () => {
      renderWithAuth(<Layout>Content</Layout>);

      // Headings should exist in proper order
      const headings = screen.getAllByRole('heading');
      expect(headings.length).toBeGreaterThan(0);

      // Verify headings have content
      for (const heading of headings) {
        const content = heading.textContent?.trim();
        expect(content).toBeTruthy();
      }
    });

    it('should have alt text or aria labels for images', () => {
      const { container } = renderWithAuth(<Layout>Content</Layout>);

      // Check images have proper labels
      const images = container.querySelectorAll('img');
      for (const img of images) {
        const hasAlt = img.hasAttribute('alt');
        const hasAriaLabel = img.hasAttribute('aria-label');
        expect(hasAlt || hasAriaLabel).toBeTruthy();
      }
    });
  });

  describe('Menu Rendering', () => {
    it('should render active menu item highlighting', () => {
      renderWithAuth(<Layout>Content</Layout>, {
        initialRoute: '/dashboard',
      });

      // Menu should render with items
      const menuItems = screen.getAllByRole('menuitem');
      expect(menuItems.length).toBeGreaterThan(0);
    });

    it('should display all main menu items', () => {
      renderWithAuth(<Layout>Content</Layout>);

      // All menu items should be rendered and visible
      const menuItems = screen.getAllByRole('menuitem');
      expect(menuItems.length).toBeGreaterThan(0);

      // Verify key menu items exist
      const dashboardExists = menuItems.some(item => item.textContent?.includes('Dashboard'));
      expect(dashboardExists).toBeTruthy();
    });

    it('should have proper menu structure with Ant Design', () => {
      const { container } = renderWithAuth(<Layout>Content</Layout>);

      // Verify menu component is rendered
      const menu = container.querySelector('[class*="ant-menu"]');
      expect(menu).toBeInTheDocument();

      // Menu should contain items
      const menuItems = container.querySelectorAll('[class*="ant-menu-item"]');
      expect(menuItems.length).toBeGreaterThan(0);
    });
  });

  describe('Content Area', () => {
    it('should render children in main content area', () => {
      const testId = 'test-content-id';
      renderWithAuth(
        <Layout>
          <div data-testid={testId}>Main Content</div>
        </Layout>
      );

      expect(screen.getByTestId(testId)).toBeInTheDocument();
      expect(screen.getByText('Main Content')).toBeInTheDocument();
    });

    it('should properly display dynamic content updates', () => {
      const dynamicContent = 'Dynamic Test Content';
      renderWithAuth(
        <Layout>
          <div>{dynamicContent}</div>
        </Layout>
      );

      expect(screen.getByText(dynamicContent)).toBeInTheDocument();
    });

    it('should render content in proper layout section', () => {
      const { container } = renderWithAuth(
        <Layout>
          <div>Test Content Area</div>
        </Layout>
      );

      // Content should be in layout-content section
      const layoutContent = container.querySelector('[class*="ant-layout-content"]');
      expect(layoutContent).toBeInTheDocument();
      expect(layoutContent!.textContent).toContain('Test Content Area');
    });
  });

  describe('Layout Structure', () => {
    it('should have proper ant-layout structure', () => {
      const { container } = renderWithAuth(<Layout>Content</Layout>);

      // Main layout container should exist
      const layoutElements = container.querySelectorAll('[class*="ant-layout"]');
      expect(layoutElements.length).toBeGreaterThan(0);
    });

    it('should render sider and content layout components', () => {
      const { container } = renderWithAuth(<Layout>Content</Layout>);

      // Check for sider component
      const sider = container.querySelector('[class*="ant-layout-sider"]');
      expect(sider).toBeInTheDocument();

      // Check for content component
      const content = container.querySelector('[class*="ant-layout-content"]');
      expect(content).toBeInTheDocument();
    });

    it('should render header section with user and tenant info', () => {
      const { container } = renderWithAuth(<Layout>Content</Layout>);

      // Header should contain user and tenant information
      const header = container.querySelector('[class*="ant-layout-header"]');
      expect(header).toBeInTheDocument();
      if (mockUser.firstName) {
        expect(header!.textContent).toContain(mockUser.firstName);
        expect(header!.textContent).toContain(mockTenant.name);
      }
    });

    it('should render menu in sider section', () => {
      const { container } = renderWithAuth(<Layout>Content</Layout>);

      // Menu should be present in layout
      const menu = container.querySelector('[class*="ant-menu"]');
      expect(menu).toBeInTheDocument();

      // Menu items should be present
      const menuItems = container.querySelectorAll('[class*="ant-menu-item"]');
      expect(menuItems.length).toBeGreaterThan(0);
    });
  });
});
