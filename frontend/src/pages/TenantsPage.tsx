import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import type {
  Tenant as TenantRecord,
  PaginatedTenantResponse,
  CreateTenantDTO,
} from '@/types/tenant';
import { isApiSuccess } from '@/types/api';
import {
  Button,
  Input,
  Card,
  Table,
  Modal,
  Form,
  Alert,
  Space,
  Typography,
  Divider,
  Select,
  App,
} from 'antd';
import type { TableProps } from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  LeftOutlined,
  RightOutlined,
  DoubleLeftOutlined,
  DoubleRightOutlined,
  FilterOutlined,
  PlusCircleOutlined,
  MinusCircleOutlined,
} from '@ant-design/icons';
import { tenantService } from '@/services/api';

export const TenantsPage: React.FC = () => {
  const { user } = useAuth();
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const { message } = App.useApp();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<TenantRecord | null>(null);
  const [deleteTenantId, setDeleteTenantId] = useState<TenantRecord['id'] | null>(null);
  const [form] = Form.useForm();
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
   * @param values - Form values from Ant Design Form
   */
  const handleSubmit = async (values: CreateTenantDTO) => {
    setIsSubmitting(true);

    try {
      if (editingTenant) {
        // Update existing tenant
        const updateResult = await tenantService.update(editingTenant.id, {
          name: values.name,
          db_url: values.db_url,
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

  const updateFilter = (index: number, key: 'field' | 'operator' | 'value', value: string) => {
    const updated = [...powerFilters];
    updated[index] = Object.assign({}, updated[index], { [key]: value });
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

      const response = await tenantService.filter({
        filters: validFilters,
        page_size: pagination.pageSize, // Use current page size for filtered results
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
          total: paginated.total ?? paginated.data.length ?? 0,
        }));
      }
    } catch (error) {
      message.error('Failed to filter tenants');
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
    return new Date(dateString).toLocaleDateString('en-US', {
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
      render: (dbUrl: string) => (
        <span
          title={dbUrl}
          style={{
            fontSize: '12px',
            color: 'var(--tertiary-600)',
            fontFamily: 'monospace',
          }}
        >
          {formatDbUrl(dbUrl).length > 30
            ? formatDbUrl(dbUrl).substring(0, 27) + '...'
            : formatDbUrl(dbUrl)}
        </span>
      ),
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

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
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
      <Card title="Search Filters" size="small" style={{ borderRadius: '8px', marginTop: '16px' }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {powerFilters.map((filter, index) => (
            <div
              key={index}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}
            >
              <Select
                style={{ width: 150 }}
                value={filter.field}
                onChange={value => {
                  updateFilter(index, 'field', value);
                }}
                placeholder="Field"
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
              >
                <Select.Option value="contains">Contains</Select.Option>
                <Select.Option value="equals">Equals</Select.Option>
                <Select.Option value="gt">Greater Than</Select.Option>
                <Select.Option value="gte">Greater or Equal</Select.Option>
                <Select.Option value="lt">Less Than</Select.Option>
                <Select.Option value="lte">Less or Equal</Select.Option>
              </Select>

              <Input
                style={{ width: 200, flex: 1, minWidth: '150px' }}
                placeholder="Value"
                value={filter.value}
                onChange={e => {
                  updateFilter(index, 'value', e.target.value);
                }}
              />

              <Button
                type="text"
                danger
                icon={<MinusCircleOutlined />}
                onClick={() => {
                  removeFilter(index);
                }}
                disabled={powerFilters.length <= 1}
              >
                Remove
              </Button>

              {index === powerFilters.length - 1 && (
                <Button type="text" icon={<PlusCircleOutlined />} onClick={addFilter}>
                  Add Filter
                </Button>
              )}
            </div>
          ))}

          <Divider style={{ margin: '8px 0' }} />

          <Space>
            <Button type="primary" onClick={applyFilters}>
              Apply Filters
            </Button>
            <Button onClick={clearFilters}>Clear All</Button>
          </Space>

          <div style={{ fontSize: '14px', color: '#666' }}>
            <Typography.Text strong>Note:</Typography.Text> For date fields, use ISO format (e.g.,
            2023-12-25T10:00:00.000Z). Empty values are ignored in filtering.
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
          locale={{
            emptyText:
              tenants.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px' }}>
                  <Typography.Text style={{ fontSize: '16px', color: '#999' }}>
                    No tenants yet. Add your first tenant!
                  </Typography.Text>
                  <br />
                  <br />
                  <Button type="primary" size="large" onClick={handleNewTenant}>
                    Add Tenant
                  </Button>
                </div>
              ) : (
                'No tenants match your search.'
              ),
          }}
          style={{
            border: '1px solid #e8e8e8',
            borderRadius: '8px',
            overflow: 'hidden',
          }}
        />
      </Card>

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
              { required: true, message: 'Please enter database URL' },
              {
                validator: (_rule, value) => {
                  if (!value) return Promise.reject(new Error('Please enter database URL'));
                  // Libpq connection string regex (simplified, supports key=value pairs)
                  const libpqRegex = /^[^&=]+=[^&]*(&[^&=]+=[^&]*)*$/;
                  // PostgreSQL URL regex (enhanced for multi-host, encoded, unix sockets, etc.)
                  const urlRegex =
                    /^postgres(?:ql)?:\/\/(?:[A-Za-z0-9._%+-]+(?::[A-Za-z0-9._%+-]+)?@)?(?:\[[^\]]+\]|[A-Za-z0-9.-]+(?:,[A-Za-z0-9.-]+)*(?::\d{1,5})*|\/[^/]+)?\/[A-Za-z0-9_\-]+(?:\?.*)?$/;
                  if (libpqRegex.test(value) || urlRegex.test(value)) {
                    return Promise.resolve();
                  }
                  return Promise.reject(
                    new Error('Please enter a valid PostgreSQL URL or connection string')
                  );
                },
              },
            ]}
          >
            <Input placeholder="postgresql://user:password@host:port/database or host=localhost port=5432 dbname=mydb" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={isSubmitting}>
                {editingTenant ? 'Update Tenant' : 'Add Tenant'}
              </Button>
              <Button
                onClick={() => {
                  setIsFormOpen(false);
                }}
              >
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteTenantId !== null}
        title="Delete Tenant"
        message="Are you sure you want to delete this tenant? This action cannot be undone and may affect users and data associated with this tenant."
        confirmText="Delete"
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </Space>
  );
};
