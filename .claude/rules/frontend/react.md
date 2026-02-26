---
paths:
  - "src/**/*.tsx"
  - "src/**/*.ts"
---

# React & Frontend Rules

## Components
- Function components only. No class components.
- Named exports: `export function ThreatPanel() {}` not `export default`.
- One component per file. File name matches component: `threat-panel.tsx` exports `ThreatPanel`.
- Props interface named `{ComponentName}Props`: `interface ThreatPanelProps {}`.
- Colocate styles, tests, and types with the component when practical.

## State Management (Zustand)
- Stores live in `src/stores/`. One store per domain: `threat-model-store.ts`, `ui-store.ts`.
- Use Zustand selectors to prevent unnecessary re-renders: `useThreatModelStore(s => s.elements)`.
- Keep stores flat. Avoid deeply nested state objects.
- Derive computed values in selectors, not in store state.
- All state mutations go through store actions, never directly modify state.

## Tauri IPC
- Wrap `invoke()` calls in typed async functions in `src/lib/tauri-commands.ts`.
- Handle IPC errors gracefully — show user-friendly messages, not raw error strings.
- Use TypeScript generics for type-safe invoke: `invoke<ThreatModel>("load_model", { path })`.

## ReactFlow / Diagramming
- Custom node types in `src/components/canvas/nodes/`.
- Custom edge types in `src/components/canvas/edges/`.
- Keep ReactFlow state synced with Zustand store (single source of truth is the store).
- Node type constants in `src/types/diagram-types.ts`.

## Styling (Tailwind + shadcn/ui)
- Use shadcn/ui components as the base. Customize via Tailwind classes.
- Dark mode support required on all new UI. Use `dark:` variants.
- Use CSS variables from shadcn theme for colors — don't hardcode hex values.
- Responsive layout not required (desktop app), but maintain consistent spacing.

## Performance
- Memoize expensive computations with `useMemo`. Memoize callbacks with `useCallback` only when passed to memoized children.
- Virtualize long lists (100+ items) using `@tanstack/react-virtual` or similar.
- Lazy-load non-critical panels (AI chat, settings) with `React.lazy()`.
