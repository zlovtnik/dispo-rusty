#!/usr/bin/env node

/**
 * Environment Variable Validation Script
 *
 * This script validates critical environment variables required for the build process.
 * It ensures that production builds don't fail due to missing required variables.
 * 
 * Mimics Vite's environment file loading behavior:
 * 1. Load .env (base configuration)
 * 2. Load .env.local (local overrides)
 * 3. Load .env.{NODE_ENV} (environment-specific)
 * 4. Load .env.{NODE_ENV}.local (local overrides)
 * 
 * Later files override earlier ones, and we only load files for the current NODE_ENV.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Determine the current environment
const NODE_ENV = process.env.NODE_ENV || 'development';

console.log(`📦 Environment: ${NODE_ENV}\n`);

// Simple .env parser to replace dotenv.parse
function parseEnv(content) {
  const parsed = {};
  content.split('\n').forEach(line => {
    line = line.trim();
    if (line && !line.startsWith('#')) {
      const [key, ...valueParts] = line.split('=');
      if (key) {
        parsed[key] = valueParts.join('=');
      }
    }
  });
  return parsed;
}

// Manually load .env files for validation (Bun auto-loads them in runtime)
function loadEnvFile(filePath, description) {
  if (existsSync(filePath)) {
    console.log(`📄 Loading: ${description}`);
    const content = readFileSync(filePath, 'utf-8');
    const parsed = parseEnv(content);
    // Assign parsed values to process.env, allowing later files to override earlier ones
    Object.assign(process.env, parsed);
  }
}

// Load environment variables in Vite's priority order
// Later files override earlier ones
loadEnvFile(resolve(__dirname, '../.env'), '.env (base)');
loadEnvFile(resolve(__dirname, '../.env.local'), '.env.local (local overrides)');
loadEnvFile(resolve(__dirname, `../.env.${NODE_ENV}`), `.env.${NODE_ENV} (environment-specific)`);
loadEnvFile(resolve(__dirname, `../.env.${NODE_ENV}.local`), `.env.${NODE_ENV}.local (local overrides)`);

console.log();

// Required environment variables for build
const requiredVars = {
  VITE_API_URL: process.env.VITE_API_URL,
};

// Optional environment variables (with validation if present)
const optionalVars = {
  VITE_DEBUG: process.env.VITE_DEBUG,
  NODE_ENV: process.env.NODE_ENV,
};

let hasErrors = false;
const errors = [];
const warnings = [];

console.log('🔍 Validating environment variables...\n');

// Validate required variables
Object.entries(requiredVars).forEach(([key, value]) => {
  if (!value || value.trim() === '') {
    hasErrors = true;
    errors.push(`❌ REQUIRED: ${key} is not set or is empty`);
  } else if (key === 'VITE_API_URL' && !isValidUrl(value)) {
    hasErrors = true;
    errors.push(`❌ INVALID: ${key} must be a valid URL (got: ${value})`);
  } else {
    console.log(`✅ ${key}: ${value}`);
  }
});

// Validate optional variables
Object.entries(optionalVars).forEach(([key, value]) => {
  if (value !== undefined && value.trim() !== '') {
    if (key === 'VITE_DEBUG' && !isValidBoolean(value)) {
      warnings.push(`⚠️  WARNING: ${key} should be 'true' or 'false' (got: ${value})`);
    } else if (key === 'NODE_ENV' && !isValidNodeEnv(value)) {
      warnings.push(`⚠️  WARNING: ${key} should be 'development', 'production', or 'test' (got: ${value})`);
    } else {
      console.log(`✅ ${key}: ${value}`);
    }
  }
});

// Helper functions
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch {
    // URL constructor throws if string is not a valid URL - we don't need the error details
    return false;
  }
}

function isValidBoolean(string) {
  return string.toLowerCase() === 'true' || string.toLowerCase() === 'false';
}

function isValidNodeEnv(string) {
  return ['development', 'production', 'test'].includes(string.toLowerCase());
}

// Output results
if (errors.length > 0) {
  console.error('\n🚫 Environment validation FAILED:');
  errors.forEach(error => console.error(`   ${error}`));
  process.exit(1);
}

if (warnings.length > 0) {
  console.warn('\n⚠️  Environment validation completed with warnings:');
  warnings.forEach(warning => console.warn(`   ${warning}`));
  console.log('\n⚠️  Build proceeding despite warnings...\n');
}

console.log('\n🎉 Environment validation PASSED!\n');

// Exit successfully
process.exit(0);
