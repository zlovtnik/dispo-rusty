export interface LoginCredentials {
  usernameOrEmail: string;
  password: string;
  tenantId: string;
  rememberMe?: boolean;
}

export interface AuthResponse {
  token: string;
  token_type: string;
}

export interface LoginInfoResponse {
  username: string;
  login_session: string;
  tenant_id: string;
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
const API_BASE_URL = (() => {
  const url = import.meta.env.VITE_API_URL as string;
  if (url) {
    return url;
  }

  // Only allow localhost fallback in development
  if (import.meta.env.MODE === 'development') {
    return 'http://localhost:8080/api';
  }

  // In production, throw an error if API URL is missing
  throw new Error('VITE_API_URL environment variable is required in production');
})();

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

  private safeGet(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private safeGetJsonId(key: string): string | null {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored).id : null;
    } catch {
      return null;
    }
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
    const tenantId = this.safeGetJsonId('tenant');

    // Add authorization header if token exists
    const authToken = this.safeGet('auth_token');

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

  private async handleSuccessResponse(response: Response): Promise<any> {
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

  private async parseErrorData(response: Response): Promise<any> {
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

  private createHttpError(response: Response, errorData: any): ApiError {
    const apiError: ApiError = {
      ...errorData,
      type: 'http',
      statusCode: response.status,
      retryable: response.status >= 500,
    };
    return apiError;
  }

  private createFetchError(error: any): ApiError {
    const isAborted = (error as any)?.name === 'AbortError';
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
          return this.handleSuccessResponse(response);
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
