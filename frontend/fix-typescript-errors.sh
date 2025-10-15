#!/bin/bash

# Script to automatically fix common TypeScript/ESLint errors
# Run from the frontend directory

set -e

echo "🔧 Fixing TypeScript/ESLint errors..."

# Fix deprecated Zod APIs
echo "📦 Fixing deprecated Zod APIs..."
find src -type f -name "*.ts" -o -name "*.tsx" | xargs sed -i '' \
  -e 's/ZodSchema/ZodType/g'

# Prefix unused variables with underscore
echo "🚫 Prefixing unused variables..."
# This is complex and needs manual intervention, skipping automatic fix

# Fix template literal number issues by adding .toString()
echo "🔢 Template literal fixes would require AST transformation..."

echo "✅ Basic automatic fixes applied!"
echo "⚠️  Run 'bun run lint:fix' to fix auto-fixable issues"
echo "⚠️  Remaining issues need manual intervention"
