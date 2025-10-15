/**
 * Test for MockAuthProvider functionality
 */

import React from 'react';
import { describe, test, expect } from 'bun:test';
import { render, screen } from '@testing-library/react';
import { AuthContext } from '../../contexts/AuthContext';
import { MockAuthProvider } from '../render';

// Test component that uses the auth context
function TestAuthConsumer() {
  const auth = React.useContext(AuthContext);
  if (!auth) {
    return <div>No auth context</div>;
  }
  return (
    <div>
      <div data-testid="isAuthenticated">{auth.isAuthenticated ? 'true' : 'false'}</div>
      <div data-testid="isLoading">{auth.isLoading ? 'true' : 'false'}</div>
      <div data-testid="user">{auth.user?.username || 'null'}</div>
      <div data-testid="tenant">{auth.tenant?.name || 'null'}</div>
    </div>
  );
}

describe('MockAuthProvider', () => {
  test('provides default mock auth context', () => {
    render(
      <MockAuthProvider>
        <TestAuthConsumer />
      </MockAuthProvider>
    );

    expect(screen.getByTestId('isAuthenticated').textContent).toBe('true');
    expect(screen.getByTestId('isLoading').textContent).toBe('false');
    expect(screen.getByTestId('user').textContent).toBe('testuser');
    expect(screen.getByTestId('tenant').textContent).toBe('Test Tenant');
  });

  test('allows overriding auth values', () => {
    render(
      <MockAuthProvider
        value={{
          isAuthenticated: false,
          user: null,
          tenant: null,
          loading: true,
        }}
      >
        <TestAuthConsumer />
      </MockAuthProvider>
    );

    expect(screen.getByTestId('isAuthenticated').textContent).toBe('false');
    expect(screen.getByTestId('isLoading').textContent).toBe('true');
    expect(screen.getByTestId('user').textContent).toBe('null');
    expect(screen.getByTestId('tenant').textContent).toBe('null');
  });

  test('merges partial overrides with defaults', () => {
    render(
      <MockAuthProvider
        value={{
          isAuthenticated: false,
        }}
      >
        <TestAuthConsumer />
      </MockAuthProvider>
    );

    expect(screen.getByTestId('isAuthenticated').textContent).toBe('false');
    expect(screen.getByTestId('isLoading').textContent).toBe('false'); // default value
    expect(screen.getByTestId('user').textContent).toBe('testuser'); // default value
    expect(screen.getByTestId('tenant').textContent).toBe('Test Tenant'); // default value
  });
});