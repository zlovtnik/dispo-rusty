// Contact/Address Book Types with Enhanced Fields
import type { ContactId, TenantId, UserId } from './ids';
import type { Gender as PersonGenderType } from './person';
import { Gender as PersonGender } from './person';

export interface Contact {
  id: ContactId;
  tenantId: TenantId;
  // Personal Information
  firstName: string;
  lastName: string;
  fullName: string;
  preferredName?: string;
  title?: string;
  suffix?: string;
  // Contact Information
  email?: string;
  phone?: string;
  mobile?: string;
  fax?: string;
  website?: string;
  // Address Information
  address?: Address;
  shippingAddress?: Address;
  // Professional Information
  company?: string;
  jobTitle?: string;
  department?: string;
  // Health Information (Pharmacy Context)
  dateOfBirth?: Date;
  gender?: PersonGenderType;
  age?: number;
  allergies?: string[];
  medications?: string[];
  medicalNotes?: string;
  emergencyContact?: EmergencyContact;
  // Additional Information
  notes?: string;
  tags?: string[];
  customFields?: Record<string, unknown>;
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  createdBy: UserId;
  updatedBy: UserId;
  isActive: boolean;
}

export interface Address {
  id?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  latitude?: number;
  longitude?: number;
}

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
  email?: string;
}

// Contact Form and Validation Types
export interface ContactFormData {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  mobile?: string;
  address?: AddressFormData;
  company?: string;
  jobTitle?: string;
  dateOfBirth?: string;
  allergies?: string;
  medications?: string;
  medicalNotes?: string;
  emergencyContact?: EmergencyContactFormData;
  notes?: string;
  tags?: string[];
}

export interface AddressFormData {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export interface EmergencyContactFormData {
  name: string;
  relationship: string;
  phone: string;
  email?: string;
}

// Contact List and Search Types
export interface ContactListParams {
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'email' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
  search?: string;
  tag?: string;
  hasEmail?: boolean;
  hasPhone?: boolean;
}

export interface ContactListResponse {
  contacts: Contact[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// Contact CRUD Types
export interface CreateContactRequest extends Omit<ContactFormData, 'customFields'> {
  customFields?: Record<string, unknown>;
}

export interface UpdateContactRequest extends Partial<CreateContactRequest> {
  id: ContactId;
}

export interface ContactResponse {
  success: boolean;
  contact?: Contact;
  error?: string;
  message?: string;
}

export interface BulkContactOperation {
  operation: 'delete' | 'tag' | 'untag' | 'export';
  contactIds: ContactId[];
  tagName?: string; // for tag/untag operations
  exportFormat?: 'csv' | 'json' | 'vcard';
}

export interface BulkContactResponse {
  success: boolean;
  processed: number;
  failed: number;
  errors?: string[];
  data?: any; // for export operations
}

// Contact Import/Export Types
export interface ContactImportRequest {
  file: File;
  format: 'csv' | 'json' | 'vcard';
  mapping?: Record<string, string>; // column mapping for CSV
  options?: {
    skipDuplicates?: boolean;
    updateExisting?: boolean;
    sendWelcomeEmails?: boolean;
  };
}

export interface ContactImportResponse {
  success: boolean;
  imported: number;
  skipped: number;
  errors: ImportError[];
  total: number;
}

export interface ImportError {
  row: number;
  field?: string;
  message: string;
}

// Contact Tags and Categories
export interface ContactTag {
  id: ContactId;
  name: string;
  color: string;
  description?: string;
  tenantId: TenantId;
  createdAt: Date;
  usageCount: number;
}

export interface ContactTagStats {
  tagId: ContactId;
  tagName: string;
  contactCount: number;
}

export const Gender = PersonGender;
export type Gender = PersonGenderType;
