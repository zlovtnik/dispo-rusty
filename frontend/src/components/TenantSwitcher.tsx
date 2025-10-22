/**
 * Tenant Switcher Component
 * Provides tenant switching functionality with search and recent tenants
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Select,
  Avatar,
  Typography,
  Space,
  Button,
  Tooltip,
  Badge,
  Divider,
  Input,
  List,
  Card,
  Tag,
  Modal,
  Spin,
} from 'antd';
import {
  SwapOutlined,
  SearchOutlined,
  PlusOutlined,
  SettingOutlined,
  HistoryOutlined,
  StarOutlined,
  TeamOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';
import type { Tenant } from '@/types/tenant';
import { useTenantNotifications } from '@/hooks/useTenantNotifications';

const { Text, Title } = Typography;
const { Option } = Select;

interface TenantSwitcherProps {
  currentTenant: Tenant | null;
  tenants: Tenant[];
  onTenantChange: (tenant: Tenant) => void;
  onTenantCreate: () => void;
  loading?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

interface RecentTenant {
  tenant: Tenant;
  lastAccessed: Date;
  accessCount: number;
}

export const TenantSwitcher: React.FC<TenantSwitcherProps> = ({
  currentTenant,
  tenants,
  onTenantChange,
  onTenantCreate,
  loading = false,
  className,
  style,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [recentTenants, setRecentTenants] = useState<RecentTenant[]>([]);
  const [favoriteTenants, setFavoriteTenants] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const notifications = useTenantNotifications();

  // Load recent tenants from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('recentTenants');
    if (stored) {
      try {
        const recent = JSON.parse(stored);
        setRecentTenants(recent);
      } catch (error) {
        console.error('Failed to load recent tenants:', error);
      }
    }

    const storedFavorites = localStorage.getItem('favoriteTenants');
    if (storedFavorites) {
      try {
        const favorites = JSON.parse(storedFavorites);
        setFavoriteTenants(favorites);
      } catch (error) {
        console.error('Failed to load favorite tenants:', error);
      }
    }
  }, []);

  // Filter tenants based on search term
  const filteredTenants = useMemo(() => {
    if (!searchTerm.trim()) return tenants;

    const term = searchTerm.toLowerCase();
    return tenants.filter(
      tenant =>
        tenant.name.toLowerCase().includes(term) ||
        tenant.id.toLowerCase().includes(term) ||
        (tenant.db_url && tenant.db_url.toLowerCase().includes(term))
    );
  }, [tenants, searchTerm]);

  // Get tenant status
  const getTenantStatus = useCallback((tenant: Tenant) => {
    if (!tenant.isActive) return { color: 'red', text: 'Inactive' };
    if (!tenant.db_url || tenant.db_url.trim() === '')
      return { color: 'orange', text: 'No Database' };
    return { color: 'green', text: 'Active' };
  }, []);

  // Handle tenant selection
  const handleTenantSelect = useCallback(
    async (tenant: Tenant) => {
      setIsLoading(true);

      try {
        // Update recent tenants
        const updatedRecent = [
          { tenant, lastAccessed: new Date(), accessCount: 1 },
          ...recentTenants.filter(rt => rt.tenant.id !== tenant.id),
        ].slice(0, 10); // Keep last 10

        setRecentTenants(updatedRecent);
        localStorage.setItem('recentTenants', JSON.stringify(updatedRecent));

        // Switch tenant
        onTenantChange(tenant);
        setIsOpen(false);

        notifications.showInfoNotification(
          'Tenant Switched',
          `Switched to tenant "${tenant.name}"`
        );
      } catch (error) {
        notifications.showErrorNotification(
          'Switch Failed',
          'Failed to switch tenant. Please try again.'
        );
      } finally {
        setIsLoading(false);
      }
    },
    [recentTenants, onTenantChange, notifications]
  );

  // Toggle favorite tenant
  const toggleFavorite = useCallback(
    (tenantId: string) => {
      const updated = favoriteTenants.includes(tenantId)
        ? favoriteTenants.filter(id => id !== tenantId)
        : [...favoriteTenants, tenantId];

      setFavoriteTenants(updated);
      localStorage.setItem('favoriteTenants', JSON.stringify(updated));
    },
    [favoriteTenants]
  );

  // Get favorite tenants
  const favoriteTenantsList = useMemo(() => {
    return tenants.filter(tenant => favoriteTenants.includes(tenant.id));
  }, [tenants, favoriteTenants]);

  // Get recent tenants (excluding current)
  const recentTenantsList = useMemo(() => {
    return recentTenants
      .filter(rt => rt.tenant.id !== currentTenant?.id)
      .slice(0, 5)
      .map(rt => rt.tenant);
  }, [recentTenants, currentTenant]);

  // Render tenant option
  const renderTenantOption = useCallback(
    (tenant: Tenant) => {
      const status = getTenantStatus(tenant);
      const isFavorite = favoriteTenants.includes(tenant.id);
      const isCurrent = currentTenant?.id === tenant.id;

      return (
        <div
          key={tenant.id}
          style={{
            padding: '12px',
            cursor: 'pointer',
            borderRadius: '8px',
            backgroundColor: isCurrent ? '#f0f8ff' : 'transparent',
            border: isCurrent ? '2px solid #1890ff' : '1px solid transparent',
          }}
          onClick={() => !isCurrent && handleTenantSelect(tenant)}
        >
          <Space>
            <Avatar icon={<DatabaseOutlined />} style={{ backgroundColor: status.color }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Text strong>{tenant.name}</Text>
                {isCurrent && <Tag color="blue">Current</Tag>}
                <Tag color={status.color}>{status.text}</Tag>
                {isFavorite && <StarOutlined style={{ color: '#faad14' }} />}
              </div>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                ID: {tenant.id}
              </Text>
              {tenant.db_url && (
                <div>
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
                </div>
              )}
            </div>
            <Space>
              <Tooltip title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}>
                <Button
                  type="text"
                  size="small"
                  icon={<StarOutlined />}
                  onClick={e => {
                    e.stopPropagation();
                    toggleFavorite(tenant.id);
                  }}
                  style={{ color: isFavorite ? '#faad14' : undefined }}
                />
              </Tooltip>
            </Space>
          </Space>
        </div>
      );
    },
    [currentTenant, getTenantStatus, favoriteTenants, handleTenantSelect, toggleFavorite]
  );

  return (
    <div className={className} style={style}>
      {/* Current Tenant Display */}
      <Button
        type="text"
        onClick={() => {
          setIsOpen(true);
        }}
        loading={loading}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          height: 'auto',
        }}
      >
        <Avatar
          icon={<DatabaseOutlined />}
          style={{
            backgroundColor: currentTenant ? getTenantStatus(currentTenant).color : '#d9d9d9',
          }}
        />
        <div style={{ textAlign: 'left' }}>
          <div>
            <Text strong>{currentTenant ? currentTenant.name : 'Select Tenant'}</Text>
          </div>
          {currentTenant && (
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {getTenantStatus(currentTenant).text}
            </Text>
          )}
        </div>
        <SwapOutlined />
      </Button>

      {/* Tenant Switcher Modal */}
      <Modal
        title={
          <Space>
            <SwapOutlined />
            <Text>Switch Tenant</Text>
          </Space>
        }
        open={isOpen}
        onCancel={() => {
          setIsOpen(false);
        }}
        footer={null}
        width={600}
        destroyOnClose
      >
        <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
          {/* Search */}
          <Input
            placeholder="Search tenants..."
            prefix={<SearchOutlined />}
            value={searchTerm}
            onChange={e => {
              setSearchTerm(e.target.value);
            }}
            style={{ marginBottom: '16px' }}
          />

          {/* Quick Actions */}
          <div style={{ marginBottom: '16px' }}>
            <Space>
              <Button type="primary" icon={<PlusOutlined />} onClick={onTenantCreate} size="small">
                Create Tenant
              </Button>
              <Button
                icon={<SettingOutlined />}
                onClick={() => {
                  /* Handle settings */
                }}
                size="small"
              >
                Settings
              </Button>
            </Space>
          </div>

          {/* Favorites */}
          {favoriteTenantsList.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <Title level={5}>
                <StarOutlined style={{ color: '#faad14' }} /> Favorites
              </Title>
              <List dataSource={favoriteTenantsList} renderItem={renderTenantOption} size="small" />
              <Divider />
            </div>
          )}

          {/* Recent Tenants */}
          {recentTenantsList.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <Title level={5}>
                <HistoryOutlined /> Recent
              </Title>
              <List dataSource={recentTenantsList} renderItem={renderTenantOption} size="small" />
              <Divider />
            </div>
          )}

          {/* All Tenants */}
          <div>
            <Title level={5}>
              <TeamOutlined /> All Tenants ({filteredTenants.length})
            </Title>
            {isLoading ? (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <Spin />
                <div style={{ marginTop: '8px' }}>
                  <Text type="secondary">Switching tenant...</Text>
                </div>
              </div>
            ) : (
              <List
                dataSource={filteredTenants}
                renderItem={renderTenantOption}
                size="small"
                locale={{
                  emptyText: searchTerm
                    ? 'No tenants found matching your search'
                    : 'No tenants available',
                }}
              />
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};
