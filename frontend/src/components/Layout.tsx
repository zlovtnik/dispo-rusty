import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  Layout as AntLayout,
  Menu,
  Dropdown,
  Avatar,
  Breadcrumb,
  theme,
  Button,
  Modal,
  Grid,
} from 'antd';
import {
  DashboardOutlined,
  ContactsOutlined,
  UserOutlined,
  LogoutOutlined,
  MenuOutlined,
  HeartOutlined,
  DatabaseOutlined,
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

  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();

  const layoutStyles = {
    siderHeader: {
      height: 64,
      padding: token.paddingMD,
      textAlign: 'center' as const,
      color: token.colorTextLightSolid,
      background: `linear-gradient(135deg, #1a3037 0%, #203b45 100%)`,
    },
    sider: {
      background: `linear-gradient(135deg, #203b45 0%, #15262a 100%)`,
    },
    header: {
      background: token.colorBgContainer,
      padding: `0 ${token.paddingMD}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    content: {
      margin: `0 ${token.paddingMD}`,
      padding: token.paddingLG,
      background: token.colorBgContainer,
    },
  };

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
    {
      key: '/tenants',
      icon: <DatabaseOutlined />,
      label: 'Tenants',
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
      '/tenants': 'Tenants',
    };
    const items = [{ title: 'Home' }];
    if (pathMap[pathname]) {
      items.push({ title: pathMap[pathname] });
    }
    return items;
  };

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <AntLayout.Sider
        collapsible
        collapsed={collapsed}
        onCollapse={value => {
          setCollapsed(value);
        }}
        trigger={null}
        style={layoutStyles.sider}
      >
        <div style={layoutStyles.siderHeader}>
          <HeartOutlined style={{ fontSize: 32 }} />
          <div>{tenant?.name || 'Natural Pharmacy System'}</div>
        </div>
        <Menu
          theme="dark"
          selectedKeys={[location.pathname]}
          mode="inline"
          items={menuItems}
          onSelect={({ key }) => {
            navigate(key);
          }}
        />
      </AntLayout.Sider>

      <AntLayout>
        <AntLayout.Header style={layoutStyles.header}>
          <Button
            type="text"
            icon={<MenuOutlined />}
            aria-label="Toggle menu"
            onClick={() => {
              setCollapsed(!collapsed);
            }}
            style={{ fontSize: token.fontSizeLG, color: token.colorTextSecondary }}
          />
          <Breadcrumb items={generateBreadcrumbs(location.pathname)} />
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <Avatar style={{ backgroundColor: token.colorPrimary }}>
                {(user?.firstName || user?.username || 'U').charAt(0).toUpperCase()}
              </Avatar>
              <span
                style={{
                  marginLeft: 8,
                  display: screens.md ? 'inline' : 'none',
                }}
              >
                {user?.firstName || user?.username}
              </span>
            </div>
          </Dropdown>
        </AntLayout.Header>

        <AntLayout.Content style={layoutStyles.content}>{children}</AntLayout.Content>

        <AntLayout.Footer
          style={{
            textAlign: 'center',
            borderTop: `4px solid ${token.colorBorderSecondary}`,
            padding: '20px 0',
            background: token.colorFill,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            margin: `0 -${token.paddingMD}`,
            boxSizing: 'border-box',
          }}
        >
          <div>© 2025 Natural Pharmacy System. Built with TypeScript, Bun, and React.</div>
          <div>Secure multi-tenant platform with JWT authentication</div>
        </AntLayout.Footer>
      </AntLayout>
    </AntLayout>
  );
};
