import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import type { Contact } from '@/types/contact';
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
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
} from '@ant-design/icons';

export const AddressBookPage: React.FC = () => {
  const { tenant } = useAuth();
  const { message } = App.useApp();
  const [contacts, setContacts] = useState<Contact[]>([
    // Mock data for demonstration - using full Contact structure
    {
      id: '1',
      tenantId: 'tenant1',
      firstName: 'John',
      lastName: 'Doe',
      fullName: 'John Doe',
      email: 'john@example.com',
      phone: '+1-555-0123',
      address: {
        street1: '123 Main St',
        street2: '',
        city: 'Anytown',
        state: 'CA',
        zipCode: '12345',
        country: 'USA',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'system',
      updatedBy: 'system',
      isActive: true,
    },
    {
      id: '2',
      tenantId: 'tenant1',
      firstName: 'Jane',
      lastName: 'Smith',
      fullName: 'Jane Smith',
      email: 'jane@example.com',
      phone: '+1-555-0456',
      address: {
        street1: '456 Oak Ave',
        street2: '',
        city: 'Somewhere',
        state: 'CA',
        zipCode: '67890',
        country: 'USA',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'system',
      updatedBy: 'system',
      isActive: true,
    },
  ]);

  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [deleteContactId, setDeleteContactId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter contacts based on search term
  const filteredContacts = contacts.filter(contact =>
    contact.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contact.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contact.phone?.includes(searchTerm)
  );

  // Handle form submission
  const handleSubmit = async (values: any) => {
    setIsSubmitting(true);

    try {
      if (editingContact) {
        // Update existing contact
        setContacts(prev => prev.map(contact =>
          contact.id === editingContact.id
            ? {
                ...contact,
                fullName: `${values.firstName} ${values.lastName}`,
                firstName: values.firstName,
                lastName: values.lastName,
                email: values.email,
                phone: values.phone,
                address: {
                  street1: values.street1,
                  street2: values.street2 || '',
                  city: values.city,
                  state: values.state,
                  zipCode: values.zipCode,
                  country: values.country,
                },
                updatedAt: new Date(),
                updatedBy: 'system',
              }
            : contact
        ));
      } else {
        // Create new contact
        if (!tenant?.id) {
          throw new Error('Tenant ID is required to create contacts.');
        }
        const newContact: Contact = {
          id: crypto.randomUUID(),
          tenantId: tenant.id,
          firstName: values.firstName,
          lastName: values.lastName,
          fullName: `${values.firstName} ${values.lastName}`,
          email: values.email,
          phone: values.phone,
          address: {
            street1: values.street1,
            street2: values.street2 || '',
            city: values.city,
            state: values.state,
            zipCode: values.zipCode,
            country: values.country,
          },
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'system',
          updatedBy: 'system',
          isActive: true,
        };
        setContacts(prev => [...prev, newContact]);
      }

      // Success message
      const successMsg = editingContact ? 'Contact updated successfully!' : 'Contact created successfully!';
      message.success(successMsg);

      // Reset form and close modal on success
      setEditingContact(null);
      setIsFormOpen(false);
      form.resetFields();

    } catch (error) {
      message.error(error instanceof Error ? error.message : 'An error occurred while saving the contact.');
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
  const confirmDelete = () => {
    if (deleteContactId) {
      setContacts(prev => prev.filter(contact => contact.id !== deleteContactId));
      setDeleteContactId(null);
      message.success('Contact deleted successfully!');
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

      {/* Contacts Table */}
      <Card title={`Contacts (${filteredContacts.length})`}>
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
            street1: '',
            street2: '',
            city: '',
            state: '',
            zipCode: '',
            country: '',
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
            <Input defaultValue="USA" />
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
