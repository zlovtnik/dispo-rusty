import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ConfirmationModal } from '@/components/ConfirmationModal';
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
  const [deleteContactId, setDeleteContactId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
  });
  const [formError, setFormError] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Validate form data
  const validateForm = () => {
    const trimmedName = formData.name.trim();
    const trimmedEmail = formData.email.trim();
    const trimmedPhone = formData.phone.trim();

    if (!trimmedName) {
      return 'Name is required';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (trimmedEmail && !emailRegex.test(trimmedEmail)) {
      return 'Please enter a valid email address';
    }

    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    if (trimmedPhone && !phoneRegex.test(trimmedPhone.replace(/[\s\-\(\)]/g, ''))) {
      return 'Please enter a valid phone number';
    }

    return null;
  };

  // Filter contacts based on search term
  const filteredContacts = contacts.filter(contact =>
    contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contact.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contact.phone?.includes(searchTerm)
  );

  // Handle form submission for both create and update
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSuccessMessage('');

    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setIsSubmitting(true);

    try {
      const trimmedFormData = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        address: formData.address.trim(),
      };

      if (editingContact) {
        // Update existing contact
        setContacts(prev => prev.map(contact =>
          contact.id === editingContact.id
            ? {
                ...contact,
                ...trimmedFormData,
                updatedAt: new Date().toISOString(),
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
          ...trimmedFormData,
          tenantId: tenant.id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setContacts(prev => [...prev, newContact]);
      }

      // Success
      const successMsg = editingContact ? 'Contact updated successfully!' : 'Contact created successfully!';
      setSuccessMessage(successMsg);

      // Reset form and close modal on success
      setFormData({
        name: '',
        email: '',
        phone: '',
        address: '',
      });
      setEditingContact(null);
      setIsFormOpen(false);

      // Clear success message after delay to allow user to see it
      setTimeout(() => setSuccessMessage(''), 3000);

    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'An error occurred while saving the contact.');
    } finally {
      setIsSubmitting(false);
    }
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
    setFormError('');
    setSuccessMessage('');
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
    }
  };

  // Cancel delete
  const cancelDelete = () => {
    setDeleteContactId(null);
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
    setFormError('');
    setSuccessMessage('');
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

      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-green-800">{successMessage}</p>
            </div>
          </div>
        </div>
      )}

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

            {formError && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-red-800">{formError}</p>
                  </div>
                </div>
              </div>
            )}

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
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : (editingContact ? 'Update Contact' : 'Add Contact')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteContactId !== null}
        title="Delete Contact"
        message="Are you sure you want to delete this contact? This action cannot be undone."
        confirmText="Delete"
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </div>
  );
};
