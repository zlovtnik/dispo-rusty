export interface BaseError {
  readonly type: 'validation' | 'network' | 'auth' | 'business';
  readonly message: string;
  readonly code?: string;
  readonly details?: Record<string, unknown>;
  readonly cause?: unknown;
  readonly retryable?: boolean;
  readonly statusCode?: number;
}

export interface ValidationError extends BaseError {
  readonly type: 'validation';
}

export interface NetworkError extends BaseError {
  readonly type: 'network';
}

export interface AuthError extends BaseError {
  readonly type: 'auth';
}

export interface BusinessLogicError extends BaseError {
  readonly type: 'business';
}

export type AppError =
  | ValidationError
  | NetworkError
  | AuthError
  | BusinessLogicError;

export const createValidationError = (message: string, details?: Record<string, unknown>, options?: { code?: string; cause?: unknown; statusCode?: number }): ValidationError => ({
  type: 'validation',
  message,
  details,
  code: options?.code,
  cause: options?.cause,
  statusCode: options?.statusCode,
});

export const createNetworkError = (message: string, details?: Record<string, unknown>, options?: { code?: string; retryable?: boolean; cause?: unknown; statusCode?: number }): NetworkError => ({
  type: 'network',
  message,
  details,
  code: options?.code,
  retryable: options?.retryable,
  cause: options?.cause,
  statusCode: options?.statusCode,
});

export const createAuthError = (message: string, details?: Record<string, unknown>, options?: { code?: string; cause?: unknown; statusCode?: number }): AuthError => ({
  type: 'auth',
  message,
  details,
  code: options?.code,
  cause: options?.cause,
  statusCode: options?.statusCode,
});

export const createBusinessLogicError = (message: string, details?: Record<string, unknown>, options?: { code?: string; cause?: unknown; statusCode?: number }): BusinessLogicError => ({
  type: 'business',
  message,
  details,
  code: options?.code,
  cause: options?.cause,
  statusCode: options?.statusCode,
});
