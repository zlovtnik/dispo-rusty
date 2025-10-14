import React, { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Button, Result, Alert } from 'antd';
import { logger } from '../utils/logger';
import type { Result as FPResult } from '../types/fp';
import type { AppError } from '../types/errors';
import {
  formatStorageError,
  formatParseError,
  formatCredentialValidationError,
  formatAuthFlowError,
} from '../types/errors';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  onResultError?: (result: FPResult<any, AppError>) => ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  resultError?: FPResult<any, AppError>;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('Error caught by boundary', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  /**
   * Handle Result-based errors with custom recovery strategies
   */
  public handleResultError = (result: FPResult<any, AppError>) => {
    if (result.isErr()) {
      // Update state to trigger render
      this.setState({ resultError: result });

      // Check if custom handler provided
      if (this.props.onResultError) {
        return this.props.onResultError(result);
      }

      // Pattern match on error type for custom UI
      return this.renderResultError(result.error);
    }
    return null;
  };

  /**
   * Render error UI based on Result error type
   */
  private renderResultError = (error: AppError) => {
    switch (error.type) {
      case 'network':
        return (
          <Alert
            message="Network Error"
            description={error.message}
            type="error"
            showIcon
            action={
              error.retryable !== false ? (
                <Button size="small" onClick={() => this.handleRetry()}>
                  Retry
                </Button>
              ) : undefined
            }
          />
        );

      case 'auth':
        return (
          <Result
            status="403"
            title="Authentication Error"
            subTitle={error.message}
            extra={
              <Button type="primary" onClick={() => window.location.href = '/login'}>
                Go to Login
              </Button>
            }
          />
        );

      case 'business':
        return (
          <Alert
            message="Business Logic Error"
            description={error.message}
            type="warning"
            showIcon
          />
        );

      case 'validation':
        return (
          <Alert
            message="Validation Error"
            description={error.message}
            type="error"
            showIcon
          />
        );

      default:
        // TypeScript exhaustiveness check - this should never happen
        // but if it does, we want to display the error
        const _exhaustive: never = error;
        const unknownError = _exhaustive as AppError;
        return (
          <Alert
            message="Error"
            description={unknownError.message}
            type="error"
            showIcon
          />
        );
    }
  };

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined, resultError: undefined });
  };

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Result
          status="error"
          title="Something went wrong"
          subTitle={this.state.error?.message || "An unexpected error occurred"}
          extra={
            <Button type="primary" onClick={this.handleRetry}>
              Try Again
            </Button>
          }
        />
      );
    }

    // If there's a Result error, render it directly (no setState during render)
    if (this.state.resultError && this.state.resultError.isErr()) {
      // Check if custom handler provided
      if (this.props.onResultError) {
        return this.props.onResultError(this.state.resultError);
      }

      // Render the error UI directly without calling setState
      return this.renderResultError(this.state.resultError.error);
    }

    return this.props.children;
  }
}

// HOC wrapper for easier usage
export function withErrorBoundary<T extends Record<string, any>>(
  Component: React.ComponentType<T>,
  errorBoundaryProps?: Omit<Props, 'children'>
) {
  const WrappedComponent = (props: T) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;

  return WrappedComponent;
}
