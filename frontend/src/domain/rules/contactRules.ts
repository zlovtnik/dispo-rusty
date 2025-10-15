/**
 * Contact Business Rules
 *
 * Pure business logic for contact management operations.
 * These rules define validation, field requirements, and business constraints.
 */

import type { Result } from 'neverthrow';
import { ok, err } from 'neverthrow';
import type { Contact } from '../../types/contact';
import type { TenantSettings } from '../../types/auth';

/**
 * Contact field requirements by tenant
 */
export interface ContactFieldRequirements {
  firstName: boolean;
  lastName: boolean;
  email: boolean;
  phone: boolean;
  company: boolean;
  dateOfBirth: boolean;
  address: boolean;
}

/**
 * Default contact field requirements
 */
export const DEFAULT_CONTACT_REQUIREMENTS: ContactFieldRequirements = {
  firstName: true,
  lastName: true,
  email: false,
  phone: false,
  company: false,
  dateOfBirth: false,
  address: false,
};

/**
 * Contact validation error
 */
export type ContactValidationError =
  | { type: 'REQUIRED_FIELD_MISSING'; field: string }
  | { type: 'INVALID_FORMAT'; field: string; reason: string }
  | { type: 'DUPLICATE_CONTACT'; field: string; value: string }
  | { type: 'AGE_OUT_OF_RANGE'; age: number; min: number; max: number };

/**
 * Age calculation from date of birth
 *
 * @param dateOfBirth - Date of birth
 * @returns Age in years
 */
export function calculateAgeFromDOB(dateOfBirth: Date): number {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
}

/**
 * Validate email format
 *
 * @param email - Email address to validate
 * @returns Result containing void on success or error
 */
export function validateEmailFormat(email: string): Result<void, ContactValidationError> {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  if (!emailRegex.test(email)) {
    return err({
      type: 'INVALID_FORMAT',
      field: 'email',
      reason: 'Invalid email format',
    });
  }

  return ok(undefined);
}

/**
 * Validate phone format
 *
 * Accepts various formats:
 * - +1234567890
 * - (123) 456-7890
 * - 123-456-7890
 * - 123.456.7890
 *
 * @param phone - Phone number to validate
 * @returns Result containing void on success or error
 */
export function validatePhoneFormat(phone: string): Result<void, ContactValidationError> {
  // Remove all non-digit characters except leading +
  const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');

  // Should have 10-15 digits, optionally starting with +
  const phoneRegex = /^\+?[1-9]\d{9,14}$/;

  if (!phoneRegex.test(cleaned)) {
    return err({
      type: 'INVALID_FORMAT',
      field: 'phone',
      reason: 'Invalid phone format. Should be 10-15 digits.',
    });
  }

  return ok(undefined);
}

/**
 * Validate contact email uniqueness
 *
 * @param email - Email to check
 * @param existingContacts - List of existing contacts
 * @param excludeContactId - Contact ID to exclude from check (for updates)
 * @returns Result containing void on success or error
 */
export function validateEmailUniqueness(
  email: string,
  existingContacts: Contact[],
  excludeContactId?: string
): Result<void, ContactValidationError> {
  const duplicate = existingContacts.find(
    c => c.email?.toLowerCase() === email.toLowerCase() && c.id !== excludeContactId
  );

  if (duplicate) {
    return err({
      type: 'DUPLICATE_CONTACT',
      field: 'email',
      value: email,
    });
  }

  return ok(undefined);
}

/**
 * Validate contact phone uniqueness
 *
 * @param phone - Phone to check
 * @param existingContacts - List of existing contacts
 * @param excludeContactId - Contact ID to exclude from check (for updates)
 * @returns Result containing void on success or error
 */
export function validatePhoneUniqueness(
  phone: string,
  existingContacts: Contact[],
  excludeContactId?: string
): Result<void, ContactValidationError> {
  // Normalize phone numbers for comparison
  const normalizePhone = (p: string) => p.replace(/[\s\-\(\)\.]/g, '');
  const normalizedPhone = normalizePhone(phone);

  const duplicate = existingContacts.find(
    c => c.phone && normalizePhone(c.phone) === normalizedPhone && c.id !== excludeContactId
  );

  if (duplicate) {
    return err({
      type: 'DUPLICATE_CONTACT',
      field: 'phone',
      value: phone,
    });
  }

  return ok(undefined);
}

/**
 * Validate age is within acceptable range
 *
 * @param age - Age to validate
 * @param min - Minimum age (default: 0)
 * @param max - Maximum age (default: 150)
 * @returns Result containing void on success or error
 */
export function validateAgeRange(
  age: number,
  min = 0,
  max = 150
): Result<void, ContactValidationError> {
  if (age < min || age > max) {
    return err({
      type: 'AGE_OUT_OF_RANGE',
      age,
      min,
      max,
    });
  }

  return ok(undefined);
}

/**
 * Get required fields based on tenant settings
 *
 * @param tenantSettings - Tenant settings (optional)
 * @returns Contact field requirements
 */
export function getRequiredFieldsByTenant(
  tenantSettings?: TenantSettings
): ContactFieldRequirements {
  // In a real application, this would extract requirements from tenant settings
  // For now, return defaults
  return DEFAULT_CONTACT_REQUIREMENTS;
}

/**
 * Validate required fields are present
 *
 * @param contact - Contact to validate
 * @param requirements - Field requirements
 * @returns Result containing void on success or error with all missing fields
 */
export function validateRequiredFields(
  contact: Partial<Contact>,
  requirements: ContactFieldRequirements = DEFAULT_CONTACT_REQUIREMENTS
): Result<void, ContactValidationError> {
  const missingFields: string[] = [];

  if (requirements.firstName && !contact.firstName) {
    missingFields.push('firstName');
  }

  if (requirements.lastName && !contact.lastName) {
    missingFields.push('lastName');
  }

  if (requirements.email && !contact.email) {
    missingFields.push('email');
  }

  if (requirements.phone && !contact.phone) {
    missingFields.push('phone');
  }

  if (requirements.company && !contact.company) {
    missingFields.push('company');
  }

  if (requirements.dateOfBirth && !contact.dateOfBirth) {
    missingFields.push('dateOfBirth');
  }

  if (requirements.address && !contact.address) {
    missingFields.push('address');
  }

  if (missingFields.length > 0) {
    // Return first missing field error (guaranteed to exist)
    const firstMissingField = missingFields[0];
    if (!firstMissingField) {
      // This should never happen, but satisfy TypeScript
      return ok(undefined);
    }
    return err({
      type: 'REQUIRED_FIELD_MISSING',
      field: firstMissingField,
    });
  }

  return ok(undefined);
}

/**
 * Check if contact has minimum required contact info
 *
 * At least one of: email, phone, mobile
 *
 * @param contact - Contact to check
 * @returns true if has minimum contact info
 */
export function hasMinimumContactInfo(contact: Partial<Contact>): boolean {
  return !!(contact.email || contact.phone || contact.mobile);
}

/**
 * Calculate contact completeness percentage
 *
 * @param contact - Contact to evaluate
 * @returns Completeness percentage (0-100)
 */
export function calculateContactCompleteness(contact: Partial<Contact>): number {
  const fields = [
    'firstName',
    'lastName',
    'email',
    'phone',
    'mobile',
    'company',
    'jobTitle',
    'address',
    'dateOfBirth',
  ];

  const filledFields = fields.filter(field => {
    const value = contact[field as keyof Contact];
    return value !== null && value !== undefined && value !== '';
  }).length;

  return Math.round((filledFields / fields.length) * 100);
}

/**
 * Get contact quality score
 *
 * Evaluates contact quality based on:
 * - Completeness
 * - Data validity
 * - Recent activity
 *
 * @param contact - Contact to score
 * @returns Quality score (0-100)
 */
export function getContactQualityScore(contact: Contact): number {
  let score = 0;

  // Completeness (max 40 points)
  const completeness = calculateContactCompleteness(contact);
  score += completeness * 0.4;

  // Valid email (20 points)
  if (contact.email && validateEmailFormat(contact.email).isOk()) {
    score += 20;
  }

  // Valid phone (20 points)
  if (contact.phone && validatePhoneFormat(contact.phone).isOk()) {
    score += 20;
  }

  // Recent activity (max 20 points)
  if (contact.updatedAt) {
    const daysSinceUpdate =
      (Date.now() - new Date(contact.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceUpdate < 30) {
      score += 20;
    } else if (daysSinceUpdate < 90) {
      score += 10;
    } else if (daysSinceUpdate < 180) {
      score += 5;
    }
  }

  return Math.min(100, Math.round(score));
}

/**
 * Sanitize contact data
 *
 * Trims whitespace, normalizes formats, removes invalid data
 *
 * @param contact - Contact to sanitize
 * @returns Sanitized contact
 */
export function sanitizeContactData<T extends Partial<Contact>>(contact: T): T {
  return {
    ...contact,
    firstName: contact.firstName?.trim(),
    lastName: contact.lastName?.trim(),
    email: contact.email?.trim().toLowerCase(),
    phone: contact.phone?.trim(),
    mobile: contact.mobile?.trim(),
    company: contact.company?.trim(),
    jobTitle: contact.jobTitle?.trim(),
    notes: contact.notes?.trim(),
  };
}

/**
 * Format contact name for display
 *
 * @param contact - Contact
 * @param format - Name format ('full' | 'last-first' | 'first-only')
 * @returns Formatted name
 */
export function formatContactName(
  contact: Partial<Contact>,
  format: 'full' | 'last-first' | 'first-only' = 'full'
): string {
  switch (format) {
    case 'full':
      return `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
    case 'last-first':
      return `${contact.lastName || ''}, ${contact.firstName || ''}`.trim();
    case 'first-only':
      return contact.firstName || '';
    default:
      return `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
  }
}
