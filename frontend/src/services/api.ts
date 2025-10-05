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
}

// Base API configuration
const API_BASE_URL = ((import.meta as any).env?.API_URL as string) || 'http://localhost:8080/api';

// HTTP Client class
class HttpClient {
  private baseURL: string;

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;

    // Add authentication headers if token exists
    const token = localStorage.getItem('token');
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

    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    if (tenantId) {
      headers.set('X-Tenant-ID', tenantId);
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const errorData: ApiError = await response.json().catch(() => ({
          code: 'UNKNOWN_ERROR',
          message: `HTTP ${response.status}: ${response.statusText}`,
        }));

        throw new Error(errorData.message || `Request failed with status ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Network error: Unable to connect to the server');
      }
      throw error;
    }
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

// Export default client
export default apiClient;
