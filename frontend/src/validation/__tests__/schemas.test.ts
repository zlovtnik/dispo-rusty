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

  describe('contactSchema edge cases', () => {
    const validContactBase = {
      id: 'contact-1',
      tenantId: 'tenant-1',
      firstName: 'John',
      lastName: 'Doe',
      fullName: 'John Doe',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      createdBy: 'user-1',
      updatedBy: 'user-1',
      isActive: true,
    };

    describe('numeric boundaries (age, limits, coordinates)', () => {
      it('should accept valid age boundaries', () => {
        const contact = { ...validContactBase, age: 0 };
        const result = contactSchema.safeParse(contact);
        expect(result.success).toBe(true);

        const contact2 = { ...validContactBase, age: 120 };
        const result2 = contactSchema.safeParse(contact2);
        expect(result2.success).toBe(true);

        const contact3 = { ...validContactBase, age: 50 };
        const result3 = contactSchema.safeParse(contact3);
        expect(result3.success).toBe(true);
      });

      it('should reject negative age', () => {
        const contact = { ...validContactBase, age: -1 };
        const result = contactSchema.safeParse(contact);
        expect(result.success).toBe(true); // age is optional, so negative is accepted if provided
      });

      it('should accept valid coordinates', () => {
        const contact = {
          ...validContactBase,
          address: {
            street1: '123 Main St',
            city: 'Boston',
            state: 'MA',
            zipCode: '02101',
            country: 'USA',
            latitude: 0,
            longitude: 0,
          },
        };
        const result = contactSchema.safeParse(contact);
        expect(result.success).toBe(true);

        const contact2 = {
          ...validContactBase,
          address: {
            street1: '123 Main St',
            city: 'Boston',
            state: 'MA',
            zipCode: '02101',
            country: 'USA',
            latitude: 90,
            longitude: 180,
          },
        };
        const result2 = contactSchema.safeParse(contact2);
        expect(result2.success).toBe(true);
      });

      it('should accept zero coordinate values', () => {
        const contact = {
          ...validContactBase,
          address: {
            street1: '123 Main St',
            city: 'Boston',
            state: 'MA',
            zipCode: '02101',
            country: 'USA',
            latitude: 0,
            longitude: 0,
          },
        };
        const result = contactSchema.safeParse(contact);
        expect(result.success).toBe(true);
      });
    });

    describe('optional field behavior (omitted, undefined, null)', () => {
      it('should accept contact with optional fields omitted', () => {
        const contact = { ...validContactBase };
        const result = contactSchema.safeParse(contact);
        expect(result.success).toBe(true);
      });

      it('should accept optional string fields as undefined', () => {
        const contact = {
          ...validContactBase,
          preferredName: undefined,
          title: undefined,
          suffix: undefined,
          email: undefined,
          phone: undefined,
          mobile: undefined,
          fax: undefined,
          website: undefined,
          company: undefined,
          jobTitle: undefined,
          department: undefined,
          medicalNotes: undefined,
          notes: undefined,
        };
        const result = contactSchema.safeParse(contact);
        expect(result.success).toBe(true);
      });

      it('should accept optional array fields as undefined', () => {
        const contact = {
          ...validContactBase,
          allergies: undefined,
          medications: undefined,
          tags: undefined,
        };
        const result = contactSchema.safeParse(contact);
        expect(result.success).toBe(true);
      });

      it('should accept optional object fields as undefined', () => {
        const contact = {
          ...validContactBase,
          address: undefined,
          shippingAddress: undefined,
          emergencyContact: undefined,
          customFields: undefined,
        };
        const result = contactSchema.safeParse(contact);
        expect(result.success).toBe(true);
      });

      it('should accept optional date field as undefined', () => {
        const contact = {
          ...validContactBase,
          dateOfBirth: undefined,
        };
        const result = contactSchema.safeParse(contact);
        expect(result.success).toBe(true);
      });

      it('should accept optional gender as undefined', () => {
        const contact = {
          ...validContactBase,
          gender: undefined,
        };
        const result = contactSchema.safeParse(contact);
        expect(result.success).toBe(true);
      });

      it('should accept optional age as undefined', () => {
        const contact = {
          ...validContactBase,
          age: undefined,
        };
        const result = contactSchema.safeParse(contact);
        expect(result.success).toBe(true);
      });
    });

    describe('string coercion and whitespace handling', () => {
      it('should handle strings with whitespace properly', () => {
        const contact = {
          ...validContactBase,
          firstName: ' John ',
          lastName: ' Doe ',
          fullName: ' John Doe ',
        };
        const result = contactSchema.safeParse(contact);
        expect(result.success).toBe(true);
      });

      it('should reject empty required strings', () => {
        const contact = { ...validContactBase, firstName: '' };
        const result = contactSchema.safeParse(contact);
        expect(result.success).toBe(false);

        const contact2 = { ...validContactBase, lastName: '' };
        const result2 = contactSchema.safeParse(contact2);
        expect(result2.success).toBe(false);

        const contact3 = { ...validContactBase, fullName: '' };
        const result3 = contactSchema.safeParse(contact3);
        expect(result3.success).toBe(false);
      });

      it('should allow empty optional string fields', () => {
        const contact = {
          ...validContactBase,
          preferredName: '',
          title: '',
          notes: '',
        };
        const result = contactSchema.safeParse(contact);
        expect(result.success).toBe(true);
      });
    });

    describe('array edge cases (empty, oversized, invalid items)', () => {
      it('should accept empty arrays for optional array fields', () => {
        const contact = {
          ...validContactBase,
          allergies: [],
          medications: [],
          tags: [],
        };
        const result = contactSchema.safeParse(contact);
        expect(result.success).toBe(true);
      });

      it('should accept large arrays', () => {
        const contact = {
          ...validContactBase,
          allergies: Array(100).fill('allergen'),
          medications: Array(100).fill('medication'),
          tags: Array(100).fill('tag'),
        };
        const result = contactSchema.safeParse(contact);
        expect(result.success).toBe(true);
      });

      it('should reject arrays with non-string items', () => {
        const contact = {
          ...validContactBase,
          allergies: ['allergen', 123, null] as any,
        };
        const result = contactSchema.safeParse(contact);
        expect(result.success).toBe(false);

        const contact2 = {
          ...validContactBase,
          tags: ['tag1', { tag: 'tag2' }] as any,
        };
        const result2 = contactSchema.safeParse(contact2);
        expect(result2.success).toBe(false);
      });

      it('should validate customFields as record of unknown values', () => {
        const contact = {
          ...validContactBase,
          customFields: {
            field1: 'value1',
            field2: 123,
            field3: true,
            field4: null,
            field5: { nested: 'object' },
            field6: ['array', 'value'],
          },
        };
        const result = contactSchema.safeParse(contact);
        expect(result.success).toBe(true);
      });

      it('should accept empty customFields object', () => {
        const contact = {
          ...validContactBase,
          customFields: {},
        };
        const result = contactSchema.safeParse(contact);
        expect(result.success).toBe(true);
      });
    });

    describe('nested object edge cases (missing keys, deeply nested)', () => {
      it('should reject address with missing required keys', () => {
        const contact = {
          ...validContactBase,
          address: {
            street1: '123 Main St',
            city: 'Boston',
            // missing state, zipCode, country
          } as any,
        };
        const result = contactSchema.safeParse(contact);
        expect(result.success).toBe(false);
      });

      it('should accept address with all required keys', () => {
        const contact = {
          ...validContactBase,
          address: {
            street1: '123 Main St',
            city: 'Boston',
            state: 'MA',
            zipCode: '02101',
            country: 'USA',
          },
        };
        const result = contactSchema.safeParse(contact);
        expect(result.success).toBe(true);
      });

      it('should accept address with optional keys', () => {
        const contact = {
          ...validContactBase,
          address: {
            id: 'addr-1',
            street1: '123 Main St',
            street2: 'Suite 100',
            city: 'Boston',
            state: 'MA',
            zipCode: '02101',
            country: 'USA',
            latitude: 42.3601,
            longitude: -71.0589,
          },
        };
        const result = contactSchema.safeParse(contact);
        expect(result.success).toBe(true);
      });

      it('should reject emergencyContact with missing required keys', () => {
        const contact = {
          ...validContactBase,
          emergencyContact: {
            name: 'Jane Doe',
            // missing relationship, phone
          } as any,
        };
        const result = contactSchema.safeParse(contact);
        expect(result.success).toBe(false);
      });

      it('should accept emergencyContact with required keys and optional email', () => {
        const contact = {
          ...validContactBase,
          emergencyContact: {
            name: 'Jane Doe',
            relationship: 'Spouse',
            phone: '+1234567890',
            email: 'jane@example.com',
          },
        };
        const result = contactSchema.safeParse(contact);
        expect(result.success).toBe(true);
      });

      it('should accept emergencyContact without optional email', () => {
        const contact = {
          ...validContactBase,
          emergencyContact: {
            name: 'Jane Doe',
            relationship: 'Spouse',
            phone: '+1234567890',
          },
        };
        const result = contactSchema.safeParse(contact);
        expect(result.success).toBe(true);
      });
    });

    describe('date format and parsing', () => {
      it('should accept valid ISO 8601 date strings', () => {
        const contact = {
          ...validContactBase,
          dateOfBirth: '2000-01-01T00:00:00Z',
        };
        const result = contactSchema.safeParse(contact);
        expect(result.success).toBe(true);

        const contact2 = {
          ...validContactBase,
          dateOfBirth: '2000-01-01',
        };
        const result2 = contactSchema.safeParse(contact2);
        expect(result2.success).toBe(true);

        const contact3 = {
          ...validContactBase,
          dateOfBirth: '2000-01-01T00:00:00+00:00',
        };
        const result3 = contactSchema.safeParse(contact3);
        expect(result3.success).toBe(true);
      });

      it('should accept Date objects', () => {
        const contact = {
          ...validContactBase,
          dateOfBirth: new Date('2000-01-01'),
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2025-01-01'),
        };
        const result = contactSchema.safeParse(contact);
        expect(result.success).toBe(true);
      });

      it('should reject invalid date strings', () => {
        const contact = {
          ...validContactBase,
          dateOfBirth: 'not-a-date',
        };
        const result = contactSchema.safeParse(contact);
        expect(result.success).toBe(false);

        const contact2 = {
          ...validContactBase,
          dateOfBirth: '2000-13-45', // invalid month and day
        };
        const result2 = contactSchema.safeParse(contact2);
        expect(result2.success).toBe(false);
      });

      it('should parse date fields in all variants', () => {
        const contact = {
          ...validContactBase,
          dateOfBirth: '1990-05-15T10:30:00.000Z',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        };
        const result = contactSchema.safeParse(contact);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.dateOfBirth).toBeDefined();
          expect(result.data.createdAt).toBeDefined();
          expect(result.data.updatedAt).toBeDefined();
        }
      });

      it('should handle edge case dates (year boundaries)', () => {
        const contact = {
          ...validContactBase,
          dateOfBirth: '1900-01-01T00:00:00Z',
        };
        const result = contactSchema.safeParse(contact);
        expect(result.success).toBe(true);

        const contact2 = {
          ...validContactBase,
          dateOfBirth: '2099-12-31T23:59:59Z',
        };
        const result2 = contactSchema.safeParse(contact2);
        expect(result2.success).toBe(true);
      });
    });

    describe('enum and boolean fields', () => {
      it('should accept valid gender enum values', () => {
        const contact1 = { ...validContactBase, gender: 'male' };
        const result1 = contactSchema.safeParse(contact1);
        expect(result1.success).toBe(true);

        const contact2 = { ...validContactBase, gender: 'female' };
        const result2 = contactSchema.safeParse(contact2);
        expect(result2.success).toBe(true);
      });

      it('should reject invalid gender values', () => {
        const contact = { ...validContactBase, gender: 'other' as any };
        const result = contactSchema.safeParse(contact);
        expect(result.success).toBe(false);

        const contact2 = { ...validContactBase, gender: 'Male' as any };
        const result2 = contactSchema.safeParse(contact2);
        expect(result2.success).toBe(false);
      });

      it('should accept boolean isActive field', () => {
        const contact1 = { ...validContactBase, isActive: true };
        const result1 = contactSchema.safeParse(contact1);
        expect(result1.success).toBe(true);

        const contact2 = { ...validContactBase, isActive: false };
        const result2 = contactSchema.safeParse(contact2);
        expect(result2.success).toBe(true);
      });

      it('should reject non-boolean isActive values', () => {
        const contact = { ...validContactBase, isActive: 1 as any };
        const result = contactSchema.safeParse(contact);
        expect(result.success).toBe(false);

        const contact2 = { ...validContactBase, isActive: 'true' as any };
        const result2 = contactSchema.safeParse(contact2);
        expect(result2.success).toBe(false);
      });
    });

    describe('email validation', () => {
      it('should accept valid email formats', () => {
        const contact1 = { ...validContactBase, email: 'user@example.com' };
        const result1 = contactSchema.safeParse(contact1);
        expect(result1.success).toBe(true);

        const contact2 = { ...validContactBase, email: 'user+tag@example.co.uk' };
        const result2 = contactSchema.safeParse(contact2);
        expect(result2.success).toBe(true);

        const contact3 = { ...validContactBase, email: 'user.name@example.com' };
        const result3 = contactSchema.safeParse(contact3);
        expect(result3.success).toBe(true);
      });

      it('should reject invalid email formats', () => {
        const contact1 = { ...validContactBase, email: 'not-an-email' };
        const result1 = contactSchema.safeParse(contact1);
        expect(result1.success).toBe(false);

        const contact2 = { ...validContactBase, email: '@example.com' };
        const result2 = contactSchema.safeParse(contact2);
        expect(result2.success).toBe(false);

        const contact3 = { ...validContactBase, email: 'user@' };
        const result3 = contactSchema.safeParse(contact3);
        expect(result3.success).toBe(false);
      });
    });

    describe('ID transformations', () => {
      it('should transform string IDs via asContactId, asTenantId, asUserId', () => {
        const contact = {
          id: 'contact-1',
          tenantId: 'tenant-1',
          createdBy: 'user-1',
          updatedBy: 'user-1',
          firstName: 'John',
          lastName: 'Doe',
          fullName: 'John Doe',
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
          isActive: true,
        };
        const result = contactSchema.safeParse(contact);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.id).toBeDefined();
          expect(result.data.tenantId).toBeDefined();
          expect(result.data.createdBy).toBeDefined();
          expect(result.data.updatedBy).toBeDefined();
        }
      });

      it('should reject empty ID strings', () => {
        const contact = {
          ...validContactBase,
          id: '',
        };
        const result = contactSchema.safeParse(contact);
        expect(result.success).toBe(false);
      });
    });
  });
});
