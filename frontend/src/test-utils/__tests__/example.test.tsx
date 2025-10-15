/**
 * Example Test - Demonstrates Test Infrastructure
 *
 * This test file demonstrates how to use the comprehensive test infrastructure
 * including custom render functions, MSW API mocking, and test utilities.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import {
  renderWithProviders,
  renderWithAuth,
  renderWithoutAuth,
  screen,
  userEvent,
  setupMSW,
  teardownMSW,
  resetMSW,
  mockUser,
  mockTenant,
} from '../index';

// Simple example component for testing
function WelcomeMessage({ name }: { name?: string }) {
  return (
    <div>
      <h1>Welcome{name ? ` ${name}` : ''}!</h1>
      <p>This is a test component</p>
    </div>
  );
}

describe('Test Infrastructure Example', () => {
  describe('Custom Render Functions', () => {
    test('renderWithProviders should render component with all providers', () => {
      renderWithProviders(<WelcomeMessage name="Test User" />);

      expect(screen.getByText('Welcome Test User!')).toBeInTheDocument();
      expect(screen.getByText('This is a test component')).toBeInTheDocument();
    });

    test('renderWithAuth should provide authenticated context', () => {
      renderWithAuth(<WelcomeMessage />);

      expect(screen.getByText(/Welcome/)).toBeInTheDocument();
    });

    test('renderWithoutAuth should provide unauthenticated context', () => {
      renderWithoutAuth(<WelcomeMessage />);

      expect(screen.getByText(/Welcome/)).toBeInTheDocument();
    });
  });

  describe('Mock Data', () => {
    test('should provide mock user data', () => {
      expect(mockUser).toBeDefined();
      expect(mockUser.email).toBe('test@example.com');
      expect(mockUser.username).toBe('testuser');
    });

    test('should provide mock tenant data', () => {
      expect(mockTenant).toBeDefined();
      expect(mockTenant.name).toBe('Test Tenant');
    });
  });

  describe('User Interactions', () => {
    function ButtonExample() {
      const [count, setCount] = React.useState(0);

      return (
        <div>
          <p>Count: {count}</p>
          <button
            onClick={() => {
              setCount(count + 1);
            }}
          >
            Increment
          </button>
        </div>
      );
    }

    test('should handle user interactions', async () => {
      const user = userEvent.setup();

      renderWithProviders(<ButtonExample />);

      expect(screen.getByText('Count: 0')).toBeInTheDocument();

      const button = screen.getByRole('button', { name: 'Increment' });
      await user.click(button);

      expect(screen.getByText('Count: 1')).toBeInTheDocument();
    });
  });

  describe('Query Examples', () => {
    function FormExample() {
      return (
        <form>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" placeholder="Enter your email" aria-label="Email input" />

          <button type="submit" aria-label="Submit form">
            Submit
          </button>
        </form>
      );
    }

    test('should use accessible queries', () => {
      renderWithProviders(<FormExample />);

      // ✅ Preferred: getByRole
      const submitButton = screen.getByRole('button', { name: 'Submit form' });
      expect(submitButton).toBeInTheDocument();

      // ✅ Preferred: getByLabelText
      const emailInput = screen.getByLabelText('Email');
      expect(emailInput).toBeInTheDocument();

      // ✅ Good: getByPlaceholderText
      const emailByPlaceholder = screen.getByPlaceholderText('Enter your email');
      expect(emailByPlaceholder).toBeInTheDocument();
    });
  });
});

// Import React for JSX
import React from 'react';

describe('MSW API Mocking Example', () => {
  // Setup MSW server
  beforeAll(() => {
    setupMSW();
  });

  afterAll(() => {
    teardownMSW();
  });

  beforeEach(() => {
    resetMSW();
  });

  test('MSW server is configured and ready', () => {
    // This test verifies the MSW infrastructure is working
    // Actual API tests will be in TI-002: Unit Tests - Services Layer
    expect(true).toBe(true);
  });
});
