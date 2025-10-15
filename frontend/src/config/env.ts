/**
 * Environment Configuration and Validation Utility
 *
 * This module provides type-safe access to environment variables and
 * validates that all required variables are present at runtime.
 */

interface EnvConfig {
  apiUrl: string;
  appName: string;
  jwtStorageKey: string;
  isDebug: boolean;
  isDevelopment: boolean;
  isProduction: boolean;
  defaultCountry: string;
  enablePwnedPasswordCheck: boolean;
}

class EnvironmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvironmentError';
  }
}

/**
 * Validates that a required environment variable is present
 */
function getRequiredEnv(key: string): string {
  const value = import.meta.env[key as keyof ImportMetaEnv];

  if (!value || (typeof value === 'string' && value.trim() === '')) {
    throw new EnvironmentError(
      `Missing required environment variable: ${key}\n\n` +
        `Please ensure ${key} is set in your .env file.\n` +
        `See .env.example for reference.`
    );
  }

  return String(value);
}

/**
 * Gets an optional environment variable with a default value
 */
function getOptionalEnv(key: string, defaultValue: string): string {
  const value = import.meta.env[key as keyof ImportMetaEnv];
  return value ? String(value) : defaultValue;
}

/**
 * Validates URL format
 */
function validateUrl(url: string, varName: string): string {
  try {
    new URL(url);
    return url;
  } catch {
    throw new EnvironmentError(
      `Invalid URL for ${varName}: ${url}\n\n` +
        `Please provide a valid URL (e.g., http://localhost:8000/api)`
    );
  }
}

/**
 * Validates and returns the environment configuration
 * Throws EnvironmentError if validation fails
 */
export function getEnvConfig(): EnvConfig {
  try {
    const apiUrl = getRequiredEnv('VITE_API_URL');
    validateUrl(apiUrl, 'VITE_API_URL');

    const rawDefaultCountry = getOptionalEnv('VITE_DEFAULT_COUNTRY', '');
    const defaultCountry = typeof rawDefaultCountry === 'string' ? rawDefaultCountry.trim() : '';
    const passwordCheckDefault = import.meta.env.MODE === 'production' ? 'true' : 'false';
    const enablePwnedPasswordCheck =
      getOptionalEnv('VITE_ENABLE_PWNED_PASSWORD_CHECK', passwordCheckDefault).toLowerCase() ===
      'true';

    return {
      apiUrl,
      appName: getOptionalEnv('VITE_APP_NAME', 'Actix Web REST API'),
      jwtStorageKey: getOptionalEnv('VITE_JWT_STORAGE_KEY', 'auth_token'),
      isDebug: getOptionalEnv('VITE_DEBUG', 'false').toLowerCase() === 'true',
      isDevelopment: import.meta.env.MODE === 'development',
      isProduction: import.meta.env.MODE === 'production',
      defaultCountry,
      enablePwnedPasswordCheck,
    };
  } catch (error) {
    if (error instanceof EnvironmentError) {
      // Re-throw with additional context
      throw error;
    }
    // Wrap unexpected errors
    throw new EnvironmentError(
      `Failed to load environment configuration: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Singleton instance of the environment configuration
 * Validates on first access
 */
let envConfig: EnvConfig | null = null;

export function getEnv(): EnvConfig {
  envConfig ??= getEnvConfig();
  return envConfig;
}

/**
 * Export for testing or explicit validation
 */
export { EnvironmentError };

/**
 * Default export for convenience
 */
export default getEnv;
