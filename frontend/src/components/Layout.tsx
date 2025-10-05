import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  Layout as AntLayout,
  Menu,
  Dropdown,
  Avatar,
  Breadcrumb,
  Typography,
  theme,
  Button,
  Modal,
} from 'antd';
import {
  DashboardOutlined,
  ContactsOutlined,
  UserOutlined,
  LogoutOutlined,
  MenuOutlined,
  HeartOutlined,
} from '@ant-design/icons';

// MDC: Always use Ant Design components for UI - never use raw HTML elements, custom CSS classes, or non-interactive elements. Use only Antd theme colors and components. Replace any custom styling with Ant Design equivalents.

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, tenant, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
      // Use Antd Modal.error instead of alert
      Modal.error({
        title: 'Logout Failed',
        content: 'Failed to logout properly. Please try again.',
      });
    }
  };

  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: 'Dashboard',
    },
    {
      key: '/address-book',
      icon: <ContactsOutlined />,
      label: 'Address Book',
    },
  ];

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'Profile',
      disabled: true,
    },
    {
      type: 'divider' as const,
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Logout',
      onClick: handleLogout,
    },
  ];

  const generateBreadcrumbs = (pathname: string) => {
    const pathMap: Record<string, string> = {
      '/dashboard': 'Dashboard',
      '/address-book': 'Address Book',
    };
    const items = [{ title: 'Home' }];
    if (pathMap[pathname]) {
      items.push({ title: pathMap[pathname] });
    }
    return items;
  };

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <AntLayout.Sider collapsible collapsed={collapsed} onCollapse={(value) => setCollapsed(value)}>
        <div style={{ height: 64, padding: '16px', textAlign: 'center', color: 'white' }}>
          <HeartOutlined style={{ fontSize: 32 }} />
          <div>{tenant?.name || 'Natural Pharmacy System'}</div>
        </div>
        <Menu
          theme="dark"
          selectedKeys={[location.pathname]}
          mode="inline"
          items={menuItems}
          onSelect={({ key }) => navigate(key)}
        />
      </AntLayout.Sider>

      <AntLayout>
        <AntLayout.Header style={{ background: '#fafaf9', padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Button type="text" icon={<MenuOutlined />} onClick={() => setCollapsed(!collapsed)} style={{ fontSize: '16px' }} />
          <Breadcrumb items={generateBreadcrumbs(location.pathname)} />
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <Avatar style={{ backgroundColor: theme.useToken().token.colorPrimary }}>
                {(user?.firstName || user?.username || 'U').charAt(0).toUpperCase()}
              </Avatar>
              <span style={{ marginLeft: 8, display: 'none' }}>{user?.firstName || user?.username}</span>
            </div>
          </Dropdown>
        </AntLayout.Header>

        <AntLayout.Content style={{ margin: '0 16px', padding: 24, background: '#fafaf9' }}>
          {children}
        </AntLayout.Content>

        <AntLayout.Footer style={{ textAlign: 'center' }}>
          © 2025 Natural Pharmacy System. Built with TypeScript, Bun, and React.
          <br />
          Secure multi-tenant platform with JWT authentication
        </AntLayout.Footer>
      </AntLayout>
    </AntLayout>
  );
};
