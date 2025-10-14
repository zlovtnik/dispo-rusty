import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import type { Contact, ContactListResponse } from '@/types/contact';
import { Gender } from '@/types/contact';
import { addressBookService } from '@/services/api';
import { genderConversion } from '@/transformers/gender';
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
  App,
  Spin,
  Select,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { isApiSuccess } from '@/types/api';
import { asContactId, asTenantId, asUserId } from '@/types/ids';

interface AddressFormValues {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  gender: Gender;
  age: number;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export const AddressBookPage: React.FC = () => {
  const { tenant } = useAuth();
  const { message } = App.useApp();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [deleteContactId, setDeleteContactId] = useState<Contact['id'] | null>(null);
  const [form] = Form.useForm();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load contacts from API on component mount
  // Helper function to transform backend Person to frontend Contact
  const generateFallbackContactId = () => `contact-${Math.random().toString(36).slice(2, 10)}`;

  const personToContact = (person: any): Contact => {
    const resolvedId = (() => {
      if (typeof person?.id === 'string' && person.id.trim()) return asContactId(person.id.trim());
      if (typeof person?.id === 'number') return asContactId(person.id.toString());
      return asContactId(generateFallbackContactId());
    })();

    const resolvedTenantId = (() => {
      if (typeof person?.tenantId === 'string' && person.tenantId.trim()) return asTenantId(person.tenantId.trim());
      if (typeof person?.tenant_id === 'string' && person.tenant_id.trim()) return asTenantId(person.tenant_id.trim());
      if (tenant?.id) return tenant.id;
      return asTenantId('tenant-fallback');
    })();

    const rawName = (() => {
      if (typeof person?.name === 'string' && person.name.trim()) return person.name.trim();
      if (typeof person?.fullName === 'string' && person.fullName.trim()) return person.fullName.trim();
      const first = typeof person?.firstName === 'string' ? person.firstName : '';
      const last = typeof person?.lastName === 'string' ? person.lastName : '';
      return [first, last].filter(Boolean).join(' ').trim();
    })();

    const nameParts = rawName ? rawName.split(/\s+/) : [];
    const firstName = nameParts[0] ?? '';
    const lastName = nameParts.slice(1).join(' ');

    const resolvedGender = (() => {
      if (typeof person?.gender === 'string') {
        return person.gender === Gender.female ? Gender.female : person.gender === Gender.male ? Gender.male : undefined;
      }
      if (typeof person?.gender === 'boolean') {
        return genderConversion.fromBoolean(person.gender).unwrapOr(undefined);
      }
      return undefined;
    })();

    const resolveDate = (value: unknown): Date => {
      if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) return parsed;
      }
      if (value instanceof Date) return value;
      return new Date();
    };

    const resolvedAddress = (() => {
      if (typeof person?.address === 'object' && person.address !== null) {
        const addressObj = person.address as Record<string, unknown>;
        const street1 = typeof addressObj.street1 === 'string' && addressObj.street1.trim()
          ? addressObj.street1.trim()
          : typeof addressObj.address === 'string'
            ? addressObj.address.trim()
            : '';

        return {
          street1,
          street2: typeof addressObj.street2 === 'string' ? addressObj.street2 : undefined,
          city: typeof addressObj.city === 'string' ? addressObj.city : '',
          state: typeof addressObj.state === 'string' ? addressObj.state : '',
          zipCode: typeof addressObj.zipCode === 'string' ? addressObj.zipCode : '',
          country: typeof addressObj.country === 'string' ? addressObj.country : 'USA',
        };
      }

      if (typeof person?.address === 'string') {
        return {
          street1: person.address,
          street2: undefined,
          city: '',
          state: '',
          zipCode: '',
          country: 'USA',
        };
      }

      return undefined;
    })();

    const createdBy = typeof person?.createdBy === 'string' && person.createdBy.trim()
      ? asUserId(person.createdBy.trim())
      : typeof person?.created_by === 'string' && person.created_by.trim()
        ? asUserId(person.created_by.trim())
        : asUserId('system');

    const updatedBy = typeof person?.updatedBy === 'string' && person.updatedBy.trim()
      ? asUserId(person.updatedBy.trim())
      : typeof person?.updated_by === 'string' && person.updated_by.trim()
        ? asUserId(person.updated_by.trim())
        : createdBy;

    return {
      id: resolvedId,
      tenantId: resolvedTenantId,
      firstName,
      lastName,
      fullName: rawName || [firstName, lastName].filter(Boolean).join(' '),
      email: typeof person?.email === 'string' ? person.email : undefined,
      phone: typeof person?.phone === 'string' ? person.phone : undefined,
      gender: resolvedGender,
      age: typeof person?.age === 'number' ? person.age : undefined,
      address: resolvedAddress,
      createdAt: resolveDate(person?.createdAt ?? person?.created_at),
      updatedAt: resolveDate(person?.updatedAt ?? person?.updated_at ?? person?.createdAt ?? person?.created_at),
      createdBy,
      updatedBy,
      isActive: typeof person?.isActive === 'boolean' ? person.isActive : true,
    };
  };

  // Helper function to transform frontend Contact to backend PersonDTO
  const contactToPersonDTO = (formValues: AddressFormValues) => {
    const name = `${formValues.firstName} ${formValues.lastName}`.trim();
    const addressSegments = [
      formValues.street1,
      formValues.street2,
      formValues.city,
      formValues.state,
      formValues.zipCode,
      formValues.country,
    ]
      .map(segment => (segment ?? '').trim())
      .filter(segment => segment.length > 0);

    return {
      name: name || formValues.street1,
      address: addressSegments.join(', ') || formValues.street1,
      phone: formValues.phone ?? '',
      email: formValues.email ?? '',
      gender: genderConversion.toBoolean(formValues.gender).unwrapOr(true),
      age: typeof formValues.age === 'number' ? formValues.age : 25,
    };
  };

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
      const errorMessage = result.error.message || 'Failed to load contacts';
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

    const data = apiResponse.data as ContactListResponse;
    const records = Array.isArray(data?.contacts) ? data.contacts : [];
    const normalizedContacts = records.map(personToContact);
    setContacts(normalizedContacts);
    setLoading(false);
  }, [message, tenant]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  // Filter contacts based on search term
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredContacts = useMemo(() => {
    if (!normalizedSearch) {
      return contacts;
    }

    return contacts.filter(contact => {
      const matchesName = contact.fullName?.toLowerCase().includes(normalizedSearch);
      const matchesEmail = contact.email?.toLowerCase().includes(normalizedSearch);
      const matchesPhone = contact.phone?.includes(normalizedSearch);
      return Boolean(matchesName || matchesEmail || matchesPhone);
    });
  }, [contacts, normalizedSearch]);

  // Handle form submission
  const handleSubmit = async (values: AddressFormValues) => {
    setIsSubmitting(true);
    const dto = contactToPersonDTO(values);

    const isUpdating = Boolean(editingContact);
    const result = isUpdating
      ? await addressBookService.update(editingContact!.id, dto)
      : await addressBookService.create(dto);

    if (result.isErr()) {
      const errorMessage = result.error.message || 'An error occurred while saving the contact.';
      message.error(errorMessage);
      setIsSubmitting(false);
      return;
    }

    const apiResponse = result.value;

    if (!isApiSuccess(apiResponse)) {
      const errorMessage = apiResponse.error.message || 'An error occurred while saving the contact.';
      message.error(errorMessage);
      setIsSubmitting(false);
      return;
    }

    const successMsg = apiResponse.message ?? (isUpdating ? 'Contact updated successfully!' : 'Contact created successfully!');
    message.success(successMsg);

    await loadContacts();

    setEditingContact(null);
    setIsFormOpen(false);
    form.resetFields();
    setIsSubmitting(false);
  };

  // Handle edit
  const handleEdit = (contact: Contact) => {
    setEditingContact(contact);
    form.setFieldsValue({
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      phone: contact.phone,
      gender: contact.gender ?? Gender.male,
      age: contact.age || 25, // Default if not available
      street1: contact.address?.street1,
      street2: contact.address?.street2,
      city: contact.address?.city,
      state: contact.address?.state,
      zipCode: contact.address?.zipCode,
      country: contact.address?.country,
    });
    setIsFormOpen(true);
  };

  // Handle delete - open confirmation modal
  const handleDelete = (id: Contact['id']) => {
    setDeleteContactId(id);
  };

  // Confirm delete
  const confirmDelete = async () => {
    if (deleteContactId) {
      const result = await addressBookService.delete(deleteContactId);

      if (result.isErr()) {
        const errorMessage = result.error.message || 'Failed to delete contact';
        message.error(errorMessage);
        return;
      }

      const apiResponse = result.value;

      if (!isApiSuccess(apiResponse)) {
        const errorMessage = apiResponse.error.message || 'Failed to delete contact';
        message.error(errorMessage);
        return;
      }

      setDeleteContactId(null);
      await loadContacts();
      message.success(apiResponse.message ?? 'Contact deleted successfully!');
    }
  };

  // Cancel delete
  const cancelDelete = () => {
    setDeleteContactId(null);
  };

  // Open form for new contact
  const handleNewContact = () => {
    setEditingContact(null);
    form.resetFields();
    setIsFormOpen(true);
  };

  // Table columns for contacts display
  const columns = [
    {
      title: 'Name',
      dataIndex: 'fullName',
      key: 'fullName',
      sorter: (a: Contact, b: Contact) => a.fullName.localeCompare(b.fullName),
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: 'Phone',
      dataIndex: 'phone',
      key: 'phone',
    },
    {
      title: 'Address',
      dataIndex: 'address',
      key: 'address',
      render: (address: Contact['address']) => {
        if (!address) return '-';

        const parts = [];

        if (address.street1) parts.push(address.street1);
        if (address.city) parts.push(address.city);
        if (address.state && address.zipCode) {
          parts.push(`${address.state} ${address.zipCode}`);
        } else {
          if (address.state) parts.push(address.state);
          if (address.zipCode) parts.push(address.zipCode);
        }
        if (address.country) parts.push(address.country);

        return parts.length > 0 ? parts.join(', ') : '-';
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, contact: Contact) => (
        <Space size="middle">
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(contact)}
          >
            Edit
          </Button>
          <Button
            type="link"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(contact.id)}
          >
            Delete
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Typography.Title level={2} style={{ margin: 0 }}>Address Book</Typography.Title>
          <Typography.Text type="secondary">Manage your contacts and addresses</Typography.Text>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleNewContact}
        >
          Add Contact
        </Button>
      </div>

      <Divider />

      {/* Search Bar */}
      <Input
        placeholder="Search contacts..."
        prefix={<SearchOutlined />}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        style={{ maxWidth: 400 }}
      />

      {/* Error Alert */}
      {error && (
        <Alert
          message="Error Loading Contacts"
          description={error}
          type="error"
          showIcon
          closable
          onClose={() => setError(null)}
        />
      )}

      {/* Contacts Table */}
      <Card title={`Contacts (${filteredContacts.length})`}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '32px' }}>
            <Spin size="large" />
            <Typography.Text style={{ marginLeft: 8 }}>Loading contacts...</Typography.Text>
          </div>
        ) : (
          <Table
            columns={columns}
            dataSource={filteredContacts}
            rowKey="id"
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} contacts`,
            }}
            locale={{
              emptyText: contacts.length === 0
                ? <div style={{ textAlign: 'center', padding: '32px' }}>
                    <Typography.Text>No contacts yet. Add your first contact!</Typography.Text>
                    <br />
                    <br />
                    <Button type="primary" onClick={handleNewContact}>Add Contact</Button>
                  </div>
                : 'No contacts match your search.',
            }}
          />
        )}
      </Card>

      {/* Contact Form Modal */}
      <Modal
        title={editingContact ? 'Edit Contact' : 'Add New Contact'}
        open={isFormOpen}
        onCancel={() => setIsFormOpen(false)}
        footer={null}
      >
        <Form
          form={form}
          onFinish={handleSubmit}
          layout="vertical"
          initialValues={{
            firstName: '',
            lastName: '',
            email: '',
            phone: '',
            gender: Gender.male,
            age: 25,
            street1: '',
            street2: '',
            city: '',
            state: '',
            zipCode: '',
            country: 'USA',
          }}
        >
          <Form.Item name="firstName" label="First Name" rules={[{ required: true, message: 'Please enter first name' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="lastName" label="Last Name" rules={[{ required: true, message: 'Please enter last name' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Please enter a valid email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="Phone">
            <Input />
          </Form.Item>

          <Form.Item name="gender" label="Gender" rules={[{ required: true, message: 'Please select gender' }]}>
            <Select style={{ width: '100%' }}>
              <Select.Option value="male">Male</Select.Option>
              <Select.Option value="female">Female</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item name="age" label="Age" rules={[{ required: true, message: 'Please enter age' }, { type: 'number', min: 1, max: 120, message: 'Age must be between 1 and 120' }]}>
            <Input type="number" min={1} max={120} />
          </Form.Item>

          <Divider>Address</Divider>

          <Form.Item name="street1" label="Street Address" rules={[{ required: true, message: 'Please enter street address' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="street2" label="Street Address 2">
            <Input />
          </Form.Item>
          <Form.Item name="city" label="City" rules={[{ required: true, message: 'Please enter city' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="state" label="State" rules={[{ required: true, message: 'Please enter state' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="zipCode" label="ZIP Code" rules={[{ required: true, message: 'Please enter ZIP code' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="country" label="Country" rules={[{ required: true, message: 'Please enter country' }]}>
            <Input />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={isSubmitting}>
                {editingContact ? 'Update Contact' : 'Add Contact'}
              </Button>
              <Button onClick={() => setIsFormOpen(false)}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteContactId !== null}
        title="Delete Contact"
        message="Are you sure you want to delete this contact? This action cannot be undone."
        confirmText="Delete"
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </Space>
  );
};
