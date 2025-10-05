import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { Contact } from '@/types/contact';

export const AddressBookPage: React.FC = () => {
  const { tenant } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([
    // Mock data for demonstration
    {
      id: '1',
      name: 'John Doe',
      email: 'john@example.com',
      phone: '+1-555-0123',
      address: '123 Main St, Anytown, USA',
      tenantId: 'tenant1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: '2',
      name: 'Jane Smith',
      email: 'jane@example.com',
      phone: '+1-555-0456',
      address: '456 Oak Ave, Somewhere, USA',
      tenantId: 'tenant1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]);

  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
  });

  // Filter contacts based on search term
  const filteredContacts = contacts.filter(contact =>
    contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contact.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contact.phone?.includes(searchTerm)
  );

  // Handle form submission for both create and update
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (editingContact) {
      // Update existing contact
      setContacts(prev => prev.map(contact =>
        contact.id === editingContact.id
          ? {
              ...contact,
              ...formData,
              updatedAt: new Date().toISOString(),
            }
          : contact
      ));
    } else {
      // Create new contact
      if (!tenant?.id) {
        alert('Tenant ID is required to create contacts.');
        return;
      }
      const newContact: Contact = {
        id: crypto.randomUUID(),
        ...formData,
        tenantId: tenant.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setContacts(prev => [...prev, newContact]);
    }

    // Reset form and close modal
    setFormData({
      name: '',
      email: '',
      phone: '',
      address: '',
    });
    setEditingContact(null);
    setIsFormOpen(false);
  };

  // Handle edit
  const handleEdit = (contact: Contact) => {
    setEditingContact(contact);
    setFormData({
      name: contact.name,
      email: contact.email || '',
      phone: contact.phone || '',
      address: contact.address || '',
    });
    setIsFormOpen(true);
  };

  // Handle delete
  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this contact?')) {
      setContacts(prev => prev.filter(contact => contact.id !== id));
    }
  };

  // Open form for new contact
  const handleNewContact = () => {
    setEditingContact(null);
    setFormData({
      name: '',
      email: '',
      phone: '',
      address: '',
    });
    setIsFormOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Address Book</h1>
          <p className="text-gray-600">Manage your contacts and addresses</p>
        </div>
        <button
          onClick={handleNewContact}
          className="btn btn-primary"
        >
          Add Contact
        </button>
      </div>

      {/* Search Bar */}
      <div className="max-w-md">
        <input
          type="text"
          placeholder="Search contacts..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="form-input"
        />
      </div>

      {/* Contacts List */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-gray-900">
            Contacts ({filteredContacts.length})
          </h3>
        </div>
        <div className="card-body">
          {filteredContacts.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-4">
                {contacts.length === 0 ? 'No contacts yet. Add your first contact!' : 'No contacts match your search.'}
              </p>
              {contacts.length === 0 && (
                <button
                  onClick={handleNewContact}
                  className="btn btn-primary"
                >
                  Add Contact
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredContacts.map((contact) => (
                <div key={contact.id} className="border rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                    <div className="flex-1">
                      <h4 className="text-lg font-semibold text-gray-900 mb-2">
                        {contact.name}
                      </h4>
                      <div className="space-y-1 text-sm text-gray-600">
                        {contact.email && (
                          <p>📧 {contact.email}</p>
                        )}
                        {contact.phone && (
                          <p>📞 {contact.phone}</p>
                        )}
                        {contact.address && (
                          <p>📍 {contact.address}</p>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-2">
                        Last updated: {new Date(contact.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleEdit(contact)}
                        className="btn btn-secondary text-xs"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(contact.id)}
                        className="btn bg-red-600 text-white hover:bg-red-700 text-xs"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Contact Form Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingContact ? 'Edit Contact' : 'Add New Contact'}
              </h3>
              <button
                onClick={() => setIsFormOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="form-group">
                <label htmlFor="name" className="form-label">Name *</label>
                <input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="form-input"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="email" className="form-label">Email</label>
                <input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="phone" className="form-label">Phone</label>
                <input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="address" className="form-label">Address</label>
                <textarea
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                  className="form-input"
                  rows={3}
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                >
                  {editingContact ? 'Update Contact' : 'Add Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
