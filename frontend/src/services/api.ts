import qs from 'qs';
import { ResultAsync, err, errAsync, ok, okAsync } from 'neverthrow';
import { getEnv } from '../config/env';
import type {
  AuthResponse,
  User,
  LoginCredentials,
  RegisterData,
} from '../types/auth';
import type {
  UpdateContactRequest,
  ContactListParams,
  ContactListResponse,
  Contact,
  ContactTag,
  BulkContactOperation,
  ContactImportRequest,
} from '../types/contact';
import { Gender } from '../types/contact';
import type { CreateTenantDTO, PaginatedTenantResponse, Tenant, UpdateTenantDTO } from '../types/tenant';
import type { ApiResponse } from '../types/api';
import { createErrorResponse, createSuccessResponse } from '../types/api';
import type { AppError } from '../types/errors';
import {
  createAuthError,
  createBusinessLogicError,
  createNetworkError,
  createValidationError,
} from '../types/errors';
import type { Result } from '../types/fp';

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number; // in milliseconds
  maxDelay: number; // in milliseconds
}

export interface HttpClientConfig {
  timeout: number; // in milliseconds
  retry: RetryConfig;
  circuitBreaker: {
    failureThreshold: number;
    resetTimeout: number; // in milliseconds
  };
}

export interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailureTime: number;
}

export interface IHttpClient {
  get<T>(endpoint: string): Promise<Result<ApiResponse<T>, AppError>>;
  post<T>(endpoint: string, data?: unknown): Promise<Result<ApiResponse<T>, AppError>>;
  put<T>(endpoint: string, data?: unknown): Promise<Result<ApiResponse<T>, AppError>>;
  delete<T>(endpoint: string): Promise<Result<ApiResponse<T>, AppError>>;
}

// Base API configuration
const API_BASE_URL = getEnv().apiUrl;

// Default configuration
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

const pipe = <T>(value: T, ...fns: Array<(input: T) => T>): T =>
  fns.reduce((accumulator, fn) => fn(accumulator), value);

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

  private request<T>(endpoint: string, options: RequestInit = {}): Promise<Result<ApiResponse<T>, AppError>> {
    const circuitResult = this.evaluateCircuitBreaker();
    if (circuitResult.isErr()) {
      return Promise.resolve(err(circuitResult.error));
    }

    const url = `${this.baseURL}${endpoint}`;
    const requestInit = this.buildRequestInit(options);

    const operation = (): ResultAsync<ApiResponse<T>, AppError> =>
      this.executeFetch(url, requestInit).andThen(response => apiResultFromResponse<T>(response));

    return retryWithBackoff(operation, this.config.retry, (error, attempt) => this.isRetryableError(error) && attempt < this.config.retry.maxAttempts, attempt => this.scheduleDelay(attempt))
      .map(result => {
        this.updateCircuitBreakerWithResult(result);
        return result;
      })
      .mapErr(error => {
        this.updateCircuitBreaker(false);
        return error;
      })
      .match(
        value => ok<ApiResponse<T>, AppError>(value),
        error => err<ApiResponse<T>, AppError>(error),
      );
  }

  // HTTP methods
  async get<T>(endpoint: string): Promise<Result<ApiResponse<T>, AppError>> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, data?: unknown): Promise<Result<ApiResponse<T>, AppError>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(endpoint: string, data?: unknown): Promise<Result<ApiResponse<T>, AppError>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<Result<ApiResponse<T>, AppError>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

// Create HTTP client instance
const apiClient = new HttpClient();

// API Services
export const authService = {
  async login(credentials: LoginCredentials): Promise<Result<ApiResponse<AuthResponse>, AppError>> {
    const payload = {
      username_or_email: credentials.usernameOrEmail,
      password: credentials.password,
      tenant_id: credentials.tenantId,
    };
    return apiClient.post<AuthResponse>('/auth/login', payload);
  },

  async logout(): Promise<Result<ApiResponse<Record<string, unknown>>, AppError>> {
    return apiClient.post<Record<string, unknown>>('/auth/logout');
  },

  async refreshToken(): Promise<Result<ApiResponse<AuthResponse>, AppError>> {
    return apiClient.post<AuthResponse>('/auth/refresh');
  },
};

export const healthService = {
  async check(): Promise<Result<ApiResponse<Record<string, unknown>>, AppError>> {
    return apiClient.get<Record<string, unknown>>('/health');
  },

  async ping(): Promise<Result<ApiResponse<Record<string, unknown>>, AppError>> {
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
  async getAll(): Promise<Result<ApiResponse<Tenant[]>, AppError>> {
    return apiClient.get<Tenant[]>('/tenants');
  },

  async getAllWithPagination(params?: { offset?: number; limit?: number }): Promise<Result<ApiResponse<PaginatedTenantResponse>, AppError>> {
    const queryParams = new URLSearchParams();
    if (params?.offset !== undefined) queryParams.set('offset', params.offset.toString());
    if (params?.limit !== undefined) queryParams.set('limit', params.limit.toString());

    const query = queryParams.toString();
    return apiClient.get<PaginatedTenantResponse>(query ? `/tenants?${query}` : '/tenants');
  },

  async filter(params: TenantFilter): Promise<Result<ApiResponse<PaginatedTenantResponse | Tenant[]>, AppError>> {
    const queryObj: Record<string, any> = {
      filters: params.filters,
    };

    if (params.cursor !== undefined) {
      queryObj.cursor = params.cursor;
    }
    if (params.page_size !== undefined) {
      queryObj.page_size = params.page_size;
    }

    const queryString = qs.stringify(queryObj, { arrayFormat: 'indices' });
    return apiClient.get<PaginatedTenantResponse | Tenant[]>(`/tenants/filter?${queryString}`);
  },

  async getById(id: string) {
    return apiClient.get<Tenant>(`/tenants/${id}`);
  },

  async create(data: CreateTenantDTO) {
    return apiClient.post<Tenant>('/tenants', data);
  },

  async update(id: string, data: UpdateTenantDTO) {
    return apiClient.put<Tenant>(`/tenants/${id}`, data);
  },

  async delete(id: string) {
    return apiClient.delete<Record<string, unknown>>(`/tenants/${id}`);
  },
};

/**
 * Internal helper functions for address book API layer
 * These handle the conversion between frontend Gender enum and backend boolean encoding.
 *
 * BACKEND ENCODING CONVENTION (DO NOT CHANGE):
 * - Backend stores gender as boolean in the database
 * - true = male
 * - false = female
 *
 * These functions should ONLY be used at the API boundary when transforming
 * data between frontend (Gender enum) and backend (boolean) representations.
 * All frontend code should use the Gender enum from types/contact.ts.
 *
 * @internal
 */

/**
 * Converts frontend Gender enum to backend boolean representation.
 * @internal
 * @param gender - Gender enum value (Gender.male or Gender.female)
 * @returns boolean - true for male, false for female
 */
const _genderToBoolean = (gender: Gender): boolean => gender === Gender.male;

/**
 * Converts backend boolean gender to frontend Gender enum.
 * @internal
 * @param genderBool - boolean value from backend (true = male, false = female)
 * @returns Gender enum value
 */
const _booleanToGender = (genderBool: boolean): Gender => genderBool ? Gender.male : Gender.female;

/**
 * Export internal conversion helpers for use at API boundaries.
 * These should ONLY be used when transforming data between frontend and backend.
 * @internal
 */
export const genderConversion = {
  toBoolean: _genderToBoolean,
  fromBoolean: _booleanToGender,
} as const;

export const addressBookService = {
  async getAll(params?: { page?: number; limit?: number; search?: string }): Promise<Result<ApiResponse<ContactListResponse>, AppError>> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.search) queryParams.set('search', params.search);

    const query = queryParams.toString();
    return apiClient.get<ContactListResponse>(query ? `/address-book?${query}` : '/address-book');
  },

  async create(data: {
    name: string;
    email: string;
    gender: boolean;
    age: number;
    address: string;
    phone: string;
  }): Promise<Result<ApiResponse<Contact>, AppError>> {
    return apiClient.post<Contact>('/address-book', data);
  },

  async update(id: string, data: {
    name: string;
    email: string;
    gender: boolean;
    age: number;
    address: string;
    phone: string;
  }): Promise<Result<ApiResponse<Contact>, AppError>> {
    return apiClient.put<Contact>(`/address-book/${id}`, data);
  },

  async delete(id: string): Promise<Result<ApiResponse<Record<string, unknown>>, AppError>> {
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
export default apiClient as IHttpClient;
