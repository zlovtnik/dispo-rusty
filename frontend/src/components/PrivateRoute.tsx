import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import './PrivateRoute.css';

interface PrivateRouteProps {
  children: React.ReactNode;
}

/**
 * PrivateRoute component - wraps protected routes and redirects to login if not authenticated
 * Uses React.memo with custom comparison to prevent infinite redirect loops in tests
 */
export const PrivateRoute: React.FC<PrivateRouteProps> = React.memo(
  ({ children }) => {
    const { isAuthenticated, isLoading } = useAuth();
    const location = useLocation();

    if (isLoading) {
      return (
        <div
          className="flex items-center justify-center min-h-screen"
          data-testid="loading-container"
        >
          <div className="loading" role="status" aria-live="polite" data-testid="loading-spinner">
            <div className="spinner"></div>
            <span>Loading...</span>
          </div>
        </div>
      );
    }

    if (!isAuthenticated) {
      // Only redirect if not already on the login page to prevent infinite redirect loops
      if (location.pathname !== '/login') {
        return <Navigate to="/login" state={{ from: location }} replace />;
      }

      // If already on login page, this is a configuration error!
      // The login route should NEVER be wrapped with PrivateRoute
      if (import.meta.env.DEV) {
        const errorMessage =
          `PrivateRoute Configuration Error: The '/login' route must not be protected by PrivateRoute. ` +
          `This creates a redirect loop. Please remove the PrivateRoute wrapper from the login route in your router configuration.`;

        console.error(errorMessage);
        throw new Error(errorMessage);
      }

      // In production, fail gracefully to avoid breaking the app for users
      console.warn(
        'PrivateRoute: Detected potential misconfiguration - login route may be incorrectly protected'
      );
      return null;
    }

    return <>{children}</>;
  },
  (prevProps, nextProps) => {
    // Custom equality check: we only care about children identity
    // Return true if props are considered equal (skip re-render)
    // Children comparison - use reference equality
    return prevProps.children === nextProps.children;
  }
);
