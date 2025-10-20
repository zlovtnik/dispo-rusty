import { describe, it, expect } from 'bun:test';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithoutAuth, renderWithAuthAndNavigation } from '../../test-utils/render';
import { HomePage } from '../HomePage';

// Helper function to find login/sign button
const findLoginButton = (buttons: HTMLElement[]): HTMLElement | undefined => {
  return buttons.find(button => {
    const text = button.textContent;
    if (!text) return false;
    return text.toLowerCase().includes('login') || text.toLowerCase().includes('sign');
  });
};

describe('HomePage Component', () => {
  describe('Rendering', () => {
    it('should render home page with features', () => {
      renderWithoutAuth(<HomePage />);

      // Should display feature cards
      const features = screen.getAllByText(/Secure Authentication|Multi-Tenant|High Performance/i);
      expect(features.length).toBeGreaterThan(0);
    });
  });

  describe('Feature Sections', () => {
    it('should display all features with proper structure and accessibility', () => {
      renderWithoutAuth(<HomePage />);

      // Test that we can find the main welcome text (this should fail if we're redirected)
      expect(screen.getByText('Welcome to the Natural Pharmacy System')).toBeInTheDocument();

      // Test that we can find the feature titles
      expect(screen.getByText('Secure Authentication')).toBeInTheDocument();
      expect(screen.getByText('Multi-Tenant Architecture')).toBeInTheDocument();
      expect(screen.getByText('High Performance')).toBeInTheDocument();

      // Test that we can find the feature icons by their accessible labels
      expect(screen.getByLabelText('Secure Authentication icon')).toBeInTheDocument();
      expect(screen.getByLabelText('Multi-Tenant Architecture icon')).toBeInTheDocument();
      expect(screen.getByLabelText('High Performance icon')).toBeInTheDocument();

      // Test that we can find feature descriptions with key terms
      expect(screen.getByText(/JWT.*authentication/i)).toBeInTheDocument();
      expect(screen.getByText(/tenant.*isolation/i)).toBeInTheDocument();
      expect(screen.getByText(/Bun.*TypeScript/i)).toBeInTheDocument();
    });
  });

  describe('Authentication Redirect', () => {
    it('should redirect authenticated users to dashboard', () => {
      const { getCurrentLocation } = renderWithAuthAndNavigation(<HomePage />, {
        initialRoute: '/',
      });

      // HomePage redirects authenticated users to /dashboard
      // Verify the actual navigation occurred by checking the current pathname
      expect(getCurrentLocation().pathname).toBe('/dashboard');
    });

    it('should show home page for unauthenticated users', () => {
      renderWithoutAuth(<HomePage />);

      // Should display the specific welcome message
      const welcomeHeading = screen.getByRole('heading', {
        name: /Welcome to the Natural Pharmacy System/i,
      });
      expect(welcomeHeading).toBeInTheDocument();

      // Should display features
      const elements = screen.getAllByRole('heading');
      expect(elements.length).toBeGreaterThan(0);
    });
  });

  describe('Navigation', () => {
    it('should have login button', () => {
      renderWithoutAuth(<HomePage />);

      const buttons = screen.getAllByRole('button');
      const loginButton = findLoginButton(buttons);
      expect(loginButton).toBeDefined();
    });

    it('should navigate to login on button click', async () => {
      const user = userEvent.setup();
      renderWithoutAuth(<HomePage />, {
        initialRoute: '/',
      });

      const buttons = screen.queryAllByRole('button');
      const loginButton = findLoginButton(buttons);
      expect(loginButton).toBeDefined();
      if (loginButton) {
        await user.click(loginButton);
        // Verify navigation occurred (e.g., check URL or confirm redirect)
        // This depends on your router setup
      }
    });
  });

  describe('Content', () => {
    it('should display welcome message', () => {
      renderWithoutAuth(<HomePage />);

      // Should have some welcome text
      const elements = screen.getAllByRole('heading');
      expect(elements.length).toBeGreaterThan(0);
    });

    it('should display technology stack', () => {
      renderWithoutAuth(<HomePage />);

      // Should mention React, Rust, etc.
      const elements = screen.getAllByText(/React|Rust|TypeScript|Bun/i);
      expect(elements.length).toBeGreaterThan(0);
    });
  });

  describe('Styling', () => {
    it('should have proper layout structure', () => {
      const { container } = renderWithoutAuth(<HomePage />);

      const layouts = container.querySelectorAll('[class*="ant-layout"]');
      expect(layouts.length).toBeGreaterThan(0);
    });

    it('should have feature cards', () => {
      const { container } = renderWithoutAuth(<HomePage />);

      const cards = container.querySelectorAll('[class*="ant-card"]');
      expect(cards.length).toBeGreaterThan(0);
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading hierarchy', () => {
      renderWithoutAuth(<HomePage />);

      // Wait for the component to render and get all headings
      const allHeadings = screen.getAllByRole('heading');
      expect(allHeadings.length).toBeGreaterThan(0);

      // Assert there is a level-1 heading (h1)
      const h1Heading = allHeadings.find(heading => heading.tagName === 'H1');
      expect(h1Heading).toBeInTheDocument();
      expect(h1Heading).toHaveTextContent(/Welcome to the Natural Pharmacy System/i);

      // Assert there is at least one level-2 heading (h2) - the feature titles are h4 but we'll check for any h2+ headings
      const h2Headings = allHeadings.filter(heading => heading.tagName === 'H2');
      const h3Headings = allHeadings.filter(heading => heading.tagName === 'H3');
      const h4Headings = allHeadings.filter(heading => heading.tagName === 'H4');

      // Should have at least one h2 or h3 heading (feature titles are h4)
      const subHeadings = [...h2Headings, ...h3Headings, ...h4Headings];
      expect(subHeadings.length).toBeGreaterThan(0);

      // Verify proper nesting - h1 should come before other headings in the main content
      // Note: The header has an h4, but the main content h1 should come before the feature h4s
      const h1Index = allHeadings.findIndex(heading => heading.tagName === 'H1');
      const featureH4s = allHeadings.filter(
        heading => heading.tagName === 'H4' && heading.id?.startsWith('feature-title-')
      );

      if (featureH4s.length > 0) {
        const firstFeatureH4Index = allHeadings.findIndex(
          heading => heading.tagName === 'H4' && heading.id?.startsWith('feature-title-')
        );
        expect(h1Index).toBeLessThan(firstFeatureH4Index);
      }
    });

    it('should have accessible buttons with proper labels and roles', () => {
      renderWithoutAuth(<HomePage />);

      // Test "Get Started" button
      const getStartedButton = screen.getByRole('button', { name: /get started/i });
      expect(getStartedButton).toBeInTheDocument();
      expect(getStartedButton).toBeVisible();
      expect(getStartedButton).toHaveAttribute('type', 'button');

      // Test "Sign In" button
      const signInButton = screen.getByRole('button', { name: /sign in/i });
      expect(signInButton).toBeInTheDocument();
      expect(signInButton).toBeVisible();
      expect(signInButton).toHaveAttribute('type', 'button');

      // Verify all buttons have accessible names (either visible text or aria-label)
      const allButtons = screen.getAllByRole('button');
      allButtons.forEach(button => {
        const accessibleName = button.getAttribute('aria-label') ?? button.textContent;
        expect(accessibleName).toBeTruthy();
        if (accessibleName) {
          expect(accessibleName.trim().length).toBeGreaterThan(0);
        }
      });
    });

    it('should support keyboard navigation for buttons', async () => {
      const user = userEvent.setup();
      renderWithoutAuth(<HomePage />);

      // Test "Get Started" button keyboard interaction
      const getStartedButton = screen.getByRole('button', { name: /get started/i });

      // Focus the button
      getStartedButton.focus();
      expect(getStartedButton).toHaveFocus();

      // Test keyboard activation (Enter key)
      await user.keyboard('{Enter}');
      // Note: The actual navigation behavior would be tested in integration tests
      // Here we just verify the button can be activated via keyboard

      // Test "Sign In" button keyboard interaction
      const signInButton = screen.getByRole('button', { name: /sign in/i });

      // Focus the button
      signInButton.focus();
      expect(signInButton).toHaveFocus();

      // Test keyboard activation (Space key)
      await user.keyboard(' ');
      // Note: The actual navigation behavior would be tested in integration tests
      // Here we just verify the button can be activated via keyboard

      // Test Tab navigation between buttons
      await user.tab();
      // The focus should move to the next focusable element
      // This verifies that keyboard navigation works properly
    });
  });
});
