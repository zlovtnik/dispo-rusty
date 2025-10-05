import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { PrivateRoute } from './components/PrivateRoute';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { AddressBookPage } from './pages/AddressBookPage';
import { Layout } from './components/Layout';

export const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-natural-light text-natural-dark">
      <AuthProvider>
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
        </Routes>
      </AuthProvider>
    </div>
  );
};
