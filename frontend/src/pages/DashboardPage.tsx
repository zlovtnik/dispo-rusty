import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';
import { Card, Row, Col, Statistic, Alert, List, Avatar, Space, Button, Tag, Divider } from 'antd';
import {
  ContactsOutlined,
  HeartOutlined,
  BarsOutlined,
  CheckCircleOutlined,
  DesktopOutlined,
  ApiOutlined,
  CodeOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';

export const DashboardPage: React.FC = () => {
  const { user, tenant } = useAuth();

  const recentActivities = [
    {
      title: 'Application started',
      description: 'Multi-tenant React frontend with Bun',
      time: 'Just now',
    },
    {
      title: 'Authentication successful',
      description: 'JWT token validated for tenant access',
      time: 'Just now',
    },
    {
      title: 'Dashboard loaded',
      description: 'Application ready for use',
      time: 'Just now',
    },
  ];

  const technologies = [
    {
      name: 'TypeScript',
      version: '5.9+',
      icon: <DesktopOutlined />,
      color: 'blue',
    },
    {
      name: 'Bun',
      version: '1.0+',
      icon: <ThunderboltOutlined />,
      color: 'gold',
    },
    {
      name: 'React',
      version: '18.3.1',
      icon: <CodeOutlined />,
      color: 'blue',
    },
    {
      name: 'Actix Web',
      version: 'Backend',
      icon: <ApiOutlined />,
      color: 'orange',
    },
  ];

  const COLOR_MAP: Record<string, string> = {
    blue: '#1890ff',
    gold: '#faad14',
    orange: '#fa8c16',
    default: '#fa8c16',
  };

  const getColor = (color: string): string => {
    return COLOR_MAP[color] ?? COLOR_MAP.default!;
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Welcome Section */}
      <Alert
        message={`Welcome back, ${user?.firstName || user?.username}!`}
        description={`You're logged in to tenant ${tenant?.name} (${tenant?.id})`}
        type="success"
        showIcon
        closable={false}
      />

      {/* Quick Stats */}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card
            hoverable
            actions={[
              <Link to="/address-book" key="view">
                <Button type="primary" block>
                  View Address Book
                </Button>
              </Link>,
            ]}
          >
            <Card.Meta
              avatar={<ContactsOutlined style={{ fontSize: 24 }} />}
              title="Address Book"
              description="Manage your contacts and addresses"
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card hoverable>
            <Card.Meta
              avatar={<HeartOutlined style={{ fontSize: 24, color: 'green' }} />}
              title="System Health"
              description="Check API and system status"
            />
            <Divider />
            <Space>
              <CheckCircleOutlined style={{ color: 'green' }} />
              <span>All systems operational</span>
            </Space>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card hoverable>
            <Card.Meta
              avatar={<HeartOutlined style={{ fontSize: 24 }} />}
              title="User Profile"
              description="Manage your account settings"
            />
            <Divider />
            <div style={{ fontSize: '12px' }}>
              <div>
                <strong>Email:</strong> {user?.email}
              </div>
              <div>
                <strong>Username:</strong> {user?.username}
              </div>
              <div>
                <strong>Roles:</strong> {user?.roles?.join(', ') || 'None'}
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Recent Activity */}
      <Card
        title={
          <>
            <BarsOutlined style={{ marginRight: 8 }} />
            Recent Activity
          </>
        }
        hoverable
      >
        <List
          dataSource={recentActivities}
          renderItem={item => (
            <List.Item>
              <List.Item.Meta title={item.title} description={item.description} />
              <Tag>{item.time}</Tag>
            </List.Item>
          )}
        />
      </Card>

      {/* Technology Stack */}
      <Card title="Technology Stack" hoverable>
        <Row gutter={[16, 16]}>
          {technologies.map(tech => (
            <Col xs={12} sm={6} key={tech.name}>
              <Card size="small" style={{ textAlign: 'center' }}>
                <Avatar
                  size="large"
                  icon={tech.icon}
                  style={{ backgroundColor: getColor(tech.color) }}
                />
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontWeight: 500 }}>{tech.name}</div>
                  <div style={{ fontSize: '12px', color: '#666' }}>{tech.version}</div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>
    </Space>
  );
};
