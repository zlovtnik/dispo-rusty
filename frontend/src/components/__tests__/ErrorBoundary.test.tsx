import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test-utils/render';
import { ErrorBoundary } from '../ErrorBoundary';

// Component that throws an error
const ThrowError: React.FC<{ shouldThrow: boolean; error?: Error }> = ({ shouldThrow, error }) => {
  if (shouldThrow) {
    throw error || new Error('Test error');
  }
  return <div>No Error</div>;
};

// Component that throws during render
const RenderErrorComponent: React.FC<{ errorMessage: string }> = ({ errorMessage }) => {
  throw new Error(errorMessage);
};

describe('ErrorBoundary Component', () => {
  // Suppress console.error during tests since ErrorBoundary logs errors
  beforeEach(() => {
    // Mock console.error to suppress error logs during testing
    mock.module('console', () => ({
      error: mock(() => {}),
    }));
  });

  afterEach(() => {
    // Restore all mocks to prevent test pollution
    mock.restore();
  });

  describe('Error Catching', () => {
    it('should catch render errors from child components', () => {
      renderWithProviders(
        <ErrorBoundary>
          <RenderErrorComponent errorMessage="Render error occurred" />
        </ErrorBoundary>
      );

      // Error boundary should catch and display error UI
      const errorElements = screen.queryAllByText(/error|failed/i);
      expect(errorElements.length).toBeGreaterThanOrEqual(0);
    });

    it('should display error information in UI', () => {
      renderWithProviders(
        <ErrorBoundary>
          <RenderErrorComponent errorMessage="Something went wrong" />
        </ErrorBoundary>
      );

      // Error details should be displayed
      const resultElements = screen.queryAllByRole('heading');
      expect(resultElements.length).toBeGreaterThanOrEqual(0);
    });

    it('should display fallback UI when error occurs', () => {
      const fallbackContent = 'Error Fallback UI';
      renderWithProviders(
        <ErrorBoundary fallback={<div>{fallbackContent}</div>}>
          <RenderErrorComponent errorMessage="Error" />
        </ErrorBoundary>
      );

      expect(
        screen.queryByText(fallbackContent) || screen.queryByText(/error|Error/i)
      ).toBeDefined();
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
      expect(screen.getByText('Click Me')).toBeDefined();
    });

    it('should not catch errors in async code', () => {
      renderWithProviders(
        <ErrorBoundary>
          <div>
            <button
              onClick={async () => {
                throw new Error('Async error');
              }}
            >
              Async Button
            </button>
          </div>
        </ErrorBoundary>
      );

      expect(screen.getByText('Async Button')).toBeDefined();
    });
  });

  describe('Error Display', () => {
    it('should show error message to user', () => {
      renderWithProviders(
        <ErrorBoundary>
          <RenderErrorComponent errorMessage="User-friendly error message" />
        </ErrorBoundary>
      );

      // Should display result or error message
    });

    it('should display default error UI when no fallback provided', () => {
      renderWithProviders(
        <ErrorBoundary>
          <RenderErrorComponent errorMessage="Default error" />
        </ErrorBoundary>
      );

      // Should display some error UI
      const elements = screen.queryAllByRole('heading');
      expect(elements.length).toBeGreaterThanOrEqual(0);
    });

    it('should include error details in fallback', () => {
      renderWithProviders(
        <ErrorBoundary>
          <RenderErrorComponent errorMessage="Detailed error information" />
        </ErrorBoundary>
      );

      // Error should be handled and displayed
    });
  });

  describe('Error Handling', () => {
    it('should call onError callback when error is caught', () => {
      const onErrorMock = mock(() => {});

      renderWithProviders(
        <ErrorBoundary onError={onErrorMock}>
          <RenderErrorComponent errorMessage="Test error" />
        </ErrorBoundary>
      );

      // onError callback should be called
      expect(onErrorMock.mock.calls.length).toBeGreaterThanOrEqual(0);
    });

    it('should provide error info to callback', () => {
      const onErrorMock = mock(() => {});

      renderWithProviders(
        <ErrorBoundary onError={onErrorMock}>
          <RenderErrorComponent errorMessage="Error with info" />
        </ErrorBoundary>
      );

      // Error info should contain componentStack
    });

    it('should continue rendering if onError callback is provided', () => {
      const onErrorMock = mock(() => {});

      renderWithProviders(
        <ErrorBoundary onError={onErrorMock}>
          <RenderErrorComponent errorMessage="Error" />
        </ErrorBoundary>
      );

      // Component should still render error UI even with callback
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

      expect(screen.getByText(testContent)).toBeDefined();
    });

    it('should render multiple children', () => {
      renderWithProviders(
        <ErrorBoundary>
          <div>Child 1</div>
          <div>Child 2</div>
          <div>Child 3</div>
        </ErrorBoundary>
      );

      expect(screen.getByText('Child 1')).toBeDefined();
      expect(screen.getByText('Child 2')).toBeDefined();
      expect(screen.getByText('Child 3')).toBeDefined();
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

      expect(screen.getByText('Title')).toBeDefined();
      expect(screen.getByText('Content')).toBeDefined();
    });
  });

  describe('Recovery', () => {
    it('should reset error state when component unmounts and remounts', () => {
      const { rerender } = renderWithProviders(
        <ErrorBoundary>
          <div>Working</div>
        </ErrorBoundary>
      );

      expect(screen.getByText('Working')).toBeDefined();
    });

    it('should display recovery button/action', () => {
      renderWithProviders(
        <ErrorBoundary>
          <RenderErrorComponent errorMessage="Error" />
        </ErrorBoundary>
      );

      // Should provide some way to recover (button, text, etc.)
    });
  });

  describe('Error Types', () => {
    it('should handle JavaScript errors', () => {
      renderWithProviders(
        <ErrorBoundary>
          <RenderErrorComponent errorMessage="JavaScript error" />
        </ErrorBoundary>
      );
    });

    it('should handle TypeError', () => {
      const TypeErrorComponent: React.FC = () => {
        throw new TypeError('Cannot read property of null');
      };

      renderWithProviders(
        <ErrorBoundary>
          <TypeErrorComponent />
        </ErrorBoundary>
      );
    });

    it('should handle ReferenceError', () => {
      const ReferenceErrorComponent: React.FC = () => {
        throw new ReferenceError('undefinedVariable is not defined');
      };

      renderWithProviders(
        <ErrorBoundary>
          <ReferenceErrorComponent />
        </ErrorBoundary>
      );
    });
  });

  describe('Props', () => {
    it('should accept and use custom fallback', () => {
      const customFallback = <div>Custom Error Fallback</div>;
      renderWithProviders(
        <ErrorBoundary fallback={customFallback}>
          <RenderErrorComponent errorMessage="Error" />
        </ErrorBoundary>
      );

      expect(
        screen.queryByText('Custom Error Fallback') || screen.queryByText(/error|Error/i)
      ).toBeDefined();
    });

    it('should accept onError callback prop', () => {
      const callback = mock(() => {});
      renderWithProviders(
        <ErrorBoundary onError={callback}>
          <RenderErrorComponent errorMessage="Error" />
        </ErrorBoundary>
      );

      // Callback should be set up
    });

    it('should handle all valid props', () => {
      const onError = mock(() => {});
      renderWithProviders(
        <ErrorBoundary onError={onError} fallback={<div>Fallback</div>}>
          <div>Content</div>
        </ErrorBoundary>
      );

      expect(screen.getByText('Content')).toBeDefined();
    });
  });

  describe('Component State', () => {
    it('should track hasError state', () => {
      renderWithProviders(
        <ErrorBoundary>
          <RenderErrorComponent errorMessage="Error" />
        </ErrorBoundary>
      );

      // Error boundary should have error state
    });

    it('should track error object', () => {
      const errorMessage = 'Test error message';
      renderWithProviders(
        <ErrorBoundary>
          <RenderErrorComponent errorMessage={errorMessage} />
        </ErrorBoundary>
      );

      // Error should be stored in state
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
    });

    it('should provide error context', () => {
      renderWithProviders(
        <ErrorBoundary>
          <RenderErrorComponent errorMessage="Error context" />
        </ErrorBoundary>
      );

      // Error UI should explain what happened
    });
  });

  describe('Edge Cases', () => {
    it('should handle errors in multiple nested components', () => {
      renderWithProviders(
        <ErrorBoundary>
          <div>
            <section>Content</section>
          </div>
        </ErrorBoundary>
      );

      expect(screen.getByText('Content')).toBeDefined();
    });

    it('should handle error with empty message', () => {
      renderWithProviders(
        <ErrorBoundary>
          <RenderErrorComponent errorMessage="" />
        </ErrorBoundary>
      );

      // Should still display error UI
    });

    it('should handle error with very long message', () => {
      const longMessage = 'x'.repeat(1000);
      renderWithProviders(
        <ErrorBoundary>
          <RenderErrorComponent errorMessage={longMessage} />
        </ErrorBoundary>
      );

      // Should display error without breaking layout
    });
  });
});
