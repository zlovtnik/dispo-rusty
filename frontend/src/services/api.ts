/**
 * @module services/api
 * @description HTTP Client and API Services for Multi-Tenant REST API
 *
 * This module provides a robust HTTP client with the following features:
 * - Automatic JWT token authentication
 * - Tenant context injection (X-Tenant-ID header)
 * - Railway-oriented programming with Result types
 * - Automatic retry with exponential backoff
 * - Circuit breaker pattern for fault tolerance
 * - Request/response validation with Zod schemas
 *
 * All API methods return AsyncResult<T, E> for type-safe error handling
 * without throwing exceptions.
 *
 * @example
 * ```typescript
 * // Login example
 * const result = await authService.login({
 *   usernameOrEmail: 'user@example.com',
 *   password: 'password123',
 *   tenantId: 'tenant1'
 * });
 *
 * result.match(
 *   (auth) => console.log('Logged in:', auth.user),
 *   (error) => console.error('Login failed:', error.message)
 * );
 * ```
 */

import qs from 'qs';
import { ResultAsync, err, errAsync, ok, okAsync } from 'neverthrow';
import { z } from 'zod';
import type { ZodType } from 'zod';
import { getEnv } from '../config/env';
import { paginatedTenantResponseSchema } from '../validation/schemas';
import type { AuthResponse, LoginCredentials, User, Tenant as AuthTenant } from '../types/auth';
import type { ContactListResponse, Contact } from '../types/contact';
import type { Gender as PersonGender } from '../types/person';
import type {
  CreateTenantDTO,
  PaginatedTenantResponse,
  UpdateTenantDTO,
  Tenant,
} from '../types/tenant';
import type { ApiResponse } from '../types/api';
import { createErrorResponse, createSuccessResponse } from '../types/api';
import type { AppError, AuthError, BusinessLogicError } from '../types/errors';
import {
  createAuthError,
  createBusinessLogicError,
  createNetworkError,
  createValidationError,
} from '../types/errors';
import type { AsyncResult, Result } from '../types/fp';
import { authResponseSchema, loginRequestSchema } from '../validation';
import { liftResult, validateAndDecode } from '../validation';
import type { AuthResponseSchema, LoginRequestSchema } from '../validation';
import { contactListFromApiResponse, mapContact } from '../transformers';
import { decodeJwtPayload } from '../utils/parsing';
import { asUserId, asTenantId } from '../types/ids';

/**
 * Retry configuration for failed HTTP requests
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Base delay in milliseconds before first retry */
  baseDelay: number;
  /** Maximum delay in milliseconds between retries */
  maxDelay: number;
}

/**
 * HTTP client configuration with timeout, retry, and circuit breaker settings
 */
export interface HttpClientConfig {
  /** Request timeout in milliseconds */
  timeout: number;
  /** Retry configuration for failed requests */
  retry: RetryConfig;
  /** Circuit breaker configuration for fault tolerance */
  circuitBreaker: {
    /** Number of failures before opening the circuit */
    failureThreshold: number;
    /** Time in milliseconds before attempting to close the circuit */
    resetTimeout: number;
  };
}

/**
 * Circuit breaker state for tracking request failures
 */
export interface CircuitBreakerState {
  /** Current state of the circuit breaker */
  state: 'closed' | 'open' | 'half-open';
  /** Number of consecutive failures */
  failureCount: number;
  /** Timestamp of the last failure */
  lastFailureTime: number;
}

/**
 * HTTP client interface for making REST API requests
 * All methods return AsyncResult for railway-oriented programming
 */
export interface IHttpClient {
  /** Execute GET request */
  get<T>(endpoint: string): AsyncResult<ApiResponse<T>, AppError>;
  /** Execute POST request with optional body */
  post<T>(endpoint: string, data?: unknown): AsyncResult<ApiResponse<T>, AppError>;
  /** Execute PUT request with optional body */
  put<T>(endpoint: string, data?: unknown): AsyncResult<ApiResponse<T>, AppError>;
  /** Execute DELETE request */
  delete<T>(endpoint: string): AsyncResult<ApiResponse<T>, AppError>;
  /** Safely get authentication token from localStorage */
  safeGetToken(): string | null;
}

const API_BASE_URL = getEnv().apiUrl;

/**
 * Default HTTP client configuration
 * - 30 second timeout
 * - 3 retry attempts with exponential backoff
 * - Circuit breaker opens after 5 failures for 1 minute
 */
const DEFAULT_CONFIG: HttpClientConfig = {
  timeout: 30000, // 30 seconds
  retry: {
    maxAttempts: 3,
    baseDelay: 1000, // 1 second
    maxDelay: 10000, // 10 seconds
  },
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeout: 60000, // 1 minute
  },
};

/**
 * Functional composition utility for building request pipeline
 * Applies a series of transformation functions from left to right
 *
 * @param value - Initial value
 * @param fns - Transformation functions to apply in sequence
 * @returns Final transformed value
 *
 * @example
 * ```typescript
 * const result = pipe(
 *   initialRequest,
 *   addHeaders,
 *   addAuth,
 *   addTenantId
 * );
 * ```
 */
function pipe<T>(value: T): T;
function pipe<T, A>(value: T, fn1: (input: T) => A): A;
function pipe<T, A, B>(value: T, fn1: (input: T) => A, fn2: (input: A) => B): B;
function pipe<T, A, B, C>(
  value: T,
  fn1: (input: T) => A,
  fn2: (input: A) => B,
  fn3: (input: B) => C
): C;
function pipe<T, A, B, C, D>(
  value: T,
  fn1: (input: T) => A,
  fn2: (input: A) => B,
  fn3: (input: B) => C,
  fn4: (input: C) => D
): D;
function pipe(value: unknown, ...fns: ((input: unknown) => unknown)[]): unknown {
  return fns.reduce((accumulator, fn) => fn(accumulator), value);
}

/**
 * Maps HTTP error responses to typed AppError instances
 * Determines error type based on HTTP status code
 *
 * @param response - HTTP response object
 * @param body - Parsed response body
 * @returns Typed AppError (AuthError, ValidationError, NetworkError, or BusinessLogicError)
 *
 * @internal
 */
const mapHttpError = (response: Response, body: Record<string, unknown>): AppError => {
  const message = typeof body.message === 'string' ? body.message : response.statusText;
  const code = typeof body.code === 'string' ? body.code : undefined;
  const details =
    typeof body.details === 'object' && body.details !== null
      ? (body.details as Record<string, unknown>)
      : undefined;

  if (response.status === 401 || response.status === 403) {
    return createAuthError(message || 'Authentication error', details, {
      code,
      statusCode: response.status,
    });
  }

  if (response.status === 400 || response.status === 422) {
    return createValidationError(message || 'Validation error', details, {
      code,
      statusCode: response.status,
    });
  }

  if (response.status >= 500) {
    return createNetworkError(message || 'Server error', details, {
      code,
      statusCode: response.status,
      retryable: true,
    });
  }

  return createBusinessLogicError(message || 'Request failed', details, {
    code,
    statusCode: response.status,
  });
};

const apiResultFromResponse = <T>(response: Response): ResultAsync<ApiResponse<T>, AppError> => {
  const contentType = response.headers.get('content-type') ?? '';

  if (!contentType.includes('application/json')) {
    return errAsync(
      createBusinessLogicError(
        'Expected JSON response from server',
        { contentType },
        {
          code: 'INVALID_CONTENT_TYPE',
          statusCode: response.status,
        }
      )
    );
  }

  return ResultAsync.fromPromise(
    response.clone().json() as Promise<Record<string, unknown>>,
    (error: unknown) =>
      createBusinessLogicError(
        'Failed to parse response body',
        {
          rawError: error instanceof Error ? { message: error.message } : undefined,
        },
        {
          code: 'JSON_PARSE_ERROR',
          statusCode: response.status,
        }
      )
  ).andThen(body => {
    const message = typeof body.message === 'string' ? body.message : undefined;
    const status = typeof body.status === 'string' ? body.status : undefined;

    // Extracted helper for determining success
    function isSuccess(
      response: Response,
      body: Record<string, unknown>,
      status?: string
    ): boolean {
      if (status === 'success') return true;
      if ('success' in body) {
        if (typeof body.success === 'boolean') return body.success;
        return response.ok;
      }
      return response.ok;
    }

    const success = isSuccess(response, body, status);

    if (response.ok && success) {
      const data = (body.data ?? body) as T;
      return okAsync(createSuccessResponse<T>(data, message));
    }

    if (response.ok && !success) {
      const error = createBusinessLogicError(
        message ?? 'Request failed',
        body.error != null && typeof body.error === 'object'
          ? (body.error as Record<string, unknown>)
          : undefined,
        {
          statusCode: response.status,
        }
      );
      return okAsync(createErrorResponse(error, message));
    }

    const error = mapHttpError(response, body);
    return errAsync(error);
  });
};

const retryWithBackoff = <T>(
  operation: () => ResultAsync<T, AppError>,
  config: RetryConfig,
  shouldRetry: (error: AppError, attempt: number) => boolean,
  scheduleDelay: (attempt: number) => ResultAsync<void, AppError>
): ResultAsync<T, AppError> => {
  const attemptOperation = (attempt: number): ResultAsync<T, AppError> =>
    operation().orElse(error =>
      shouldRetry(error, attempt)
        ? scheduleDelay(attempt).andThen(() => attemptOperation(attempt + 1))
        : errAsync(error)
    );

  return attemptOperation(1);
};

/**
 * Validates tenant API responses using Zod schemas
 */
const validateTenantResponse = <T>(data: unknown, schema: ZodType<T>): ResultAsync<T, AppError> => {
  const validation = schema.safeParse(data);

  if (validation.success) {
    return okAsync(validation.data);
  }

  return errAsync(
    createBusinessLogicError(
      'Invalid tenant response format',
      {
        validationErrors: validation.error.format(),
        receivedData: data,
      },
      {
        code: 'VALIDATION_ERROR',
      }
    )
  );
};

const handleSuccessResponse = <Raw, Parsed>(
  result: AsyncResult<ApiResponse<Raw>, AppError>,
  schema: ZodType<Parsed>
): AsyncResult<Parsed, AppError> =>
  result.andThen(response => {
    if (response.status === 'error') {
      return errAsync(response.error);
    }

    return liftResult(validateAndDecode<Parsed>(schema, response.data)).mapErr(
      validationError => validationError as AppError
    );
  });

const toAuthResponse = (payload: AuthResponseSchema): AuthResponse => {
  // Decode JWT to get user info
  const jwtResult = decodeJwtPayload(payload.access_token);

  if (jwtResult.isErr()) {
    throw new Error('Invalid JWT token received from server');
  }

  const jwtPayload = jwtResult.value;

  // Create user object from JWT
  const user: User = {
    id: asUserId(jwtPayload.user),
    email: jwtPayload.user,
    username: jwtPayload.user,
    roles: ['user'],
    tenantId: asTenantId(jwtPayload.tenant_id),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Default tenant settings
  const defaultSettings = {
    theme: 'light' as const,
    language: 'en',
    timezone: 'UTC',
    dateFormat: 'YYYY-MM-DD',
    features: [],
    branding: {
      primaryColor: '#000000',
      secondaryColor: '#ffffff',
      accentColor: '#000000',
    },
  };

  // Default tenant subscription
  const defaultSubscription = {
    plan: 'basic' as const,
    status: 'active' as const,
    limits: {
      users: 0,
      contacts: 0,
      storage: 0,
    },
  };

  // Create tenant object for auth (from auth.ts type)
  const tenant: AuthTenant = {
    id: asTenantId(jwtPayload.tenant_id),
    name: jwtPayload.tenant_id,
    settings: defaultSettings,
    subscription: defaultSubscription,
  };

  // Calculate expires in seconds
  const expiresIn = jwtPayload.exp - Math.floor(Date.now() / 1000);

  return {
    success: true,
    token: payload.access_token,
    refreshToken: payload.refresh_token,
    user,
    tenant,
    expiresIn,
  };
};

const transformApiResponse = <Raw, Domain>(
  result: AsyncResult<ApiResponse<Raw>, AppError>,
  transform: (value: Raw) => Result<Domain, AppError>
): AsyncResult<ApiResponse<Domain>, AppError> =>
  result.andThen(response => {
    if (response.status === 'error') {
      return okAsync(createErrorResponse(response.error, response.message));
    }

    return liftResult(transform(response.data)).map(domainData =>
      createSuccessResponse(domainData, response.message)
    );
  });

const toAuthError = (error: AppError): AuthError => {
  if (error.type === 'auth') {
    return error;
  }

  return createAuthError(
    error.message,
    {
      originalType: error.type,
      originalDetails: error.details,
    },
    {
      code: error.code,
      cause: error,
      statusCode: error.statusCode,
    }
  );
};

const _toBusinessError = (error: AppError): BusinessLogicError => {
  if (error.type === 'business') {
    return error;
  }

  return createBusinessLogicError(
    error.message,
    {
      originalType: error.type,
      originalDetails: error.details,
    },
    {
      code: error.code,
      cause: error,
      statusCode: error.statusCode,
    }
  );
};

const emptyObjectSchema = z.object({}).strict();

/**
 * HTTP Client class with timeout, retry, and circuit breaker support
 */
class HttpClient implements IHttpClient {
  private readonly baseURL: string;
  private readonly config: HttpClientConfig;
  private readonly circuitBreakerState: CircuitBreakerState;

  constructor(baseURL: string = API_BASE_URL, config: Partial<HttpClientConfig> = {}) {
    this.baseURL = baseURL;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.circuitBreakerState = {
      state: 'closed',
      failureCount: 0,
      lastFailureTime: 0,
    };
  }

  /**
   * Resets the circuit breaker state to closed
   * Useful for testing or manual recovery
   *
   * @internal Use with caution - primarily for testing
   */
  public resetCircuitBreaker(): void {
    this.circuitBreakerState.state = 'closed';
    this.circuitBreakerState.failureCount = 0;
    this.circuitBreakerState.lastFailureTime = 0;
  }

  /**
   * Storage format convention:
   * - 'auth_token': JSON object {token: string}
   * - 'tenant': JSON object {id: string, name: string, ...}
   * - 'user': JSON object {id: string, email: string, ...}
   */
  public safeGetToken(): string | null {
    const stored = localStorage.getItem('auth_token');
    if (stored == null || stored === '') return null;
    try {
      const data = JSON.parse(stored) as Record<string, unknown>;
      if (
        typeof data === 'object' &&
        data !== null &&
        'token' in data &&
        typeof data.token === 'string'
      ) {
        return data.token;
      }
    } catch {
      // Ignore parsing errors
    }
    return null;
  }

  private safeGetTenantId(): string | null {
    const stored = localStorage.getItem('tenant');
    if (stored == null || stored === '') return null;
    try {
      const data = JSON.parse(stored) as Record<string, unknown>;
      if (
        typeof data === 'object' &&
        data !== null &&
        'id' in data &&
        typeof data.id === 'string'
      ) {
        return data.id;
      }
    } catch {
      // Ignore parsing errors
    }
    return null;
  }

  private sleep(delay: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  private calculateBackoffDelay(attempt: number): number {
    const delay = this.config.retry.baseDelay * Math.pow(2, attempt - 1);
    return Math.min(delay, this.config.retry.maxDelay);
  }

  private evaluateCircuitBreaker(): Result<void, AppError> {
    if (this.circuitBreakerState.state === 'open') {
      const elapsed = Date.now() - this.circuitBreakerState.lastFailureTime;

      if (elapsed < this.config.circuitBreaker.resetTimeout) {
        return err(
          createNetworkError('Service is temporarily unavailable', undefined, {
            code: 'CIRCUIT_BREAKER_OPEN',
            retryable: true,
          })
        );
      }

      this.circuitBreakerState.state = 'half-open';
    }

    return ok(undefined);
  }

  private isRetryableError(error: AppError): boolean {
    if (typeof error.retryable === 'boolean') {
      return error.retryable;
    }

    if (error.type === 'network') {
      return true;
    }

    if (error.statusCode && error.statusCode >= 500) {
      return true;
    }

    return false;
  }

  private updateCircuitBreaker(success: boolean): void {
    if (success) {
      this.circuitBreakerState.failureCount = 0;
      this.circuitBreakerState.state = 'closed';
      return;
    }

    if (this.circuitBreakerState.state === 'half-open') {
      this.circuitBreakerState.state = 'open';
    } else {
      this.circuitBreakerState.failureCount += 1;
      this.circuitBreakerState.lastFailureTime = Date.now();

      if (this.circuitBreakerState.failureCount >= this.config.circuitBreaker.failureThreshold) {
        this.circuitBreakerState.state = 'open';
      }
    }
  }

  private updateCircuitBreakerWithResult<T>(result: ApiResponse<T>): void {
    this.updateCircuitBreaker(result.status === 'success');
  }

  private buildRequestInit(options: RequestInit): RequestInit {
    return pipe(options, this.withBaseHeaders, this.withTenantHeader, this.withAuthHeader);
  }

  private withBaseHeaders = (options: RequestInit): RequestInit => {
    const headers = new Headers(options.headers ?? {});
    headers.set('Content-Type', 'application/json');
    return { ...options, headers };
  };

  private withTenantHeader = (options: RequestInit): RequestInit => {
    const tenantId = this.safeGetTenantId();

    if (!tenantId) {
      return options;
    }

    const headers = new Headers(options.headers);
    headers.set('X-Tenant-ID', tenantId);
    return { ...options, headers };
  };

  private withAuthHeader = (options: RequestInit): RequestInit => {
    const authToken = this.safeGetToken();

    if (!authToken) {
      return options;
    }

    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${authToken}`);
    return { ...options, headers };
  };

  private executeFetch(url: string, options: RequestInit): ResultAsync<Response, AppError> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.config.timeout);

    return ResultAsync.fromPromise(
      fetch(url, { ...options, signal: controller.signal }),
      (error: unknown) => this.createFetchError(error)
    )
      .map(response => {
        clearTimeout(timeoutId);
        return response;
      })
      .mapErr(error => {
        clearTimeout(timeoutId);
        return error;
      });
  }

  private createFetchError(error: unknown): AppError {
    const isAbortError = error instanceof DOMException && error.name === 'AbortError';
    const message = isAbortError
      ? 'Request timed out'
      : 'Network error: Unable to reach the server';

    return createNetworkError(message, undefined, {
      code: isAbortError ? 'TIMEOUT' : 'NETWORK_ERROR',
      retryable: true,
      cause: error,
    });
  }

  private scheduleDelay(attempt: number): ResultAsync<void, AppError> {
    const delay = this.calculateBackoffDelay(attempt);
    return ResultAsync.fromPromise(this.sleep(delay), () =>
      createNetworkError('Failed to schedule retry delay', undefined, {
        code: 'RETRY_DELAY_FAILURE',
        retryable: true,
      })
    );
  }

  private request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): AsyncResult<ApiResponse<T>, AppError> {
    const circuitResult = this.evaluateCircuitBreaker();
    if (circuitResult.isErr()) {
      return errAsync(circuitResult.error);
    }

    const url = `${this.baseURL}${endpoint}`;
    const requestInit = this.buildRequestInit(options);

    const operation = (): ResultAsync<ApiResponse<T>, AppError> =>
      this.executeFetch(url, requestInit).andThen(response => apiResultFromResponse<T>(response));

    return retryWithBackoff(
      operation,
      this.config.retry,
      (error, attempt) => this.isRetryableError(error) && attempt < this.config.retry.maxAttempts,
      attempt => this.scheduleDelay(attempt)
    )
      .map(result => {
        this.updateCircuitBreakerWithResult(result);
        return result;
      })
      .mapErr(error => {
        this.updateCircuitBreaker(false);
        return error;
      });
  }

  // HTTP methods
  get<T>(endpoint: string): AsyncResult<ApiResponse<T>, AppError> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  post<T>(endpoint: string, data?: unknown): AsyncResult<ApiResponse<T>, AppError> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  put<T>(endpoint: string, data?: unknown): AsyncResult<ApiResponse<T>, AppError> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  delete<T>(endpoint: string): AsyncResult<ApiResponse<T>, AppError> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

/**
 * Shared HTTP client instance for all API requests
 * Includes automatic authentication, tenant context, and fault tolerance
 */
const apiClient: IHttpClient = new HttpClient();

/**
 * Authentication Service
 *
 * Provides methods for user authentication with automatic JWT handling
 * and tenant context management.
 *
 * @example
 * ```typescript
 * // Login with credentials
 * const result = await authService.login({
 *   usernameOrEmail: 'user@example.com',
 *   password: 'securePassword123',
 *   tenantId: 'tenant1',
 *   rememberMe: true
 * });
 *
 * result.match(
 *   (auth) => {
 *     // Success: auth.token, auth.user, auth.tenant
 *     localStorage.setItem('auth_token', JSON.stringify({ token: auth.token }));
 *   },
 *   (error) => {
 *     // Error: display error.message
 *     console.error(error.message);
 *   }
 * );
 * ```
 */
export const authService = {
  /**
   * Authenticates user with provided credentials
   *
   * @param credentials - User login credentials (username/email, password, tenantId)
   * @returns AsyncResult resolving to AuthResponse with JWT token and user/tenant data
   *
   * @example
   * ```typescript
   * const auth = await authService.login({
   *   usernameOrEmail: 'user@example.com',
   *   password: 'password123',
   *   tenantId: 'tenant1'
   * });
   * ```
   */
  login(credentials: LoginCredentials, client?: IHttpClient): AsyncResult<AuthResponse, AuthError> {
    const httpClient = client || apiClient;

    const validation = validateAndDecode<LoginRequestSchema>(loginRequestSchema, {
      usernameOrEmail: credentials.usernameOrEmail,
      password: credentials.password,
      tenantId: credentials.tenantId,
      rememberMe: credentials.rememberMe,
    });

    return liftResult(validation)
      .map(validated => ({
        username_or_email: validated.usernameOrEmail,
        password: validated.password,
        tenant_id: validated.tenantId,
      }))
      .andThen(body =>
        handleSuccessResponse<AuthResponse, AuthResponseSchema>(
          httpClient.post<AuthResponse>('/auth/login', body),
          authResponseSchema
        )
      )
      .map(toAuthResponse)
      .mapErr(toAuthError);
  },

  /**
   * Logs out the current user and invalidates the session
   * This operation is idempotent - succeeds even if not authenticated
   *
   * @returns AsyncResult<void, AuthError> - Success with no data, or auth error
   *
   * @example
   * ```typescript
   * const result = await authService.logout();
   * result.match(
   *   () => {
   *     localStorage.removeItem('auth_token');
   *     navigate('/login');
   *   },
   *   (error) => console.error('Logout failed:', error)
   * );
   * ```
   */
  logout(): AsyncResult<void, AuthError> {
    // Check if there's a valid authentication token using safe token validation
    const authToken = apiClient.safeGetToken();

    // If no valid token exists, logout is already complete (idempotent)
    if (!authToken) {
      return okAsync(undefined);
    }

    return handleSuccessResponse(
      apiClient.post<Record<string, unknown>>('/auth/logout'),
      emptyObjectSchema
    )
      .map(() => undefined)
      .mapErr(toAuthError);
  },

  /**
   * Refreshes the current JWT token using the refresh token
   *
   * @returns AsyncResult<AuthResponse, AuthError> - New auth data with refreshed tokens
   *
   * @example
   * ```typescript
   * const result = await authService.refreshToken();
   * result.match(
   *   (auth) => localStorage.setItem('auth_token', JSON.stringify({ token: auth.token })),
   *   (error) => {
   *     // Token refresh failed, redirect to login
   *     localStorage.clear();
   *     navigate('/login');
   *   }
   * );
   * ```
   */
  refreshToken(): AsyncResult<AuthResponse, AuthError> {
    return handleSuccessResponse<AuthResponse, AuthResponseSchema>(
      apiClient.post<AuthResponse>('/auth/refresh'),
      authResponseSchema
    )
      .map(toAuthResponse)
      .mapErr(toAuthError);
  },
};

/**
 * Health Check Service
 *
 * Provides endpoints for checking API availability and health status
 */
export const healthService = {
  /**
   * Performs comprehensive health check of the API
   * @returns API response with health status details
   */
  check(): AsyncResult<ApiResponse<Record<string, unknown>>, AppError> {
    return apiClient.get<Record<string, unknown>>('/health');
  },

  /**
   * Performs a simple ping to verify API availability
   * @returns API response with ping status
   */
  ping(): AsyncResult<ApiResponse<Record<string, unknown>>, AppError> {
    return apiClient.get<Record<string, unknown>>('/ping');
  },
};

/**
 * Tenant Filter Interface
 *
 * Defines filtering parameters for tenant queries with pagination and cursor support
 */
export interface TenantFilter {
  /** Array of filter conditions to apply */
  filters: {
    /** Field name to filter on */
    field: string;
    /** Comparison operator (eq, ne, gt, lt, like, etc.) */
    operator: string;
    /** Value to compare against */
    value: string;
  }[];
  /** Cursor for pagination */
  cursor?: number;
  /** Number of results per page */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Tenant Management Service
 *
 * Provides CRUD operations for managing tenants in a multi-tenant system.
 * Requires admin privileges for all operations.
 *
 * @example
 * ```typescript
 * // Get all tenants with pagination
 * const result = await tenantService.getAllWithPagination({ offset: 0, limit: 20 });
 *
 * result.match(
 *   (response) => {
 *     if (response.status === 'success') {
 *       console.log('Tenants:', response.data.tenants);
 *       console.log('Total:', response.data.total);
 *     }
 *   },
 *   (error) => console.error(error)
 * );
 * ```
 */
export const tenantService = {
  /**
   * Retrieves all tenants (without pagination)
   * @returns List of all tenants
   */
  getAll(): AsyncResult<ApiResponse<Tenant[]>, AppError> {
    return apiClient.get<Tenant[]>('/admin/tenants');
  },

  /**
   * Retrieves tenants with pagination support
   *
   * @param params - Pagination parameters (offset and limit)
   * @returns Paginated tenant response with total count
   *
   * @example
   * ```typescript
   * const tenants = await tenantService.getAllWithPagination({ offset: 0, limit: 10 });
   * ```
   */
  getAllWithPagination(params?: {
    offset?: number;
    limit?: number;
  }): AsyncResult<ApiResponse<PaginatedTenantResponse>, AppError> {
    const queryParams = new URLSearchParams();
    if (params?.offset !== undefined) queryParams.set('offset', params.offset.toString());
    if (params?.limit !== undefined) queryParams.set('limit', params.limit.toString());

    const query = queryParams.toString();
    return apiClient
      .get<PaginatedTenantResponse>(query ? `/admin/tenants?${query}` : '/admin/tenants')
      .andThen(response => {
        if (response.status === 'success') {
          return validateTenantResponse(response.data, paginatedTenantResponseSchema).map(
            validatedData => createSuccessResponse(validatedData)
          );
        }
        return okAsync(response);
      });
  },

  /**
   * Filters tenants by specified criteria
   *
   * @param params - Filter parameters (filters array, pagination options)
   * @returns Filtered tenant response with pagination metadata
   *
   * @example
   * ```typescript
   * const active = await tenantService.filter({
   *   filters: [{ field: 'status', operator: 'eq', value: 'active' }],
   *   limit: 20
   * });
   * ```
   */
  filter(
    params: TenantFilter
  ): AsyncResult<ApiResponse<PaginatedTenantResponse | Tenant[]>, AppError> {
    const queryObj: Record<string, unknown> = {
      filters: params.filters,
    };

    if (params.cursor !== undefined) {
      queryObj.cursor = params.cursor;
    }
    if (params.limit !== undefined) {
      queryObj.page_size = params.limit;
    }
    if (params.offset !== undefined) {
      queryObj.offset = params.offset;
    }

    const queryString = qs.stringify(queryObj, { arrayFormat: 'indices' });
    return apiClient
      .get<PaginatedTenantResponse | Tenant[]>(`/admin/tenants/filter?${queryString}`)
      .andThen(response => {
        if (response.status === 'success') {
          // For filter results, we need to check if it's a paginated response or array
          if (Array.isArray(response.data)) {
            // It's a Tenant[] array, return as-is
            return okAsync(response);
          } else {
            // It's a PaginatedTenantResponse, validate it
            return validateTenantResponse(response.data, paginatedTenantResponseSchema).map(
              validatedData => createSuccessResponse(validatedData)
            );
          }
        }
        return okAsync(response);
      });
  },

  /**
   * Retrieves a single tenant by ID
   *
   * @param id - Tenant ID
   * @returns Tenant details
   */
  getById(id: string): AsyncResult<ApiResponse<Tenant>, AppError> {
    return apiClient.get<Tenant>(`/admin/tenants/${id}`);
  },

  /**
   * Creates a new tenant
   *
   * @param data - Tenant creation data (name, db_url, settings, etc.)
   * @returns Newly created tenant
   *
   * @example
   * ```typescript
   * const tenant = await tenantService.create({
   *   name: 'New Company',
   *   db_url: 'postgresql://localhost/tenant_db'
   * });
   * ```
   */
  create(data: CreateTenantDTO): AsyncResult<ApiResponse<Tenant>, AppError> {
    return apiClient.post<Tenant>('/admin/tenants', data);
  },

  /**
   * Updates an existing tenant
   *
   * @param id - Tenant ID to update
   * @param data - Updated tenant data
   * @returns Updated tenant
   */
  update(id: string, data: UpdateTenantDTO): AsyncResult<ApiResponse<Tenant>, AppError> {
    return apiClient.put<Tenant>(`/admin/tenants/${id}`, data);
  },

  /**
   * Deletes a tenant
   *
   * @param id - Tenant ID to delete
   * @returns Success confirmation
   *
   * @example
   * ```typescript
   * const result = await tenantService.delete('tenant-123');
   * result.match(
   *   () => console.log('Tenant deleted'),
   *   (error) => console.error('Delete failed:', error)
   * );
   * ```
   */
  delete(id: string): AsyncResult<ApiResponse<Record<string, unknown>>, AppError> {
    return apiClient.delete<Record<string, unknown>>(`/admin/tenants/${id}`);
  },
};

/**
 * Address Book / Contact Management Service
 *
 * Provides CRUD operations for managing contacts within a tenant's address book.
 * All operations are automatically scoped to the current tenant via X-Tenant-ID header.
 *
 * @example
 * ```typescript
 * // Get contacts with search, pagination, and sorting
 * const result = await addressBookService.getAll({
 *   page: 1,
 *   limit: 20,
 *   search: 'john',
 *   sort: 'name,asc'
 * });
 *
 * result.match(
 *   (response) => {
 *     if (response.status === 'success') {
 *       console.log('Contacts:', response.data.contacts);
 *       console.log('Total:', response.data.total);
 *     }
 *   },
 *   (error) => console.error(error)
 * );
 * ```
 */
export const addressBookService = {
  /**
   * Retrieves all contacts with optional pagination, search, and sorting
   *
   * @param params - Query parameters (page, limit, search, sort)
   * @returns Contact list response with pagination metadata
   *
   * @example
   * ```typescript
   * const contacts = await addressBookService.getAll({
   *   page: 1,
   *   limit: 10,
   *   search: 'doe',
   *   sort: 'name,asc'
   * });
   * ```
   */
  getAll(params?: {
    page?: number;
    limit?: number;
    search?: string;
    sort?: string;
  }): AsyncResult<ApiResponse<ContactListResponse>, AppError> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.search) queryParams.set('search', params.search);
    if (params?.sort) queryParams.set('sort', params.sort);

    const query = queryParams.toString();
    return transformApiResponse(
      apiClient.get<unknown>(query ? `/address-book?${query}` : '/address-book'),
      contactListFromApiResponse
    );
  },

  /**
   * Creates a new contact in the address book
   *
   * @param data - Contact data (name, email, phone, address, age, gender)
   * @returns Newly created contact
   *
   * @example
   * ```typescript
   * const contact = await addressBookService.create({
   *   name: 'John Doe',
   *   email: 'john@example.com',
   *   phone: '+1234567890',
   *   address: '123 Main St',
   *   age: 30,
   *   gender: true // true = male, false = female
   * });
   * ```
   */
  create(data: {
    name: string;
    email: string;
    gender?: PersonGender;
    age: number;
    address: string;
    phone: string;
  }): AsyncResult<ApiResponse<Contact>, AppError> {
    return transformApiResponse(apiClient.post<unknown>('/address-book', data), mapContact.fromApi);
  },

  /**
   * Updates an existing contact
   *
   * @param id - Contact ID to update
   * @param data - Updated contact data
   * @returns Updated contact
   *
   * @example
   * ```typescript
   * const updated = await addressBookService.update('contact-123', {
   *   name: 'Jane Doe',
   *   email: 'jane@example.com',
   *   phone: '+1234567890',
   *   address: '456 Oak Ave',
   *   age: 28
   * });
   * ```
   */
  update(
    id: string,
    data: {
      name: string;
      email: string;
      gender?: PersonGender;
      age: number;
      address: string;
      phone: string;
    }
  ): AsyncResult<ApiResponse<Contact>, AppError> {
    return transformApiResponse(
      apiClient.put<unknown>(`/address-book/${id}`, data),
      mapContact.fromApi
    );
  },

  /**
   * Deletes a contact from the address book
   *
   * @param id - Contact ID to delete
   * @returns Success confirmation
   *
   * @example
   * ```typescript
   * const result = await addressBookService.delete('contact-123');
   * result.match(
   *   () => console.log('Contact deleted successfully'),
   *   (error) => console.error('Failed to delete:', error)
   * );
   * ```
   */
  delete(id: string): AsyncResult<ApiResponse<Record<string, unknown>>, AppError> {
    return apiClient.delete<Record<string, unknown>>(`/address-book/${id}`);
  },
};

/**
 * Export configuration and utilities
 */
export { DEFAULT_CONFIG };
export type { HttpClientConfig as ApiConfig };

/**
 * Creates a custom HTTP client instance with optional configuration overrides
 *
 * @param config - Partial configuration to override defaults
 * @returns IHttpClient instance with custom configuration
 *
 * @example
 * ```typescript
 * // Create client with custom timeout
 * const fastClient = createHttpClient({
 *   timeout: 5000,
 *   retry: { maxAttempts: 2, baseDelay: 500, maxDelay: 5000 }
 * });
 *
 * const result = await fastClient.get('/api/data');
 * ```
 */
export function createHttpClient(config?: Partial<HttpClientConfig>): IHttpClient {
  return new HttpClient(API_BASE_URL, config);
}

/**
 * Resets the circuit breaker state of the default API client
 *
 * @internal Primarily for testing purposes
 *
 * @example
 * ```typescript
 * // In test setup
 * beforeEach(() => {
 *   resetApiClientCircuitBreaker();
 * });
 * ```
 */
export function resetApiClientCircuitBreaker(): void {
  if (apiClient instanceof HttpClient) {
    apiClient.resetCircuitBreaker();
  }
}

/**
 * Default API client instance
 * Implements IHttpClient interface with full authentication and fault tolerance
 */
export default apiClient;
