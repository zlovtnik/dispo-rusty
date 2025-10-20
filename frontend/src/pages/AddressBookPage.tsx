import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import type { Contact, ContactListResponse } from '@/types/contact';
import { Gender } from '@/types/contact';
import { normalizePersonDTO, type PersonDTO } from '@/types/person';
import { addressBookService } from '@/services/api';
import { getEnv } from '@/config/env';
import {
  Button,
  Input,
  InputNumber,
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
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import { isApiSuccess } from '@/types/api';
import { asContactId, asTenantId, asUserId } from '@/types/ids';

interface AddressFormValues {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  gender?: Gender;
  age: number;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

let cachedDefaultCountry: string | null = null;

function getDefaultCountry(): string {
  if (cachedDefaultCountry === null) {
    try {
      const value = getEnv().defaultCountry;
      cachedDefaultCountry =
        typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
    } catch {
      // Fallback if environment not available during tests
      cachedDefaultCountry = '';
    }
  }
  return cachedDefaultCountry;
}

const DEFAULT_COUNTRY = getDefaultCountry();

/**
 * Resolve the contact identifier from a backend person payload.
 * Expects a normalized PersonDTO - do not call normalizePersonDTO again.
 */
export const resolveContactId = (
  normalized: PersonDTO,
  fallback: () => Contact['id']
): Contact['id'] => {
  if (typeof normalized.id === 'string' && normalized.id.trim()) {
    return asContactId(normalized.id.trim());
  }

  if (typeof normalized.id === 'number') {
    return asContactId(normalized.id.toString());
  }

  return fallback();
};

/**
 * Parse the most complete name representation available from the person payload.
 * Expects a normalized PersonDTO - do not call normalizePersonDTO again.
 */
export const parseContactName = (
  normalized: PersonDTO
): { rawName: string; firstName: string; lastName: string } => {
  const computedFullName =
    normalized.fullName ??
    [normalized.firstName, normalized.lastName]
      .filter((segment): segment is string => Boolean(segment?.trim()))
      .join(' ')
      .trim();

  const rawName = computedFullName;
  const nameParts = rawName ? rawName.split(/\s+/) : [];
  const firstName = normalized.firstName ?? nameParts[0] ?? '';
  const lastName = normalized.lastName ?? nameParts.slice(1).join(' ');

  return { rawName, firstName, lastName };
};

/**
 * Resolve gender from multiple potential backend encodings.
 * Expects a normalized PersonDTO - do not call normalizePersonDTO again.
 */
export const resolveContactGender = (normalized: PersonDTO): Gender | undefined => {
  if (normalized.gender === null || normalized.gender === undefined) {
    return undefined;
  }

  if (
    normalized.gender === Gender.male ||
    normalized.gender === Gender.female ||
    normalized.gender === Gender.other
  ) {
    return normalized.gender;
  }

  return undefined;
};

/**
 * Normalise address information into the Contact schema.
 * Expects a normalized PersonDTO - do not call normalizePersonDTO again.
 */
export const normalizeContactAddress = (
  normalized: PersonDTO,
  defaultCountry: string
): Contact['address'] | undefined => {
  const address = normalized.address;

  if (!address) {
    return undefined;
  }

  return {
    street1: address.street1 ?? '',
    street2: address.street2,
    city: address.city ?? '',
    state: address.state ?? '',
    zipCode: address.zipCode ?? '',
    country: address.country ?? defaultCountry,
  };
};

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

  // Add pagination state
// Remove invalid paginationState - use Table's built-in  // Load contacts from API on component mount
  // Helper function to transform backend Person to frontend Contact
  const generateFallbackContactId = () => `contact-${Math.random().toString(36).slice(2, 10)}`;

  /**
   * Transform backend PersonDTO to frontend Contact type
   * @param person - Person data from backend API
   * @returns Properly typed Contact object for frontend use
   */
  const personToContact = useCallback(
    (person: PersonDTO): Contact => {
      const normalized = normalizePersonDTO(person);

      const resolvedId = resolveContactId(normalized, () =>
        asContactId(generateFallbackContactId())
      );

      const resolvedTenantId = (() => {
        if (typeof normalized.tenantId === 'string' && normalized.tenantId.trim()) {
          return asTenantId(normalized.tenantId.trim());
        }
        if (tenant?.id) return tenant.id;
        return asTenantId('tenant-fallback');
      })();

      const { rawName, firstName, lastName } = parseContactName(normalized);

      const resolvedGender = resolveContactGender(normalized);

      const resolvedAddress = normalizeContactAddress(normalized, DEFAULT_COUNTRY);

      const createdBy = normalized.createdBy ? asUserId(normalized.createdBy) : asUserId('system');

      const updatedBy = normalized.updatedBy ? asUserId(normalized.updatedBy) : createdBy;

      return {
        id: resolvedId,
        tenantId: resolvedTenantId,
        firstName,
        lastName,
        fullName: rawName || [firstName, lastName].filter(Boolean).join(' '),
        email: normalized.email,
        phone: normalized.phone,
        gender: resolvedGender,
        age: normalized.age,
        address: resolvedAddress,
        createdAt: normalized.createdAt ?? new Date(),
        updatedAt: normalized.updatedAt ?? normalized.createdAt ?? new Date(),
        createdBy,
        updatedBy,
        isActive: normalized.isActive ?? true,
      };
    },
    [tenant]
  );

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
      gender: formValues.gender,
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
    setPaginationState({
      current: data.page || 1,
      pageSize: data.limit || 10,
      total: data.total || 0,
    });
    setLoading(false);
  }, [message, tenant, personToContact]);

  useEffect(() => {
    const loadData = async () => {
      await loadContacts();
    };
    loadData();
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
      const errorMessage =
        apiResponse.error.message || 'An error occurred while saving the contact.';
      message.error(errorMessage);
      setIsSubmitting(false);
      return;
    }

    const successMsg =
      apiResponse.message ??
      (isUpdating ? 'Contact updated successfully!' : 'Contact created successfully!');
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
      gender: contact.gender,
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
      render: (_: unknown, contact: Contact) => (
        <Space size="middle">
          <Button
            type="link"
            icon={<EditOutlined />}
            data-testid={`edit-${contact.id}`}
            onClick={() => {
              handleEdit(contact);
            }}
          >
            Edit
          </Button>
          <Button
            type="link"
            danger
            icon={<DeleteOutlined />}
            onClick={() => {
              handleDelete(contact.id);
            }}
          >
            Delete
          </Button>
        </Space>
      ),
    },
  ];

  // Define loadContactsWithParams
  const loadContactsWithParams = async (params: {
    page?: number;
    limit?: number;
    search?: string;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
  }) => {
    if (!tenant) {
      setContacts([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const fullParams = {
      page: params.page || 1,
      limit: params.limit || 10,
      search: searchTerm,
      ...(params.sortField && { sort: `${params.sortField},${params.sortOrder}` }),
    };
    const result = await addressBookService.getAll(fullParams);

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
    setPaginationState({
      current: data.page || 1,
      pageSize: data.limit || 10,
      total: data.total || 0,
    });
    setLoading(false);
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Typography.Title level={2} style={{ margin: 0 }}>
            Address Book
          </Typography.Title>
          <Typography.Text type="secondary">Manage your contacts and addresses</Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleNewContact}>
          Add Contact
        </Button>
      </div>

      <Divider />

      {/* Search Bar */}
      <Input
        placeholder="Search contacts..."
        prefix={<SearchOutlined />}
        value={searchTerm}
        onChange={e => {
          setSearchTerm(e.target.value);
        }}
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
          onClose={() => {
            setError(null);
          }}
          action={
            <Button size="small" onClick={loadContacts}>
              Retry
            </Button>
          }
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
              current: paginationState.current,
              pageSize: paginationState.pageSize,
              total: paginationState.total,
              onChange: (page, pageSize) => {
                setPaginationState({ current: page, pageSize, total: paginationState.total });
                // Reload with new params
                loadContactsWithParams({ page, limit: pageSize });
              },
              showSorterTooltip: false,
            }}
            onChange={(pagination, filters, sorter) => {
              if (sorter.field && sorter.order) {
                setSorting({ field: sorter.field as string, order: sorter.order });
                // Reload with sorting
              }
            }}
            locale={{
              emptyText:
                contacts.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px' }}>
                    <Typography.Text>No contacts yet. Add your first contact!</Typography.Text>
                    <br />
                    <br />
                    <Button type="primary" onClick={handleNewContact}>
                      Add Contact
                    </Button>
                  </div>
                ) : (
                  'No contacts match your search.'
                ),
            }}
          />
        )}
      </Card>

      {/* Contact Form Modal */}
      <Modal
        title={editingContact ? 'Edit Contact' : 'Add New Contact'}
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
            firstName: '',
            lastName: '',
            email: '',
            phone: '',
            gender: undefined,
            age: 25,
            street1: '',
            street2: '',
            city: '',
            state: '',
            zipCode: '',
            country: DEFAULT_COUNTRY,
          }}
        >
          <Form.Item
            name="firstName"
            label="First Name"
            rules={[{ required: true, message: 'Please enter first name' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="lastName"
            label="Last Name"
            rules={[{ required: true, message: 'Please enter last name' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="email"
            label="Email"
            rules={[{ type: 'email', message: 'Please enter a valid email' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="Phone">
            <Input />
          </Form.Item>

          <Form.Item
            name="gender"
            label="Gender"
            rules={[{ required: true, message: 'Please select gender' }]}
          >
            <Select style={{ width: '100%' }} placeholder="Select gender" allowClear>
              <Select.Option value="male">Male</Select.Option>
              <Select.Option value="female">Female</Select.Option>
              <Select.Option value="other">Other</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="age"
            label="Age"
            rules={[
              { required: true, message: 'Please enter age' },
              { type: 'number', min: 1, max: 120, message: 'Age must be between 1 and 120' },
            ]}
          >
            <InputNumber min={1} max={120} style={{ width: '100%' }} />
          </Form.Item>

          <Divider>Address</Divider>

          <Form.Item
            name="street1"
            label="Street Address"
            rules={[{ required: true, message: 'Please enter street address' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="street2" label="Street Address 2">
            <Input />
          </Form.Item>
          <Form.Item
            name="city"
            label="City"
            rules={[{ required: true, message: 'Please enter city' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="state"
            label="State"
            rules={[{ required: true, message: 'Please enter state' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="zipCode"
            label="ZIP Code"
            rules={[{ required: true, message: 'Please enter ZIP code' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="country"
            label="Country"
            rules={[{ required: true, message: 'Please enter country' }]}
          >
            <Input />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={isSubmitting}>
                {editingContact ? 'Update Contact' : 'Add Contact'}
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
