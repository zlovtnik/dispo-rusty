/**
 * Enhanced Search Hooks
 * Provides optimized search functionality with caching, debouncing, and performance monitoring
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { SearchFilter, SearchQuery, SearchResult } from '@/components/SearchComponents';

// Simple debounce implementation
const debounce = <T extends (...args: any[]) => Promise<any>>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>>) => {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
    return new Promise((resolve, reject) => {
      clearTimeout(timeout);
      timeout = setTimeout(async () => {
        try {
          const result = await func(...args);
          resolve(result as Awaited<ReturnType<T>>);
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      }, wait);
    });
  };
};

/**
 * Search state management hook
 */
export interface UseSearchStateOptions<_T> {
  initialQuery?: string;
  initialFilters?: SearchFilter[];
  initialSortBy?: string;
  initialSortOrder?: 'asc' | 'desc';
  pageSize?: number;
  debounceMs?: number;
  cacheResults?: boolean;
  maxCacheSize?: number;
}

export interface UseSearchStateReturn<_T> {
  // Search state
  query: string;
  filters: SearchFilter[];
  sortBy: string | undefined;
  sortOrder: 'asc' | 'desc';
  page: number;
  pageSize: number;

  // Search actions
  setQuery: (query: string) => void;
  setFilters: (filters: SearchFilter[]) => void;
  addFilter: (filter: SearchFilter) => void;
  updateFilter: (id: string, updates: Partial<SearchFilter>) => void;
  removeFilter: (id: string) => void;
  clearFilters: () => void;
  setSorting: (sortBy: string, sortOrder: 'asc' | 'desc') => void;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  reset: () => void;

  // Search query
  searchQuery: SearchQuery;

  // Performance metrics
  searchCount: number;
  lastSearchTime: number | null;
  cacheHitRate: number;
}

export function useSearchState<T>(options: UseSearchStateOptions<T> = {}): UseSearchStateReturn<T> {
  const {
    initialQuery = '',
    initialFilters = [],
    initialSortBy,
    initialSortOrder = 'asc',
    pageSize = 10,
  } = options;

  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<SearchFilter[]>(initialFilters);
  const [sortBy, setSortBy] = useState<string | undefined>(initialSortBy);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(initialSortOrder);
  const [page, setPage] = useState(1);
  const [currentPageSize, setCurrentPageSize] = useState(pageSize);

  // Performance tracking
  const [searchCount, _setSearchCount] = useState(0);
  const [lastSearchTime, _setLastSearchTime] = useState<number | null>(null);
  const [cacheHits, _setCacheHits] = useState(0);
  const [cacheMisses, _setCacheMisses] = useState(0);

  const addFilter = useCallback((filter: SearchFilter) => {
    setFilters(prev => [...prev, filter]);
  }, []);

  const updateFilter = useCallback((id: string, updates: Partial<SearchFilter>) => {
    setFilters(prev => prev.map(filter => (filter.id === id ? { ...filter, ...updates } : filter)));
  }, []);

  const removeFilter = useCallback((id: string) => {
    setFilters(prev => prev.filter(filter => filter.id !== id));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters([]);
  }, []);

  const setSorting = useCallback((newSortBy: string, newSortOrder: 'asc' | 'desc') => {
    setSortBy(newSortBy);
    setSortOrder(newSortOrder);
  }, []);

  const reset = useCallback(() => {
    setQuery(initialQuery);
    setFilters(initialFilters);
    setSortBy(initialSortBy);
    setSortOrder(initialSortOrder);
    setPage(1);
    setCurrentPageSize(pageSize);
  }, [initialQuery, initialFilters, initialSortBy, initialSortOrder, pageSize]);

  const searchQuery = useMemo(
    (): SearchQuery => ({
      queryId: `search-${String(filters.length)}-${sortBy ?? 'none'}-${sortOrder}-${String(page)}-${String(currentPageSize)}`,
      filters,
      sortBy,
      sortOrder,
      page,
      pageSize: currentPageSize,
    }),
    [filters, sortBy, sortOrder, page, currentPageSize]
  );

  const cacheHitRate = useMemo(() => {
    const total = cacheHits + cacheMisses;
    return total > 0 ? cacheHits / total : 0;
  }, [cacheHits, cacheMisses]);

  return {
    query,
    filters,
    sortBy,
    sortOrder,
    page,
    pageSize: currentPageSize,
    setQuery,
    setFilters,
    addFilter,
    updateFilter,
    removeFilter,
    clearFilters,
    setSorting,
    setPage,
    setPageSize: setCurrentPageSize,
    reset,
    searchQuery,
    searchCount,
    lastSearchTime,
    cacheHitRate,
  };
}

/**
 * Debounced search hook with performance optimization
 */
export interface UseDebouncedSearchOptions<T> {
  searchFunction: (query: SearchQuery, signal?: AbortSignal) => Promise<SearchResult<T>>;
  debounceMs?: number;
  cacheResults?: boolean;
  maxCacheSize?: number;
  onSearchStart?: () => void;
  onSearchComplete?: (result: SearchResult<T>) => void;
  onSearchError?: (error: Error) => void;
}

export interface UseDebouncedSearchReturn<T> {
  search: (query: SearchQuery) => Promise<SearchResult<T>>;
  searchImmediate: (query: SearchQuery) => Promise<SearchResult<T>>;
  isSearching: boolean;
  lastResult: SearchResult<T> | null;
  error: Error | null;
  clearError: () => void;
  clearCache: () => void;
  cacheStats: {
    size: number;
    hitRate: number;
    lastAccess: Date | null;
  };
}

export function useDebouncedSearch<T>(
  options: UseDebouncedSearchOptions<T>
): UseDebouncedSearchReturn<T> {
  const {
    searchFunction,
    debounceMs = 300,
    cacheResults = true,
    maxCacheSize = 100,
    onSearchStart,
    onSearchComplete,
    onSearchError,
  } = options;

  const [isSearching, setIsSearching] = useState(false);
  const [lastResult, setLastResult] = useState<SearchResult<T> | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Race condition prevention
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef<number>(0);

  // Cache management
  const cacheRef = useRef<Map<string, { result: SearchResult<T>; timestamp: number }>>(new Map());
  const [cacheStats, setCacheStats] = useState({
    size: 0,
    hitRate: 0,
    lastAccess: null as Date | null,
  });

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearCache = useCallback(() => {
    cacheRef.current.clear();
    setCacheStats(prev => ({ ...prev, size: 0 }));
  }, []);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const generateCacheKey = useCallback((query: SearchQuery): string => {
    return JSON.stringify({
      filters: query.filters.sort((a, b) => a.id.localeCompare(b.id)),
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      page: query.page,
      pageSize: query.pageSize,
    });
  }, []);

  const searchImmediate = useCallback(
    async (query: SearchQuery): Promise<SearchResult<T>> => {
      // Cancel any previous in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller for this request
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // Generate unique request ID for this search
      const currentRequestId = ++requestIdRef.current;

      if (!cacheResults) {
        try {
          const result = await searchFunction(query, abortController.signal);

          // Only apply result if this is still the latest request
          if (currentRequestId === requestIdRef.current) {
            setLastResult(result);
            onSearchComplete?.(result);
          }

          return result;
        } catch (err) {
          // Ignore abort errors - they're expected when cancelling previous requests
          if (err instanceof Error && err.name === 'AbortError') {
            throw err;
          }

          const error = err instanceof Error ? err : new Error('Search failed');
          if (currentRequestId === requestIdRef.current) {
            setError(error);
            onSearchError?.(error);
          }
          throw error;
        }
      }

      const cacheKey = generateCacheKey(query);
      const cached = cacheRef.current.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
        // 5 minute cache
        setCacheStats(prev => ({
          ...prev,
          hitRate: prev.hitRate + 1,
          lastAccess: new Date(),
        }));
        return cached.result;
      }

      setIsSearching(true);
      setError(null);
      onSearchStart?.();

      try {
        const result = await searchFunction(query, abortController.signal);

        // Only apply and cache result if this is still the latest request
        if (currentRequestId === requestIdRef.current) {
          // Cache the result
          if (cacheResults) {
            cacheRef.current.set(cacheKey, {
              result,
              timestamp: Date.now(),
            });

            // Clean up old cache entries if needed
            if (cacheRef.current.size > maxCacheSize) {
              const entries = Array.from(cacheRef.current.entries());
              entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
              const toDelete = entries.slice(0, entries.length - maxCacheSize);
              toDelete.forEach(([key]) => cacheRef.current.delete(key));
            }

            setCacheStats(prev => ({
              ...prev,
              size: cacheRef.current.size,
              hitRate: prev.hitRate,
              lastAccess: new Date(),
            }));
          }

          setLastResult(result);
          onSearchComplete?.(result);
        }

        return result;
      } catch (err) {
        // Ignore abort errors - they're expected when cancelling previous requests
        if (err instanceof Error && err.name === 'AbortError') {
          throw err;
        }

        const error = err instanceof Error ? err : new Error('Search failed');

        // Only set error if this is still the latest request
        if (currentRequestId === requestIdRef.current) {
          setError(error);
          onSearchError?.(error);
        }

        throw error;
      } finally {
        // Only update isSearching if this is still the latest request
        if (currentRequestId === requestIdRef.current) {
          setIsSearching(false);
        }
      }
    },
    [
      searchFunction,
      cacheResults,
      generateCacheKey,
      maxCacheSize,
      onSearchStart,
      onSearchComplete,
      onSearchError,
    ]
  );

  const debouncedSearch = useMemo(
    () => debounce(searchImmediate, debounceMs),
    [searchImmediate, debounceMs]
  );

  const search = useCallback(
    async (query: SearchQuery): Promise<SearchResult<T>> => {
      return debouncedSearch(query);
    },
    [debouncedSearch]
  );

  return {
    search,
    searchImmediate,
    isSearching,
    lastResult,
    error,
    clearError,
    clearCache,
    cacheStats,
  };
}

/**
 * Multi-attribute search hook
 * Enables searching across multiple fields simultaneously
 */
export interface UseMultiAttributeSearchOptions<T> {
  data: T[];
  searchFields: string[];
  searchFunction?: (query: string, data: T[]) => T[];
  caseSensitive?: boolean;
  exactMatch?: boolean;
  highlightMatches?: boolean;
}

export interface UseMultiAttributeSearchReturn<T> {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filteredData: T[];
  searchResults: {
    item: T;
    matches: {
      field: string;
      value: string;
      highlighted: string;
    }[];
  }[];
  clearSearch: () => void;
  searchStats: {
    totalItems: number;
    filteredItems: number;
    searchTime: number;
  };
}

export function useMultiAttributeSearch<T>(
  options: UseMultiAttributeSearchOptions<T>
): UseMultiAttributeSearchReturn<T> {
  const {
    data,
    searchFields,
    searchFunction,
    caseSensitive = false,
    exactMatch = false,
    highlightMatches = true,
  } = options;

  const [searchQuery, setSearchQuery] = useState('');

  const defaultSearchFunction = useCallback(
    (query: string, items: T[]): T[] => {
      if (!query.trim()) return items;

      const normalizedQuery = caseSensitive ? query : query.toLowerCase();

      return items.filter(item => {
        return searchFields.some(field => {
          const value = (item as Record<string, unknown>)[field];
          if (value === null || value === undefined) return false;

          const stringValue = String(value);
          const normalizedValue = caseSensitive ? stringValue : stringValue.toLowerCase();

          if (exactMatch) {
            return normalizedValue === normalizedQuery;
          } else {
            return normalizedValue.includes(normalizedQuery);
          }
        });
      });
    },
    [searchFields, caseSensitive, exactMatch]
  );

  const searchFn = searchFunction ?? defaultSearchFunction;

  const filteredData = useMemo(() => {
    return searchFn(searchQuery, data);
  }, [searchQuery, data, searchFn]);

  // Update search stats when filtered data changes
  const searchStats = useMemo(
    () => ({
      totalItems: data.length,
      filteredItems: filteredData.length,
      searchTime: 0, // Performance measurement moved to useEffect
    }),
    [data.length, filteredData.length]
  );

  const searchResults = useMemo(() => {
    if (!highlightMatches || !searchQuery.trim()) {
      return filteredData.map(item => ({ item, matches: [] }));
    }

    const normalizedQuery = caseSensitive ? searchQuery : searchQuery.toLowerCase();

    return filteredData.map(item => {
      const matches = searchFields
        .map(field => {
          const value = (item as Record<string, unknown>)[field];
          if (value === null || value === undefined) return null;

          const stringValue = String(value);
          const normalizedValue = caseSensitive ? stringValue : stringValue.toLowerCase();

          if (exactMatch) {
            if (normalizedValue !== normalizedQuery) return null;
          } else {
            if (!normalizedValue.includes(normalizedQuery)) return null;
          }

          // Create highlighted version
          let highlighted: string;
          if (exactMatch) {
            // Short-circuit for exact matches - no regex needed
            highlighted = `<mark>${stringValue}</mark>`;
          } else {
            // Use regex for partial matches with proper escaping
            const regex = new RegExp(
              searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
              caseSensitive ? 'g' : 'gi'
            );
            highlighted = stringValue.replace(regex, '<mark>$&</mark>');
          }

          return {
            field,
            value: stringValue,
            highlighted,
          };
        })
        .filter(Boolean) as {
        field: string;
        value: string;
        highlighted: string;
      }[];

      return { item, matches };
    });
  }, [filteredData, searchQuery, searchFields, caseSensitive, exactMatch, highlightMatches]);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  return {
    searchQuery,
    setSearchQuery,
    filteredData,
    searchResults,
    clearSearch,
    searchStats,
  };
}

/**
 * Search performance monitoring hook
 */
export interface UseSearchPerformanceOptions {
  enableMetrics?: boolean;
  logPerformance?: boolean;
  performanceThreshold?: number;
}

export interface UseSearchPerformanceReturn {
  startTimer: () => void;
  endTimer: () => number;
  getMetrics: () => {
    averageSearchTime: number;
    totalSearches: number;
    slowSearches: number;
    performanceScore: number;
  };
  resetMetrics: () => void;
}

export function useSearchPerformance(
  options: UseSearchPerformanceOptions = {}
): UseSearchPerformanceReturn {
  const {
    enableMetrics = true,
    logPerformance = false,
    performanceThreshold = 100, // ms
  } = options;

  const [metrics, setMetrics] = useState({
    searchTimes: [] as number[],
    totalSearches: 0,
    slowSearches: 0,
  });

  const timersRef = useRef<Map<string, number>>(new Map());

  const startTimer = useCallback(
    (id = 'default') => {
      if (enableMetrics) {
        timersRef.current.set(id, performance.now());
      }
    },
    [enableMetrics]
  );

  const endTimer = useCallback(
    (id = 'default'): number => {
      if (!enableMetrics) return 0;

      const startTime = timersRef.current.get(id);
      if (startTime === undefined) return 0;

      const searchTime = performance.now() - startTime;
      timersRef.current.delete(id);

      setMetrics(prev => {
        const newMetrics = {
          searchTimes: [...prev.searchTimes, searchTime],
          totalSearches: prev.totalSearches + 1,
          slowSearches: prev.slowSearches + (searchTime > performanceThreshold ? 1 : 0),
        };

        if (logPerformance) {
          // eslint-disable-next-line no-console
          console.log(`Search completed in ${searchTime.toFixed(2)}ms`);
          if (searchTime > performanceThreshold) {
            console.warn(
              `Slow search detected: ${searchTime.toFixed(2)}ms (threshold: ${String(performanceThreshold)}ms)`
            );
          }
        }

        return newMetrics;
      });

      return searchTime;
    },
    [enableMetrics, logPerformance, performanceThreshold]
  );

  const getMetrics = useCallback(() => {
    const { searchTimes, totalSearches, slowSearches } = metrics;
    const averageSearchTime =
      searchTimes.length > 0
        ? searchTimes.reduce((sum, time) => sum + time, 0) / searchTimes.length
        : 0;

    const performanceScore =
      totalSearches > 0 ? Math.max(0, 100 - (slowSearches / totalSearches) * 100) : 100;

    return {
      averageSearchTime,
      totalSearches,
      slowSearches,
      performanceScore,
    };
  }, [metrics]);

  const resetMetrics = useCallback(() => {
    setMetrics({
      searchTimes: [],
      totalSearches: 0,
      slowSearches: 0,
    });
  }, []);

  return {
    startTimer,
    endTimer,
    getMetrics,
    resetMetrics,
  };
}
