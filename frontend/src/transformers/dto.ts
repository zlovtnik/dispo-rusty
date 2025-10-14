import { err, ok } from 'neverthrow';
import type { Result, Option } from '../types/fp';
import { fromNullable, isSome, none, some } from '../types/fp';
import type { AppError } from '../types/errors';
import { createValidationError } from '../types/errors';
import type { Contact, Address, ContactListResponse } from '../types/contact';
import type { User, Tenant as AuthTenant } from '../types/auth';
import type { Tenant as TenantRecord } from '../types/tenant';
import { asContactId, asTenantId, asUserId } from '../types/ids';
import { booleanToGender, genderToBoolean, parseOptionalGender } from './gender';
import { parseDate, parseOptionalDate, toIsoString } from './date';

interface TransformerContext {
  readonly entity: string;
  readonly direction: 'toApi' | 'fromApi';
}

const createTransformerError = (
  context: TransformerContext,
  message: string,
  details?: Record<string, unknown>,
  cause?: unknown,
): AppError =>
  createValidationError(message, { ...details, entity: context.entity, direction: context.direction }, {
    code: 'TRANSFORMATION_ERROR',
    cause,
  });

const wrapTransformation = <Value, Output>(
  transform: (value: Value) => Result<Output, AppError>,
  context: TransformerContext,
): ((value: Value) => Result<Output, AppError>) =>
  (value: Value) => {
    try {
      return transform(value);
    } catch (error) {
      return err(createTransformerError(context, 'Unexpected transformation failure', { value }, error));
    }
  };

export const toApiDTO = <Domain, DTO>(
  transform: (value: Domain) => Result<DTO, AppError>,
  entity: string,
): ((value: Domain) => Result<DTO, AppError>) => wrapTransformation(transform, { entity, direction: 'toApi' });

export const fromApiDTO = <DTO, Domain>(
  transform: (value: DTO) => Result<Domain, AppError>,
  entity: string,
): ((value: DTO) => Result<Domain, AppError>) => wrapTransformation(transform, { entity, direction: 'fromApi' });

const pickString = (source: Record<string, unknown>, keys: string[]): Option<string> => {
  for (const key of keys) {
    if (!(key in source)) continue;
    const value = source[key];

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return some(trimmed);
      }
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return some(String(value));
    }
  }

  return none();
};

const pickNumber = (source: Record<string, unknown>, keys: string[]): Option<number> => {
  for (const key of keys) {
    if (!(key in source)) continue;
    const value = source[key];

    if (typeof value === 'number' && Number.isFinite(value)) {
      return some(value);
    }

    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) {
        return some(parsed);
      }
    }
  }

  return none();
};

const pickBoolean = (source: Record<string, unknown>, keys: string[]): Option<boolean> => {
  for (const key of keys) {
    if (!(key in source)) continue;
    const value = source[key];

    if (typeof value === 'boolean') {
      return some(value);
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1') {
        return some(true);
      }
      if (normalized === 'false' || normalized === '0') {
        return some(false);
      }
    }
  }

  return none();
};

const optionValue = <T>(option: Option<T>): T | undefined => (isSome(option) ? option.value : undefined);

const optionOrDefault = <T>(option: Option<T>, defaultValue: T): T => (isSome(option) ? option.value : defaultValue);

const buildAddress = (source: Record<string, unknown>): Option<Address> => {
  const addressValue = source.address ?? source.mailing_address ?? source.shipping_address;

  if (addressValue && typeof addressValue === 'object') {
    const addressRecord = addressValue as Record<string, unknown>;
    const street1 = pickString(addressRecord, ['street1', 'street', 'line1']);
    const street2 = pickString(addressRecord, ['street2', 'line2']);
    const city = pickString(addressRecord, ['city']);
    const state = pickString(addressRecord, ['state', 'region']);
    const zipCode = pickString(addressRecord, ['zipCode', 'postal_code', 'zip']);
    const country = pickString(addressRecord, ['country']);

    const latitude = pickNumber(addressRecord, ['latitude', 'lat']);
    const longitude = pickNumber(addressRecord, ['longitude', 'lng', 'lon']);

    if (!isSome(street1) && !isSome(city) && !isSome(state)) {
      return none();
    }

    return some({
      street1: isSome(street1) ? street1.value : '',
      street2: isSome(street2) ? street2.value : undefined,
      city: isSome(city) ? city.value : '',
      state: isSome(state) ? state.value : '',
      zipCode: isSome(zipCode) ? zipCode.value : '',
      country: isSome(country) ? country.value : 'USA',
      latitude: isSome(latitude) ? latitude.value : undefined,
      longitude: isSome(longitude) ? longitude.value : undefined,
    });
  }

  if (typeof addressValue === 'string') {
    const segments = addressValue.split(',').map(part => part.trim()).filter(Boolean);
    if (segments.length === 0) {
      return none();
    }

    const [street1Segment, street2Segment, citySegment, stateSegment, zipSegment, countrySegment] = segments;

    return some({
      street1: street1Segment ?? '',
      street2: street2Segment,
      city: citySegment ?? '',
      state: stateSegment ?? '',
      zipCode: zipSegment ?? '',
      country: countrySegment ?? 'USA',
    });
  }

  return none();
};

const formatAddress = (address: Address | undefined): string | null => {
  if (!address) {
    return null;
  }

  const segments = [
    address.street1,
    address.street2,
    address.city,
    address.state,
    address.zipCode,
    address.country,
  ].filter(segment => typeof segment === 'string' && segment.trim().length > 0) as string[];

  if (segments.length === 0) {
    return null;
  }

  return segments.join(', ');
};

export interface ContactApiDTO {
  readonly id: string | number;
  readonly tenant_id: string | number;
  readonly first_name?: string | null;
  readonly last_name?: string | null;
  readonly full_name?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly mobile?: string | null;
  readonly gender?: boolean | string | null;
  readonly age?: number | null;
  readonly address?: string | Record<string, unknown> | null;
  readonly date_of_birth?: string | Date | null;
  readonly created_at?: string | Date | null;
  readonly updated_at?: string | Date | null;
  readonly created_by?: string | null;
  readonly updated_by?: string | null;
  readonly is_active?: boolean | null;
}

const contactFromApi = (input: unknown): Result<Contact, AppError> => {
  if (!input || typeof input !== 'object') {
    return err(createTransformerError({ entity: 'Contact', direction: 'fromApi' }, 'Contact payload must be an object', { inputType: typeof input }));
  }

  const source = input as Record<string, unknown>;

  const idValue = pickString(source, ['id', 'contact_id']);
  if (!isSome(idValue)) {
    return err(createTransformerError({ entity: 'Contact', direction: 'fromApi' }, 'Contact identifier is missing', { source }));
  }

  const tenantIdValue = pickString(source, ['tenant_id', 'tenantId']);
  if (!isSome(tenantIdValue)) {
    return err(createTransformerError({ entity: 'Contact', direction: 'fromApi' }, 'Contact tenant identifier is missing', { source }));
  }

  const firstNameOption = pickString(source, ['first_name', 'firstName']);
  const lastNameOption = pickString(source, ['last_name', 'lastName']);
  const fullNameOption = pickString(source, ['full_name', 'fullName', 'name']);

  const computedFullName = isSome(fullNameOption)
    ? fullNameOption.value
    : [
        isSome(firstNameOption) ? firstNameOption.value : undefined,
        isSome(lastNameOption) ? lastNameOption.value : undefined,
      ]
        .filter(Boolean)
        .join(' ')
        .trim();

  if (!computedFullName) {
    return err(createTransformerError({ entity: 'Contact', direction: 'fromApi' }, 'Contact name is required', { source }));
  }

  const resolvedFirstName = isSome(firstNameOption)
    ? firstNameOption.value
    : computedFullName.split(/\s+/)[0] ?? computedFullName;

  const resolvedLastName = isSome(lastNameOption)
    ? lastNameOption.value
    : computedFullName.split(/\s+/).slice(1).join(' ');

  const genderValue = source.gender ?? source.gender_value ?? source.genderBoolean ?? source.gender_bool;
  const genderResult: Result<Option<Contact['gender']>, AppError> =
    typeof genderValue === 'boolean'
      ? booleanToGender(genderValue).map(value => some(value))
      : parseOptionalGender(genderValue);

  if (genderResult.isErr()) {
    return err(createTransformerError({ entity: 'Contact', direction: 'fromApi' }, 'Invalid gender value received', { value: genderValue }, genderResult.error));
  }

  const dateOfBirthValue = source.date_of_birth ?? source.dateOfBirth ?? source.dob;
  const dateOfBirthResult = parseOptionalDate(dateOfBirthValue, { context: 'contact.dateOfBirth' });
  if (dateOfBirthResult.isErr()) {
    return err(dateOfBirthResult.error);
  }

  const createdAtValue = source.created_at ?? source.createdAt ?? new Date().toISOString();
  const createdAtResult = parseDate(createdAtValue, { context: 'contact.createdAt' });
  if (createdAtResult.isErr()) {
    return err(createdAtResult.error);
  }

  const updatedAtValue = source.updated_at ?? source.updatedAt ?? createdAtValue;
  const updatedAtResult = parseDate(updatedAtValue, { context: 'contact.updatedAt' });
  if (updatedAtResult.isErr()) {
    return err(updatedAtResult.error);
  }

  const createdByOption = pickString(source, ['created_by', 'createdBy']);
  const updatedByOption = pickString(source, ['updated_by', 'updatedBy']);
  const ageOption = pickNumber(source, ['age']);
  const addressOption = buildAddress(source);
  const emailOption = pickString(source, ['email']);
  const phoneOption = pickString(source, ['phone']);
  const mobileOption = pickString(source, ['mobile', 'mobile_phone']);
  const faxOption = pickString(source, ['fax']);
  const websiteOption = pickString(source, ['website']);
  const companyOption = pickString(source, ['company']);
  const jobTitleOption = pickString(source, ['job_title', 'jobTitle']);
  const departmentOption = pickString(source, ['department']);
  const notesOption = pickString(source, ['notes']);
  const isActiveOption = pickBoolean(source, ['is_active', 'isActive']);

  const createdById = isSome(createdByOption) ? asUserId(createdByOption.value) : asUserId('system');
  const updatedById = isSome(updatedByOption) ? asUserId(updatedByOption.value) : createdById;

  const contact: Contact = {
    id: asContactId(idValue.value),
    tenantId: asTenantId(tenantIdValue.value),
    firstName: resolvedFirstName,
    lastName: resolvedLastName,
    fullName: computedFullName,
    preferredName: undefined,
    title: undefined,
    suffix: undefined,
    email: optionValue(emailOption),
    phone: optionValue(phoneOption),
    mobile: optionValue(mobileOption),
    fax: optionValue(faxOption),
    website: optionValue(websiteOption),
    address: optionValue(addressOption),
    shippingAddress: undefined,
    company: optionValue(companyOption),
    jobTitle: optionValue(jobTitleOption),
    department: optionValue(departmentOption),
    dateOfBirth: dateOfBirthResult.value.kind === 'some' ? dateOfBirthResult.value.value : undefined,
    gender: genderResult.value.kind === 'some' ? genderResult.value.value : undefined,
    age: optionValue(ageOption),
    allergies: undefined,
    medications: undefined,
    medicalNotes: undefined,
    emergencyContact: undefined,
    notes: optionValue(notesOption),
    tags: undefined,
    customFields: undefined,
    createdAt: createdAtResult.value,
    updatedAt: updatedAtResult.value,
    createdBy: createdById,
    updatedBy: updatedById,
    isActive: optionOrDefault(isActiveOption, true),
  };

  return ok(contact);
};

const contactToApi = (contact: Contact): Result<ContactApiDTO, AppError> => {
  const name = contact.fullName?.trim() || `${contact.firstName} ${contact.lastName}`.trim();

  if (!name) {
    return err(createTransformerError({ entity: 'Contact', direction: 'toApi' }, 'Contact name is required', { contact }));
  }

  const genderOption = fromNullable(contact.gender);
  const genderBooleanResult: Result<Option<boolean>, AppError> = isSome(genderOption)
    ? genderToBoolean(genderOption.value).map(value => some(value))
    : ok(none());

  if (genderBooleanResult.isErr()) {
    return err(createTransformerError({ entity: 'Contact', direction: 'toApi' }, 'Invalid gender provided for contact', { gender: contact.gender }, genderBooleanResult.error));
  }

  const dateOfBirthOption = fromNullable(contact.dateOfBirth);
  const dateOfBirthResult: Result<Option<string>, AppError> = isSome(dateOfBirthOption)
    ? toIsoString(dateOfBirthOption.value, { context: 'contact.dateOfBirth' }).map(value => some(value))
    : ok(none());

  if (dateOfBirthResult.isErr()) {
    return err(dateOfBirthResult.error);
  }

  const createdAtResult = toIsoString(contact.createdAt, { context: 'contact.createdAt' });
  if (createdAtResult.isErr()) {
    return err(createdAtResult.error);
  }

  const updatedAtResult = toIsoString(contact.updatedAt ?? contact.createdAt, { context: 'contact.updatedAt' });
  if (updatedAtResult.isErr()) {
    return err(updatedAtResult.error);
  }

  const dto: ContactApiDTO = {
    id: String(contact.id),
    tenant_id: String(contact.tenantId),
    first_name: contact.firstName,
    last_name: contact.lastName,
    full_name: name,
    email: contact.email ?? null,
    phone: contact.phone ?? null,
    mobile: contact.mobile ?? null,
    gender: genderBooleanResult.value.kind === 'some' ? genderBooleanResult.value.value : null,
    age: contact.age ?? null,
    address: formatAddress(contact.address),
    date_of_birth: dateOfBirthResult.value.kind === 'some' ? dateOfBirthResult.value.value : null,
    created_at: createdAtResult.value,
    updated_at: updatedAtResult.value,
    created_by: contact.createdBy ? String(contact.createdBy) : null,
    updated_by: contact.updatedBy ? String(contact.updatedBy) : null,
    is_active: contact.isActive ?? true,
  };

  return ok(dto);
};

export interface ContactListApiDTO {
  readonly contacts?: unknown;
  readonly data?: unknown;
  readonly total?: unknown;
  readonly count?: unknown;
  readonly page?: unknown;
  readonly current_page?: unknown;
  readonly limit?: unknown;
  readonly page_size?: unknown;
  readonly per_page?: unknown;
  readonly totalPages?: unknown;
  readonly total_pages?: unknown;
  readonly hasNext?: unknown;
  readonly hasPrev?: unknown;
  readonly has_next?: unknown;
  readonly has_prev?: unknown;
}

export const contactListFromApiResponse = (input: unknown): Result<ContactListResponse, AppError> => {
  if (!input || typeof input !== 'object') {
    return err(
      createTransformerError(
        { entity: 'ContactList', direction: 'fromApi' },
        'Contact list payload must be an object',
        { inputType: typeof input },
      ),
    );
  }

  const sourceRecord = input as Record<string, unknown>;
  const source = sourceRecord as ContactListApiDTO;
  const collection = Array.isArray(source.contacts)
    ? source.contacts
    : Array.isArray(source.data)
      ? source.data
      : null;

  if (!collection) {
    return err(
      createTransformerError(
        { entity: 'ContactList', direction: 'fromApi' },
        'Contact list payload is missing contacts collection',
        { keys: Object.keys(sourceRecord) },
      ),
    );
  }

  const contactsResult = collection.reduce<Result<Contact[], AppError>>(
    (accumulator, item, index) =>
      accumulator.andThen(contacts =>
        contactFromApi(item).map(contact => [...contacts, contact]).mapErr(error =>
          createTransformerError(
            { entity: 'ContactList', direction: 'fromApi' },
            'Failed to transform contact item',
            { index },
            error,
          ),
        ),
      ),
    ok<Contact[]>([]),
  );

  if (contactsResult.isErr()) {
    return err(contactsResult.error);
  }

  const totalOption = pickNumber(sourceRecord, ['total', 'count']);
  const pageOption = pickNumber(sourceRecord, ['page', 'current_page']);
  const limitOption = pickNumber(sourceRecord, ['limit', 'page_size', 'per_page']);
  const totalPagesOption = pickNumber(sourceRecord, ['totalPages', 'total_pages']);
  const hasNextOption = pickBoolean(sourceRecord, ['hasNext', 'has_next']);
  const hasPrevOption = pickBoolean(sourceRecord, ['hasPrev', 'has_prev']);

  const contacts = contactsResult.value;
  const limitDefault = contacts.length > 0 ? contacts.length : 10;
  const limit = optionOrDefault(limitOption, limitDefault);
  const total = optionOrDefault(totalOption, contacts.length);
  const page = optionOrDefault(pageOption, 1);
  const totalPages = optionOrDefault(totalPagesOption, limit > 0 ? Math.ceil(total / limit) : 1);
  const hasNext = optionOrDefault(hasNextOption, page < totalPages);
  const hasPrev = optionOrDefault(hasPrevOption, page > 1);

  return ok({
    contacts,
    total,
    page,
    limit,
    totalPages,
    hasNext,
    hasPrev,
  });
};

export interface UserApiDTO {
  readonly id: string;
  readonly email: string;
  readonly username: string;
  readonly first_name?: string | null;
  readonly last_name?: string | null;
  readonly avatar?: string | null;
  readonly roles: string[];
  readonly tenant_id: string;
  readonly created_at: string | Date;
  readonly updated_at: string | Date;
}

const userFromApi = (input: unknown): Result<User, AppError> => {
  if (!input || typeof input !== 'object') {
    return err(createTransformerError({ entity: 'User', direction: 'fromApi' }, 'User payload must be an object', { inputType: typeof input }));
  }

  const source = input as Record<string, unknown>;

  const idValue = pickString(source, ['id']);
  const tenantIdValue = pickString(source, ['tenant_id', 'tenantId']);
  const emailValue = pickString(source, ['email']);
  const usernameValue = pickString(source, ['username']);
  const rolesValue = source.roles;

  if (!isSome(idValue) || !isSome(tenantIdValue) || !isSome(emailValue) || !isSome(usernameValue)) {
    return err(createTransformerError({ entity: 'User', direction: 'fromApi' }, 'User payload is missing required fields', { source }));
  }

  if (!Array.isArray(rolesValue) || !rolesValue.every(role => typeof role === 'string')) {
    return err(createTransformerError({ entity: 'User', direction: 'fromApi' }, 'Invalid roles array in user payload', { roles: rolesValue }));
  }

  const createdAtOption = pickString(source, ['created_at', 'createdAt']);
  const updatedAtOption = pickString(source, ['updated_at', 'updatedAt']);
  const firstNameOption = pickString(source, ['first_name', 'firstName']);
  const lastNameOption = pickString(source, ['last_name', 'lastName']);
  const avatarOption = pickString(source, ['avatar']);

  const createdAt = optionOrDefault(createdAtOption, new Date().toISOString());
  const updatedAt = optionOrDefault(updatedAtOption, createdAt);

  const user: User = {
    id: asUserId(idValue.value),
    email: emailValue.value,
    username: usernameValue.value,
    firstName: optionValue(firstNameOption),
    lastName: optionValue(lastNameOption),
    avatar: optionValue(avatarOption),
    roles: rolesValue as string[],
    tenantId: asTenantId(tenantIdValue.value),
    createdAt,
    updatedAt,
  };

  return ok(user);
};

const userToApi = (user: User): Result<UserApiDTO, AppError> => {
  if (!user.id || !user.email || !user.username || !user.tenantId) {
    return err(createTransformerError({ entity: 'User', direction: 'toApi' }, 'User is missing required fields', { user }));
  }

  const dto: UserApiDTO = {
    id: String(user.id),
    email: user.email,
    username: user.username,
    first_name: user.firstName ?? null,
    last_name: user.lastName ?? null,
    avatar: user.avatar ?? null,
    roles: [...user.roles],
    tenant_id: String(user.tenantId),
    created_at: user.createdAt,
    updated_at: user.updatedAt,
  };

  return ok(dto);
};

export interface TenantApiDTO {
  readonly id: string;
  readonly name: string;
  readonly db_url?: string | null;
  readonly created_at?: string | Date | null;
  readonly updated_at?: string | Date | null;
}

const tenantFromApi = (input: unknown): Result<TenantRecord, AppError> => {
  if (!input || typeof input !== 'object') {
    return err(createTransformerError({ entity: 'Tenant', direction: 'fromApi' }, 'Tenant payload must be an object', { inputType: typeof input }));
  }

  const source = input as Record<string, unknown>;
  const idValue = pickString(source, ['id']);
  const nameValue = pickString(source, ['name']);

  if (!isSome(idValue) || !isSome(nameValue)) {
    return err(createTransformerError({ entity: 'Tenant', direction: 'fromApi' }, 'Tenant payload is missing required fields', { source }));
  }

  const dbUrlOption = pickString(source, ['db_url', 'dbUrl']);
  const createdAtOption = pickString(source, ['created_at', 'createdAt']);
  const updatedAtOption = pickString(source, ['updated_at', 'updatedAt']);

  const tenant: TenantRecord = {
    id: asTenantId(idValue.value),
    name: nameValue.value,
    db_url: optionOrDefault(dbUrlOption, ''),
    created_at: optionOrDefault(createdAtOption, new Date().toISOString()),
    updated_at: optionOrDefault(updatedAtOption, new Date().toISOString()),
  };

  return ok(tenant);
};

const tenantToApi = (tenant: TenantRecord): Result<TenantApiDTO, AppError> => {
  if (!tenant.id || !tenant.name) {
    return err(createTransformerError({ entity: 'Tenant', direction: 'toApi' }, 'Tenant is missing required fields', { tenant }));
  }

  const dto: TenantApiDTO = {
    id: String(tenant.id),
    name: tenant.name,
    db_url: tenant.db_url ?? null,
    created_at: tenant.created_at,
    updated_at: tenant.updated_at,
  };

  return ok(dto);
};

export interface TransformerPair<Domain, DTO> {
  readonly toApi: (value: Domain) => Result<DTO, AppError>;
  readonly fromApi: (value: unknown) => Result<Domain, AppError>;
}

export const mapContact: TransformerPair<Contact, ContactApiDTO> = {
  toApi: toApiDTO(contactToApi, 'Contact'),
  fromApi: fromApiDTO(contactFromApi, 'Contact'),
};

export const mapUser: TransformerPair<User, UserApiDTO> = {
  toApi: toApiDTO(userToApi, 'User'),
  fromApi: fromApiDTO(userFromApi, 'User'),
};

export const mapTenant: TransformerPair<TenantRecord, TenantApiDTO> = {
  toApi: toApiDTO(tenantToApi, 'Tenant'),
  fromApi: fromApiDTO(tenantFromApi, 'Tenant'),
};
