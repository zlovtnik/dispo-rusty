# Pages Directory

The pages folder aggregates route-level components that assemble domain logic, hooks, and shared UI elements. Each page focuses on orchestrating data flows while delegating state management to hooks and domain modules.

## Structure

- `*.tsx` files correspond to routed screens referenced by the React Router configuration.
- The `__tests__/` folder contains render tests and scenario-based coverage for page-level flows.
- FP utilities (`Result`, `Option`) should be used to model async state transitions inside pages.

## Authoring Guidelines

1. Import data through services or hooks; never instantiate fetch logic inline.
2. Keep form logic inside `useFormValidation` or domain-specific hooks.
3. Use Ant Design components for layout and interactions; apply custom styling sparingly.
4. Document exported pages with a JSDoc block summarising the flow and linking to relevant domain modules.
5. Add inline comments when coordinating complex multi-step flows (e.g., optimistic updates).

## Available Pages

| Page                  | Summary                                                             |
| --------------------- | ------------------------------------------------------------------- |
| `HomePage.tsx`        | Entry point with quick navigation shortcuts.                        |
| `DashboardPage.tsx`   | Tenant-aware KPIs and system status widgets.                        |
| `AddressBookPage.tsx` | CRUD operations for contacts using the Result-based service layer.  |
| `TenantsPage.tsx`     | Administrative tenant management interface.                         |
| `LoginPage.tsx`       | Legacy login flow kept for reference while FP migration completes.  |
| `LoginPage.fp.tsx`    | Current FP-first login experience with railway-oriented validation. |

Keep this document up to date when adding or removing pages.
