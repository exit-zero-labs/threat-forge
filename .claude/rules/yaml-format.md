# YAML File Format Rules

The `.threatforge.yaml` format is the product's primary moat. Treat it with extreme care.

## Schema Stability
- NEVER make breaking changes to the schema without a version bump and migration path.
- New fields must be optional with sensible defaults to maintain backward compatibility.
- The `version` field is always the first field under root. Currently `"1.0"`.

## Structure
```
.threatforge.yaml          # Main threat model (elements, flows, boundaries, threats, metadata)
.threatforge/
  layouts/
    {diagram-id}.json      # Canvas layout data (positions, zoom, viewport)
```

## Design Principles
- Layout data (x/y positions, zoom, viewport) goes in `.threatforge/layouts/`, NOT in the YAML.
- Each threat is a discrete YAML block — adding/removing threats produces clean diffs.
- Element IDs are kebab-case slugs: `api-gateway`, `payment-db`.
- Use YAML block scalars (`|`) for multi-line descriptions, not escaped strings.
- Order: `version` -> `metadata` -> `elements` -> `data_flows` -> `trust_boundaries` -> `threats` -> `diagrams`.

## Validation
- Schema validation runs on every file load via serde strict deserialization.
- All `element` and `flow` references in threats must point to existing IDs.
- All `contains` references in trust boundaries must point to existing element IDs.
- Reject files with duplicate IDs within any section.

## Testing
- Every schema change needs a round-trip test: YAML -> Rust struct -> YAML -> assert equal.
- Maintain a set of sample `.threatforge.yaml` files in `tests/fixtures/` for regression testing.
- Test that git diffs for common operations (add element, add threat, reorder) are clean and minimal.
