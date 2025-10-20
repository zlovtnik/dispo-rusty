/**
 * Login Page - Functional Programming Implementation
 *
 * Implements railway-oriented programming with Result types for:
 * - Form validation pipeline
 * - Error handling with pattern matching
 * - Type-safe state management
 *
 * @module LoginPage
 */

import React, { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import type { LoginCredentials } from '@/types/auth';
import type { AuthFlowError } from '@/types/errors';
import { Card, Form, Input, Button, Checkbox, Typography, Alert, Flex } from 'antd';
import { type Result, ok, err } from 'neverthrow';
import { match } from 'ts-pattern';
import {
  validateUsername,
  validatePassword,
  validateTenantId,
  validateEmail,
  formatCredentialValidationError,
  type ValidatedUsername,
  type ValidatedPassword,
  type CredentialValidationError,
  type ValidatedEmail,
} from '@/utils/validation';
import type { TenantId } from '@/types/ids';
import {
  createFormPipeline,
  PipelineStates,
  isPipelineLoading,
  formatPipelineError,
  type PipelineState,
  type PipelineError,
  type FormValidator,
  type Transformer,
  type Submitter,
} from '@/utils/formPipeline';

/**
 * Login form input types
 */
interface LoginFormData {
  usernameOrEmail: string;
  password: string;
  tenantId: string;
  rememberMe: boolean;
}

/**
 * Validated login credentials (branded types)
 */
interface ValidatedLoginData {
  usernameOrEmail: ValidatedUsername | ValidatedEmail;
  password: ValidatedPassword;
  tenantId: TenantId;
  rememberMe: boolean;
}

/**
 * Login DTO (matches API expectations)
 */
interface LoginDTO {
  usernameOrEmail: string;
  password: string;
  tenantId: TenantId;
  rememberMe: boolean;
}

/**
 * Login response type
 */
interface LoginResponse {
  success: boolean;
  message?: string;
}

/**
 * Form validation function
 * Validates all login form fields using Result types
 */
const validateLoginForm: FormValidator<
  LoginFormData,
  ValidatedLoginData,
  CredentialValidationError
> = (
  formData: LoginFormData
): Result<ValidatedLoginData, Record<string, CredentialValidationError>> => {
  // Accept either email or username; try email first, then fall back to username validation
  const usernameOrEmailResult = validateEmail(formData.usernameOrEmail).orElse(() =>
    validateUsername(formData.usernameOrEmail)
  );

  const passwordResult = validatePassword(formData.password);
  const tenantIdResult = validateTenantId(formData.tenantId);

  // Collect all errors
  const errors: Partial<Record<keyof LoginFormData, CredentialValidationError>> = {};

  if (usernameOrEmailResult.isErr()) {
    errors.usernameOrEmail = usernameOrEmailResult.error;
  }
  if (passwordResult.isErr()) {
    errors.password = passwordResult.error;
  }
  if (tenantIdResult.isErr()) {
    errors.tenantId = tenantIdResult.error;
  }

  // Return all errors if any exist
  if (Object.keys(errors).length > 0) {
    return err(errors as Record<string, CredentialValidationError>);
  }

  // All validations passed - use _unsafeUnwrap since we checked errors
  return ok({
    usernameOrEmail: usernameOrEmailResult._unsafeUnwrap(),
    password: passwordResult._unsafeUnwrap(),
    tenantId: tenantIdResult._unsafeUnwrap(),
    rememberMe: formData.rememberMe,
  });
};

/**
 * Transform validated data to API DTO
 */
const transformToLoginDTO: Transformer<ValidatedLoginData, LoginDTO, CredentialValidationError> = (
  validated: ValidatedLoginData
): Result<LoginDTO, PipelineError<CredentialValidationError>> => {
  return ok({
    usernameOrEmail: validated.usernameOrEmail,
    password: validated.password,
    tenantId: validated.tenantId,
    rememberMe: validated.rememberMe,
  });
};

/**
 * Type for location state
 */
interface LocationState {
  from?: { pathname: string };
}

const isLocationState = (state: unknown): state is LocationState => {
  if (state === null || typeof state !== 'object') {
    return false;
  }

  const candidate = state as { from?: unknown };
  if (candidate.from === undefined || candidate.from === null) {
    return true;
  }

  return typeof (candidate.from as { pathname?: unknown }).pathname === 'string';
};

/**
 * Login Page Component with FP Patterns
 */
export const LoginPageFP: React.FC = () => {
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = isLocationState(location.state) ? location.state : null;
  const [form] = Form.useForm<LoginFormData>();

  // Pipeline state management using discriminated union
  const [pipelineState, setPipelineState] = useState<
    PipelineState<LoginResponse, CredentialValidationError>
  >(PipelineStates.idle());

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Get the intended destination
  const from = locationState?.from?.pathname || '/dashboard';

  /**
   * Submit function that wraps the login API call
   */
  const submitLogin: Submitter<LoginDTO, LoginResponse, CredentialValidationError> = async (
    dto: LoginDTO
  ): Promise<Result<LoginResponse, PipelineError<CredentialValidationError>>> => {
    try {
      const credentials: LoginCredentials = {
        usernameOrEmail: dto.usernameOrEmail,
        password: dto.password,
        tenantId: dto.tenantId, // Already TenantId type, no conversion needed
        rememberMe: dto.rememberMe,
      };

      // Await the login call and treat it as a Result
      const loginResult: Result<void, AuthFlowError | CredentialValidationError> =
        await login(credentials);

      // Check if the result is Ok
      if (loginResult.isOk()) {
        return ok({
          success: true,
          message: 'Login successful',
        });
      }

      // Map the error to a PipelineError (isErr() case)
      const error = loginResult.error;
      const statusCode =
        'statusCode' in error && typeof error.statusCode === 'number'
          ? error.statusCode
          : undefined;

      return err({
        type: 'SUBMISSION_ERROR',
        message: 'message' in error ? String(error.message || error) : 'Login failed',
        statusCode,
      });
    } catch (error) {
      // Keep try/catch only for unexpected exceptions
      return err({
        type: 'SUBMISSION_ERROR',
        message: error instanceof Error ? error.message : 'Unexpected error occurred during login',
      });
    }
  };

  /**
   * Create the complete form pipeline (without sanitization due to branded types)
   */
  const loginPipeline = createFormPipeline<
    LoginFormData,
    ValidatedLoginData,
    LoginDTO,
    LoginResponse,
    CredentialValidationError
  >({
    validate: validateLoginForm,
    transform: transformToLoginDTO,
    submit: submitLogin,
  });

  /**
   * Handle form submission with pipeline
   */
  const onSubmit = async (formData: LoginFormData) => {
    // Reset errors
    setFieldErrors({});
    setPipelineState(PipelineStates.validating());

    // Execute the complete pipeline
    const result = await loginPipeline(formData);

    // Pattern match on result - pipeline already returns Result, no need for try/catch
    result.match(
      // Success case
      response => {
        setPipelineState(PipelineStates.success(response));
        navigate(from, { replace: true });
      },
      // Error case - use pattern matching for error handling
      error => {
        setPipelineState(PipelineStates.error(error));

        // Extract field-level errors for display
        if (error.type === 'VALIDATION_ERROR') {
          const errors = error.errors;

          if (typeof errors === 'object' && !('type' in errors)) {
            // Multiple field errors
            const formattedErrors: Record<string, string> = {};

            for (const [field, validationError] of Object.entries(errors)) {
              // Add runtime shape guard before casting
              if (
                validationError &&
                typeof validationError === 'object' &&
                'type' in validationError &&
                typeof validationError.type === 'string'
              ) {
                formattedErrors[field] = formatCredentialValidationError(validationError);
              } else {
                // Fallback for unexpected shapes
                formattedErrors[field] = 'Validation error occurred';
              }
            }

            setFieldErrors(formattedErrors);
          }
        }
      }
    );
  };

  /**
   * Render error message based on pipeline state
   */
  const renderErrorAlert = () => {
    return match(pipelineState)
      .with({ status: 'error' }, state => (
        <Form.Item>
          <Alert
            message={formatPipelineError(state.error, formatCredentialValidationError)}
            type="error"
            closable
            onClose={() => {
              setPipelineState(PipelineStates.idle());
            }}
            style={{
              borderRadius: '8px',
              border: '1px solid var(--danger-300)',
              backgroundColor: 'var(--danger-50)',
            }}
          />
        </Form.Item>
      ))
      .otherwise(() => null);
  };

  /**
   * Get button loading state
   */
  const isFormLoading = authLoading || isPipelineLoading(pipelineState);

  /**
   * Get field-specific validation status
   */
  const getFieldValidationProps = (fieldName: keyof LoginFormData) => {
    if (fieldErrors[fieldName]) {
      return {
        validateStatus: 'error' as const,
        help: fieldErrors[fieldName],
      };
    }
    return {};
  };

  // Redirect if already authenticated
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
            {...getFieldValidationProps('usernameOrEmail')}
          >
            <Input
              placeholder="Enter your username or email"
              className="login-input"
              disabled={isFormLoading}
            />
          </Form.Item>

          <Form.Item
            label={<span style={{ color: 'var(--primary-700)', fontWeight: 600 }}>Password</span>}
            name="password"
            rules={[{ required: true, message: 'Password is required' }]}
            {...getFieldValidationProps('password')}
          >
            <Input.Password
              placeholder="Enter your password"
              className="login-input"
              disabled={isFormLoading}
            />
          </Form.Item>

          <Form.Item
            label={<span style={{ color: 'var(--primary-700)', fontWeight: 600 }}>Tenant ID</span>}
            name="tenantId"
            rules={[{ required: true, message: 'Tenant ID is required' }]}
            {...getFieldValidationProps('tenantId')}
          >
            <Input
              placeholder="Enter your tenant ID"
              className="login-input"
              disabled={isFormLoading}
            />
          </Form.Item>

          <Form.Item name="rememberMe" valuePropName="checked" initialValue={false}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '16px',
              }}
            >
              <Checkbox style={{ color: 'var(--primary-600)' }} disabled={isFormLoading}>
                Remember me
              </Checkbox>
            </div>
          </Form.Item>

          {renderErrorAlert()}

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              block
              loading={isFormLoading}
              className="login-submit-button"
            >
              {authLoading
                ? 'Signing In...'
                : match(pipelineState)
                    .with({ status: 'validating' }, () => 'Validating...')
                    .otherwise(() => 'Sign In')}
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
        Secure multi-tenant authentication powered by functional programming
      </Typography.Text>
    </Flex>
  );
};

export default LoginPageFP;
