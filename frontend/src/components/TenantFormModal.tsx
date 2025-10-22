/**
 * TenantFormModal Component
 * Modal form for adding and editing tenants
 */

import React from 'react';
import { Modal, Form, Input, Button, Space } from 'antd';
import type { FormInstance } from 'antd';

import type { Tenant } from '@/types/tenant';

interface TenantFormModalProps {
  isOpen: boolean;
  editingTenant: Tenant | null;
  form: FormInstance;
  onSubmit: (values: { name: string; db_url: string }) => void;
  onCancel: () => void;
}

export const TenantFormModal: React.FC<TenantFormModalProps> = React.memo(
  ({ isOpen, editingTenant, form, onSubmit, onCancel }) => {
    return (
      <Modal
        title={editingTenant ? 'Edit Tenant' : 'Add New Tenant'}
        open={isOpen}
        onCancel={onCancel}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          onFinish={onSubmit}
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
            <Input placeholder="Enter tenant name" />
          </Form.Item>

          <Form.Item
            name="db_url"
            label="Database URL"
            rules={[{ required: true, message: 'Please enter database URL' }]}
          >
            <Input placeholder="postgresql://localhost/tenant_db" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={onCancel}>Cancel</Button>
              <Button type="primary" htmlType="submit">
                {editingTenant ? 'Update' : 'Create'} Tenant
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    );
  }
);

TenantFormModal.displayName = 'TenantFormModal';
