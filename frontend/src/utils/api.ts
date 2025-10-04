// API utility functions for backend communication

import { AuthManager } from './auth';

export const API_BASE_URL = import.meta.env.PUBLIC_API_BASE_URL || 'http://localhost:8000/api';

export interface LoginData {
  username_or_email: string;
  password: string;
}

export interface SignupData {
  username: string;
  email: string;
  password: string;
}

export interface ContactData {
  name: string;
  gender: string;
  age: number;
  address: string;
  phone: string;
  email: string;
}

export interface Contact extends ContactData {
  id: number;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface AuthResponse {
  token: string;
  user: {
    username: string;
    email?: string;
  };
}

function decodeJwtPayload(token: string): any {
  try {
    const payload = token.split('.')[1];
    const decoded = atob(payload);
    return JSON.parse(decoded);
  } catch (error) {
    console.error('Failed to decode JWT:', error);
    return null;
  }
}

export async function makeRequest(endpoint: string, options: RequestInit & { timeout?: number } = {}): Promise<any> {
  const url = `${API_BASE_URL}${endpoint}`;
  const { timeout = 30000, ...otherOptions } = options;
  const config: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...(otherOptions.headers as Record<string, string>),
    } as HeadersInit,
    ...otherOptions
  };

  // Add auth token if available
  const authToken = typeof window !== 'undefined'
    ? localStorage.getItem('auth_token')
    : null;
  if (authToken) {
    const headers = {
      ...(config.headers as Record<string, string>),
      'Authorization': `Bearer ${authToken}`
    };
    config.headers = headers as HeadersInit;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  config.signal = controller.signal;

  try {
    if (import.meta.env.DEV) {
      console.log(`Making ${config.method || 'GET'} request to: ${url}`);
    }
    const response = await fetch(url, config);

    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      try {
        data = await response.json();
      } catch (e) {
        data = await response.text();
      }
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      let errorMessage: string;
      if (data && typeof data === 'object') {
        errorMessage = data.error_message || data.message || data.error || `HTTP ${response.status}: ${response.statusText}`;
      } else {
        errorMessage = String(data || `HTTP ${response.status}: ${response.statusText}`);
      }
      throw new Error(errorMessage);
    }

    return data;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new Error('Request timeout');
    }
    console.error('Request failed:', error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function testBackendConnectivity(): Promise<boolean> {
  try {
    await makeRequest('/ping', { timeout: 5000 });
    return true;
  } catch (error) {
    console.error('Backend connectivity test failed:', error);
    return false;
  }
}

export async function login(loginData: LoginData): Promise<AuthResponse> {
  const response = await makeRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify(loginData)
  });

  if (response.data && response.data.token) {
    const decodedPayload = decodeJwtPayload(response.data.token);
    const username = decodedPayload?.user || 'unknown';
    return {
      token: response.data.token,
      user: {
        username,
        email: undefined // Backend doesn't provide email in response
      }
    };
  } else {
    throw new Error('Invalid response format');
  }
}

export async function signup(signupData: SignupData): Promise<void> {
  await makeRequest('/auth/signup', {
    method: 'POST',
    body: JSON.stringify(signupData)
  });
}

export async function logout(): Promise<void> {
  await makeRequest('/auth/logout', {
    method: 'POST'
  });
  AuthManager.clearAuth();
}

export async function addContact(contactData: ContactData): Promise<void> {
  await makeRequest('/address-book', {
    method: 'POST',
    body: JSON.stringify(contactData)
  });
}

export async function getContacts(): Promise<Contact[]> {
  const response = await makeRequest('/address-book');
  
  if (response.data && Array.isArray(response.data)) {
    return response.data;
  } else {
    return [];
  }
}

export async function deleteContact(contactId: number): Promise<void> {
  await makeRequest(`/address-book/${contactId}`, {
    method: 'DELETE'
  });
}
