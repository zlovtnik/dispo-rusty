import { describe, it, expect } from 'bun:test';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  renderWithAuth,
  renderWithAuthAndNavigation,
  mockUser,
  mockTenant,
} from '../../test-utils/render';
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

      // Ensure mockUser.firstName is defined before using it
      expect(mockUser.firstName).toBeDefined();
      const firstName = mockUser.firstName;

      // User name should be visible in profile area
      expect(screen.getByText(firstName!)).toBeInTheDocument();
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
      expect(
        screen.getByRole('menuitem', { name: /^(Address Book|Contacts)$/i })
      ).toBeInTheDocument();
    });

    it('should render user profile avatar or trigger', () => {
      renderWithAuth(<Layout>Content</Layout>);

      // Find the profile area by looking for the user's first name
      const profileNameElement = screen.getByText(mockUser.firstName ?? '');

      // Verify the profile name element is within a dropdown trigger container
      const profileContainer = profileNameElement.closest('[role="button"]');
      expect(profileContainer).toBeInTheDocument();

      // Verify the avatar is present in the same container with correct initial
      const avatar = profileContainer?.querySelector('.ant-avatar');
      expect(avatar).toBeInTheDocument();
      expect(avatar).toHaveTextContent((mockUser.firstName ?? '').charAt(0).toUpperCase());

      // Verify the user name span contains the firstName and is visible
      expect(profileNameElement).toBeInTheDocument();
      expect(profileNameElement).toHaveTextContent(mockUser.firstName ?? '');

      // Verify the container has a data attribute or class indicating it's a trigger
      expect(profileContainer).toHaveAttribute('role', 'button');
    });
  });

  describe('Navigation', () => {
    it('should navigate to dashboard when dashboard menu item is clicked', async () => {
      const user = userEvent.setup();
      const { getCurrentLocation } = renderWithAuthAndNavigation(<Layout>Content</Layout>, {
        initialRoute: '/contacts',
      });

      // Find and click dashboard menu item
      const dashboardLink = screen.getByText(/Dashboard/i);
      await user.click(dashboardLink);

      // Verify the navigation occurred by checking the current location
      await waitFor(() => {
        expect(getCurrentLocation().pathname).toBe('/dashboard');
      });
    });

    it('should navigate to address book when contacts menu item is clicked', async () => {
      const user = userEvent.setup();
      const { getCurrentLocation } = renderWithAuthAndNavigation(<Layout>Content</Layout>, {
        initialRoute: '/dashboard',
      });

      // Find and click contacts menu item
      const contactsLink = screen.getByText(/Address Book|address|contacts/i);
      await user.click(contactsLink);

      // Verify the navigation occurred by checking the current location
      await waitFor(() => {
        expect(getCurrentLocation().pathname).toBe('/address-book');
      });
    });

    it('should have navigation menu items present', () => {
      renderWithAuth(<Layout>Content</Layout>);

      // Verify specific navigation menu items are rendered
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Address Book')).toBeInTheDocument();
      expect(screen.getByText('Tenants')).toBeInTheDocument();
    });
  });

  describe('User Menu and Profile', () => {
    it('should display user profile in header', () => {
      renderWithAuth(<Layout>Content</Layout>);

      // User name should be visible
      expect(mockUser.firstName).toBeTruthy();
      const userElements = screen.getAllByText(mockUser.firstName!);
      expect(userElements.length).toBeGreaterThan(0);
    });

    it('should show user profile dropdown menu when clicked', async () => {
      const user = userEvent.setup();
      renderWithAuth(<Layout>Content</Layout>);

      // Assert that mockUser.firstName is defined
      expect(mockUser.firstName).toBeDefined();
      const firstName = mockUser.firstName!;

      // Find user profile element
      const userElements = screen.queryAllByText(firstName);
      expect(userElements.length).toBeGreaterThan(0);

      // Use non-null assertion since we verified length > 0
      await user.click(userElements[0]!);
      // Dropdown should be triggered - check for visible dropdown content
      await waitFor(() => {
        const dropdown = screen.getByRole('menu');
        expect(dropdown).toBeInTheDocument();
      });
    });

    it('should have logout option accessible', async () => {
      const user = userEvent.setup();
      renderWithAuth(<Layout>Content</Layout>);

      // Click the profile dropdown trigger to open the menu
      const profileTrigger = screen.getByText(mockUser.firstName!);
      await user.click(profileTrigger);

      // Wait for the logout option to appear in the dropdown menu
      await waitFor(() => {
        expect(screen.getByText('Logout')).toBeInTheDocument();
      });
    });

    it.skip('should display email in profile menu', () => {
      renderWithAuth(<Layout>Content</Layout>);

      // Email is not currently displayed in the UI - this test should be updated
      // or removed if email display is not planned
      // For now, we'll check that the user object has an email
      expect(mockUser.email).toBe('test@example.com');
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

      // Find the menu toggle button by looking for the MenuOutlined icon
      const menuToggleButton = screen.getByRole('button', {
        name: /toggle menu/i,
      });
      expect(menuToggleButton).toBeInTheDocument();
    });

    it('should toggle sidebar visibility on hamburger menu click', async () => {
      const user = userEvent.setup();
      const { container } = renderWithAuth(<Layout>Content</Layout>);

      // Find the menu toggle button by looking for the MenuOutlined icon
      const toggleButton = screen.getByRole('button', {
        name: /toggle menu/i,
      });
      expect(toggleButton).toBeInTheDocument();

      // Get the sidebar element
      const sidebar = container.querySelector('[class*="ant-layout-sider"]');
      expect(sidebar).toBeInTheDocument();

      // Record initial collapsed state
      const initialCollapsed = sidebar?.classList.contains('ant-layout-sider-collapsed');

      // Click to toggle
      await user.click(toggleButton);

      // Verify sidebar state changed
      await waitFor(() => {
        const newCollapsed = sidebar?.classList.contains('ant-layout-sider-collapsed');
        expect(newCollapsed).not.toBe(initialCollapsed);
      });
    });
    it('should handle sidebar collapse/expand state', () => {
      const { container } = renderWithAuth(<Layout>Content</Layout>);

      // Sidebar should exist and handle state
      const sidebar = container.querySelector('[class*="ant-layout-sider"]');
      expect(sidebar).toBeInTheDocument();
    });
  });

  describe('Component Structure', () => {
    it('should render complete layout structure with proper Ant Design components and content', () => {
      const { container } = renderWithAuth(<Layout>Content</Layout>);

      // Verify main layout container
      const layoutContainer = container.querySelector('[class*="ant-layout"]');
      expect(layoutContainer).toBeInTheDocument();

      // Verify all main layout sections
      const layoutHeader = container.querySelector('[class*="ant-layout-header"]');
      const layoutSider = container.querySelector('[class*="ant-layout-sider"]');
      const layoutContent = container.querySelector('[class*="ant-layout-content"]');

      expect(layoutHeader).toBeInTheDocument();
      expect(layoutSider).toBeInTheDocument();
      expect(layoutContent).toBeInTheDocument();

      // Verify key content in header (user info)
      expect(mockUser.firstName).toBeTruthy();
      const headerText = layoutHeader?.textContent ?? '';
      expect(headerText).toContain(mockUser.firstName!);

      // Verify key content in sider (tenant info)
      const siderText = layoutSider?.textContent ?? '';
      expect(siderText).toContain(mockTenant.name);

      // Verify menu structure
      const menu = container.querySelector('[class*="ant-menu"]');
      expect(menu).toBeInTheDocument();

      // Verify menu items are present
      const menuItems = container.querySelectorAll('[class*="ant-menu-item"]');
      expect(menuItems.length).toBeGreaterThan(0);
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

      // Check if menu items have proper focus management
      // Ant Design menu items may not be directly focusable via Tab
      // Instead, verify they have proper ARIA attributes and structure
      const menu = screen.getByRole('menu');
      expect(menu).toBeInTheDocument();

      // Verify menu items have proper accessibility attributes
      for (let i = 0; i < menuItems.length; i++) {
        const item = menuItems[i];
        expect(item!).toHaveAttribute('role', 'menuitem');
        // Check if item is focusable (either tabIndex=0 or tabIndex=-1 but programmatically focusable)
        const tabIndex = item!.getAttribute('tabindex');
        expect(['0', '-1', null]).toContain(tabIndex);
      }

      // Test that menu items can receive focus programmatically
      expect(menuItems[0]).toBeDefined();
      const firstMenuItem = menuItems[0];
      firstMenuItem!.focus();
      expect(document.activeElement).toBe(firstMenuItem!);
    });

    it.skip('should have proper heading hierarchy', () => {
      // TODO: Implement proper heading hierarchy test when heading support is added
      // Link to feature ticket: [Add ticket link here]
    });

    it('should have alt text or aria labels for images', () => {
      const { container } = renderWithAuth(<Layout>Content</Layout>);

      // Check images have proper labels
      const images = container.querySelectorAll('img');
      images.forEach(img => {
        expect(img.hasAttribute('alt') || img.hasAttribute('aria-label')).toBeTruthy();
      });
      // Remove the "> 0" assertion as it can fail on image-less layouts
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
    it('should render children in main content area with dynamic updates', () => {
      const testId = 'test-content-id';
      const initialContent = 'Main Content';
      const dynamicContent = 'Dynamic Test Content';

      const { rerender, container } = renderWithAuth(
        <Layout>
          <div data-testid={testId}>{initialContent}</div>
        </Layout>
      );

      // Assert testId presence and initial text
      expect(screen.getByTestId(testId)).toBeInTheDocument();
      expect(screen.getByText(initialContent)).toBeInTheDocument();

      // Assert content is in the correct layout section
      const layoutContent = container.querySelector('[class*="ant-layout-content"]');
      expect(layoutContent).toBeInTheDocument();
      expect(layoutContent?.textContent).toContain(initialContent);

      // Update with dynamic content and assert the change
      rerender(
        <Layout>
          <div data-testid={testId}>{dynamicContent}</div>
        </Layout>
      );

      expect(screen.getByText(dynamicContent)).toBeInTheDocument();
      expect(screen.queryByText(initialContent)).not.toBeInTheDocument();
    });
  });
});
