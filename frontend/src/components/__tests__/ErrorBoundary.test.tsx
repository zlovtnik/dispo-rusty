import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import React from 'react';
import { screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { renderWithProviders } from '../../test-utils/render';
import { ErrorBoundary } from '../ErrorBoundary';

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

      // Error details should be displayed
      expect(screen.getByRole('heading')).toBeInTheDocument();
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

    expect(screen.getByText(/error|Error|went wrong/i)).toBeInTheDocument();
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

    expect(screen.getByText(/error|Error|went wrong/i)).toBeInTheDocument();
    expect(screen.getByText('Detailed error information')).toBeInTheDocument();
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

  describe('Edge Cases', () => {
    it('should handle errors in multiple nested components', () => {
      // Create a deeply nested component tree where the innermost component throws
      const DeeplyNestedErrorComponent: React.FC = () => {
        throw new Error('Error in deeply nested component');
      };

      const MiddleComponent: React.FC = () => (
        <div>
          <section>
            <article>
              <DeeplyNestedErrorComponent />
            </article>
          </section>
        </div>
      );

      const OuterComponent: React.FC = () => (
        <div>
          <header>Header content</header>
          <MiddleComponent />
          <footer>Footer content</footer>
        </div>
      );

      renderWithProviders(
        <ErrorBoundary>
          <OuterComponent />
        </ErrorBoundary>
      );

      // Error boundary should catch the error from deeply nested component
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();

      // Original content should not be displayed
      expect(screen.queryByText('Header content')).not.toBeInTheDocument();
      expect(screen.queryByText('Footer content')).not.toBeInTheDocument();
    });

    it('should handle error with empty message', () => {
      renderWithProviders(
        <ErrorBoundary>
          <RenderErrorComponent errorMessage="" />
        </ErrorBoundary>
      );

      // Should still display error UI
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('should handle error with very long message', () => {
      const longMessage = 'x'.repeat(1000);
      renderWithProviders(
        <ErrorBoundary>
          <RenderErrorComponent errorMessage={longMessage} />
        </ErrorBoundary>
      );

      // Should display error without breaking layout
      expect(screen.getByText(longMessage)).toBeInTheDocument();
    });
  });
});
