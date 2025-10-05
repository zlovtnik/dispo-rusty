import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

export const HomePage: React.FC = () => {
  const { isAuthenticated } = useAuth();

  // If authenticated, redirect to dashboard
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-color-natural-light to-color-healing-light">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="text-center max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-bold text-color-healing-dark mb-6">
            Welcome to the Natural Pharmacy System
          </h1>
          <p className="text-xl text-color-natural-dark mb-8 max-w-2xl mx-auto">
            A modern, secure multi-tenant platform for managing pharmaceutical data
            with JWT authentication and comprehensive tenant isolation.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/login" className="btn btn-primary px-8 py-4 text-lg">
              Get Started
            </Link>
            <Link to="/login" className="btn btn-secondary px-8 py-4 text-lg">
              Sign In
            </Link>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="bg-white py-16">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-color-healing-light rounded-full flex items-center justify-center mx-auto mb-4">
                <div className="text-3xl text-color-healing-dark">🔒</div>
              </div>
              <h3 className="text-xl font-semibold text-color-healing-dark mb-2">Secure Authentication</h3>
              <p className="text-color-natural-dark">
                JWT-based login system with comprehensive security measures and multi-tenant support.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-color-healing-light rounded-full flex items-center justify-center mx-auto mb-4">
                <div className="text-3xl text-color-healing-dark">🏢</div>
              </div>
              <h3 className="text-xl font-semibold text-color-healing-dark mb-2">Multi-Tenant Architecture</h3>
              <p className="text-color-natural-dark">
                Complete tenant isolation ensuring data security and privacy across different organizations.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-color-healing-light rounded-full flex items-center justify-center mx-auto mb-4">
                <div className="text-3xl text-color-healing-dark">⚡</div>
              </div>
              <h3 className="text-xl font-semibold text-color-healing-dark mb-2">High Performance</h3>
              <p className="text-color-natural-dark">
                Built with Bun runtime for exceptional speed and TypeScript for reliable development.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-color-natural-dark text-white py-8">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <p className="text-sm">
              © 2025 Natural Pharmacy System. Built with React, TypeScript, and Bun runtime.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};
