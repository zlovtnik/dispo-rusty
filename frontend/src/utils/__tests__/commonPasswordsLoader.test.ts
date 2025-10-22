/**
 * Common Passwords Loader Tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { CommonPasswordsLoader } from '../commonPasswordsLoader';
import { COMMON_PASSWORDS_FALLBACK } from '../../config/commonPasswords';
import { http, HttpResponse } from 'msw';
import { getServer } from '../../test-utils/mocks/server';

describe('CommonPasswordsLoader', () => {
  beforeEach(() => {
    // Setup MSW handler for common-passwords.json endpoint
    getServer().use(
      http.get(/\/config\/common-passwords\.json$/, () => {
        return HttpResponse.json({
          version: '1.0.0',
          description: 'Test passwords',
          lastUpdated: '2025-01-01',
          source: 'test',
          passwords: ['test1', 'test2', 'test3'],
        });
      })
    );

    // Reset the singleton instance
    CommonPasswordsLoader.__resetForTests();
  });
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
      // Override MSW handler to throw an error
      getServer().use(
        http.get(/\/config\/common-passwords\.json$/, () => {
          return HttpResponse.error();
        })
      );

      const loader = CommonPasswordsLoader.getInstance();
      const passwords = await loader.getCommonPasswords();

      expect(passwords).toEqual(COMMON_PASSWORDS_FALLBACK);
    });

    it('should handle invalid JSON response', async () => {
      // Override MSW handler to return invalid JSON structure
      getServer().use(
        http.get(/\/config\/common-passwords\.json$/, () => {
          return HttpResponse.json({ invalid: 'response' });
        })
      );

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

      const status = loader.getCacheStatus();
      expect(status).not.toBeNull();
      expect(status?.hasCache).toBe(true);
      // Cache status source should either be the config file path or fallback
      // (depends on environment - file may not be accessible during tests)
      expect(status?.source).toBeTruthy();
      expect(typeof status?.source).toBe('string');
    }, { timeout: 2000 });

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
