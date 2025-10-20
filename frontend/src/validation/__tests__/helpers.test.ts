import { describe, it, expect } from 'bun:test';
import { z } from 'zod';
import { validateAndDecode, liftResult } from '../helpers';
import type { ValidationError } from '../../types/errors';

// Helper function to verify validation error structure
function expectValidationError(error: ValidationError, expectIssuesLength = true): void {
  expect(error.type).toBe('validation');
  expect(error.details).toBeDefined();
  if (error.details) {
    expect(error.details.issues).toBeDefined();
    expect(Array.isArray(error.details.issues)).toBe(true);
    if (expectIssuesLength) {
      expect((error.details.issues as unknown[]).length).toBeGreaterThan(0);
    }
  }
}

// Simple test schema
const testUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  age: z.number().min(0, 'Age must be positive'),
  email: z.email(),
});

describe('validation helpers', () => {
  describe('validateAndDecode', () => {
    it('should return ok result for valid data', () => {
      const validData = {
        name: 'John Doe',
        age: 25,
        email: 'john@example.com',
      };

      const result = validateAndDecode(testUserSchema, validData);
      expect(result.isOk()).toBe(true);

      result.map(user => {
        expect(user.name).toBe('John Doe');
        expect(user.age).toBe(25);
        expect(user.email).toBe('john@example.com');
      });
    });

    it('should return error result for invalid data', () => {
      const invalidData = {
        name: '', // Empty name should fail
        age: -5, // Negative age should fail
        email: 'invalid-email', // Invalid email format
      };

      const result = validateAndDecode(testUserSchema, invalidData);
      expect(result.isErr()).toBe(true);

      result.mapErr(error => {
        expectValidationError(error);
      });
    });

    it('should handle missing required fields', () => {
      const incompleteData = {
        name: 'John Doe',
        // Missing age and email
      };

      const result = validateAndDecode(testUserSchema, incompleteData);
      expect(result.isErr()).toBe(true);

      result.mapErr(error => {
        expectValidationError(error);
      });
    });

    it('should handle extra fields gracefully', () => {
      const dataWithExtraFields = {
        name: 'John Doe',
        age: 25,
        email: 'john@example.com',
        extraField: 'should be ignored',
      };

      const result = validateAndDecode(testUserSchema, dataWithExtraFields);
      expect(result.isOk()).toBe(true);

      result.map(user => {
        expect(user.name).toBe('John Doe');
        expect(user.age).toBe(25);
        expect(user.email).toBe('john@example.com');
        // Extra field should not be present in typed result
        expect((user as Record<string, unknown>).extraField).toBeUndefined();
      });
    });

    it('should handle null and undefined input', () => {
      const nullResult = validateAndDecode(testUserSchema, null);
      expect(nullResult.isErr()).toBe(true);

      const undefinedResult = validateAndDecode(testUserSchema, undefined);
      expect(undefinedResult.isErr()).toBe(true);
    });
  });

  describe('liftResult', () => {
    it('should convert ok Result to ok AsyncResult', async () => {
      const { ok: okResult } = await import('neverthrow');
      const syncResult = okResult('test value');

      const asyncResult = liftResult(syncResult);

      const value = await asyncResult.match(
        val => val,
        () => 'error'
      );
      expect(value).toBe('test value');
    });

    it('should convert err Result to err AsyncResult', async () => {
      const { err: errResult } = await import('neverthrow');
      const syncResult = errResult('test error');

      const asyncResult = liftResult(syncResult);

      const error = await asyncResult.match(
        () => 'value',
        err => err
      );
      expect(error).toBe('test error');
    });

    it('should work with validation results', async () => {
      const validData = {
        name: 'Jane Doe',
        age: 30,
        email: 'jane@example.com',
      };

      const syncResult = validateAndDecode(testUserSchema, validData);
      const asyncResult = liftResult(syncResult);

      const user = await asyncResult.match(
        val => val,
        () => null
      );

      expect(user).not.toBeNull();
      if (user) {
        expect(user.name).toBe('Jane Doe');
        expect(user.age).toBe(30);
        expect(user.email).toBe('jane@example.com');
      }
    });

    it('should preserve error details in async context', async () => {
      const invalidData = { name: '' };
      const syncResult = validateAndDecode(testUserSchema, invalidData);
      const asyncResult = liftResult(syncResult);

      const error = await asyncResult.match(
        () => null,
        err => err
      );

      expect(error).not.toBeNull();
      if (error) {
        expectValidationError(error, false);
      }
    });
  });
});
