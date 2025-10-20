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
    if (typeof import.meta !== 'undefined' && import.meta.env && key in import.meta.env) {
      const raw = import.meta.env[key];
      if (raw !== undefined && raw !== null) {
        return String(raw);
      }
      return undefined;
    }
  } catch {
    // import.meta not available, continue to process.env
  }

  // In Node.js/Bun environment, use process.env
  if (typeof process !== 'undefined' && process.env && key in process.env) {
    return process.env[key];
  }

  return undefined;
};

// Critical environment variables that need mismatch checking
const criticalVars = ['VITE_API_URL', 'VITE_JWT_STORAGE_KEY'];

// Optional debug environment variables
// VITE_DEBUG_ADDRESS_PARSING: Set to 'true' to enable address parsing warnings in production

// Ensure critical env vars are available - log warnings for mismatches
if (typeof process !== 'undefined') {
  criticalVars.forEach(varName => {
    const processValue = process.env[varName];
    let metaEnvValue: string | undefined;

    try {
      if (typeof import.meta !== 'undefined') {
        metaEnvValue = import.meta.env[varName];
      }
    } catch {
      metaEnvValue = undefined;
    }

    if (processValue !== undefined && metaEnvValue !== undefined && processValue !== metaEnvValue) {
      console.warn(
        `${varName} mismatch: process.env="${processValue}" vs import.meta.env="${metaEnvValue}". Using import.meta.env value.`
      );
    }
  });
}

// Export commonly used environment variables for convenience
export const API_URL = getEnvVar('VITE_API_URL');
export const JWT_STORAGE_KEY = getEnvVar('VITE_JWT_STORAGE_KEY') ?? 'auth_token';
