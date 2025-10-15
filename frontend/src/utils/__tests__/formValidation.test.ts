/**
 * Form Validation Tests - Example Test Suite
 *
 * Demonstrates testing strategies for FP validation patterns
 */

import { describe, it, expect } from 'bun:test';
import {
  validateEmail,
  validatePhone,
  validatePassword,
  validateAge,
  validateZipCode,
  validateAll,
  validateOptional,
  validateAllOrCollectErrors,
  type Email,
  type Phone,
  type Password,
} from '@/utils/formValidation';

describe('formValidation', () => {
  describe('validateEmail', () => {
    it('should accept valid email addresses', () => {
      const validEmails = [
        'user@example.com',
        'test.user@example.co.uk',
        'user+tag@domain.com',
        'user_name@company.org',
      ];

      validEmails.forEach(email => {
        const result = validateEmail(email);
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          // Type check - should be Email branded type
          const validatedEmail: Email = result.value;
          // Compare as strings by casting to string
          expect(validatedEmail as string).toBe(email.trim().toLowerCase());
        }
      });
    });

    it('should reject invalid email addresses', () => {
      const invalidEmails = [
        'invalid',
        '@example.com',
        'user@',
        'user@.com',
        'user..name@example.com',
        'user@domain..com',
      ];

      invalidEmails.forEach(email => {
        const result = validateEmail(email);
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error.type).toMatch(/INVALID_EMAIL|REQUIRED_FIELD/);
        }
      });
    });

    it('should normalize email to lowercase', () => {
      const result = validateEmail('USER@EXAMPLE.COM');
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value as string).toBe('user@example.com');
      }
    });

    it('should trim whitespace', () => {
      const result = validateEmail('  user@example.com  ');
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value as string).toBe('user@example.com');
      }
    });
  });

  describe('validatePhone', () => {
    it('should accept valid US phone numbers', () => {
      const validPhones = ['+1-234-567-8900', '(234) 567-8900', '234-567-8900', '2345678900'];

      validPhones.forEach(phone => {
        const result = validatePhone(phone, 'US');
        expect(result.isOk()).toBe(true);
      });
    });

    it('should accept valid international phone numbers', () => {
      const validPhones = ['+44 20 7123 4567', '+81 3-1234-5678', '+61 2 1234 5678'];

      validPhones.forEach(phone => {
        const result = validatePhone(phone, 'INTERNATIONAL');
        expect(result.isOk()).toBe(true);
      });
    });

    it('should reject invalid phone numbers', () => {
      const invalidPhones = [
        '123', // Too short
        '12345678901234567890', // Too long
        'abc-def-ghij', // Non-numeric
      ];

      invalidPhones.forEach(phone => {
        const result = validatePhone(phone);
        expect(result.isErr()).toBe(true);
      });
    });
  });

  describe('validatePassword', () => {
    it('should accept strong passwords', () => {
      const strongPasswords = ['MyP@ssw0rd', 'Str0ngPwd!', 'SecurePass123', 'C0mpl3xP@ss'];

      strongPasswords.forEach(password => {
        const result = validatePassword(password);
        expect(result.isOk()).toBe(true);
      });
    });

    it('should reject weak passwords', () => {
      const weakPasswords = [
        'short', // Too short
        'nouppercase1', // No uppercase
        'NOLOWERCASE1', // No lowercase
        'NoNumbers', // No numbers
      ];

      weakPasswords.forEach(password => {
        const result = validatePassword(password);
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error.type).toBe('INVALID_PASSWORD');
        }
      });
    });

    it('should reject common weak passwords', () => {
      const commonWeak = ['password123', '12345678', 'qwerty123'];

      commonWeak.forEach(password => {
        const result = validatePassword(password);
        expect(result.isErr()).toBe(true);
      });
    });

    it('should enforce minimum length', () => {
      const result = validatePassword('Short1');
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('INVALID_PASSWORD');
        // Access reason based on discriminated union
        if (result.error.type === 'INVALID_PASSWORD') {
          expect(result.error.reason).toContain('at least 8');
        }
      }
    });
  });

  describe('validateAge', () => {
    it('should accept valid ages', () => {
      const validAges = [0, 18, 25, 65, 100];

      validAges.forEach(age => {
        const result = validateAge(age);
        expect(result.isOk()).toBe(true);
      });
    });

    it('should reject invalid ages', () => {
      const invalidAges = [
        -5, // Negative
        200, // Too old
        25.5, // Not integer
        NaN, // Not a number
        Infinity,
      ];

      invalidAges.forEach(age => {
        const result = validateAge(age);
        expect(result.isErr()).toBe(true);
      });
    });

    it('should respect min/max constraints', () => {
      const result1 = validateAge(17, { min: 18, max: 120 });
      expect(result1.isErr()).toBe(true);

      const result2 = validateAge(121, { min: 18, max: 120 });
      expect(result2.isErr()).toBe(true);

      const result3 = validateAge(25, { min: 18, max: 120 });
      expect(result3.isOk()).toBe(true);
    });
  });

  describe('validateZipCode', () => {
    it('should accept valid US ZIP codes', () => {
      const validZips = ['12345', '12345-6789'];

      validZips.forEach(zip => {
        const result = validateZipCode(zip, 'US');
        expect(result.isOk()).toBe(true);
      });
    });

    it('should accept valid Canadian postal codes', () => {
      const validPostal = ['K1A 0B1', 'M5V 3A8', 'V6B2M9'];

      validPostal.forEach(postal => {
        const result = validateZipCode(postal, 'CANADA');
        expect(result.isOk()).toBe(true);
      });
    });

    it('should reject invalid ZIP codes', () => {
      const invalidZips = ['1234', '123456', 'ABCDE'];

      invalidZips.forEach(zip => {
        const result = validateZipCode(zip, 'US');
        expect(result.isErr()).toBe(true);
      });
    });
  });

  describe('combinator functions', () => {
    describe('validateAll', () => {
      it('should return all values when all validations pass', () => {
        const result = validateAll([
          validateEmail('user@example.com'),
          validatePhone('+1-234-567-8900'),
          validateAge(25),
        ]);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value).toHaveLength(3);
        }
      });

      it('should return first error when any validation fails', () => {
        const result = validateAll([
          validateEmail('invalid'),
          validatePhone('+1-234-567-8900'),
          validateAge(25),
        ]);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error.type).toBe('INVALID_EMAIL');
        }
      });
    });

    describe('validateOptional', () => {
      it('should return Ok(undefined) for empty values', () => {
        const result1 = validateOptional('', validateEmail);
        expect(result1.isOk()).toBe(true);
        if (result1.isOk()) {
          expect(result1.value).toBeUndefined();
        }

        const result2 = validateOptional(null, validateEmail);
        expect(result2.isOk()).toBe(true);

        const result3 = validateOptional(undefined, validateEmail);
        expect(result3.isOk()).toBe(true);
      });

      it('should validate when value is present', () => {
        const result1 = validateOptional('user@example.com', validateEmail);
        expect(result1.isOk()).toBe(true);

        const result2 = validateOptional('invalid', validateEmail);
        expect(result2.isErr()).toBe(true);
      });
    });

    describe('validateAllOrCollectErrors', () => {
      it('should return all values when all validations pass', () => {
        const result = validateAllOrCollectErrors({
          email: validateEmail('user@example.com'),
          phone: validatePhone('+1-234-567-8900'),
          age: validateAge(25),
        });

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value).toHaveProperty('email');
          expect(result.value).toHaveProperty('phone');
          expect(result.value).toHaveProperty('age');
        }
      });

      it('should collect all errors when validations fail', () => {
        const result = validateAllOrCollectErrors({
          email: validateEmail('invalid'),
          phone: validatePhone('123'),
          age: validateAge(-5),
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error).toHaveProperty('email');
          expect(result.error).toHaveProperty('phone');
          expect(result.error).toHaveProperty('age');
        }
      });

      it('should collect partial errors', () => {
        const result = validateAllOrCollectErrors({
          email: validateEmail('user@example.com'), // Valid
          phone: validatePhone('123'), // Invalid
          age: validateAge(25), // Valid
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error).toHaveProperty('phone');
          expect(result.error).not.toHaveProperty('email');
          expect(result.error).not.toHaveProperty('age');
        }
      });
    });
  });

  describe('error formatting', () => {
    it('should format validation errors', () => {
      const result = validateEmail('invalid');
      expect(result.isErr()).toBe(true);

      if (result.isErr()) {
        // Check the error structure
        expect(result.error.type).toBe('INVALID_EMAIL');
        if (result.error.type === 'INVALID_EMAIL') {
          expect(result.error.email).toBe('invalid');
          expect(result.error.reason).toContain('Invalid email format');
        }
      }
    });
  });

  describe('type safety', () => {
    it('should use branded types', () => {
      const emailResult = validateEmail('user@example.com');

      if (emailResult.isOk()) {
        // Type test - this should compile
        const email: Email = emailResult.value;

        // This would fail to compile (can't assign string to Email):
        // const email: Email = 'user@example.com';

        expect(email as string).toBe('user@example.com');
      }
    });
  });
});

// Integration test example
describe('form validation integration', () => {
  interface ContactFormData {
    email: string;
    phone: string;
    age: number;
  }

  const validateContactForm = (data: ContactFormData) => {
    return validateAllOrCollectErrors({
      email: validateEmail(data.email),
      phone: validatePhone(data.phone),
      age: validateAge(data.age, { min: 18, max: 120 }),
    });
  };

  it('should validate complete contact form', () => {
    const validData: ContactFormData = {
      email: 'user@example.com',
      phone: '+1-234-567-8900',
      age: 25,
    };

    const result = validateContactForm(validData);
    expect(result.isOk()).toBe(true);
  });

  it('should collect all form errors', () => {
    const invalidData: ContactFormData = {
      email: 'invalid',
      phone: '123',
      age: 17,
    };

    const result = validateContactForm(invalidData);
    expect(result.isErr()).toBe(true);

    if (result.isErr()) {
      expect(Object.keys(result.error)).toHaveLength(3);
    }
  });
});
