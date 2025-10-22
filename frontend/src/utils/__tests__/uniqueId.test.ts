import { describe, expect, it } from 'bun:test';
import {
  createUniqueIdGenerator,
  createScopedIdGenerator,
  testUniqueIdGeneration,
} from '../uniqueId';

describe('uniqueId', () => {
  describe('createUniqueIdGenerator', () => {
    it('should generate unique IDs', () => {
      const generator = createUniqueIdGenerator();
      const ids = new Set<string>();

      // Generate 1000 IDs and ensure no collisions
      for (let i = 0; i < 1000; i++) {
        const id = generator();
        expect(ids.has(id)).toBe(false);
        ids.add(id);
      }

      expect(ids.size).toBe(1000);
    });

    it('should generate different IDs on successive calls', () => {
      const generator = createUniqueIdGenerator();
      const id1 = generator();
      const id2 = generator();

      expect(id1).not.toBe(id2);
    });
  });

  describe('createScopedIdGenerator', () => {
    it('should generate scoped IDs with prefix', () => {
      const generator = createScopedIdGenerator('filter-');
      const id = generator();

      expect(id).toMatch(/^filter-/);
    });

    it('should generate unique scoped IDs', () => {
      const generator = createScopedIdGenerator('test-');
      const ids = new Set<string>();

      // Generate 100 IDs and ensure no collisions
      for (let i = 0; i < 100; i++) {
        const id = generator();
        expect(ids.has(id)).toBe(false);
        ids.add(id);
      }

      expect(ids.size).toBe(100);
    });
  });

  describe('testUniqueIdGeneration', () => {
    it('should not throw when generating many IDs', () => {
      expect(() => testUniqueIdGeneration(1000)).not.toThrow();
    });

    it('should return array of unique IDs', () => {
      const ids = testUniqueIdGeneration(100);
      const uniqueIds = new Set(ids);

      expect(ids.length).toBe(100);
      expect(uniqueIds.size).toBe(100);
    });
  });

  describe('rapid successive calls', () => {
    it('should handle rapid successive calls without collisions', () => {
      const generator = createUniqueIdGenerator();
      const ids = new Set<string>();

      // Simulate rapid successive calls (like adding filters quickly)
      const promises = Array.from({ length: 100 }, () => Promise.resolve(generator()));

      return Promise.all(promises).then(results => {
        results.forEach(id => {
          expect(ids.has(id)).toBe(false);
          ids.add(id);
        });
        expect(ids.size).toBe(100);
      });
    });
  });
});
