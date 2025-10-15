/**
 * Domain Layer Public API
 *
 * Exports all domain logic and business rules for use throughout the application.
 * This follows the clean architecture principle of separating business logic
 * from infrastructure and UI concerns.
 */

// Authentication Domain
export * from './auth';

// Contact Management Domain
export * from './contacts';

// Tenant Management Domain
export * from './tenants';

// Business Rules (explicit exports to avoid conflicts)
export * as AuthRules from './rules/authRules';
export * as ContactRules from './rules/contactRules';
export * as TenantRules from './rules/tenantRules';
