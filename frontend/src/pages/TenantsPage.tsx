import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import type { Tenant } from '@/types/tenant';
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
  message,
  Select,
} from 'antd';
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
  const [tenants, setTenants] = useState<Tenant[]>([]);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [deleteTenantId, setDeleteTenantId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [powerFilters, setPowerFilters] = useState<{ field: string; operator: string; value: string }[]>([
    { field: 'name', operator: 'contains', value: '' }
  ]);



  // Load tenants from API
  const loadTenants = async () => {
    try {
      setLoading(true);
      const response = await tenantService.getAll() as any;
      setTenants(response.data || []);
    } catch (error) {
      message.error('Failed to load tenants');
    } finally {
      setLoading(false);
    }
  };

  // Load tenants on component mount
  useEffect(() => {
    loadTenants();
  }, []);

  // Handle form submission
  const handleSubmit = async (values: any) => {
    setIsSubmitting(true);

    try {
      if (editingTenant) {
        // Update existing tenant
        await tenantService.update(editingTenant.id, { name: values.name, db_url: values.db_url });
        // Refresh the list
        await loadTenants();
      } else {
        // Create new tenant
        await tenantService.create({ id: crypto.randomUUID(), name: values.name, db_url: values.db_url });
        // Refresh the list
        await loadTenants();
      }

      // Success message
      const successMsg = editingTenant ? 'Tenant updated successfully!' : 'Tenant created successfully!';
      message.success(successMsg);

      // Reset form and close modal on success
      setEditingTenant(null);
      setIsFormOpen(false);
      form.resetFields();

    } catch (error) {
      message.error(error instanceof Error ? error.message : 'An error occurred while saving the tenant.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle edit
  const handleEdit = (tenant: Tenant) => {
    setEditingTenant(tenant);
    form.setFieldsValue({
      name: tenant.name,
      db_url: tenant.db_url,
    });
    setIsFormOpen(true);
  };

  // Handle delete - open confirmation modal
  const handleDelete = (id: string) => {
    setDeleteTenantId(id);
  };

  // Confirm delete
  const confirmDelete = () => {
    if (deleteTenantId) {
      setTenants(prev => prev.filter(tenant => tenant.id !== deleteTenantId));
      setDeleteTenantId(null);
      message.success('Tenant deleted successfully!');
      // TODO: Uncomment when API is ready
      // await tenantService.delete(deleteTenantId);
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
        await loadTenants();
        return;
      }

      const response = await tenantService.filter({ filters: validFilters }) as any;
      setTenants(response || []);
    } catch (error) {
      message.error('Failed to filter tenants');
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = async () => {
    setPowerFilters([{ field: 'name', operator: 'contains', value: '' }]);
    await loadTenants();
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
      const parsedUrl = new URL(url);
      // Hide password from display
      const displayUrl = url.replace(/:\/\/([^:]+):[^@]+@/, '://$1:***@');
      return displayUrl;
    } catch {
      return url;
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
      sorter: (a: Tenant, b: Tenant) => a.name.localeCompare(b.name),
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
            fontFamily: 'monospace'
          }}
        >
          {formatDbUrl(dbUrl).length > 30
            ? formatDbUrl(dbUrl).substring(0, 27) + '...'
            : formatDbUrl(dbUrl)
          }
        </span>
      ),
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => formatDate(date),
      sorter: (a: Tenant, b: Tenant) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    },
    {
      title: 'Updated',
      dataIndex: 'updated_at',
      key: 'updated_at',
      render: (date: string) => formatDate(date),
      sorter: (a: Tenant, b: Tenant) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime(),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_: any, tenant: Tenant) => (
        <Space size="small">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(tenant)}
            style={{
              color: '#1890ff',
            }}
          />
          <Button
            type="text"
            danger
            size="small"
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(tenant.id)}
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
          <Typography.Title level={2} style={{ margin: 0 }}>Tenants</Typography.Title>
          <Typography.Text type="secondary">Manage tenant configurations and database connections</Typography.Text>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleNewTenant}
        >
          Add Tenant
        </Button>
      </div>

      <Divider />

      {/* Search Filters */}
      <Card
        title="Search Filters"
        size="small"
        style={{ borderRadius: '8px', marginTop: '16px' }}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {powerFilters.map((filter, index) => (
            <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <Select
                style={{ width: 150 }}
                value={filter.field}
                onChange={(value) => updateFilter(index, 'field', value)}
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
                onChange={(value) => updateFilter(index, 'operator', value)}
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
                onChange={(e) => updateFilter(index, 'value', e.target.value)}
              />

              <Button
                type="text"
                danger
                icon={<MinusCircleOutlined />}
                onClick={() => removeFilter(index)}
                disabled={powerFilters.length <= 1}
              >
                Remove
              </Button>

              {index === powerFilters.length - 1 && (
                <Button
                  type="text"
                  icon={<PlusCircleOutlined />}
                  onClick={addFilter}
                >
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
            <Button onClick={clearFilters}>
              Clear All
            </Button>
          </Space>

          <div style={{ fontSize: '14px', color: '#666' }}>
            <Typography.Text strong>Note:</Typography.Text> For date fields, use ISO format (e.g., 2023-12-25T10:00:00.000Z).
            Empty values are ignored in filtering.
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
          rowClassName={(record, index) =>
            index % 2 === 0 ? 'stripe-row' : ''
          }
          pagination={{
            pageSize: 12,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => (
              <div style={{
                padding: '8px 16px',
                background: 'linear-gradient(135deg, var(--primary-100) 0%, var(--accent-50) 100%)',
                borderRadius: '12px',
                border: '2px solid var(--primary-200)',
                fontWeight: '600',
                color: 'var(--tertiary-600)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span style={{ fontSize: '18px' }}>🌿</span>
                <span>
                  Showing <strong style={{ color: 'var(--primary-600)' }}>{range[0]}</strong> to{' '}
                  <strong style={{ color: 'var(--primary-600)' }}>{range[1]}</strong> of{' '}
                  <strong style={{ color: 'var(--secondary-600)' }}>{total}</strong> tenants
                </span>
              </div>
            ),
            style: {
              marginTop: '16px',
              border: '2px solid var(--primary-200)',
              borderRadius: '12px',
              padding: '12px',
              background: 'var(--neutral-50)',
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '8px',
              justifyContent: 'center',
            },
            itemRender: (page, type, originalElement) => {
              // Navigation buttons with pharmacy theme
              if (type === 'prev') {
                return (
                  <div
                    style={{
                      border: '2px solid var(--primary-400)',
                      borderRadius: '12px',
                      padding: '8px 12px',
                      margin: '0 4px',
                      background: 'linear-gradient(135deg, var(--primary-100) 0%, var(--primary-200) 100%)',
                      color: 'var(--primary-700)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontWeight: '600',
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      cursor: 'pointer',
                      fontSize: '14px',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.05)';
                      e.currentTarget.style.background = 'linear-gradient(135deg, var(--primary-200) 0%, var(--primary-300) 100%)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.background = 'linear-gradient(135deg, var(--primary-100) 0%, var(--primary-200) 100%)';
                    }}
                  >
                    <LeftOutlined style={{ fontSize: '16px' }} />
                    <span>Previous</span>
                  </div>
                );
              }

              if (type === 'next') {
                return (
                  <div
                    style={{
                      border: '2px solid var(--primary-400)',
                      borderRadius: '12px',
                      padding: '8px 12px',
                      margin: '0 4px',
                      background: 'linear-gradient(135deg, var(--primary-100) 0%, var(--primary-200) 100%)',
                      color: 'var(--primary-700)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontWeight: '600',
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      cursor: 'pointer',
                      fontSize: '14px',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.05)';
                      e.currentTarget.style.background = 'linear-gradient(135deg, var(--primary-200) 0%, var(--primary-300) 100%)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.background = 'linear-gradient(135deg, var(--primary-100) 0%, var(--primary-200) 100%)';
                    }}
                  >
                    <span>Next</span>
                    <RightOutlined style={{ fontSize: '16px' }} />
                  </div>
                );
              }

              // Page numbers with clean rectangular styling
              if (type === 'page') {
                return (
                  <Button
                    type="text"
                    size="small"
                    style={{
                      minWidth: '32px',
                      height: '32px',
                      padding: '4px 8px',
                      margin: '0 2px',
                      fontWeight: '600',
                      fontSize: '14px',
                      border: 'none',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--primary-100)';
                      e.currentTarget.style.color = 'var(--primary-700)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = 'inherit';
                    }}
                  >
                    {page}
                  </Button>
                );
              }

              // Jump to first/last pages
              if (type === 'jump-prev' || type === 'jump-next') {
                return (
                  <div
                    style={{
                      border: '2px solid var(--secondary-300)',
                      borderRadius: '8px',
                      padding: '6px',
                      margin: '0 8px',
                      backgroundColor: 'var(--secondary-50)',
                      color: 'var(--secondary-600)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.1)';
                      e.currentTarget.style.backgroundColor = 'var(--secondary-100)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.backgroundColor = 'var(--secondary-50)';
                    }}
                  >
                    {type === 'jump-prev' ? <DoubleLeftOutlined /> : <DoubleRightOutlined />}
                  </div>
                );
              }

              return originalElement;
            },
          }}
          locale={{
            emptyText: tenants.length === 0
              ? <div style={{ textAlign: 'center', padding: '48px' }}>
                  <Typography.Text style={{ fontSize: '16px', color: '#999' }}>
                    No tenants yet. Add your first tenant!
                  </Typography.Text>
                  <br />
                  <br />
                  <Button type="primary" size="large" onClick={handleNewTenant}>Add Tenant</Button>
                </div>
              : 'No tenants match your search.',
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
        onCancel={() => setIsFormOpen(false)}
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
                pattern: /^postgres(?:ql)?:\/\/.+/,
                message: 'Please enter a valid PostgreSQL URL'
              }
            ]}
          >
            <Input placeholder="postgresql://user:password@host:port/database" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={isSubmitting}>
                {editingTenant ? 'Update Tenant' : 'Add Tenant'}
              </Button>
              <Button onClick={() => setIsFormOpen(false)}>Cancel</Button>
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
