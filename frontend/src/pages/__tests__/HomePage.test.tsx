import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithoutAuth, renderWithAuthAndNavigation } from '../../test-utils/render';
import { HomePage } from '../HomePage';

// Mock navigation tracking
let mockNavigate: ReturnType<typeof mock>;

// Mock react-router-dom navigation
void mock.module('react-router-dom', () => ({
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => {
    const handleClick = (e: React.MouseEvent): void => {
      e.preventDefault();
      mockNavigate(to);
    };
    return (
      <a href={to} onClick={handleClick} {...props}>
        {children}
      </a>
    );
  },
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate" data-to={to} />,
}));

describe('HomePage Component', () => {
  beforeEach(() => {
    mockNavigate = mock();
  });

  describe('Rendering', () => {
    it('should render home page with features', () => {
      renderWithoutAuth(<HomePage />);

      // Should display each feature individually
      expect(screen.getByText('Secure Authentication')).toBeInTheDocument();
      expect(screen.getByText('Multi-Tenant Architecture')).toBeInTheDocument();
      expect(screen.getByText('High Performance')).toBeInTheDocument();
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

      // Test that we can find feature descriptions with key terms (using getAllBy for multiple matches)
      const jwtElements = screen.getAllByText(/JWT.*authentication/i);
      expect(jwtElements.length).toBeGreaterThan(0);

      const tenantElements = screen.getAllByText(/tenant.*isolation/i);
      expect(tenantElements.length).toBeGreaterThan(0);

      const bunElements = screen.getAllByText(/Bun.*TypeScript/i);
      expect(bunElements.length).toBeGreaterThan(0);
    });
  });

  describe('Authentication Redirect', () => {
    it('should redirect authenticated users to dashboard', () => {
      renderWithAuthAndNavigation(<HomePage />, {
        initialRoute: '/',
      });

      // HomePage redirects authenticated users to /dashboard
      // Check for the Navigate component with the correct destination
      const navigateElement = screen.getByTestId('navigate');
      expect(navigateElement).toBeInTheDocument();
      expect(navigateElement).toHaveAttribute('data-to', '/dashboard');
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

      const loginButton = screen.getByRole('button', { name: /login|sign in/i });
      expect(loginButton).toBeInTheDocument();
    });
  });

  describe('Content', () => {
    it('should display technology stack', () => {
      renderWithoutAuth(<HomePage />);

      // Should mention React, Rust, etc.
      const elements = screen.getAllByText(/React|Rust|TypeScript|Bun/i);
      expect(elements.length).toBeGreaterThan(0);
    });
  });

  describe('Layout Structure', () => {
    it('should have proper semantic layout structure', () => {
      renderWithoutAuth(<HomePage />);

      // Test for hero H1 heading (main page title)
      const heroHeading = screen.getByRole('heading', { level: 1 });
      expect(heroHeading).toBeInTheDocument();
      expect(heroHeading).toHaveTextContent(/Welcome to.*Natural Pharmacy System/i);
      // Test for feature sections using accessible content
      // There are 4 headings total: 1 h1 (welcome), 1 h4 (header title), 3 h4 (features)
      const allHeadings = screen.getAllByRole('heading');
      expect(allHeadings.length).toBeGreaterThanOrEqual(4);

      // Verify specific feature titles are present
      expect(screen.getByText('Secure Authentication')).toBeInTheDocument();
      expect(screen.getByText('Multi-Tenant Architecture')).toBeInTheDocument();
      expect(screen.getByText('High Performance')).toBeInTheDocument();
    });

    it('should have feature cards with accessible structure', () => {
      renderWithoutAuth(<HomePage />);

      // Test for feature content using user-visible text
      const featureDescriptions = screen.getAllByText(
        /JWT.*authentication|tenant.*isolation|Bun.*TypeScript/i
      );
      expect(featureDescriptions).toHaveLength(3);

      // Test for feature icons using their accessible labels
      expect(screen.getByLabelText('Secure Authentication icon')).toBeInTheDocument();
      expect(screen.getByLabelText('Multi-Tenant Architecture icon')).toBeInTheDocument();
      expect(screen.getByLabelText('High Performance icon')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading structure', () => {
      renderWithoutAuth(<HomePage />);

      // Wait for the component to render and get all headings
      const allHeadings = screen.getAllByRole('heading');
      expect(allHeadings.length).toBeGreaterThan(0);

      // Assert there is a level-1 heading (h1)
      const h1Heading = allHeadings.find(heading => heading.tagName === 'H1');
      expect(h1Heading).toBeInTheDocument();
      expect(h1Heading).toHaveTextContent(/Welcome to the Natural Pharmacy System/i);

      // Assert there is at least one subheading (h2, h3, or h4)
      const h2Headings = allHeadings.filter(heading => heading.tagName === 'H2');
      const h3Headings = allHeadings.filter(heading => heading.tagName === 'H3');
      const h4Headings = allHeadings.filter(heading => heading.tagName === 'H4');

      const subHeadings = [...h2Headings, ...h3Headings, ...h4Headings];
      expect(subHeadings.length).toBeGreaterThan(0);
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

      // Assert that navigation was triggered for Get Started button
      expect(mockNavigate).toHaveBeenCalledWith('/register');

      // Test "Sign In" button keyboard interaction
      const signInButton = screen.getByRole('button', { name: /sign in/i });

      // Focus the button
      signInButton.focus();
      expect(signInButton).toHaveFocus();

      // Test keyboard activation (Space key)
      await user.keyboard(' ');

      // Assert that navigation was triggered for Sign In button
      expect(mockNavigate).toHaveBeenCalledWith('/login');

      // Test Tab navigation between buttons
      await user.tab();

      const nextFocusedElement = document.activeElement;
      expect(nextFocusedElement).not.toBe(signInButton);

      // Verify the focused element is interactive (button, link, or input)
      expect(nextFocusedElement?.tagName).toBeDefined();
      expect(['BUTTON', 'A', 'INPUT']).toContain(nextFocusedElement?.tagName!);
    });
  });
});
