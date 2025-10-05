import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, tenant, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDesktopMenuHidden, setIsDesktopMenuHidden] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navigation = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: (
        <svg
          className="w-4 h-4 shrink-0 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          width="16"
          height="16"
          style={{ width: '16px', height: '16px' }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5a2 2 0 012-2h4a2 2 0 012 2v2H8V5z" />
        </svg>
      ),
      current: location.pathname === '/dashboard',
    },
    {
      name: 'Address Book',
      href: '/address-book',
      icon: (
        <svg
          className="w-4 h-4 shrink-0 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          width="16"
          height="16"
          style={{ width: '16px', height: '16px' }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-10a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
        </svg>
      ),
      current: location.pathname === '/address-book',
    },
  ];

  return (
    <div className="app-container">
      {/* Header/Navigation */}
      <header className="bg-white shadow-lg border-b border-neutral-200 sticky top-0 z-10">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between h-20">
            {/* Logo and Tenant Info */}
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-color-healing-dark">
                    {tenant?.name || 'Natural Pharmacy System'}
                  </h1>
                  <p className="text-xs text-color-natural-dark">
                    Tenant: {tenant?.id}
                  </p>
                </div>
              </div>
            </div>

            {/* Navigation Links */}
            <nav className={`hidden md:flex items-center space-x-4 ${isDesktopMenuHidden ? 'opacity-0 pointer-events-none' : 'opacity-100'} transition-all duration-300`}>
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`flex items-center space-x-2 px-3 py-2 text-sm font-medium transition-colors border-b-2 ${
                    item.current
                      ? 'border-primary-500 text-primary-700 bg-primary-50'
                      : 'border-transparent text-gray-800 hover:text-primary-600 hover:bg-gray-50'
                  }`}
                >
                  {item.icon}
                  <span>{item.name}</span>
                </Link>
              ))}

              {/* Desktop menu toggle button */}
              <button
                onClick={() => setIsDesktopMenuHidden(!isDesktopMenuHidden)}
                className="p-1.5 rounded-lg hover:bg-gray-100 border border-transparent hover:border-gray-300 transition-all duration-200"
                title={isDesktopMenuHidden ? "Show menu" : "Hide menu"}
                aria-label="Toggle desktop navigation"
              >
                <svg
                  className="w-4 h-4 shrink-0 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  style={{ width: '16px', height: '16px' }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isDesktopMenuHidden ? "M13 5l7 7-7 7M5 5l7 7-7 7" : "M9 5l7 7-7 7M15 5l7 7-7 7"} />
                </svg>
              </button>
            </nav>

            {/* Show menu button when hidden */}
            {isDesktopMenuHidden && (
              <button
                onClick={() => setIsDesktopMenuHidden(false)}
                className="hidden md:flex fixed top-24 right-6 z-20 items-center space-x-2 px-3 py-2 bg-white border border-gray-300 rounded-lg shadow-lg hover:bg-gray-50 transition-all duration-200"
                title="Show navigation menu"
                aria-label="Show navigation menu"
              >
                <svg
                  className="w-4 h-4 shrink-0 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  style={{ width: '16px', height: '16px' }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
                <span className="text-sm text-gray-700">Show Menu</span>
              </button>
            )}

            {/* User Menu */}
            <div className="flex items-center space-x-4">
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-sm font-medium text-color-natural-dark">
                  {user?.firstName || user?.username || 'User'}
                </span>
                <span className="text-xs text-neutral-500">
                  {tenant?.name || 'Tenant'}
                </span>
              </div>

              {/* User Avatar */}
              <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                <span className="text-sm font-medium text-primary-700">
                  {(user?.firstName || user?.username || 'U').charAt(0).toUpperCase()}
                </span>
              </div>

              {/* Mobile menu button */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className={`md:hidden p-2 rounded-lg border transition-all duration-200 ${
                  isMobileMenuOpen
                    ? 'bg-primary-500 text-white border-primary-500 hover:bg-primary-600 shadow-lg'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400 shadow'
                }`}
                title={isMobileMenuOpen ? "Close menu" : "Open menu"}
                aria-expanded={isMobileMenuOpen}
                aria-label="Toggle navigation menu"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d={isMobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"}
                  />
                </svg>
              </button>

              <button
                onClick={handleLogout}
                className="hidden md:flex btn btn-secondary text-sm px-4 py-2"
                title="Logout"
              >
                <svg
                  className="w-4 h-4 mr-2 shrink-0 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  style={{ width: '16px', height: '16px' }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Logout
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className={`border-t-2 border-gray-200 bg-gray-50 transition-all duration-300 ease-in-out shadow-inner ${
          isMobileMenuOpen
            ? 'max-h-96 opacity-100 border-primary-300'
            : 'max-h-0 opacity-0 overflow-hidden'
        }`}>
          <nav className="px-4 py-3 space-y-1">
            {navigation.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center space-x-2 px-3 py-3 text-sm font-medium transition-all duration-200 rounded-lg border-b border-neutral-200 last:border-b-0 hover:transform hover:translate-x-1 ${
                  item.current
                    ? 'border-primary-500 text-primary-700 bg-primary-50'
                    : 'text-gray-800 hover:bg-gray-50 hover:border-primary-200 hover:text-primary-600'
                }`}
              >
                {item.icon}
                <span>{item.name}</span>
              </Link>
            ))}
            <button
              onClick={handleLogout}
              className="flex items-center space-x-2 px-3 py-3 text-sm font-medium text-gray-800 hover:bg-red-50 hover:text-red-600 transition-all duration-200 hover:transform hover:translate-x-1 border-b border-neutral-200 w-full text-left rounded-lg"
            >
              <svg
                className="w-4 h-4 shrink-0 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                width="16"
                height="16"
                style={{ width: '16px', height: '16px' }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Logout</span>
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 bg-color-natural-light">
        <div className="container mx-auto px-6 py-8">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-color-natural-dark text-white border-t border-neutral-800 mt-auto">
        <div className="container mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="text-sm text-neutral-400">
              © 2025 Natural Pharmacy System. Built with TypeScript, Bun, and React.
              <br className="hidden sm:block" />
              <span className="text-xs">
                Secure multi-tenant platform with JWT authentication
              </span>
            </div>
            <div className="mt-4 md:mt-0">
              <span className="text-xs text-neutral-500">
                Environment: {import.meta.env.DEV ? 'Development' : 'Production'}
                {(import.meta as any).env?.DEV && (
                  <span className="ml-2">
                    | Tenant: {tenant?.id} | User: {user?.id}
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
