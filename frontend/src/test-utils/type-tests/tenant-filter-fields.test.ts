/**
 * Compile-time type test to ensure tenant filter fields stay in sync with BackendTenant type.
 * This file will fail to compile if the hardcoded validFields array in handlers.ts
 * doesn't match the keys of the BackendTenant type.
 *
 * If this test fails, update the validFields array in src/test-utils/mocks/handlers.ts
 * to match the current BackendTenant interface keys.
 */

import type { Tenant as BackendTenant } from '../../types/tenant';
import { VALID_TENANT_FIELDS } from '../mocks/handlers';

// Type that represents all keys of BackendTenant
type BackendTenantKeys = keyof BackendTenant;

// Type that represents the valid fields array
type ValidFieldsFromHandlers = (typeof VALID_TENANT_FIELDS)[number];

// This will cause a compile error if the arrays don't match
type AssertValidFieldsMatchBackendTenant = ValidFieldsFromHandlers extends BackendTenantKeys
  ? BackendTenantKeys extends ValidFieldsFromHandlers
    ? true
    : false
  : false;

// This assertion will fail at compile time if the types don't match exactly
const _typeAssertion: AssertValidFieldsMatchBackendTenant = true;

// Runtime test to double-check (this will also fail if types don't match)
function validateTenantFilterFields(): void {
  // Create a sample BackendTenant object and derive keys from it
  const sampleTenant: BackendTenant = {
    id: 'sample-id',
    name: 'sample-name',
    db_url: 'sample-db-url',
    created_at: 'sample-created-at',
    updated_at: 'sample-updated-at',
  };

  const backendTenantKeys = Object.keys(sampleTenant) as (keyof BackendTenant)[];

  // Check that all valid fields are present in BackendTenant
  for (const field of VALID_TENANT_FIELDS) {
    if (!backendTenantKeys.includes(field)) {
      throw new Error(`Field '${field}' is not a valid BackendTenant key`);
    }
  }

  // Check that all BackendTenant keys are present in valid fields
  for (const key of backendTenantKeys) {
    if (!VALID_TENANT_FIELDS.includes(key)) {
      throw new Error(`BackendTenant key '${key}' is missing from validFields array`);
    }
  }
}

// Export the validation function so it can be called in tests
export { validateTenantFilterFields };

import { test } from 'bun:test';
test('tenant filter fields align with BackendTenant keys (runtime)', () => {
  validateTenantFilterFields();
});
