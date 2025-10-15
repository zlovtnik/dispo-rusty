/**
 * Environment Variable Loader
 * This file is preloaded FIRST to ensure environment variables are available
 * before any other modules are loaded.
 * 
 * In Bun test mode, import.meta.env is not automatically populated from .env files.
 * We need to ensure it's available for tests that need VITE_API_URL.
 */

// Make sure critical env vars are available
console.log('[loadenv] VITE_API_URL from process.env:', process.env.VITE_API_URL);
console.log('[loadenv] import.meta.env.VITE_API_URL:', import.meta.env.VITE_API_URL);
