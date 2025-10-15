import qs from 'qs';
import { ResultAsync, err, errAsync, ok, okAsync } from 'neverthrow';
import { z } from 'zod';
import type { ZodSchema } from 'zod';
import { getEnv } from '../config/env';
import type { AuthResponse, LoginCredentials, User, Tenant } from '../types/auth';
import type { ContactListResponse, Contact } from '../types/contact';
import type { CreateTenantDTO, PaginatedTenantResponse, UpdateTenantDTO } from '../types/tenant';
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

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
}

export interface HttpClientConfig {
  timeout: number;
  retry: RetryConfig;
  circuitBreaker: {
    failureThreshold: number;
    resetTimeout: number;
  };
}

export interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailureTime: number;
}

export interface IHttpClient {
  get<T>(endpoint: string): AsyncResult<ApiResponse<T>, AppError>;
  post<T>(endpoint: string, data?: unknown): AsyncResult<ApiResponse<T>, AppError>;
  put<T>(endpoint: string, data?: unknown): AsyncResult<ApiResponse<T>, AppError>;
  delete<T>(endpoint: string): AsyncResult<ApiResponse<T>, AppError>;
}

const API_BASE_URL = getEnv().apiUrl;

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

function pipe<T>(value: T): T;
function pipe<T, A>(value: T, fn1: (input: T) => A): A;
function pipe<T, A, B>(value: T, fn1: (input: T) => A, fn2: (input: A) => B): B;
function pipe<T, A, B, C>(
  value: T,
  fn1: (input: T) => A,
  fn2: (input: A) => B,
  fn3: (input: B) => C,
): C;
function pipe<T, A, B, C, D>(
  value: T,
  fn1: (input: T) => A,
  fn2: (input: A) => B,
  fn3: (input: B) => C,
  fn4: (input: C) => D,
): D;
function pipe(value: unknown, ...fns: Array<(input: unknown) => unknown>): unknown {
  return fns.reduce((accumulator, fn) => fn(accumulator), value);
}

const mapHttpError = (response: Response, body: Record<string, unknown>): AppError => {
  const message = typeof body.message === 'string' ? body.message : response.statusText;
  const code = typeof body.code === 'string' ? body.code : undefined;
  const details = typeof body.details === 'object' && body.details !== null
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
      createBusinessLogicError('Expected JSON response from server', { contentType }, {
        code: 'INVALID_CONTENT_TYPE',
        statusCode: response.status,
      }),
    );
  }

  return ResultAsync.fromPromise(
    response
      .clone()
      .json() as Promise<Record<string, unknown>>,
    (error: unknown) =>
      createBusinessLogicError('Failed to parse response body', {
        rawError: error instanceof Error ? { message: error.message } : undefined,
      }, {
        code: 'JSON_PARSE_ERROR',
        statusCode: response.status,
      }),
  ).andThen(body => {
    const message = typeof body.message === 'string' ? body.message : undefined;
    const success = 'success' in body ? Boolean(body.success) : response.ok;

    if (response.ok && success) {
      const data = (body.data ?? body) as T;
      return okAsync(createSuccessResponse<T>(data, message));
    }

    if (response.ok && !success) {
      const error = createBusinessLogicError(message ?? 'Request failed', body.error && typeof body.error === 'object'
        ? (body.error as Record<string, unknown>)
        : undefined, {
        statusCode: response.status,
      });
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
  scheduleDelay: (attempt: number) => ResultAsync<void, AppError>,
): ResultAsync<T, AppError> => {
  const attemptOperation = (attempt: number): ResultAsync<T, AppError> =>
    operation().orElse(error =>
      shouldRetry(error, attempt)
        ? scheduleDelay(attempt).andThen(() => attemptOperation(attempt + 1))
        : errAsync(error),
    );

  return attemptOperation(1);
};

const handleSuccessResponse = <Raw, Parsed>(
  result: AsyncResult<ApiResponse<Raw>, AppError>,
  schema: ZodSchema<Parsed>,
): AsyncResult<Parsed, AppError> =>
  result.andThen(response => {
    if (response.status === 'error') {
      return errAsync(response.error);
    }

    return liftResult(validateAndDecode<Parsed>(schema, response.data)).mapErr(
      validationError => validationError as AppError,
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
  
  // Create tenant object
  const tenant: Tenant = {
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
  transform: (value: Raw) => Result<Domain, AppError>,
): AsyncResult<ApiResponse<Domain>, AppError> =>
  result.andThen(response => {
    if (response.status === 'error') {
      return okAsync(createErrorResponse(response.error, response.message));
    }

    return liftResult(transform(response.data)).map(domainData =>
      createSuccessResponse(domainData, response.message),
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
    },
  );
};

const toBusinessError = (error: AppError): BusinessLogicError => {
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
    },
  );
};

const emptyObjectSchema = z.object({}).passthrough();
//// HTTP Client class with timeout, retry, and circuit breaker support
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
   * Storage format convention:
   * - 'auth_token': JSON object {token: string}
   * - 'tenant': JSON object {id: string, name: string, ...}
   * - 'user': JSON object {id: string, email: string, ...}
   */
  private safeGetToken(): string | null {
    const stored = localStorage.getItem('auth_token');
    if (!stored) return null;
    try {
      const data = JSON.parse(stored);
      if (typeof data === 'object' && data !== null && 'token' in data && typeof data.token === 'string') {
        return data.token;
      }
    } catch {}
    return null;
  }

  private safeGetTenantId(): string | null {
    const stored = localStorage.getItem('tenant');
    if (!stored) return null;
    try {
      const data = JSON.parse(stored);
      if (typeof data === 'object' && data !== null && 'id' in data && typeof data.id === 'string') {
        return data.id;
      }
    } catch {}
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
          }),
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
    const timeoutId = window.setTimeout(() => controller.abort(), this.config.timeout);

    return ResultAsync.fromPromise(
      fetch(url, { ...options, signal: controller.signal }),
      (error: unknown) => this.createFetchError(error),
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
    const message = isAbortError ? 'Request timed out' : 'Network error: Unable to reach the server';

    return createNetworkError(message, undefined, {
      code: isAbortError ? 'TIMEOUT' : 'NETWORK_ERROR',
      retryable: true,
      cause: error,
    });
  }

  private scheduleDelay(attempt: number): ResultAsync<void, AppError> {
    const delay = this.calculateBackoffDelay(attempt);
    return ResultAsync.fromPromise(
      this.sleep(delay),
      () =>
        createNetworkError('Failed to schedule retry delay', undefined, {
          code: 'RETRY_DELAY_FAILURE',
          retryable: true,
        }),
    );
  }

  private request<T>(endpoint: string, options: RequestInit = {}): AsyncResult<ApiResponse<T>, AppError> {
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
      attempt => this.scheduleDelay(attempt),
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

// Create HTTP client instance
const apiClient: IHttpClient = new HttpClient();

// API Services
export const authService = {
  login(credentials: LoginCredentials): AsyncResult<AuthResponse, AuthError> {
    const validation = validateAndDecode<LoginRequestSchema>(loginRequestSchema, {
      usernameOrEmail: credentials.usernameOrEmail,
      password: credentials.password,
      tenantId: credentials.tenantId ? String(credentials.tenantId) : undefined,
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
          apiClient.post<AuthResponse>('/auth/login', body),
          authResponseSchema,
        ),
      )
      .map(toAuthResponse)
      .mapErr(toAuthError);
  },

  logout(): AsyncResult<void, AuthError> {
    return handleSuccessResponse(apiClient.post<Record<string, unknown>>('/auth/logout'), emptyObjectSchema)
      .map(() => undefined)
      .mapErr(toAuthError);
  },

  refreshToken(): AsyncResult<AuthResponse, AuthError> {
    return handleSuccessResponse<AuthResponse, AuthResponseSchema>(
      apiClient.post<AuthResponse>('/auth/refresh'),
      authResponseSchema,
    )
      .map(toAuthResponse)
      .mapErr(toAuthError);
  },
};

export const healthService = {
  check(): AsyncResult<ApiResponse<Record<string, unknown>>, AppError> {
    return apiClient.get<Record<string, unknown>>('/health');
  },

  ping(): AsyncResult<ApiResponse<Record<string, unknown>>, AppError> {
    return apiClient.get<Record<string, unknown>>('/ping');
  },
};

export interface TenantFilter {
  filters: Array<{
    field: string;
    operator: string;
    value: string;
  }>;
  cursor?: number;
  page_size?: number;
}

export const tenantService = {
  getAll(): AsyncResult<ApiResponse<Tenant[]>, AppError> {
    return apiClient.get<Tenant[]>('/admin/tenants');
  },

  getAllWithPagination(params?: { offset?: number; limit?: number }): AsyncResult<ApiResponse<PaginatedTenantResponse>, AppError> {
    const queryParams = new URLSearchParams();
    if (params?.offset !== undefined) queryParams.set('offset', params.offset.toString());
    if (params?.limit !== undefined) queryParams.set('limit', params.limit.toString());

    const query = queryParams.toString();
    return apiClient.get<PaginatedTenantResponse>(query ? `/admin/tenants?${query}` : '/admin/tenants');
  },

  filter(params: TenantFilter): AsyncResult<ApiResponse<PaginatedTenantResponse | Tenant[]>, AppError> {
    const queryObj: Record<string, unknown> = {
      filters: params.filters,
    };

    if (params.cursor !== undefined) {
      queryObj.cursor = params.cursor;
    }
    if (params.page_size !== undefined) {
      queryObj.page_size = params.page_size;
    }

    const queryString = qs.stringify(queryObj, { arrayFormat: 'indices' });
    return apiClient.get<PaginatedTenantResponse | Tenant[]>(`/admin/tenants/filter?${queryString}`);
  },

  getById(id: string): AsyncResult<ApiResponse<Tenant>, AppError> {
    return apiClient.get<Tenant>(`/admin/tenants/${id}`);
  },

  create(data: CreateTenantDTO): AsyncResult<ApiResponse<Tenant>, AppError> {
    return apiClient.post<Tenant>('/admin/tenants', data);
  },

  update(id: string, data: UpdateTenantDTO): AsyncResult<ApiResponse<Tenant>, AppError> {
    return apiClient.put<Tenant>(`/admin/tenants/${id}`, data);
  },

  delete(id: string): AsyncResult<ApiResponse<Record<string, unknown>>, AppError> {
    return apiClient.delete<Record<string, unknown>>(`/admin/tenants/${id}`);
  },
};

export const addressBookService = {
  getAll(params?: { page?: number; limit?: number; search?: string }): AsyncResult<ApiResponse<ContactListResponse>, AppError> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.search) queryParams.set('search', params.search);

    const query = queryParams.toString();
    return transformApiResponse(
      apiClient.get<unknown>(query ? `/address-book?${query}` : '/address-book'),
      contactListFromApiResponse,
    );
  },

  create(data: {
    name: string;
    email: string;
    gender?: boolean;
    age: number;
    address: string;
    phone: string;
  }): AsyncResult<ApiResponse<Contact>, AppError> {
    return transformApiResponse(
      apiClient.post<unknown>('/address-book', data),
      mapContact.fromApi,
    );
  },

  update(id: string, data: {
    name: string;
    email: string;
    gender?: boolean;
    age: number;
    address: string;
    phone: string;
  }): AsyncResult<ApiResponse<Contact>, AppError> {
    return transformApiResponse(
      apiClient.put<unknown>(`/address-book/${id}`, data),
      mapContact.fromApi,
    );
  },

  delete(id: string): AsyncResult<ApiResponse<Record<string, unknown>>, AppError> {
    return apiClient.delete<Record<string, unknown>>(`/address-book/${id}`);
  },
};

// Export configuration and utilities
export { DEFAULT_CONFIG };
export type { HttpClientConfig as ApiConfig };

// Create custom HTTP client instance with custom configuration
export function createHttpClient(config?: Partial<HttpClientConfig>): IHttpClient {
  return new HttpClient(API_BASE_URL, config);
}

// Export default client (implements IHttpClient interface)
export default apiClient;
