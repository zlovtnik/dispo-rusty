import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';

export const DashboardPage: React.FC = () => {
  const { user, tenant } = useAuth();

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg p-8 text-white">
        <h1 className="text-3xl font-bold mb-2">Welcome back, {user?.firstName || user?.username}!</h1>
        <p className="text-blue-100">
          You're logged in to tenant <strong>{tenant?.name}</strong> ({tenant?.id})
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card">
          <div className="card-body">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Address Book</h3>
            <p className="text-gray-600 mb-4">Manage your contacts and addresses</p>
            <Link to="/address-book" className="btn btn-primary w-full">
              View Address Book
            </Link>
          </div>
        </div>

        <div className="card">
          <div className="card-body">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">System Health</h3>
            <p className="text-gray-600 mb-4">Check API and system status</p>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span className="text-sm text-gray-600">All systems operational</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-body">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">User Profile</h3>
            <p className="text-gray-600 mb-4">Manage your account settings</p>
            <div className="text-sm text-gray-600">
              <div>Email: {user?.email}</div>
              <div>Username: {user?.username}</div>
              <div>Roles: {user?.roles?.join(', ') || 'None'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
        </div>
        <div className="card-body">
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b border-gray-200 last:border-b-0">
              <div>
                <p className="text-sm font-medium text-gray-900">Application started</p>
                <p className="text-xs text-gray-500">Multi-tenant React frontend with Bun</p>
              </div>
              <span className="text-xs text-gray-500">Just now</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-200 last:border-b-0">
              <div>
                <p className="text-sm font-medium text-gray-900">Authentication successful</p>
                <p className="text-xs text-gray-500">JWT token validated for tenant access</p>
              </div>
              <span className="text-xs text-gray-500">Just now</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-200 last:border-b-0">
              <div>
                <p className="text-sm font-medium text-gray-900">Dashboard loaded</p>
                <p className="text-xs text-gray-500">Application ready for use</p>
              </div>
              <span className="text-xs text-gray-500">Just now</span>
            </div>
          </div>
        </div>
      </div>

      {/* Technology Stack Info */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-gray-900">Technology Stack</h3>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-2">
                <span className="text-blue-600 font-bold text-sm">TS</span>
              </div>
              <p className="text-sm font-medium">TypeScript</p>
              <p className="text-xs text-gray-500">5.9+</p>
            </div>
            <div className="text-center">
              <div className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center mx-auto mb-2">
                <span className="text-yellow-600 font-bold text-lg">⚡</span>
              </div>
              <p className="text-sm font-medium">Bun</p>
              <p className="text-xs text-gray-500">1.0+</p>
            </div>
            <div className="text-center">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-2">
                <span className="text-blue-600 font-bold text-sm">R</span>
              </div>
              <p className="text-sm font-medium">React</p>
              <p className="text-xs text-gray-500">18.3.1</p>
            </div>
            <div className="text-center">
              <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center mx-auto mb-2">
                <span className="text-orange-600 font-bold text-lg">🚀</span>
              </div>
              <p className="text-sm font-medium">Actix Web</p>
              <p className="text-xs text-gray-500">Backend</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
