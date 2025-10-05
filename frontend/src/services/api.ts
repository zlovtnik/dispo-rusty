export interface LoginCredentials {
  usernameOrEmail: string;
  password: string;
  tenantId: string;
  rememberMe?: boolean;
}

export interface AuthResponse {
  token?: string;
  // Add other fields as needed, e.g. user, tenant
}

export interface CreateTenantDTO {
  name: string;
  // Add other required fields
}

export interface UpdateTenantDTO {
  name?: string;
  // Add other optional fields
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
  details?: Record<string, any>;
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
  post<T>(endpoint: string, data?: any): Promise<T>;
  put<T>(endpoint: string, data?: any): Promise<T>;
  delete<T>(endpoint: string): Promise<T>;
}

// Base API configuration
const API_BASE_URL = ((import.meta as any).env?.API_URL as string) || 'http://localhost:8080/api';

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
  private baseURL: string;
  private config: HttpClientConfig;
  private circuitBreakerState: CircuitBreakerState;

  constructor(baseURL: string = API_BASE_URL, config: Partial<HttpClientConfig> = {}) {
    this.baseURL = baseURL;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.circuitBreakerState = {
      state: 'closed',
      failureCount: 0,
      lastFailureTime: 0,
    };
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
      const apiError = error as ApiError;
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
      this.circuitBreakerState.failureCount++;
      this.circuitBreakerState.lastFailureTime = Date.now();

      if (this.circuitBreakerState.failureCount >= this.config.circuitBreaker.failureThreshold) {
        this.circuitBreakerState.state = 'open';
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

    // Add tenant header if available
    // Note: Authentication now handled via httpOnly cookies automatically sent by browser
    const tenantId = (() => {
      try {
        const storedTenant = localStorage.getItem('tenant');
        return storedTenant ? JSON.parse(storedTenant).id : null;
      } catch {
        return null;
      }
    })();

    const headers = new Headers({
      'Content-Type': 'application/json',
      ...options.headers,
    });

    if (tenantId) {
      headers.set('X-Tenant-ID', tenantId);
    }

    let lastError: ApiError | Error | undefined;

    for (let attempt = 1; attempt <= this.config.retry.maxAttempts; attempt++) {
      try {
        const response = await this.makeRequest(url, {
          ...options,
          headers,
        });

        if (response.ok) {
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

        // Handle HTTP errors
        const errorContentType = response.headers.get('content-type');
        const errorData: ApiError = await (async () => {
          if (errorContentType && errorContentType.includes('application/json')) {
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
        })();

        const apiError: ApiError = {
          ...errorData,
          type: 'http',
          statusCode: response.status,
          retryable: response.status >= 500,
        };

        // If it's not retryable or we've exhausted retries, throw immediately
        if (!this.isRetryableError(apiError) || attempt === this.config.retry.maxAttempts) {
          this.updateCircuitBreaker(false);
          throw apiError;
        }

        lastError = apiError;

      } catch (error) {
        // Handle fetch errors (network or timeout)
        const isAborted = (error as any)?.name === 'AbortError';
        const isNetworkError = error instanceof TypeError;

        const apiError: ApiError = {
          code: isAborted ? 'TIMEOUT' : 'NETWORK_ERROR',
          message: isAborted ? 'Request timed out' : 'Network error: Unable to connect to the server',
          type: isAborted ? 'timeout' : 'network',
          retryable: true,
        };

        // If not retryable or exhausted retries, throw
        if (!this.isRetryableError(apiError) || attempt === this.config.retry.maxAttempts) {
          this.updateCircuitBreaker(false);
          throw apiError;
        }

        lastError = apiError;
      }

      // Wait before retrying (not on last attempt)
      if (attempt < this.config.retry.maxAttempts) {
        const delay = this.calculateBackoffDelay(attempt);
        await this.sleep(delay);
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
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    return apiClient.post<AuthResponse>('/auth/login', credentials);
  },

  async logout(): Promise<AuthResponse> {
    return apiClient.post<AuthResponse>('/auth/logout');
  },

  async refreshToken(): Promise<AuthResponse> {
    return apiClient.post<AuthResponse>('/auth/refresh');
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

export const tenantService = {
  async getAll() {
    return apiClient.get('/tenants');
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
    email?: string;
    phone?: string;
    address?: string;
  }) {
    return apiClient.post('/address-book', data);
  },

  async update(id: string, data: {
    name: string;
    email?: string;
    phone?: string;
    address?: string;
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
