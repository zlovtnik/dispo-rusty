/**
 * Enhanced Tenant Dashboard Component
 * Provides comprehensive tenant management with improved UI/UX
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Progress,
  Button,
  Space,
  Typography,
  Tag,
  Tooltip,
  Badge,
  Alert,
  Timeline,
  List,
  Avatar,
} from 'antd';
import {
  DatabaseOutlined,
  SettingOutlined,
  PlusOutlined,
  EyeOutlined,
  EditOutlined,
  DeleteOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { DatabaseManagementModal } from './DatabaseManagementModal';

const { Title, Text } = Typography;

// Dashboard-specific Tenant interface that extends the base with required properties
interface DashboardTenant {
  id: string;
  name: string;
  isActive?: boolean;
  db_url?: string;
  created_at?: string;
  updated_at?: string;
}

interface TenantDashboardProps {
  tenants: DashboardTenant[];
  onTenantSelect: (tenant: DashboardTenant) => void;
  onTenantEdit: (tenant: DashboardTenant) => void;
  onTenantDelete: (tenant: DashboardTenant) => void;
  onTenantCreate: () => void;
  onRefresh?: () => void;
  loading?: boolean;
}

interface TenantStats {
  total: number;
  active: number;
  inactive: number;
  withDatabase: number;
  recentlyCreated: number;
  healthScore: number;
}

export const TenantDashboard: React.FC<TenantDashboardProps> = ({
  tenants,
  onTenantSelect,
  onTenantEdit,
  onTenantDelete,
  onTenantCreate,
  onRefresh,
  loading = false,
}) => {
  const [selectedTenant, setSelectedTenant] = useState<DashboardTenant | null>(null);
  const [isDatabaseModalOpen, setIsDatabaseModalOpen] = useState(false);

  // Database management handlers
  const handleOpenDatabaseManagement = useCallback(() => {
    setIsDatabaseModalOpen(true);
  }, []);

  const handleCloseDatabaseManagement = useCallback(() => {
    setIsDatabaseModalOpen(false);
  }, []);

  // Calculate tenant statistics
  const tenantStats = useMemo((): TenantStats => {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    return {
      total: tenants.length,
      active: tenants.filter(t => t.isActive === true).length,
      inactive: tenants.filter(t => t.isActive === false).length,
      withDatabase: tenants.filter(t => t.db_url != null && t.db_url.trim() !== '').length,
      recentlyCreated: tenants.filter(
        t => t.created_at != null && new Date(t.created_at) > oneWeekAgo
      ).length,
      healthScore:
        tenants.length > 0
          ? Math.round(
              (tenants.filter(t => t.db_url != null && t.isActive === true).length /
                tenants.length) *
                100
            )
          : 0,
    };
  }, [tenants]);

  // Get recent tenant activities
  const recentActivities = useMemo(() => {
    return tenants
      .sort((a, b) => {
        const dateA = a.updated_at != null ? new Date(a.updated_at).getTime() : 0;
        const dateB = b.updated_at != null ? new Date(b.updated_at).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, 5)
      .map(tenant => ({
        tenant,
        action: 'Updated',
        timestamp: tenant.updated_at,
        status:
          tenant.isActive === true ? 'success' : tenant.isActive === false ? 'error' : 'warning',
      }));
  }, [tenants]);

  const handleTenantSelect = useCallback(
    (tenant: DashboardTenant) => {
      setSelectedTenant(tenant);
      onTenantSelect(tenant);
    },
    [onTenantSelect]
  );

  const getTenantStatus = useCallback((tenant: DashboardTenant) => {
    if (tenant.isActive === false) return { color: 'red', text: 'Inactive' };
    if (tenant.db_url == null || tenant.db_url.trim() === '')
      return { color: 'orange', text: 'No Database' };
    return { color: 'green', text: 'Active' };
  }, []);

  const getHealthColor = useCallback((score: number) => {
    if (score >= 80) return '#52c41a';
    if (score >= 60) return '#faad14';
    return '#ff4d4f';
  }, []);

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={2} style={{ margin: 0 }}>
              Tenant Dashboard
            </Title>
            <Text type="secondary">Manage and monitor your tenant infrastructure</Text>
          </Col>
          <Col>
            <Space>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={onTenantCreate}
                loading={loading}
              >
                Create Tenant
              </Button>
              <Button
                icon={<SyncOutlined />}
                onClick={() => {
                  onRefresh?.();
                }}
              >
                Refresh
              </Button>
            </Space>
          </Col>
        </Row>
      </div>

      {/* Statistics Overview */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Total Tenants"
              value={tenantStats.total}
              prefix={<DatabaseOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Active Tenants"
              value={tenantStats.active}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="With Database"
              value={tenantStats.withDatabase}
              prefix={<DatabaseOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Recently Created"
              value={tenantStats.recentlyCreated}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Health Score */}
      <Card style={{ marginBottom: '24px' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={4} style={{ margin: 0 }}>
              System Health Score
            </Title>
            <Text type="secondary">Overall tenant infrastructure health</Text>
          </Col>
          <Col>
            <div style={{ textAlign: 'right' }}>
              <Text
                style={{
                  fontSize: '24px',
                  fontWeight: 'bold',
                  color: getHealthColor(tenantStats.healthScore),
                }}
              >
                {tenantStats.healthScore}%
              </Text>
            </div>
          </Col>
        </Row>
        <Progress
          percent={tenantStats.healthScore}
          strokeColor={getHealthColor(tenantStats.healthScore)}
          style={{ marginTop: '16px' }}
        />
      </Card>

      <Row gutter={[16, 16]}>
        {/* Tenant List */}
        <Col xs={24} lg={16}>
          <Card
            title={
              <Space>
                <Text>Tenants</Text>
                <Badge count={tenants.length} />
              </Space>
            }
            extra={
              <Button type="link" icon={<SettingOutlined />} disabled>
                Settings
              </Button>
            }
          >
            <List
              dataSource={tenants}
              loading={loading}
              renderItem={tenant => {
                const status = getTenantStatus(tenant);
                const isSelected = selectedTenant?.id === tenant.id;

                return (
                  <List.Item
                    style={{
                      backgroundColor: isSelected ? '#f0f8ff' : 'transparent',
                      borderRadius: '8px',
                      padding: '12px',
                      cursor: 'pointer',
                      border: isSelected ? '2px solid #1890ff' : '1px solid #f0f0f0',
                    }}
                    onClick={() => {
                      handleTenantSelect(tenant);
                    }}
                    actions={[
                      <Tooltip title="View Details" key="view">
                        <Button
                          type="text"
                          icon={<EyeOutlined />}
                          onClick={e => {
                            e.stopPropagation();
                            handleTenantSelect(tenant);
                          }}
                        />
                      </Tooltip>,
                      <Tooltip title="Edit Tenant" key="edit">
                        <Button
                          type="text"
                          icon={<EditOutlined />}
                          onClick={e => {
                            e.stopPropagation();
                            onTenantEdit(tenant);
                          }}
                        />
                      </Tooltip>,
                      <Tooltip title="Delete Tenant" key="delete">
                        <Button
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={e => {
                            e.stopPropagation();
                            onTenantDelete(tenant);
                          }}
                        />
                      </Tooltip>,
                    ]}
                  >
                    <List.Item.Meta
                      avatar={
                        <Avatar
                          icon={<DatabaseOutlined />}
                          style={{ backgroundColor: status.color }}
                        />
                      }
                      title={
                        <Space>
                          <Text strong>{tenant.name}</Text>
                          <Tag color={status.color}>{status.text}</Tag>
                        </Space>
                      }
                      description={
                        <Space direction="vertical" size="small">
                          <Text type="secondary" style={{ fontSize: '12px' }}>
                            ID: {tenant.id}
                          </Text>
                          {tenant.db_url != null && (
                            <Text
                              code
                              style={{
                                fontSize: '11px',
                                maxWidth: '200px',
                                display: 'block',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {tenant.db_url}
                            </Text>
                          )}
                          <Text type="secondary" style={{ fontSize: '11px' }}>
                            Created:{' '}
                            {tenant.created_at != null
                              ? new Date(tenant.created_at).toLocaleDateString()
                              : 'Unknown'}
                          </Text>
                        </Space>
                      }
                    />
                  </List.Item>
                );
              }}
            />
          </Card>
        </Col>

        {/* Recent Activities */}
        <Col xs={24} lg={8}>
          <Card title="Recent Activities">
            <Timeline
              items={recentActivities.map(activity => ({
                dot:
                  activity.status === 'success' ? (
                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                  ) : (
                    <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
                  ),
                children: (
                  <div
                    key={
                      activity.tenant.id ??
                      `${activity.tenant.name}-${activity.timestamp ?? 'unknown'}`
                    }
                  >
                    <Text strong>{activity.tenant.name}</Text>
                    <Text type="secondary" style={{ marginLeft: '8px' }}>
                      {activity.action}
                    </Text>
                    <div>
                      <Text type="secondary" style={{ fontSize: '12px' }}>
                        {activity.timestamp != null
                          ? new Date(activity.timestamp).toLocaleString()
                          : 'Unknown'}
                      </Text>
                    </div>
                  </div>
                ),
              }))}
            />
          </Card>

          {/* Quick Actions */}
          <Card title="Quick Actions" style={{ marginTop: '16px' }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button type="primary" icon={<PlusOutlined />} onClick={onTenantCreate} block>
                Create New Tenant
              </Button>
              <Button icon={<DatabaseOutlined />} onClick={handleOpenDatabaseManagement} block>
                Manage Databases
              </Button>
              <Button
                icon={<SettingOutlined />}
                onClick={() => {
                  /* Handle system settings - feature not yet implemented */
                }}
                block
                disabled
              >
                System Settings
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>

      {/* Health Alerts */}
      {tenantStats.healthScore < 80 && (
        <Alert
          message="System Health Alert"
          description={`Your tenant infrastructure health is at ${tenantStats.healthScore.toString()}%. Consider reviewing inactive tenants or missing database configurations.`}
          type="warning"
          showIcon
          style={{ marginTop: '16px' }}
          action={
            <Button
              size="small"
              onClick={() => {
                /* Handle health improvement */
              }}
            >
              Improve Health
            </Button>
          }
        />
      )}

      {/* Database Management Modal */}
      <DatabaseManagementModal
        isOpen={isDatabaseModalOpen}
        onClose={handleCloseDatabaseManagement}
        tenants={tenants as unknown}
        onRefresh={onRefresh}
      />
    </div>
  );
};
