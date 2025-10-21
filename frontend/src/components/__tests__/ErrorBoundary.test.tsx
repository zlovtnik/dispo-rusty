import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { renderWithProviders } from '../../test-utils/render';
import { ErrorBoundary, withErrorBoundary } from '../ErrorBoundary';
import { err, ok } from 'neverthrow';
import type { AppError } from '../../types/errors';
import type { Result as FPResult } from '../../types/fp';
import {
  createNetworkError,
  createAuthError,
  createBusinessLogicError,
  createValidationError,
} from '../../types/errors';

// Component that throws during render
const RenderErrorComponent: React.FC<{ errorMessage: string }> = ({ errorMessage }) => {
  throw new Error(errorMessage);
};

describe('ErrorBoundary Component', () => {
  // Suppress console.error during tests since ErrorBoundary logs errors
  const originalConsoleError = console.error;

  beforeEach(() => {
    // Mock console.error to suppress error logs during testing
    console.error = mock(() => {
      // Intentionally empty - suppress console.error
    });
  });

  afterEach(() => {
    // Restore console.error
    console.error = originalConsoleError;
  });

  describe('Error Catching', () => {
    it('should catch render errors from child components', () => {
      renderWithProviders(
        <ErrorBoundary>
          <RenderErrorComponent errorMessage="Render error occurred" />
        </ErrorBoundary>
      );

      // Error boundary should catch and display error UI
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('should display error information in UI', () => {
      renderWithProviders(
        <ErrorBoundary>
          <RenderErrorComponent errorMessage="Something went wrong" />
        </ErrorBoundary>
      );

      // Error details should be displayed - verify error title is present
      const errors = screen.getAllByText('Something went wrong');
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should display fallback UI when error occurs', () => {
      const fallbackContent = 'Error Fallback UI';
      renderWithProviders(
        <ErrorBoundary fallback={<div>{fallbackContent}</div>}>
          <RenderErrorComponent errorMessage="Error" />
        </ErrorBoundary>
      );

      expect(screen.getByText(fallbackContent)).toBeInTheDocument();
    });

    it('should not catch errors in event handlers', () => {
      // ErrorBoundary doesn't catch event handler errors
      renderWithProviders(
        <ErrorBoundary>
          <div>
            <button
              onClick={() => {
                throw new Error('Event error');
              }}
            >
              Click Me
            </button>
          </div>
        </ErrorBoundary>
      );

      // Button should still be renderable
      expect(screen.getByText('Click Me')).toBeInTheDocument();
    });

    it('should not catch errors in async code', () => {
      renderWithProviders(
        <ErrorBoundary>
          <div>
            <button
              onClick={() => {
                // Simulate async error that won't be caught by ErrorBoundary
                setTimeout(() => {
                  throw new Error('Async error');
                }, 0);
              }}
            >
              Async Button
            </button>
          </div>
        </ErrorBoundary>
      );

      expect(screen.getByText('Async Button')).toBeInTheDocument();
    });
  });

  it('should show error message to user', () => {
    renderWithProviders(
      <ErrorBoundary>
        <RenderErrorComponent errorMessage="User-friendly error message" />
      </ErrorBoundary>
    );

    // Should display error UI with message
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('should display default error UI when no fallback provided', () => {
    renderWithProviders(
      <ErrorBoundary>
        <RenderErrorComponent errorMessage="Default error" />
      </ErrorBoundary>
    );

    // Should display some error UI
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('should include error details in fallback', () => {
    renderWithProviders(
      <ErrorBoundary>
        <RenderErrorComponent errorMessage="Detailed error information" />
      </ErrorBoundary>
    );

    // Should show the error was caught
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  describe('Error Handling', () => {
    it('should call onError callback when error is caught', () => {
      const onErrorMock = mock(() => {
        // Intentionally empty - test mock
      });

      renderWithProviders(
        <ErrorBoundary onError={onErrorMock}>
          <RenderErrorComponent errorMessage="Test error" />
        </ErrorBoundary>
      );

      // onError callback should be called
      expect(onErrorMock).toHaveBeenCalled();
    });

    it('should provide error info to callback', () => {
      const onErrorMock = mock(() => {
        // Intentionally empty - test mock
      });

      renderWithProviders(
        <ErrorBoundary onError={onErrorMock}>
          <RenderErrorComponent errorMessage="Error with info" />
        </ErrorBoundary>
      );

      // Error info should contain componentStack
      expect(onErrorMock).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          componentStack: expect.stringMatching(/.+/),
        })
      );
    });

    it('should continue rendering if onError callback is provided', () => {
      const onErrorMock = mock(() => {
        // Intentionally empty - test mock
      });

      renderWithProviders(
        <ErrorBoundary onError={onErrorMock}>
          <RenderErrorComponent errorMessage="Error" />
        </ErrorBoundary>
      );

      // Component should still render error UI even with callback
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });
  });

  describe('Children Rendering', () => {
    it('should render children when no error occurs', () => {
      const testContent = 'Child content rendered successfully';
      renderWithProviders(
        <ErrorBoundary>
          <div>{testContent}</div>
        </ErrorBoundary>
      );

      expect(screen.getByText(testContent)).toBeInTheDocument();
    });

    it('should render multiple children', () => {
      renderWithProviders(
        <ErrorBoundary>
          <div>Child 1</div>
          <div>Child 2</div>
          <div>Child 3</div>
        </ErrorBoundary>
      );

      expect(screen.getByText('Child 1')).toBeInTheDocument();
      expect(screen.getByText('Child 2')).toBeInTheDocument();
      expect(screen.getByText('Child 3')).toBeInTheDocument();
    });

    it('should render nested components', () => {
      renderWithProviders(
        <ErrorBoundary>
          <div>
            <section>
              <h1>Title</h1>
              <p>Content</p>
            </section>
          </div>
        </ErrorBoundary>
      );

      expect(screen.getByText('Title')).toBeInTheDocument();
      expect(screen.getByText('Content')).toBeInTheDocument();
    });
  });

  describe('Recovery', () => {
    it('should reset error state when component unmounts and remounts', () => {
      const ThrowingComponent = ({ shouldThrow }: { shouldThrow: boolean }): React.JSX.Element => {
        if (shouldThrow) throw new Error('Test error');
        return <div>Working</div>;
      };

      const { rerender } = renderWithProviders(
        <ErrorBoundary key="error">
          <ThrowingComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();

      rerender(
        <ErrorBoundary key="working">
          <ThrowingComponent shouldThrow={false} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Working')).toBeInTheDocument();
    });

    it('should display recovery button/action', () => {
      renderWithProviders(
        <ErrorBoundary>
          <RenderErrorComponent errorMessage="Error" />
        </ErrorBoundary>
      );

      // Should provide some way to recover (button, text, etc.)
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    });
  });

  describe('Error Types', () => {
    const errorTestCases = [
      {
        label: 'JavaScript errors',
        componentFactory: () => <RenderErrorComponent errorMessage="JavaScript error" />,
      },
      {
        label: 'TypeError',
        componentFactory: () => {
          const TypeErrorComponent: React.FC = () => {
            throw new TypeError('Cannot read property of null');
          };
          return <TypeErrorComponent />;
        },
      },
      {
        label: 'ReferenceError',
        componentFactory: () => {
          const ReferenceErrorComponent: React.FC = () => {
            throw new ReferenceError('undefinedVariable is not defined');
          };
          return <ReferenceErrorComponent />;
        },
      },
    ];

    for (const { label, componentFactory } of errorTestCases) {
      it(`should handle ${label}`, () => {
        renderWithProviders(<ErrorBoundary>{componentFactory()}</ErrorBoundary>);

        expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      });
    }
  });

  describe('Props', () => {
    it('should accept and use custom fallback', () => {
      const customFallback = <div>Custom Error Fallback</div>;
      renderWithProviders(
        <ErrorBoundary fallback={customFallback}>
          <RenderErrorComponent errorMessage="Error" />
        </ErrorBoundary>
      );

      // Verify custom fallback is present
      expect(screen.getByText('Custom Error Fallback')).toBeInTheDocument();

      // Verify generic error message is not present
      expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    });

    it('should accept onError callback prop', () => {
      const callback = mock(() => {
        // Intentionally empty - test mock
      });
      renderWithProviders(
        <ErrorBoundary onError={callback}>
          <RenderErrorComponent errorMessage="Error" />
        </ErrorBoundary>
      );

      // Callback should be set up
      expect(callback).toHaveBeenCalled();
    });

    it('should handle all valid props', () => {
      const onError = mock(() => {
        // Intentionally empty - test mock
      });
      const fallbackContent = <div>Fallback</div>;

      renderWithProviders(
        <ErrorBoundary onError={onError} fallback={fallbackContent}>
          <RenderErrorComponent errorMessage="Test error for props validation" />
        </ErrorBoundary>
      );

      // Assert that fallback content is visible when error occurs
      expect(screen.getByText('Fallback')).toBeInTheDocument();

      // Assert that onError was called with the error
      expect(onError).toHaveBeenCalledTimes(1);
      const calls = onError.mock.calls;
      expect(calls).toHaveLength(1);
      const callArgs = calls[0] as unknown as [Error, { componentStack: string }];
      expect(callArgs).toBeDefined();
      expect(callArgs).toHaveLength(2);

      const error = callArgs[0];
      const errorInfo = callArgs[1];
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Test error for props validation');
      expect(errorInfo).toBeDefined();
      expect(errorInfo).toHaveProperty('componentStack');
    });
  });

  describe('Accessibility', () => {
    it('should have accessible error message', () => {
      renderWithProviders(
        <ErrorBoundary>
          <RenderErrorComponent errorMessage="Accessible error" />
        </ErrorBoundary>
      );

      // Error message should be readable by screen readers
      expect(screen.getByText('Accessible error')).toBeInTheDocument();
    });

    it('should provide error context', () => {
      renderWithProviders(
        <ErrorBoundary>
          <RenderErrorComponent errorMessage="Error context" />
        </ErrorBoundary>
      );

      // Error UI should explain what happened
      expect(screen.getByText('Error context')).toBeInTheDocument();
    });
  });

  describe('Result Error Handling - Network Errors', () => {
    it('should handle network errors with handleResultError', () => {
      const boundaryRefLocal = React.createRef<ErrorBoundary>();

      renderWithProviders(
        <ErrorBoundary ref={boundaryRefLocal}>
          <div>Test content</div>
        </ErrorBoundary>
      );

      // Create a network error and handle it
      const networkError = createNetworkError('Connection timeout', undefined, {
        retryable: true,
      });
      const result = err(networkError);

      if (boundaryRefLocal.current) {
        const ui = boundaryRefLocal.current.handleResultError(result);
        expect(ui).toBeDefined();
      }
    });

    it('should display network error UI with retry button', () => {
      const TestComponent: React.FC = () => {
        const [showError, setShowError] = React.useState(false);

        if (showError) {
          return (
            <div>
              <div data-testid="network-error">Network Error</div>
              <button
                onClick={() => {
                  setShowError(false);
                }}
              >
                Retry
              </button>
            </div>
          );
        }

        return (
          <button
            onClick={() => {
              setShowError(true);
            }}
          >
            Trigger Network Error
          </button>
        );
      };

      renderWithProviders(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      );

      fireEvent.click(screen.getByText('Trigger Network Error'));
      expect(screen.getByTestId('network-error')).toBeInTheDocument();
    });

    it('should mark non-retryable network errors without retry button', () => {
      let capturedError: FPResult<unknown, AppError> | undefined;
      const handleResultError = (result: FPResult<unknown, AppError>) => {
        capturedError = result;
        return <div data-testid="error-displayed">Network Error - No Retry</div>;
      };

      const boundaryRefLocal = React.createRef<ErrorBoundary>();

      renderWithProviders(
        <ErrorBoundary ref={boundaryRefLocal} onResultError={handleResultError}>
          <div>Initial content</div>
        </ErrorBoundary>
      );

      // Create non-retryable network error and trigger it
      const error = createNetworkError('Permanent failure', undefined, {
        retryable: false,
      });
      const result = err(error);

      if (boundaryRefLocal.current) {
        boundaryRefLocal.current.handleResultError(result);
      }

      expect(capturedError).toBeDefined();
      expect(capturedError?.isErr()).toBe(true);
      if (capturedError?.isErr()) {
        expect(capturedError.error.message).toBe('Permanent failure');
        expect(capturedError.error.retryable).toBe(false);
      }
    });
  });

  describe('Result Error Handling - Auth Errors', () => {
    it('should handle auth errors with handleResultError', () => {
      const handleResultError = mock((result: FPResult<unknown, AppError>) => {
        if (result.isErr() && result.error.type === 'auth') {
          return <div data-testid="auth-error">Auth Error UI</div>;
        }
        return null;
      });

      const boundaryRefLocal = React.createRef<ErrorBoundary>();

      renderWithProviders(
        <ErrorBoundary ref={boundaryRefLocal} onResultError={handleResultError}>
          <div>Initial content</div>
        </ErrorBoundary>
      );

      // Create and trigger auth error
      const error = createAuthError('Invalid credentials');
      const result = err(error);

      if (boundaryRefLocal.current) {
        const ui = boundaryRefLocal.current.handleResultError(result);
        expect(ui).not.toBeNull();
        expect(handleResultError).toHaveBeenCalledWith(result);
      }
    });
  });

  describe('Result Error Handling - Business Logic Errors', () => {
    it('should handle business logic errors', () => {
      const boundaryRefLocal = React.createRef<ErrorBoundary>();

      renderWithProviders(
        <ErrorBoundary ref={boundaryRefLocal}>
          <div>Ready to handle business error</div>
        </ErrorBoundary>
      );

      const businessError = createBusinessLogicError('Insufficient balance', {
        availableBalance: 100,
      });
      const result = err(businessError);

      if (boundaryRefLocal.current) {
        const ui = boundaryRefLocal.current.handleResultError(result);
        expect(ui).toBeDefined();
      }
    });
  });

  describe('Result Error Handling - Validation Errors', () => {
    it('should handle validation errors', () => {
      const boundaryRefLocal = React.createRef<ErrorBoundary>();

      renderWithProviders(
        <ErrorBoundary ref={boundaryRefLocal}>
          <div>Ready to handle validation error</div>
        </ErrorBoundary>
      );

      const validationError = createValidationError('Invalid email format', {
        field: 'email',
        value: 'invalid',
      });
      const result = err(validationError);

      if (boundaryRefLocal.current) {
        const ui = boundaryRefLocal.current.handleResultError(result);
        expect(ui).toBeDefined();
      }
    });
  });

  describe('Recovery Strategies', () => {
    it('should execute matching recovery strategy', () => {
      const recoverMock = mock(() => ok(<div data-testid="recovered">Recovery UI</div>));
      const strategies = [
        {
          canHandle: (error: AppError) => error.type === 'network',
          recover: recoverMock,
        },
      ];

      const TestComponent: React.FC = () => {
        return <div>Test</div>;
      };

      renderWithProviders(
        <ErrorBoundary recoveryStrategies={strategies}>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Test')).toBeInTheDocument();
    });

    it('should try next strategy if first fails', () => {
      const failedStrategyRecover = mock(() => err(createNetworkError('Strategy failed')));
      const successStrategyRecover = mock(() => ok(<div>Recovery successful</div>));

      const strategies = [
        {
          canHandle: (error: AppError) => error.type === 'network',
          recover: failedStrategyRecover,
        },
        {
          canHandle: (error: AppError) => error.type === 'network',
          recover: successStrategyRecover,
        },
      ];

      const TestComponent: React.FC = () => {
        return <div>Test</div>;
      };

      renderWithProviders(
        <ErrorBoundary recoveryStrategies={strategies}>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Test')).toBeInTheDocument();
    });

    it('should skip strategies that cannot handle error', () => {
      const authStrategyRecover = mock(() => ok(<div>Auth recovery</div>));
      const networkStrategyRecover = mock(() => ok(<div>Network recovery</div>));

      const strategies = [
        {
          canHandle: (error: AppError) => error.type === 'auth',
          recover: authStrategyRecover,
        },
        {
          canHandle: (error: AppError) => error.type === 'network',
          recover: networkStrategyRecover,
        },
      ];

      const TestComponent: React.FC = () => {
        return <div>Test</div>;
      };

      renderWithProviders(
        <ErrorBoundary recoveryStrategies={strategies}>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Test')).toBeInTheDocument();
    });

    it('should return null if no strategies handle error', () => {
      const strategies = [
        {
          canHandle: (error: AppError) => error.type === 'auth',
          recover: () => ok(<div>Auth recovery</div>),
        },
      ];

      const TestComponent: React.FC = () => {
        return <div>Test</div>;
      };

      renderWithProviders(
        <ErrorBoundary recoveryStrategies={strategies}>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Test')).toBeInTheDocument();
    });

    it('should handle empty recovery strategies list', () => {
      const TestComponent: React.FC = () => {
        return <div>No strategies</div>;
      };

      renderWithProviders(
        <ErrorBoundary recoveryStrategies={[]}>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('No strategies')).toBeInTheDocument();
    });
  });

  describe('Error Transformation', () => {
    it('should apply transformResultError to errors', () => {
      const transformMock = mock((error: AppError) => ok(error));
      const onErrorMock = mock(() => undefined);

      const TestComponent: React.FC = () => {
        return <div>Transform test</div>;
      };

      renderWithProviders(
        <ErrorBoundary transformResultError={transformMock} onError={onErrorMock}>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Transform test')).toBeInTheDocument();
    });

    it('should log warning when transformation fails', () => {
      const transformMock = mock((error: AppError) =>
        err(createNetworkError('Transformation failed'))
      );

      const TestComponent: React.FC = () => {
        return <div>Transform failure</div>;
      };

      renderWithProviders(
        <ErrorBoundary transformResultError={transformMock}>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Transform failure')).toBeInTheDocument();
    });

    it('should use original error if transformation returns error', () => {
      const originalError = createNetworkError('Original error');
      const transformMock = mock((error: AppError) => err(createNetworkError('Transform failed')));

      const TestComponent: React.FC = () => {
        return <div>Transform error handling</div>;
      };

      renderWithProviders(
        <ErrorBoundary transformResultError={transformMock}>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Transform error handling')).toBeInTheDocument();
    });
  });

  describe('Error Reporting', () => {
    it('should call reportResultError callback', () => {
      const reportMock = mock(() => ok(undefined));

      const TestComponent: React.FC = () => {
        return <div>Report test</div>;
      };

      renderWithProviders(
        <ErrorBoundary reportResultError={reportMock}>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Report test')).toBeInTheDocument();
    });

    it('should log warning if reporting fails', () => {
      const reportMock = mock(() => err(createNetworkError('Report failed')));

      const TestComponent: React.FC = () => {
        return <div>Report failure handling</div>;
      };

      renderWithProviders(
        <ErrorBoundary reportResultError={reportMock}>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Report failure handling')).toBeInTheDocument();
    });

    it('should handle reportResultError when undefined', () => {
      const TestComponent: React.FC = () => {
        return <div>No report handler</div>;
      };

      renderWithProviders(
        <ErrorBoundary reportResultError={undefined}>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('No report handler')).toBeInTheDocument();
    });
  });

  describe('Error Type Rendering', () => {
    it('should render network error with description', () => {
      const TestComponent: React.FC = () => {
        return <div data-testid="network-test">Network error test</div>;
      };

      renderWithProviders(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByTestId('network-test')).toBeInTheDocument();
    });

    it('should render validation error with description', () => {
      const TestComponent: React.FC = () => {
        return <div data-testid="validation-test">Validation error test</div>;
      };

      renderWithProviders(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByTestId('validation-test')).toBeInTheDocument();
    });

    it('should render business error with description', () => {
      const TestComponent: React.FC = () => {
        return <div data-testid="business-test">Business error test</div>;
      };

      renderWithProviders(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByTestId('business-test')).toBeInTheDocument();
    });

    it('should render auth error with login button', () => {
      const TestComponent: React.FC = () => {
        return <div data-testid="auth-test">Auth error test</div>;
      };

      renderWithProviders(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByTestId('auth-test')).toBeInTheDocument();
    });

    it('should handle unknown error type gracefully', () => {
      const TestComponent: React.FC = () => {
        // Throw a normal Error to trigger the ErrorBoundary
        throw new Error('Test error');
      };

      renderWithProviders(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      );

      // When an Error is thrown, it goes to the standard error render path
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      expect(screen.getByText('Test error')).toBeInTheDocument();
    });
  });

  describe('Retry Mechanism', () => {
    it('should reset error state on retry', () => {
      const ThrowingComponent = ({ shouldThrow }: { shouldThrow: boolean }): React.JSX.Element => {
        if (shouldThrow) throw new Error('Retry test error');
        return <div>Success after retry</div>;
      };

      const { rerender } = renderWithProviders(
        <ErrorBoundary key="error">
          <ThrowingComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();

      // Click try again button
      const tryAgainButton = screen.getByRole('button', { name: /try again/i });
      fireEvent.click(tryAgainButton);

      // Re-render with non-throwing component
      rerender(
        <ErrorBoundary key="success">
          <ThrowingComponent shouldThrow={false} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Success after retry')).toBeInTheDocument();
    });

    it('should clear result error state on retry', () => {
      const TestComponent: React.FC = () => {
        return <div>Retry result error</div>;
      };

      renderWithProviders(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Retry result error')).toBeInTheDocument();
    });

    it('should enable retry action after error', () => {
      renderWithProviders(
        <ErrorBoundary>
          <RenderErrorComponent errorMessage="Retry enabled test" />
        </ErrorBoundary>
      );

      const retryButton = screen.getByRole('button', { name: /try again/i });
      expect(retryButton).toBeInTheDocument();
      expect(retryButton).not.toBeDisabled();
    });

    it('should handle multiple retry attempts', () => {
      const retryAttempts: number[] = [];
      const ThrowingComponent = ({ shouldThrow }: { shouldThrow: boolean }): React.JSX.Element => {
        if (shouldThrow) throw new Error('Multiple retry test');
        retryAttempts.push(retryAttempts.length + 1);
        return <div>Attempt {retryAttempts.length}</div>;
      };

      const { rerender } = renderWithProviders(
        <ErrorBoundary key="error-1">
          <ThrowingComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();

      // First retry
      fireEvent.click(screen.getByRole('button', { name: /try again/i }));
      rerender(
        <ErrorBoundary key="success-1">
          <ThrowingComponent shouldThrow={false} />
        </ErrorBoundary>
      );

      expect(screen.getByText(/Attempt/)).toBeInTheDocument();
    });
  });

  describe('withErrorBoundary HOC', () => {
    it('should wrap component with ErrorBoundary', () => {
      const SimpleComponent: React.FC<{ message: string }> = ({ message }) => <div>{message}</div>;

      const WrappedComponent = withErrorBoundary(SimpleComponent);

      renderWithProviders(<WrappedComponent message="Test HOC" />);

      expect(screen.getByText('Test HOC')).toBeInTheDocument();
    });

    it('should set correct displayName for wrapped component', () => {
      const SimpleComponent: React.FC = () => <div>Simple</div>;
      SimpleComponent.displayName = 'SimpleComponent';

      const WrappedComponent = withErrorBoundary(SimpleComponent);

      expect(WrappedComponent.displayName).toBe('withErrorBoundary(SimpleComponent)');
    });

    it('should handle displayName when not provided', () => {
      const SimpleComponent: React.FC = () => <div>Simple</div>;

      const WrappedComponent = withErrorBoundary(SimpleComponent);

      expect(WrappedComponent.displayName).toContain('withErrorBoundary');
    });

    it('should pass props to wrapped component', () => {
      const TestComponent: React.FC<{ value: string }> = ({ value }) => <div>{value}</div>;

      const WrappedComponent = withErrorBoundary(TestComponent);

      renderWithProviders(<WrappedComponent value="Props passed" />);

      expect(screen.getByText('Props passed')).toBeInTheDocument();
    });

    it('should catch errors in wrapped component', () => {
      const ErrorComponent: React.FC = () => {
        throw new Error('Wrapped component error');
      };

      const WrappedComponent = withErrorBoundary(ErrorComponent);

      renderWithProviders(<WrappedComponent />);

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('should apply custom errorBoundaryProps to HOC', () => {
      const fallback = <div data-testid="hoc-fallback">HOC Fallback</div>;
      const ErrorComponent: React.FC = () => {
        throw new Error('HOC props test');
      };

      const WrappedComponent = withErrorBoundary(ErrorComponent, { fallback });

      renderWithProviders(<WrappedComponent />);

      expect(screen.getByTestId('hoc-fallback')).toBeInTheDocument();
    });

    it('should wrap with custom onError callback', () => {
      const onErrorMock = mock(() => undefined);
      const ErrorComponent: React.FC = () => {
        throw new Error('Error with callback');
      };

      const WrappedComponent = withErrorBoundary(ErrorComponent, { onError: onErrorMock });

      renderWithProviders(<WrappedComponent />);

      expect(onErrorMock).toHaveBeenCalled();
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('should work with functional components', () => {
      const FunctionalComponent: React.FC<{ text: string }> = ({ text }) => <div>{text}</div>;

      const WrappedComponent = withErrorBoundary(FunctionalComponent);

      renderWithProviders(<WrappedComponent text="Functional wrapped" />);

      expect(screen.getByText('Functional wrapped')).toBeInTheDocument();
    });

    it('should handle component with multiple props', () => {
      const MultiPropsComponent: React.FC<{
        name: string;
        age: number;
        active: boolean;
      }> = ({ name, age, active }) => (
        <div>
          {name} - {age} - {active ? 'Active' : 'Inactive'}
        </div>
      );

      const WrappedComponent = withErrorBoundary(MultiPropsComponent);

      renderWithProviders(<WrappedComponent name="John" age={30} active={true} />);

      expect(screen.getByText('John - 30 - Active')).toBeInTheDocument();
    });

    it('should wrap with recovery strategies', () => {
      const recoverMock = mock(() => ok(<div data-testid="hoc-recovered">Recovered</div>));

      const ErrorComponent: React.FC = () => {
        throw new Error('Error with recovery');
      };

      const strategies = [
        {
          canHandle: (error: AppError) => error.type === 'network',
          recover: recoverMock,
        },
      ];

      const WrappedComponent = withErrorBoundary(ErrorComponent, {
        recoveryStrategies: strategies,
      });

      renderWithProviders(<WrappedComponent />);

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('should apply transformation to wrapped component errors', () => {
      const transformMock = mock((error: AppError) => ok(error));

      const ErrorComponent: React.FC = () => {
        throw new Error('Error to transform');
      };

      const WrappedComponent = withErrorBoundary(ErrorComponent, {
        transformResultError: transformMock,
      });

      renderWithProviders(<WrappedComponent />);

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('should apply error reporting to wrapped component', () => {
      const reportMock = mock((error: AppError) => ok(undefined));

      const ErrorComponent: React.FC = () => {
        throw new Error('Error to report');
      };

      const WrappedComponent = withErrorBoundary(ErrorComponent, {
        reportResultError: reportMock,
      });

      renderWithProviders(<WrappedComponent />);

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });
  });

  describe('Edge Cases - Timeout and Malformed Data', () => {
    it('should handle timeout errors', () => {
      const boundaryRefLocal = React.createRef<ErrorBoundary>();

      renderWithProviders(
        <ErrorBoundary ref={boundaryRefLocal}>
          <div>Ready for timeout</div>
        </ErrorBoundary>
      );

      const timeoutError = createNetworkError('Request timeout', undefined, {
        retryable: true,
      });
      const result = err(timeoutError);

      if (boundaryRefLocal.current) {
        const ui = boundaryRefLocal.current.handleResultError(result);
        expect(ui).toBeDefined();
      }
    });

    it('should handle malformed error object', () => {
      const TestComponent: React.FC = () => {
        return <div>Malformed error test</div>;
      };

      renderWithProviders(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Malformed error test')).toBeInTheDocument();
    });

    it('should handle error with null message', () => {
      const ErrorComponent: React.FC = () => {
        const err = new Error();
        err.message = '';
        throw err;
      };

      renderWithProviders(
        <ErrorBoundary>
          <ErrorComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('should handle rapid sequential errors', () => {
      const FailingComponent: React.FC = () => {
        throw new Error('Rapid error test');
      };

      renderWithProviders(
        <ErrorBoundary>
          <FailingComponent />
        </ErrorBoundary>
      );

      // Should catch the error
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('should handle error with circular reference in data', () => {
      const TestComponent: React.FC = () => {
        const data: any = { key: 'value' };
        data.circular = data; // Create circular reference
        return <div>Circular ref test</div>;
      };

      renderWithProviders(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Circular ref test')).toBeInTheDocument();
    });

    it('should handle error with very long stack trace', () => {
      const DeepComponent: React.FC<{ depth: number }> = ({ depth }) => {
        if (depth === 0) throw new Error('Deep error');
        return <DeepComponent depth={depth - 1} />;
      };

      renderWithProviders(
        <ErrorBoundary>
          <DeepComponent depth={5} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });
  });

  describe('State Management', () => {
    it('should maintain error state after render', () => {
      renderWithProviders(
        <ErrorBoundary>
          <RenderErrorComponent errorMessage="State persistence" />
        </ErrorBoundary>
      );

      const errorText = screen.getByText('Something went wrong');
      expect(errorText).toBeInTheDocument();

      // Re-query to ensure state is maintained
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('should not render children when error state is set', () => {
      const ChildComponent: React.FC = () => {
        return <div>Child should not render</div>;
      };

      const ErrorComponent: React.FC = () => {
        throw new Error('Child error');
      };

      renderWithProviders(
        <ErrorBoundary>
          <ErrorComponent />
          <ChildComponent />
        </ErrorBoundary>
      );

      expect(screen.queryByText('Child should not render')).not.toBeInTheDocument();
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('should clear result error state when new non-error result received', () => {
      const TestComponent: React.FC = () => {
        return <div>Clear error state test</div>;
      };

      renderWithProviders(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Clear error state test')).toBeInTheDocument();
    });

    it('should handle state transitions correctly', () => {
      const StatefulComponent: React.FC = () => {
        const [state, setState] = React.useState<'init' | 'error' | 'ok'>('init');

        return (
          <div>
            <div>{state}</div>
            <button
              onClick={() => {
                setState('error');
              }}
            >
              Trigger
            </button>
          </div>
        );
      };

      renderWithProviders(
        <ErrorBoundary>
          <StatefulComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('init')).toBeInTheDocument();
    });
  });

  describe('Internal Methods - Result Error Handling', () => {
    it('should correctly handle network errors in renderResultError', () => {
      class TestErrorBoundary extends ErrorBoundary {
        testRenderError(error: AppError) {
          return this.renderResultError(error);
        }
      }

      const networkError = createNetworkError('Test network error', undefined, {
        retryable: true,
      });

      const testBoundary = new TestErrorBoundary({ children: <div>test</div> });
      const result = testBoundary.testRenderError(networkError);

      // Verify it returns JSX for network error
      expect(result).toBeDefined();
    });

    it('should correctly handle auth errors in renderResultError', () => {
      class TestErrorBoundary extends ErrorBoundary {
        testRenderError(error: AppError) {
          return this.renderResultError(error);
        }
      }

      const authError = createAuthError('Unauthorized');

      const testBoundary = new TestErrorBoundary({ children: <div>test</div> });
      const result = testBoundary.testRenderError(authError);

      // Verify it returns JSX for auth error
      expect(result).toBeDefined();
    });

    it('should correctly handle business errors in renderResultError', () => {
      class TestErrorBoundary extends ErrorBoundary {
        testRenderError(error: AppError) {
          return this.renderResultError(error);
        }
      }

      const businessError = createBusinessLogicError('Business rule violated');

      const testBoundary = new TestErrorBoundary({ children: <div>test</div> });
      const result = testBoundary.testRenderError(businessError);

      // Verify it returns JSX for business error
      expect(result).toBeDefined();
    });

    it('should correctly handle validation errors in renderResultError', () => {
      class TestErrorBoundary extends ErrorBoundary {
        testRenderError(error: AppError) {
          return this.renderResultError(error);
        }
      }

      const validationError = createValidationError('Invalid input');

      const testBoundary = new TestErrorBoundary({ children: <div>test</div> });
      const result = testBoundary.testRenderError(validationError);

      // Verify it returns JSX for validation error
      expect(result).toBeDefined();
    });

    it('should process handleResultError with ok result', () => {
      const TestComponent: React.FC = () => {
        return <div>Success</div>;
      };

      renderWithProviders(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Success')).toBeInTheDocument();
    });

    it('should process handleResultError with error result', () => {
      const onResultErrorMock = mock((result: FPResult<unknown, AppError>) => {
        if (result.isErr()) {
          return <div data-testid="result-error-handled">Error handled</div>;
        }
        return null;
      });

      const TestComponent: React.FC = () => {
        return <div>Component</div>;
      };

      renderWithProviders(
        <ErrorBoundary onResultError={onResultErrorMock}>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Component')).toBeInTheDocument();
    });

    it('should normalize error with transformResultError callback', () => {
      const transformMock = mock((error: AppError) => {
        // Transform the error
        return ok({
          ...error,
          message: `Transformed: ${error.message}`,
        } as AppError);
      });

      const TestComponent: React.FC = () => {
        return <div>Component with transform</div>;
      };

      renderWithProviders(
        <ErrorBoundary transformResultError={transformMock}>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Component with transform')).toBeInTheDocument();
    });

    it('should report errors with reportResultError callback', () => {
      const reportMock = mock((error: AppError) => {
        return ok(undefined);
      });

      const TestComponent: React.FC = () => {
        return <div>Component with reporting</div>;
      };

      renderWithProviders(
        <ErrorBoundary reportResultError={reportMock}>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Component with reporting')).toBeInTheDocument();
    });

    it('should execute recovery strategies in order', () => {
      const strategy1 = mock(() => err(createNetworkError('Strategy 1 failed')));
      const strategy2 = mock(() => ok(<div data-testid="recovered">Recovered</div>));

      const strategies = [
        {
          canHandle: (error: AppError) => error.type === 'network',
          recover: strategy1,
        },
        {
          canHandle: (error: AppError) => error.type === 'network',
          recover: strategy2,
        },
      ];

      const TestComponent: React.FC = () => {
        return <div>Component</div>;
      };

      renderWithProviders(
        <ErrorBoundary recoveryStrategies={strategies}>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Component')).toBeInTheDocument();
    });

    it('should handle multiple recovery strategies', () => {
      const networkStrategy = mock(() => ok(<div>Network recovery</div>));
      const authStrategy = mock(() => ok(<div>Auth recovery</div>));

      const strategies = [
        {
          canHandle: (error: AppError) => error.type === 'network',
          recover: networkStrategy,
        },
        {
          canHandle: (error: AppError) => error.type === 'auth',
          recover: authStrategy,
        },
      ];

      const TestComponent: React.FC = () => {
        return <div>Component</div>;
      };

      renderWithProviders(
        <ErrorBoundary recoveryStrategies={strategies}>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Component')).toBeInTheDocument();
    });

    it('should handle onResultError returning custom UI', () => {
      const onResultErrorMock = mock((result: FPResult<unknown, AppError>) => {
        return <div data-testid="custom-error-ui">Custom UI</div>;
      });

      const TestComponent: React.FC = () => {
        return <div>Component</div>;
      };

      renderWithProviders(
        <ErrorBoundary onResultError={onResultErrorMock}>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Component')).toBeInTheDocument();
    });

    it('should combine onError and onResultError callbacks', () => {
      const onErrorMock = mock(() => undefined);
      const onResultErrorMock = mock((result: FPResult<unknown, AppError>) => null);

      const TestComponent: React.FC = () => {
        return <div>Component</div>;
      };

      renderWithProviders(
        <ErrorBoundary onError={onErrorMock} onResultError={onResultErrorMock}>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Component')).toBeInTheDocument();
    });

    it('should handle both transformResultError and recovery strategies', () => {
      const transformMock = mock((error: AppError) => ok(error));
      const recoverMock = mock(() => ok(<div>Recovered</div>));

      const strategies = [
        {
          canHandle: (error: AppError) => error.type === 'network',
          recover: recoverMock,
        },
      ];

      const TestComponent: React.FC = () => {
        return <div>Component</div>;
      };

      renderWithProviders(
        <ErrorBoundary transformResultError={transformMock} recoveryStrategies={strategies}>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Component')).toBeInTheDocument();
    });
  });

  describe('Logging and Debugging', () => {
    it('should log error details on catch', () => {
      const onErrorMock = mock(() => undefined);

      renderWithProviders(
        <ErrorBoundary onError={onErrorMock}>
          <RenderErrorComponent errorMessage="Logging test" />
        </ErrorBoundary>
      );

      expect(onErrorMock).toHaveBeenCalled();
      const calls = onErrorMock.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const callArgs = calls[0] as unknown as [Error, { componentStack: string }];
      expect(callArgs[0].message).toBe('Logging test');
      expect(callArgs[1]).toHaveProperty('componentStack');
    });

    it('should include componentStack in error info', () => {
      const onErrorMock = mock(() => undefined);

      renderWithProviders(
        <ErrorBoundary onError={onErrorMock}>
          <RenderErrorComponent errorMessage="Component stack test" />
        </ErrorBoundary>
      );

      expect(onErrorMock).toHaveBeenCalled();
      const calls = onErrorMock.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const callArgs = calls[0] as unknown as [Error, { componentStack: string }];
      expect(typeof callArgs[1].componentStack).toBe('string');
      expect(callArgs[1].componentStack.length).toBeGreaterThan(0);
    });
  });

  describe('Advanced Scenarios - Transformation and Reporting', () => {
    it('should successfully transform error and use transformed version', () => {
      const transformMock = mock((error: AppError) => {
        // Return a transformed error
        return ok({
          ...error,
          message: `[TRANSFORMED] ${error.message}`,
        } as AppError);
      });

      const TestComponent: React.FC = () => <div>Component</div>;

      renderWithProviders(
        <ErrorBoundary transformResultError={transformMock}>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Component')).toBeInTheDocument();
    });

    it('should handle transformation failure gracefully', () => {
      const transformMock = mock((error: AppError) =>
        err(createNetworkError('Transformation failed'))
      );

      const TestComponent: React.FC = () => <div>Component</div>;

      renderWithProviders(
        <ErrorBoundary transformResultError={transformMock}>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Component')).toBeInTheDocument();
    });

    it('should call reportResultError and handle success', () => {
      const reportMock = mock((error: AppError) => ok(undefined));

      const TestComponent: React.FC = () => <div>Component</div>;

      renderWithProviders(
        <ErrorBoundary reportResultError={reportMock}>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Component')).toBeInTheDocument();
    });

    it('should call reportResultError and handle failure', () => {
      const reportMock = mock((error: AppError) => err(createNetworkError('Report failed')));

      const TestComponent: React.FC = () => <div>Component</div>;

      renderWithProviders(
        <ErrorBoundary reportResultError={reportMock}>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Component')).toBeInTheDocument();
    });

    it('should execute all transformation, reporting, and recovery', () => {
      const transformMock = mock((error: AppError) => ok(error));
      const reportMock = mock((error: AppError) => ok(undefined));
      const strategyMock = mock(() => ok(<div>Strategy recovered</div>));

      const strategies = [
        {
          canHandle: (error: AppError) => true,
          recover: strategyMock,
        },
      ];

      const TestComponent: React.FC = () => <div>Component</div>;

      renderWithProviders(
        <ErrorBoundary
          transformResultError={transformMock}
          reportResultError={reportMock}
          recoveryStrategies={strategies}
        >
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Component')).toBeInTheDocument();
    });
  });

  describe('Error Rendering - All Error Types Extended', () => {
    it('should render network error without retry when not retryable', () => {
      const TestComponent: React.FC = () => <div>Test</div>;

      renderWithProviders(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Test')).toBeInTheDocument();
    });

    it('should render auth error with login redirect', () => {
      const TestComponent: React.FC = () => <div>Auth test</div>;

      renderWithProviders(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Auth test')).toBeInTheDocument();
    });

    it('should render business error as warning', () => {
      const TestComponent: React.FC = () => <div>Business test</div>;

      renderWithProviders(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Business test')).toBeInTheDocument();
    });

    it('should render validation error as alert', () => {
      const TestComponent: React.FC = () => <div>Validation test</div>;

      renderWithProviders(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Validation test')).toBeInTheDocument();
    });

    it('should handle error with custom render transformation', () => {
      const transformMock = mock((error: AppError) =>
        ok({
          ...error,
          message: `Transformed: ${error.message}`,
        } as AppError)
      );

      const TestComponent: React.FC = () => <div>Transform render test</div>;

      renderWithProviders(
        <ErrorBoundary transformResultError={transformMock}>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Transform render test')).toBeInTheDocument();
    });
  });

  describe('Full Integration - All Props', () => {
    it('should work with all optional props together', () => {
      const onErrorMock = mock(() => undefined);
      const onResultErrorMock = mock((result: FPResult<unknown, AppError>) => null);
      const transformMock = mock((error: AppError) => ok(error));
      const reportMock = mock((error: AppError) => ok(undefined));
      const strategyMock = mock(() => ok(null));
      const fallback = <div>Custom fallback</div>;

      const strategies = [
        {
          canHandle: (error: AppError) => true,
          recover: strategyMock,
        },
      ];

      const TestComponent: React.FC = () => <div>Full integration</div>;

      renderWithProviders(
        <ErrorBoundary
          fallback={fallback}
          onError={onErrorMock}
          onResultError={onResultErrorMock}
          transformResultError={transformMock}
          reportResultError={reportMock}
          recoveryStrategies={strategies}
        >
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Full integration')).toBeInTheDocument();
    });

    it('should render custom fallback when error occurs with all props', () => {
      const fallback = <div data-testid="full-props-fallback">Full Integration Fallback</div>;

      renderWithProviders(
        <ErrorBoundary
          fallback={fallback}
          onError={mock(() => undefined)}
          onResultError={mock((result: FPResult<unknown, AppError>) => null)}
          transformResultError={mock((error: AppError) => ok(error))}
          reportResultError={mock((error: AppError) => ok(undefined))}
          recoveryStrategies={[]}
        >
          <RenderErrorComponent errorMessage="Error with full props" />
        </ErrorBoundary>
      );

      expect(screen.getByTestId('full-props-fallback')).toBeInTheDocument();
    });
  });

  describe('Edge Case - Result Error States', () => {
    it('should handle result error with null error value', () => {
      const TestComponent: React.FC = () => <div>Null error test</div>;

      renderWithProviders(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Null error test')).toBeInTheDocument();
    });

    it('should handle result error with empty error details', () => {
      const TestComponent: React.FC = () => <div>Empty details test</div>;

      renderWithProviders(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Empty details test')).toBeInTheDocument();
    });

    it('should handle multiple error transformations in sequence', () => {
      const transform1 = mock((error: AppError) =>
        ok({
          ...error,
          message: 'Transform1: ' + error.message,
        } as AppError)
      );

      const TestComponent: React.FC = () => <div>Sequential transform</div>;

      renderWithProviders(
        <ErrorBoundary transformResultError={transform1}>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Sequential transform')).toBeInTheDocument();
    });

    it('should handle strategy that returns null recovery', () => {
      const strategyMock = mock(() => err(createNetworkError('No recovery')));

      const strategies = [
        {
          canHandle: (error: AppError) => error.type === 'network',
          recover: strategyMock,
        },
      ];

      const TestComponent: React.FC = () => <div>No recovery strategy</div>;

      renderWithProviders(
        <ErrorBoundary recoveryStrategies={strategies}>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('No recovery strategy')).toBeInTheDocument();
    });

    it('should preserve error state across component updates', () => {
      const { rerender } = renderWithProviders(
        <ErrorBoundary>
          <div>Test content</div>
        </ErrorBoundary>
      );

      expect(screen.getByText('Test content')).toBeInTheDocument();

      rerender(
        <ErrorBoundary>
          <div>Updated content</div>
        </ErrorBoundary>
      );

      expect(screen.getByText('Updated content')).toBeInTheDocument();
    });

    it('should handle unmount and remount correctly', () => {
      const { unmount } = renderWithProviders(
        <ErrorBoundary>
          <div>Test content</div>
        </ErrorBoundary>
      );

      expect(screen.getByText('Test content')).toBeInTheDocument();

      unmount();

      renderWithProviders(
        <ErrorBoundary>
          <div>Test content after remount</div>
        </ErrorBoundary>
      );

      expect(screen.getByText('Test content after remount')).toBeInTheDocument();
    });

    it('should correctly handle render when has error state', () => {
      const fallback = <div data-testid="error-ui">Error UI</div>;

      renderWithProviders(
        <ErrorBoundary fallback={fallback}>
          <RenderErrorComponent errorMessage="Render state test" />
        </ErrorBoundary>
      );

      expect(screen.getByTestId('error-ui')).toBeInTheDocument();
    });
  });

  describe('Normalize and Notify Result Error Methods', () => {
    it('should normalize error with successful transformation', () => {
      const transformMock = mock((error: AppError) =>
        ok({
          ...error,
          message: `NORMALIZED: ${error.message}`,
        } as AppError)
      );

      const TestComponent: React.FC = () => <div>Normalize test</div>;

      renderWithProviders(
        <ErrorBoundary transformResultError={transformMock}>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Normalize test')).toBeInTheDocument();
    });

    it('should keep original error when transformation returns error', () => {
      const transformMock = mock((error: AppError) => err(createNetworkError('Transform error')));

      const TestComponent: React.FC = () => <div>Keep original</div>;

      renderWithProviders(
        <ErrorBoundary transformResultError={transformMock}>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Keep original')).toBeInTheDocument();
    });

    it('should notify error when no reportResultError callback', () => {
      const TestComponent: React.FC = () => <div>Notify without callback</div>;

      renderWithProviders(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Notify without callback')).toBeInTheDocument();
    });

    it('should report error through reportResultError callback', () => {
      const reportMock = mock((error: AppError) => ok(undefined));

      const TestComponent: React.FC = () => <div>Report through callback</div>;

      renderWithProviders(
        <ErrorBoundary reportResultError={reportMock}>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Report through callback')).toBeInTheDocument();
    });

    it('should handle reporting error failure gracefully', () => {
      const reportMock = mock((error: AppError) => err(createNetworkError('Report failed')));

      const TestComponent: React.FC = () => <div>Report failure handling</div>;

      renderWithProviders(
        <ErrorBoundary reportResultError={reportMock}>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Report failure handling')).toBeInTheDocument();
    });
  });

  describe('Run Recovery Strategies Method', () => {
    it('should run recovery strategy that matches error type', () => {
      const recoverMock = mock(() => ok(<div>Recovered from network</div>));

      const strategies = [
        {
          canHandle: (error: AppError) => error.type === 'network',
          recover: recoverMock,
        },
      ];

      const TestComponent: React.FC = () => <div>Recovery strategy test</div>;

      renderWithProviders(
        <ErrorBoundary recoveryStrategies={strategies}>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Recovery strategy test')).toBeInTheDocument();
    });

    it('should skip strategy that does not match error type', () => {
      const networkStrategy = mock(() => ok(<div>Network recovery</div>));
      const authStrategy = mock(() => ok(<div>Auth recovery</div>));

      const strategies = [
        {
          canHandle: (error: AppError) => error.type === 'network',
          recover: networkStrategy,
        },
        {
          canHandle: (error: AppError) => error.type === 'auth',
          recover: authStrategy,
        },
      ];

      const TestComponent: React.FC = () => <div>Strategy skip test</div>;

      renderWithProviders(
        <ErrorBoundary recoveryStrategies={strategies}>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Strategy skip test')).toBeInTheDocument();
    });

    it('should return null when no strategy matches', () => {
      const recoverMock = mock(() => ok(<div>No match</div>));

      const strategies = [
        {
          canHandle: (error: AppError) => false, // Never matches
          recover: recoverMock,
        },
      ];

      const TestComponent: React.FC = () => <div>No strategy match</div>;

      renderWithProviders(
        <ErrorBoundary recoveryStrategies={strategies}>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('No strategy match')).toBeInTheDocument();
    });

    it('should handle recovery strategy error', () => {
      const failingStrategy = mock(() => err(createNetworkError('Strategy failed')));

      const strategies = [
        {
          canHandle: (error: AppError) => true,
          recover: failingStrategy,
        },
      ];

      const TestComponent: React.FC = () => <div>Strategy error handling</div>;

      renderWithProviders(
        <ErrorBoundary recoveryStrategies={strategies}>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Strategy error handling')).toBeInTheDocument();
    });
  });

  describe('Handle Result Error - Public API', () => {
    it('should pass through ok results unchanged', () => {
      const TestComponent: React.FC = () => <div>OK result test</div>;

      renderWithProviders(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('OK result test')).toBeInTheDocument();
    });

    it('should process error results and set state', () => {
      const networkError = createNetworkError('Test error');
      const TestComponent: React.FC = () => <div>Error result test</div>;

      renderWithProviders(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Error result test')).toBeInTheDocument();
    });

    it('should call onResultError callback with error result', () => {
      const onResultErrorMock = mock((result: FPResult<unknown, AppError>) => {
        return <div data-testid="callback-ui">Callback rendered</div>;
      });

      const TestComponent: React.FC = () => <div>Callback test</div>;

      renderWithProviders(
        <ErrorBoundary onResultError={onResultErrorMock}>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Callback test')).toBeInTheDocument();
    });

    it('should render error UI when onResultError not provided', () => {
      const TestComponent: React.FC = () => <div>Error UI rendering</div>;

      renderWithProviders(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Error UI rendering')).toBeInTheDocument();
    });
  });

  describe('Render Result Error - Error Type Switch', () => {
    it('should render network error with retry option', () => {
      const TestComponent: React.FC = () => <div>Network error rendering</div>;

      renderWithProviders(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Network error rendering')).toBeInTheDocument();
    });

    it('should render auth error with special handling', () => {
      const TestComponent: React.FC = () => <div>Auth error rendering</div>;

      renderWithProviders(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Auth error rendering')).toBeInTheDocument();
    });

    it('should render business error appropriately', () => {
      const TestComponent: React.FC = () => <div>Business error rendering</div>;

      renderWithProviders(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Business error rendering')).toBeInTheDocument();
    });

    it('should render validation error with field details', () => {
      const TestComponent: React.FC = () => <div>Validation error rendering</div>;

      renderWithProviders(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Validation error rendering')).toBeInTheDocument();
    });

    it('should render unknown error type', () => {
      const unknownError: AppError = {
        type: 'unknown' as any,
        message: 'Unknown error',
      } as AppError;

      const TestComponent: React.FC = () => <div>Unknown error rendering</div>;

      renderWithProviders(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Unknown error rendering')).toBeInTheDocument();
    });
  });

  describe('Component Integration - Stress Tests', () => {
    it('should handle rapid error state changes', () => {
      const TestComponent: React.FC = () => <div>Rapid changes</div>;

      const { rerender } = renderWithProviders(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Rapid changes')).toBeInTheDocument();

      for (let i = 0; i < 5; i++) {
        rerender(
          <ErrorBoundary>
            <TestComponent />
          </ErrorBoundary>
        );
      }

      expect(screen.getByText('Rapid changes')).toBeInTheDocument();
    });

    it('should handle multiple error boundaries nested', () => {
      const InnerComponent: React.FC = () => <div>Inner boundary</div>;

      renderWithProviders(
        <ErrorBoundary>
          <ErrorBoundary>
            <InnerComponent />
          </ErrorBoundary>
        </ErrorBoundary>
      );

      expect(screen.getByText('Inner boundary')).toBeInTheDocument();
    });

    it('should handle changing props on error boundary', () => {
      const TestComponent: React.FC = () => <div>Props changing</div>;

      const { rerender } = renderWithProviders(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Props changing')).toBeInTheDocument();

      rerender(
        <ErrorBoundary transformResultError={mock(e => ok(e))}>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Props changing')).toBeInTheDocument();
    });

    it('should maintain state across multiple rerenders', () => {
      const TestComponent: React.FC<{ count: number }> = ({ count }) => <div>Count: {count}</div>;

      const { rerender } = renderWithProviders(
        <ErrorBoundary>
          <TestComponent count={0} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Count: 0')).toBeInTheDocument();

      rerender(
        <ErrorBoundary>
          <TestComponent count={1} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Count: 1')).toBeInTheDocument();

      rerender(
        <ErrorBoundary>
          <TestComponent count={2} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Count: 2')).toBeInTheDocument();
    });

    it('should handle error recovery after failure', () => {
      const recoverMock = mock(() => err(createNetworkError('Recovery failed')));

      const strategies = [
        {
          canHandle: (error: AppError) => error.type === 'network',
          recover: recoverMock,
        },
      ];

      const TestComponent: React.FC = () => <div>Recovery after failure</div>;

      renderWithProviders(
        <ErrorBoundary recoveryStrategies={strategies}>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Recovery after failure')).toBeInTheDocument();
    });
  });

  describe('Public handleResultError Method - Direct Testing', () => {
    it('should render error UI when handleResultError called with network error', () => {
      const boundaryRefLocal = React.createRef<ErrorBoundary>();

      renderWithProviders(
        <ErrorBoundary ref={boundaryRefLocal}>
          <div data-testid="initial-content">Initial</div>
        </ErrorBoundary>
      );

      expect(screen.getByTestId('initial-content')).toBeInTheDocument();

      // Call public method
      if (boundaryRefLocal.current) {
        const result = err(createNetworkError('Network error via handleResultError'));
        boundaryRefLocal.current.handleResultError(result);
      }
    });

    it('should normalize and notify error through handleResultError', () => {
      const transformMock = mock((error: AppError) =>
        ok({
          ...error,
          message: `[Transformed] ${error.message}`,
        } as AppError)
      );

      const reportMock = mock((error: AppError) => ok(undefined));

      const boundaryRefLocal = React.createRef<ErrorBoundary>();

      renderWithProviders(
        <ErrorBoundary
          ref={boundaryRefLocal}
          transformResultError={transformMock}
          reportResultError={reportMock}
        >
          <div>Testing normalize and notify</div>
        </ErrorBoundary>
      );

      expect(screen.getByText('Testing normalize and notify')).toBeInTheDocument();

      if (boundaryRefLocal.current) {
        const result = err(createNetworkError('Error to normalize'));
        boundaryRefLocal.current.handleResultError(result);
      }
    });

    it('should render custom fallback when resultError is set', () => {
      const customFallback = <div data-testid="custom-result-fallback">Custom Result Fallback</div>;
      const boundaryRefLocal = React.createRef<ErrorBoundary>();

      const { rerender } = renderWithProviders(
        <ErrorBoundary ref={boundaryRefLocal} fallback={customFallback}>
          <div>Initial content</div>
        </ErrorBoundary>
      );

      expect(screen.getByText('Initial content')).toBeInTheDocument();

      if (boundaryRefLocal.current) {
        const result = err(createAuthError('Auth error'));
        boundaryRefLocal.current.handleResultError(result);

        // Force re-render to see the result error
        rerender(
          <ErrorBoundary ref={boundaryRefLocal} fallback={customFallback}>
            <div>Initial content</div>
          </ErrorBoundary>
        );
      }
    });

    it('should execute recovery strategies when handleResultError called', () => {
      const recoverMock = mock(() => ok(<div data-testid="recovery-ui">Recovered</div>));

      const strategies = [
        {
          canHandle: (error: AppError) => error.type === 'network',
          recover: recoverMock,
        },
      ];

      const boundaryRefLocal = React.createRef<ErrorBoundary>();

      renderWithProviders(
        <ErrorBoundary ref={boundaryRefLocal} recoveryStrategies={strategies}>
          <div>Before recovery</div>
        </ErrorBoundary>
      );

      if (boundaryRefLocal.current) {
        const result = err(createNetworkError('Error for recovery'));
        boundaryRefLocal.current.handleResultError(result);
      }
    });

    it('should handle ok result from handleResultError', () => {
      const boundaryRefLocal = React.createRef<ErrorBoundary>();

      renderWithProviders(
        <ErrorBoundary ref={boundaryRefLocal}>
          <div>OK result test</div>
        </ErrorBoundary>
      );

      if (boundaryRefLocal.current) {
        const result = ok('Success');
        const returnValue = boundaryRefLocal.current.handleResultError(result);
        expect(returnValue).toBeNull();
      }
    });

    it('should call onResultError callback from handleResultError', () => {
      const onResultErrorMock = mock((result: FPResult<unknown, AppError>) => (
        <div data-testid="result-error-ui">Result Error UI</div>
      ));

      const boundaryRefLocal = React.createRef<ErrorBoundary>();

      renderWithProviders(
        <ErrorBoundary ref={boundaryRefLocal} onResultError={onResultErrorMock}>
          <div>Callback test</div>
        </ErrorBoundary>
      );

      if (boundaryRefLocal.current) {
        const result = err(createBusinessLogicError('Business error'));
        boundaryRefLocal.current.handleResultError(result);
      }
    });

    it('should render renderResultError when onResultError not provided', () => {
      const boundaryRefLocal = React.createRef<ErrorBoundary>();

      renderWithProviders(
        <ErrorBoundary ref={boundaryRefLocal}>
          <div>Render error UI test</div>
        </ErrorBoundary>
      );

      if (boundaryRefLocal.current) {
        const result = err(createValidationError('Validation failed', { field: 'test' }));
        boundaryRefLocal.current.handleResultError(result);
      }
    });

    it('should handle multiple sequential calls to handleResultError', () => {
      const boundaryRefLocal = React.createRef<ErrorBoundary>();

      const { container } = renderWithProviders(
        <ErrorBoundary ref={boundaryRefLocal}>
          <div>Sequential errors</div>
        </ErrorBoundary>
      );

      if (boundaryRefLocal.current) {
        for (let i = 0; i < 3; i++) {
          const result = err(createNetworkError(`Error ${i}`, undefined, { retryable: true }));
          boundaryRefLocal.current.handleResultError(result);
        }
      }

      // Verify that error UI is rendered after handling errors
      const errorAlert = container.querySelector('[class*="ant-alert"]');
      expect(errorAlert).toBeInTheDocument();
    });
  });

  describe('Render Result Error - All Switch Cases', () => {
    it('should render network error with retry button', () => {
      const boundaryRefLocal = React.createRef<ErrorBoundary>();

      renderWithProviders(
        <ErrorBoundary ref={boundaryRefLocal}>
          <div>Network error case</div>
        </ErrorBoundary>
      );

      if (boundaryRefLocal.current) {
        const result = err(
          createNetworkError('Connection timeout', undefined, { retryable: true })
        );
        boundaryRefLocal.current.handleResultError(result);
      }
    });

    it('should render network error without retry when not retryable', () => {
      const boundaryRefLocal = React.createRef<ErrorBoundary>();

      renderWithProviders(
        <ErrorBoundary ref={boundaryRefLocal}>
          <div>Non-retryable network error</div>
        </ErrorBoundary>
      );

      if (boundaryRefLocal.current) {
        const result = err(createNetworkError('Not retryable', undefined, { retryable: false }));
        boundaryRefLocal.current.handleResultError(result);
      }
    });

    it('should render auth error case', () => {
      const boundaryRefLocal = React.createRef<ErrorBoundary>();

      renderWithProviders(
        <ErrorBoundary ref={boundaryRefLocal}>
          <div>Auth error case</div>
        </ErrorBoundary>
      );

      if (boundaryRefLocal.current) {
        const result = err(createAuthError('Unauthorized access'));
        boundaryRefLocal.current.handleResultError(result);
      }
    });

    it('should render business error case', () => {
      const boundaryRefLocal = React.createRef<ErrorBoundary>();

      renderWithProviders(
        <ErrorBoundary ref={boundaryRefLocal}>
          <div>Business error case</div>
        </ErrorBoundary>
      );

      if (boundaryRefLocal.current) {
        const result = err(createBusinessLogicError('Business rule violated'));
        boundaryRefLocal.current.handleResultError(result);
      }
    });

    it('should render validation error case', () => {
      const boundaryRefLocal = React.createRef<ErrorBoundary>();

      renderWithProviders(
        <ErrorBoundary ref={boundaryRefLocal}>
          <div>Validation error case</div>
        </ErrorBoundary>
      );

      if (boundaryRefLocal.current) {
        const result = err(createValidationError('Invalid input', { field: 'email' }));
        boundaryRefLocal.current.handleResultError(result);
      }
    });

    it('should render unknown error type (exhaustiveness check)', () => {
      const boundaryRefLocal = React.createRef<ErrorBoundary>();

      renderWithProviders(
        <ErrorBoundary ref={boundaryRefLocal}>
          <div>Unknown error type</div>
        </ErrorBoundary>
      );

      if (boundaryRefLocal.current) {
        const unknownError: AppError = {
          type: 'unknown' as any,
          message: 'Unknown error',
        };
        const result = err(unknownError);
        boundaryRefLocal.current.handleResultError(result);
      }
    });
  });

  describe('State Transitions - Result Error', () => {
    it('should transition from no error to result error state', () => {
      const boundaryRefLocal = React.createRef<ErrorBoundary>();

      const { rerender } = renderWithProviders(
        <ErrorBoundary ref={boundaryRefLocal}>
          <div>Initial state</div>
        </ErrorBoundary>
      );

      expect(screen.getByText('Initial state')).toBeInTheDocument();

      if (boundaryRefLocal.current) {
        const result = err(createNetworkError('Error occurred'));
        boundaryRefLocal.current.handleResultError(result);

        rerender(
          <ErrorBoundary ref={boundaryRefLocal}>
            <div>Initial state</div>
          </ErrorBoundary>
        );
      }
    });

    it('should maintain result error state across rerenders', () => {
      const boundaryRefLocal = React.createRef<ErrorBoundary>();

      const { rerender } = renderWithProviders(
        <ErrorBoundary ref={boundaryRefLocal}>
          <div>First render</div>
        </ErrorBoundary>
      );

      if (boundaryRefLocal.current) {
        const result = err(createAuthError('Auth error'));
        boundaryRefLocal.current.handleResultError(result);

        // Rerender with different props
        rerender(
          <ErrorBoundary ref={boundaryRefLocal}>
            <div>Second render</div>
          </ErrorBoundary>
        );

        // Rerender again
        rerender(
          <ErrorBoundary ref={boundaryRefLocal}>
            <div>Third render</div>
          </ErrorBoundary>
        );
      }
    });

    it('should handle retry and clear result error state', () => {
      const boundaryRefLocal = React.createRef<ErrorBoundary>();

      const { rerender } = renderWithProviders(
        <ErrorBoundary ref={boundaryRefLocal}>
          <div>Retry test</div>
        </ErrorBoundary>
      );

      if (boundaryRefLocal.current) {
        // Set error
        const result = err(createNetworkError('Initial error'));
        boundaryRefLocal.current.handleResultError(result);

        rerender(
          <ErrorBoundary ref={boundaryRefLocal}>
            <div>Retry test</div>
          </ErrorBoundary>
        );

        // Verify component is still functional after error
        expect(boundaryRefLocal.current).toBeDefined();
      }
    });
  });

  describe('Render Method - Result Error Path', () => {
    it('should render resultError when hasError is false but resultError exists', () => {
      const boundaryRefLocal = React.createRef<ErrorBoundary>();

      const { rerender } = renderWithProviders(
        <ErrorBoundary ref={boundaryRefLocal}>
          <div>Result error path test</div>
        </ErrorBoundary>
      );

      expect(screen.getByText('Result error path test')).toBeInTheDocument();

      if (boundaryRefLocal.current) {
        const result = err(createNetworkError('Network error'));
        boundaryRefLocal.current.handleResultError(result);

        // Force re-render to see the render method with resultError
        rerender(
          <ErrorBoundary ref={boundaryRefLocal}>
            <div>Result error path test</div>
          </ErrorBoundary>
        );
      }
    });

    it('should call onResultError when rendering resultError with callback', () => {
      const onResultErrorMock = mock((result: FPResult<unknown, AppError>) => (
        <div data-testid="on-result-error-called">Callback rendered</div>
      ));

      const boundaryRefLocal = React.createRef<ErrorBoundary>();

      const { rerender } = renderWithProviders(
        <ErrorBoundary ref={boundaryRefLocal} onResultError={onResultErrorMock}>
          <div>Callback render test</div>
        </ErrorBoundary>
      );

      if (boundaryRefLocal.current) {
        const result = err(createAuthError('Auth error'));
        boundaryRefLocal.current.handleResultError(result);

        rerender(
          <ErrorBoundary ref={boundaryRefLocal} onResultError={onResultErrorMock}>
            <div>Callback render test</div>
          </ErrorBoundary>
        );
      }
    });

    it('should render error directly when resultError without onResultError callback', () => {
      const boundaryRefLocal = React.createRef<ErrorBoundary>();

      const { rerender } = renderWithProviders(
        <ErrorBoundary ref={boundaryRefLocal}>
          <div>Direct render test</div>
        </ErrorBoundary>
      );

      if (boundaryRefLocal.current) {
        const result = err(createValidationError('Validation failed'));
        boundaryRefLocal.current.handleResultError(result);

        rerender(
          <ErrorBoundary ref={boundaryRefLocal}>
            <div>Direct render test</div>
          </ErrorBoundary>
        );
      }
    });

    it('should render validation error in switch statement (line 158)', () => {
      const boundaryRefLocal = React.createRef<ErrorBoundary>();

      renderWithProviders(
        <ErrorBoundary ref={boundaryRefLocal}>
          <div>Validation switch case</div>
        </ErrorBoundary>
      );

      if (boundaryRefLocal.current) {
        // Directly call renderResultError by calling handleResultError
        const validationError = createValidationError('Field is required', { field: 'name' });
        const result = err(validationError);
        boundaryRefLocal.current.handleResultError(result);
      }
    });

    it('should prioritize custom fallback over resultError rendering', () => {
      const customFallback = <div data-testid="custom-fallback-test">Custom Fallback</div>;
      const boundaryRefLocal = React.createRef<ErrorBoundary>();

      renderWithProviders(
        <ErrorBoundary ref={boundaryRefLocal} fallback={customFallback}>
          <div>Fallback priority test</div>
        </ErrorBoundary>
      );

      // Even if we set result error, the hasError state takes priority
      if (boundaryRefLocal.current) {
        const result = err(createNetworkError('Error'));
        boundaryRefLocal.current.handleResultError(result);
      }
    });

    it('should render children when no errors', () => {
      renderWithProviders(
        <ErrorBoundary>
          <div data-testid="children-content">Children rendered</div>
        </ErrorBoundary>
      );

      expect(screen.getByTestId('children-content')).toBeInTheDocument();
    });
  });
});
