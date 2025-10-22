/**
 * Enhanced Address Book Page with Advanced Search UX
 * Implements Ant Design Data List specifications for optimal search experience
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Typography,
  Divider,
  Input,
  Select,
  Tag,
  Badge,
  Tooltip,
  Empty,
  Spin,
  Alert,
  Row,
  Col,
  Collapse,
  Affix,
  Statistic,
  Progress,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  FilterOutlined,
  ClearOutlined,
  ReloadOutlined,
  SettingOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
  EyeOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { App } from 'antd';

import { useAuth } from '@/contexts/AuthContext';
import { isApiSuccess } from '@/types/api';
import { asContactId, asTenantId, asUserId } from '@/types/ids';
import type { Contact } from '@/types/contact';
import { addressBookService } from '@/services/api';
import { type ContactSearchService, SearchServiceFactory } from '@/services/SearchService';
import {
  SmartSearchInput,
  AdvancedFilter,
  SearchResults,
  CONTACT_SEARCH_FIELDS,
} from '@/components/SearchComponents';
import {
  useSearchState,
  useDebouncedSearch,
  useMultiAttributeSearch,
  useSearchPerformance,
} from '@/hooks/useEnhancedSearch';
import type { SearchFilter, SearchQuery } from '@/components/SearchComponents';

const { Title, Text } = Typography;
const { Option } = Select;
const { Panel } = Collapse;

/**
 * Enhanced Address Book Page Component
 */
export const EnhancedAddressBookPage: React.FC = () => {
  const { tenant } = useAuth();
  const { message } = App.useApp();

  // Core state
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search state management
  const searchState = useSearchState<Contact>({
    pageSize: 10,
    debounceMs: 300,
    cacheResults: true,
  });

  // Search service
  const [searchService, setSearchService] = useState<ContactSearchService | null>(null);

  // Performance monitoring
  const performance = useSearchPerformance({
    enableMetrics: true,
    logPerformance: true,
    performanceThreshold: 100,
  });

  // Multi-attribute search
  const multiSearch = useMultiAttributeSearch({
    data: contacts,
    searchFields: ['fullName', 'email', 'phone', 'company'],
    caseSensitive: false,
    exactMatch: false,
    highlightMatches: true,
  });

  // Debounced search
  const debouncedSearch = useDebouncedSearch<Contact>({
    searchFunction: async (query: SearchQuery) => {
      if (!searchService) {
        throw new Error('Search service not initialized');
      }

      performance.startTimer();
      const result = searchService.searchContacts(query);
      performance.endTimer();

      if (result.isErr()) {
        throw new Error(result.error.reason);
      }

      return result.value;
    },
    debounceMs: 300,
    cacheResults: true,
    maxCacheSize: 50,
    onSearchStart: () => {
      setLoading(true);
    },
    onSearchComplete: result => {
      setLoading(false);
      setError(null);
    },
    onSearchError: error => {
      setLoading(false);
      setError(error.message);
    },
  });

  // Search results state
  const [searchResults, setSearchResults] = useState<Contact[]>([]);
  const [searchStats, setSearchStats] = useState({
    total: 0,
    filtered: 0,
    searchTime: 0,
  });

  // UI state
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<Contact['id'][]>([]);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  // Initialize search service when contacts change
  useEffect(() => {
    if (contacts.length > 0) {
      const service = SearchServiceFactory.createContactService(contacts);
      setSearchService(service);
    }
  }, [contacts]);

  // Load contacts from API
  const loadContacts = useCallback(async () => {
    if (!tenant) {
      setContacts([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const result = await addressBookService.getAll();

    if (result.isErr()) {
      const errorMessage = 'Failed to load contacts';
      setError(errorMessage);
      message.error(errorMessage);
      setLoading(false);
      return;
    }

    const apiResponse = result.value;

    if (!isApiSuccess(apiResponse)) {
      const errorMessage = apiResponse.error.message || 'Failed to load contacts';
      setError(errorMessage);
      message.error(errorMessage);
      setLoading(false);
      return;
    }

    const data = apiResponse.data;
    const records = Array.isArray(data?.contacts) ? data.contacts : [];
    setContacts(records);
    setSearchResults(records);
    setSearchStats({
      total: records.length,
      filtered: records.length,
      searchTime: 0,
    });
    setLoading(false);
  }, [tenant, message]);

  // Load contacts on mount
  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  // Handle search
  const handleSearch = useCallback(
    async (query: string) => {
      if (!searchService) return;

      try {
        const searchQuery: SearchQuery = {
          queryId: `search-${Date.now()}`,
          filters: searchState.filters,
          sortBy: searchState.sortBy,
          sortOrder: searchState.sortOrder,
          page: searchState.page,
          pageSize: searchState.pageSize,
        };

        // Add text search filter if query provided
        if (query.trim()) {
          const textFilter: SearchFilter = {
            id: `text-search-${Date.now()}`,
            field: 'fullName',
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
        if (process.env.NODE_ENV === 'development') {
          console.error('Search failed:', error);
        }
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
    setSearchResults(contacts);
    setSearchStats({
      total: contacts.length,
      filtered: contacts.length,
      searchTime: 0,
    });
  }, [searchState, contacts]);

  // Handle sorting
  const handleSort = useCallback(
    (field: string, order: 'asc' | 'desc') => {
      searchState.setSorting(field, order);
      handleSearch(searchState.query);
    },
    [searchState, handleSearch]
  );

  // Handle pagination
  const handlePageChange = useCallback(
    (page: number, pageSize: number) => {
      searchState.setPage(page);
      searchState.setPageSize(pageSize);
      handleSearch(searchState.query);
    },
    [searchState, handleSearch]
  );

  // Get contact suggestions for search
  const getContactSuggestions = useCallback((): string[] => {
    if (!searchService) return [];
    return searchService.getSuggestions(searchState.query, 10);
  }, [searchService, searchState.query]);

  // Table columns
  const columns = useMemo(
    () => [
      {
        title: 'Name',
        dataIndex: 'fullName',
        key: 'fullName',
        sorter: true,
        render: (text: string, record: Contact) => (
          <div>
            <Text strong>{text}</Text>
            {record.email && (
              <div>
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  {record.email}
                </Text>
              </div>
            )}
          </div>
        ),
      },
      {
        title: 'Contact Info',
        key: 'contact',
        render: (_: unknown, record: Contact) => (
          <Space direction="vertical" size="small">
            {record.phone && <Text>{record.phone}</Text>}
            {record.mobile && record.mobile !== record.phone && (
              <Text type="secondary">Mobile: {record.mobile}</Text>
            )}
          </Space>
        ),
      },
      {
        title: 'Address',
        dataIndex: 'address',
        key: 'address',
        render: (address: Contact['address']) => {
          if (!address) return <Text type="secondary">No address</Text>;

          const parts = [];
          if (address.street1) parts.push(address.street1);
          if (address.city) parts.push(address.city);
          if (address.state) parts.push(address.state);
          if (address.zipCode) parts.push(address.zipCode);

          return <Text>{parts.length > 0 ? parts.join(', ') : 'Incomplete address'}</Text>;
        },
      },
      {
        title: 'Status',
        key: 'status',
        render: (_: unknown, record: Contact) => (
          <Space>
            <Tag color={record.isActive ? 'green' : 'red'}>
              {record.isActive ? 'Active' : 'Inactive'}
            </Tag>
            {record.gender && <Tag color="blue">{record.gender}</Tag>}
          </Space>
        ),
      },
      {
        title: 'Actions',
        key: 'actions',
        render: (_: unknown, record: Contact) => (
          <Space size="small">
            <Tooltip title="View Details">
              <Button type="text" icon={<EyeOutlined />} size="small" />
            </Tooltip>
            <Tooltip title="Edit Contact">
              <Button type="text" icon={<EditOutlined />} size="small" />
            </Tooltip>
            <Tooltip title="Delete Contact">
              <Button type="text" danger icon={<DeleteOutlined />} size="small" />
            </Tooltip>
          </Space>
        ),
      },
    ],
    []
  );

  // Performance metrics
  const performanceMetrics = performance.getMetrics();

  if (error) {
    return (
      <Card>
        <Alert
          message="Error Loading Contacts"
          description={error}
          type="error"
          showIcon
          action={
            <Button size="small" onClick={loadContacts}>
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
              Address Book
            </Title>
            <Text type="secondary">Manage your contacts with advanced search and filtering</Text>
          </Col>
          <Col>
            <Space>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  /* Handle new contact */
                }}
              >
                Add Contact
              </Button>
              <Button icon={<ReloadOutlined />} onClick={loadContacts} loading={loading}>
                Refresh
              </Button>
            </Space>
          </Col>
        </Row>
      </div>

      {/* Search and Filter Section */}
      <Card
        title={
          <Space>
            <SearchOutlined />
            <Text>Search & Filter</Text>
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
              onClick={() => {
                setShowAdvancedFilters(!showAdvancedFilters);
              }}
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
            placeholder="Search contacts by name, email, phone, or company..."
            value={searchState.query}
            onChange={searchState.setQuery}
            onSearch={handleSearch}
            onClear={handleClearFilters}
            loading={loading}
            suggestions={getContactSuggestions()}
            style={{ maxWidth: '600px' }}
          />

          {/* Advanced Filters */}
          {showAdvancedFilters && (
            <AdvancedFilter
              fields={CONTACT_SEARCH_FIELDS}
              filters={searchState.filters}
              onFiltersChange={handleFiltersChange}
              onApply={handleApplyFilters}
              onClear={handleClearFilters}
              loading={loading}
            />
          )}
        </Space>
      </Card>

      {/* Search Statistics */}
      <Row gutter={16} style={{ marginBottom: '16px' }}>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Total Contacts"
              value={searchStats.total}
              prefix={<SearchOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Filtered Results"
              value={searchStats.filtered}
              prefix={<FilterOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Search Time"
              value={searchStats.searchTime}
              suffix="ms"
              precision={2}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Performance Score"
              value={performanceMetrics.performanceScore}
              suffix="%"
              precision={1}
            />
          </Card>
        </Col>
      </Row>

      {/* Results Section */}
      <Card
        title={
          <Space>
            <Text>Contacts</Text>
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
            <Select value={viewMode} onChange={setViewMode} style={{ width: 120 }}>
              <Option value="table">Table</Option>
              <Option value="cards">Cards</Option>
            </Select>
            <Button
              icon={<DownloadOutlined />}
              onClick={() => {
                /* Handle export */
              }}
            >
              Export
            </Button>
          </Space>
        }
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px' }}>
            <Spin size="large" />
            <div style={{ marginTop: '16px' }}>
              <Text type="secondary">Searching contacts...</Text>
            </div>
          </div>
        ) : searchResults.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div>
                <Title level={4}>
                  {contacts.length === 0 ? 'No contacts found' : 'No matching contacts'}
                </Title>
                <Text type="secondary">
                  {contacts.length === 0
                    ? 'Get started by adding your first contact.'
                    : 'Try adjusting your search criteria or filters.'}
                </Text>
                <div style={{ marginTop: '16px' }}>
                  <Button type="primary" icon={<PlusOutlined />}>
                    Add Contact
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
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} contacts`,
              onChange: handlePageChange,
            }}
            onChange={(pagination, filters, sorter) => {
              const sorterResult = Array.isArray(sorter) ? sorter[0] : sorter;
              if (sorterResult?.field && sorterResult?.order) {
                const order = sorterResult.order === 'ascend' ? 'asc' : 'desc';

                // Type guard to safely handle different field types
                let fieldKey: string;
                if (typeof sorterResult.field === 'string') {
                  fieldKey = sorterResult.field;
                } else if (Array.isArray(sorterResult.field)) {
                  // Convert array to dot-delimited string
                  fieldKey = sorterResult.field.join('.');
                } else if (typeof sorterResult.field === 'function') {
                  // For function accessors, derive a stable identifier
                  // This is a fallback - in practice, function accessors should be avoided
                  fieldKey = 'custom_accessor';
                } else {
                  // Skip sorting for unknown field types
                  return;
                }

                handleSort(fieldKey, order);
              }
            }}
            rowSelection={{
              selectedRowKeys: selectedContacts,
              onChange: setSelectedContacts,
            }}
            scroll={{ x: 800 }}
          />
        )}
      </Card>

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
    </div>
  );
};
