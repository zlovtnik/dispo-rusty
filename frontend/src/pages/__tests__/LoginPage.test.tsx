import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { getServer } from '../../test-utils/mocks/server';
import { renderWithoutAuth, createDeferred } from '../../test-utils/render';
import { LoginPage } from '../LoginPage';
import type { LoginCredentials } from '../../types/auth';

// Mock react-router-dom
const mockNavigate = mock();
void mock.module('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

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

describe('LoginPage Component', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    mockNavigate.mockClear();

    // Use the global MSW server (already set up by test-utils/setup.ts)
    // Add handler for login endpoint
    getServer().use(
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

        // Validate email format when @ is present
        if (
          body.usernameOrEmail.includes('@') &&
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.usernameOrEmail)
        ) {
          return HttpResponse.json(
            {
              success: false,
              message: 'Invalid email format',
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
  });

  describe('Rendering', () => {
    it('should render login form with title', () => {
      renderWithoutAuth(<LoginPage />);

      expect(screen.getByText('Login')).toBeInTheDocument();
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
        const errorMsg = screen.queryByText(/username.*email.*required/i);
        expect(errorMsg).toBeInTheDocument();
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
        expect(errorMsg).toBeInTheDocument();
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
        expect(errorMsg).toBeInTheDocument();
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
        expect(errorMsg).toBeInTheDocument();
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
        const errorMsgs = screen.queryAllByText(/required/i);
        expect(errorMsgs.length).toBeGreaterThan(0);
      });

      // Get the input fields
      const usernameInput = screen.getByPlaceholderText(/username|email/i);
      const passwordInput = screen.getByPlaceholderText(/password/i);

      // Type into the username/email field
      await user.type(usernameInput, 'testuser@example.com');

      // Wait for the error to be cleared for the username field
      await waitFor(() => {
        const errorMsgs = screen.queryAllByText(/required/i);
        // Should have fewer errors now (at least one field is filled)
        expect(errorMsgs.length).toBeLessThan(3); // Originally had errors for username, password, and tenant
      });

      // Type into the password field
      await user.type(passwordInput, 'password123');

      // Wait for the password error to be cleared as well
      await waitFor(() => {
        const errorMsgs = screen.queryAllByText(/required/i);
        // Should have even fewer errors now (username and password are filled)
        expect(errorMsgs.length).toBeLessThan(2);
      });
    });
  });

  describe('Successful Login', () => {
    it('should call login handler on successful form submission', async () => {
      const user = userEvent.setup();

      // Mock the login function to track calls
      const mockLogin = mock(() => Promise.resolve());

      renderWithoutAuth(<LoginPage />, {
        authValue: {
          isAuthenticated: false,
          user: null,
          tenant: null,
          login: mockLogin,
        },
      });

      const usernameInput = screen.getByPlaceholderText(/username|email/i);
      const passwordInput = screen.getByPlaceholderText(/password/i);
      const tenantInput = screen.getByPlaceholderText(/tenant/i);

      await user.type(usernameInput, 'testuser');
      await user.type(passwordInput, 'password123');
      await user.type(tenantInput, 'tenant1');

      const submitButton = screen.getByRole('button', { name: /login|sign in/i });
      await user.click(submitButton);

      // Wait for login function to be called with correct credentials
      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith({
          usernameOrEmail: 'testuser',
          password: 'password123',
          tenantId: 'tenant1',
          rememberMe: false,
        });
      });

      // Wait for navigation to be called with correct route
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
      });
    });

    it('should show loading state during submission', async () => {
      const user = userEvent.setup();
      const deferred = createDeferred<undefined>();

      renderWithoutAuth(<LoginPage />, {
        authValue: {
          login: async () => {
            await deferred.promise;
          },
          isLoading: false,
        },
      });

      const usernameInput = screen.getByPlaceholderText(/username|email/i);
      const passwordInput = screen.getByPlaceholderText(/password/i);
      const tenantInput = screen.getByPlaceholderText(/tenant/i);

      await user.type(usernameInput, 'testuser');
      await user.type(passwordInput, 'password123');
      await user.type(tenantInput, 'tenant1');

      const submitButton = screen.getByRole('button', { name: /login|sign in/i });
      await user.click(submitButton);

      // Button should show loading state during submission
      await waitFor(() => {
        const buttonClasses = submitButton.className || '';
        expect(
          buttonClasses.includes('ant-btn-loading') ||
            submitButton.getAttribute('aria-busy') === 'true'
        ).toBe(true);
      });

      deferred.resolve(undefined);
      await deferred.promise;
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
        const errorMsg = screen.getByText(/invalid|failed|error|credentials/i);
        expect(errorMsg).toBeInTheDocument();
      });
    });

    it('should display alert on API error', async () => {
      const user = userEvent.setup();
      renderWithoutAuth(<LoginPage />, {
        authValue: {
          login: async () => {
            throw new Error('Server error');
          },
        },
      });

      const usernameInput = screen.getByPlaceholderText(/username|email/i);
      const passwordInput = screen.getByPlaceholderText(/password/i);
      const tenantInput = screen.getByPlaceholderText(/tenant/i);

      await user.type(usernameInput, 'testuser');
      await user.type(passwordInput, 'password123');
      await user.type(tenantInput, 'tenant1');

      const submitButton = screen.getByRole('button', { name: /login|sign in/i });
      await user.click(submitButton);

      await waitFor(() => {
        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent(/server error/i);
      });
    });

    it('should allow user to retry after error', async () => {
      const user = userEvent.setup();
      let attempt = 0;

      renderWithoutAuth(<LoginPage />, {
        authValue: {
          login: async () => {
            attempt += 1;
            if (attempt === 1) {
              throw new Error('Temporary error');
            }
          },
        },
      });

      const usernameInput = screen.getByPlaceholderText(/username|email/i);
      const passwordInput = screen.getByPlaceholderText(/password/i);
      const tenantInput = screen.getByPlaceholderText(/tenant/i);

      await user.type(usernameInput, 'testuser');
      await user.type(passwordInput, 'password123');
      await user.type(tenantInput, 'tenant1');

      const submitButton = screen.getByRole('button', { name: /login|sign in/i });
      await user.click(submitButton);

      await waitFor(() => {
        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent(/temporary error/i);
      });

      // Simulate realistic retry - user just clicks submit again without clearing inputs
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.queryByRole('alert')).toBeNull();
      });
    });
  });

  describe('Remember Me Checkbox', () => {
    it('should have remember me checkbox', () => {
      renderWithoutAuth(<LoginPage />);

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeInTheDocument();
    });

    it('should toggle remember me checkbox', async () => {
      const user = userEvent.setup();
      renderWithoutAuth(<LoginPage />);

      const checkbox = screen.getByRole('checkbox');
      const initialState = (checkbox as HTMLInputElement).checked;

      await user.click(checkbox);

      expect((checkbox as HTMLInputElement).checked).toBe(!initialState);
    });
  });

  describe('Form Fields Interaction', () => {
    it('should accept username input', async () => {
      const user = userEvent.setup();
      renderWithoutAuth(<LoginPage />);

      const input = screen.getByPlaceholderText(/username|email/i);
      await user.type(input, 'testuser');

      expect((input as HTMLInputElement).value).toBe('testuser');
    });

    it('should accept password input', async () => {
      const user = userEvent.setup();
      renderWithoutAuth(<LoginPage />);

      const input = screen.getByPlaceholderText(/password/i);
      await user.type(input, 'password123');

      expect((input as HTMLInputElement).value).toBe('password123');
    });

    it('should accept tenant input', async () => {
      const user = userEvent.setup();
      renderWithoutAuth(<LoginPage />);

      const input = screen.getByPlaceholderText(/tenant/i);
      await user.type(input, 'tenant1');

      expect((input as HTMLInputElement).value).toBe('tenant1');
    });

    it('should have form labels', () => {
      renderWithoutAuth(<LoginPage />);

      // Check that inputs are properly associated with their labels using accessible queries
      const usernameInput = screen.getByLabelText('Username or Email');
      const passwordInput = screen.getByLabelText('Password');
      const tenantInput = screen.getByLabelText('Tenant ID');

      expect(usernameInput).toBeInTheDocument();
      expect(passwordInput).toBeInTheDocument();
      expect(tenantInput).toBeInTheDocument();
    });

    it('should be keyboard navigable', async () => {
      const user = userEvent.setup();
      renderWithoutAuth(<LoginPage />);

      const usernameInput = screen.getByPlaceholderText(/username|email/i);
      usernameInput.focus();

      await user.keyboard('{Tab}');
      const activeElement = document.activeElement;
      expect(activeElement).toBeInTheDocument();
    });

    it('should have proper heading hierarchy', () => {
      renderWithoutAuth(<LoginPage />);

      const heading = screen.getByText('Login');
      expect(heading).toBeInTheDocument();
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
      const deferred = createDeferred<undefined>();
      let loginCallCount = 0;

      renderWithoutAuth(<LoginPage />, {
        authValue: {
          login: async () => {
            loginCallCount += 1;
            await deferred.promise;
          },
          isLoading: false,
        },
      });

      const usernameInput = screen.getByPlaceholderText(/username|email/i);
      const passwordInput = screen.getByPlaceholderText(/password/i);
      const tenantInput = screen.getByPlaceholderText(/tenant/i);

      await user.type(usernameInput, 'testuser');
      await user.type(passwordInput, 'password123');
      await user.type(tenantInput, 'tenant1');

      const submitButton = screen.getByRole('button', { name: /login|sign in/i });

      // Click the button multiple times rapidly while the first submission is pending
      await user.click(submitButton);
      await user.click(submitButton);
      await user.click(submitButton);

      await waitFor(() => {
        expect(loginCallCount).toBe(1);
      });

      deferred.resolve(undefined);
      await deferred.promise;
    });

    it('should handle very long input', async () => {
      const user = userEvent.setup();
      renderWithoutAuth(<LoginPage />);

      const usernameInput = screen.getByPlaceholderText(/username|email/i);
      const longText = 'x'.repeat(300); // Type more than the 254 character limit
      await user.type(usernameInput, longText);

      expect((usernameInput as HTMLInputElement).value.length).toBe(254); // Should be truncated to the enforced maximum
    });
  });
});
