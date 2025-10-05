import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  Layout,
  Typography,
  Button,
  Row,
  Col,
  Card,
  Space,
  Divider,
} from 'antd';
import {
  SecurityScanOutlined,
  HomeOutlined,
  ThunderboltOutlined,
  HeartOutlined,
} from '@ant-design/icons';

export const HomePage: React.FC = () => {
  const { isAuthenticated } = useAuth();

  // If authenticated, redirect to dashboard
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const features = [
    {
      icon: <SecurityScanOutlined style={{ fontSize: 32 }} />,
      title: 'Secure Authentication',
      description: 'JWT-based login system with comprehensive security measures and multi-tenant support.',
    },
    {
      icon: <HomeOutlined style={{ fontSize: 32 }} />,
      title: 'Multi-Tenant Architecture',
      description: 'Complete tenant isolation ensuring data security and privacy across different organizations.',
    },
    {
      icon: <ThunderboltOutlined style={{ fontSize: 32 }} />,
      title: 'High Performance',
      description: 'Built with Bun runtime for exceptional speed and TypeScript for reliable development.',
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Header style={{ background: '#fafaf9', borderBottom: '1px solid #d9d9d9' }}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
          <Typography.Title level={4} style={{ margin: 0, color: '#1f6b3e' }}>
            <HeartOutlined style={{ marginRight: 8 }} />
            Natural Pharmacy System
          </Typography.Title>
        </div>
      </Layout.Header>

      <Layout.Content style={{ background: '#f7f4f0' }}>
        {/* Hero Section */}
        <div style={{ padding: '64px 24px', textAlign: 'center', maxWidth: 1000, margin: '0 auto' }}>
          <Typography.Title level={1}>Welcome to the Natural Pharmacy System</Typography.Title>
          <Typography.Paragraph style={{ fontSize: 18, marginBottom: 32 }}>
            A modern, secure multi-tenant platform for managing pharmaceutical data
            with JWT authentication and comprehensive tenant isolation.
          </Typography.Paragraph>

          <Space size="large">
            <Link to="/login">
              <Button type="primary" size="large">
                Get Started
              </Button>
            </Link>
            <Link to="/login">
              <Button size="large">
                Sign In
              </Button>
            </Link>
          </Space>
        </div>

        <Divider />

        {/* Features Section */}
        <div style={{ background: '#fff', padding: '64px 24px' }}>
          <Row gutter={[24, 24]}>
            {features.map((feature, index) => (
              <Col xs={24} md={8} key={index}>
                <Card
                  style={{ textAlign: 'center', height: '100%' }}
                  hoverable
                  cover={
                    <div style={{
                      padding: '24px 0',
                      background: '#dcf2e6',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      margin: '-24px -24px 24px -24px'
                    }}>
                      {feature.icon}
                    </div>
                  }
                >
                  <Card.Meta
                    title={<Typography.Title level={4}>{feature.title}</Typography.Title>}
                    description={<Typography.Paragraph>{feature.description}</Typography.Paragraph>}
                  />
                </Card>
              </Col>
            ))}
          </Row>
        </div>
      </Layout.Content>

      <Layout.Footer style={{ textAlign: 'center', background: '#1c1917', color: '#fff' }}>
        © 2025 Natural Pharmacy System. Built with React, TypeScript, and Bun runtime.
      </Layout.Footer>
    </Layout>
  );
};
