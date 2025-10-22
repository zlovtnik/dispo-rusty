/**
 * Comprehensive Tenant Management Page
 * Integrates dashboard, search, and management functionality
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Tabs, Card, Space, Button, Typography, Badge, Alert, Row, Col } from 'antd';
import {
  DashboardOutlined,
  SearchOutlined,
  SettingOutlined,
  BarChartOutlined,
  TeamOutlined,
} from '@ant-design/icons';

import { TenantDashboard } from '@/components/TenantDashboard';
import { EnhancedTenantsPage } from './EnhancedTenantsPage';
import { TenantForm } from '@/components/TenantForm';
import { useTenantNotifications } from '@/hooks/useTenantNotifications';
import type { Tenant } from '@/types/tenant';
import { tenantService } from '@/services/api';
import { isApiSuccess } from '@/types/api';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

export const TenantManagementPage: React.FC = () => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');

  const notifications = useTenantNotifications();

  // Load tenants
  const loadTenants = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await tenantService.getAllWithPagination();

      if (result.isErr()) {
        setError(result.error.message);
        notifications.notifyTenantError('load', result.error.message);
        return;
      }

      const apiResponse = result.value;
      if (!isApiSuccess(apiResponse)) {
        setError(apiResponse.error.message);
        notifications.notifyTenantError('load', apiResponse.error.message);
        return;
      }

      setTenants(apiResponse.data.data);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setError(errorMessage);
      notifications.notifyTenantError('load', errorMessage);
    } finally {
      setLoading(false);
    }
  }, [notifications]);

  // Load tenants on mount
  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  // Handle tenant selection
  const handleTenantSelect = useCallback((tenant: Tenant) => {
    setSelectedTenant(tenant);
    setActiveTab('details');
  }, []);

  // Handle tenant edit
  const handleTenantEdit = useCallback((tenant: Tenant) => {
    setEditingTenant(tenant);
    setIsFormOpen(true);
  }, []);

  // Handle tenant delete
  const handleTenantDelete = useCallback(
    async (tenant: Tenant) => {
      try {
        const result = await tenantService.delete(tenant.id);

        if (result.isErr()) {
          notifications.notifyTenantError('delete', result.error.message, tenant.name);
          return;
        }

        const apiResponse = result.value;
        if (!isApiSuccess(apiResponse)) {
          notifications.notifyTenantError('delete', apiResponse.error.message, tenant.name);
          return;
        }

        notifications.notifyTenantDeleted(tenant.name);
        await loadTenants();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        notifications.notifyTenantError('delete', errorMessage, tenant.name);
      }
    },
    [notifications, loadTenants]
  );

  // Handle tenant create
  const handleTenantCreate = useCallback(() => {
    setEditingTenant(null);
    setIsFormOpen(true);
  }, []);

  // Handle form submission
  const handleFormSubmit = useCallback(
    async (values: any) => {
      try {
        let result;

        if (editingTenant) {
          result = await tenantService.update(editingTenant.id, values);
        } else {
          result = await tenantService.create(values);
        }

        if (result.isErr()) {
          return {
            success: false,
            message: 'Operation failed',
            error: result.error.message,
          };
        }

        const apiResponse = result.value;
        if (!isApiSuccess(apiResponse)) {
          return {
            success: false,
            message: 'Operation failed',
            error: apiResponse.error.message,
          };
        }

        await loadTenants();
        return {
          success: true,
          message: editingTenant ? 'Tenant updated successfully' : 'Tenant created successfully',
          tenant: apiResponse.data,
        };
      } catch (error) {
        return {
          success: false,
          message: 'Operation failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
    [editingTenant, loadTenants]
  );

  // Handle form close
  const handleFormClose = useCallback(() => {
    setIsFormOpen(false);
    setEditingTenant(null);
  }, []);

  if (error) {
    return (
      <Card>
        <Alert
          message="Error Loading Tenants"
          description={error}
          type="error"
          showIcon
          action={<Button onClick={loadTenants}>Retry</Button>}
        />
      </Card>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={2} style={{ margin: 0 }}>
              Tenant Management
            </Title>
            <Text type="secondary">Comprehensive tenant administration and monitoring</Text>
          </Col>
          <Col>
            <Space>
              <Button type="primary" onClick={handleTenantCreate} loading={loading}>
                Create Tenant
              </Button>
            </Space>
          </Col>
        </Row>
      </div>

      {/* Main Content */}
      <Tabs activeKey={activeTab} onChange={setActiveTab} type="card" size="large">
        <TabPane
          tab={
            <Space>
              <DashboardOutlined />
              <span>Dashboard</span>
              <Badge count={tenants.length} />
            </Space>
          }
          key="dashboard"
        >
          <TenantDashboard
            tenants={tenants}
            onTenantSelect={handleTenantSelect}
            onTenantEdit={handleTenantEdit}
            onTenantDelete={handleTenantDelete}
            onTenantCreate={handleTenantCreate}
            loading={loading}
          />
        </TabPane>

        <TabPane
          tab={
            <Space>
              <SearchOutlined />
              <span>Search & Filter</span>
            </Space>
          }
          key="search"
        >
          <EnhancedTenantsPage />
        </TabPane>

        <TabPane
          tab={
            <Space>
              <SettingOutlined />
              <span>Settings</span>
            </Space>
          }
          key="settings"
        >
          <Card>
            <Title level={4}>Tenant Settings</Title>
            <Text type="secondary">
              Global tenant management settings and configuration options.
            </Text>
            {/* Settings content will be implemented */}
          </Card>
        </TabPane>

        <TabPane
          tab={
            <Space>
              <BarChartOutlined />
              <span>Analytics</span>
            </Space>
          }
          key="analytics"
        >
          <Card>
            <Title level={4}>Tenant Analytics</Title>
            <Text type="secondary">
              Comprehensive analytics and reporting for tenant usage and performance.
            </Text>
            {/* Analytics content will be implemented */}
          </Card>
        </TabPane>

        <TabPane
          tab={
            <Space>
              <TeamOutlined />
              <span>Users</span>
            </Space>
          }
          key="users"
        >
          <Card>
            <Title level={4}>User Management</Title>
            <Text type="secondary">Manage user access and permissions across tenants.</Text>
            {/* User management content will be implemented */}
          </Card>
        </TabPane>
      </Tabs>

      {/* Tenant Form Modal */}
      <TenantForm
        open={isFormOpen}
        onClose={handleFormClose}
        onSubmit={handleFormSubmit}
        initialValues={
          editingTenant
            ? {
                name: editingTenant.name,
                db_url: editingTenant.db_url,
              }
            : undefined
        }
        mode={editingTenant ? 'edit' : 'create'}
        loading={loading}
      />
    </div>
  );
};
