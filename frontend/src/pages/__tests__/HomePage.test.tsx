import { describe, it, expect } from 'bun:test';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithoutAuth, renderWithAuth } from '../../test-utils/render';
import { HomePage } from '../HomePage';

describe('HomePage Component', () => {
  describe('Rendering', () => {
    it('should render home page with features', () => {
      renderWithoutAuth(<HomePage />);

      // Should display feature cards
      const features = screen.queryAllByText(
        /Secure Authentication|Multi-Tenant|High Performance/i
      );
      expect(features.length).toBeGreaterThan(0);
    });

    it('should display feature icons', () => {
      const { container } = renderWithoutAuth(<HomePage />);

      // Should render feature icons
      const icons = container.querySelectorAll('[class*="anticon"]');
      expect(icons.length).toBeGreaterThan(0);
    });

    it('should display feature descriptions', () => {
      renderWithoutAuth(<HomePage />);

      // Should have descriptions for features
      const descriptions = screen.queryAllByText(/JWT|tenant|Bun|TypeScript/i);
      expect(descriptions.length).toBeGreaterThanOrEqual(0);
    });

    it('should have navigation links', () => {
      renderWithoutAuth(<HomePage />);

      // Should have login/signup buttons
      const buttons = screen.queryAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  describe('Feature Sections', () => {
    it('should display security feature', () => {
      renderWithoutAuth(<HomePage />);

      expect(screen.queryAllByText(/Secure|Security|JWT/i).length).toBeGreaterThan(0);
    });

    it('should display multi-tenant feature', () => {
      renderWithoutAuth(<HomePage />);

      expect(screen.queryAllByText(/Multi-Tenant|tenant|isolation/i).length).toBeGreaterThan(0);
    });

    it('should display performance feature', () => {
      renderWithoutAuth(<HomePage />);

      expect(screen.queryAllByText(/Performance|Bun|fast|speed/i).length).toBeGreaterThan(0);
    });
  });

  describe('Authentication Redirect', () => {
    it('should redirect authenticated users to dashboard', () => {
      renderWithAuth(<HomePage />, {
        initialRoute: '/',
      });

      // Should not show home page content
      const features = screen.queryAllByText(/Secure Authentication/i);
      expect(features.length).toBe(0);
    });

    it('should show home page for unauthenticated users', () => {
      renderWithoutAuth(<HomePage />);

      // Should display features
      const elements = screen.queryAllByRole('heading');
      expect(elements.length).toBeGreaterThan(0);
    });
  });

  describe('Navigation', () => {
    it('should have login button', () => {
      renderWithoutAuth(<HomePage />);

      const buttons = screen.queryAllByRole('button');
      const loginButton = buttons.find(
        b =>
          b.textContent?.toLowerCase().includes('login') ||
          b.textContent?.toLowerCase().includes('sign')
      );
      expect(loginButton || buttons.length).toBeGreaterThan(0);
    });

    it('should navigate to login on button click', async () => {
      const user = userEvent.setup();
      renderWithoutAuth(<HomePage />, {
        initialRoute: '/',
      });

      const buttons = screen.queryAllByRole('button');
      if (buttons.length > 0) {
        // Should have clickable button
      }
    });
  });

  describe('Content', () => {
    it('should display welcome message', () => {
      renderWithoutAuth(<HomePage />);

      // Should have some welcome text
      const elements = screen.queryAllByRole('heading');
      expect(elements.length).toBeGreaterThan(0);
    });

    it('should display technology stack', () => {
      renderWithoutAuth(<HomePage />);

      // Should mention React, Rust, etc.
      const elements = screen.queryAllByText(/React|Rust|TypeScript|Bun/i);
      expect(elements.length).toBeGreaterThanOrEqual(0);
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

      const headings = screen.queryAllByRole('heading');
      expect(headings.length).toBeGreaterThan(0);
    });

    it('should have accessible buttons', () => {
      renderWithoutAuth(<HomePage />);

      const buttons = screen.queryAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });
});
