/**
 * Backend API Person DTO Types
 *
 * These types represent the data structures returned from the backend API.
 * They may differ from the frontend Contact types and require transformation.
 */

/**
 * Person data transfer object from backend API
 * Represents the data structure returned by the backend for person/contact entities
 */
export interface PersonDTO {
  id?: string | number;
  tenant_id?: string;
  tenantId?: string;
  name?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  gender?: string | boolean;
  age?: number;
  address?: string | PersonAddressDTO;
  created_at?: string | number | Date;
  createdAt?: string | number | Date;
  updated_at?: string | number | Date;
  updatedAt?: string | number | Date;
  created_by?: string;
  createdBy?: string;
  updated_by?: string;
  updatedBy?: string;
  isActive?: boolean;
  is_active?: boolean;
}

/**
 * Address data transfer object from backend API
 */
export interface PersonAddressDTO {
  street1?: string;
  address?: string;
  street2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  zip_code?: string;
  country?: string;
}

/**
 * Create/Update Person DTO for backend API requests
 */
export interface CreatePersonDTO {
  name: string;
  email?: string;
  phone?: string;
  gender?: boolean;
  age?: number;
  address?: string;
  tenant_id: string;
}

/**
 * Update Person DTO for backend API requests
 */
export interface UpdatePersonDTO {
  id: string | number;
  name?: string;
  email?: string;
  phone?: string;
  gender?: boolean;
  age?: number;
  address?: string;
}
