/**
 * Robust unique ID generator with multiple fallback strategies
 *
 * This utility provides a reliable way to generate unique IDs that:
 * - Uses crypto.randomUUID() when available (modern browsers)
 * - Falls back to a local incrementing counter with timestamp
 * - Ensures no collisions even with rapid successive calls
 */

/**
 * Creates a unique ID generator with fallback strategies
 * @returns A function that generates unique IDs
 */
export const createUniqueIdGenerator = () => {
  let counter = 0;

  return (): string => {
    // Primary: Use crypto.randomUUID() if available (modern browsers)
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }

    // Fallback: Combine timestamp with incrementing counter
    // This ensures uniqueness even with rapid successive calls
    const timestamp = Date.now();
    const increment = ++counter;

    // Use a combination that's highly unlikely to collide
    return `${timestamp}-${increment}-${Math.random().toString(36).substring(2, 15)}`;
  };
};

/**
 * Global unique ID generator instance
 * Use this for most cases where you need unique IDs
 */
export const generateUniqueId = createUniqueIdGenerator();

/**
 * Creates a scoped unique ID generator with a prefix
 * Useful when you need IDs for specific contexts (e.g., "filter-", "component-")
 * @param prefix - The prefix to use for generated IDs
 * @returns A function that generates unique IDs with the given prefix
 */
export const createScopedIdGenerator = (prefix: string) => {
  const generator = createUniqueIdGenerator();

  return (): string => {
    return `${prefix}${generator()}`;
  };
};

/**
 * Test function to verify unique ID generation
 * @param count - Number of IDs to generate for testing
 * @returns Array of generated IDs
 */
export const testUniqueIdGeneration = (count = 1000): string[] => {
  const ids = new Set<string>();
  const generator = createUniqueIdGenerator();

  for (let i = 0; i < count; i++) {
    const id = generator();
    if (ids.has(id)) {
      throw new Error(`Collision detected at iteration ${i}: ${id}`);
    }
    ids.add(id);
  }

  return Array.from(ids);
};
