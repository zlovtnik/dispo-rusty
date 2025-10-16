import React, { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/contexts/AuthContext';
import type { LoginCredentials } from '@/types/auth';
import { asTenantId } from '@/types/ids';
import { loginSchema } from '@/validation/schemas';
import type { z } from 'zod';
import { Card, Input, Button, Checkbox, Typography, Alert, Flex } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';

type LoginFormData = z.infer<typeof loginSchema>;

export const LoginPage: React.FC = () => {
  const { login, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Get the intended destination
  const from = location.state?.from?.pathname || '/dashboard';

  const {
    register,
    handleSubmit,
    formState: { errors, touchedFields, isSubmitted, isValid },
    watch,
    trigger,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    mode: 'onChange',
    defaultValues: {
      usernameOrEmail: '',
      password: '',
      tenantId: '',
      rememberMe: false,
    },
  });

  const onSubmit = async (values: LoginFormData) => {
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

  const getFieldStatus = (fieldName: keyof LoginFormData) => {
    const error = errors[fieldName];
    const touched = touchedFields[fieldName];
    const isFieldValid = !error && touched;
    if (error && (touched || isSubmitted)) return 'error';
    if (isFieldValid) return 'success';
    return undefined;
  };

  const renderFieldHelp = (fieldName: keyof LoginFormData) => {
    const error = errors[fieldName];
    const touched = touchedFields[fieldName];
    const isFieldValid = !error && touched;

    if (error && (touched || isSubmitted)) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
          <CloseCircleOutlined style={{ color: 'var(--color-danger)' }} />
          <span style={{ color: 'var(--color-danger)', fontSize: '14px' }}>
            {typeof error.message === 'string' ? error.message : 'Invalid input'}
          </span>
        </div>
      );
    }

    if (isFieldValid) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
          <CheckCircleOutlined style={{ color: 'var(--color-success)' }} />
          <span style={{ color: 'var(--color-success)', fontSize: '14px' }}>Valid</span>
        </div>
      );
    }

    return null;
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

        <form onSubmit={handleSubmit(onSubmit)} style={{ width: '100%' }}>
          <div style={{ marginBottom: '24px' }}>
            <label style={{ color: 'var(--primary-700)', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
              Username or Email
            </label>
            <Input
              {...register('usernameOrEmail')}
              placeholder="Enter your username or email"
              size="large"
              status={getFieldStatus('usernameOrEmail')}
              onBlur={() => trigger('usernameOrEmail')}
            />
            {renderFieldHelp('usernameOrEmail')}
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ color: 'var(--primary-700)', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
              Password
            </label>
            <Input.Password
              {...register('password')}
              placeholder="Enter your password"
              size="large"
              status={getFieldStatus('password')}
              iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
              onBlur={() => trigger('password')}
            />
            {renderFieldHelp('password')}
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ color: 'var(--primary-700)', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
              Tenant ID
            </label>
            <Input
              {...register('tenantId')}
              placeholder="Enter your tenant ID"
              size="large"
              status={getFieldStatus('tenantId')}
              onBlur={() => trigger('tenantId')}
            />
            {renderFieldHelp('tenantId')}
          </div>

          <div style={{ marginBottom: '32px' }}>
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

          {submitError && (
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
                marginBottom: '24px',
              }}
            />
          )}

          <Button
            type="primary"
            htmlType="submit"
            block
            size="large"
            loading={isLoading || isSubmitting}
            disabled={!isValid && isSubmitted}
          >
            Sign In
          </Button>
        </form>
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
