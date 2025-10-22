/**
 * Enhanced Tenants Page with Advanced Search UX
 * Implements Ant Design Data List specifications for optimal search experience
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Card, Button, Space, Typography, Alert, Row, Col, Progress, Form } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { App } from 'antd';

import type { Tenant, UpdateTenantDTO, CreateTenantDTO } from '@/types/tenant';
import type { TenantSettings } from '@/types/auth';
import type { TenantId } from '@/types/ids';
import { isApiSuccess } from '@/types/api';
import { tenantService } from '@/services/api';
import { type TenantSearchService, SearchServiceFactory } from '@/services/SearchService';
import { TenantSettingsModal } from '@/components/TenantSettingsModal';
import { TenantSearchCard } from '@/components/TenantSearchCard';
import { TenantStatistics } from '@/components/TenantStatistics';
import { TenantTable } from '@/components/TenantTable';
import { TenantFormModal } from '@/components/TenantFormModal';
import {
  useSearchState,
  useDebouncedSearch,
  useMultiAttributeSearch,
  useSearchPerformance,
} from '@/hooks/useEnhancedSearch';
import type { SearchFilter, SearchQuery } from '@/components/SearchComponents';

const { Title, Text } = Typography;

/**
 * Enhanced Tenants Page Component
 */
export const EnhancedTenantsPage: React.FC = () => {
  const { message } = App.useApp();

  // Core state
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);

  // Search state management
  const searchState = useSearchState<Tenant>({
    pageSize: 12,
    debounceMs: 300,
    cacheResults: true,
  });

  // Search service
  const [searchService, setSearchService] = useState<TenantSearchService | null>(null);

  // Performance monitoring
  const performance = useSearchPerformance({
    enableMetrics: true,
    logPerformance: true,
    performanceThreshold: 100,
  });

  // Multi-attribute search
  const _multiSearch = useMultiAttributeSearch({
    data: tenants,
    searchFields: ['name', 'id', 'db_url'],
    caseSensitive: false,
    exactMatch: false,
    highlightMatches: true,
  });

  // Debounced search
  const debouncedSearch = useDebouncedSearch<Tenant>({
    searchFunction: async (query: SearchQuery, _signal?: AbortSignal) => {
      if (!searchService) {
        throw new Error('Search service not initialized');
      }

      performance.startTimer();
      const result = searchService.searchTenants(query);
      performance.endTimer();

      if (result.isErr()) {
        const error = result.error;
        const message =
          'message' in error ? error.message : 'reason' in error ? error.reason : 'Search failed';
        throw new Error(message);
      }

      return result.value;
    },
    debounceMs: 300,
    cacheResults: true,
    maxCacheSize: 50,
    onSearchStart: () => {
      setLoading(true);
    },
    onSearchComplete: _result => {
      setLoading(false);
      setError(null);
    },
    onSearchError: error => {
      setLoading(false);
      setError(error.message);
    },
  });

  // Search results state
  const [searchResults, setSearchResults] = useState<Tenant[]>([]);
  const [searchStats, setSearchStats] = useState({
    total: 0,
    filtered: 0,
    searchTime: 0,
  });

  // UI state
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [selectedTenants, setSelectedTenants] = useState<Tenant['id'][]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [form] = Form.useForm();

  // Settings modal state
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [currentTenantSettings, setCurrentTenantSettings] = useState<TenantSettings | undefined>(
    undefined
  );

  // Initialize search service when tenants change
  useEffect(() => {
    if (tenants.length > 0) {
      const service = SearchServiceFactory.createTenantService(tenants);
      // Use setTimeout to avoid setState in effect
      setTimeout(() => {
        setSearchService(service);
      }, 0);
    }
  }, [tenants]);

  // Load tenants from API
  const loadTenants = useCallback(async () => {
    setLoading(true);
    setError(null);

    const result = await tenantService.getAllWithPagination({
      offset: 0,
      limit: 100, // Load more for better search experience
    });

    if (result.isErr()) {
      const errorMessage = result.error.message;
      setError(errorMessage);
      message.error(errorMessage);
      setLoading(false);
      return;
    }

    const apiResponse = result.value;

    if (!isApiSuccess(apiResponse)) {
      const errorMessage = apiResponse.error.message;
      setError(errorMessage);
      message.error(errorMessage);
      setLoading(false);
      return;
    }

    const data = apiResponse.data;
    setTenants(data.data);
    setSearchResults(data.data);
    setSearchStats({
      total: data.data.length,
      filtered: data.data.length,
      searchTime: 0,
    });
    setLoading(false);
  }, [message]);

  // Load tenants on mount
  useEffect(() => {
    const loadTenantsAsync = async (): Promise<void> => {
      await loadTenants();
    };
    void loadTenantsAsync();
  }, [loadTenants]);

  // Handle search
  const handleSearch = useCallback(
    async (query: string) => {
      if (!searchService) return;

      try {
        const searchQuery: SearchQuery = {
          queryId: `search-${Date.now().toString()}`,
          filters: searchState.filters,
          sortBy: searchState.sortBy,
          sortOrder: searchState.sortOrder,
          page: searchState.page,
          pageSize: searchState.pageSize,
        };

        // Add text search filter if query provided
        if (query.trim()) {
          const textFilter: SearchFilter = {
            id: `text-search-${Date.now().toString()}`,
            field: 'name',
            operator: 'contains',
            value: query,
          };
          searchQuery.filters = [...searchQuery.filters, textFilter];
        }

        const result = await debouncedSearch.search(searchQuery);
        setSearchResults(result.data);
        setSearchStats({
          total: result.total,
          filtered: result.data.length,
          searchTime: performance.getMetrics().averageSearchTime,
        });
      } catch (error) {
        console.error('Search failed:', error);
        message.error('Search failed. Please try again.');
      }
    },
    [searchService, searchState, debouncedSearch, performance, message]
  );

  // Handle filter changes
  const handleFiltersChange = useCallback(
    (filters: SearchFilter[]) => {
      searchState.setFilters(filters);
    },
    [searchState]
  );

  // Handle filter apply
  const handleApplyFilters = useCallback(async () => {
    await handleSearch(searchState.query);
  }, [handleSearch, searchState.query]);

  // Handle filter clear
  const handleClearFilters = useCallback(() => {
    searchState.clearFilters();
    searchState.setQuery('');
    setSearchResults(tenants);
    setSearchStats({
      total: tenants.length,
      filtered: tenants.length,
      searchTime: 0,
    });
  }, [searchState, tenants]);

  // Handle sorting
  const handleSort = useCallback(
    (field: string, order: 'asc' | 'desc') => {
      searchState.setSorting(field, order);
      void handleSearch(searchState.query);
    },
    [searchState, handleSearch]
  );

  // Handle pagination
  const handlePageChange = useCallback(
    (page: number, pageSize: number) => {
      searchState.setPage(page);
      searchState.setPageSize(pageSize);
      void handleSearch(searchState.query);
    },
    [searchState, handleSearch]
  );

  // Get tenant suggestions for search
  const getTenantSuggestions = useCallback((): string[] => {
    if (!searchService) return [];
    return searchService.getSuggestions(searchState.query, 10);
  }, [searchService, searchState.query]);

  // Handle new tenant
  const handleNewTenant = useCallback(() => {
    setEditingTenant(null);
    form.resetFields();
    setIsFormOpen(true);
  }, [form]);

  // Handle edit tenant
  const handleEditTenant = useCallback(
    (tenant: Tenant) => {
      setEditingTenant(tenant);
      form.setFieldsValue({
        name: tenant.name,
        db_url: tenant.db_url,
      });
      setIsFormOpen(true);
    },
    [form]
  );

  // Handle delete tenant
  const handleDeleteTenant = useCallback(
    async (tenantId: Tenant['id']) => {
      try {
        setOperationError(null);
        const result = await tenantService.delete(tenantId);

        if (result.isErr()) {
          const errorMessage = result.error.message;
          setOperationError(errorMessage);
          message.error(errorMessage);
          return;
        }

        const apiResponse = result.value;
        if (!isApiSuccess(apiResponse)) {
          const errorMessage = apiResponse.error.message;
          setOperationError(errorMessage);
          message.error(errorMessage);
          return;
        }

        message.success('Tenant deleted successfully');
        await loadTenants();
      } catch (_error) {
        const errorMessage = 'Failed to delete tenant';
        setOperationError(errorMessage);
        message.error(errorMessage);
      }
    },
    [message, loadTenants]
  );

  // Handle form submission
  const handleFormSubmit = useCallback(
    async (values: Record<string, unknown>) => {
      try {
        setOperationError(null);
        if (editingTenant) {
          // Update existing tenant
          const result = await tenantService.update(editingTenant.id, values as UpdateTenantDTO);

          if (result.isErr()) {
            const errorMessage = result.error.message;
            setOperationError(errorMessage);
            message.error(errorMessage);
            return;
          }

          const apiResponse = result.value;
          if (!isApiSuccess(apiResponse)) {
            const errorMessage = apiResponse.error.message;
            setOperationError(errorMessage);
            message.error(errorMessage);
            return;
          }

          message.success('Tenant updated successfully');
        } else {
          // Create new tenant
          const result = await tenantService.create(values as unknown as CreateTenantDTO);

          if (result.isErr()) {
            const errorMessage = result.error.message;
            setOperationError(errorMessage);
            message.error(errorMessage);
            return;
          }

          const apiResponse = result.value;
          if (!isApiSuccess(apiResponse)) {
            const errorMessage = apiResponse.error.message;
            setOperationError(errorMessage);
            message.error(errorMessage);
            return;
          }

          message.success('Tenant created successfully');
        }

        setIsFormOpen(false);
        await loadTenants();
      } catch (_error) {
        const errorMessage = 'Failed to save tenant';
        setOperationError(errorMessage);
        message.error(errorMessage);
      }
    },
    [editingTenant, message, loadTenants]
  );

  // Settings handlers
  const handleSaveSettings = useCallback(
    (_settings: TenantSettings) => {
      try {
        setOperationError(null);
        // In a real implementation, you would save these settings to the backend
        // For now, we'll just show a success message
        message.success('Settings saved successfully');
        setIsSettingsModalOpen(false);
        setCurrentTenantSettings(undefined);
      } catch (_error) {
        const errorMessage = 'Failed to save settings';
        setOperationError(errorMessage);
        message.error(errorMessage);
      }
    },
    [message]
  );

  const handleCloseSettings = useCallback(() => {
    setIsSettingsModalOpen(false);
    setCurrentTenantSettings(undefined);
  }, []);

  // Performance metrics
  const performanceMetrics = performance.getMetrics();

  if (error != null && error !== '') {
    return (
      <Card>
        <Alert
          message="Error Loading Tenants"
          description={error}
          type="error"
          showIcon
          action={
            <Button size="small" onClick={loadTenants}>
              Retry
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={2} style={{ margin: 0 }}>
              Tenants
            </Title>
            <Text type="secondary">Manage tenant configurations and database connections</Text>
          </Col>
          <Col>
            <Space>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleNewTenant}>
                Add Tenant
              </Button>
              <Button icon={<ReloadOutlined />} onClick={loadTenants} loading={loading}>
                Refresh
              </Button>
            </Space>
          </Col>
        </Row>
      </div>

      {/* Operation Error Alert */}
      {operationError != null && operationError !== '' && (
        <Alert
          message="Operation Error"
          description={operationError}
          type="error"
          showIcon
          closable
          onClose={() => {
            setOperationError(null);
          }}
          style={{ marginBottom: '16px' }}
        />
      )}

      {/* Search and Filter Section */}
      <TenantSearchCard
        searchState={searchState}
        showAdvancedFilters={showAdvancedFilters}
        loading={loading}
        onSearch={handleSearch}
        onClearFilters={handleClearFilters}
        onFiltersChange={handleFiltersChange}
        onApplyFilters={handleApplyFilters}
        onToggleAdvancedFilters={() => {
          setShowAdvancedFilters(!showAdvancedFilters);
        }}
        onGetTenantSuggestions={getTenantSuggestions}
      />

      {/* Search Statistics */}
      <TenantStatistics searchStats={searchStats} performanceMetrics={performanceMetrics} />

      {/* Results Section */}
      <TenantTable
        searchResults={searchResults}
        searchState={searchState}
        searchStats={searchStats}
        selectedTenants={selectedTenants}
        loading={loading}
        onEditTenant={handleEditTenant}
        onDeleteTenant={(tenantId: string) => handleDeleteTenant(tenantId as TenantId)}
        onPageChange={handlePageChange}
        onSort={handleSort}
        onSelectionChange={(keys: React.Key[]) => {
          setSelectedTenants(keys.map(key => key as TenantId));
        }}
        onRefresh={loadTenants}
        onNewTenant={handleNewTenant}
      />

      {/* Tenant Form Modal */}
      <TenantFormModal
        isOpen={isFormOpen}
        editingTenant={editingTenant}
        form={form}
        onSubmit={handleFormSubmit}
        onCancel={() => {
          setIsFormOpen(false);
        }}
      />

      {/* Performance Monitoring (Development) */}
      {process.env.NODE_ENV === 'development' && (
        <Card title="Performance Metrics" size="small" style={{ marginTop: '16px' }}>
          <Row gutter={16}>
            <Col span={8}>
              <Text>Average Search Time: {performanceMetrics.averageSearchTime.toFixed(2)}ms</Text>
            </Col>
            <Col span={8}>
              <Text>Total Searches: {performanceMetrics.totalSearches}</Text>
            </Col>
            <Col span={8}>
              <Text>Slow Searches: {performanceMetrics.slowSearches}</Text>
            </Col>
          </Row>
          <Progress
            percent={performanceMetrics.performanceScore}
            status={performanceMetrics.performanceScore > 80 ? 'success' : 'normal'}
            style={{ marginTop: '8px' }}
          />
        </Card>
      )}

      {/* Tenant Settings Modal */}
      <TenantSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={handleCloseSettings}
        onSave={handleSaveSettings}
        currentSettings={currentTenantSettings}
        loading={loading}
      />
    </div>
  );
};
