# Schema Migration

How to add or modify fields in the `.thf` file format while maintaining backward compatibility.

## Core Principle

The `.thf` format is ThreatForge's primary moat. Schema stability is critical. Every change must be backward-compatible unless accompanied by a version bump and explicit migration.

## Rules

1. **New fields must be optional** with sensible defaults so old files still parse
2. **Never remove fields** — deprecate them (stop writing but keep reading)
3. **Never rename fields** — add a new field and map from the old one
4. **Never use `deny_unknown_fields`** on YAML model types — unknown fields are tolerated for forward compatibility
5. **Version bump only for breaking changes** — adding optional fields does NOT require a version bump

## Adding a New Optional Field

### Step 1: Update the Rust Model

Edit the relevant struct in `src-tauri/src/models/`:

```rust
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DataFlow {
    pub id: String,
    pub from: String,
    pub to: String,
    // ... existing fields ...

    /// New optional field — defaults to None when absent in older files
    #[serde(skip_serializing_if = "Option::is_none")]
    pub new_field: Option<String>,
}
```

Key serde attributes:
- `#[serde(skip_serializing_if = "Option::is_none")]` — omit from YAML when None (keeps files clean)
- `#[serde(default)]` — use Default::default() when field is missing
- `#[serde(default = "default_fn")]` — use a custom default function

### Step 2: Add Round-Trip Tests

In the same Rust module or in `src-tauri/tests/`:

```rust
#[test]
fn new_field_round_trip() {
    let yaml = r#"
    id: flow-1
    from: a
    to: b
    new_field: "some value"
    "#;
    let flow: DataFlow = serde_yaml::from_str(yaml).unwrap();
    assert_eq!(flow.new_field, Some("some value".to_string()));

    let output = serde_yaml::to_string(&flow).unwrap();
    let reparsed: DataFlow = serde_yaml::from_str(&output).unwrap();
    assert_eq!(reparsed.new_field, flow.new_field);
}

#[test]
fn old_files_without_new_field_still_parse() {
    let yaml = r#"
    id: flow-1
    from: a
    to: b
    "#;
    let flow: DataFlow = serde_yaml::from_str(yaml).unwrap();
    assert_eq!(flow.new_field, None);
}
```

### Step 3: Update the TypeScript Interface

Edit the corresponding interface in `src/types/threat-model.ts`:

```typescript
export interface DataFlow {
    id: string;
    from: string;
    to: string;
    // ... existing fields ...
    new_field?: string;  // Optional — absent in older files
}
```

### Step 4: Update Stores and Components

- Update Zustand stores if the field is used in state management
- Update React components if the field is displayed or editable
- Use nullish coalescing (`??`) for defaults: `flow.new_field ?? "default"`

### Step 5: Validate

```bash
# Rust round-trip tests
cargo test --manifest-path src-tauri/Cargo.toml

# Clippy
cargo clippy --manifest-path src-tauri/Cargo.toml

# Frontend tests
npx vitest --run

# Load an existing .thf file to verify backward compat
```

## Breaking Changes (Version Bump)

If you must make a breaking change:

1. Bump `version` in the schema (e.g., `"1.0"` -> `"2.0"`)
2. Write a migration function in Rust that converts old format to new
3. Check version on file load and auto-migrate
4. Add migration tests with fixture files
5. Update `docs/knowledge/file-format.md`
6. Announce the change prominently in release notes

## Example: Adding `flow_number` to DataFlow

This was implemented as part of P1 #2 (Flow numbering):

**Rust**: Added `flow_number: Option<u32>` with `#[serde(skip_serializing_if = "Option::is_none")]`
**Tests**: Round-trip test + backward compat test (old files without flow_number parse correctly)
**TypeScript**: Added `flow_number?: number` to `DataFlow` interface
**UI**: Displayed in edge label, editable in properties panel

## File Format Documentation

Always update `docs/knowledge/file-format.md` when changing the schema. The documentation serves as the specification for third-party tools.
