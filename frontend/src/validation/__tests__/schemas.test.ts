import { describe, it, expect } from 'bun:test';
import {
  authTenantSchema,
  userSchema,
  contactSchema,
  contactListResponseSchema,
  tenantSchema,
  paginatedTenantResponseSchema,
  apiErrorSchema,
  authResponseSchema,
  loginRequestSchema,
  createTenantSchema,
  updateTenantSchema,
  contactMutationSchema,
} from '../schemas';

describe('validation schemas', () => {
  describe('authTenantSchema', () => {
    it('should validate a valid auth tenant', () => {
      const validTenant = {
        id: 'tenant-1',
        name: 'Test Tenant',
        domain: 'test.com',
        logo: 'logo.png',
        settings: {
          theme: 'light' as const,
          language: 'en',
          timezone: 'UTC',
          dateFormat: 'YYYY-MM-DD',
          features: ['contacts'],
          branding: {
            primaryColor: '#1890ff',
            secondaryColor: '#52c41a',
            accentColor: '#faad14',
          },
        },
        subscription: {
          plan: 'professional' as const,
          status: 'active' as const,
          limits: {
            users: 25,
            contacts: 10000,
            storage: 10737418240,
          },
        },
      };

      const result = authTenantSchema.safeParse(validTenant);
      expect(result.success).toBe(true);
    });

    it('should reject invalid auth tenant', () => {
      const invalidTenant = {
        id: '',
        name: '',
        settings: {
          theme: 'invalid',
          language: '',
          timezone: '',
          dateFormat: '',
          features: [],
          branding: {
            primaryColor: '',
            secondaryColor: '',
            accentColor: '',
          },
        },
        subscription: {
          plan: 'invalid',
          status: 'invalid',
          limits: {
            users: -1,
            contacts: -1,
            storage: -1,
          },
        },
      };

      const result = authTenantSchema.safeParse(invalidTenant);
      expect(result.success).toBe(false);
    });
  });

  describe('userSchema', () => {
    it('should validate a valid user', () => {
      const validUser = {
        id: 'user-1',
        email: 'test@example.com',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
        avatar: 'avatar.png',
        roles: ['user'],
        tenantId: 'tenant-1',
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
      };

      const result = userSchema.safeParse(validUser);
      expect(result.success).toBe(true);
    });

    it('should reject invalid user', () => {
      const invalidUser = {
        id: '',
        email: 'invalid-email',
        username: '',
        roles: [],
        tenantId: '',
        createdAt: '',
        updatedAt: '',
      };

      const result = userSchema.safeParse(invalidUser);
      expect(result.success).toBe(false);
    });
  });

  describe('contactSchema', () => {
    it('should validate a valid contact', () => {
      const validContact = {
        id: 'contact-1',
        tenantId: 'tenant-1',
        firstName: 'John',
        lastName: 'Doe',
        fullName: 'John Doe',
        preferredName: 'Johnny',
        title: 'Mr',
        suffix: 'Jr',
        email: 'john@example.com',
        phone: '+1234567890',
        mobile: '+1234567891',
        fax: '+1234567892',
        website: 'https://example.com',
        address: {
          street1: '123 Main St',
          street2: 'Apt 4B',
          city: 'Anytown',
          state: 'CA',
          zipCode: '12345',
          country: 'USA',
          latitude: 37.7749,
          longitude: -122.4194,
        },
        shippingAddress: {
          street1: '456 Oak St',
          city: 'Anytown',
          state: 'CA',
          zipCode: '12345',
          country: 'USA',
        },
        company: 'Example Corp',
        jobTitle: 'Developer',
        department: 'Engineering',
        dateOfBirth: '1990-01-01',
        gender: 'male' as const,
        age: 33,
        allergies: ['peanuts'],
        medications: ['aspirin'],
        medicalNotes: 'Some notes',
        emergencyContact: {
          name: 'Jane Doe',
          relationship: 'wife',
          phone: '+1234567893',
          email: 'jane@example.com',
        },
        notes: 'Some notes',
        tags: ['vip', 'developer'],
        customFields: { custom1: 'value1' },
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
        createdBy: 'user-1',
        updatedBy: 'user-1',
        isActive: true,
      };

      const result = contactSchema.safeParse(validContact);
      expect(result.success).toBe(true);
    });

    it('should reject invalid contact', () => {
      const invalidContact = {
        id: '',
        tenantId: '',
        firstName: '',
        lastName: '',
        fullName: '',
        email: 'invalid-email',
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
        createdBy: '',
        updatedBy: '',
        isActive: true,
      };

      const result = contactSchema.safeParse(invalidContact);
      expect(result.success).toBe(false);
    });
  });

  describe('contactListResponseSchema', () => {
    it('should validate a valid contact list response', () => {
      const validResponse = {
        contacts: [
          {
            id: 'contact-1',
            tenantId: 'tenant-1',
            firstName: 'John',
            lastName: 'Doe',
            fullName: 'John Doe',
            email: 'john@example.com',
            roles: ['user'],
            createdAt: '2023-01-01T00:00:00Z',
            updatedAt: '2023-01-01T00:00:00Z',
            createdBy: 'user-1',
            updatedBy: 'user-1',
            isActive: true,
          },
        ],
        total: 1,
        page: 0,
        limit: 10,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      };

      const result = contactListResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    it('should reject invalid contact list response', () => {
      const invalidResponse = {
        contacts: [],
        total: -1,
        page: -1,
        limit: 0,
        totalPages: -1,
        hasNext: 'not-boolean',
        hasPrev: 'not-boolean',
      };

      const result = contactListResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });
  });

  describe('tenantSchema', () => {
    it('should validate a valid tenant', () => {
      const validTenant = {
        id: 'tenant-1',
        name: 'Test Tenant',
        db_url: 'postgresql://user:pass@localhost:5432/tenant1',
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
      };

      const result = tenantSchema.safeParse(validTenant);
      expect(result.success).toBe(true);
    });

    it('should reject invalid tenant', () => {
      const invalidTenant = {
        id: '',
        name: '',
        db_url: 'invalid-url',
        created_at: '',
        updated_at: '',
      };

      const result = tenantSchema.safeParse(invalidTenant);
      expect(result.success).toBe(false);
    });
  });

  describe('paginatedTenantResponseSchema', () => {
    it('should validate a valid paginated tenant response', () => {
      const validResponse = {
        data: [
          {
            id: 'tenant-1',
            name: 'Test Tenant',
            db_url: 'postgresql://user:pass@localhost:5432/tenant1',
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z',
          },
        ],
        total: 1,
        offset: 0,
        limit: 10,
      };

      const result = paginatedTenantResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    it('should reject invalid paginated tenant response', () => {
      const invalidResponse = {
        data: [],
        total: -1,
        offset: -1,
        limit: 0,
      };

      const result = paginatedTenantResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });
  });

  describe('apiErrorSchema', () => {
    it('should validate a valid API error', () => {
      const validError = {
        type: 'validation' as const,
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: { field: 'email', error: 'Invalid format' },
        cause: new Error('Test error'),
        retryable: false,
        statusCode: 400,
      };

      const result = apiErrorSchema.safeParse(validError);
      expect(result.success).toBe(true);
    });

    it('should reject invalid API error', () => {
      const invalidError = {
        type: 'invalid-type',
        message: '',
      };

      const result = apiErrorSchema.safeParse(invalidError);
      expect(result.success).toBe(false);
    });
  });

  describe('authResponseSchema', () => {
    it('should validate a valid auth response', () => {
      const validResponse = {
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refresh_token: 'refresh-token-123',
        token_type: 'Bearer',
      };

      const result = authResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    it('should reject invalid auth response', () => {
      const invalidResponse = {
        access_token: '',
        refresh_token: '',
        token_type: '',
      };

      const result = authResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });
  });

  describe('loginRequestSchema', () => {
    it('should validate a valid login request', () => {
      const validRequest = {
        usernameOrEmail: 'test@example.com',
        password: 'password123',
        tenantId: 'tenant-1',
        rememberMe: true,
      };

      const result = loginRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should reject invalid login request', () => {
      const invalidRequest = {
        usernameOrEmail: '',
        password: '',
        tenantId: '',
      };

      const result = loginRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });
  });

  describe('createTenantSchema', () => {
    it('should validate a valid create tenant request', () => {
      const validRequest = {
        name: 'New Tenant',
        db_url: 'postgresql://user:pass@localhost:5432/newtenant',
      };

      const result = createTenantSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should reject invalid create tenant request', () => {
      const invalidRequest = {
        name: '',
        db_url: 'invalid-url',
      };

      const result = createTenantSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });
  });

  describe('updateTenantSchema', () => {
    it('should validate a valid update tenant request', () => {
      const validRequest = {
        name: 'Updated Tenant',
        db_url: 'postgresql://user:pass@localhost:5432/updated',
      };

      const result = updateTenantSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should allow partial updates', () => {
      const partialRequest = {
        name: 'Updated Name',
      };

      const result = updateTenantSchema.safeParse(partialRequest);
      expect(result.success).toBe(true);
    });
  });

  describe('contactMutationSchema', () => {
    it('should validate a valid contact mutation', () => {
      const validMutation = {
        name: 'John Doe',
        email: 'john@example.com',
        gender: true,
        age: 30,
        address: '123 Main St',
        phone: '+1234567890',
      };

      const result = contactMutationSchema.safeParse(validMutation);
      expect(result.success).toBe(true);
    });

    it('should reject invalid contact mutation', () => {
      const invalidMutation = {
        name: '',
        email: 'invalid-email',
        gender: 'not-boolean',
        age: -1,
        address: '',
        phone: '',
      };

      const result = contactMutationSchema.safeParse(invalidMutation);
      expect(result.success).toBe(false);
    });
  });
});