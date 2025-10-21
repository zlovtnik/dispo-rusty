import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Layout, Typography } from 'antd';
import { Button, Space, Divider } from 'antd';
import { Row, Col, Card } from 'antd';
import {
  SecurityScanOutlined,
  HomeOutlined,
  ThunderboltOutlined,
  HeartOutlined,
} from '@ant-design/icons';

const styles = {
  header: {
    background: '#fafaf9',
    borderBottom: '1px solid #d9d9d9',
  },
  headerContent: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
  },
  title: {
    margin: 0,
    color: '#1f6b3e',
  },
};

export const HomePage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // If authenticated, redirect to dashboard
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleGetStarted = () => {
    navigate('/register');
  };

  const handleSignIn = () => {
    navigate('/login');
  };

  const features = [
    {
      id: 1,
      icon: <SecurityScanOutlined style={{ fontSize: 32 }} />,
      title: 'Secure Authentication',
      description:
        'JWT-based login system with comprehensive security measures and multi-tenant support.',
    },
    {
      id: 2,
      icon: <HomeOutlined style={{ fontSize: 32 }} />,
      title: 'Multi-Tenant Architecture',
      description:
        'Complete tenant isolation ensuring data security and privacy across different organizations.',
    },
    {
      id: 3,
      icon: <ThunderboltOutlined style={{ fontSize: 32 }} />,
      title: 'High Performance',
      description:
        'Built with Bun runtime for exceptional speed and TypeScript for reliable development.',
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Header style={styles.header}>
        <div style={styles.headerContent}>
          <Typography.Title level={4} style={styles.title}>
            <HeartOutlined style={{ marginRight: 8 }} />
            Natural Pharmacy System
          </Typography.Title>
        </div>
      </Layout.Header>

      <Layout.Content style={{ background: '#f7f4f0' }}>
        {/* Hero Section */}
        <div
          style={{ padding: '64px 24px', textAlign: 'center', maxWidth: 1000, margin: '0 auto' }}
        >
          <Typography.Title level={1}>Welcome to the Natural Pharmacy System</Typography.Title>
          <Typography.Paragraph style={{ fontSize: 18, marginBottom: 32 }}>
            A modern, secure multi-tenant platform for managing pharmaceutical data with JWT
            authentication and comprehensive tenant isolation.
          </Typography.Paragraph>

          <Space size="large">
            <Button
              type="primary"
              size="large"
              onClick={handleGetStarted}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleGetStarted();
                }
              }}
              aria-label="Get Started - Navigate to registration page"
            >
              Get Started
            </Button>
            <Button 
              size="large"
              onClick={handleSignIn}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSignIn();
                }
              }}
              aria-label="Sign In - Navigate to login page"
            >
              Sign In
            </Button>
          </Space>
        </div>

        <Divider />

        {/* Features Section */}
        <div style={{ background: '#fff', padding: '64px 24px' }}>
          <Row gutter={[24, 24]}>
            {features.map(feature => (
              <Col xs={24} md={8} key={feature.id}>
                <Card
                  style={{ textAlign: 'center', height: '100%' }}
                  hoverable
                  aria-labelledby={`feature-title-${feature.id}`}
                  cover={
                    <div
                      style={{
                        padding: '24px 0',
                        background: '#dcf2e6',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        margin: '0 0 24px 0',
                      }}
                      aria-label={`${feature.title} icon`}
                    >
                      {feature.icon}
                    </div>
                  }
                >
                  <Card.Meta
                    title={
                      <Typography.Title level={4} id={`feature-title-${feature.id}`}>
                        {feature.title}
                      </Typography.Title>
                    }
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
