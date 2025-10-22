/**
 * Enhanced Search Service
 * Provides frontend-only search functionality with advanced filtering, sorting, and pagination
 */

import { ok, err } from 'neverthrow';
import type { Result } from '@/types/fp';
import type { Contact } from '@/types/contact';
import type { Tenant } from '@/types/tenant';
import type { SearchFilter, SearchQuery, SearchResult } from '@/components/SearchComponents';

/**
 * Get field value from object using dot notation
 */
function getFieldValue(item: unknown, field: string): unknown {
  const keys = field.split('.');
  let value: unknown = item;

  for (const key of keys) {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'object' || value === null) return null;
    value = (value as Record<string, unknown>)[key];
  }

  return value;
}

/**
 * Search service error types
 */
export type SearchServiceError =
  | { type: 'INVALID_FILTER'; field: string; reason: string }
  | { type: 'INVALID_SORT'; field: string; reason: string }
  | { type: 'SEARCH_FAILED'; reason: string }
  | { type: 'NO_DATA'; message: string };

/**
 * Search operator implementations
 */
export class SearchOperators {
  static contains(value: string, searchTerm: string, caseSensitive = false): boolean {
    if (value === null || value === undefined || searchTerm === null || searchTerm === undefined) {
      return false;
    }
    const normalizedValue = caseSensitive ? value : value.toLowerCase();
    const normalizedSearch = caseSensitive ? searchTerm : searchTerm.toLowerCase();
    return normalizedValue.includes(normalizedSearch);
  }

  static equals(value: string | number | boolean, searchTerm: string | number | boolean): boolean {
    return value === searchTerm;
  }

  static startsWith(value: string, searchTerm: string, caseSensitive = false): boolean {
    if (value === null || value === undefined || searchTerm === null || searchTerm === undefined) {
      return false;
    }
    const normalizedValue = caseSensitive ? value : value.toLowerCase();
    const normalizedSearch = caseSensitive ? searchTerm : searchTerm.toLowerCase();
    return normalizedValue.startsWith(normalizedSearch);
  }

  static endsWith(value: string, searchTerm: string, caseSensitive = false): boolean {
    if (value === null || value === undefined || searchTerm === null || searchTerm === undefined) {
      return false;
    }
    const normalizedValue = caseSensitive ? value : value.toLowerCase();
    const normalizedSearch = caseSensitive ? searchTerm : searchTerm.toLowerCase();
    return normalizedValue.endsWith(normalizedSearch);
  }

  static greaterThan(value: number, searchTerm: number): boolean {
    return value > searchTerm;
  }

  static greaterThanOrEqual(value: number, searchTerm: number): boolean {
    return value >= searchTerm;
  }

  static lessThan(value: number, searchTerm: number): boolean {
    return value < searchTerm;
  }

  static lessThanOrEqual(value: number, searchTerm: number): boolean {
    return value <= searchTerm;
  }

  static between(value: number, range: [number, number]): boolean {
    return value >= range[0] && value <= range[1];
  }

  static in(value: string | number, searchTerms: (string | number | null)[]): boolean {
    return searchTerms.includes(value);
  }

  static notIn(value: string | number, searchTerms: (string | number | null)[]): boolean {
    return !searchTerms.includes(value);
  }
}

/**
 * Generic search service for any data type
 */
export class GenericSearchService<T> {
  protected data: T[];
  private searchFields: string[];
  private caseSensitive: boolean;

  constructor(data: T[], searchFields: string[], caseSensitive = false) {
    this.data = data;
    this.searchFields = searchFields;
    this.caseSensitive = caseSensitive;
  }

  /**
   * Update the data source
   */
  updateData(newData: T[]): void {
    this.data = newData;
  }

  /**
   * Update search fields
   */
  updateSearchFields(newFields: string[]): void {
    this.searchFields = newFields;
  }

  /**
   * Perform text search across multiple fields
   */
  textSearch(query: string): T[] {
    if (!query.trim()) return this.data;

    const normalizedQuery = this.caseSensitive ? query : query.toLowerCase();

    return this.data.filter(item => {
      return this.searchFields.some(field => {
        const value = getFieldValue(item, field);
        if (value === null || value === undefined) return false;

        const stringValue = String(value);
        const normalizedValue = this.caseSensitive ? stringValue : stringValue.toLowerCase();
        return normalizedValue.includes(normalizedQuery);
      });
    });
  }

  /**
   * Apply filters to data
   */
  applyFilters(filters: SearchFilter[]): T[] {
    if (filters.length === 0) return this.data;

    return this.data.filter(item => {
      return filters.every(filter => {
        const value = getFieldValue(item, filter.field);
        if (value === null || value === undefined) return false;

        return this.evaluateFilter(value, filter);
      });
    });
  }

  /**
   * Sort data by field and order
   */
  sortData(data: T[], sortBy?: string, sortOrder: 'asc' | 'desc' = 'asc'): T[] {
    if (sortBy == null || sortBy === '') return data;

    return [...data].sort((a, b) => {
      const aValue = getFieldValue(a, sortBy);
      const bValue = getFieldValue(b, sortBy);

      if (aValue === null || aValue === undefined) return sortOrder === 'asc' ? 1 : -1;
      if (bValue === null || bValue === undefined) return sortOrder === 'asc' ? -1 : 1;

      const comparison = this.compareValues(aValue, bValue);
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }

  /**
   * Paginate data
   */
  paginateData(data: T[], page: number, pageSize: number): SearchResult<T> {
    const total = data.length;
    const totalPages = Math.ceil(total / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedData = data.slice(startIndex, endIndex);

    return {
      data: paginatedData,
      total,
      page,
      pageSize,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  /**
   * Perform comprehensive search with filters, sorting, and pagination
   */
  search(query: SearchQuery): Result<SearchResult<T>, SearchServiceError> {
    try {
      let filteredData = this.data;

      // Apply text search if query has search term
      if (query.filters.length > 0) {
        filteredData = this.applyFilters(query.filters);
      }

      // Apply sorting
      if (query.sortBy != null && query.sortBy !== '') {
        filteredData = this.sortData(filteredData, query.sortBy, query.sortOrder);
      }

      // Apply pagination
      const result = this.paginateData(filteredData, query.page ?? 1, query.pageSize ?? 10);

      return ok(result);
    } catch (error) {
      return err({
        type: 'SEARCH_FAILED',
        reason: error instanceof Error ? error.message : 'Unknown search error',
      });
    }
  }

  /**
   * Evaluate a single filter
   */
  private evaluateFilter(value: unknown, filter: SearchFilter): boolean {
    try {
      switch (filter.operator) {
        case 'contains':
          return SearchOperators.contains(String(value), String(filter.value), this.caseSensitive);
        case 'equals':
          if (filter.value === null || filter.value === undefined || Array.isArray(filter.value)) {
            return false;
          }
          return SearchOperators.equals(value as string | number | boolean, filter.value);
        case 'startsWith':
          return SearchOperators.startsWith(
            String(value),
            String(filter.value),
            this.caseSensitive
          );
        case 'endsWith':
          return SearchOperators.endsWith(String(value), String(filter.value), this.caseSensitive);
        case 'gt': {
          if (filter.value === null || filter.value === undefined) {
            return false;
          }
          const numValue = Number(value);
          const numFilter = Number(filter.value);
          if (
            !isFinite(numValue) ||
            Number.isNaN(numValue) ||
            !isFinite(numFilter) ||
            Number.isNaN(numFilter)
          ) {
            return false;
          }
          return SearchOperators.greaterThan(numValue, numFilter);
        }
        case 'gte': {
          if (filter.value === null || filter.value === undefined) {
            return false;
          }
          const numValue = Number(value);
          const numFilter = Number(filter.value);
          if (
            !isFinite(numValue) ||
            Number.isNaN(numValue) ||
            !isFinite(numFilter) ||
            Number.isNaN(numFilter)
          ) {
            return false;
          }
          return SearchOperators.greaterThanOrEqual(numValue, numFilter);
        }
        case 'lt': {
          if (filter.value === null || filter.value === undefined) {
            return false;
          }
          const numValue = Number(value);
          const numFilter = Number(filter.value);
          if (
            !isFinite(numValue) ||
            Number.isNaN(numValue) ||
            !isFinite(numFilter) ||
            Number.isNaN(numFilter)
          ) {
            return false;
          }
          return SearchOperators.lessThan(numValue, numFilter);
        }
        case 'lte': {
          if (filter.value === null || filter.value === undefined) {
            return false;
          }
          const numValue = Number(value);
          const numFilter = Number(filter.value);
          if (
            !isFinite(numValue) ||
            Number.isNaN(numValue) ||
            !isFinite(numFilter) ||
            Number.isNaN(numFilter)
          ) {
            return false;
          }
          return SearchOperators.lessThanOrEqual(numValue, numFilter);
        }
        case 'between': {
          if (!Array.isArray(filter.value) || filter.value.length !== 2) {
            return false;
          }
          // If either range value is null, treat as no filter
          if (filter.value[0] === null || filter.value[1] === null) {
            return false;
          }
          const numValue = Number(value);
          const numLower = Number(filter.value[0]);
          const numUpper = Number(filter.value[1]);
          if (
            !isFinite(numValue) ||
            Number.isNaN(numValue) ||
            !isFinite(numLower) ||
            Number.isNaN(numLower) ||
            !isFinite(numUpper) ||
            Number.isNaN(numUpper)
          ) {
            return false;
          }
          return SearchOperators.between(numValue, [numLower, numUpper]);
        }
        case 'in':
          if (Array.isArray(filter.value)) {
            // Filter out null values from the array
            const validValues = filter.value.filter(v => v !== null && v !== undefined);
            if (validValues.length === 0) {
              return false;
            }
            return SearchOperators.in(value as string | number, validValues);
          }
          return false;
        case 'notIn':
          if (Array.isArray(filter.value)) {
            // Filter out null values from the array
            const validValues = filter.value.filter(v => v !== null && v !== undefined);
            if (validValues.length === 0) {
              return false;
            }
            return SearchOperators.notIn(value as string | number, validValues);
          }
          return false;
        default:
          return false;
      }
    } catch (error) {
      console.warn(`Filter evaluation failed for field ${filter.field}:`, error);
      return false;
    }
  }

  /**
   * Compare two values for sorting
   */
  private compareValues(a: unknown, b: unknown): number {
    if (a === b) return 0;
    if (a === null || a === undefined) return -1;
    if (b === null || b === undefined) return 1;

    if (typeof a === 'number' && typeof b === 'number') {
      return a - b;
    }

    if (typeof a === 'string' && typeof b === 'string') {
      return a.localeCompare(b);
    }

    if (a instanceof Date && b instanceof Date) {
      return a.getTime() - b.getTime();
    }

    return String(a).localeCompare(String(b));
  }
}

/**
 * Contact-specific search service
 */
export class ContactSearchService extends GenericSearchService<Contact> {
  constructor(contacts: Contact[]) {
    const searchFields = [
      'fullName',
      'firstName',
      'lastName',
      'email',
      'phone',
      'mobile',
      'company',
      'jobTitle',
      'address.street1',
      'address.city',
      'address.state',
      'address.zipCode',
      'address.country',
    ];
    super(contacts, searchFields);
  }

  /**
  getSuggestions(searchTerm: string, limit = 10): string[] {
    if (!searchTerm.trim()) return [];

    const normalizedTerm = searchTerm.toLowerCase();
    const suggestions = new Set<string>();

    this.data.forEach(contact => {
      // Add name suggestions
      if (contact.fullName?.toLowerCase().includes(normalizedTerm)) {
        suggestions.add(contact.fullName);
      }

      // Add email suggestions
      if (contact.email?.toLowerCase().includes(normalizedTerm)) {
        suggestions.add(contact.email);
      }

      // Add phone suggestions
      if (contact.phone?.includes(normalizedTerm)) {
        suggestions.add(contact.phone);
      }

      // Add company suggestions
      if (contact.company?.toLowerCase().includes(normalizedTerm)) {
        suggestions.add(contact.company);
      }
    });

    return Array.from(suggestions).slice(0, limit);
  }

      // Add company suggestions
      if (contact.company?.toLowerCase().includes(normalizedTerm)) {
        suggestions.add(contact.company);
      }
    });

    return Array.from(suggestions).slice(0, limit);
  }

  /**
   * Get contact statistics
   */
  getStatistics(): {
    total: number;
    withEmail: number;
    withPhone: number;
    withAddress: number;
    active: number;
    inactive: number;
  } {
    return {
      total: this.data.length,
      withEmail: this.data.filter(c => c.email != null && c.email !== '').length,
      withPhone: this.data.filter(
        c => (c.phone != null && c.phone !== '') || (c.mobile != null && c.mobile !== '')
      ).length,
      withAddress: this.data.filter(c => c.address != null).length,
      active: this.data.filter(c => c.isActive).length,
      inactive: this.data.filter(c => !c.isActive).length,
    };
  }
}

/**
 * Tenant-specific search service
 */
export class TenantSearchService extends GenericSearchService<Tenant> {
  constructor(tenants: Tenant[]) {
    const searchFields = ['name', 'id', 'db_url'];
    super(tenants, searchFields);
  }

  /**
   * Search tenants with advanced filtering
   */
  searchTenants(query: SearchQuery): Result<SearchResult<Tenant>, SearchServiceError> {
    return this.search(query);
  }

  /**
   * Get tenant suggestions for autocomplete
   */
  getSuggestions(searchTerm: string, limit = 10): string[] {
    if (!searchTerm.trim()) return [];

    const normalizedTerm = searchTerm.toLowerCase();
    const suggestions = new Set<string>();

    this.data.forEach(tenant => {
      if (tenant.name?.toLowerCase().includes(normalizedTerm)) {
        suggestions.add(tenant.name);
      }
      if (tenant.id?.toLowerCase().includes(normalizedTerm)) {
        suggestions.add(tenant.id);
      }
    });

    return Array.from(suggestions).slice(0, limit);
  }

  /**
   * Get tenant statistics
   */
  getStatistics(): {
    total: number;
    withDbUrl: number;
    recentlyCreated: number;
  } {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    return {
      total: this.data.length,
      withDbUrl: this.data.filter(t => t.db_url).length,
      recentlyCreated: this.data.filter(t => {
        if (!t.created_at) return false;
        const createdDate = new Date(t.created_at);
        return !isNaN(createdDate.getTime()) && createdDate > oneWeekAgo;
      }).length,
    };
  }
}

/**
 * Search service factory
 */
export class SearchServiceFactory {
  static createContactService(contacts: Contact[]): ContactSearchService {
    return new ContactSearchService(contacts);
  }

  static createTenantService(tenants: Tenant[]): TenantSearchService {
    return new TenantSearchService(tenants);
  }

  static createGenericService<T>(data: T[], searchFields: string[]): GenericSearchService<T> {
    return new GenericSearchService(data, searchFields);
  }
}

/**
 * Search performance utilities
 */
export class SearchPerformanceUtils {
  /**
   * Measure search performance
   */
  static measureSearch<T>(
    searchFunction: () => T,
    threshold = 100
  ): { result: T; time: number; isSlow: boolean } {
    const start = performance.now();
    const result = searchFunction();
    const time = performance.now() - start;
    const isSlow = time > threshold;

    if (isSlow) {
      console.warn(
        `Slow search detected: ${time.toFixed(2)}ms (threshold: ${threshold.toString()}ms)`
      );
    }

    return { result, time, isSlow };
  }
  static batchSearch<T>(searches: (() => T)[], batchSize = 10): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const results: T[] = [];
      let index = 0;

      const processBatch = () => {
        try {
          const batch = searches.slice(index, index + batchSize);
          const batchResults = batch.map(search => search());
          results.push(...batchResults);
          index += batchSize;

          if (index < searches.length) {
            setTimeout(processBatch, 0); // Yield to event loop
          } else {
            resolve(results);
          }
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      };

      processBatch();
    });
  }
}
