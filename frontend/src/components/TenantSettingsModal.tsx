/**
 * Tenant Settings Modal Component
 * Provides tenant configuration options including theme, language, timezone, and branding
 */

import React, { useState, useEffect } from 'react';
import {
  Modal,
  Form,
  Input,
  Select,
  ColorPicker,
  Switch,
  Space,
  Divider,
  Typography,
  Button,
  message,
} from 'antd';
import {
  SettingOutlined,
  BgColorsOutlined,
  GlobalOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import type { TenantSettings } from '@/types/auth';

const { Title, Text } = Typography;
const { Option } = Select;

interface TenantSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: TenantSettings) => void;
  currentSettings?: TenantSettings;
  loading?: boolean;
}

export const TenantSettingsModal: React.FC<TenantSettingsModalProps> = ({
  isOpen,
  onClose,
  onSave,
  currentSettings,
  loading = false,
}) => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  // Initialize form with current settings
  useEffect(() => {
    if (isOpen && currentSettings) {
      form.setFieldsValue({
        theme: currentSettings.theme,
        language: currentSettings.language,
        timezone: currentSettings.timezone,
        dateFormat: currentSettings.dateFormat,
        features: currentSettings.features,
        primaryColor: currentSettings.branding.primaryColor,
        secondaryColor: currentSettings.branding.secondaryColor,
        accentColor: currentSettings.branding.accentColor,
      });
    }
  }, [isOpen, currentSettings, form]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const settings: TenantSettings = {
        theme: values.theme,
        language: values.language,
        timezone: values.timezone,
        dateFormat: values.dateFormat,
        features: values.features || [],
        branding: {
          primaryColor: values.primaryColor,
          secondaryColor: values.secondaryColor,
          accentColor: values.accentColor,
        },
      };

      await onSave(settings);
      message.success('Settings saved successfully');
      onClose();
    } catch (error) {
      console.error('Failed to save settings:', error);
      message.error('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    onClose();
  };

  const themeOptions = [
    { value: 'light', label: 'Light Theme' },
    { value: 'dark', label: 'Dark Theme' },
    { value: 'natural', label: 'Natural Theme' },
  ];

  const languageOptions = [
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Spanish' },
    { value: 'fr', label: 'French' },
    { value: 'de', label: 'German' },
    { value: 'zh', label: 'Chinese' },
  ];

  const timezoneOptions = [
    { value: 'UTC', label: 'UTC' },
    { value: 'America/New_York', label: 'Eastern Time (ET)' },
    { value: 'America/Chicago', label: 'Central Time (CT)' },
    { value: 'America/Denver', label: 'Mountain Time (MT)' },
    { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
    { value: 'Europe/London', label: 'London (GMT)' },
    { value: 'Europe/Paris', label: 'Paris (CET)' },
    { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  ];

  const dateFormatOptions = [
    { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (US)' },
    { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (EU)' },
    { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (ISO)' },
    { value: 'DD MMM YYYY', label: 'DD MMM YYYY' },
  ];

  const featureOptions = [
    { value: 'analytics', label: 'Analytics Dashboard' },
    { value: 'notifications', label: 'Real-time Notifications' },
    { value: 'export', label: 'Data Export' },
    { value: 'api_access', label: 'API Access' },
    { value: 'custom_fields', label: 'Custom Fields' },
    { value: 'advanced_search', label: 'Advanced Search' },
  ];

  return (
    <Modal
      title={
        <Space>
          <SettingOutlined />
          <span>Tenant Settings</span>
        </Space>
      }
      open={isOpen}
      onCancel={handleCancel}
      width={800}
      footer={[
        <Button key="cancel" onClick={handleCancel}>
          Cancel
        </Button>,
        <Button key="save" type="primary" loading={saving} onClick={handleSave}>
          Save Settings
        </Button>,
      ]}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          theme: 'natural',
          language: 'en',
          timezone: 'UTC',
          dateFormat: 'MM/DD/YYYY',
          features: [],
          primaryColor: '#1890ff',
          secondaryColor: '#52c41a',
          accentColor: '#faad14',
        }}
      >
        {/* Appearance Section */}
        <div>
          <Title level={4}>
            <BgColorsOutlined style={{ marginRight: 8 }} />
            Appearance
          </Title>
          <Form.Item name="theme" label="Theme" tooltip="Choose the visual theme for your tenant">
            <Select placeholder="Select theme">
              {themeOptions.map(option => (
                <Option key={option.value} value={option.value}>
                  {option.label}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="primaryColor"
            label="Primary Color"
            tooltip="Main brand color used throughout the interface"
          >
            <ColorPicker showText />
          </Form.Item>

          <Form.Item
            name="secondaryColor"
            label="Secondary Color"
            tooltip="Secondary brand color for accents and highlights"
          >
            <ColorPicker showText />
          </Form.Item>

          <Form.Item
            name="accentColor"
            label="Accent Color"
            tooltip="Accent color for interactive elements and call-to-actions"
          >
            <ColorPicker showText />
          </Form.Item>
        </div>

        <Divider />

        {/* Localization Section */}
        <div>
          <Title level={4}>
            <GlobalOutlined style={{ marginRight: 8 }} />
            Localization
          </Title>
          <Form.Item name="language" label="Language" tooltip="Interface language for your tenant">
            <Select placeholder="Select language">
              {languageOptions.map(option => (
                <Option key={option.value} value={option.value}>
                  {option.label}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="timezone"
            label="Timezone"
            tooltip="Default timezone for date and time display"
          >
            <Select placeholder="Select timezone">
              {timezoneOptions.map(option => (
                <Option key={option.value} value={option.value}>
                  {option.label}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="dateFormat"
            label="Date Format"
            tooltip="How dates should be displayed throughout the system"
          >
            <Select placeholder="Select date format">
              {dateFormatOptions.map(option => (
                <Option key={option.value} value={option.value}>
                  {option.label}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </div>

        <Divider />

        {/* Features Section */}
        <div>
          <Title level={4}>
            <ClockCircleOutlined style={{ marginRight: 8 }} />
            Features
          </Title>
          <Form.Item
            name="features"
            label="Enabled Features"
            tooltip="Select which features are available for this tenant"
          >
            <Select
              mode="multiple"
              placeholder="Select features to enable"
              style={{ width: '100%' }}
            >
              {featureOptions.map(option => (
                <Option key={option.value} value={option.value}>
                  {option.label}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </div>

        <Divider />

        <Text type="secondary">
          Changes will be applied immediately and affect all users in this tenant.
        </Text>
      </Form>
    </Modal>
  );
};
