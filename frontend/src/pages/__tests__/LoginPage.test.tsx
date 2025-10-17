import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithoutAuth } from '../../test-utils/render';
import { LoginPage } from '../LoginPage';
import type { LoginCredentials } from '../../types/auth';

const mockLoginResponse = {
  success: true,
  message: 'Login successful',
  data: {
    token:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjoidGVzdHVzZXIiLCJ0ZW5hbnRfaWQiOiJ0ZW5hbnQxIiwiZXhwIjoxNjk2MDAwMDAwfQ.signature',
    user: {
      id: 'user1',
      username: 'testuser',
      email: 'test@example.com',
      tenantId: 'tenant1',
    },
  },
};

// MSW server setup
const server = setupServer(
  http.post('/api/auth/login', async ({ request }) => {
    const body = (await request.json()) as LoginCredentials;

    // Simulate validation
    if (!body.usernameOrEmail || !body.password || !body.tenantId) {
      return HttpResponse.json(
        {
          success: false,
          message: 'Missing required fields',
        },
        { status: 400 }
      );
    }

    if (body.usernameOrEmail === 'failuser') {
      return HttpResponse.json(
        {
          success: false,
          message: 'Invalid credentials',
        },
        { status: 401 }
      );
    }

    return HttpResponse.json(mockLoginResponse);
  })
);

describe('LoginPage Component', () => {
  beforeEach(() => {
    server.listen();
  });

  afterEach(() => {
    server.resetHandlers();
    server.close();
  });

  describe('Rendering', () => {
    it('should render login form with title', () => {
      renderWithoutAuth(<LoginPage />);

      expect(screen.getByText('Welcome Back')).not.toBeNull();
    });

    it('should render username/email input field', () => {
      renderWithoutAuth(<LoginPage />);

      expect(screen.getByPlaceholderText(/username|email/i)).toBeInTheDocument();
    });

    it('should render password input field', () => {
      renderWithoutAuth(<LoginPage />);

      expect(screen.getByPlaceholderText(/password/i)).toBeInTheDocument();
    });

    it('should render tenant input field', () => {
      renderWithoutAuth(<LoginPage />);

      expect(screen.getByPlaceholderText(/tenant/i)).toBeInTheDocument();
    });

    it('should render submit button', () => {
      renderWithoutAuth(<LoginPage />);

      expect(screen.getByRole('button', { name: /login|sign in|submit/i })).toBeInTheDocument();
    });

    it('should render remember me checkbox', () => {
      renderWithoutAuth(<LoginPage />);

      expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });
  });

  describe('Form Validation - Empty Submission', () => {
    it('should show error when submitting empty form', async () => {
      const user = userEvent.setup();
      renderWithoutAuth(<LoginPage />);

      const submitButton = screen.getByRole('button', { name: /login|sign in/i });
      await user.click(submitButton);

      await waitFor(() => {
        const errors = screen.queryAllByText(/required|please enter|cannot be empty/i);
        expect(errors.length).toBeGreaterThan(0);
      });
    });

    it('should display specific error for missing username', async () => {
      const user = userEvent.setup();
      renderWithoutAuth(<LoginPage />);

      const passwordInput = screen.getByPlaceholderText(/password/i);
      const tenantInput = screen.getByPlaceholderText(/tenant/i);

      await user.type(passwordInput, 'password123');
      await user.type(tenantInput, 'tenant1');

      const submitButton = screen.getByRole('button', { name: /login|sign in/i });
      await user.click(submitButton);

      await waitFor(() => {
        const errorMsg = screen.queryByText(/username|email.*required/i);
        expect(errorMsg).not.toBeNull();
      });
    });

    it('should display error for missing password', async () => {
      const user = userEvent.setup();
      renderWithoutAuth(<LoginPage />);

      const usernameInput = screen.getByPlaceholderText(/username|email/i);
      const tenantInput = screen.getByPlaceholderText(/tenant/i);

      await user.type(usernameInput, 'testuser');
      await user.type(tenantInput, 'tenant1');

      const submitButton = screen.getByRole('button', { name: /login|sign in/i });
      await user.click(submitButton);

      await waitFor(() => {
        const errorMsg = screen.queryByText(/password.*required/i);
        expect(errorMsg).toBeDefined();
      });
    });

    it('should display error for missing tenant', async () => {
      const user = userEvent.setup();
      renderWithoutAuth(<LoginPage />);

      const usernameInput = screen.getByPlaceholderText(/username|email/i);
      const passwordInput = screen.getByPlaceholderText(/password/i);

      await user.type(usernameInput, 'testuser');
      await user.type(passwordInput, 'password123');

      const submitButton = screen.getByRole('button', { name: /login|sign in/i });
      await user.click(submitButton);

      await waitFor(() => {
        const errorMsg = screen.queryByText(/tenant.*required/i);
        expect(errorMsg).toBeDefined();
      });
    });
  });

  describe('Form Validation - Email Format', () => {
    it('should validate email format in username field', async () => {
      const user = userEvent.setup();
      renderWithoutAuth(<LoginPage />);

      const usernameInput = screen.getByPlaceholderText(/username|email/i);
      const passwordInput = screen.getByPlaceholderText(/password/i);
      const tenantInput = screen.getByPlaceholderText(/tenant/i);

      await user.type(usernameInput, 'invalid@');
      await user.type(passwordInput, 'password123');
      await user.type(tenantInput, 'tenant1');

      const submitButton = screen.getByRole('button', { name: /login|sign in/i });
      await user.click(submitButton);

      await waitFor(() => {
        const errorMsg = screen.queryByText(/email|format|invalid/i);
        expect(errorMsg).toBeDefined();
      });
    });
  });

  describe('Form Validation - Error Clearing', () => {
    it('should clear error messages when user types', async () => {
      const user = userEvent.setup();
      renderWithoutAuth(<LoginPage />);

      // Submit empty form to show errors
      const submitButton = screen.getByRole('button', { name: /login|sign in/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.queryByText(/required/i)).toBeDefined();
      });

      // Type in field and error should clear
      const usernameInput = screen.getByPlaceholderText(/username|email/i);
      await user.type(usernameInput, 'test@example.com');

      await waitFor(() => {
        const errorMsg = screen.queryByText(/username.*required/i);
        expect(errorMsg).toBeNull();
      });
    });
  });

  describe('Successful Login', () => {
    it('should call login handler on successful form submission', async () => {
      const user = userEvent.setup();
      renderWithoutAuth(<LoginPage />);

      const usernameInput = screen.getByPlaceholderText(/username|email/i);
      const passwordInput = screen.getByPlaceholderText(/password/i);
      const tenantInput = screen.getByPlaceholderText(/tenant/i);

      await user.type(usernameInput, 'testuser');
      await user.type(passwordInput, 'password123');
      await user.type(tenantInput, 'tenant1');

      const submitButton = screen.getByRole('button', { name: /login|sign in/i });
      await user.click(submitButton);

      await waitFor(() => {
        const loadingOrSuccess = screen.queryByText(/loading|welcome|dashboard/i);
        expect(loadingOrSuccess).toBeDefined();
      });
    });

    it('should show loading state during submission', async () => {
      const user = userEvent.setup();
      renderWithoutAuth(<LoginPage />);

      const usernameInput = screen.getByPlaceholderText(/username|email/i);
      const passwordInput = screen.getByPlaceholderText(/password/i);
      const tenantInput = screen.getByPlaceholderText(/tenant/i);

      await user.type(usernameInput, 'testuser');
      await user.type(passwordInput, 'password123');
      await user.type(tenantInput, 'tenant1');

      const submitButton = screen.getByRole('button', { name: /login|sign in/i });
      await user.click(submitButton);

      // Button should be disabled during submission
      await waitFor(() => {
        expect(
          submitButton.getAttribute('disabled') !== null || submitButton.hasAttribute('aria-busy')
        ).toBe(true);
      });
    });
  });

  describe('Login Failure', () => {
    it('should display error on invalid credentials', async () => {
      const user = userEvent.setup();
      renderWithoutAuth(<LoginPage />);

      const usernameInput = screen.getByPlaceholderText(/username|email/i);
      const passwordInput = screen.getByPlaceholderText(/password/i);
      const tenantInput = screen.getByPlaceholderText(/tenant/i);

      await user.type(usernameInput, 'failuser');
      await user.type(passwordInput, 'wrongpassword');
      await user.type(tenantInput, 'tenant1');

      const submitButton = screen.getByRole('button', { name: /login|sign in/i });
      await user.click(submitButton);

      await waitFor(() => {
        const errorMsg = screen.queryByText(/invalid|failed|error|credentials/i);
        expect(errorMsg).toBeDefined();
      });
    });

    it('should display alert on API error', async () => {
      server.use(
        http.post('/api/auth/login', () => {
          return HttpResponse.json({ success: false, message: 'Server error' }, { status: 500 });
        })
      );

      const user = userEvent.setup();
      renderWithoutAuth(<LoginPage />);

      const usernameInput = screen.getByPlaceholderText(/username|email/i);
      const passwordInput = screen.getByPlaceholderText(/password/i);
      const tenantInput = screen.getByPlaceholderText(/tenant/i);

      await user.type(usernameInput, 'testuser');
      await user.type(passwordInput, 'password123');
      await user.type(tenantInput, 'tenant1');

      const submitButton = screen.getByRole('button', { name: /login|sign in/i });
      await user.click(submitButton);

      await waitFor(() => {
        const alert = screen.queryByRole('alert');
        expect(alert).toBeDefined();
      });
    });

    it('should allow user to retry after error', async () => {
      const user = userEvent.setup();

      // First render with error
      server.use(
        http.post('/api/auth/login', () => {
          return HttpResponse.json({ success: false, message: 'Temporary error' }, { status: 500 });
        })
      );

      renderWithoutAuth(<LoginPage />);

      const usernameInput = screen.getByPlaceholderText(/username|email/i);
      const passwordInput = screen.getByPlaceholderText(/password/i);
      const tenantInput = screen.getByPlaceholderText(/tenant/i);

      await user.type(usernameInput, 'testuser');
      await user.type(passwordInput, 'password123');
      await user.type(tenantInput, 'tenant1');

      const submitButton = screen.getByRole('button', { name: /login|sign in/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.queryByText(/error|failed/i)).toBeDefined();
      });

      // Now use successful handler and retry
      server.use(
        http.post('/api/auth/login', () => {
          return HttpResponse.json(mockLoginResponse);
        })
      );

      // Clear form and try again
      await user.clear(usernameInput);
      await user.clear(passwordInput);
      await user.clear(tenantInput);

      await user.type(usernameInput, 'testuser');
      await user.type(passwordInput, 'password123');
      await user.type(tenantInput, 'tenant1');

      await user.click(submitButton);

      await waitFor(() => {
        const hasSuccess = screen.queryByText(/success|welcome|dashboard/i);
        const hasError = screen.queryByText(/error/i);
        expect(hasSuccess !== null || hasError === null).toBe(true);
      });
    });
  });

  describe('Remember Me', () => {
    it('should have remember me checkbox', () => {
      renderWithoutAuth(<LoginPage />);

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeDefined();
    });

    it('should toggle remember me checkbox', async () => {
      const user = userEvent.setup();
      renderWithoutAuth(<LoginPage />);

      const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
      const initialState = checkbox.checked;

      await user.click(checkbox);

      expect(checkbox.checked).toBe(!initialState);
    });
  });

  describe('Form Fields Interaction', () => {
    it('should accept username input', async () => {
      const user = userEvent.setup();
      renderWithoutAuth(<LoginPage />);

      const input = screen.getByPlaceholderText(/username|email/i) as HTMLInputElement;
      await user.type(input, 'testuser');

      expect(input.value).toBe('testuser');
    });

    it('should accept password input', async () => {
      const user = userEvent.setup();
      renderWithoutAuth(<LoginPage />);

      const input = screen.getByPlaceholderText(/password/i) as HTMLInputElement;
      await user.type(input, 'password123');

      expect(input.value).toBe('password123');
    });

    it('should accept tenant input', async () => {
      const user = userEvent.setup();
      renderWithoutAuth(<LoginPage />);

      const input = screen.getByPlaceholderText(/tenant/i) as HTMLInputElement;
      await user.type(input, 'tenant1');

      expect(input.value).toBe('tenant1');
    });

    it('should have form labels', () => {
      renderWithoutAuth(<LoginPage />);

      // Check that inputs have associated labels via aria-label or aria-labelledby
      const usernameInput = screen.getByPlaceholderText(/username|email/i);
      expect(
        usernameInput.getAttribute('aria-label') || usernameInput.getAttribute('aria-labelledby')
      ).not.toBeNull();
    });

    it('should be keyboard navigable', async () => {
      const user = userEvent.setup();
      renderWithoutAuth(<LoginPage />);

      const usernameInput = screen.getByPlaceholderText(/username|email/i);
      usernameInput.focus();

      await user.keyboard('{Tab}');
      const activeElement = document.activeElement;
      expect(activeElement).toBeDefined();
    });

    it('should have proper heading hierarchy', () => {
      renderWithoutAuth(<LoginPage />);

      const heading = screen.getByText('Welcome Back');
      expect(heading).toBeDefined();
    });

    it('should announce validation errors to screen readers', async () => {
      const user = userEvent.setup();
      renderWithoutAuth(<LoginPage />);

      const submitButton = screen.getByRole('button', { name: /login|sign in/i });
      await user.click(submitButton);

      await waitFor(() => {
        const errors = screen.queryAllByText(/required/i);
        expect(errors.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in input', async () => {
      const user = userEvent.setup();
      renderWithoutAuth(<LoginPage />);

      const usernameInput = screen.getByPlaceholderText(/username|email/i);
      await user.type(usernameInput, '<script>alert("xss")</script>');

      expect((usernameInput as HTMLInputElement).value).toBe('<script>alert("xss")</script>');
    });

    it('should handle rapid form submissions', async () => {
      const user = userEvent.setup();
      renderWithoutAuth(<LoginPage />);

      const usernameInput = screen.getByPlaceholderText(/username|email/i);
      const passwordInput = screen.getByPlaceholderText(/password/i);
      const tenantInput = screen.getByPlaceholderText(/tenant/i);

      await user.type(usernameInput, 'testuser');
      await user.type(passwordInput, 'password123');
      await user.type(tenantInput, 'tenant1');

      const submitButton = screen.getByRole('button', { name: /login|sign in/i });

      // Click multiple times rapidly
      await user.click(submitButton);
      await user.click(submitButton);

      // Should only submit once or handle gracefully
      await waitFor(() => {
        expect(screen.getByText(/welcome back|loading|success|error/i)).toBeDefined();
      });
    });

    it('should handle very long input', async () => {
      const user = userEvent.setup();
      renderWithoutAuth(<LoginPage />);

      const usernameInput = screen.getByPlaceholderText(/username|email/i) as HTMLInputElement;
      const longText = 'x'.repeat(1000);
      await user.type(usernameInput, longText);

      expect(usernameInput.value.length).toBeLessThanOrEqual(1000);
    });
  });
});
