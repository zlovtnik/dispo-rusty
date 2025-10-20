import React, { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { PrivateRoute } from './components/PrivateRoute';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { EnvironmentErrorUI } from './components/EnvironmentErrorUI';
import { getEnv, EnvironmentError } from './config/env';

const HomePage = lazy(() =>
  import('./pages/HomePage').then(module => ({ default: module.HomePage }))
);
const LoginPage = lazy(() =>
  import('./pages/LoginPage').then(module => ({ default: module.LoginPage }))
);
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then(module => ({ default: module.DashboardPage }))
);
const AddressBookPage = lazy(() =>
  import('./pages/AddressBookPage').then(module => ({ default: module.AddressBookPage }))
);
const TenantsPage = lazy(() =>
  import('./pages/TenantsPage').then(module => ({ default: module.TenantsPage }))
);

// Validate environment configuration at module load time
let envError: Error | null = null;
try {
  getEnv();
} catch (error) {
  envError =
    error instanceof EnvironmentError
      ? error
      : new Error('Failed to initialize application configuration');
}

export const App: React.FC = () => {
  // Check for environment errors and render error UI if present
  if (envError) {
    return <EnvironmentErrorUI error={envError} />;
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-natural-light text-natural-dark">
        <AuthProvider>
          <Suspense fallback={<div>Loading...</div>}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="/dashboard"
                element={
                  <PrivateRoute>
                    <Layout>
                      <DashboardPage />
                    </Layout>
                  </PrivateRoute>
                }
              />
              <Route
                path="/address-book"
                element={
                  <PrivateRoute>
                    <Layout>
                      <AddressBookPage />
                    </Layout>
                  </PrivateRoute>
                }
              />
              <Route
                path="/tenants"
                element={
                  <PrivateRoute>
                    <Layout>
                      <TenantsPage />
                    </Layout>
                  </PrivateRoute>
                }
              />
            </Routes>
          </Suspense>
        </AuthProvider>
      </div>
    </ErrorBoundary>
  );
};
