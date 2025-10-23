/**
 * Enhanced Tenant Form Component
 * Provides comprehensive validation and error handling for tenant operations
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Modal,
  Form,
  Input,
  Button,
  Space,
  Alert,
  Divider,
  Row,
  Col,
  Typography,
  Card,
  Tag,
  Tooltip,
  Spin,
} from 'antd';
import {
  DatabaseOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import type { Tenant } from '@/types/tenant';
import { useTenantNotifications, type TenantOperationResult } from '@/hooks/useTenantNotifications';

const { Title, Text } = Typography;

interface TenantFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: TenantFormValues) => Promise<TenantOperationResult>;
  initialValues?: Partial<TenantFormValues>;
  mode: 'create' | 'edit';
  loading?: boolean;
}

interface TenantFormValues {
  name: string;
  db_url: string;
  description?: string;
  settings?: {
    theme?: string;
    timezone?: string;
    features?: string[];
  };
}

interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
  warnings: string[];
}

export const TenantForm: React.FC<TenantFormProps> = ({
  open,
  onClose,
  onSubmit,
  initialValues,
  mode,
  loading = false,
}) => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult>({
    isValid: true,
    errors: {},
    warnings: [],
  });
  const [connectionStatus, setConnectionStatus] = useState<
    'idle' | 'testing' | 'success' | 'error'
  >('idle');

  const notifications = useTenantNotifications();

  // Reset form when modal opens/closes
  useEffect(() => {
    if (open) {
      form.resetFields();
      if (initialValues) {
        form.setFieldsValue(initialValues);
      }
      setValidationResult({ isValid: true, errors: {}, warnings: [] });
      setConnectionStatus('idle');
    }
  }, [open, initialValues, form]);

  // Validate tenant name
  const validateTenantName = useCallback((name: string): string | null => {
    if (name?.trim().length === 0) {
      return 'Tenant name is required';
    }
    if (name.trim().length < 3) {
      return 'Tenant name must be at least 3 characters long';
    }
    if (name.trim().length > 50) {
      return 'Tenant name must be less than 50 characters';
    }
    if (!/^[a-zA-Z0-9\s\-_]+$/.test(name.trim())) {
      return 'Tenant name can only contain letters, numbers, spaces, hyphens, and underscores';
    }
    return null;
  }, []);

  // Validate database URL
  const validateDatabaseUrl = useCallback((url: string): string | null => {
    if (url?.trim().length === 0) {
      return 'Database URL is required';
    }

    try {
      const urlObj = new URL(url);
      if (!['postgresql:', 'mysql:', 'sqlite:'].includes(urlObj.protocol)) {
        return 'Database URL must use postgresql, mysql, or sqlite protocol';
      }
    } catch {
      return 'Database URL must be a valid URL';
    }

    return null;
  }, []);

  // Test database connection
  const testDatabaseConnection = useCallback(async (url: string) => {
    if (url?.trim().length === 0) {
      setConnectionStatus('idle');
      return;
    }

    setConnectionStatus('testing');

    try {
      // Simulate connection test (replace with actual implementation)
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Mock validation logic
      const isValid =
        url.includes('postgresql://') || url.includes('mysql://') || url.includes('sqlite://');

      if (isValid) {
        setConnectionStatus('success');
      } else {
        setConnectionStatus('error');
      }
    } catch (error) {
      setConnectionStatus('error');
    }
  }, []);

  // Comprehensive form validation
  const validateForm = useCallback(
    (values: TenantFormValues): ValidationResult => {
      const errors: Record<string, string> = {};
      const warnings: string[] = [];

      // Validate name
      const nameError = validateTenantName(values.name);
      if (nameError) {
        errors.name = nameError;
      }

      // Validate database URL
      const urlError = validateDatabaseUrl(values.db_url);
      if (urlError) {
        errors.db_url = urlError;
      }

      // Additional validations
      if (values.description && values.description.length > 500) {
        errors.description = 'Description must be less than 500 characters';
      }

      // Warnings
      if (values.db_url && /(?:localhost|127\.0\.0\.1|\[::1\])/i.test(values.db_url)) {
        warnings.push(
          'Using a localhost database URL (localhost, 127.0.0.1, or ::1) may not be accessible in production'
        );
      }

      if (values.name?.toLowerCase().includes('test')) {
        warnings.push('Tenant name contains "test" - ensure this is intentional');
      }

      return {
        isValid: Object.keys(errors).length === 0,
        errors,
        warnings,
      };
    },
    [validateTenantName, validateDatabaseUrl]
  );

  // Handle form submission
  const handleSubmit = useCallback(
    async (values: TenantFormValues) => {
      setSubmitting(true);

      try {
        // Validate form
        const validation = validateForm(values);
        setValidationResult(validation);

        if (!validation.isValid) {
          notifications.notifyValidationError(validation.errors);
          return;
        }

        // Show warnings if any
        if (validation.warnings.length > 0) {
          validation.warnings.forEach(warning => {
            notifications.showWarningNotification('Warning', warning);
          });
        }

        // Submit form
        const result = await onSubmit(values);
        notifications.handleOperationResult(result, mode);

        if (result.success) {
          form.resetFields();
          onClose();
        }
      } catch (error) {
        notifications.notifyTenantError(
          mode === 'create' ? 'create' : 'update',
          error instanceof Error ? error.message : 'Unknown error occurred'
        );
      } finally {
        setSubmitting(false);
      }
    },
    [mode, validateForm, onSubmit, notifications, form, onClose]
  );

  // Handle database URL change
  const handleDatabaseUrlChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const url = e.target.value;
      testDatabaseConnection(url);
    },
    [testDatabaseConnection]
  );

  const getConnectionStatusIcon = () => {
    switch (connectionStatus) {
      case 'testing':
        return <LoadingOutlined />;
      case 'success':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'error':
        return <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />;
      default:
        return <InfoCircleOutlined style={{ color: '#1890ff' }} />;
    }
  };

  const getConnectionStatusText = () => {
    switch (connectionStatus) {
      case 'testing':
        return 'Testing connection...';
      case 'success':
        return 'Connection successful';
      case 'error':
        return 'Connection failed';
      default:
        return 'Enter database URL to test connection';
    }
  };

  return (
    <Modal
      title={
        <Space>
          <DatabaseOutlined />
          <Text>{mode === 'create' ? 'Create New Tenant' : 'Edit Tenant'}</Text>
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={600}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={initialValues}
        disabled={submitting}
      >
        {/* Validation Errors */}
        {!validationResult.isValid && (
          <Alert
            message="Validation Errors"
            description={
              <ul style={{ margin: 0, paddingLeft: '20px' }}>
                {Object.entries(validationResult.errors).map(([field, error]) => (
                  <li key={field}>{error}</li>
                ))}
              </ul>
            }
            type="error"
            showIcon
            style={{ marginBottom: '16px' }}
          />
        )}

        {/* Warnings */}
        {validationResult.warnings.length > 0 && (
          <Alert
            message="Warnings"
            description={
              <ul style={{ margin: 0, paddingLeft: '20px' }}>
                {validationResult.warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            }
            type="warning"
            showIcon
            style={{ marginBottom: '16px' }}
          />
        )}

        {/* Basic Information */}
        <Card title="Basic Information" size="small" style={{ marginBottom: '16px' }}>
          <Form.Item
            name="name"
            label="Tenant Name"
            rules={[
              { required: true, message: 'Please enter tenant name' },
              { min: 3, message: 'Name must be at least 3 characters' },
              { max: 50, message: 'Name must be less than 50 characters' },
              {
                pattern: /^[a-zA-Z0-9\s\-_]+$/,
                message: 'Name can only contain letters, numbers, spaces, hyphens, and underscores',
              },
            ]}
            hasFeedback
          >
            <Input placeholder="Enter tenant name" maxLength={50} showCount />
          </Form.Item>

          <Form.Item
            name="description"
            label="Description (Optional)"
            rules={[{ max: 500, message: 'Description must be less than 500 characters' }]}
          >
            <Input.TextArea
              placeholder="Enter tenant description"
              rows={3}
              maxLength={500}
              showCount
            />
          </Form.Item>
        </Card>

        {/* Database Configuration */}
        <Card title="Database Configuration" size="small" style={{ marginBottom: '16px' }}>
          <Form.Item
            name="db_url"
            label="Database URL"
            rules={[
              { required: true, message: 'Please enter database URL' },
              { type: 'url', message: 'Please enter a valid URL' },
            ]}
            hasFeedback
          >
            <Input
              placeholder="postgresql://username:password@localhost:5432/database"
              onChange={handleDatabaseUrlChange}
              suffix={getConnectionStatusIcon()}
            />
          </Form.Item>

          {/* Connection Status */}
          <div style={{ marginTop: '8px' }}>
            <Space>
              {getConnectionStatusIcon()}
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {getConnectionStatusText()}
              </Text>
            </Space>
          </div>

          {/* Database URL Examples */}
          <div style={{ marginTop: '12px' }}>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              Examples:
            </Text>
            <div style={{ marginTop: '4px' }}>
              <Tag>postgresql://user:pass@localhost:5432/db</Tag>
              <Tag>mysql://user:pass@localhost:3306/db</Tag>
              <Tag>sqlite:///path/to/database.db</Tag>
            </div>
          </div>
        </Card>

        {/* Advanced Settings */}
        <Card title="Advanced Settings" size="small" style={{ marginBottom: '16px' }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name={['settings', 'theme']} label="Theme">
                <Input placeholder="light" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name={['settings', 'timezone']} label="Timezone">
                <Input placeholder="UTC" />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* Form Actions */}
        <Divider />
        <div style={{ textAlign: 'right' }}>
          <Space>
            <Button onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={submitting}
              disabled={!validationResult.isValid}
            >
              {mode === 'create' ? 'Create Tenant' : 'Update Tenant'}
            </Button>
          </Space>
        </div>

        {/* Submission Loading */}
        {submitting && (
          <div style={{ marginTop: '16px', textAlign: 'center' }}>
            <Spin size="default" />
            <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginTop: '8px' }}>
              {mode === 'create' ? 'Creating tenant...' : 'Updating tenant...'}
            </Text>
          </div>
        )}
      </Form>
    </Modal>
  );
};
