---
applyTo: "**/*.{json,jsonc,toml,yml,yaml,thf},src-tauri/src/{models,file_io,importers}/**,src/types/threat-model.ts,src/lib/export/**"
---

# File formats

Follow `AGENTS.md`; this file adds schema, import, export, and configuration rules.

- Treat the documented schema and version as the source of truth.
- Keep `.thf` parsing backward-compatible; breaking changes require explicit migration and a
  version bump.
- Preserve the deprecated `diagrams[].layout_file` migration path: old sidecar JSON is merged
  into inline layout on open, while new saves omit the sidecar reference.
- Tolerate unknown `.thf` fields for forward compatibility, but do not claim generic preservation
  when a serializer intentionally discards unknown configuration fields.
- Preserve canonical field and section ordering and omit unset optional values.
- Add round-trip, golden, backward-compatibility, malformed-input, and migration tests as relevant.
- Never hand-edit generated lockfiles or generated schema output; use the owning tool.
- Invoke `threat-model-expert` for `.thf`, STRIDE, threat generation, or migration changes.
