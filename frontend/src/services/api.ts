import qs from 'qs';
import { getEnv } from '../config/env';
import type {
  AuthResponse,
  User,
  Tenant,
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
import type { CreateTenantDTO, UpdateTenantDTO } from '../types/tenant';

// API Response wrapper interface
export interface ApiResponseWrapper<T> {
  message: string;
  data: T;
  success: boolean;
  error?: string;
}

// API Service for Actix Web REST API integration
// This will be connected to the existing backend endpoints

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  type?: 'network' | 'timeout' | 'http' | 'other';
  statusCode?: number;
  retryable?: boolean;
}

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
  get<T>(endpoint: string): Promise<T>;
  post<T>(endpoint: string, data?: unknown): Promise<T>;
  put<T>(endpoint: string, data?: unknown): Promise<T>;
  delete<T>(endpoint: string): Promise<T>;
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

  private isRetryableError(error: ApiError | Error): boolean {
    // Check if it's an ApiError by checking for type property
    if ('type' in error && error.type) {
      const apiError = error;
      // Network errors, timeouts, and 5xx errors are retryable
      // 4xx errors are not retryable (client errors)
      return apiError.type === 'network' ||
             apiError.type === 'timeout' ||
             (apiError.statusCode !== undefined && apiError.statusCode >= 500);
    }
    return false;
  }

  private updateCircuitBreaker(success: boolean): void {
    if (success) {
      this.circuitBreakerState.failureCount = 0;
      this.circuitBreakerState.state = 'closed';
    } else {
      if (this.circuitBreakerState.state === 'half-open') {
        // Failure in half-open state: immediately go back to open
        this.circuitBreakerState.state = 'open';
      } else {
        // In closed state: increment failure count and check threshold
        this.circuitBreakerState.failureCount++;
        this.circuitBreakerState.lastFailureTime = Date.now();

        if (this.circuitBreakerState.failureCount >= this.config.circuitBreaker.failureThreshold) {
          this.circuitBreakerState.state = 'open';
        }
      }
    }
  }

  private shouldAttemptRequest(): boolean {
    if (this.circuitBreakerState.state === 'open') {
      const elapsed = Date.now() - this.circuitBreakerState.lastFailureTime;
      if (elapsed >= this.config.circuitBreaker.resetTimeout) {
        this.circuitBreakerState.state = 'half-open';
        return true;
      }
      return false;
    }
    return true;
  }

  private buildHeaders(options: RequestInit): Headers {
    // Add tenant header if available from localStorage
    const tenantId = this.safeGetTenantId();

    // Add authorization header if token exists
    const authToken = this.safeGetToken();

    const headers = new Headers({
      'Content-Type': 'application/json',
      ...options.headers,
    });

    if (tenantId) {
      headers.set('X-Tenant-ID', tenantId);
    }

    if (authToken) {
      headers.set('Authorization', `Bearer ${authToken}`);
    }

    return headers;
  }

  private async handleSuccessResponse(response: Response): Promise<unknown> {
    // Validate Content-Type before parsing JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      // Handle non-JSON response as error
      let responseText = '';
      try {
        responseText = await response.text();
      } catch {
        responseText = 'Unable to read response content';
      }

      this.updateCircuitBreaker(false);
      const apiError: ApiError = {
        code: 'INVALID_CONTENT_TYPE',
        message: `Expected JSON response but received: ${contentType || 'no content-type'}. Response: ${responseText.substring(0, 200)}`,
        type: 'other',
        statusCode: response.status,
      };
      throw apiError;
    }

    this.updateCircuitBreaker(true);
    return await response.json();
  }

  private async parseErrorData(response: Response): Promise<unknown> {
    if (response.headers.get('content-type')?.includes('application/json')) {
      try {
        return await response.clone().json();
      } catch {
        return { code: 'JSON_PARSE_ERROR', message: 'Failed to parse JSON error response' };
      }
    } else {
      // For non-JSON responses (HTML, plain text, etc.), read as text
      let errorText = '';
      try {
        errorText = await response.clone().text();
      } catch {
        errorText = 'Unable to read error response content';
      }

      return {
        code: 'HTTP_ERROR',
        message: `HTTP ${response.status}: ${response.statusText}${errorText ? `\nResponse: ${errorText.substring(0, 200)}` : ''}`,
      };
    }
  }

  private createHttpError(response: Response, errorData: unknown): ApiError {
    const errorDataObj = errorData as Record<string, unknown> & { code: string; message: string };
    const apiError: ApiError = {
      ...errorDataObj,
      type: 'http',
      statusCode: response.status,
      retryable: response.status >= 500,
    };
    return apiError;
  }

  private createFetchError(error: unknown): ApiError {
    const isAborted = error instanceof DOMException && error.name === 'AbortError';
    const apiError: ApiError = {
      code: isAborted ? 'TIMEOUT' : 'NETWORK_ERROR',
      message: isAborted ? 'Request timed out' : 'Network error: Unable to connect to the server',
      type: isAborted ? 'timeout' : 'network',
      retryable: true,
    };
    return apiError;
  }

  private shouldRetry(apiError: ApiError, attempt: number): boolean {
    return this.isRetryableError(apiError) && attempt < this.config.retry.maxAttempts;
  }

  private async makeRequest(
    url: string,
    options: RequestInit
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.config.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;

    // Check circuit breaker
    if (!this.shouldAttemptRequest()) {
      const apiError: ApiError = {
        code: 'CIRCUIT_BREAKER_OPEN',
        message: 'Service is temporarily unavailable',
        type: 'other',
        retryable: true,
      };
      throw apiError;
    }

    const headers = this.buildHeaders(options);
    let lastError: ApiError | Error | undefined;

    for (let attempt = 1; attempt <= this.config.retry.maxAttempts; attempt++) {
      try {
        const response = await this.makeRequest(url, { ...options, headers });

        if (response.ok) {
          return (this.handleSuccessResponse(response) as Promise<T>);
        }

        // Handle HTTP errors
        const errorData = await this.parseErrorData(response);
        const apiError = this.createHttpError(response, errorData);

        if (this.shouldRetry(apiError, attempt)) {
          lastError = apiError;
          await this.sleep(this.calculateBackoffDelay(attempt));
          continue;
        }

        this.updateCircuitBreaker(false);
        throw apiError;

      } catch (error) {
        const apiError = this.createFetchError(error);

        if (this.shouldRetry(apiError, attempt)) {
          lastError = apiError;
          await this.sleep(this.calculateBackoffDelay(attempt));
          continue;
        }

        this.updateCircuitBreaker(false);
        throw apiError;
      }
    }

    // This should never be reached, but just in case
    throw lastError || new Error('Request failed after all retries');
  }

  // HTTP methods
  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

// Create HTTP client instance
const apiClient = new HttpClient();

// API Services
export const authService = {
  async login(credentials: LoginCredentials): Promise<ApiResponseWrapper<AuthResponse>> {
    const payload = {
      username_or_email: credentials.usernameOrEmail,
      password: credentials.password,
      tenant_id: credentials.tenantId,
    };
    return apiClient.post<ApiResponseWrapper<AuthResponse>>('/auth/login', payload);
  },

  async logout(): Promise<ApiResponseWrapper<any>> {
    return apiClient.post<ApiResponseWrapper<any>>('/auth/logout');
  },

  async refreshToken(): Promise<ApiResponseWrapper<AuthResponse>> {
    return apiClient.post<ApiResponseWrapper<AuthResponse>>('/auth/refresh');
  },
};

export const healthService = {
  async check() {
    return apiClient.get('/health');
  },

  async ping() {
    return apiClient.get('/ping');
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
  async getAll() {
    return apiClient.get('/tenants');
  },

  async getAllWithPagination(params?: { offset?: number; limit?: number }) {
    const queryParams = new URLSearchParams();
    if (params?.offset !== undefined) queryParams.set('offset', params.offset.toString());
    if (params?.limit !== undefined) queryParams.set('limit', params.limit.toString());

    const query = queryParams.toString();
    return apiClient.get(query ? `/tenants?${query}` : '/tenants');
  },

  async filter(params: TenantFilter) {
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
    return apiClient.get(`/tenants/filter?${queryString}`);
  },

  async getById(id: string) {
    return apiClient.get(`/tenants/${id}`);
  },

  async create(data: CreateTenantDTO) {
    return apiClient.post('/tenants', data);
  },

  async update(id: string, data: UpdateTenantDTO) {
    return apiClient.put(`/tenants/${id}`, data);
  },

  async delete(id: string) {
    return apiClient.delete(`/tenants/${id}`);
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
  async getAll(params?: { page?: number; limit?: number; search?: string }) {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.search) queryParams.set('search', params.search);

    const query = queryParams.toString();
    return apiClient.get(query ? `/address-book?${query}` : '/address-book');
  },

  async create(data: {
    name: string;
    email: string;
    gender: boolean;
    age: number;
    address: string;
    phone: string;
  }) {
    return apiClient.post('/address-book', data);
  },

  async update(id: string, data: {
    name: string;
    email: string;
    gender: boolean;
    age: number;
    address: string;
    phone: string;
  }) {
    return apiClient.put(`/address-book/${id}`, data);
  },

  async delete(id: string) {
    return apiClient.delete(`/address-book/${id}`);
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
