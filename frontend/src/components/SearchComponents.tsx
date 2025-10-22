/**
 * Enhanced Search Components for Data List UX
 * Following Ant Design Data List specifications for optimal search experience
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Input,
  Select,
  Button,
  Card,
  Space,
  Typography,
  Empty,
  Spin,
  DatePicker,
  InputNumber,
  Switch,
  Badge,
  Pagination,
  Row,
  Col,
} from 'antd';
import {
  SearchOutlined,
  FilterOutlined,
  ClearOutlined,
  PlusOutlined,
  MinusCircleOutlined,
} from '@ant-design/icons';
import { createScopedIdGenerator } from '@/utils/uniqueId';

const { Option } = Select;
const { Text, Title } = Typography;

/**
 * Search field configuration for different entity types
 */
export interface SearchFieldConfig {
  key: string;
  label: string;
  type: 'text' | 'select' | 'date' | 'number' | 'boolean';
  options?: { label: string; value: string | number | boolean }[];
  placeholder?: string;
  searchable?: boolean;
  filterable?: boolean;
  sortable?: boolean;
}

/**
 * Search filter configuration
 */
export interface SearchFilter {
  id: string;
  field: string;
  operator:
    | 'contains'
    | 'equals'
    | 'startsWith'
    | 'endsWith'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'between'
    | 'in'
    | 'notIn';
  value: string | number | boolean | null | [string | number | null, string | number | null];
  label?: string;
}

/**
 * Search query configuration
 */
export interface SearchQuery {
  queryId: string;
  filters: SearchFilter[];
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

/**
 * Search result configuration
 */
export interface SearchResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * Smart Search Input Component
 * Supports multi-attribute search with intelligent suggestions
 */
export interface SmartSearchInputProps {
  placeholder?: string;
  onSearch: (query: string) => void;
  onClear?: () => void;
  loading?: boolean;
  suggestions?: string[];
  searchFields?: SearchFieldConfig[];
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

export const SmartSearchInput: React.FC<SmartSearchInputProps> = ({
  placeholder = 'Search across all fields...',
  onSearch,
  onClear,
  loading = false,
  suggestions = [],
  searchFields: _searchFields = [],
  value = '',
  onChange,
  className,
  style,
}) => {
  const [_isFocused, setIsFocused] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const handleSearch = useCallback(() => {
    if (value.trim()) {
      onSearch(value.trim());
    }
  }, [value, onSearch]);

  const handleClear = useCallback(() => {
    onChange?.('');
    onClear?.();
    setHighlightedIndex(-1);
    setIsOpen(false);
  }, [onChange, onClear]);

  const handleSuggestionSelect = useCallback(
    (suggestion: string) => {
      onChange?.(suggestion);
      handleSearch();
      setHighlightedIndex(-1);
      setIsOpen(false);
    },
    [onChange, handleSearch]
  );

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (isOpen && highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
          // Select highlighted suggestion
          const selectedSuggestion = suggestions[highlightedIndex];
          if (selectedSuggestion != null && selectedSuggestion !== '') {
            handleSuggestionSelect(selectedSuggestion);
          }
        } else {
          // Perform search with current value
          handleSearch();
        }
      }
    },
    [handleSearch, isOpen, highlightedIndex, suggestions, handleSuggestionSelect]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen || suggestions.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
          break;
        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          setHighlightedIndex(-1);
          break;
      }
    },
    [isOpen, suggestions.length]
  );

  return (
    <div className={className} style={style}>
      <Input
        placeholder={placeholder}
        prefix={<SearchOutlined />}
        suffix={
          <Space size="small">
            {value && (
              <Button
                type="text"
                size="small"
                icon={<ClearOutlined />}
                onClick={handleClear}
                aria-label="Clear search"
              />
            )}
            <Button
              type="primary"
              size="small"
              icon={<SearchOutlined />}
              onClick={handleSearch}
              loading={loading}
              aria-label="Search"
            />
          </Space>
        }
        value={value}
        onChange={e => onChange?.(e.target.value)}
        onKeyUp={handleKeyPress}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          setIsFocused(true);
          setIsOpen(true);
          setHighlightedIndex(-1);
        }}
        onBlur={() => {
          setIsFocused(false);
          // Delay closing to allow clicking on suggestions
          setTimeout(() => {
            setIsOpen(false);
            setHighlightedIndex(-1);
          }, 150);
        }}
        style={{ width: '100%' }}
      />

      {/* Search suggestions */}
      {isOpen && suggestions.length > 0 && (
        <Card
          size="small"
          role="listbox"
          aria-label="Search suggestions"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 1000,
            marginTop: 4,
            maxHeight: 200,
            overflowY: 'auto',
          }}
        >
          {suggestions.map((suggestion, index) => (
            <div
              key={`suggestion-${index}`}
              role="option"
              aria-selected={index === highlightedIndex}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                borderBottom: index < suggestions.length - 1 ? '1px solid #f0f0f0' : 'none',
                backgroundColor: index === highlightedIndex ? '#e6f7ff' : 'transparent',
                color: index === highlightedIndex ? '#1890ff' : 'inherit',
              }}
              onClick={() => {
                handleSuggestionSelect(suggestion);
              }}
              onMouseEnter={() => {
                setHighlightedIndex(index);
              }}
            >
              <Text>{suggestion}</Text>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
};

/**
 * Advanced Filter Component
 * Supports dynamic filters with multiple operators
 */
export interface AdvancedFilterProps {
  fields: SearchFieldConfig[];
  filters: SearchFilter[];
  onFiltersChange: (filters: SearchFilter[]) => void;
  onApply: () => void;
  onClear: () => void;
  loading?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const AdvancedFilter: React.FC<AdvancedFilterProps> = ({
  fields,
  filters,
  onFiltersChange,
  onApply,
  onClear,
  loading = false,
  className,
  style,
}) => {
  // Create a scoped ID generator for filter IDs
  const generateFilterId = useMemo(() => createScopedIdGenerator('filter-'), []);

  const addFilter = useCallback(() => {
    const newFilter: SearchFilter = {
      id: generateFilterId(),
      field: fields[0]?.key ?? '',
      operator: 'contains',
      value: '',
    };
    onFiltersChange([...filters, newFilter]);
  }, [fields, filters, onFiltersChange, generateFilterId]);

  const updateFilter = useCallback(
    (id: string, updates: Partial<SearchFilter>) => {
      const updatedFilters = filters.map(filter =>
        filter.id === id ? { ...filter, ...updates } : filter
      );
      onFiltersChange(updatedFilters);
    },
    [filters, onFiltersChange]
  );

  const removeFilter = useCallback(
    (id: string) => {
      const updatedFilters = filters.filter(filter => filter.id !== id);
      onFiltersChange(updatedFilters);
    },
    [filters, onFiltersChange]
  );

  const getOperatorsForField = useCallback(
    (fieldKey: string) => {
      const field = fields.find(f => f.key === fieldKey);
      if (!field) return [];

      switch (field.type) {
        case 'text':
          return [
            { label: 'Contains', value: 'contains' },
            { label: 'Equals', value: 'equals' },
            { label: 'Starts With', value: 'startsWith' },
            { label: 'Ends With', value: 'endsWith' },
          ];
        case 'number':
          return [
            { label: 'Equals', value: 'equals' },
            { label: 'Greater Than', value: 'gt' },
            { label: 'Greater or Equal', value: 'gte' },
            { label: 'Less Than', value: 'lt' },
            { label: 'Less or Equal', value: 'lte' },
            { label: 'Between', value: 'between' },
          ];
        case 'date':
          return [
            { label: 'Equals', value: 'equals' },
            { label: 'After', value: 'gt' },
            { label: 'Before', value: 'lt' },
            { label: 'Between', value: 'between' },
          ];
        case 'boolean':
          return [{ label: 'Equals', value: 'equals' }];
        case 'select':
          return [
            { label: 'Equals', value: 'equals' },
            { label: 'In', value: 'in' },
            { label: 'Not In', value: 'notIn' },
          ];
        default:
          return [];
      }
    },
    [fields]
  );

  const renderFilterValue = useCallback(
    (filter: SearchFilter) => {
      const field = fields.find(f => f.key === filter.field);
      if (!field) return null;

      switch (field.type) {
        case 'text':
          return (
            <Input
              placeholder={`Enter ${field.label.toLowerCase()}...`}
              value={filter.value as string}
              onChange={e => {
                updateFilter(filter.id, { value: e.target.value });
              }}
              style={{ minWidth: 200 }}
            />
          );
        case 'number':
          if (filter.operator === 'between') {
            const values = Array.isArray(filter.value) ? filter.value : ['', ''];
            return (
              <Space>
                <InputNumber
                  placeholder="From"
                  value={values[0] as number}
                  onChange={value => {
                    updateFilter(filter.id, {
                      value: [
                        value === null || value === undefined ? null : Number(value),
                        values[1],
                      ],
                    });
                  }}
                />
                <Text>to</Text>
                <InputNumber
                  placeholder="To"
                  value={values[1] as number}
                  onChange={value => {
                    updateFilter(filter.id, {
                      value: [
                        values[0],
                        value === null || value === undefined ? null : Number(value),
                      ],
                    });
                  }}
                />
              </Space>
            );
          }
          return (
            <InputNumber
              placeholder={`Enter ${field.label.toLowerCase()}...`}
              value={filter.value as number}
              onChange={value => {
                updateFilter(filter.id, {
                  value: value === null || value === undefined ? null : Number(value),
                });
              }}
              style={{ minWidth: 200 }}
            />
          );
        case 'date':
          if (filter.operator === 'between') {
            const values = Array.isArray(filter.value) ? filter.value : ['', ''];
            return (
              <Space>
                <DatePicker
                  placeholder="From"
                  value={values[0] ? new Date(values[0] as string) : null}
                  onChange={date => {
                    updateFilter(filter.id, { value: [date?.toISOString() || '', values[1]] });
                  }}
                />
                <Text>to</Text>
                <DatePicker
                  placeholder="To"
                  value={values[1] ? new Date(values[1] as string) : null}
                  onChange={date => {
                    updateFilter(filter.id, { value: [values[0], date?.toISOString() || ''] });
                  }}
                />
              </Space>
            );
          }
          return (
            <DatePicker
              placeholder={`Select ${field.label.toLowerCase()}...`}
              value={filter.value ? new Date(filter.value as string) : null}
              onChange={date => {
                updateFilter(filter.id, { value: date?.toISOString() || '' });
              }}
              style={{ minWidth: 200 }}
            />
          );
        case 'boolean':
          return (
            <Switch
              checked={filter.value as boolean}
              onChange={checked => {
                updateFilter(filter.id, { value: checked });
              }}
            />
          );
        case 'select':
          return (
            <Select
              placeholder={`Select ${field.label.toLowerCase()}...`}
              value={filter.value as string | string[] | null}
              onChange={value => {
                updateFilter(filter.id, {
                  value: value as
                    | string
                    | number
                    | boolean
                    | null
                    | [string | number | null, string | number | null],
                });
              }}
              style={{ minWidth: 200 }}
              mode={
                filter.operator === 'in' || filter.operator === 'notIn' ? 'multiple' : undefined
              }
            >
              {field.options?.map(option => (
                <Option key={String(option.value)} value={option.value}>
                  {option.label}
                </Option>
              ))}
            </Select>
          );
        default:
          return null;
      }
    },
    [fields, updateFilter]
  );

  return (
    <Card
      title={
        <Space>
          <FilterOutlined />
          <Text>Advanced Filters</Text>
          <Badge count={filters.length} />
        </Space>
      }
      size="small"
      className={className}
      style={style}
      extra={
        <Space>
          <Button
            type="primary"
            icon={<FilterOutlined />}
            onClick={onApply}
            loading={loading}
            size="small"
          >
            Apply Filters
          </Button>
          <Button icon={<ClearOutlined />} onClick={onClear} size="small">
            Clear All
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        {filters.map((filter, _index) => (
          <Card
            key={filter.id}
            size="small"
            style={{ backgroundColor: '#fafafa' }}
            extra={
              <Button
                type="text"
                danger
                icon={<MinusCircleOutlined />}
                onClick={() => {
                  removeFilter(filter.id);
                }}
                size="small"
              />
            }
          >
            <Row gutter={[12, 12]} align="middle">
              <Col span={6}>
                <Select
                  placeholder="Select field"
                  value={filter.field}
                  onChange={value => {
                    updateFilter(filter.id, { field: value });
                  }}
                  style={{ width: '100%' }}
                >
                  {fields.map(field => (
                    <Option key={field.key} value={field.key}>
                      {field.label}
                    </Option>
                  ))}
                </Select>
              </Col>
              <Col span={4}>
                <Select
                  placeholder="Operator"
                  value={filter.operator}
                  onChange={value => {
                    updateFilter(filter.id, { operator: value });
                  }}
                  style={{ width: '100%' }}
                >
                  {getOperatorsForField(filter.field).map(op => (
                    <Option key={op.value} value={op.value}>
                      {op.label}
                    </Option>
                  ))}
                </Select>
              </Col>
              <Col span={14}>{renderFilterValue(filter)}</Col>
            </Row>
          </Card>
        ))}

        <Button type="dashed" icon={<PlusOutlined />} onClick={addFilter} block>
          Add Filter
        </Button>
      </Space>
    </Card>
  );
};

/**
 * Search Results Component
 * Displays results with proper empty states and loading indicators
 */
export interface SearchResultsProps<T> {
  data: T[];
  loading?: boolean;
  total?: number;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number, pageSize: number) => void;
  renderItem?: (item: T, index: number) => React.ReactNode;
  emptyStateTitle?: string;
  emptyStateDescription?: string;
  emptyStateAction?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const SearchResults: React.FC<SearchResultsProps<unknown>> = ({
  data,
  loading = false,
  total = 0,
  page = 1,
  pageSize = 10,
  onPageChange,
  renderItem,
  emptyStateTitle = 'No results found',
  emptyStateDescription = 'Try adjusting your search criteria or filters.',
  emptyStateAction,
  className,
  style,
}) => {
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '48px' }}>
        <Spin size="large" />
        <div style={{ marginTop: 16 }}>
          <Text type="secondary">Searching...</Text>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <div>
            <Title level={4}>{emptyStateTitle}</Title>
            <Text type="secondary">{emptyStateDescription}</Text>
            {emptyStateAction && <div style={{ marginTop: 16 }}>{emptyStateAction}</div>}
          </div>
        }
      />
    );
  }

  return (
    <div className={className} style={style}>
      {data.map((item, index) => (
        <div key={index}>
          {renderItem ? renderItem(item, index) : <div>{JSON.stringify(item)}</div>}
        </div>
      ))}

      {/* Pagination controls - only render when total is provided and > pageSize */}
      {total && total > pageSize && (
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Pagination
            current={page}
            pageSize={pageSize}
            total={total}
            onChange={(newPage, newPageSize) => {
              if (onPageChange) {
                onPageChange(newPage, newPageSize);
              }
            }}
            onShowSizeChange={(current, size) => {
              if (onPageChange) {
                onPageChange(current, size);
              }
            }}
            showSizeChanger
            showQuickJumper
            showTotal={(total, range) => `${range[0]}-${range[1]} of ${total} items`}
          />
        </div>
      )}
    </div>
  );
};

/**
 * Search Configuration for different entity types
 */
export const CONTACT_SEARCH_FIELDS: SearchFieldConfig[] = [
  {
    key: 'fullName',
    label: 'Full Name',
    type: 'text',
    searchable: true,
    filterable: true,
    sortable: true,
  },
  {
    key: 'firstName',
    label: 'First Name',
    type: 'text',
    searchable: true,
    filterable: true,
    sortable: true,
  },
  {
    key: 'lastName',
    label: 'Last Name',
    type: 'text',
    searchable: true,
    filterable: true,
    sortable: true,
  },
  {
    key: 'email',
    label: 'Email',
    type: 'text',
    searchable: true,
    filterable: true,
    sortable: true,
  },
  {
    key: 'phone',
    label: 'Phone',
    type: 'text',
    searchable: true,
    filterable: true,
    sortable: true,
  },
  {
    key: 'gender',
    label: 'Gender',
    type: 'select',
    options: [
      { label: 'Male', value: 'male' },
      { label: 'Female', value: 'female' },
      { label: 'Other', value: 'other' },
    ],
    filterable: true,
    sortable: true,
  },
  {
    key: 'age',
    label: 'Age',
    type: 'number',
    filterable: true,
    sortable: true,
  },
  {
    key: 'createdAt',
    label: 'Created Date',
    type: 'date',
    filterable: true,
    sortable: true,
  },
  {
    key: 'isActive',
    label: 'Active',
    type: 'boolean',
    filterable: true,
    sortable: true,
  },
];

export const TENANT_SEARCH_FIELDS: SearchFieldConfig[] = [
  {
    key: 'name',
    label: 'Name',
    type: 'text',
    searchable: true,
    filterable: true,
    sortable: true,
  },
  {
    key: 'id',
    label: 'ID',
    type: 'text',
    searchable: true,
    filterable: true,
    sortable: true,
  },
  {
    key: 'db_url',
    label: 'Database URL',
    type: 'text',
    searchable: true,
    filterable: true,
    sortable: false,
  },
  {
    key: 'created_at',
    label: 'Created Date',
    type: 'date',
    filterable: true,
    sortable: true,
  },
  {
    key: 'updated_at',
    label: 'Updated Date',
    type: 'date',
    filterable: true,
    sortable: true,
  },
];
