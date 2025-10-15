// Authentication Types for JWT Multi-Tenant System
import type { UserId, TenantId } from './ids';

export interface User {
  id: UserId;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  roles: string[];
  tenantId: TenantId;
  createdAt: string;
  updatedAt: string;
}

export interface Tenant {
  id: TenantId;
  name: string;
  domain?: string;
  logo?: string;
  settings: TenantSettings;
  subscription: TenantSubscription;
}

export interface TenantSettings {
  theme: 'light' | 'dark' | 'natural';
  language: string;
  timezone: string;
  dateFormat: string;
  features: string[];
  branding: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
  };
}

export interface TenantSubscription {
  plan: 'basic' | 'professional' | 'enterprise';
  status: 'active' | 'trial' | 'expired' | 'cancelled';
  expiresAt?: Date;
  limits: {
    users: number;
    contacts: number;
    storage: number;
  };
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  tenant: Tenant | null;
  token: string | null;
  refreshToken: string | null;
  lastActivity: string | null;
}

export interface LoginCredentials {
  usernameOrEmail: string;
  password: string;
  tenantId?: TenantId;
  rememberMe?: boolean;
}

export interface RegisterData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
}

export interface AuthResponse {
  success: boolean;
  token: string;
  refreshToken: string;
  user: User;
  tenant: Tenant;
  expiresIn: number;
  message?: string;
}

export interface TokenPayload {
  sub: UserId; // user id
  email: string;
  tenantId: TenantId;
  roles: string[];
  iat: number; // issued at
  exp: number; // expires at
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirm {
  token: string;
  newPassword: string;
  confirmPassword: string;
}

export interface Permission {
  resource: string;
  actions: ('create' | 'read' | 'update' | 'delete')[];
  conditions?: Record<string, any>;
}

export interface AuthContextType extends Omit<AuthState, 'refreshToken'> {
  refreshToken: string | null;
  login: (credentials: LoginCredentials) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  refreshAuthToken: () => Promise<string | null>;
  register: (data: RegisterData) => Promise<AuthResponse>;
  resetPassword: (email: string) => Promise<{ success: boolean; message: string }>;
  confirmPasswordReset: (
    data: PasswordResetConfirm
  ) => Promise<{ success: boolean; message: string }>;
  hasPermission: (resource: string, action: string) => boolean;
  switchTenant: (tenantId: string) => Promise<void>;
}
