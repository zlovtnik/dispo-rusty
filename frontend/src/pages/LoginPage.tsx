import React, { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useAuth } from '@/contexts/AuthContext';
import type { LoginCredentials } from '@/contexts/AuthContext';

interface LoginFormData {
  usernameOrEmail: string;
  password: string;
  tenantId: string;
  rememberMe: boolean;
}

export const LoginPage: React.FC = () => {
  const { login, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormData>({
    defaultValues: {
      rememberMe: false,
    }
  });
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Get the intended destination
  const from = location.state?.from?.pathname || '/dashboard';

  const onSubmit = async (data: LoginFormData) => {
    try {
      setSubmitError(null);
      const credentials: LoginCredentials = {
        usernameOrEmail: data.usernameOrEmail,
        password: data.password,
        tenantId: data.tenantId,
        rememberMe: data.rememberMe,
      };
      await login(credentials);
      navigate(from, { replace: true });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Login failed');
    }
  };

  // Don't render if already authenticated
  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full">
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-gray-900">Sign In</h2>
            <p className="text-sm text-gray-600 mt-1">
              Access your multi-tenant application
            </p>
          </div>
          <div className="card-body">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* Username/Email Field */}
              <div className="form-group">
                <label htmlFor="usernameOrEmail" className="form-label">
                  Username or Email
                </label>
                <input
                  id="usernameOrEmail"
                  type="text"
                  {...register('usernameOrEmail', {
                    required: 'Username or email is required',
                  })}
                  className="form-input"
                  placeholder="Enter your username or email"
                />
                {errors.usernameOrEmail && (
                  <span className="form-error">{errors.usernameOrEmail.message}</span>
                )}
              </div>

              {/* Password Field */}
              <div className="form-group">
                <label htmlFor="password" className="form-label">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  {...register('password', {
                    required: 'Password is required',
                  })}
                  className="form-input"
                  placeholder="Enter your password"
                />
                {errors.password && (
                  <span className="form-error">{errors.password.message}</span>
                )}
              </div>

              {/* Tenant ID Field */}
              <div className="form-group">
                <label htmlFor="tenantId" className="form-label">
                  Tenant ID
                </label>
                <input
                  id="tenantId"
                  type="text"
                  {...register('tenantId', {
                    required: 'Tenant ID is required',
                  })}
                  className="form-input"
                  placeholder="Enter your tenant ID"
                />
                {errors.tenantId && (
                  <span className="form-error">{errors.tenantId.message}</span>
                )}
              </div>

              {/* Remember Me */}
              <div className="flex items-center">
                <input
                  id="rememberMe"
                  type="checkbox"
                  {...register('rememberMe')}
                  className="h-4 w-4 text-primary border-gray-300 rounded focus:ring-primary"
                />
                <label htmlFor="rememberMe" className="ml-2 block text-sm text-gray-900">
                  Remember me
                </label>
              </div>

              {/* Error Display */}
              {submitError && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3">
                  <p className="text-sm text-red-600">{submitError}</p>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full btn btn-primary"
              >
                {isLoading ? (
                  <div className="loading">
                    <div className="spinner"></div>
                    <span>Signing in...</span>
                  </div>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Additional Info */}
        <div className="mt-4 text-center">
          <p className="text-sm text-gray-600">
            For demo purposes, try any credentials (API integration coming next)
          </p>
        </div>
      </div>
    </div>
  );
};
