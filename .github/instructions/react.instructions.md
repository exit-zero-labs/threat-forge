---
applyTo: "src/**/*.{tsx,jsx}"
---

# React

Follow `AGENTS.md`; this file adds rules for React surfaces.

- Use function components and named exports.
- Use default exports only where a framework contract requires one.
- Use Zustand selectors and actions; never mutate store state directly.
- Keep document/canvas state in stores rather than duplicating it in components.
- Use typed service or adapter functions instead of raw Tauri IPC.
- Treat AI-rendered content as untrusted; do not use unsafe HTML.
- Use shadcn/ui and theme variables; preserve dark and light themes.
- Use accessible labels, roles, keyboard behavior, and focus management.
- Preserve loading, error, empty, disabled, and cancellation states.
- Add component tests for user-visible behavior and accessibility contracts.
