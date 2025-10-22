# Phase 10: Bundle Optimization Guide

## Overview

This document describes the bundle optimization strategies implemented in Phase 10 to minimize bundle size and improve application load performance. The project uses code splitting, lazy loading, tree-shaking, and FP utility memoization to achieve optimal bundle sizes.

## Current Bundle Configuration

### Manual Code Splitting

The `vite.config.ts` is configured with manual chunks to separate code into logical, cacheable units:

```typescript
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        vendor: ['react', 'react-dom'],
        antd: ['antd', '@ant-design/icons'],
        router: ['react-router-dom'],
      },
    },
  },
},
```

### Chunk Responsibilities

| Chunk | Contents | Purpose | Size Target |
|-------|----------|---------|-------------|
| vendor | React, React DOM | Core UI runtime | <80KB gzipped |
| antd | Ant Design, icons | UI components | <200KB gzipped |
| router | React Router DOM | Routing logic | <40KB gzipped |
| main | Application code | Feature implementation | <150KB gzipped |

## Lazy Loading Strategy

### Route-Based Code Splitting

Pages are loaded dynamically when navigated to, reducing initial bundle:

```typescript
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Loading } from '@/components/Loading';

const HomePage = lazy(() => import('@/pages/HomePage'));
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const AddressBookPage = lazy(() => import('@/pages/AddressBookPage'));
const TenantsPage = lazy(() => import('@/pages/TenantsPage'));

export const AppRoutes = () => (
  <BrowserRouter>
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/address-book" element={<AddressBookPage />} />
        <Route path="/tenants" element={<TenantsPage />} />
      </Routes>
    </Suspense>
  </BrowserRouter>
);
```

### Component-Level Lazy Loading

For large components, use lazy imports conditionally:

```typescript
// Lazy load heavy modal or detailed view
const DetailedContactModal = lazy(() => import('./DetailedContactModal'));
const AdvancedSearchPanel = lazy(() => import('./AdvancedSearchPanel'));

// Use with Suspense
<Suspense fallback={<Skeleton />}>
  <DetailedContactModal />
</Suspense>
```

## Tree-Shaking Unused Code

### Strategy 1: Named Exports

Always use named exports to enable selective imports:

```typescript
// ✅ CORRECT - Tree-shakeable
export function memoize<T, R>(fn: (args: T) => R) { ... }
export function debounce<T, R>(fn: (args: T) => R) { ... }
export function throttle<T, R>(fn: (args: T) => R) { ... }

// Then import only what's needed:
import { memoize } from '@/utils/memoization';
// unused debounce and throttle are tree-shaken

// ❌ WRONG - Not tree-shakeable
export default {
  memoize,
  debounce,
  throttle,
};
```

### Strategy 2: Selective Imports

Be specific when importing from libraries:

```typescript
// ✅ CORRECT - Only needed utilities included
import { pipe } from 'fp-ts/function';
import { memoize, memoizeResult } from '@/utils/memoization';

// ❌ WRONG - Imports entire module
import * as utils from '@/utils';
import * as fp from 'fp-ts';
```

### Strategy 3: Ant Design Component Imports

Always import components directly, not from the main package:

```typescript
// ✅ CORRECT - Only Button included
import { Button } from 'antd';
import { UserOutlined } from '@ant-design/icons';

// ❌ WRONG - Entire antd included
import * as antd from 'antd';
```

## Performance Utilities Tree-Shaking

### Memoization Module (`src/utils/memoization.ts`)

The memoization module exports specialized functions that tree-shake independently:

```typescript
// Only memoize function is included if this is all you import
import { memoize } from '@/utils/memoization';

// If you only need validator memoization, debounce and throttle are excluded
import { memoizeValidator } from '@/utils/memoization';

// Multiple imports share the base infrastructure
import { memoize, memoizeResult, debounce } from '@/utils/memoization';
```

**Benefits:**

- Unused memoization patterns don't inflate bundle
- Each feature loads only required utilities
- LRU cache infrastructure shared across all memoization functions

### Lazy Evaluation Module (`src/utils/lazy.ts`)

Lazy evaluation utilities are tree-shaken based on actual usage:

```typescript
// Only Lazy class and factory included
import { Lazy, lazy } from '@/utils/lazy';

// Generators, batchers, deferred execution excluded if not used
import { streamResults, LazyBatcher } from '@/utils/lazy';

// Mix and match - only imported utilities included
import { LazyResult, Deferred, defer } from '@/utils/lazy';
```

**Benefits:**

- Advanced features don't penalize simpler use cases
- Each Lazy variant is independently evaluated
- Generator-based streaming only included if used

### React Memoization Module (`src/utils/reactMemoization.ts`)

React-specific HOCs tree-shake selectively:

```typescript
// Only memoizeComponent HOC included
import { memoizeComponent } from '@/utils/reactMemoization';

// Selector, boundary, and debounce wrappers excluded if not used
import { createSelector, createMemoizationBoundary } from '@/utils/reactMemoization';

// Helper functions included only with their consumers
import { createCallbackFactory, createOptimizedComponent } from '@/utils/reactMemoization';
```

**Benefits:**

- Only used patterns are included
- Advanced patterns don't impact simple memoization
- Isolation and resetting utilities excluded if unused

## CSS Optimization

### Tailwind CSS Purging

Tailwind is configured to remove unused styles:

```javascript
// tailwind.config.ts
export default {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    './index.html',
  ],
  // ... rest of config
};
```

**How it works:**

1. Tailwind scans all source files
2. Identifies used utility classes: `className="p-4 text-blue-500 flex"`
3. Includes only those in final CSS
4. Unused utilities like `mt-96`, `bg-red-900` are excluded

### Ant Design CSS Optimization

Only Ant Design components actually used include their styles:

## Measuring Bundle Size

### Build and Analyze

```bash
# Build for production
bun run build

# Check output directory
ls -lh dist/

# Analyze individual chunks
du -sh dist/assets/*.js
```

### Expected Output

```text
dist/
├── index.html                          (~2KB)
├── _redirects                          (~0.1KB)
├── manifest.json                       (~1KB)
└── assets/
    ├── vendor-HASH.js                  (~80-100KB gzipped)
    ├── antd-HASH.js                    (~150-200KB gzipped)
    ├── router-HASH.js                  (~20-40KB gzipped)
    ├── index-HASH.js                   (~100-150KB gzipped)
    ├── HomePage-HASH.js                (~10-20KB gzipped)
    ├── LoginPage-HASH.js               (~15-25KB gzipped)
    ├── AddressBookPage-HASH.js         (~20-30KB gzipped)
    ├── index-HASH.css                  (~30-50KB gzipped)
    └── ...
```

### Metrics to Track

| Metric | Target | Note |
|--------|--------|------|
| vendor chunk | <100KB | React + ReactDOM |
| antd chunk | <200KB | UI library |
| main bundle | <150KB | App code |
| total JS | <500KB | All scripts gzipped |
| total CSS | <50KB | Styles gzipped |
| initial load | <1.5s | All critical resources |

## Optimization Checklist

Before each release, verify:

- [ ] Manual chunks configured in `vite.config.ts`
- [ ] Pages use `React.lazy()` for route splitting
- [ ] No circular dependencies in imports
- [ ] No unused imports (run `bun run lint`)
- [ ] Ant Design components imported individually
- [ ] FP utilities imported selectively
- [ ] CSS tree-shaken by Tailwind (check `dist/index-*.css`)
- [ ] Assets optimized and compressed
- [ ] `bun run build` completes without warnings
- [ ] Production build has source maps disabled
- [ ] No `console.log()` statements in production code
- [ ] Bundle size within targets (verify with `du -sh dist/`)

## Verification Commands

```bash
# Type checking
bun run type-check

# Linting (catches unused imports)
bun run lint

# Full test suite
bun run test

# Production build with analysis
bun run build

# Check bundle statistics
bun run build -- --profile

# Check for dead code
grep -r "TODO\|FIXME\|HACK\|XXX" src/
```

## Advanced: Bundle Visualizer

To visualize bundle composition, install and configure `rollup-plugin-visualizer`:

```bash
bun add -D rollup-plugin-visualizer
```

Then add to `vite.config.ts`:

```typescript
import { visualizer } from 'rollup-plugin-visualizer';

export default {
  plugins: [
    // ... other plugins
    visualizer({
      open: true,
      gzipSize: true,
      brotliSize: true,
    }),
  ],
};
```

Run `bun run build` to generate interactive visualization.

## Performance Monitoring

After deployment, monitor these metrics using Lighthouse or similar tools:

- **First Contentful Paint (FCP)**: Target <2.0s
- **Largest Contentful Paint (LCP)**: Target <2.5s
- **Cumulative Layout Shift (CLS)**: Target <0.1
- **Time to Interactive (TTI)**: Target <3.5s

Use Chrome DevTools Performance tab to identify bottlenecks.

## Future Optimizations

Potential improvements for future phases:

1. **Request blocking reduction** - Minimize render-blocking resources
2. **HTTP/2 Push** - Proactively push critical assets to client
3. **Service Worker caching** - Cache vendor chunks aggressively
4. **Code generation** - Generate minimal Zod validators
5. **Web Workers** - Offload heavy computations
6. **Dynamic route prefetching** - Prefetch likely next routes
7. **Component preloading** - Preload components on hover

---

**Phase 10 Complete**: Bundle optimization strategies documented and configured for optimal performance with minimal bundle size.
