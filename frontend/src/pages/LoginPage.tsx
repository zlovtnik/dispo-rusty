import React, { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import type { LoginCredentials } from '@/types/auth';
import { Card, Form, Input, Button, Checkbox, Typography, Alert, Flex } from 'antd';

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

  const onSubmit = async (values: any) => {
    setIsSubmitting(true);
    try {
      setSubmitError(null);
      const credentials: LoginCredentials = {
        usernameOrEmail: values.usernameOrEmail,
        password: values.password,
        tenantId: values.tenantId,
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
    <Flex justify="center" align="center" style={{ minHeight: '100vh', backgroundColor: '#fafaf9' }}>
      <Card style={{ width: 400 }} title="Sign In" >
        <Typography.Text type="secondary">Access your multi-tenant application</Typography.Text>
        <br />
        <br />
        <Form form={form} onFinish={onSubmit} size="large" >
          <Form.Item label="Username or Email" name="usernameOrEmail" rules={[{ required: true, message: 'Username or email is required' }]}>
            <Input placeholder="Enter your username or email" />
          </Form.Item>

          <Form.Item label="Password" name="password" rules={[{ required: true, message: 'Password is required' }]} >
            <Input.Password placeholder="Enter your password" />
          </Form.Item>

          <Form.Item label="Tenant ID" name="tenantId" rules={[{ required: true, message: 'Tenant ID is required' }] } >
            <Input placeholder="Enter your tenant ID" />
          </Form.Item>

          <Form.Item>
            <Checkbox checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)}>
              Remember me
            </Checkbox>
          </Form.Item>

          {submitError && <Form.Item><Alert message={submitError} type="error" closable onClose={() => setSubmitError(null)} /></Form.Item>}

          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={isLoading || isSubmitting}>
              Sign In
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Typography.Text type="secondary" style={{ textAlign: 'center', marginTop: 16, display: 'block' }}>
        Use your account credentials and tenant ID to sign in
      </Typography.Text>
    </Flex>
  );
};
