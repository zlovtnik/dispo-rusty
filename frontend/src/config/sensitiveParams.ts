/**
 * Sensitive Query Parameters Configuration
 *
 * This module defines query parameter names that should be redacted or removed
 * from URLs when logging or displaying them to prevent exposure of sensitive
 * authentication tokens, API keys, passwords, and session information.
 */

/**
 * Default list of sensitive query parameter names that should be redacted
 * from URLs in logs and error messages.
 *
 * This is a readonly tuple type to ensure immutability while allowing
 * type-safe extensions and overrides.
 */
export const SENSITIVE_QUERY_PARAMS = [
  'token',
  'auth',
  'apikey',
  'api_key',
  'session',
  'sessionid',
  'pwd',
  'password',
  'access_token',
  'refresh_token',
  'id_token',
  'code',
  'secret',
  'client_secret',
  'client_id',
  'authorization',
  'auth_token',
] as const;

/**
 * Type definition for sensitive query parameter names.
 * This readonly tuple type ensures immutability and provides type safety.
 */
export type SensitiveQueryParam = (typeof SENSITIVE_QUERY_PARAMS)[number];

/**
 * Type for arrays of sensitive query parameter names.
 * Allows callers to extend or override the default list.
 */
export type SensitiveQueryParams = readonly string[];

/**
 * Configuration interface for customizing sensitive parameter detection.
 * Allows callers to provide their own list or extend the default one.
 */
export interface SensitiveParamsConfig {
  /** Custom list of sensitive parameter names. If provided, replaces the default list. */
  customParams?: readonly string[];
  /** Additional parameters to include alongside the default list. */
  additionalParams?: readonly string[];
}

/**
 * Gets the list of sensitive query parameters based on the provided configuration.
 *
 * **IMPORTANT: Case Sensitivity Requirements**
 * The returned list contains parameter names in lowercase. Callers MUST perform
 * case-insensitive matching when checking if a query parameter is sensitive.
 *
 * **Recommended approaches:**
 * 1. Normalize incoming query parameter names to lowercase before comparison
 * 2. Use a helper function that normalizes both the parameter name and the
 *    sensitive list for comparison
 *
 * **Example usage:**
 * ```typescript
 * const sensitiveParams = getSensitiveQueryParams();
 * const isSensitive = sensitiveParams.includes(paramName.toLowerCase());
 * ```
 *
 * **Alternative approach:**
 * If the project prefers to handle case variants in the configuration itself,
 * maintainers can add common case variants (e.g., 'Access_Token', 'ACCESS_TOKEN')
 * to the default list, but the primary solution is to document and implement
 * proper normalization behavior for consumers.
 *
 * @param config - Optional configuration for customizing the parameter list
 * @returns Array of sensitive parameter names (all lowercase)
 */
export function getSensitiveQueryParams(config?: SensitiveParamsConfig): readonly string[] {
  if (config?.customParams) {
    return config.customParams;
  }

  if (config?.additionalParams) {
    return [...SENSITIVE_QUERY_PARAMS, ...config.additionalParams];
  }

  return SENSITIVE_QUERY_PARAMS;
}
