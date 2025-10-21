/**
 * Common Passwords Loader Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { CommonPasswordsLoader } from '../commonPasswordsLoader';
import { COMMON_PASSWORDS_FALLBACK } from '../../config/commonPasswords';

// Mock fetch for testing
const originalFetch = global.fetch;
let mockFetch: any;

beforeEach(() => {
  // Create a proper mock that returns Response-like objects
  mockFetch = async (url: string) => {
    // Only mock the specific common-passwords.json URL
    if (url.includes('/config/common-passwords.json')) {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          version: '1.0.0',
          description: 'Test passwords',
          lastUpdated: '2025-01-01',
          source: 'test',
          passwords: ['test1', 'test2', 'test3'],
        }),
      };
    }
    // For any other URLs, use the original fetch
    return originalFetch(url);
  };
  global.fetch = mockFetch;

  // Reset the singleton instance
  CommonPasswordsLoader.__resetForTests();
});

afterEach(() => {
  // Restore original fetch
  global.fetch = originalFetch;
});

describe('CommonPasswordsLoader', () => {
  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = CommonPasswordsLoader.getInstance();
      const instance2 = CommonPasswordsLoader.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should accept custom config', () => {
      const config = { enabled: false, cacheTtlMs: 1000, requestTimeoutMs: 500 };
      const loader = CommonPasswordsLoader.getInstance(config);
      expect(loader).toBeDefined();
    });

    it('should throw error when maxCacheEntries is not a positive integer', () => {
      expect(() => {
        CommonPasswordsLoader.getInstance({ maxCacheEntries: 0 });
      }).toThrow();

      expect(() => {
        CommonPasswordsLoader.getInstance({ maxCacheEntries: -1 });
      }).toThrow();

      expect(() => {
        CommonPasswordsLoader.getInstance({ maxCacheEntries: 3.5 });
      }).toThrow();
    });

    it('should accept valid maxCacheEntries', () => {
      const loader = CommonPasswordsLoader.getInstance({ maxCacheEntries: 5000 });
      expect(loader).toBeDefined();
    });

    it('should validate isSSR:false works in client environment', () => {
      // Mock client environment
      const originalWindow = global.window;
      (global as any).window = {};

      try {
        const loader = CommonPasswordsLoader.getInstance({ isSSR: false });
        expect(loader).toBeDefined();
      } finally {
        if (originalWindow === undefined) {
          delete (global as any).window;
        } else {
          global.window = originalWindow;
        }
      }
    });

    it('should throw when isSSR:true in client environment', () => {
      // Mock client environment
      const originalWindow = global.window;
      (global as any).window = {};

      try {
        expect(() => {
          CommonPasswordsLoader.getInstance({ isSSR: true });
        }).toThrow(
          'Configuration mismatch: isSSR is set to true but window is defined (client environment)'
        );
      } finally {
        if (originalWindow === undefined) {
          delete (global as any).window;
        } else {
          global.window = originalWindow;
        }
      }
    });

    it('should allow undefined isSSR to use runtime detection', async () => {
      // Should not throw when isSSR is undefined (uses runtime detection)
      const loader = CommonPasswordsLoader.getInstance({ isSSR: undefined });
      expect(loader).toBeDefined();

      // Verify the loader is functional by calling getCommonPasswords()
      const passwords = await loader.getCommonPasswords();

      // Assert it returns an array with valid data
      expect(Array.isArray(passwords)).toBe(true);
      expect(passwords.length).toBeGreaterThan(0);

      // Verify it contains the expected type of data (strings)
      expect(typeof passwords[0]).toBe('string');
    });
  });

  describe('getCommonPasswords', () => {
    it('should fallback to built-in list when file is missing or invalid', async () => {
      // Use a custom config that points to a non-existent file to force fallback
      const loader = CommonPasswordsLoader.getInstance({
        filePath: '/non-existent-test-file.json',
        enabled: true,
      });
      const passwords = await loader.getCommonPasswords();

      // Should fallback to built-in list since the file doesn't exist
      expect(passwords).toEqual(COMMON_PASSWORDS_FALLBACK);
    });

    it('should return cached passwords on subsequent calls', async () => {
      const loader = CommonPasswordsLoader.getInstance({
        filePath: '/non-existent-test-file.json',
        enabled: true,
      });

      // First call
      const passwords1 = await loader.getCommonPasswords();
      expect(passwords1).toEqual(COMMON_PASSWORDS_FALLBACK);

      // Second call should use cache
      const passwords2 = await loader.getCommonPasswords();
      expect(passwords2).toEqual(COMMON_PASSWORDS_FALLBACK);
    });

    it('should fallback to built-in list when loading is disabled', async () => {
      const loader = CommonPasswordsLoader.getInstance({ enabled: false });
      const passwords = await loader.getCommonPasswords();

      expect(passwords).toEqual(COMMON_PASSWORDS_FALLBACK);
    });

    it('should fallback to built-in list when fetch fails', async () => {
      mockFetch = async () => {
        throw new Error('Network error');
      };
      global.fetch = mockFetch;

      const loader = CommonPasswordsLoader.getInstance();
      const passwords = await loader.getCommonPasswords();

      expect(passwords).toEqual(COMMON_PASSWORDS_FALLBACK);
    });

    it('should handle invalid JSON response', async () => {
      mockFetch = async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ invalid: 'response' }),
      });
      global.fetch = mockFetch;

      const loader = CommonPasswordsLoader.getInstance();
      const passwords = await loader.getCommonPasswords();

      expect(passwords).toEqual(COMMON_PASSWORDS_FALLBACK);
    });

    it('should enforce maxCacheEntries limit on fallback list', async () => {
      // Instantiate loader with maxCacheEntries: 50
      const loader = CommonPasswordsLoader.getInstance({
        filePath: '/non-existent-file.json', // This will cause fallback to be used
        enabled: true,
        maxCacheEntries: 50,
      });

      // Test getCommonPasswords() with newly created instance (cache not yet populated)
      const passwords = await loader.getCommonPasswords();

      // Assert that only 50 passwords are returned (truncated to maxCacheEntries)
      expect(passwords).toHaveLength(50);

      // Assert that the returned passwords are the first 50 entries from the fallback list
      const expectedPasswords = COMMON_PASSWORDS_FALLBACK.slice(0, 50);
      expect(passwords).toEqual(expectedPasswords);
    });
  });

  describe('getCacheStatus', () => {
    it('should return null when no cache exists', () => {
      const loader = CommonPasswordsLoader.getInstance();
      const status = loader.getCacheStatus();
      expect(status).toBeNull();
    });

    it('should return cache status with config file source when loading succeeds', async () => {
      const loader = CommonPasswordsLoader.getInstance();
      await loader.getCommonPasswords();

      // Give the cache status update a chance to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const status = loader.getCacheStatus();
      expect(status).toBeDefined();
      expect(status?.hasCache).toBe(true);
      expect(status?.source).toMatch(/\/config\/common-passwords\.json$/);
    }, { timeout: 10000 });

    it('should return cache status with fallback source when file loading fails', async () => {
      const loader = CommonPasswordsLoader.getInstance({
        filePath: '/non-existent-test-file.json',
        enabled: true,
      });
      const passwords = await loader.getCommonPasswords();
      const status = loader.getCacheStatus();
      expect(status).not.toBeNull();
      expect(status?.source).toBe('fallback');
      expect(status?.hasCache).toBe(true);
      expect(Array.isArray(passwords)).toBe(true);
      expect(passwords.length).toBeGreaterThan(0);
    });
  });
});
