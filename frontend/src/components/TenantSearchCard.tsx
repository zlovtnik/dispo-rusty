/**
 * TenantSearchCard Component
 * Handles search input and advanced filtering for tenants
 */

import React from 'react';
import { Card, Space, Button, Badge } from 'antd';
import { SearchOutlined, FilterOutlined, SettingOutlined } from '@ant-design/icons';

import { SmartSearchInput, AdvancedFilter } from '@/components/SearchComponents';
import { TENANT_SEARCH_FIELDS } from '@/components/SearchComponents';
import type { UseSearchStateReturn } from '@/hooks/useEnhancedSearch';
import type { SearchFilter } from '@/components/SearchComponents';

interface TenantSearchCardProps {
  searchState: UseSearchStateReturn<any>;
  showAdvancedFilters: boolean;
  loading: boolean;
  onSearch: (query: string) => void;
  onClearFilters: () => void;
  onFiltersChange: (filters: SearchFilter[]) => void;
  onApplyFilters: () => void;
  onToggleAdvancedFilters: () => void;
  onGetTenantSuggestions: () => string[];
}

export const TenantSearchCard: React.FC<TenantSearchCardProps> = React.memo(
  ({
    searchState,
    showAdvancedFilters,
    loading,
    onSearch,
    onClearFilters,
    onFiltersChange,
    onApplyFilters,
    onToggleAdvancedFilters,
    onGetTenantSuggestions,
  }) => {
    return (
      <Card
        title={
          <Space>
            <SearchOutlined />
            <span>Search & Filter</span>
            <Badge count={searchState.filters.length} />
          </Space>
        }
        size="small"
        style={{ marginBottom: '16px' }}
        extra={
          <Space>
            <Button
              type={showAdvancedFilters ? 'primary' : 'default'}
              icon={<FilterOutlined />}
              onClick={onToggleAdvancedFilters}
            >
              {showAdvancedFilters ? 'Hide Filters' : 'Show Filters'}
            </Button>
            <Button
              icon={<SettingOutlined />}
              onClick={() => {
                /* Handle settings */
              }}
            >
              Settings
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          {/* Smart Search Input */}
          <SmartSearchInput
            placeholder="Search tenants by name, ID, or database URL..."
            value={searchState.query}
            onChange={searchState.setQuery}
            onSearch={onSearch}
            onClear={onClearFilters}
            loading={loading}
            suggestions={onGetTenantSuggestions()}
            style={{ maxWidth: '600px' }}
          />

          {/* Advanced Filters */}
          {showAdvancedFilters && (
            <AdvancedFilter
              fields={TENANT_SEARCH_FIELDS}
              filters={searchState.filters}
              onFiltersChange={onFiltersChange}
              onApply={onApplyFilters}
              onClear={onClearFilters}
              loading={loading}
            />
          )}
        </Space>
      </Card>
    );
  }
);

TenantSearchCard.displayName = 'TenantSearchCard';
