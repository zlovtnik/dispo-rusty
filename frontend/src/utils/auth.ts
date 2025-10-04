// Authentication utility functions

export interface User {
  username: string;
  email: string;
}

export class AuthManager {
  private static readonly AUTH_TOKEN_KEY = 'auth_token';
  private static readonly CURRENT_USER_KEY = 'current_user';

  static getAuthToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(AuthManager.AUTH_TOKEN_KEY);
    }
    return null;
  }

  static getCurrentUser(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(AuthManager.CURRENT_USER_KEY);
    }
    return null;
  }

  static setAuth(token: string, username: string): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(AuthManager.AUTH_TOKEN_KEY, token);
      localStorage.setItem(AuthManager.CURRENT_USER_KEY, username);
    }
  }

  static clearAuth(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(AuthManager.AUTH_TOKEN_KEY);
      localStorage.removeItem(AuthManager.CURRENT_USER_KEY);
    }
  }

  static isAuthenticated(): boolean {
    return AuthManager.getAuthToken() !== null && AuthManager.getCurrentUser() !== null;
  }
}

export type AuthState = 'authenticated' | 'unauthenticated' | 'loading';

export function getInitialAuthState(): AuthState {
  if (typeof window === 'undefined') {
    return 'loading';
  }
  
  return AuthManager.isAuthenticated() ? 'authenticated' : 'unauthenticated';
}