// Authentication utility functions

export interface User {
  username: string;
  email: string;
}

export class AuthManager {
  private static readonly AUTH_TOKEN_KEY = 'auth_token';
  private static readonly CURRENT_USER_KEY = 'current_user';

  static getAuthToken(): string | null {
    if (typeof window !== 'undefined' && 'localStorage' in window) {
      try {
        return localStorage.getItem(AuthManager.AUTH_TOKEN_KEY);
      } catch (error) {
        console.error('Error accessing localStorage:', error);
        return null;
      }
    }
    return null;
  }

  static getCurrentUser(): string | null {
    if (typeof window !== 'undefined' && 'localStorage' in window) {
      try {
        return localStorage.getItem(AuthManager.CURRENT_USER_KEY);
      } catch (error) {
        console.error('Error accessing localStorage:', error);
        return null;
      }
    }
    return null;
  }

  static setAuth(token: string, username: string): void {
    if (typeof window !== 'undefined' && 'localStorage' in window) {
      try {
        localStorage.setItem(AuthManager.AUTH_TOKEN_KEY, token);
        localStorage.setItem(AuthManager.CURRENT_USER_KEY, username);
      } catch (error) {
        console.error('Error writing to localStorage:', error);
      }
    }
  }

  static clearAuth(): void {
    if (typeof window !== 'undefined' && 'localStorage' in window) {
      try {
        localStorage.removeItem(AuthManager.AUTH_TOKEN_KEY);
        localStorage.removeItem(AuthManager.CURRENT_USER_KEY);
      } catch (error) {
        console.error('Error clearing localStorage:', error);
      }
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
