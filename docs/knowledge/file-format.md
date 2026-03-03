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
version → metadata → elements → data_flows → trust_boundaries → threats → diagrams
```

| Section | Purpose |
|---------|---------|
| `version` | Schema version (currently `"1.0"`). Always first field. |
| `metadata` | Title, author, dates, description, authoring info |
| `elements` | DFD nodes: processes, data stores, external entities, text annotations |
| `data_flows` | Connections between elements with protocol and data info |
| `trust_boundaries` | Security boundary groups containing elements |
| `threats` | STRIDE threats linked to elements/flows |
| `diagrams` | Diagram definitions with viewport state |

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

## Testing

- Every schema change needs a round-trip test: YAML → Rust struct → YAML → assert equal
- Sample `.thf` files in `tests/fixtures/` for regression testing
- Test that git diffs for common operations are clean and minimal
- Test backward compatibility: old files without new fields must still parse
