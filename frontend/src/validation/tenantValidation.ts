/**
 * Comprehensive Tenant Validation
 * Provides robust validation for tenant operations
 */

import { z, type ZodIssue } from 'zod';
import type { Tenant } from '@/types/tenant';

/**
 * Tenant validation schemas
 */
export const tenantValidationSchemas = {
  // Basic tenant creation schema
  create: z.object({
    name: z
      .string()
      .min(3, 'Tenant name must be at least 3 characters')
      .max(50, 'Tenant name must be less than 50 characters')
      .regex(
        /^[a-zA-Z0-9\s\-_]+$/,
        'Name can only contain letters, numbers, spaces, hyphens, and underscores'
      )
      .refine(name => name.trim().length > 0, 'Tenant name cannot be empty'),

    db_url: z
      .string()
      .min(1, 'Database URL is required')
      .url('Database URL must be a valid URL')
      .refine(url => {
        try {
          const urlObj = new URL(url);
          return ['postgresql:', 'mysql:', 'sqlite:'].includes(urlObj.protocol);
        } catch {
          return false;
        }
      }, 'Database URL must use postgresql, mysql, or sqlite protocol'),

    description: z.string().max(500, 'Description must be less than 500 characters').optional(),

    settings: z
      .object({
        theme: z.enum(['light', 'dark', 'natural']).optional(),
        timezone: z.string().optional(),
        features: z.array(z.string()).optional(),
      })
      .optional(),
  }),

  // Tenant update schema (all fields optional)
  update: z.object({
    name: z
      .string()
      .min(3, 'Tenant name must be at least 3 characters')
      .max(50, 'Tenant name must be less than 50 characters')
      .regex(
        /^[a-zA-Z0-9\s\-_]+$/,
        'Name can only contain letters, numbers, spaces, hyphens, and underscores'
      )
      .optional(),

    db_url: z
      .string()
      .url('Database URL must be a valid URL')
      .refine(url => {
        try {
          const urlObj = new URL(url);
          return ['postgresql:', 'mysql:', 'sqlite:'].includes(urlObj.protocol);
        } catch {
          return false;
        }
      }, 'Database URL must use postgresql, mysql, or sqlite protocol')
      .optional(),

    description: z.string().max(500, 'Description must be less than 500 characters').optional(),

    settings: z
      .object({
        theme: z.enum(['light', 'dark', 'natural']).optional(),
        timezone: z.string().optional(),
        features: z.array(z.string()).optional(),
      })
      .optional(),
  }),

  // Tenant settings schema
  settings: z.object({
    theme: z.enum(['light', 'dark', 'natural']),
    timezone: z.string().min(1, 'Timezone is required'),
    features: z.array(z.string()),
    limits: z.object({
      max_users: z.number().min(1, 'Max users must be at least 1'),
      max_contacts: z.number().min(1, 'Max contacts must be at least 1'),
      max_storage: z.number().min(1, 'Max storage must be at least 1'),
    }),
  }),

  // Tenant limits schema
  limits: z.object({
    max_users: z
      .number()
      .min(1, 'Max users must be at least 1')
      .max(10000, 'Max users cannot exceed 10000'),
    max_contacts: z
      .number()
      .min(1, 'Max contacts must be at least 1')
      .max(1000000, 'Max contacts cannot exceed 1000000'),
    max_storage: z
      .number()
      .min(1, 'Max storage must be at least 1')
      .max(1000000, 'Max storage cannot exceed 1000000'),
    max_api_calls: z
      .number()
      .min(1, 'Max API calls must be at least 1')
      .max(10000000, 'Max API calls cannot exceed 10000000'),
  }),
};

/**
 * Validation result interface
 */
export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
  warnings: string[];
}

const issuesToErrors = (issues: ZodIssue[]): Record<string, string> => {
  return issues.reduce<Record<string, string>>((acc, issue) => {
    const path = issue.path.map(part => String(part)).join('.');
    acc[path] = issue.message;
    return acc;
  }, {});
};

const invalidResultFromIssues = (issues: ZodIssue[]): ValidationResult => ({
  isValid: false,
  errors: issuesToErrors(issues),
  warnings: [],
});

/**
 * Tenant validation functions
 */
/**
 * Validate tenant creation data
 */
export function validateCreate(data: unknown): ValidationResult {
  const result = tenantValidationSchemas.create.safeParse(data);

  if (result.success) {
    return { isValid: true, errors: {}, warnings: [] };
  }

  return invalidResultFromIssues(result.error.issues);
}

/**
 * Validate tenant update data
 */
export function validateUpdate(data: unknown): ValidationResult {
  const result = tenantValidationSchemas.update.safeParse(data);

  if (result.success) {
    return { isValid: true, errors: {}, warnings: [] };
  }

  return invalidResultFromIssues(result.error.issues);
}

/**
 * Validate tenant settings
 */
export function validateSettings(data: unknown): ValidationResult {
  const result = tenantValidationSchemas.settings.safeParse(data);

  if (result.success) {
    return { isValid: true, errors: {}, warnings: [] };
  }

  return invalidResultFromIssues(result.error.issues);
}

/**
 * Validate tenant limits
 */
export function validateLimits(data: unknown): ValidationResult {
  const result = tenantValidationSchemas.limits.safeParse(data);

  if (result.success) {
    return { isValid: true, errors: {}, warnings: [] };
  }

  return invalidResultFromIssues(result.error.issues);
}

/**
 * Validate database URL with additional checks
 */
export function validateDatabaseUrl(url: string): ValidationResult {
  const errors: Record<string, string> = {};
  const warnings: string[] = [];

  // Basic URL validation
  try {
    const urlObj = new URL(url);

    // Check protocol
    if (!['postgresql:', 'mysql:', 'sqlite:'].includes(urlObj.protocol)) {
      errors.db_url = 'Database URL must use postgresql, mysql, or sqlite protocol';
    }

    // Check for localhost in production
    if (urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1') {
      warnings.push('Using localhost database URL may not be accessible in production');
    }

    // Check for default ports
    if (urlObj.port === '5432' && urlObj.protocol === 'postgresql:') {
      warnings.push('Using default PostgreSQL port (5432)');
    }
    if (urlObj.port === '3306' && urlObj.protocol === 'mysql:') {
      warnings.push('Using default MySQL port (3306)');
    }

    // Check for credentials in URL
    if (urlObj.username && urlObj.password) {
      warnings.push('Database credentials are included in the URL - ensure secure storage');
    }
  } catch {
    errors.db_url = 'Database URL must be a valid URL';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate tenant name uniqueness (requires async check)
 */
export function validateNameUniqueness(
  name: string,
  existingTenants: Tenant[],
  excludeId?: string
): ValidationResult {
  const errors: Record<string, string> = {};
  const warnings: string[] = [];

  const normalizedName = name.toLowerCase().trim();
  const existing = existingTenants.find(
    tenant => tenant.name.toLowerCase().trim() === normalizedName && tenant.id !== excludeId
  );

  if (existing) {
    errors.name = 'Tenant name already exists';
  }

  // Check for similar names
  const similarNames = existingTenants.filter(
    tenant => tenant.name.toLowerCase().includes(normalizedName) && tenant.id !== excludeId
  );

  if (similarNames.length > 0) {
    warnings.push(`Similar tenant names exist: ${similarNames.map(t => t.name).join(', ')}`);
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    warnings,
  };
}

/**
 * Comprehensive tenant validation with all checks
 */
export function validateTenantComprehensive(
  data: unknown,
  existingTenants: Tenant[],
  mode: 'create' | 'update' = 'create',
  excludeId?: string
): ValidationResult {
  const schema =
    mode === 'create' ? tenantValidationSchemas.create : tenantValidationSchemas.update;
  const parseResult = schema.safeParse(data);

  if (!parseResult.success) {
    return invalidResultFromIssues(parseResult.error.issues);
  }

  const validatedData = parseResult.data;
  const errors: Record<string, string> = {};
  const warnings: string[] = [];

  // Database URL validation
  if ('db_url' in validatedData && typeof validatedData.db_url === 'string') {
    const dbValidation = validateDatabaseUrl(validatedData.db_url);
    Object.assign(errors, dbValidation.errors);
    warnings.push(...dbValidation.warnings);
  }

  // Name uniqueness validation
  if ('name' in validatedData && typeof validatedData.name === 'string') {
    const nameValidation = validateNameUniqueness(validatedData.name, existingTenants, excludeId);
    Object.assign(errors, nameValidation.errors);
    warnings.push(...nameValidation.warnings);
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    warnings,
  };
}

/**
 * Validation error formatter
 */
/**
 * Format validation errors for display
 */
export function formatErrors(errors: Record<string, string>): string[] {
  return Object.entries(errors).map(([field, message]) => {
    const formattedField = field
      .split('.')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
    return `${formattedField}: ${message}`;
  });
}

/**
 * Format warnings for display
 */
export function formatWarnings(warnings: string[]): string[] {
  return warnings.map(warning => `⚠️ ${warning}`);
}

/**
 * Get field-specific error message
 */
export function getFieldError(errors: Record<string, string>, field: string): string | undefined {
  return errors[field] || errors[`${field}.0`] || errors[`${field}.1`];
}
