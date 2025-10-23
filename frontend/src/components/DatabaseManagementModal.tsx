/**
 * Database Management Modal Component
 * Provides database information and basic management operations for tenants
 */

import React, { useState, useCallback } from 'react';
import {
  Modal,
  Card,
  Row,
  Col,
  Typography,
  Button,
  Space,
  Alert,
  Spin,
  Divider,
  Tooltip,
  Badge,
} from 'antd';
import {
  DatabaseOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
  InfoCircleOutlined,
  CopyOutlined,
} from '@ant-design/icons';

// Dashboard-specific Tenant interface that extends the base with required properties
interface DashboardTenant {
  id: string;
  name: string;
  db_url?: string;
  created_at?: string;
  updated_at?: string;
  isActive?: boolean;
}

const { Title, Text } = Typography;

interface DatabaseInfo {
  status: 'connected' | 'disconnected' | 'error' | 'checking';
  lastChecked?: string;
  connectionString?: string;
  databaseName?: string;
  host?: string;
  port?: string;
}

interface DatabaseManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenants: DashboardTenant[];
  onRefresh?: () => void;
}

export const DatabaseManagementModal: React.FC<DatabaseManagementModalProps> = ({
  isOpen,
  onClose,
  tenants,
  onRefresh,
}) => {
  const [databaseStatuses, setDatabaseStatuses] = useState<Record<string, DatabaseInfo>>({});
  const [checkingStatus, setCheckingStatus] = useState<Record<string, boolean>>({});

  // Parse database URL to extract connection details
  const parseDatabaseUrl = useCallback((dbUrl: string): Partial<DatabaseInfo> => {
    try {
      const url = new URL(dbUrl);
      return {
        connectionString: dbUrl,
        databaseName: url.pathname.slice(1), // Remove leading slash
        host: url.hostname,
        port: url.port || '5432',
      };
    } catch {
      return {
        connectionString: dbUrl,
        status: 'error',
      };
    }
  }, []);

  // Check database connection status
  const checkDatabaseStatus = useCallback(
    async (tenantId: string, dbUrl?: string) => {
      if (!dbUrl) return; // Don't check if no database URL

      setCheckingStatus(prev => ({ ...prev, [tenantId]: true }));

      try {
        // Simulate database connection check
        // In a real implementation, this would make an API call to check the database
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

        const isConnected = Math.random() > 0.2; // 80% success rate for demo

        setDatabaseStatuses(prev => ({
          ...prev,
          [tenantId]: {
            ...parseDatabaseUrl(dbUrl),
            status: isConnected ? 'connected' : 'disconnected',
            lastChecked: new Date().toISOString(),
          },
        }));
      } catch (_error) {
        setDatabaseStatuses(prev => ({
          ...prev,
          [tenantId]: {
            ...parseDatabaseUrl(dbUrl),
            status: 'error',
            lastChecked: new Date().toISOString(),
          },
        }));
      } finally {
        setCheckingStatus(prev => ({ ...prev, [tenantId]: false }));
      }
    },
    [parseDatabaseUrl]
  );

  // Copy connection string to clipboard
  const copyConnectionString = useCallback(async (connectionString: string) => {
    try {
      await navigator.clipboard.writeText(connectionString);
      // You could add a toast notification here
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  }, []);

  // Get status color and icon
  const getStatusDisplay = (
    status: DatabaseInfo['status']
  ): { color: string; icon: React.ReactNode; text: string } => {
    switch (status) {
      case 'connected':
        return { color: 'success', icon: <CheckCircleOutlined />, text: 'Connected' };
      case 'disconnected':
        return { color: 'warning', icon: <ExclamationCircleOutlined />, text: 'Disconnected' };
      case 'error':
        return { color: 'error', icon: <ExclamationCircleOutlined />, text: 'Error' };
      case 'checking':
        return { color: 'processing', icon: <ReloadOutlined spin />, text: 'Checking...' };
      default:
        return { color: 'default', icon: <InfoCircleOutlined />, text: 'Unknown' };
    }
  };

  return (
    <Modal
      title={
        <Space>
          <DatabaseOutlined />
          Database Management
        </Space>
      }
      open={isOpen}
      onCancel={onClose}
      width={800}
      footer={[
        <Button key="refresh" icon={<ReloadOutlined />} onClick={onRefresh}>
          Refresh All
        </Button>,
        <Button key="close" type="primary" onClick={onClose}>
          Close
        </Button>,
      ]}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Alert
          message="Database Management"
          description="Monitor and manage database connections for all tenants. Click 'Check Status' to verify database connectivity."
          type="info"
          showIcon
        />

        <Row gutter={[16, 16]}>
          {tenants.map(tenant => {
            const dbInfo = databaseStatuses[tenant.id];
            const isChecking = checkingStatus[tenant.id];
            const statusDisplay = dbInfo
              ? getStatusDisplay(dbInfo.status)
              : getStatusDisplay('checking');

            return (
              <Col xs={24} lg={12} key={tenant.id}>
                <Card
                  title={
                    <Space>
                      <Text strong>{tenant.name}</Text>
                      <Badge
                        status={
                          statusDisplay.color as
                            | 'success'
                            | 'warning'
                            | 'error'
                            | 'processing'
                            | 'default'
                        }
                        text={statusDisplay.text}
                      />
                    </Space>
                  }
                  extra={
                    <Button
                      size="small"
                      icon={<ReloadOutlined />}
                      loading={isChecking}
                      disabled={!tenant.db_url}
                      onClick={() => checkDatabaseStatus(tenant.id, tenant.db_url)}
                    >
                      Check Status
                    </Button>
                  }
                  hoverable
                >
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    {dbInfo ? (
                      <>
                        <Row gutter={[8, 8]}>
                          <Col span={6}>
                            <Text type="secondary">Host:</Text>
                          </Col>
                          <Col span={18}>
                            <Text code>{dbInfo.host ?? 'N/A'}</Text>
                          </Col>
                        </Row>

                        <Row gutter={[8, 8]}>
                          <Col span={6}>
                            <Text type="secondary">Port:</Text>
                          </Col>
                          <Col span={18}>
                            <Text code>{dbInfo.port ?? 'N/A'}</Text>
                          </Col>
                        </Row>

                        <Row gutter={[8, 8]}>
                          <Col span={6}>
                            <Text type="secondary">Database:</Text>
                          </Col>
                          <Col span={18}>
                            <Text code>{dbInfo.databaseName ?? 'N/A'}</Text>
                          </Col>
                        </Row>

                        <Divider style={{ margin: '8px 0' }} />

                        <Row gutter={[8, 8]}>
                          <Col span={6}>
                            <Text type="secondary">Connection:</Text>
                          </Col>
                          <Col span={18}>
                            <Space.Compact style={{ width: '100%' }}>
                              <Text
                                code
                                style={{
                                  flex: 1,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {dbInfo.connectionString ?? 'N/A'}
                              </Text>
                              <Tooltip title="Copy connection string">
                                <Button
                                  size="small"
                                  icon={<CopyOutlined />}
                                  onClick={() =>
                                    copyConnectionString(dbInfo.connectionString ?? '')
                                  }
                                />
                              </Tooltip>
                            </Space.Compact>
                          </Col>
                        </Row>

                        {dbInfo.lastChecked != null && dbInfo.lastChecked.length > 0 ? (
                          <Row gutter={[8, 8]}>
                            <Col span={6}>
                              <Text type="secondary">Last Checked:</Text>
                            </Col>
                            <Col span={18}>
                              <Text type="secondary">
                                {new Date(dbInfo.lastChecked).toLocaleString()}
                              </Text>
                            </Col>
                          </Row>
                        ) : null}
                      </>
                    ) : (
                      <Space
                        direction="vertical"
                        align="center"
                        style={{ width: '100%', padding: '20px 0' }}
                      >
                        <Spin size="small" />
                        <Text type="secondary">
                          Click "Check Status" to verify database connection
                        </Text>
                      </Space>
                    )}
                  </Space>
                </Card>
              </Col>
            );
          })}
        </Row>

        {tenants.length === 0 && (
          <Card>
            <Space direction="vertical" align="center" style={{ width: '100%', padding: '20px 0' }}>
              <DatabaseOutlined style={{ fontSize: 48, color: '#d9d9d9' }} />
              <Title level={4} type="secondary">
                No Tenants Found
              </Title>
              <Text type="secondary">Create a tenant to manage database connections.</Text>
            </Space>
          </Card>
        )}
      </Space>
    </Modal>
  );
};
