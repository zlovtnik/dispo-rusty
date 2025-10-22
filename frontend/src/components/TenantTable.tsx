/**
 * TenantTable Component
 * Displays tenants in a table with pagination, sorting, and actions
 */

import React, { useMemo } from 'react';
import { Card, Table, Button, Space, Typography, Tooltip, Empty, Spin, Badge, Tag } from 'antd';
import {
  ReloadOutlined,
  PlusOutlined,
  EyeOutlined,
  EditOutlined,
  DeleteOutlined,
} from '@ant-design/icons';

import type { Tenant } from '@/types/tenant';
// Define inline types for now
interface SearchState {
  query: string;
  filters: any[];
  sortBy: string | undefined;
  sortOrder: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

interface SearchStats {
  total: number;
  filtered: number;
  searchTime: number;
}

const { Text, Title } = Typography;

interface TenantTableProps {
  searchResults: Tenant[];
  searchState: SearchState;
  searchStats: SearchStats;
  selectedTenants: string[];
  loading: boolean;
  onEditTenant: (tenant: Tenant) => void;
  onDeleteTenant: (tenantId: string) => void;
  onPageChange: (page: number, pageSize: number) => void;
  onSort: (field: string, order: 'asc' | 'desc') => void;
  onSelectionChange: (selectedRowKeys: React.Key[]) => void;
  onRefresh: () => void;
  onNewTenant: () => void;
}

export const TenantTable: React.FC<TenantTableProps> = React.memo(
  ({
    searchResults,
    searchState,
    searchStats,
    selectedTenants,
    loading,
    onEditTenant,
    onDeleteTenant,
    onPageChange,
    onSort,
    onSelectionChange,
    onRefresh,
    onNewTenant,
  }) => {
    const columns = useMemo(
      () => [
        {
          title: 'Name',
          dataIndex: 'name',
          key: 'name',
          sorter: true,
          render: (text: string, record: Tenant) => (
            <div>
              <Text strong>{text}</Text>
              <div>
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  ID: {record.id}
                </Text>
              </div>
            </div>
          ),
        },
        {
          title: 'Database URL',
          dataIndex: 'db_url',
          key: 'db_url',
          render: (url: string) => (
            <div>
              {url ? (
                <Tooltip title={url}>
                  <Text
                    code
                    style={{
                      maxWidth: '200px',
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {url}
                  </Text>
                </Tooltip>
              ) : (
                <Text type="secondary">No database URL</Text>
              )}
            </div>
          ),
        },
        {
          title: 'Created',
          dataIndex: 'created_at',
          key: 'created_at',
          sorter: true,
          render: (date: string) => <Text>{new Date(date).toLocaleDateString()}</Text>,
        },
        {
          title: 'Updated',
          dataIndex: 'updated_at',
          key: 'updated_at',
          sorter: true,
          render: (date: string) => <Text>{new Date(date).toLocaleDateString()}</Text>,
        },
        {
          title: 'Actions',
          key: 'actions',
          render: (_: unknown, record: Tenant) => (
            <Space size="small">
              <Tooltip title="View Details">
                <Button type="text" icon={<EyeOutlined />} size="small" />
              </Tooltip>
              <Tooltip title="Edit Tenant">
                <Button
                  type="text"
                  icon={<EditOutlined />}
                  size="small"
                  onClick={() => {
                    onEditTenant(record);
                  }}
                />
              </Tooltip>
              <Tooltip title="Delete Tenant">
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  size="small"
                  onClick={() => {
                    onDeleteTenant(record.id);
                  }}
                />
              </Tooltip>
            </Space>
          ),
        },
      ],
      [onEditTenant, onDeleteTenant]
    );

    return (
      <Card
        title={
          <Space>
            <Text>Tenants</Text>
            <Badge count={searchResults.length} />
            {searchState.filters.length > 0 && (
              <Tag color="blue">
                {searchState.filters.length} filter{searchState.filters.length !== 1 ? 's' : ''}{' '}
                applied
              </Tag>
            )}
          </Space>
        }
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={onRefresh} loading={loading}>
              Refresh
            </Button>
          </Space>
        }
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px' }}>
            <Spin size="large" />
            <div style={{ marginTop: '16px' }}>
              <Text type="secondary">Searching tenants...</Text>
            </div>
          </div>
        ) : searchResults.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div>
                <Title level={4}>No matching tenants</Title>
                <Text type="secondary">Try adjusting your search criteria or filters.</Text>
                <div style={{ marginTop: '16px' }}>
                  <Button type="primary" icon={<PlusOutlined />} onClick={onNewTenant}>
                    Add Tenant
                  </Button>
                </div>
              </div>
            }
          />
        ) : (
          <Table
            columns={columns}
            dataSource={searchResults}
            rowKey="id"
            pagination={{
              current: searchState.page,
              pageSize: searchState.pageSize,
              total: searchStats.total,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} tenants`,
              onChange: onPageChange,
            }}
            onChange={(pagination, filters, sorter) => {
              const sorterResult = Array.isArray(sorter) ? sorter[0] : sorter;
              if (sorterResult?.field && sorterResult?.order) {
                const order = sorterResult.order === 'ascend' ? 'asc' : 'desc';
                onSort(sorterResult.field as string, order);
              }
            }}
            rowSelection={{
              selectedRowKeys: selectedTenants,
              onChange: onSelectionChange,
            }}
            scroll={{ x: 800 }}
          />
        )}
      </Card>
    );
  }
);

TenantTable.displayName = 'TenantTable';
