/**
 * Search-related type definitions
 */

import type { SearchFilter } from '@/components/SearchComponents';

export interface SearchState {
  query: string;
  filters: SearchFilter[];
  sortBy: string | undefined;
  sortOrder: 'asc' | 'desc';
  page: number;
  pageSize: number;
  setQuery: (query: string) => void;
  setFilters: (filters: SearchFilter[]) => void;
  addFilter: (filter: SearchFilter) => void;
  updateFilter: (id: string, updates: Partial<SearchFilter>) => void;
  removeFilter: (id: string) => void;
  clearFilters: () => void;
  setSort: (field: string, order: 'asc' | 'desc') => void;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  reset: () => void;
}

export interface SearchStats {
  total: number;
  filtered: number;
  searchTime: number;
}

export interface PerformanceMetrics {
  performanceScore: number;
  averageSearchTime: number;
  totalSearches: number;
  slowSearches: number;
}
