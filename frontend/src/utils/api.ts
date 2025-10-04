// API utility functions for backend communication

export const API_BASE_URL = 'http://localhost:8000/api';

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
  gender_key: string;
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
    email: string;
  };
}

export async function makeRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
  const url = `${API_BASE_URL}${endpoint}`;
  const config: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  };

  // Add auth token if available
  const authToken = localStorage.getItem('auth_token');
  if (authToken) {
    config.headers = {
      ...config.headers,
      'Authorization': `Bearer ${authToken}`
    };
  }

  const controller = new AbortController();
  const timeout = 30000; // 30 seconds
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  config.signal = controller.signal;

  try {
    console.log(`Making ${config.method || 'GET'} request to: ${url}`);
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
      throw new Error(typeof data === 'object' ? (data.error_message || data.message || 'Request failed') : data);
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
    const response = await fetch(`${API_BASE_URL}/ping`);
    return response.ok;
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
    return response.data;
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