import { z } from 'zod';
import { asContactId, asTenantId, asUserId } from '../types/ids';

const nonEmptyString = z.string().min(1, 'Value is required');

const parseDate = (value: string | Date): Date => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid date value');
  }
  return date;
};

const dateSchema = z
  .union([nonEmptyString, z.date()])
  .transform((value: string | Date): Date => parseDate(value));

const optionalDateSchema = z
  .union([nonEmptyString, z.date()])
  .optional()
  .transform((value: string | Date | undefined): Date | undefined =>
    value === undefined ? undefined : parseDate(value),
  );

const tenantBrandingSchema = z.object({
  primaryColor: z.string().min(1),
  secondaryColor: z.string().min(1),
  accentColor: z.string().min(1),
});

const tenantSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'natural']),
  language: z.string().min(1),
  timezone: z.string().min(1),
  dateFormat: z.string().min(1),
  features: z.array(z.string()).default([]),
  branding: tenantBrandingSchema,
});

const tenantLimitsSchema = z.object({
  users: z.number().nonnegative().default(0),
  contacts: z.number().nonnegative().default(0),
  storage: z.number().nonnegative().default(0),
});

const tenantSubscriptionSchema = z.object({
  plan: z.enum(['basic', 'professional', 'enterprise']),
  status: z.enum(['active', 'trial', 'expired', 'cancelled']),
  expiresAt: z
    .union([z.string(), z.date()])
    .optional()
  .transform((value: string | Date | undefined): Date | undefined => {
      if (value === undefined) {
        return undefined;
      }
      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) {
        throw new Error('Invalid date value');
      }
      return date;
    }),
  limits: tenantLimitsSchema,
});

export const authTenantSchema = z.object({
  id: z.string().min(1).transform((value: string) => asTenantId(value)),
  name: z.string().min(1),
  domain: z.string().optional(),
  logo: z.string().optional(),
  settings: tenantSettingsSchema,
  subscription: tenantSubscriptionSchema,
});

export const userSchema = z.object({
  id: z.string().min(1).transform((value: string) => asUserId(value)),
  email: z.string().email(),
  username: z.string().min(1),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  avatar: z.string().optional(),
  roles: z.array(z.string()).nonempty(),
  tenantId: z.string().min(1).transform((value: string) => asTenantId(value)),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

const addressSchema = z.object({
  id: z.string().optional(),
  street1: z.string().min(1),
  street2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  zipCode: z.string().min(1),
  country: z.string().min(1),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

const emergencyContactSchema = z.object({
  name: z.string().min(1),
  relationship: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().optional(),
});

export const contactSchema = z
  .object({
    id: z.string().min(1).transform((value: string) => asContactId(value)),
    tenantId: z.string().min(1).transform((value: string) => asTenantId(value)),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    fullName: z.string().min(1),
    preferredName: z.string().optional(),
    title: z.string().optional(),
    suffix: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    mobile: z.string().optional(),
    fax: z.string().optional(),
    website: z.string().optional(),
    address: addressSchema.optional(),
    shippingAddress: addressSchema.optional(),
    company: z.string().optional(),
    jobTitle: z.string().optional(),
    department: z.string().optional(),
    dateOfBirth: optionalDateSchema,
    gender: z.enum(['male', 'female']).optional(),
    age: z.number().optional(),
    allergies: z.array(z.string()).optional(),
    medications: z.array(z.string()).optional(),
    medicalNotes: z.string().optional(),
    emergencyContact: emergencyContactSchema.optional(),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
    customFields: z.record(z.string(), z.unknown()).optional(),
    createdAt: dateSchema,
    updatedAt: dateSchema,
    createdBy: z.string().min(1).transform((value: string) => asUserId(value)),
    updatedBy: z.string().min(1).transform((value: string) => asUserId(value)),
    isActive: z.boolean(),
  })
  .passthrough();

export const contactListResponseSchema = z.object({
  contacts: z.array(contactSchema),
  total: z.number().nonnegative(),
  page: z.number().nonnegative(),
  limit: z.number().positive(),
  totalPages: z.number().nonnegative(),
  hasNext: z.boolean(),
  hasPrev: z.boolean(),
});

export const tenantSchema = z.object({
  id: z.string().min(1).transform(asTenantId),
  name: z.string().min(1),
  db_url: z.string().min(1),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export const paginatedTenantResponseSchema = z.object({
  data: z.array(tenantSchema),
  total: z.number().nonnegative(),
  offset: z.number().nonnegative().optional(),
  limit: z.number().positive().optional(),
});

export const apiErrorSchema = z.object({
  type: z.enum(['validation', 'network', 'auth', 'business']),
  message: z.string(),
  code: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
  cause: z.unknown().optional(),
  retryable: z.boolean().optional(),
  statusCode: z.number().optional(),
});

// Schema for the auth response returned by auth endpoints
export const authResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  token_type: z.string().min(1),
});

export const loginRequestSchema = z.object({
  usernameOrEmail: z.string().min(1),
  password: z.string().min(1),
  tenantId: z.string().min(1),
  rememberMe: z.boolean().optional(),
});

export const createTenantSchema = z.object({
  name: z.string().min(1),
  db_url: z.string().url(),
});

export const updateTenantSchema = createTenantSchema.partial();

export const contactMutationSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  gender: z.boolean(),
  age: z.number().int().nonnegative(),
  address: z.string().min(1),
  phone: z.string().min(1),
});

export type UserSchema = z.infer<typeof userSchema>;
export type AuthTenantSchema = z.infer<typeof authTenantSchema>;
export type TenantSchema = z.infer<typeof tenantSchema>;
export type ContactSchema = z.infer<typeof contactSchema>;
export type AuthResponseSchema = z.infer<typeof authResponseSchema>;
export type ContactListResponseSchema = z.infer<typeof contactListResponseSchema>;
export type PaginatedTenantResponseSchema = z.infer<typeof paginatedTenantResponseSchema>;
export type ApiErrorSchema = z.infer<typeof apiErrorSchema>;
export type LoginRequestSchema = z.infer<typeof loginRequestSchema>;
