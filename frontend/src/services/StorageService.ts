/**
 * StorageService - Result-based localStorage abstraction
 *
 * Provides type-safe storage operations with Result types for functional error handling.
 * Wraps all localStorage operations to handle errors gracefully without exceptions.
 *
 * @example
 * ```typescript
 * const storage = new StorageService();
 * const result = storage.get<User>(StorageKey.USER);
 * result.match(
 *   (user) => console.log('User found:', user),
 *   (error) => console.log('Error:', formatStorageError(error))
 * );
 * ```
 */

import { type Result, ok, err } from 'neverthrow';
import type { StorageError } from '../types/errors';
import { StorageErrors } from '../types/errors';

/**
 * Type-safe storage keys enum
 * Add new keys here to maintain consistency across the application
 */
export enum StorageKey {
  AUTH_TOKEN = 'auth_token',
  USER = 'user',
  TENANT = 'tenant',
  REFRESH_TOKEN = 'refresh_token',
  LAST_ACTIVITY = 'last_activity',
  THEME = 'theme',
  LANGUAGE = 'language',
}

/**
 * Storage version for migration support
 */
const STORAGE_VERSION = 1;
const STORAGE_VERSION_KEY = '__storage_version__';

/**
 * Interface for versioned storage data
 */
interface VersionedData<T> {
  version: number;
  data: T;
  timestamp: number;
}

/**
 * StorageService class with Result-based API
 */
export class StorageService {
  private storage: Storage | null;

  /**
   * Create a new StorageService instance
   * @param storage - The storage backend (defaults to localStorage if available)
   */
  constructor(storage?: Storage) {
    this.storage = null;

    if (storage) {
      this.storage = storage;
    } else if (typeof window !== 'undefined') {
      try {
        const localStorageRef = window.localStorage;
        this.storage = localStorageRef ?? null;
      } catch (error) {
        console.warn('Storage unavailable during initialization:', error);
        this.storage = null;
      }
    }

    if (this.storage) {
      this.initializeVersion();
    }
  }

  /**
   * Initialize storage version
   */
  private initializeVersion(): void {
    if (!this.storage) return;

    try {
      const version = this.storage.getItem(STORAGE_VERSION_KEY);
      if (!version) {
        this.storage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION.toString());
      } else {
        const currentVersion = parseInt(version, 10);
        if (currentVersion < STORAGE_VERSION) {
          this.migrate(currentVersion, STORAGE_VERSION);
        }
      }
    } catch (error) {
      console.warn('Failed to initialize storage version:', error);
    }
  }

  /**
   * Migrate storage data between versions
   * @param from - Source version
   * @param to - Target version
   */
  private migrate(from: number, to: number): void {
    console.log(`Migrating storage from version ${String(from)} to ${String(to)}`);

    // TODO: Implement migration logic when STORAGE_VERSION is incremented
    //
    // When incrementing STORAGE_VERSION, you must:
    // 1. Add version-specific migration logic below (e.g., if (from === 1 && to === 2) { ... })
    // 2. Migrate/rename storage keys if the key enum changed
    // 3. Transform data formats for any keys with changed structure
    // 4. Handle backward compatibility for users on older versions
    // 5. Add unit tests in StorageService.test.ts to verify:
    //    - Migration from each prior version to current version
    //    - Data integrity after migration
    //    - Handling of missing/corrupt data during migration
    // 6. Add integration tests to verify end-to-end migration in real browser storage
    //
    // Example migration pattern:
    // if (from === 1 && to === 2) {
    //   // Rename old key to new key
    //   const oldData = this.storage.getItem('old_key');
    //   if (oldData) {
    //     this.storage.setItem('new_key', oldData);
    //     this.storage.removeItem('old_key');
    //   }
    //   // Transform data structure
    //   const userData = this.storage.getItem('user');
    //   if (userData) {
    //     const parsed = JSON.parse(userData);
    //     const migrated = { ...parsed, newField: 'defaultValue' };
    //     this.storage.setItem('user', JSON.stringify(migrated));
    //   }
    // }

    if (this.storage) {
      this.storage.setItem(STORAGE_VERSION_KEY, to.toString());
    }
  }

  /**
   * Get a value from storage
   * @param key - The storage key
   * @returns Result containing the parsed value or a StorageError
   */
  get<T>(key: StorageKey | string): Result<T, StorageError> {
    try {
      // Check if storage is available
      if (!this.isStorageAvailable()) {
        return err(StorageErrors.unavailable('Storage is not available in this environment'));
      }

      const raw = this.storage!.getItem(key);

      if (raw === null) {
        return err(StorageErrors.notFound(key));
      }

      try {
        const parsed = JSON.parse(raw) as T;
        return ok(parsed);
      } catch (parseError) {
        const reason = parseError instanceof Error ? parseError.message : 'Unknown parse error';
        return err(StorageErrors.parseError(key, reason));
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      return err(StorageErrors.unavailable(reason));
    }
  }

  /**
   * Get a versioned value from storage
   * @param key - The storage key
   * @returns Result containing the parsed value or a StorageError
   */
  getVersioned<T>(key: StorageKey | string): Result<T, StorageError> {
    return this.get<VersionedData<T>>(key).andThen(versionedData => {
      // Check version and return error on mismatch
      if (versionedData.version !== STORAGE_VERSION) {
        return err(StorageErrors.versionMismatch(key, STORAGE_VERSION, versionedData.version));
      }
      return ok(versionedData.data);
    });
  }

  /**
   * Set a value in storage
   * @param key - The storage key
   * @param value - The value to store
   * @returns Result containing void on success or a StorageError
   */
  set<T>(key: StorageKey | string, value: T): Result<void, StorageError> {
    try {
      // Check if storage is available
      if (!this.isStorageAvailable()) {
        return err(StorageErrors.unavailable('Storage is not available in this environment'));
      }

      try {
        const serialized = JSON.stringify(value);
        this.storage!.setItem(key, serialized);
        return ok(undefined);
      } catch (stringifyError) {
        if (stringifyError instanceof Error && stringifyError.name === 'QuotaExceededError') {
          return err(StorageErrors.quotaExceeded(key));
        }
        const reason =
          stringifyError instanceof Error ? stringifyError.message : 'Unknown stringify error';
        return err(StorageErrors.stringifyError(key, reason));
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      return err(StorageErrors.unavailable(reason));
    }
  }

  /**
   * Set a versioned value in storage
   * @param key - The storage key
   * @param value - The value to store
   * @returns Result containing void on success or a StorageError
   */
  setVersioned<T>(key: StorageKey | string, value: T): Result<void, StorageError> {
    const versionedData: VersionedData<T> = {
      version: STORAGE_VERSION,
      data: value,
      timestamp: Date.now(),
    };
    return this.set(key, versionedData);
  }

  /**
   * Remove a value from storage
   * @param key - The storage key
   * @returns Result containing void on success or a StorageError
   */
  remove(key: StorageKey | string): Result<void, StorageError> {
    try {
      // Check if storage is available
      if (!this.isStorageAvailable()) {
        return err(StorageErrors.unavailable('Storage is not available in this environment'));
      }

      this.storage!.removeItem(key);
      return ok(undefined);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      return err(StorageErrors.unavailable(reason));
    }
  }

  /**
   * Clear all values from storage
   * @returns Result containing void on success or a StorageError
   */
  clear(): Result<void, StorageError> {
    try {
      // Check if storage is available
      if (!this.isStorageAvailable()) {
        return err(StorageErrors.unavailable('Storage is not available in this environment'));
      }

      this.storage!.clear();
      // Reinitialize version after clear
      this.initializeVersion();
      return ok(undefined);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      return err(StorageErrors.unavailable(reason));
    }
  }

  /**
   * Check if a key exists in storage
   * @param key - The storage key
   * @returns true if the key exists, false otherwise
   */
  has(key: StorageKey | string): boolean {
    try {
      if (!this.storage) return false;
      return this.storage.getItem(key) !== null;
    } catch {
      return false;
    }
  }

  /**
   * Get all keys in storage
   * @returns Array of storage keys
   */
  keys(): string[] {
    try {
      if (!this.storage) return [];
      const keys: string[] = [];
      for (let i = 0; i < this.storage.length; i++) {
        const key = this.storage.key(i);
        if (key !== null && key !== STORAGE_VERSION_KEY) {
          keys.push(key);
        }
      }
      return keys;
    } catch {
      return [];
    }
  }

  /**
   * Check if storage is available
   * @returns true if storage is available, false otherwise
   */
  private isStorageAvailable(): boolean {
    try {
      if (!this.storage) return false;
      const testKey = '__storage_test__';
      this.storage.setItem(testKey, 'test');
      this.storage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Default storage service instance
 * Use this for most cases unless you need a custom storage backend
 */
export const storageService = new StorageService();

/**
 * Helper functions for common storage operations
 */

/**
 * Get authentication token from storage
 */
export const getAuthToken = (): Result<{ token: string }, StorageError> =>
  storageService.get<{ token: string }>(StorageKey.AUTH_TOKEN);

/**
 * Set authentication token in storage
 */
export const setAuthToken = (token: string): Result<void, StorageError> =>
  storageService.set(StorageKey.AUTH_TOKEN, { token });

/**
 * Remove authentication token from storage
 */
export const removeAuthToken = (): Result<void, StorageError> =>
  storageService.remove(StorageKey.AUTH_TOKEN);

/**
 * Clear all authentication-related data
 */
export const clearAuthData = (): Result<void, StorageError> => {
  const results = [
    storageService.remove(StorageKey.AUTH_TOKEN),
    storageService.remove(StorageKey.USER),
    storageService.remove(StorageKey.TENANT),
    storageService.remove(StorageKey.REFRESH_TOKEN),
    storageService.remove(StorageKey.LAST_ACTIVITY),
  ];

  // Return first error or success
  for (const result of results) {
    if (result.isErr()) {
      return result;
    }
  }

  return ok(undefined);
};
