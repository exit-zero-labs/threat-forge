# YAML File Format Rules

The `.thf` format is the product's primary moat. Treat it with extreme care.

## Schema Stability
- NEVER make breaking changes to the schema without a version bump and migration path.
- New fields must be optional with sensible defaults to maintain backward compatibility.
- The `version` field is always the first field under root. Currently `"1.0"`.
- Unknown fields are tolerated (no `deny_unknown_fields`) for forward compatibility.

## Structure

All data lives in a single `.thf` file — no sidecar files needed.

Layout data (positions, sizes, viewport, colors) is stored inline on each entity:
- `elements[].position` — `{x, y}` canvas position
- `trust_boundaries[].position` — `{x, y}` canvas position
- `trust_boundaries[].size` — `{width, height}` boundary dimensions
- `trust_boundaries[].fill_color`, `stroke_color`, `fill_opacity`, `stroke_opacity` — visual styling
- `data_flows[].label_offset` — `{x, y}` dragged label offset
- `diagrams[].viewport` — `{x, y, zoom}` canvas viewport

### Legacy sidecar format (deprecated)
Old models may still reference `.threatforge/layouts/*.json` via `diagrams[].layout_file`.
The Rust backend auto-migrates on open: reads the sidecar JSON and merges positions inline.
New saves always use inline positions and omit `layout_file`.

## Design Principles
- Everything about an entity lives in one place (inline positions, not a separate section).
- Each threat is a discrete YAML block — adding/removing threats produces clean diffs.
- Element IDs are kebab-case slugs: `api-gateway`, `payment-db`.
- Use YAML block scalars (`|`) for multi-line descriptions, not escaped strings.
- Order: `version` -> `metadata` -> `elements` -> `data_flows` -> `trust_boundaries` -> `threats` -> `diagrams`.
- All layout/visual fields are `Option<T>` — omitted when not set, keeping the YAML minimal.

## Validation
- Schema validation runs on every file load via serde deserialization.
- All `element` and `flow` references in threats must point to existing IDs.
- All `contains` references in trust boundaries must point to existing element IDs.
- Reject files with duplicate IDs within any section.
- Version check on load — reject unsupported versions with clear errors.

## Testing
- Every schema change needs a round-trip test: YAML -> Rust struct -> YAML -> assert equal.
- Maintain a set of sample `.thf` files in `tests/fixtures/` for regression testing.
- Test that git diffs for common operations (add element, add threat, reorder) are clean and minimal.
- Test backward compatibility: old YAML files without new fields must still parse correctly.
