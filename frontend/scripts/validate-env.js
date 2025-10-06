#!/usr/bin/env node

/**
 * Environment Variable Validation Script
 *
 * This script validates critical environment variables required for the build process.
 * It ensures that production builds don't fail due to missing required variables.
 */

const fs = require('fs');
const path = require('path');

// Load environment variables from .env files
require('dotenv').config({ path: path.resolve(__dirname, '../.env.production') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env.development') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

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
  } catch (_) {
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
