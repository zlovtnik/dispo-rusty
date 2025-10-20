import { logger } from '../utils/logger';

export const Gender = {
  male: 'male',
  female: 'female',
  other: 'other',
} as const;

export type Gender = (typeof Gender)[keyof typeof Gender];

export interface PersonAddressDTO {
  street1?: string;
  street2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
}

/**
 * Canonical person data transfer object exposed to the frontend.
 */
export interface PersonDTO {
  id?: string | number;
  tenantId?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  gender?: Gender | null;
  age?: number;
  address?: PersonAddressDTO;
  createdAt?: Date;
  updatedAt?: Date;
  createdBy?: string;
  updatedBy?: string;
  isActive?: boolean;
}

export interface CreatePersonDTO {
  name: string;
  email?: string;
  phone?: string;
  gender?: Gender;
  age?: number;
  /**
   * Address handling note: This field accepts a string representation for API compatibility.
   * Backend may store addresses as a single string or convert structured address objects.
   * The PersonDTO normalizes this to a structured PersonAddressDTO for frontend use.
   * If your backend API expects a structured address object instead, update this to:
   * address?: PersonAddressDTO;
   * and adjust transformations accordingly.
   */
  address?: string;
  tenant_id: string;
}

export interface UpdatePersonDTO {
  id: string | number;
  name?: string;
  email?: string;
  phone?: string;
  gender?: Gender;
  age?: number;
  /**
   * Address handling note: This field accepts a string representation for API compatibility.
   * See CreatePersonDTO.address for details about API contract verification.
   */
  address?: string;
}

const toRecord = (input: unknown): Record<string, unknown> | null =>
  typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : null;

const pick = (source: Record<string, unknown>, keys: readonly string[]): unknown => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      return source[key];
    }
  }
  return undefined;
};

const asString = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toString();
  }

  return undefined;
};

const asNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

const asDate = (value: unknown): Date | undefined => {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isNaN(timestamp) ? undefined : new Date(timestamp);
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  return undefined;
};

interface GenderNormalizationContext {
  id?: string | number;
  source?: string;
  rawField?: unknown;
}

const normalizeGender = (
  value: unknown,
  options?: { strict?: boolean; context?: GenderNormalizationContext }
): Gender | null | undefined => {
  if (value === null) {
    return null;
  }

  // Note: boolean values are not normalized - they're invalid input types.
  // If your backend sends boolean gender values, validate them server-side.
  if (typeof value === 'boolean') {
    return undefined;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return undefined;
    }

    if (['male', 'm'].includes(normalized)) {
      return Gender.male;
    }

    if (['female', 'f'].includes(normalized)) {
      return Gender.female;
    }

    if (['other', 'non-binary', 'nonbinary', 'nb'].includes(normalized)) {
      return Gender.other;
    }

    // Log unrecognized gender values for visibility
    const contextInfo = options?.context ?? {};
    logger.warn('Unrecognized gender value encountered', {
      rawValue: value,
      normalizedValue: normalized,
      recordId: contextInfo.id,
      source: contextInfo.source ?? 'unknown',
      rawField: contextInfo.rawField,
    });

    if (options?.strict) {
      const contextStr = contextInfo.id
        ? `${contextInfo.source ?? 'unknown'} (id: ${String(contextInfo.id)})`
        : (contextInfo.source ?? 'unknown');
      throw new Error(`Invalid gender value: "${value}" in context: ${contextStr}`);
    }

    // Intentional fallback: Unrecognized gender strings default to 'other'
    // rather than being rejected. This allows frontend to gracefully handle
    // new gender values introduced by the backend without breaking.
    // If stricter validation is needed, use a schema validator at the service boundary.
    return Gender.other;
  }

  return undefined;
};

const normalizeBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      return undefined;
    }
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return undefined;
    }

    if (['true', '1', 'yes', 'y'].includes(normalized)) {
      return true;
    }

    if (['false', '0', 'no', 'n'].includes(normalized)) {
      return false;
    }
  }

  return undefined;
};

const normalizeAddress = (value: unknown): PersonAddressDTO | undefined => {
  if (typeof value === 'string') {
    const street1 = asString(value);
    return street1 ? { street1 } : undefined;
  }

  const record = toRecord(value);
  if (!record) {
    return undefined;
  }

  const street1 = asString(pick(record, ['street1', 'street_1', 'address', 'line1']));
  const street2 = asString(pick(record, ['street2', 'street_2', 'line2']));
  const city = asString(pick(record, ['city']));
  const state = asString(pick(record, ['state', 'region']));
  const zipCode = asString(pick(record, ['zipCode', 'zip_code', 'postalCode', 'postal_code']));
  const country = asString(pick(record, ['country']));

  const normalized: PersonAddressDTO = {};
  if (street1) normalized.street1 = street1;
  if (street2) normalized.street2 = street2;
  if (city) normalized.city = city;
  if (state) normalized.state = state;
  if (zipCode) normalized.zipCode = zipCode;
  if (country) normalized.country = country;

  return Object.keys(normalized).length > 0 ? normalized : undefined;
};

const coerceId = (value: unknown): string | number | undefined => {
  if (typeof value === 'string') {
    return value.trim().length > 0 ? value.trim() : undefined;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  return undefined;
};

/**
 * Normalises raw backend payloads into the canonical PersonDTO representation.
 */
export const normalizePersonDTO = (raw: unknown): PersonDTO => {
  const record = toRecord(raw);
  if (!record) {
    return {};
  }

  const normalized: PersonDTO = {};

  const idValue = coerceId(
    pick(record, ['id', 'personId', 'person_id', 'contactId', 'contact_id'])
  );
  if (idValue !== undefined) {
    normalized.id = idValue;
  }

  const tenantId = asString(pick(record, ['tenantId', 'tenant_id', 'tenant']));
  if (tenantId) {
    normalized.tenantId = tenantId;
  }

  const firstName = asString(pick(record, ['firstName', 'first_name', 'firstname']));
  if (firstName) {
    normalized.firstName = firstName;
  }

  const lastName = asString(pick(record, ['lastName', 'last_name', 'lastname']));
  if (lastName) {
    normalized.lastName = lastName;
  }

  const fullName = asString(pick(record, ['fullName', 'full_name', 'name']));
  const computedFullName =
    fullName ?? [normalized.firstName, normalized.lastName].filter(Boolean).join(' ').trim();
  if (computedFullName) {
    normalized.fullName = computedFullName;
  }

  const email = asString(pick(record, ['email']));
  if (email) {
    normalized.email = email;
  }

  const phone = asString(pick(record, ['phone', 'mobile', 'telephone']));
  if (phone) {
    normalized.phone = phone;
  }

  const rawGenderField = pick(record, ['gender', 'gender_value', 'genderValue']);
  const genderValue = normalizeGender(rawGenderField, {
    context: {
      id: idValue,
      source: 'person',
      rawField: rawGenderField,
    },
  });
  if (genderValue !== undefined) {
    normalized.gender = genderValue;
  }

  const age = asNumber(pick(record, ['age']));
  if (age !== undefined) {
    normalized.age = age;
  }

  const address = normalizeAddress(pick(record, ['address', 'addressInfo', 'address_dto']));
  if (address) {
    normalized.address = address;
  }

  const createdAt = asDate(pick(record, ['createdAt', 'created_at', 'created_on']));
  if (createdAt) {
    normalized.createdAt = createdAt;
  }

  const updatedAt = asDate(pick(record, ['updatedAt', 'updated_at', 'updated_on']));
  if (updatedAt) {
    normalized.updatedAt = updatedAt;
  }

  const createdBy = asString(pick(record, ['createdBy', 'created_by', 'createdUser']));
  if (createdBy) {
    normalized.createdBy = createdBy;
  }

  const updatedBy = asString(pick(record, ['updatedBy', 'updated_by', 'updatedUser']));
  if (updatedBy) {
    normalized.updatedBy = updatedBy;
  }

  const isActive = normalizeBoolean(pick(record, ['isActive', 'is_active', 'active']));
  if (isActive !== undefined) {
    normalized.isActive = isActive;
  }

  return normalized;
};
