/**
 * Tenant Analytics Component
 * Provides comprehensive analytics visualization for tenant usage and performance
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Progress,
  Typography,
  Space,
  Select,
  DatePicker,
  Button,
  Table,
  Tag,
  Tooltip,
  Spin,
  Alert,
  Tabs,
} from 'antd';
import {
  BarChartOutlined,
  LineChartOutlined,
  PieChartOutlined,
  TrendingUpOutlined,
  TrendingDownOutlined,
  DatabaseOutlined,
  UserOutlined,
  ApiOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import type { Tenant } from '@/types/tenant';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { TabPane } = Tabs;

interface TenantAnalyticsProps {
  tenants: Tenant[];
  selectedTenant?: Tenant | null;
  onTenantSelect?: (tenant: Tenant) => void;
  loading?: boolean;
}

interface AnalyticsData {
  totalTenants: number;
  activeTenants: number;
  inactiveTenants: number;
  totalUsers: number;
  totalContacts: number;
  totalApiCalls: number;
  averageResponseTime: number;
  errorRate: number;
  storageUsed: number;
  storageLimit: number;
}

interface UsageMetrics {
  date: string;
  apiCalls: number;
  users: number;
  storage: number;
  errors: number;
}

interface PerformanceMetrics {
  tenantId: string;
  tenantName: string;
  responseTime: number;
  errorRate: number;
  uptime: number;
  lastActivity: Date;
  status: 'healthy' | 'degraded' | 'unhealthy';
}

export const TenantAnalytics: React.FC<TenantAnalyticsProps> = ({
  tenants,
  selectedTenant,
  onTenantSelect,
  loading = false,
}) => {
  const [dateRange, setDateRange] = useState<[any, any] | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<string>('all');
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [usageData, setUsageData] = useState<UsageMetrics[]>([]);
  const [performanceData, setPerformanceData] = useState<PerformanceMetrics[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Mock data generation (replace with actual API calls)
  const generateMockData = useCallback(() => {
    const mockAnalytics: AnalyticsData = {
      totalTenants: tenants.length,
      activeTenants: tenants.filter(t => t.isActive !== false).length,
      inactiveTenants: tenants.filter(t => t.isActive === false).length,
      totalUsers: Math.floor(Math.random() * 1000) + 100,
      totalContacts: Math.floor(Math.random() * 10000) + 1000,
      totalApiCalls: Math.floor(Math.random() * 100000) + 10000,
      averageResponseTime: Math.random() * 200 + 50,
      errorRate: Math.random() * 5,
      storageUsed: Math.random() * 1000 + 100,
      storageLimit: 2000,
    };

    const mockUsage: UsageMetrics[] = Array.from({ length: 30 }, (_, i) => ({
      date: new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      apiCalls: Math.floor(Math.random() * 1000) + 100,
      users: Math.floor(Math.random() * 50) + 10,
      storage: Math.floor(Math.random() * 100) + 50,
      errors: Math.floor(Math.random() * 20),
    }));

    const mockPerformance: PerformanceMetrics[] = tenants.map(tenant => ({
      tenantId: tenant.id,
      tenantName: tenant.name,
      responseTime: Math.random() * 300 + 50,
      errorRate: Math.random() * 10,
      uptime: Math.random() * 20 + 80,
      lastActivity: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
      status: Math.random() > 0.8 ? 'unhealthy' : Math.random() > 0.6 ? 'degraded' : 'healthy',
    }));

    setAnalyticsData(mockAnalytics);
    setUsageData(mockUsage);
    setPerformanceData(mockPerformance);
  }, [tenants]);

  // Load analytics data
  const loadAnalyticsData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      generateMockData();
    } catch (error) {
      console.error('Failed to load analytics data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [generateMockData]);

  // Load data on mount and when tenants change
  useEffect(() => {
    loadAnalyticsData();
  }, [loadAnalyticsData]);

  // Get status color
  const getStatusColor = useCallback((status: string) => {
    switch (status) {
      case 'healthy':
        return 'green';
      case 'degraded':
        return 'orange';
      case 'unhealthy':
        return 'red';
      default:
        return 'gray';
    }
  }, []);

  // Get status icon
  const getStatusIcon = useCallback((status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircleOutlined />;
      case 'degraded':
        return <ExclamationCircleOutlined />;
      case 'unhealthy':
        return <ExclamationCircleOutlined />;
      default:
        return <ClockCircleOutlined />;
    }
  }, []);

  // Performance table columns
  const performanceColumns = [
    {
      title: 'Tenant',
      dataIndex: 'tenantName',
      key: 'tenantName',
      render: (text: string, record: PerformanceMetrics) => (
        <Space>
          <Text strong>{text}</Text>
          {selectedTenant?.id === record.tenantId && <Tag color="blue">Selected</Tag>}
        </Space>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={getStatusColor(status)} icon={getStatusIcon(status)}>
          {status.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Response Time',
      dataIndex: 'responseTime',
      key: 'responseTime',
      render: (time: number) => <Text>{time.toFixed(0)}ms</Text>,
      sorter: (a: PerformanceMetrics, b: PerformanceMetrics) => a.responseTime - b.responseTime,
    },
    {
      title: 'Error Rate',
      dataIndex: 'errorRate',
      key: 'errorRate',
      render: (rate: number) => (
        <Text type={rate > 5 ? 'danger' : rate > 2 ? 'warning' : undefined}>
          {rate.toFixed(1)}%
        </Text>
      ),
      sorter: (a: PerformanceMetrics, b: PerformanceMetrics) => a.errorRate - b.errorRate,
    },
    {
      title: 'Uptime',
      dataIndex: 'uptime',
      key: 'uptime',
      render: (uptime: number) => (
        <Progress
          percent={uptime}
          size="small"
          status={uptime > 95 ? 'success' : uptime > 90 ? 'normal' : 'exception'}
        />
      ),
      sorter: (a: PerformanceMetrics, b: PerformanceMetrics) => a.uptime - b.uptime,
    },
    {
      title: 'Last Activity',
      dataIndex: 'lastActivity',
      key: 'lastActivity',
      render: (date: Date) => <Text type="secondary">{date.toLocaleDateString()}</Text>,
    },
  ];

  if (loading || isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '48px' }}>
        <Spin size="large" />
        <div style={{ marginTop: '16px' }}>
          <Text type="secondary">Loading analytics...</Text>
        </div>
      </div>
    );
  }

  if (!analyticsData) {
    return (
      <Alert
        message="No Analytics Data"
        description="Unable to load analytics data. Please try again later."
        type="warning"
        showIcon
      />
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={2} style={{ margin: 0 }}>
              Tenant Analytics
            </Title>
            <Text type="secondary">Comprehensive insights into tenant usage and performance</Text>
          </Col>
          <Col>
            <Space>
              <RangePicker
                value={dateRange}
                onChange={setDateRange}
                placeholder={['Start Date', 'End Date']}
              />
              <Select value={selectedMetric} onChange={setSelectedMetric} style={{ width: 150 }}>
                <Select.Option value="all">All Metrics</Select.Option>
                <Select.Option value="performance">Performance</Select.Option>
                <Select.Option value="usage">Usage</Select.Option>
                <Select.Option value="errors">Errors</Select.Option>
              </Select>
              <Button icon={<BarChartOutlined />} onClick={loadAnalyticsData} loading={isLoading}>
                Refresh
              </Button>
            </Space>
          </Col>
        </Row>
      </div>

      {/* Overview Statistics */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Total Tenants"
              value={analyticsData.totalTenants}
              prefix={<DatabaseOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Active Tenants"
              value={analyticsData.activeTenants}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Total Users"
              value={analyticsData.totalUsers}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="API Calls (24h)"
              value={analyticsData.totalApiCalls}
              prefix={<ApiOutlined />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Performance Metrics */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col xs={24} sm={12} md={8}>
          <Card>
            <Statistic
              title="Average Response Time"
              value={analyticsData.averageResponseTime}
              suffix="ms"
              precision={0}
              valueStyle={{
                color:
                  analyticsData.averageResponseTime > 200
                    ? '#ff4d4f'
                    : analyticsData.averageResponseTime > 100
                      ? '#faad14'
                      : '#52c41a',
              }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card>
            <Statistic
              title="Error Rate"
              value={analyticsData.errorRate}
              suffix="%"
              precision={1}
              valueStyle={{
                color:
                  analyticsData.errorRate > 3
                    ? '#ff4d4f'
                    : analyticsData.errorRate > 1
                      ? '#faad14'
                      : '#52c41a',
              }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card>
            <div>
              <Text type="secondary">Storage Usage</Text>
              <div style={{ marginTop: '8px' }}>
                <Progress
                  percent={(analyticsData.storageUsed / analyticsData.storageLimit) * 100}
                  status={
                    analyticsData.storageUsed / analyticsData.storageLimit > 0.9
                      ? 'exception'
                      : analyticsData.storageUsed / analyticsData.storageLimit > 0.7
                        ? 'active'
                        : 'success'
                  }
                />
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  {analyticsData.storageUsed.toFixed(0)}GB / {analyticsData.storageLimit}GB
                </Text>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Detailed Analytics Tabs */}
      <Tabs defaultActiveKey="performance" type="card">
        <TabPane
          tab={
            <Space>
              <LineChartOutlined />
              <span>Performance</span>
            </Space>
          }
          key="performance"
        >
          <Card>
            <Table
              columns={performanceColumns}
              dataSource={performanceData}
              rowKey="tenantId"
              pagination={{ pageSize: 10 }}
              onRow={record => ({
                onClick: () => onTenantSelect?.(tenants.find(t => t.id === record.tenantId)!),
                style: { cursor: 'pointer' },
              })}
            />
          </Card>
        </TabPane>

        <TabPane
          tab={
            <Space>
              <BarChartOutlined />
              <span>Usage Trends</span>
            </Space>
          }
          key="usage"
        >
          <Card>
            <Title level={4}>Usage Trends (Last 30 Days)</Title>
            <Text type="secondary">API calls, user activity, and storage usage over time</Text>
            {/* Chart component would go here */}
            <div
              style={{
                height: '300px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#f5f5f5',
                borderRadius: '8px',
                marginTop: '16px',
              }}
            >
              <Text type="secondary">Chart visualization would be implemented here</Text>
            </div>
          </Card>
        </TabPane>

        <TabPane
          tab={
            <Space>
              <PieChartOutlined />
              <span>Distribution</span>
            </Space>
          }
          key="distribution"
        >
          <Card>
            <Title level={4}>Tenant Distribution</Title>
            <Text type="secondary">Distribution of tenants by status, plan, and usage</Text>
            {/* Pie chart component would go here */}
            <div
              style={{
                height: '300px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#f5f5f5',
                borderRadius: '8px',
                marginTop: '16px',
              }}
            >
              <Text type="secondary">Pie chart visualization would be implemented here</Text>
            </div>
          </Card>
        </TabPane>
      </Tabs>
    </div>
  );
};
