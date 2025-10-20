/**
 * Cache Utilities Tests
 *
 * Tests for Result-based cache layer with focus on regex sanitization
 * in invalidateEntity to prevent ReDoS attacks.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { resultCache, invalidateEntity } from '@/utils/cache';

describe('cache', () => {
  beforeEach(() => {
    // Clear cache before each test to ensure isolation
    resultCache.clear();
  });

  describe('invalidateEntity', () => {
    describe('regex metacharacter sanitization', () => {
      it('should sanitize and match entity types with regex metacharacters: .*', () => {
        // Setup: Add cache entries with normal naming
        resultCache.set('user.*-123', { id: '123' }, 5000);
        resultCache.set('user.*-456', { id: '456' }, 5000);
        resultCache.set('admin-789', { id: '789' }, 5000);

        // Execute: Invalidate using entity type containing .*
        const result = invalidateEntity('user.*');

        // Assert: Should succeed without hanging or throwing
        expect(result.isOk()).toBe(true);

        if (result.isOk()) {
          // Should only match entries that literally start with "user.*-"
          expect(result.value).toBe(2);
        }

        // Verify: Only user.* entries should be removed
        expect(resultCache.has('user.*-123')).toBe(false);
        expect(resultCache.has('user.*-456')).toBe(false);
        expect(resultCache.has('admin-789')).toBe(true);
      });

      it('should sanitize and match entity types with character class: [0-9]+', () => {
        // Setup
        resultCache.set('entity[0-9]+-abc', { data: 'test1' }, 5000);
        resultCache.set('entity[0-9]+-def', { data: 'test2' }, 5000);
        resultCache.set('normal-entity-ghi', { data: 'test3' }, 5000);

        // Execute
        const result = invalidateEntity('entity[0-9]+');

        // Assert
        expect(result.isOk()).toBe(true);

        if (result.isOk()) {
          // Should match literal "entity[0-9]+-" prefix
          expect(result.value).toBe(2);
        }

        // Verify
        expect(resultCache.has('entity[0-9]+-abc')).toBe(false);
        expect(resultCache.has('entity[0-9]+-def')).toBe(false);
        expect(resultCache.has('normal-entity-ghi')).toBe(true);
      });

      it('should sanitize entity types with multiple metacharacters: (a|b)*', () => {
        // Setup
        resultCache.set('(a|b)*-item1', { value: 1 }, 5000);
        resultCache.set('(a|b)*-item2', { value: 2 }, 5000);
        resultCache.set('other-item3', { value: 3 }, 5000);

        // Execute
        const result = invalidateEntity('(a|b)*');

        // Assert: Should not hang or throw ReDoS error
        expect(result.isOk()).toBe(true);

        if (result.isOk()) {
          expect(result.value).toBe(2);
        }

        // Verify
        expect(resultCache.has('(a|b)*-item1')).toBe(false);
        expect(resultCache.has('(a|b)*-item2')).toBe(false);
        expect(resultCache.has('other-item3')).toBe(true);
      });

      it('should sanitize entity types with dollar sign: user$', () => {
        // Setup
        resultCache.set('user$-100', { active: true }, 5000);
        resultCache.set('user$-200', { active: false }, 5000);
        resultCache.set('userA-300', { active: true }, 5000);

        // Execute
        const result = invalidateEntity('user$');

        // Assert
        expect(result.isOk()).toBe(true);

        if (result.isOk()) {
          expect(result.value).toBe(2);
        }

        // Verify: Only literal "user$-" prefix matches
        expect(resultCache.has('user$-100')).toBe(false);
        expect(resultCache.has('user$-200')).toBe(false);
        expect(resultCache.has('userA-300')).toBe(true);
      });

      it('should sanitize entity types with caret: ^user', () => {
        // Setup
        resultCache.set('^user-foo', { type: 'special' }, 5000);
        resultCache.set('^user-bar', { type: 'normal' }, 5000);
        resultCache.set('user-baz', { type: 'standard' }, 5000);

        // Execute
        const result = invalidateEntity('^user');

        // Assert
        expect(result.isOk()).toBe(true);

        if (result.isOk()) {
          expect(result.value).toBe(2);
        }

        // Verify
        expect(resultCache.has('^user-foo')).toBe(false);
        expect(resultCache.has('^user-bar')).toBe(false);
        expect(resultCache.has('user-baz')).toBe(true);
      });

      it('should sanitize entity types with question mark: data?', () => {
        // Setup
        resultCache.set('data?-alpha', { count: 10 }, 5000);
        resultCache.set('data?-beta', { count: 20 }, 5000);
        resultCache.set('dataX-gamma', { count: 30 }, 5000);

        // Execute
        const result = invalidateEntity('data?');

        // Assert
        expect(result.isOk()).toBe(true);

        if (result.isOk()) {
          expect(result.value).toBe(2);
        }

        // Verify
        expect(resultCache.has('data?-alpha')).toBe(false);
        expect(resultCache.has('data?-beta')).toBe(false);
        expect(resultCache.has('dataX-gamma')).toBe(true);
      });

      it('should sanitize entity types with plus: cache+', () => {
        // Setup
        resultCache.set('cache+-entry1', { cached: true }, 5000);
        resultCache.set('cache+-entry2', { cached: true }, 5000);
        resultCache.set('cache-entry3', { cached: false }, 5000);

        // Execute
        const result = invalidateEntity('cache+');

        // Assert
        expect(result.isOk()).toBe(true);

        if (result.isOk()) {
          expect(result.value).toBe(2);
        }

        // Verify
        expect(resultCache.has('cache+-entry1')).toBe(false);
        expect(resultCache.has('cache+-entry2')).toBe(false);
        expect(resultCache.has('cache-entry3')).toBe(true);
      });

      it('should sanitize entity types with curly braces: item{2,5}', () => {
        // Setup
        resultCache.set('item{2,5}-first', { order: 1 }, 5000);
        resultCache.set('item{2,5}-second', { order: 2 }, 5000);
        resultCache.set('item-third', { order: 3 }, 5000);

        // Execute
        const result = invalidateEntity('item{2,5}');

        // Assert
        expect(result.isOk()).toBe(true);

        if (result.isOk()) {
          expect(result.value).toBe(2);
        }

        // Verify
        expect(resultCache.has('item{2,5}-first')).toBe(false);
        expect(resultCache.has('item{2,5}-second')).toBe(false);
        expect(resultCache.has('item-third')).toBe(true);
      });

      it('should sanitize entity types with backslash: path\\to\\resource', () => {
        // Setup
        resultCache.set('path\\to\\resource-1', { path: 'A' }, 5000);
        resultCache.set('path\\to\\resource-2', { path: 'B' }, 5000);
        resultCache.set('pathXtoXresource-3', { path: 'C' }, 5000);

        // Execute
        const result = invalidateEntity('path\\to\\resource');

        // Assert
        expect(result.isOk()).toBe(true);

        if (result.isOk()) {
          expect(result.value).toBe(2);
        }

        // Verify
        expect(resultCache.has('path\\to\\resource-1')).toBe(false);
        expect(resultCache.has('path\\to\\resource-2')).toBe(false);
        expect(resultCache.has('pathXtoXresource-3')).toBe(true);
      });

      it('should sanitize entity types with all metacharacters combined', () => {
        // Setup: Complex pattern with many metacharacters
        const complexType = '.*+?^${}()|[]\\';
        resultCache.set(`${complexType}-data1`, { complex: true }, 5000);
        resultCache.set(`${complexType}-data2`, { complex: true }, 5000);
        resultCache.set('simple-data3', { complex: false }, 5000);

        // Execute
        const result = invalidateEntity(complexType);

        // Assert: Should complete quickly without hanging
        expect(result.isOk()).toBe(true);

        if (result.isOk()) {
          expect(result.value).toBe(2);
        }

        // Verify
        expect(resultCache.has(`${complexType}-data1`)).toBe(false);
        expect(resultCache.has(`${complexType}-data2`)).toBe(false);
        expect(resultCache.has('simple-data3')).toBe(true);
      });
    });

    describe('normal entity types', () => {
      it('should invalidate normal user entity type', () => {
        // Setup
        resultCache.set('user-123', { name: 'Alice' }, 5000);
        resultCache.set('user-456', { name: 'Bob' }, 5000);
        resultCache.set('contact-789', { name: 'Charlie' }, 5000);

        // Execute
        const result = invalidateEntity('user');

        // Assert
        expect(result.isOk()).toBe(true);

        if (result.isOk()) {
          expect(result.value).toBe(2);
        }

        // Verify
        expect(resultCache.has('user-123')).toBe(false);
        expect(resultCache.has('user-456')).toBe(false);
        expect(resultCache.has('contact-789')).toBe(true);
      });

      it('should invalidate normal contact entity type', () => {
        // Setup
        resultCache.set('contact-abc', { email: 'a@test.com' }, 5000);
        resultCache.set('contact-def', { email: 'b@test.com' }, 5000);
        resultCache.set('user-ghi', { email: 'c@test.com' }, 5000);

        // Execute
        const result = invalidateEntity('contact');

        // Assert
        expect(result.isOk()).toBe(true);

        if (result.isOk()) {
          expect(result.value).toBe(2);
        }

        // Verify
        expect(resultCache.has('contact-abc')).toBe(false);
        expect(resultCache.has('contact-def')).toBe(false);
        expect(resultCache.has('user-ghi')).toBe(true);
      });

      it('should invalidate tenant entity type', () => {
        // Setup
        resultCache.set('tenant-org1', { name: 'Org 1' }, 5000);
        resultCache.set('tenant-org2', { name: 'Org 2' }, 5000);
        resultCache.set('user-org3', { name: 'User 3' }, 5000);

        // Execute
        const result = invalidateEntity('tenant');

        // Assert
        expect(result.isOk()).toBe(true);

        if (result.isOk()) {
          expect(result.value).toBe(2);
        }

        // Verify
        expect(resultCache.has('tenant-org1')).toBe(false);
        expect(resultCache.has('tenant-org2')).toBe(false);
        expect(resultCache.has('user-org3')).toBe(true);
      });

      it('should return 0 when no matching entries exist', () => {
        // Setup
        resultCache.set('user-123', { data: 'test' }, 5000);
        resultCache.set('contact-456', { data: 'test' }, 5000);

        // Execute: Try to invalidate non-existent entity type
        const result = invalidateEntity('nonexistent');

        // Assert
        expect(result.isOk()).toBe(true);

        if (result.isOk()) {
          expect(result.value).toBe(0);
        }

        // Verify: Original entries still exist
        expect(resultCache.has('user-123')).toBe(true);
        expect(resultCache.has('contact-456')).toBe(true);
      });

      it('should handle empty entity type gracefully', () => {
        // Setup
        resultCache.set('-orphan1', { data: 'test' }, 5000);
        resultCache.set('-orphan2', { data: 'test' }, 5000);
        resultCache.set('normal-entry', { data: 'test' }, 5000);

        // Execute
        const result = invalidateEntity('');

        // Assert
        expect(result.isOk()).toBe(true);

        if (result.isOk()) {
          // Should match entries starting with "-"
          expect(result.value).toBe(2);
        }
      });
    });

    describe('edge cases and performance', () => {
      it('should handle very long entity type strings', () => {
        // Setup: Long entity type name
        const longType = 'very'.repeat(100) + 'longentitytype';
        resultCache.set(`${longType}-1`, { data: 'test' }, 5000);
        resultCache.set(`${longType}-2`, { data: 'test' }, 5000);

        // Execute
        const result = invalidateEntity(longType);

        // Assert: Should succeed without issues
        expect(result.isOk()).toBe(true);

        if (result.isOk()) {
          expect(result.value).toBe(2);
        }
      });

      it('should complete quickly even with many cache entries', () => {
        // Setup: Add many entries
        for (let i = 0; i < 1000; i++) {
          resultCache.set(`user-${String(i)}`, { id: i }, 5000);
        }

        for (let i = 0; i < 100; i++) {
          resultCache.set(`contact-${String(i)}`, { id: i }, 5000);
        }

        // Execute: Should complete quickly
        const startTime = performance.now();
        const result = invalidateEntity('user');
        const endTime = performance.now();

        // Assert
        expect(result.isOk()).toBe(true);

        if (result.isOk()) {
          expect(result.value).toBe(1000);
        }

        // Should complete in reasonable time (< 100ms even with 1000+ entries)
        expect(endTime - startTime).toBeLessThan(100);

        // Verify contacts weren't touched
        expect(resultCache.has('contact-0')).toBe(true);
        expect(resultCache.has('contact-50')).toBe(true);
      });

      it('should not throw RegExp-related errors with pathological inputs', () => {
        // These patterns are known to cause ReDoS if not properly sanitized
        const pathologicalPatterns = [
          '(a+)+',
          '(a|a)*',
          '(a|ab)*',
          'a*a*a*a*a*a*a*a*a*a*',
          '((a*)*(b*))*',
        ];

        pathologicalPatterns.forEach(pattern => {
          // Setup
          resultCache.set(`${pattern}-test`, { pattern }, 5000);

          // Execute: Should not hang or throw
          const result = invalidateEntity(pattern);

          // Assert
          expect(result.isOk()).toBe(true);
          expect(() => {
            // Verify no exceptions during execution
            invalidateEntity(pattern);
          }).not.toThrow();
        });
      });

      it('should handle unicode characters in entity types', () => {
        // Setup
        resultCache.set('用户-123', { lang: 'zh' }, 5000);
        resultCache.set('用户-456', { lang: 'zh' }, 5000);
        resultCache.set('user-789', { lang: 'en' }, 5000);

        // Execute
        const result = invalidateEntity('用户');

        // Assert
        expect(result.isOk()).toBe(true);

        if (result.isOk()) {
          expect(result.value).toBe(2);
        }

        // Verify
        expect(resultCache.has('用户-123')).toBe(false);
        expect(resultCache.has('用户-456')).toBe(false);
        expect(resultCache.has('user-789')).toBe(true);
      });

      it('should preserve entries that partially match but do not start with pattern', () => {
        // Setup
        resultCache.set('user-123', { type: 'user' }, 5000);
        resultCache.set('admin-user-456', { type: 'admin' }, 5000);
        resultCache.set('superuser-789', { type: 'super' }, 5000);

        // Execute
        const result = invalidateEntity('user');

        // Assert
        expect(result.isOk()).toBe(true);

        if (result.isOk()) {
          // Only entries starting with "user-" should match
          expect(result.value).toBe(1);
        }

        // Verify: Only exact prefix match is removed
        expect(resultCache.has('user-123')).toBe(false);
        expect(resultCache.has('admin-user-456')).toBe(true);
        expect(resultCache.has('superuser-789')).toBe(true);
      });
    });

    describe('result type guarantees', () => {
      it('should always return Result type, never throw', () => {
        // Various inputs that should all return Result
        const testInputs = ['user', 'user.*', '(a|b)*', '[0-9]+', '', 'very'.repeat(1000)];

        testInputs.forEach(input => {
          const result = invalidateEntity(input);

          // Should always be a Result
          expect(typeof result.isOk).toBe('function');
          expect(typeof result.isErr).toBe('function');
        });
      });

      it('should return Ok Result with number on success', () => {
        // Setup
        resultCache.set('test-1', { data: 'a' }, 5000);
        resultCache.set('test-2', { data: 'b' }, 5000);

        // Execute
        const result = invalidateEntity('test');

        // Assert
        expect(result.isOk()).toBe(true);

        if (result.isOk()) {
          expect(typeof result.value).toBe('number');
          expect(result.value).toBe(2);
        }
      });
    });
  });
});
