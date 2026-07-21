# ThreatForge — `.thf` File Format

The `.thf` file format is ThreatForge's primary differentiator. It is the product's moat.

## Design Principles

1. **Human-readable** when opened in any text editor
2. **Minimal, clean diffs** when tracked in git
3. **Schema-validated** for tooling interoperability
4. **Single-file** — all data lives in one `.thf` file, no sidecars needed

## Schema Structure

All data lives in a single `.thf` YAML file:

```
version → metadata → layers → groups → elements → data_flows → relationships
        → trust_boundaries → threats → diagrams
```

| Section | Purpose |
|---------|---------|
| `version` | Schema version (currently `"1.0"`). Always first field. |
| `metadata` | Title, author, dates, description, authoring info |
| `layers` | Optional architecture layers; display order is array order |
| `groups` | Optional architecture containers; may nest via `parent` |
| `elements` | DFD nodes: processes, data stores, external entities, text annotations |
| `data_flows` | Connections between elements with protocol and data info |
| `relationships` | Optional non-data architecture edges (`deploys_to`, `depends_on`, …) |
| `trust_boundaries` | Security boundary groups containing elements |
| `threats` | STRIDE threats linked to elements/flows |
| `diagrams` | Diagram definitions with viewport state |

### Architecture sections and threat analysis

The architecture sections are an overlay on the threat model, and four rules keep
the two coherent:

- **Membership is element-side.** An element opts into a layer or group through
  `elements[].layer` / `elements[].group`; `trust_boundaries` remain the only
  container-side membership (`contains`). Both references are validated on read.
- **Relationship endpoints are element IDs only**, matching `data_flows`. A typed
  edge to a group or layer is not representable today; supporting it would be an
  additive schema change.
- **Relationships are never STRIDE-analyzed.** They are non-data edges, and
  running flow-targeted rules over them would manufacture tampering and
  information-disclosure findings on edges that carry no data. Pinned by
  `architecture_sections_do_not_change_stride_output` (Rust) and its
  `stride-engine.test.ts` mirror.
- **Threats attach to `element` or `flow` only.** A threat on a group or layer
  would be ambiguous — all members, or the container? — so the schema does not
  allow it.

`metadata.threat_analysis_enabled` is tri-state and resolves as: `true`/`false`
when present; when absent, a document is treated as threat-analysis-enabled iff
it has any `threats`. Nothing gates on the field yet — the resolution helper
ships with the workflow work in #58, and both language implementations must
follow this rule.

### Layout Data

Layout data (positions, sizes, colors, viewport) is stored **inline** on each entity:

- `elements[].position` — `{x, y}` canvas position
- `trust_boundaries[].position` — `{x, y}` canvas position
- `trust_boundaries[].size` — `{width, height}` boundary dimensions
- `trust_boundaries[].fill_color`, `stroke_color`, `fill_opacity`, `stroke_opacity` — visual styling
- `data_flows[].label_offset` — `{x, y}` dragged label offset
- `data_flows[].source_handle`, `target_handle` — connection point handles
- `data_flows[].stroke_color`, `stroke_opacity` — connector color
- `diagrams[].viewport` — `{x, y, zoom}` canvas viewport

### Legacy sidecar migration

Current files store layout inline and require no sidecar. Older models may reference
`.threatforge/layouts/*.json` through `diagrams[].layout_file`. On desktop open, the Rust backend
reads an available legacy sidecar and merges its positions and viewport into the in-memory model.
New saves write inline layout and omit `layout_file`. Missing legacy sidecars are tolerated so the
model remains usable without recovered layout.

## Full Example

```yaml
# ThreatForge Threat Model
version: "1.0"
metadata:
  title: "Payment Processing Service"
  author: "Alex Chen"
  created: 2026-03-15
  modified: 2026-03-20
  created_by: "Alex Chen <alex@example.com>"
  modified_by: "Alex Chen <alex@example.com>"
  last_edit_timestamp: 1742486400
  description: |
    Threat model for the payment processing microservice
    that handles credit card transactions via Stripe API.

elements:
  - id: web-app
    type: process
    name: "Web Application"
    trust_zone: internal
    description: "React frontend served via CDN"
    position:
      x: 100
      y: 200

  - id: api-gateway
    type: process
    name: "API Gateway"
    trust_zone: dmz
    technologies: [nginx, rate-limiting]
    position:
      x: 400
      y: 200

  - id: payment-db
    type: data_store
    name: "Payment Database"
    trust_zone: internal
    stores: [transaction_records, tokenized_card_data]
    encryption: AES-256-at-rest
    position:
      x: 700
      y: 200

  - id: stripe-api
    type: external_entity
    name: "Stripe API"
    trust_zone: external
    position:
      x: 700
      y: 400

data_flows:
  - id: flow-1
    from: web-app
    to: api-gateway
    protocol: HTTPS/TLS-1.3
    data: [user_input, payment_request]
    authenticated: true

  - id: flow-2
    from: api-gateway
    to: payment-db
    protocol: PostgreSQL/TLS
    data: [transaction_records]

  - id: flow-3
    from: api-gateway
    to: stripe-api
    protocol: HTTPS/TLS-1.3
    data: [tokenized_card_data]

trust_boundaries:
  - id: boundary-1
    name: "Corporate Network"
    contains: [web-app, api-gateway, payment-db]
    position:
      x: 50
      y: 150
    size:
      width: 700
      height: 150

  - id: boundary-2
    name: "External Services"
    contains: [stripe-api]
    position:
      x: 650
      y: 350
    size:
      width: 200
      height: 150

threats:
  - id: threat-1
    title: "SQL Injection on payment queries"
    category: Tampering
    element: api-gateway
    flow: flow-2
    severity: High
    description: |
      Malicious SQL could be injected through payment
      parameters if input validation is insufficient.
    mitigation:
      status: mitigated
      description: "Parameterized queries via ORM; input validation layer"

  - id: threat-2
    title: "Man-in-the-middle on Stripe API calls"
    category: Information Disclosure
    element: api-gateway
    flow: flow-3
    severity: Medium
    description: "API calls to Stripe could be intercepted."
    mitigation:
      status: mitigated
      description: "TLS 1.3 enforced; certificate pinning"

diagrams:
  - id: main-dfd
    name: "Level 0 DFD"
    viewport:
      x: 0
      y: 0
      zoom: 1
```

## Data Model

```
THREAT_MODEL
  ├── version: string
  ├── metadata: { title, author, dates, description, authoring }
  ├── elements[]: { id, type, name, trust_zone, position, colors, ... }
  ├── data_flows[]: { id, from, to, protocol, data, handles, colors, ... }
  ├── trust_boundaries[]: { id, name, contains[], position, size, colors }
  ├── threats[]: { id, title, category, element, flow, severity, mitigation }
  └── diagrams[]: { id, name, viewport }
```

**Relationships:**
- Each `threat` references an `element` and/or `flow` by ID
- Each `trust_boundary` references `elements` by ID in its `contains` array
- Each `data_flow` references two `elements` by ID (`from` and `to`)

## Design Choices

- **Element IDs** are kebab-case slugs: `api-gateway`, `payment-db`
- **Multi-line text** uses YAML block scalars (`|`), not escaped strings
- **Each threat** is a discrete YAML block — adding/removing threats produces clean diffs
- **All layout/visual fields** are `Option<T>` — omitted when not set, keeping the YAML minimal
- **Unknown fields are tolerated** (no `deny_unknown_fields`) for forward compatibility
- **New fields must be optional** with sensible defaults for backward compatibility

## Schema Stability Rules

- Never make breaking changes without a version bump and migration path
- The `version` field is always first under root (currently `"1.0"`)
- Schema validation runs on every file load via serde deserialization
- All element/flow references in threats must point to existing IDs
- Reject files with duplicate IDs within any section

## Schema versioning policy

This is the detailed argument behind **ADR-009** in
[`architecture.md`](architecture.md#architecture-decision-records-adrs).

**Decision: additive schema growth does not bump `version`.** Documents that gain new optional
sections or fields remain `version: "1.0"`. `validate_version`
(`src-tauri/src/file_io/reader.rs`) keeps its exact-match, fail-closed behavior and is not
widened.

### The forward rule

> Additive optional fields never bump the version. A bump happens only for a breaking change, and
> a breaking bump is expected to hard-fail on older builds.

### Why not bump

1. **Additive change is not breaking change.** No field is removed, renamed, retyped, or given new
   semantics, so there is nothing to migrate. `AGENTS.md` requires a bump for *breaking* schema
   changes, and this is not one.
2. **A bump converts graceful degradation into a hard failure.** `validate_version` matches `"1.0"`
   exactly and returns `UnsupportedVersion` for anything else. Because serde tolerates unknown
   fields, an already-released build opens a document containing sections it has never heard of and
   simply ignores them. Bumping to `"1.1"` would instead make every already-shipped build refuse to
   open **any** file saved by the newer version — including plain threat models carrying no new
   data at all. That trades a narrow failure mode for a universal one and directly attacks the
   "portable" product invariant.
3. **`version` signals compatibility, not features.** The presence of a section is the feature
   signal, and it is self-describing. `version` exists to tell a reader whether it can understand
   the document at all.

### Alternatives considered and rejected

- **Bump to `"1.1"`.** Rejected per (2): it makes downgrade a total failure instead of a partial
  one, for a change with no breaking element.
- **Keep `"1.0"` but widen `validate_version` to accept any `1.x`.** Rejected. It cannot help the
  installed base, because already-released builds hard-fail regardless. Going forward it would
  convert a clear refusal into silent data loss the first time a build met an unknown `1.x`
  document. Exact-match is the fail-closed behavior and stays.

### Residual risk: downgrade data loss on the desktop writer

The accepted cost is stated here rather than hidden. If an **older desktop build** opens a document
containing sections it does not know and saves it, those sections are gone. The desktop writer
deserializes into Rust structs, which have nowhere to keep unknown data, so `serde_yaml::to_string`
emits only the fields that build understands. This is not generic preservation and must not be
described as such.

The browser writer behaves differently. `BrowserFileAdapter` dumps the plain object it loaded, so
unknown sections and keys survive a browser load/save cycle. The asymmetry is real, not a
guarantee, and it is pinned by tests in both languages:

- `unknown_fields_fixture_parses_and_drops_the_unknown_data` (`src-tauri/src/file_io/fixtures_test.rs`)
- `carries unknown sections and keys through a load/dump/load cycle` (`src/types/thf-fixtures.test.ts`)

Comments are lost the same way and for the same reason: serde has nowhere to keep them, so any
comment other than the header ThreatForge itself writes disappears on the first desktop save.

## Testing

- Every schema change needs a round-trip test: YAML → Rust struct → YAML → assert equal
- Sample `.thf` files live in [`tests/fixtures/thf/`](../../tests/fixtures/thf/README.md), read by
  both `src-tauri/src/file_io/fixtures_test.rs` and `src/types/thf-fixtures.test.ts`
- Test that git diffs for common operations are clean and minimal
- Test backward compatibility: old files without new fields must still parse
