import React, { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import type { Tenant as TenantRecord, CreateTenantDTO } from '@/types/tenant';
import { isApiSuccess } from '@/types/api';
import {
  Button,
  Input,
  Card,
  Table,
  Modal,
  Form,
  Space,
  Typography,
  Divider,
  Select,
  App,
  DatePicker,
  Spin,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  PlusCircleOutlined,
  MinusCircleOutlined,
} from '@ant-design/icons';
import { tenantService } from '@/services/api';
import { isValidPostgresConnectionString } from '@/validation/schemas';

/**
 * Form values for tenant creation (excluding id which is auto-generated)
 */
type TenantFormValues = Omit<CreateTenantDTO, 'id'>;

// Field type constants to avoid duplication
const TEXT_FIELDS = ['id', 'name', 'db_url'] as const;
const DATE_FIELDS = ['created_at', 'updated_at'] as const;

const operatorLabels: Record<string, string> = {
  contains: 'Contains',
  equals: 'Equals',
  gt: 'Greater Than',
  gte: 'Greater or Equal',
  lt: 'Less Than',
  lte: 'Less or Equal',
};

export const TenantsPage: React.FC = () => {
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const { message } = App.useApp();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<TenantRecord | null>(null);
  const [deleteTenantId, setDeleteTenantId] = useState<TenantRecord['id'] | null>(null);
  const [form] = Form.useForm<TenantFormValues>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [powerFilters, setPowerFilters] = useState<
    { field: string; operator: string; value: string }[]
  >([{ field: 'name', operator: 'contains', value: '' }]);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 12,
    total: 0,
  });

  // Load tenants from API with pagination
  const loadTenants = async (params?: { offset?: number; limit?: number }) => {
    try {
      setLoading(true);
      const result = await tenantService.getAllWithPagination(params);

      if (result.isErr()) {
        message.error(result.error.message);
        setTenants([]);
        setPagination(prev => ({ ...prev, total: 0 }));
        return;
      }

      const apiResponse = result.value;

      if (!isApiSuccess(apiResponse)) {
        message.error(apiResponse.error.message);
        setTenants([]);
        setPagination(prev => ({ ...prev, total: 0 }));
        return;
      }

      const data = apiResponse.data;
      setTenants(data.data);
      setPagination(prev => ({ ...prev, total: data.total }));
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to load tenants');
      setTenants([]);
      setPagination(prev => ({ ...prev, total: 0 }));
    } finally {
      setLoading(false);
    }
  };

  // Load tenants on component mount
  useEffect(() => {
    loadTenants({ offset: 0, limit: pagination.pageSize });
  }, []);

  // Handle pagination changes (page size and page number)
  const handlePaginationChange = async (page: number, pageSize: number) => {
    setPagination(prev => ({ ...prev, current: page, pageSize }));

    // Calculate offset for backend API
    const offset = (page - 1) * pageSize;
    await loadTenants({ offset, limit: pageSize });
  };

  // Custom pagination config that extends pharmacyPaginationConfig with dynamic values
  const tablePagination = {
    current: pagination.current,
    pageSize: pagination.pageSize,
    total: pagination.total,
    onChange: handlePaginationChange,
    showSizeChanger: false,
    showQuickJumper: false,
  };

  /**
   * Handle form submission for creating or updating a tenant
   * @param values - Form values from Ant Design Form (without id)
   */
  const handleSubmit = async (values: TenantFormValues) => {
    setIsSubmitting(true);

    try {
      if (editingTenant) {
        // Update existing tenant - omit db_url if empty to keep it optional
        const updateResult = await tenantService.update(editingTenant.id, {
          name: values.name,
          ...(values.db_url && { db_url: values.db_url }),
        });
        if (updateResult.isErr()) {
          throw new Error(updateResult.error.message);
        }

        if (!isApiSuccess(updateResult.value)) {
          throw new Error(updateResult.value.error.message);
        }
        // Refresh the current page
        await loadTenants({
          offset: (pagination.current - 1) * pagination.pageSize,
          limit: pagination.pageSize,
        });
      } else {
        // Create new tenant with cryptographically secure UUID
        const createResult = await tenantService.create({
          id: crypto.randomUUID(),
          name: values.name,
          db_url: values.db_url,
        });

        if (createResult.isErr()) {
          throw new Error(createResult.error.message);
        }

        if (!isApiSuccess(createResult.value)) {
          throw new Error(createResult.value.error.message);
        }
        // Refresh the current page
        await loadTenants({
          offset: (pagination.current - 1) * pagination.pageSize,
          limit: pagination.pageSize,
        });
      }

      // Success message
      const successMsg = editingTenant
        ? 'Tenant updated successfully!'
        : 'Tenant created successfully!';
      message.success(successMsg);

      // Reset form and close modal on success
      setEditingTenant(null);
      setIsFormOpen(false);
      form.resetFields();
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : 'An error occurred while saving the tenant.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle edit
  const handleEdit = (tenant: TenantRecord) => {
    setEditingTenant(tenant);
    form.setFieldsValue({
      name: tenant.name,
      db_url: tenant.db_url,
    });
    setIsFormOpen(true);
  };

  // Handle delete - open confirmation modal
  const handleDelete = (id: TenantRecord['id']) => {
    setDeleteTenantId(id);
  };

  // Confirm delete
  const confirmDelete = async () => {
    if (deleteTenantId) {
      try {
        const deleteResult = await tenantService.delete(deleteTenantId);
        if (deleteResult.isErr()) {
          throw new Error(deleteResult.error.message);
        }

        if (!isApiSuccess(deleteResult.value)) {
          throw new Error(deleteResult.value.error.message);
        }
        // Update tenants state after successful API response
        await loadTenants({
          offset: (pagination.current - 1) * pagination.pageSize,
          limit: pagination.pageSize,
        });
        message.success('Tenant deleted successfully!');
      } catch (error) {
        message.error(error instanceof Error ? error.message : 'Failed to delete tenant');
      } finally {
        setDeleteTenantId(null);
      }
    }
  };

  // Cancel delete
  const cancelDelete = () => {
    setDeleteTenantId(null);
  };

  // Open form for new tenant
  const handleNewTenant = () => {
    setEditingTenant(null);
    form.resetFields();
    setIsFormOpen(true);
  };

  // Power search functions
  const addFilter = () => {
    setPowerFilters([...powerFilters, { field: 'name', operator: 'contains', value: '' }]);
  };

  const removeFilter = (index: number) => {
    setPowerFilters(powerFilters.filter((_, i) => i !== index));
  };

  // Helper function to get valid operators for a field type
  const getOperatorsForField = (field: string): string[] => {
    if ((TEXT_FIELDS as readonly string[]).includes(field)) {
      return ['contains', 'equals'];
    } else if ((DATE_FIELDS as readonly string[]).includes(field)) {
      return ['equals', 'gt', 'gte', 'lt', 'lte'];
    }

    // Default fallback
    return ['contains', 'equals'];
  };

  // Helper function to check if a field is a date field
  const isDateField = (field: string): boolean =>
    (DATE_FIELDS as readonly string[]).includes(field);

  // Helper function to convert ISO string to dayjs object
  const isoToDayjs = (isoString: string): Dayjs | null => {
    if (!isoString) return null;
    const d = dayjs(isoString);
    return d.isValid() ? d : null;
  };

  // Helper function to convert dayjs object to ISO string
  // Type guarantee: dayjsObj is Dayjs | null; null case returns empty string,
  // so the remaining path guarantees dayjsObj is a valid Dayjs instance.
  const dayjsToIso = (dayjsObj: Dayjs | null): string => {
    if (!dayjsObj) return '';
    return dayjsObj.toISOString();
  };

  const updateFilter = (
    index: number,
    key: 'field' | 'operator' | 'value',
    value: string
  ): void => {
    const updated = [...powerFilters];
    const currentFilter = updated[index];

    if (!currentFilter) {
      return;
    }

    // If field is changing, check if current operator is still valid and clear stale values
    if (key === 'field') {
      const validOperators = getOperatorsForField(value);
      const currentOperator = currentFilter.operator;
      const isDateFieldValue = isDateField(value);
      const wasDateField = isDateField(currentFilter.field);

      // If field type changed (date <-> text), clear the value
      const shouldClearValue = isDateFieldValue !== wasDateField;

      // If current operator is not valid for the new field, reset to first valid operator
      if (!validOperators.includes(currentOperator)) {
        updated[index] = Object.assign({}, currentFilter, {
          [key]: value,
          operator: validOperators[0],
          value: shouldClearValue ? '' : currentFilter.value,
        });
      } else {
        updated[index] = Object.assign({}, currentFilter, {
          [key]: value,
          value: shouldClearValue ? '' : currentFilter.value,
        });
      }
    } else {
      updated[index] = Object.assign({}, currentFilter, { [key]: value });
    }

    setPowerFilters(updated);
  };

  const applyFilters = async () => {
    try {
      setLoading(true);
      const validFilters = powerFilters.filter(f => f.value.trim() !== '');
      if (validFilters.length === 0) {
        // No filters, load all
        setPagination(prev => ({ ...prev, current: 1 })); // Reset to first page
        await loadTenants({ offset: 0, limit: pagination.pageSize });
        return;
      }

      // Validate date fields before sending
      const validatedFilters = validFilters.map(filter => {
        if (isDateField(filter.field)) {
          // Validate date format for date fields
          const dateValue = new Date(filter.value);
          if (isNaN(dateValue.getTime())) {
            throw new Error(`Invalid date format for field ${filter.field}: ${filter.value}`);
          }
          return {
            ...filter,
            value: dateValue.toISOString(),
          };
        }
        return filter;
      });

      const response = await tenantService.filter({
        filters: validatedFilters,
        limit: pagination.pageSize, // Use current page size for filtered results
      });

      if (response.isErr()) {
        throw new Error(response.error.message);
      }

      const apiResponse = response.value;

      if (!isApiSuccess(apiResponse)) {
        throw new Error(apiResponse.error.message);
      }

      const data = apiResponse.data;

      if (Array.isArray(data)) {
        // Data is already TenantRecord[] from the API
        setTenants(data);
        setPagination(prev => ({ ...prev, current: 1, total: data.length }));
      } else {
        const paginated = data;
        setTenants(paginated.data);
        setPagination(prev => ({
          ...prev,
          current: 1,
          total: paginated.total,
        }));
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to filter tenants');
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = async () => {
    setPowerFilters([{ field: 'name', operator: 'contains', value: '' }]);
    setPagination(prev => ({ ...prev, current: 1 })); // Reset to first page
    await loadTenants({ offset: 0, limit: pagination.pageSize });
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Format database URL for display (hide password if present)
  const formatDbUrl = (url: string) => {
    try {
      // Hide password from display
      const displayUrl = url.replace(/:\/\/([^:]+):[^@]+@/, '://$1:***@');
      return displayUrl;
    } catch {
      return '<invalid-db-url>';
    }
  };

  // Table columns for tenants display
  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 200,
      ellipsis: true,
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      sorter: (a: TenantRecord, b: TenantRecord) => a.name.localeCompare(b.name),
    },
    {
      title: 'Database URL',
      dataIndex: 'db_url',
      key: 'db_url',
      width: 250,
      ellipsis: true,
      render: (dbUrl: string) => {
        const masked = formatDbUrl(dbUrl);
        return (
        <span
          title={masked}
          style={{
            fontSize: '12px',
            color: 'var(--tertiary-600)',
            fontFamily: 'monospace',
          }}
        >
          {masked.length > 30 ? masked.substring(0, 27) + '...' : masked}
        </span>
        );
      },
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => formatDate(date),
      sorter: (a: TenantRecord, b: TenantRecord) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    },
    {
      title: 'Updated',
      dataIndex: 'updated_at',
      key: 'updated_at',
      render: (date: string) => formatDate(date),
      sorter: (a: TenantRecord, b: TenantRecord) =>
        new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime(),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_: unknown, tenant: TenantRecord) => (
        <Space size="small">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              handleEdit(tenant);
            }}
            style={{
              color: '#1890ff',
            }}
          />
          <Button
            type="text"
            danger
            size="small"
            icon={<DeleteOutlined />}
            onClick={() => {
              handleDelete(tenant.id);
            }}
          />
        </Space>
      ),
    },
  ];

  // For filter validation, add error state for invalid dates
  // Filter errors handled in applyFilters

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px' }}>
          <Spin tip="Loading tenants..." />
        </div>
      ) : tenants.length === 0 ? (
        <Card>
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Typography.Title level={4}>No Tenants Found</Typography.Title>
            <Typography.Text type="secondary">
              Create your first tenant to get started.
            </Typography.Text>
            <Button type="primary" onClick={handleNewTenant} style={{ marginTop: 16 }}>
              Create Tenant
            </Button>
          </div>
        </Card>
      ) : (
        <>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <Typography.Title level={2} style={{ margin: 0 }}>
                Tenants
              </Typography.Title>
              <Typography.Text type="secondary">
                Manage tenant configurations and database connections
              </Typography.Text>
            </div>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleNewTenant}>
              Add Tenant
            </Button>
          </div>

          <Divider />

          {/* Search Filters */}
          <Card
            title="Search Filters"
            size="small"
            style={{ borderRadius: '8px', marginTop: '16px' }}
            data-testid="search-filters-card"
          >
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              {powerFilters.map((filter, index) => (
                <div
                  key={index}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}
                  data-testid={`filter-row-${index}`}
                >
                  <Select
                    style={{ width: 150 }}
                    value={filter.field}
                    onChange={value => {
                      updateFilter(index, 'field', value);
                    }}
                    placeholder="Field"
                    data-testid={`filter-field-select-${index}`}
                  >
                    <Select.Option value="id">ID</Select.Option>
                    <Select.Option value="name">Name</Select.Option>
                    <Select.Option value="db_url">Database URL</Select.Option>
                    <Select.Option value="created_at">Created At</Select.Option>
                    <Select.Option value="updated_at">Updated At</Select.Option>
                  </Select>

                  <Select
                    style={{ width: 120 }}
                    value={filter.operator}
                    onChange={value => {
                      updateFilter(index, 'operator', value);
                    }}
                    placeholder="Operator"
                    data-testid={`filter-operator-select-${index}`}
                  >
                    {getOperatorsForField(filter.field).map(op => (
                      <Select.Option key={op} value={op}>
                        {operatorLabels[op] ?? op}
                      </Select.Option>
                    ))}
                  </Select>

                  {isDateField(filter.field) ? (
                    <DatePicker
                      style={{ width: 200, flex: 1, minWidth: '150px' }}
                      placeholder="Select date"
                      showTime
                      allowClear
                      value={isoToDayjs(filter.value)}
                      onChange={date => {
                        if (date && date.isValid()) {
                          const iso = date.toDate().toISOString();
                          updateFilter(index, 'value', iso);
                        } else {
                          updateFilter(index, 'value', '');
                        }
                      }}
                      data-testid={`filter-value-date-${index}`}
                    />
                  ) : (
                    <Input
                      style={{ width: 200, flex: 1, minWidth: '150px' }}
                      placeholder="Value"
                      value={filter.value}
                      onChange={e => {
                        updateFilter(index, 'value', e.target.value);
                      }}
                      data-testid={`filter-value-input-${index}`}
                    />
                  )}

                  <Button
                    type="text"
                    danger
                    icon={<MinusCircleOutlined />}
                    onClick={() => {
                      removeFilter(index);
                    }}
                    disabled={powerFilters.length <= 1}
                    data-testid={`remove-filter-${index}`}
                  >
                    Remove
                  </Button>

                  {index === powerFilters.length - 1 && (
                    <Button
                      type="text"
                      icon={<PlusCircleOutlined />}
                      onClick={addFilter}
                      data-testid="add-filter-button"
                    >
                      Add Filter
                    </Button>
                  )}
                </div>
              ))}

              <Divider style={{ margin: '8px 0' }} />

              <Space>
                <Button
                  type="primary"
                  onClick={applyFilters}
                  disabled={loading}
                  data-testid="apply-filters-button"
                >
                  Apply Filters
                </Button>
                <Button
                  onClick={clearFilters}
                  disabled={loading}
                  data-testid="clear-filters-button"
                >
                  Clear All
                </Button>
              </Space>

              <div style={{ fontSize: '14px', color: '#666' }}>
                <Typography.Text strong>Note:</Typography.Text> Pick a date/time; it's sent as
                ISO-8601 (UTC). Empty values are ignored.
              </div>
            </Space>
          </Card>

          {/* Tenants Table */}
          <Card
            title={`Tenants (${tenants.length})`}
            style={{ borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
          >
            <Table
              columns={columns}
              dataSource={tenants}
              rowKey="id"
              loading={loading}
              rowClassName={(record, index) => (index % 2 === 0 ? 'stripe-row' : '')}
              pagination={tablePagination}
              data-testid="tenants-table"
              locale={{ emptyText: 'No tenants match your search.' }}
              style={{
                border: '1px solid #e8e8e8',
                borderRadius: '8px',
                overflow: 'hidden',
              }}
            />
          </Card>
        </>
      )}

      {/* Tenant Form Modal */}
      <Modal
        title={editingTenant ? 'Edit Tenant' : 'Add New Tenant'}
        open={isFormOpen}
        onCancel={() => {
          setIsFormOpen(false);
        }}
        footer={null}
      >
        <Form
          form={form}
          onFinish={handleSubmit}
          layout="vertical"
          initialValues={{
            name: '',
            db_url: '',
          }}
        >
          <Form.Item
            name="name"
            label="Tenant Name"
            rules={[{ required: true, message: 'Please enter tenant name' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="db_url"
            label="Database URL"
            rules={[
              {
                validator: (_rule, value) => {
                  if (!value)
                    return editingTenant
                      ? Promise.resolve()
                      : Promise.reject(new Error('Please enter database URL'));
                  return isValidPostgresConnectionString(value)
                    ? Promise.resolve()
                    : Promise.reject(new Error('Invalid PostgreSQL connection string'));
                },
              },
            ]}
          >
            <Input placeholder="postgres://localhost:5432/mydb or key=value format" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={isSubmitting}>
              {editingTenant ? 'Update' : 'Add'} Tenant
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
};
