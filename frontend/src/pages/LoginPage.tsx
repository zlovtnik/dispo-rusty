import React, { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import type { LoginCredentials } from '@/types/auth';
import { asTenantId } from '@/types/ids';
import { Card, Form, Input, Button, Checkbox, Typography, Alert, Flex } from 'antd';

interface LoginFormValues {
  usernameOrEmail: string;
  password: string;
  tenantId: string;
}

export const LoginPage: React.FC = () => {
  const { login, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form] = Form.useForm();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Get the intended destination
  const from = location.state?.from?.pathname || '/dashboard';

  const onSubmit = async (values: LoginFormValues) => {
    setIsSubmitting(true);
    try {
      setSubmitError(null);
      const credentials: LoginCredentials = {
        usernameOrEmail: values.usernameOrEmail,
        password: values.password,
        tenantId: values.tenantId ? asTenantId(values.tenantId) : undefined,
        rememberMe,
      };
      await login(credentials);
      navigate(from, { replace: true });
    } catch (error) {
      console.error('Login error occurred', error);
      setSubmitError(error instanceof Error ? error.message : 'Login failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Don't render if already authenticated
  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  return (
    <Flex
      justify="center"
      align="center"
      style={{
        minHeight: '100vh',
        background:
          'linear-gradient(135deg, var(--color-natural-light) 0%, var(--color-healing-light) 100%)',
        padding: '20px',
      }}
    >
      <Card
        style={{
          width: 420,
          borderRadius: '16px',
          border: '2px solid var(--primary-200)',
          background:
            'linear-gradient(145deg, rgba(255,255,255,0.95) 0%, rgba(247,242,240,0.9) 100%)',
          boxShadow: '0 20px 40px rgba(38, 70, 83, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.8)',
          backdropFilter: 'blur(10px)',
        }}
        title={
          <Typography.Title
            level={2}
            style={{
              color: 'var(--color-healing-dark)',
              margin: 0,
              textAlign: 'center',
              fontSize: '2rem',
              fontWeight: 700,
            }}
          >
            Welcome Back
          </Typography.Title>
        }
        styles={{
          header: {
            border: 'none',
            padding: '40px 30px 20px',
            textAlign: 'center',
          },
          body: {
            padding: '30px',
          },
        }}
      >
        <Typography.Text
          type="secondary"
          style={{
            textAlign: 'center',
            display: 'block',
            fontSize: '16px',
            marginBottom: '32px',
            color: 'var(--primary-600)',
          }}
        >
          Access your multi-tenant application
        </Typography.Text>

        <Form form={form} onFinish={onSubmit} size="large" layout="vertical">
          <Form.Item
            label={
              <span style={{ color: 'var(--primary-700)', fontWeight: 600 }}>
                Username or Email
              </span>
            }
            name="usernameOrEmail"
            rules={[{ required: true, message: 'Username or email is required' }]}
          >
            <Input placeholder="Enter your username or email" className="login-input" />
          </Form.Item>

          <Form.Item
            label={<span style={{ color: 'var(--primary-700)', fontWeight: 600 }}>Password</span>}
            name="password"
            rules={[{ required: true, message: 'Password is required' }]}
          >
            <Input.Password placeholder="Enter your password" className="login-input" />
          </Form.Item>

          <Form.Item
            label={<span style={{ color: 'var(--primary-700)', fontWeight: 600 }}>Tenant ID</span>}
            name="tenantId"
            rules={[{ required: true, message: 'Tenant ID is required' }]}
          >
            <Input placeholder="Enter your tenant ID" className="login-input" />
          </Form.Item>

          <Form.Item>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '16px',
              }}
            >
              <Checkbox
                checked={rememberMe}
                onChange={e => {
                  setRememberMe(e.target.checked);
                }}
                style={{ color: 'var(--primary-600)' }}
              >
                Remember me
              </Checkbox>
            </div>
          </Form.Item>

          {submitError && (
            <Form.Item>
              <Alert
                message={submitError}
                type="error"
                closable
                onClose={() => {
                  setSubmitError(null);
                }}
                style={{
                  borderRadius: '8px',
                  border: '1px solid var(--danger-300)',
                  backgroundColor: 'var(--danger-50)',
                }}
              />
            </Form.Item>
          )}

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              block
              loading={isLoading || isSubmitting}
              className="login-submit-button"
            >
              Sign In
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Typography.Text
        type="secondary"
        style={{
          textAlign: 'center',
          marginTop: '32px',
          display: 'block',
          maxWidth: '400px',
          color: 'var(--primary-500)',
          fontSize: '14px',
          lineHeight: '1.5',
        }}
      >
        Use your account credentials and tenant ID to sign in to your secure workspace
      </Typography.Text>
    </Flex>
  );
};
