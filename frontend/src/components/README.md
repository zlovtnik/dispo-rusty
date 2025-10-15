# Components Directory

This directory contains presentational and layout components that compose the UI for the multi-tenant dashboard. Components are written with React, TypeScript, Ant Design 5, and the FP-oriented patterns adopted across the project.

## Guidelines

- Prefer composition over inheritance; expose small, focused components that accept typed props.
- Keep side effects inside hooks; components should delegate network work to services/hooks.
- Use the `Result`-based error contracts when a component communicates with hooks or services.
- Co-locate component-specific styles (CSS modules or scoped styles) alongside the component file.
- Document complex interactions with short inline comments, and add usage notes to component-level JSDoc blocks.

## Key Components

| Component | Responsibility |
| --- | --- |
| `Layout.tsx` | Shell layout with navigation, sidebar, and responsive breakpoints. |
| `ErrorBoundary.tsx` | Captures runtime errors and renders resilient fallbacks. |
| `ConfirmationModal.tsx` | Generic confirmation dialog with typed callbacks. |
| `EnvironmentErrorUI.tsx` | Displays environment variable misconfiguration guidance. |
| `PrivateRoute.tsx` | Guards routes using the Result-based auth helpers. |

## Adding Components

1. Create a `.tsx` file with the component and typed props.
2. Add JSDoc to exported components describing the surface area and usage example.
3. If the component introduces complex behaviour, add a short README section or comment documenting the decision.
4. Update the table above when adding notable shared components.
