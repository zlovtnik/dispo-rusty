/**
 * Environment Variable Loader
 * This file is preloaded FIRST to ensure environment variables are available
 * before any other modules are loaded.
 *
 * Provides robust access to environment variables that works across different
 * runtime environments (Node.js, Bun, browser) without mutating global objects.
 */

// Robust environment variable accessor that handles synchronization
// between process.env and import.meta.env without mutation
export const getEnvVar = (key: string): string | undefined => {
  // In browser/Vite environment, prefer import.meta.env
  try {
    // Check if import.meta.env exists (browser/Vite)
    if ((globalThis as any).import?.meta?.env?.[key]) {
      return String((globalThis as any).import.meta.env[key]);
    }
  } catch {
    // import.meta not available, continue to process.env
  }

  // In Node.js/Bun environment, use process.env
  if (typeof process !== 'undefined' && process.env?.[key]) {
    return process.env[key];
  }

  return undefined;
};

// Ensure critical env vars are available - log warnings for mismatches
if (typeof process !== 'undefined') {
  const processValue = process.env.VITE_API_URL;
  let metaEnvValue: string | undefined;

  try {
    metaEnvValue = (globalThis as any).import?.meta?.env?.VITE_API_URL;
  } catch {
    metaEnvValue = undefined;
  }

  if (processValue !== undefined && metaEnvValue !== undefined && processValue !== metaEnvValue) {
    console.warn(
      `VITE_API_URL mismatch: process.env="${processValue}" vs import.meta.env="${metaEnvValue}". Using import.meta.env value.`
    );
  }
}

// Export commonly used environment variables for convenience
export const API_URL = getEnvVar('VITE_API_URL');
export const JWT_STORAGE_KEY = getEnvVar('VITE_JWT_STORAGE_KEY') || 'auth_token';
