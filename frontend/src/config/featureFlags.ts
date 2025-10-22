/**
 * @module config/featureFlags
 * @description Feature flags for gradual FP pattern migration
 *
 * Allows running both old and new FP-based implementations in parallel
 * for safer migration and A/B testing.
 */

export interface FeatureFlags {
  /** Use FP-based AuthContext instead of traditional imperative version */
  useFPAuth: boolean;
  /** Use FP patterns in service layer */
  useFPServices: boolean;
  /** Use FP patterns in React hooks */
  useFPHooks: boolean;
  /** Enable verbose logging for FP operations */
  verboseFPLogging: boolean;
}

/**
 * Default feature flag configuration
 * Start with new FP features disabled to ensure backward compatibility
 */
const DEFAULT_FLAGS: FeatureFlags = {
  useFPAuth: false,
  useFPServices: false,
  useFPHooks: false,
  verboseFPLogging: false,
};

/**
 * Load feature flags from environment or localStorage
 */
function loadFeatureFlags(): FeatureFlags {
  // Check environment variables first (prefixed with VITE_)
  const envFlags: Partial<FeatureFlags> = {
    useFPAuth: import.meta.env.VITE_USE_FP_AUTH === 'true',
    useFPServices: import.meta.env.VITE_USE_FP_SERVICES === 'true',
    useFPHooks: import.meta.env.VITE_USE_FP_HOOKS === 'true',
    verboseFPLogging: import.meta.env.VITE_VERBOSE_FP_LOGGING === 'true',
  };

  // Allow localStorage override for testing
  let storageFlags: Partial<FeatureFlags> = {};
  try {
  try {
    const stored = localStorage.getItem('featureFlags');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        storageFlags = parsed as Partial<FeatureFlags>;
      } else {
        console.warn('Ignoring invalid feature flags payload in localStorage', parsed);
      }
    }
  } catch (error) {
    console.warn('Failed to load feature flags from localStorage', error);
  }

  return {
    ...DEFAULT_FLAGS,
    ...envFlags,
    ...storageFlags,
  };
}

let cachedFlags: FeatureFlags | null = null;

/**
 * Get current feature flags
 * Results are cached per session but can be refreshed
 *
 * @param refresh - Force reload from source
 * @returns Current feature flags
 */
export function getFeatureFlags(refresh = false): FeatureFlags {
  if (cachedFlags === null || refresh) {
    cachedFlags = loadFeatureFlags();

    if (cachedFlags.verboseFPLogging) {
      console.debug('[FP] Feature flags loaded:', cachedFlags);
    }
  }

  return cachedFlags;
}

/**
 * Update feature flags at runtime (for testing/debugging)
 * Changes are persisted to localStorage
 *
 * @param updates - Partial flags to update
 */
export function updateFeatureFlags(updates: Partial<FeatureFlags>): void {
  const current = getFeatureFlags();
  const updated = { ...current, ...updates };

export function updateFeatureFlags(updates: Partial<FeatureFlags>): void {
  const current = getFeatureFlags();
  const updated = { ...current, ...updates };

  cachedFlags = updated;

  try {
    localStorage.setItem('featureFlags', JSON.stringify(updated));
    console.info('[FP] Feature flags updated:', updated);
  } catch (error) {
    console.error('Failed to update feature flags', error);
  }
}
}

/**
 * Reset feature flags to default/environment values
 */
export function resetFeatureFlags(): void {
  // Always clear the in-memory cache first
  cachedFlags = null;

  try {
    // Then attempt to clear persisted storage
    localStorage.removeItem('featureFlags');
  } catch (error) {
    console.error('Failed to reset feature flags', error);
  }
}
}

/**
 * Check if a specific feature flag is enabled
 *
 * @param flagName - Name of the flag to check
 * @returns Whether the flag is enabled
 */
export function isFeatureEnabled(flagName: keyof FeatureFlags): boolean {
  return getFeatureFlags()[flagName];
}
