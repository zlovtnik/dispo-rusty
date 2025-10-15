# Common Passwords List Migration Guide

## Overview

The common passwords list has been moved from hardcoded source code to a configurable external resource. This allows updates without code changes and provides better maintainability.

## File Structure

```
frontend/public/config/common-passwords.json  # Main password list (served from web root)
/frontend/src/config/commonPasswords.ts       # Configuration and fallback
/frontend/src/utils/commonPasswordsLoader.ts  # Loading logic
```

## Updating the Password List

### Method 1: Update the JSON File (Recommended)

1. **Edit the JSON file**: `frontend/public/config/common-passwords.json`
2. **Update metadata**:
   - Increment `version` (e.g., "1.0.0" → "1.0.1")
   - Update `lastUpdated` to current date
   - Update `description` if needed
3. **Add/remove passwords** in the `passwords` array
4. **Test the changes**:

   ```bash
   cd frontend
   bun run build
   bun test src/utils/__tests__/commonPasswordsLoader.test.ts
   ```

5. **Deploy**: The updated list will be served automatically

### Method 2: Use Environment Variable Override

Set `VITE_COMMON_PASSWORDS_URL` to point to an external JSON file:

```bash
# .env
VITE_COMMON_PASSWORDS_URL=https://cdn.example.com/common-passwords.json
```

### Method 3: Disable External Loading

Set in environment to use only fallback list:

```bash
# .env
VITE_COMMON_PASSWORDS_ENABLED=false
```

## JSON Schema

```typescript
{
  "version": "1.0.0",           // Semantic version
  "description": "Description", // Human-readable description
  "lastUpdated": "2025-01-01",  // ISO date string
  "source": "Source name",      // Where the data came from
  "passwords": [                // Array of password strings
    "password1",
    "password2"
  ]
}
```

## Validation Rules

- Passwords are normalized to lowercase
- Empty strings and non-string values are filtered out
- Duplicates are automatically removed
- Minimum 1 password required (falls back to built-in list if empty)

## Fallback Behavior

If external loading fails, the system falls back to a minimal built-in list:

```typescript
const COMMON_PASSWORDS_FALLBACK = [
  '123456', 'password', '123456789', '12345', '12345678',
  'qwerty', '111111', 'abc123', 'password1', 'letmein'
];
```

## Cache Behavior

- Passwords are cached in memory for 24 hours by default
- Cache can be configured via `cacheTtlMs` in config
- Use `CommonPasswordsLoader.getInstance().reload()` to force refresh

## Testing

Run the loader tests:

```bash
bun test src/utils/__tests__/commonPasswordsLoader.test.ts
```

## Migration Checklist

- [ ] Update `common-passwords.json` with new passwords
- [ ] Increment version number
- [ ] Update lastUpdated date
- [ ] Test loading and fallback behavior
- [ ] Verify password validation still works
- [ ] Deploy and monitor for issues

## Troubleshooting

### Passwords not loading

- Check browser network tab for failed requests
- Verify JSON syntax is valid
- Check CORS headers if using external URL

### Cache not updating

- Use browser dev tools to clear cache
- Call `loader.reload()` programmatically
- Check cache TTL settings

### Validation errors

- Ensure passwords array contains valid strings
- Check for JSON syntax errors
- Verify file is accessible at the configured path
