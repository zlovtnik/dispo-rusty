import { z } from 'zod';
import { asContactId, asTenantId, asUserId } from '../types/ids';

const nonEmptyString = z.string().min(1, 'Value is required');

const dateSchema = z
  .union([nonEmptyString, z.date()])
  .transform((value: string | Date): Date => {
    // If string, parse it and handle invalid dates
    if (typeof value === 'string') {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        // Return Invalid Date to fail refine check
        return new Date(NaN);
      }
      return date;
    }
    return value;
  })
  .refine(date => !Number.isNaN(date.getTime()), 'Invalid date format');

const optionalDateSchema = z
  .union([nonEmptyString, z.date()])
  .optional()
  .transform((value: string | Date | undefined): Date | undefined => {
    if (value === undefined) return undefined;
    if (typeof value === 'string') {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return new Date(NaN);
      }
      return date;
    }
    return value;
  })
  .refine(date => date === undefined || !Number.isNaN(date.getTime()), 'Invalid date format');

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
  id: z
    .string()
    .min(1)
    .transform((value: string) => asTenantId(value)),
  name: z.string().min(1),
  domain: z.string().optional(),
  logo: z.string().optional(),
  settings: tenantSettingsSchema,
  subscription: tenantSubscriptionSchema,
});

export const userSchema = z.object({
  id: z
    .string()
    .min(1)
    .transform((value: string) => asUserId(value)),
  email: z.email(),
  username: z.string().min(1),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  avatar: z.string().optional(),
  roles: z.array(z.string()).nonempty(),
  tenantId: z
    .string()
    .min(1)
    .transform((value: string) => asTenantId(value)),
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
  email: z.email().optional(),
});

export const contactSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .transform((value: string) => asContactId(value)),
    tenantId: z
      .string()
      .min(1)
      .transform((value: string) => asTenantId(value)),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    fullName: z.string().min(1),
    preferredName: z.string().optional(),
    title: z.string().optional(),
    suffix: z.string().optional(),
    email: z.email().optional(),
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
    gender: z.enum(['male', 'female', 'other']).optional(),
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
    createdBy: z
      .string()
      .min(1)
      .transform((value: string) => asUserId(value)),
    updatedBy: z
      .string()
      .min(1)
      .transform((value: string) => asUserId(value)),
    isActive: z.boolean(),
  })
  .loose();

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
  db_url: z.url(),
});

export const updateTenantSchema = createTenantSchema.partial();

export const contactMutationSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  gender: z.boolean(),
  age: z.number().int().nonnegative(),
  address: z.string().min(1),
  phone: z.string().min(1),
});

// Form validation schemas using Zod for React Hook Form
export const loginSchema = z.object({
  usernameOrEmail: z
    .string()
    .min(3, 'Username or email is required (minimum 3 characters)')
    .max(254, 'Must be less than 254 characters'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(128, 'Password must be less than 128 characters'),
  tenantId: z.string().min(1, 'Tenant ID is required'),
  rememberMe: z.boolean().optional(),
});

export const contactFormSchema = z
  .object({
    firstName: z
      .string()
      .min(1, 'First name is required')
      .max(50, 'First name must be less than 50 characters'),
    lastName: z
      .string()
      .min(1, 'Last name is required')
      .max(50, 'Last name must be less than 50 characters'),
    email: z.email('Please enter a valid email address').optional().or(z.literal('')),
    phone: z
      .string()
      .regex(/^\+?[1-9]\d{6,14}$/, 'Please enter a valid phone number')
      .optional()
      .or(z.literal('')),
    gender: z.enum(['male', 'female', 'other']),
    age: z.number().min(1, 'Age must be at least 1').max(120, 'Age must be at most 120'),
    street1: z.string().min(1, 'Street address is required'),
    street2: z.string().optional().or(z.literal('')),
    city: z.string().min(1, 'City is required'),
    state: z.string().min(1, 'State is required'),
    zipCode: z.string().min(1, 'ZIP code is required'),
    country: z.string().min(1, 'Country is required'),
  })
  .superRefine((data, ctx) => {
    // Cross-field validation: email or phone must be provided
    if (!data.email && !data.phone) {
      ctx.addIssue({
        code: 'custom',
        message: 'Either email or phone number is required',
        path: ['email'],
      });
      ctx.addIssue({
        code: 'custom',
        message: 'Either email or phone number is required',
        path: ['phone'],
      });
    }
  });

export const tenantFormSchema = z.object({
  name: z
    .string()
    .min(3, 'Tenant name must be at least 3 characters')
    .max(100, 'Tenant name must be less than 100 characters')
    .regex(/^[a-zA-Z0-9\s\-_'.,()]+$/, 'Tenant name contains invalid characters'),
  db_url: z
    .string()
    .min(1, 'Database URL is required')
    .refine(value => {
      // Try parsing as a PostgreSQL URL first
      try {
        const url = new URL(value);
        if (url.protocol === 'postgres:' || url.protocol === 'postgresql:') {
          return true;
        }
        // Reject valid URLs with wrong protocol
        return false;
      } catch {
        // Not a valid URL, try parsing as libpq connection string
      }

      // Parse as libpq-style connection string (key=value pairs with optional quoting)
      // Regex pattern matches: key=(value | 'value' | "value") with optional whitespace
      // Groups: 1=key, 2=full value with quotes, 3=captured value (unquoted)
      const input = value.trim();
      
      // Match key=value pairs where value can be:
      // - Single-quoted: 'value with spaces'
      // - Double-quoted: "value with spaces"
      // - Unquoted: no_spaces
      const pairRegex = /([A-Za-z_][A-Za-z0-9_]*)=(?:'([^']*)'|"([^"]*)"|([^\s]+))/g;
      
      const matches = [];
      let match;
      while ((match = pairRegex.exec(input)) !== null) {
        matches.push(match);
      }
      
      // Must have at least one match
      if (matches.length === 0) {
        return false;
      }
      
      // Verify the entire input was consumed by concatenating all matched segments
      // and comparing to input (normalized to single spaces between pairs)
      const reconstructed = matches
        .map(m => m[0]) // Get full matched string for each pair
        .join(' ')
        .replace(/\s+/g, ' '); // Normalize multiple spaces to single space
      
      const normalized = input.replace(/\s+/g, ' '); // Normalize input for comparison
      
      // Accept if we consumed the entire input (all key=value pairs matched)
      return reconstructed === normalized;
    }, 'Please enter a valid PostgreSQL URL (postgres://...) or connection string (key=value pairs)'),
});

export const searchFormSchema = z.object({
  // Note: Search terms allow most printable characters for flexibility.
  // Security should be handled via server-side parameterized queries
  // or proper input escaping to prevent injection attacks.
  searchTerm: z
    .string()
    .min(1, 'Search term is required')
    .max(255, 'Search term must be less than 255 characters'),
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

// Form schema TypeScript inference types
export type LoginSchema = z.infer<typeof loginSchema>;
export type ContactFormSchema = z.infer<typeof contactFormSchema>;
export type TenantFormSchema = z.infer<typeof tenantFormSchema>;
export type SearchFormSchema = z.infer<typeof searchFormSchema>;
