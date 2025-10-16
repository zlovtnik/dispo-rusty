/**
 * Environment Variable Loader
 * This file is preloaded FIRST to ensure environment variables are available
 * before any other modules are loaded.
 * 
 * In Bun test mode, import.meta.env is not automatically populated from .env files.
 * We need to ensure it's available for tests that need VITE_API_URL.
 */

// Ensure critical env vars are synced between process.env and import.meta.env
if (typeof process !== 'undefined') {
  const processValue = process.env.VITE_API_URL;
  const metaEnvValue = (import.meta.env as Record<string, unknown>).VITE_API_URL;

  // If one is defined but not the other, copy it over
  if (processValue !== undefined && metaEnvValue === undefined) {
    (import.meta.env as Record<string, unknown>).VITE_API_URL = processValue;
  } else if (metaEnvValue !== undefined && processValue === undefined) {
    process.env.VITE_API_URL = String(metaEnvValue);
  }
}
