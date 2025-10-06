import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import type { Contact } from '@/types/contact';
import { Gender } from '@/types/contact';
import { addressBookService, genderConversion } from '@/services/api';
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
  const [deleteContactId, setDeleteContactId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load contacts from API on component mount
  useEffect(() => {
    loadContacts();
  }, []);

  // Helper function to transform backend Person to frontend Contact
  const personToContact = (person: any): Contact => {
    const nameParts = person.name ? person.name.trim().split(/\s+/) : [];
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    return {
      id: person.id?.toString() || '',
      tenantId: tenant?.id || '',
      firstName,
      lastName,
      fullName: person.name || '',
      email: person.email || '',
      phone: person.phone || '',
      gender: typeof person.gender === 'boolean' ? genderConversion.fromBoolean(person.gender) : undefined,
      age: typeof person.age === 'number' ? person.age : undefined,
      address: {
        street1: person.address || '',
        street2: '',
        city: '',
        state: '',
        zipCode: '',
        country: 'USA',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'system',
      updatedBy: 'system',
      isActive: true,
    };
  };

  // Helper function to transform frontend Contact to backend PersonDTO
  const contactToPersonDTO = (name: string, address: string, phone: string, email: string, gender?: Gender, age?: number) => {
    return {
      name,
      address,
      phone,
      email,
      gender: gender ? genderConversion.toBoolean(gender) : false,
      age: age || 25,
    };
  };

  // Load contacts from API
  const loadContacts = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await addressBookService.getAll() as any;
      // Transform backend data to frontend Contact objects
      const contactData = Array.isArray(response.data)
        ? response.data.map(personToContact)
        : [];

      setContacts(contactData);
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to load contacts';
      setError(errorMessage);
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Filter contacts based on search term
  const filteredContacts = contacts.filter(contact =>
    contact.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contact.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contact.phone?.includes(searchTerm)
  );

  // Handle form submission
  const handleSubmit = async (values: AddressFormValues) => {
    setIsSubmitting(true);

    try {
      const dto = contactToPersonDTO(
        `${values.firstName} ${values.lastName}`,
        values.street1,
        values.phone || '',
        values.email || '',
        values.gender,
        values.age
      );

      if (editingContact) {
        // Update existing contact
        await addressBookService.update(editingContact.id, {
          name: `${values.firstName} ${values.lastName}`,
          gender: genderConversion.toBoolean(values.gender),
          age: values.age,
          address: values.street1,
          phone: values.phone || '',
          email: values.email || '',
        });
      } else {
        // Create new contact
        await addressBookService.create(dto);
      }

      // Reload contacts
      await loadContacts();

      // Success message
      const successMsg = editingContact ? 'Contact updated successfully!' : 'Contact created successfully!';
      message.success(successMsg);

      // Reset form and close modal on success
      setEditingContact(null);
      setIsFormOpen(false);
      form.resetFields();

    } catch (error: any) {
      const errorMessage = error?.message || 'An error occurred while saving the contact.';
      message.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle edit
  const handleEdit = (contact: Contact) => {
    setEditingContact(contact);
    form.setFieldsValue({
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      phone: contact.phone,
      gender: contact.gender as Gender || Gender.male, // Default if not available
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
  const handleDelete = (id: string) => {
    setDeleteContactId(id);
  };

  // Confirm delete
  const confirmDelete = async () => {
    if (deleteContactId) {
      try {
        await addressBookService.delete(deleteContactId);
        // Reload contacts
        await loadContacts();
        setDeleteContactId(null);
        message.success('Contact deleted successfully!');
      } catch (error: any) {
        const errorMessage = error?.message || 'Failed to delete contact';
        message.error(errorMessage);
      }
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
