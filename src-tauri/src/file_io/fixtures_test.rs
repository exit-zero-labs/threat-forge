//! Regression tests against the committed `.thf` fixture corpus in `tests/fixtures/thf/`.
//!
//! These assertions pin the parse and serialize behavior that exists today. They are the safety
//! net for additive schema changes: an additive change must keep every assertion here passing
//! without editing it. See `tests/fixtures/thf/README.md` for the fixture classes.

use crate::errors::ThreatForgeError;
use crate::file_io::{merge_layout_into_model, read_threat_model, write_threat_model};
use crate::models::{
    MitigationStatus, Position, Severity, Size, StrideCategory, ThreatModel, Viewport,
};
use std::path::{Path, PathBuf};

const FIXTURE_ROOT: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../tests/fixtures/thf");

/// Canonical fixtures are `serde_yaml` output and are subject to byte-identity assertions.
const CANONICAL_FIXTURES: &[&str] = &["v1.0-canonical-full.thf"];

/// Legacy fixtures are hand-authored, non-canonical, and assert semantic round trips only.
const LEGACY_FIXTURES: &[&str] = &[
    "v1.0-minimal.thf",
    "v1.0-unknown-fields.thf",
    "legacy-sidecar/model.thf",
];

fn fixture_path(relative: &str) -> PathBuf {
    Path::new(FIXTURE_ROOT).join(relative)
}

fn fixture_text(relative: &str) -> String {
    let path = fixture_path(relative);
    std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("failed to read fixture {}: {e}", path.display()))
}

/// Fixture contents with the leading `#` comment header removed.
///
/// `write_threat_model` interpolates `CARGO_PKG_VERSION` into its header, so byte comparisons
/// must target the YAML body rather than the whole file.
fn fixture_body(relative: &str) -> String {
    fixture_text(relative)
        .split_inclusive('\n')
        .skip_while(|line| line.starts_with('#'))
        .collect()
}

fn parse_fixture(relative: &str) -> ThreatModel {
    let body = fixture_body(relative);
    serde_yaml::from_str(&body)
        .unwrap_or_else(|e| panic!("failed to parse fixture {relative}: {e}"))
}

fn serialize(model: &ThreatModel) -> String {
    serde_yaml::to_string(model).expect("serde_yaml serialization of a parsed model cannot fail")
}

/// Byte-compare emitted YAML against a fixture, reporting the first divergent line.
///
/// A plain `assert_eq!` on these strings prints two ~200-line blobs, which makes the failure
/// unreadable exactly when it matters — a schema change that perturbs an existing file.
fn assert_yaml_bytes_eq(name: &str, actual: &str, expected: &str) {
    if actual == expected {
        return;
    }

    let actual_lines: Vec<&str> = actual.lines().collect();
    let expected_lines: Vec<&str> = expected.lines().collect();
    let first_divergence = actual_lines
        .iter()
        .zip(expected_lines.iter())
        .position(|(a, b)| a != b);

    match first_divergence {
        Some(index) => panic!(
            "{name}: emitted YAML diverges from the fixture at line {}\n  emitted:  {:?}\n  fixture:  {:?}",
            index + 1,
            actual_lines[index],
            expected_lines[index],
        ),
        None => panic!(
            "{name}: emitted YAML has {} lines, fixture has {}; the first {} lines match",
            actual_lines.len(),
            expected_lines.len(),
            actual_lines.len().min(expected_lines.len()),
        ),
    }
}

#[test]
fn fixture_body_strips_only_the_leading_comment_header() {
    let text = fixture_text("v1.0-minimal.thf");
    let body = fixture_body("v1.0-minimal.thf");

    assert!(
        text.starts_with("# ThreatForge Threat Model\n"),
        "fixtures should keep a realistic header comment"
    );
    assert!(
        body.starts_with("version:"),
        "fixture body should begin at the first non-comment line, got: {:?}",
        body.lines().next()
    );
    assert!(
        body.contains("title: \"Minimal Model\""),
        "stripping must not touch the document body"
    );
}

#[test]
fn canonical_fixtures_reserialize_byte_for_byte() {
    for name in CANONICAL_FIXTURES {
        let body = fixture_body(name);
        let model = parse_fixture(name);
        assert_yaml_bytes_eq(name, &serialize(&model), &body);
    }
}

#[test]
fn legacy_fixtures_round_trip_semantically() {
    for name in LEGACY_FIXTURES {
        let model = parse_fixture(name);
        let reparsed: ThreatModel = serde_yaml::from_str(&serialize(&model))
            .unwrap_or_else(|e| panic!("failed to reparse serialized {name}: {e}"));
        assert_eq!(
            model, reparsed,
            "{name} lost data across a serialize/parse cycle"
        );
    }
}

#[test]
fn canonical_full_fixture_populates_every_optional_field() {
    // The fixture's value is its completeness: byte identity only protects the fields present.
    // These assertions fail if a field is quietly dropped from the fixture.
    let model = parse_fixture("v1.0-canonical-full.thf");

    assert_eq!(model.version, "1.0");

    let metadata = &model.metadata;
    assert_eq!(metadata.title, "Payment Processing Service");
    assert_eq!(metadata.author, "Alex Chen");
    assert_eq!(metadata.created.to_string(), "2026-03-15");
    assert_eq!(metadata.modified.to_string(), "2026-03-20");
    assert!(metadata.description.contains("payment processing"));
    assert!(metadata.created_by.is_some(), "metadata.created_by");
    assert!(metadata.modified_by.is_some(), "metadata.modified_by");
    assert_eq!(metadata.last_edit_timestamp, Some(1_742_486_400));

    let settings = metadata.settings.as_ref().expect("metadata.settings");
    assert_eq!(settings.grid_size, Some(24));
    assert!(settings.default_element_fill.is_some());
    assert!(settings.default_element_stroke.is_some());
    assert!(settings.default_boundary_fill.is_some());
    assert!(settings.default_boundary_stroke.is_some());

    let db = model
        .elements
        .iter()
        .find(|e| e.id == "payment-db")
        .expect("payment-db element");
    assert_eq!(db.element_type, "data_store");
    assert_eq!(db.trust_zone, "internal");
    assert!(db.subtype.is_some(), "element.subtype");
    assert!(db.icon.is_some(), "element.icon");
    assert!(!db.description.is_empty(), "element.description");
    assert!(!db.technologies.is_empty(), "element.technologies");
    assert!(db.stores.is_some(), "element.stores");
    assert!(db.encryption.is_some(), "element.encryption");
    assert_eq!(db.position, Some(Position { x: 700.0, y: 200.0 }));
    assert!(db.fill_color.is_some(), "element.fill_color");
    assert!(db.stroke_color.is_some(), "element.stroke_color");
    assert!(db.fill_opacity.is_some(), "element.fill_opacity");
    assert!(db.stroke_opacity.is_some(), "element.stroke_opacity");
    assert!(db.font_size.is_some(), "element.font_size");
    assert!(db.font_weight.is_some(), "element.font_weight");

    let flow = &model.data_flows[0];
    assert_eq!(flow.id, "flow-1");
    assert_eq!(flow.flow_number, Some(1));
    assert!(!flow.name.is_empty(), "data_flow.name");
    assert_eq!(flow.from, "web-app");
    assert_eq!(flow.to, "api-gateway");
    assert!(!flow.protocol.is_empty(), "data_flow.protocol");
    assert!(!flow.data.is_empty(), "data_flow.data");
    assert!(flow.authenticated, "data_flow.authenticated");
    assert_eq!(flow.label_offset, Some(Position { x: 12.0, y: -6.0 }));
    assert!(flow.source_handle.is_some(), "data_flow.source_handle");
    assert!(flow.target_handle.is_some(), "data_flow.target_handle");
    assert!(flow.stroke_color.is_some(), "data_flow.stroke_color");
    assert!(flow.stroke_opacity.is_some(), "data_flow.stroke_opacity");

    let boundary = &model.trust_boundaries[0];
    assert_eq!(boundary.contains.len(), 3);
    assert_eq!(boundary.position, Some(Position { x: 50.0, y: 150.0 }));
    assert_eq!(
        boundary.size,
        Some(Size {
            width: 760.0,
            height: 180.0
        })
    );
    assert!(boundary.fill_color.is_some(), "trust_boundary.fill_color");
    assert!(
        boundary.stroke_color.is_some(),
        "trust_boundary.stroke_color"
    );
    assert!(
        boundary.fill_opacity.is_some(),
        "trust_boundary.fill_opacity"
    );
    assert!(
        boundary.stroke_opacity.is_some(),
        "trust_boundary.stroke_opacity"
    );

    let threat = &model.threats[0];
    assert_eq!(threat.category, StrideCategory::Tampering);
    assert_eq!(threat.severity, Severity::High);
    assert_eq!(threat.element.as_deref(), Some("api-gateway"));
    assert_eq!(threat.flow.as_deref(), Some("flow-2"));
    assert!(!threat.description.is_empty(), "threat.description");
    let mitigation = threat.mitigation.as_ref().expect("threat.mitigation");
    assert_eq!(mitigation.status, MitigationStatus::Mitigated);
    assert!(!mitigation.description.is_empty());

    let diagram = &model.diagrams[0];
    assert_eq!(diagram.id, "main-dfd");
    assert_eq!(
        diagram.viewport,
        Some(Viewport {
            x: -40.0,
            y: 25.0,
            zoom: 0.85
        })
    );

    // Every STRIDE category variant used by the fixture must survive the enum rename attributes.
    assert_eq!(
        model.threats[1].category,
        StrideCategory::InformationDisclosure
    );
    assert_eq!(
        model.threats[2].category,
        StrideCategory::ElevationOfPrivilege
    );
    assert_eq!(model.threats[2].severity, Severity::Critical);
    assert_eq!(
        model.threats[1]
            .mitigation
            .as_ref()
            .expect("threat-2 mitigation")
            .status,
        MitigationStatus::InProgress
    );
}

#[test]
fn writer_output_matches_canonical_fixture_body() {
    let dir = tempfile::TempDir::new().expect("temp dir");
    let path = dir.path().join("written.thf");
    let model = parse_fixture("v1.0-canonical-full.thf");

    write_threat_model(&path, &model).expect("write canonical model");
    let written = std::fs::read_to_string(&path).expect("read written model");

    let expected = format!(
        "# ThreatForge Threat Model\n# Generated by ThreatForge v{}\n{}",
        env!("CARGO_PKG_VERSION"),
        fixture_body("v1.0-canonical-full.thf")
    );
    assert_yaml_bytes_eq("write_threat_model output", &written, &expected);
}

#[test]
fn minimal_fixture_defaults_are_stable() {
    let model = parse_fixture("v1.0-minimal.thf");

    assert_eq!(model.metadata.description, "");
    assert!(model.metadata.created_by.is_none());
    assert!(model.metadata.settings.is_none());
    assert_eq!(model.elements.len(), 1);
    assert_eq!(model.elements[0].trust_zone, "");
    assert_eq!(model.elements[0].description, "");
    assert!(model.elements[0].technologies.is_empty());
    assert!(model.elements[0].stores.is_none());
    assert!(model.elements[0].position.is_none());
    assert!(model.data_flows.is_empty());
    assert!(model.trust_boundaries.is_empty());
    assert!(model.threats.is_empty());
    assert!(model.diagrams.is_empty());
}

#[test]
fn minimal_fixture_reserializes_with_all_required_sections_present() {
    // Characterization, not a preference: the five collection sections carry `#[serde(default)]`
    // but no `skip_serializing_if`, so saving a minimal file materializes `data_flows: []`,
    // `trust_boundaries: []`, `threats: []`, and `diagrams: []` that the user never wrote.
    let yaml = serialize(&parse_fixture("v1.0-minimal.thf"));

    assert!(yaml.contains("\nelements:\n- id: app\n"), "got:\n{yaml}");
    for empty_section in [
        "data_flows: []",
        "trust_boundaries: []",
        "threats: []",
        "diagrams: []",
    ] {
        assert!(
            yaml.contains(empty_section),
            "expected `{empty_section}` in:\n{yaml}"
        );
    }
}

#[test]
fn unknown_fields_fixture_parses_and_drops_the_unknown_data() {
    let model = parse_fixture("v1.0-unknown-fields.thf");
    assert_eq!(model.metadata.title, "Forward Compatibility Model");
    assert_eq!(model.elements.len(), 1);

    // Forward compatibility is one-way: unknown data survives the read, not the write. This is
    // the downgrade data-loss path recorded in ADR-009.
    let yaml = serialize(&model);
    for unknown in [
        "unknown_future_section",
        "unknown_future_flag",
        "unknown_future_note",
    ] {
        assert!(
            !yaml.contains(unknown),
            "{unknown} unexpectedly survived re-serialization; \
             ADR-009's residual-risk statement would need revising"
        );
    }
}

#[test]
fn legacy_sidecar_fixture_merges_layout_from_the_sidecar_file() {
    let path = fixture_path("legacy-sidecar/model.thf");
    let mut model = read_threat_model(&path).expect("legacy sidecar fixture should read");

    assert_eq!(
        model.diagrams[0].layout_file.as_deref(),
        Some(".threatforge/layouts/main-dfd.json"),
        "the deprecated sidecar reference must still be parsed"
    );
    assert!(model.elements[0].position.is_none(), "before merge");

    merge_layout_into_model(&mut model, &path);

    assert_eq!(
        model.elements[0].position,
        Some(Position { x: 120.0, y: 240.0 })
    );
    assert_eq!(
        model.elements[1].position,
        Some(Position { x: 480.0, y: 240.0 })
    );
    assert_eq!(
        model.trust_boundaries[0].position,
        Some(Position { x: 60.0, y: 180.0 })
    );
    assert_eq!(
        model.trust_boundaries[0].size,
        Some(Size {
            width: 640.0,
            height: 220.0
        })
    );
    assert_eq!(
        model.diagrams[0].viewport,
        Some(Viewport {
            x: 12.0,
            y: -8.0,
            zoom: 1.25
        })
    );
}

#[test]
fn legacy_sidecar_fixture_keeps_the_sidecar_reference_after_merge() {
    // Characterization, not desired behavior: `merge_layout_into_model` copies the sidecar data
    // inline but leaves `layout_file` set. Dropping it is the frontend's job
    // (`src/hooks/use-file-operations.ts:80`), so a Rust-only open/save keeps the stale pointer.
    let path = fixture_path("legacy-sidecar/model.thf");
    let mut model = read_threat_model(&path).expect("legacy sidecar fixture should read");
    merge_layout_into_model(&mut model, &path);

    assert_eq!(
        model.diagrams[0].layout_file.as_deref(),
        Some(".threatforge/layouts/main-dfd.json")
    );
}

#[test]
fn invalid_fixtures_are_rejected_with_the_expected_error() {
    let duplicate = read_threat_model(&fixture_path("invalid/duplicate-element-id.thf"))
        .expect_err("duplicate element IDs must be rejected");
    match duplicate {
        ThreatForgeError::DuplicateId { id, section } => {
            assert_eq!(id, "app");
            assert_eq!(section, "elements");
        }
        other => panic!("expected DuplicateId, got {other:?}"),
    }

    let unknown_target = read_threat_model(&fixture_path("invalid/unknown-flow-target.thf"))
        .expect_err("a flow pointing at a missing element must be rejected");
    match unknown_target {
        ThreatForgeError::InvalidReference {
            field, reference, ..
        } => {
            assert_eq!(field, "data_flows[flow-1].to");
            assert_eq!(reference, "missing-db");
        }
        other => panic!("expected InvalidReference, got {other:?}"),
    }

    let bad_version = read_threat_model(&fixture_path("invalid/unsupported-version.thf"))
        .expect_err("version 2.0 must be rejected");
    match bad_version {
        ThreatForgeError::UnsupportedVersion { version, supported } => {
            assert_eq!(version, "2.0");
            assert_eq!(supported, vec!["1.0".to_string()]);
        }
        other => panic!("expected UnsupportedVersion, got {other:?}"),
    }

    let truncated = read_threat_model(&fixture_path("invalid/truncated.thf"))
        .expect_err("malformed YAML must be rejected");
    assert!(
        matches!(truncated, ThreatForgeError::YamlParse { .. }),
        "expected YamlParse, got {truncated:?}"
    );

    let missing_metadata = read_threat_model(&fixture_path("invalid/missing-metadata.thf"))
        .expect_err("a missing required section must be rejected");
    assert!(
        matches!(missing_metadata, ThreatForgeError::YamlParse { .. }),
        "expected YamlParse, got {missing_metadata:?}"
    );
}

#[test]
fn valid_fixtures_pass_reader_validation() {
    // The counterpart to the invalid corpus: every valid fixture must survive `read_threat_model`,
    // including its version and reference checks. New validation rules must not invalidate these.
    for name in CANONICAL_FIXTURES.iter().chain(LEGACY_FIXTURES.iter()) {
        read_threat_model(&fixture_path(name))
            .unwrap_or_else(|e| panic!("valid fixture {name} was rejected: {e}"));
    }
}

#[test]
fn desktop_written_dates_are_unquoted_yaml_timestamps() {
    // Pins the emitter contract the browser reader depends on: `serde_yaml` writes
    // `created: 2026-03-15` with no quotes. The browser parser reads that back as the string its
    // declared type promises (see `src/lib/thf-yaml.ts`, which removes the YAML 1.1 timestamp
    // type), so the scalar survives a cross-platform round trip unchanged.
    let yaml = serialize(&parse_fixture("v1.0-canonical-full.thf"));
    assert!(
        yaml.contains("\n  created: 2026-03-15\n"),
        "expected an unquoted date scalar in:\n{yaml}"
    );
}

#[test]
fn browser_written_dates_reopen_on_the_desktop() {
    // Inversion of the former `browser_written_iso_timestamps_are_rejected_on_read`
    // characterization. The browser writer no longer turns `created: 2026-03-15` into
    // `2026-03-15T00:00:00.000Z`, so a desktop document opened and saved in the browser reopens on
    // the desktop with its calendar dates intact. `v1.0-browser-roundtrip.thf` is the byte-for-byte
    // browser output for `v1.0-canonical-full.thf`; `src/types/thf-fixtures.test.ts` proves the
    // browser produces exactly those bytes.
    let desktop = parse_fixture("v1.0-canonical-full.thf");
    let browser = read_threat_model(&fixture_path("v1.0-browser-roundtrip.thf"))
        .expect("a browser-written .thf must reopen on the desktop");

    assert_eq!(browser.metadata.created, desktop.metadata.created);
    assert_eq!(browser.metadata.modified, desktop.metadata.modified);
    assert_eq!(browser.metadata.created.to_string(), "2026-03-15");
    assert_eq!(browser.metadata.modified.to_string(), "2026-03-20");

    // Reopening then saving on the desktop is a stable semantic round trip.
    let reparsed: ThreatModel = serde_yaml::from_str(&serialize(&browser))
        .expect("a re-serialized browser model must reparse");
    assert_eq!(browser, reparsed);

    // The desktop reader stays fail-closed. The ISO-timestamp form the browser used to emit — and
    // any file already corrupted by it — is still refused, with the offending field named. This is
    // the discriminating half: had the committed fixture carried this form, the read above panics.
    let corrupted = fixture_body("v1.0-browser-roundtrip.thf")
        .replace("created: 2026-03-15", "created: 2026-03-15T00:00:00.000Z");
    let error = serde_yaml::from_str::<ThreatModel>(&corrupted)
        .expect_err("chrono NaiveDate must reject a full ISO timestamp");
    assert!(
        error.to_string().contains("metadata.created"),
        "expected the error to name the offending field, got: {error}"
    );
}

/// Each new architecture reference-integrity rule (issue #57, step 4) rejects a dedicated
/// `invalid/` fixture with a specific error variant — not merely `is_err()`.
#[test]
fn architecture_invalid_fixtures_are_rejected_with_the_expected_error() {
    fn expect_duplicate(fixture: &str, expected_id: &str, expected_section: &str) {
        match read_threat_model(&fixture_path(fixture)).expect_err(fixture) {
            ThreatForgeError::DuplicateId { id, section } => {
                assert_eq!(id, expected_id, "{fixture}: duplicate id");
                assert_eq!(section, expected_section, "{fixture}: duplicate section");
            }
            other => panic!("{fixture}: expected DuplicateId, got {other:?}"),
        }
    }

    fn expect_invalid_reference(fixture: &str, expected_field: &str, expected_reference: &str) {
        match read_threat_model(&fixture_path(fixture)).expect_err(fixture) {
            ThreatForgeError::InvalidReference {
                field, reference, ..
            } => {
                assert_eq!(field, expected_field, "{fixture}: reference field");
                assert_eq!(reference, expected_reference, "{fixture}: reference value");
            }
            other => panic!("{fixture}: expected InvalidReference, got {other:?}"),
        }
    }

    expect_duplicate("invalid/duplicate-layer-id.thf", "data", "layers");
    expect_duplicate("invalid/duplicate-group-id.thf", "cluster", "groups");
    expect_duplicate(
        "invalid/duplicate-relationship-id.thf",
        "rel-1",
        "relationships",
    );
    expect_duplicate(
        "invalid/group-id-collides-with-element.thf",
        "web-app",
        "groups",
    );
    expect_duplicate(
        "invalid/relationship-id-collides-with-flow.thf",
        "flow-1",
        "relationships",
    );

    expect_invalid_reference(
        "invalid/unknown-element-layer.thf",
        "elements[app].layer",
        "presentation",
    );
    expect_invalid_reference(
        "invalid/unknown-element-group.thf",
        "elements[app].group",
        "backend",
    );
    expect_invalid_reference(
        "invalid/unknown-group-parent.thf",
        "groups[cluster-1].parent",
        "missing-cluster",
    );
    expect_invalid_reference(
        "invalid/unknown-relationship-endpoint.thf",
        "relationships[rel-1].to",
        "missing-service",
    );

    match read_threat_model(&fixture_path("invalid/circular-group-nesting.thf"))
        .expect_err("a group nesting cycle must be rejected")
    {
        ThreatForgeError::CircularGroupNesting { id } => assert_eq!(id, "group-a"),
        other => panic!("expected CircularGroupNesting, got {other:?}"),
    }
}

// --- Architecture golden fixtures + cross-language contract (issue #57, step 6) ---------------
//
// The three artifacts — this Rust helper, the `maxFilledModel` literal in
// `src/types/threat-model.contract.test.ts`, and `architecture-canonical-full.thf` — must be
// updated together. That friction is intentional: it is the only mechanism that keeps the Rust
// model, the TypeScript model, and the on-disk schema from drifting apart silently.

/// A `ThreatModel` populating every field the schema defines, old and new. Its serialization is
/// `architecture-canonical-full.thf`, and the TypeScript contract test mirrors it structurally.
fn max_filled_model() -> ThreatModel {
    use crate::models::{
        DataFlow, Diagram, Element, FileSettings, Group, Layer, Metadata, Mitigation, Relationship,
        Threat, TrustBoundary,
    };
    use chrono::NaiveDate;

    ThreatModel {
        version: "1.0".to_string(),
        metadata: Metadata {
            title: "Order Fulfillment Platform".to_string(),
            author: "Dana Lee".to_string(),
            created: NaiveDate::from_ymd_opt(2026, 4, 1).expect("valid date"),
            modified: NaiveDate::from_ymd_opt(2026, 4, 10).expect("valid date"),
            description:
                "System architecture and threat model for the order fulfillment platform.\n"
                    .to_string(),
            created_by: Some("Dana Lee <dana@example.com>".to_string()),
            modified_by: Some("Sam Ortiz <sam@example.com>".to_string()),
            last_edit_timestamp: Some(1_743_206_400),
            threat_analysis_enabled: Some(true),
            settings: Some(FileSettings {
                grid_size: Some(24),
                default_element_fill: Some("#3b82f6".to_string()),
                default_element_stroke: Some("#1e40af".to_string()),
                default_boundary_fill: Some("#22c55e".to_string()),
                default_boundary_stroke: Some("#15803d".to_string()),
            }),
        },
        layers: vec![
            Layer {
                id: "presentation".to_string(),
                name: "Presentation".to_string(),
                description: Some("User-facing surfaces".to_string()),
            },
            Layer {
                id: "application".to_string(),
                name: "Application".to_string(),
                description: Some("Business logic and services".to_string()),
            },
            Layer {
                id: "data".to_string(),
                name: "Data".to_string(),
                description: Some("Persistence and storage".to_string()),
            },
        ],
        groups: vec![
            Group {
                id: "frontend-cluster".to_string(),
                name: "Frontend Cluster".to_string(),
                r#type: Some("cluster".to_string()),
                parent: None,
                description: Some("Edge-facing services".to_string()),
                position: Some(Position { x: 40.0, y: 40.0 }),
                size: Some(Size {
                    width: 320.0,
                    height: 220.0,
                }),
                fill_color: Some("#3b82f6".to_string()),
                stroke_color: Some("#1e40af".to_string()),
                fill_opacity: Some(0.1),
                stroke_opacity: Some(0.6),
            },
            Group {
                id: "backend-cluster".to_string(),
                name: "Backend Cluster".to_string(),
                r#type: Some("cluster".to_string()),
                parent: None,
                description: Some("Internal services and stores".to_string()),
                position: Some(Position { x: 420.0, y: 40.0 }),
                size: Some(Size {
                    width: 420.0,
                    height: 360.0,
                }),
                fill_color: Some("#22c55e".to_string()),
                stroke_color: Some("#15803d".to_string()),
                fill_opacity: Some(0.1),
                stroke_opacity: Some(0.6),
            },
            Group {
                id: "api-subcluster".to_string(),
                name: "API Subcluster".to_string(),
                r#type: Some("cluster".to_string()),
                parent: Some("backend-cluster".to_string()),
                description: Some("API tier nested inside the backend".to_string()),
                position: Some(Position { x: 440.0, y: 80.0 }),
                size: Some(Size {
                    width: 200.0,
                    height: 160.0,
                }),
                fill_color: Some("#f97316".to_string()),
                stroke_color: Some("#c2410c".to_string()),
                fill_opacity: Some(0.12),
                stroke_opacity: Some(0.7),
            },
        ],
        elements: vec![
            Element {
                id: "web-app".to_string(),
                element_type: "process".to_string(),
                name: "Web Application".to_string(),
                trust_zone: "internal".to_string(),
                layer: Some("presentation".to_string()),
                group: Some("frontend-cluster".to_string()),
                subtype: None,
                icon: None,
                description: "React storefront".to_string(),
                technologies: vec!["react".to_string(), "vite".to_string()],
                tags: vec!["tier-1".to_string()],
                stores: None,
                encryption: None,
                position: Some(Position { x: 100.0, y: 120.0 }),
                fill_color: None,
                stroke_color: None,
                fill_opacity: None,
                stroke_opacity: None,
                font_size: None,
                font_weight: None,
            },
            Element {
                id: "api-gateway".to_string(),
                element_type: "process".to_string(),
                name: "API Gateway".to_string(),
                trust_zone: "dmz".to_string(),
                layer: Some("application".to_string()),
                group: Some("api-subcluster".to_string()),
                subtype: Some("api_gateway".to_string()),
                icon: Some("router".to_string()),
                description: "Terminates TLS and routes requests".to_string(),
                technologies: vec!["nginx".to_string()],
                tags: vec!["pci".to_string(), "tier-1".to_string()],
                stores: None,
                encryption: None,
                position: Some(Position { x: 480.0, y: 120.0 }),
                fill_color: Some("#3b82f6".to_string()),
                stroke_color: Some("#1e40af".to_string()),
                fill_opacity: Some(0.15),
                stroke_opacity: Some(0.9),
                font_size: Some(14.0),
                font_weight: Some("normal".to_string()),
            },
            Element {
                id: "orders-db".to_string(),
                element_type: "data_store".to_string(),
                name: "Orders Database".to_string(),
                trust_zone: "internal".to_string(),
                layer: Some("data".to_string()),
                group: Some("backend-cluster".to_string()),
                subtype: Some("sql_database".to_string()),
                icon: Some("database".to_string()),
                description: "Primary order store".to_string(),
                technologies: vec!["postgresql".to_string()],
                tags: vec!["pci".to_string()],
                stores: Some(vec!["order_records".to_string()]),
                encryption: Some("AES-256-at-rest".to_string()),
                position: Some(Position { x: 480.0, y: 320.0 }),
                fill_color: Some("#22c55e".to_string()),
                stroke_color: Some("#15803d".to_string()),
                fill_opacity: Some(0.2),
                stroke_opacity: Some(0.95),
                font_size: None,
                font_weight: None,
            },
        ],
        data_flows: vec![
            DataFlow {
                id: "flow-1".to_string(),
                flow_number: Some(1),
                name: "Checkout request".to_string(),
                from: "web-app".to_string(),
                to: "api-gateway".to_string(),
                protocol: "HTTPS/TLS-1.3".to_string(),
                data: vec!["order_request".to_string()],
                authenticated: true,
                label_offset: Some(Position { x: 12.0, y: -6.0 }),
                source_handle: Some("right".to_string()),
                target_handle: Some("left".to_string()),
                stroke_color: Some("#ef4444".to_string()),
                stroke_opacity: Some(0.85),
            },
            DataFlow {
                id: "flow-2".to_string(),
                flow_number: Some(2),
                name: "Persist order".to_string(),
                from: "api-gateway".to_string(),
                to: "orders-db".to_string(),
                protocol: "PostgreSQL/TLS".to_string(),
                data: vec!["order_records".to_string()],
                authenticated: true,
                label_offset: None,
                source_handle: None,
                target_handle: None,
                stroke_color: None,
                stroke_opacity: None,
            },
        ],
        relationships: vec![
            Relationship {
                id: "rel-1".to_string(),
                relationship_type: "deploys_to".to_string(),
                from: "api-gateway".to_string(),
                to: "orders-db".to_string(),
                name: Some("Runs alongside".to_string()),
                description: Some(
                    "Gateway is deployed in the same cluster as the store".to_string(),
                ),
                source_handle: Some("bottom".to_string()),
                target_handle: Some("top".to_string()),
                label_offset: Some(Position { x: 8.0, y: 4.0 }),
                stroke_color: Some("#64748b".to_string()),
                stroke_opacity: Some(0.5),
            },
            Relationship {
                id: "rel-2".to_string(),
                relationship_type: "depends_on".to_string(),
                from: "web-app".to_string(),
                to: "orders-db".to_string(),
                name: None,
                description: None,
                source_handle: None,
                target_handle: None,
                label_offset: None,
                stroke_color: None,
                stroke_opacity: None,
            },
        ],
        trust_boundaries: vec![TrustBoundary {
            id: "boundary-1".to_string(),
            name: "Corporate Network".to_string(),
            contains: vec![
                "web-app".to_string(),
                "api-gateway".to_string(),
                "orders-db".to_string(),
            ],
            position: Some(Position { x: 20.0, y: 20.0 }),
            size: Some(Size {
                width: 840.0,
                height: 400.0,
            }),
            fill_color: Some("#22c55e".to_string()),
            stroke_color: Some("#15803d".to_string()),
            fill_opacity: Some(0.1),
            stroke_opacity: Some(0.6),
        }],
        threats: vec![Threat {
            id: "threat-1".to_string(),
            title: "SQL injection on order queries".to_string(),
            category: StrideCategory::Tampering,
            element: Some("api-gateway".to_string()),
            flow: Some("flow-2".to_string()),
            severity: Severity::High,
            description: "Unvalidated input could inject SQL into order queries.".to_string(),
            mitigation: Some(Mitigation {
                status: MitigationStatus::Mitigated,
                description: "Parameterized queries via ORM".to_string(),
            }),
        }],
        diagrams: vec![Diagram {
            id: "main-arch".to_string(),
            name: "Architecture View".to_string(),
            kind: Some("architecture".to_string()),
            description: Some("Top-level system architecture".to_string()),
            layout_file: None,
            viewport: Some(Viewport {
                x: -40.0,
                y: 25.0,
                zoom: 0.85,
            }),
        }],
    }
}

/// An architecture-first document: layers, groups, and relationships but no threats, with the
/// analysis flag explicitly off. This is the shape #60's templates will follow.
fn architecture_only_model() -> ThreatModel {
    use crate::models::{Element, Group, Layer, Metadata, Relationship};
    use chrono::NaiveDate;

    ThreatModel {
        version: "1.0".to_string(),
        metadata: Metadata {
            title: "Reference Architecture".to_string(),
            author: "Dana Lee".to_string(),
            created: NaiveDate::from_ymd_opt(2026, 4, 1).expect("valid date"),
            modified: NaiveDate::from_ymd_opt(2026, 4, 1).expect("valid date"),
            description: String::new(),
            created_by: None,
            modified_by: None,
            last_edit_timestamp: None,
            threat_analysis_enabled: Some(false),
            settings: None,
        },
        layers: vec![
            Layer {
                id: "presentation".to_string(),
                name: "Presentation".to_string(),
                description: None,
            },
            Layer {
                id: "data".to_string(),
                name: "Data".to_string(),
                description: None,
            },
        ],
        groups: vec![Group {
            id: "core".to_string(),
            name: "Core Services".to_string(),
            r#type: Some("cluster".to_string()),
            parent: None,
            description: None,
            position: None,
            size: None,
            fill_color: None,
            stroke_color: None,
            fill_opacity: None,
            stroke_opacity: None,
        }],
        elements: vec![
            Element {
                id: "web-app".to_string(),
                element_type: "process".to_string(),
                name: "Web Application".to_string(),
                trust_zone: String::new(),
                layer: Some("presentation".to_string()),
                group: Some("core".to_string()),
                subtype: None,
                icon: None,
                description: String::new(),
                technologies: Vec::new(),
                tags: Vec::new(),
                stores: None,
                encryption: None,
                position: None,
                fill_color: None,
                stroke_color: None,
                fill_opacity: None,
                stroke_opacity: None,
                font_size: None,
                font_weight: None,
            },
            Element {
                id: "orders-db".to_string(),
                element_type: "data_store".to_string(),
                name: "Orders Database".to_string(),
                trust_zone: String::new(),
                layer: Some("data".to_string()),
                group: Some("core".to_string()),
                subtype: None,
                icon: None,
                description: String::new(),
                technologies: Vec::new(),
                tags: Vec::new(),
                stores: None,
                encryption: None,
                position: None,
                fill_color: None,
                stroke_color: None,
                fill_opacity: None,
                stroke_opacity: None,
                font_size: None,
                font_weight: None,
            },
        ],
        data_flows: Vec::new(),
        relationships: vec![Relationship {
            id: "rel-1".to_string(),
            relationship_type: "depends_on".to_string(),
            from: "web-app".to_string(),
            to: "orders-db".to_string(),
            name: None,
            description: None,
            source_handle: None,
            target_handle: None,
            label_offset: None,
            stroke_color: None,
            stroke_opacity: None,
        }],
        trust_boundaries: Vec::new(),
        threats: Vec::new(),
        diagrams: vec![crate::models::Diagram {
            id: "main-arch".to_string(),
            name: "Architecture View".to_string(),
            kind: Some("architecture".to_string()),
            description: None,
            layout_file: None,
            viewport: None,
        }],
    }
}

#[test]
#[ignore = "generator: run with --ignored to (re)write the architecture fixtures, then review"]
fn regenerate_architecture_fixtures() {
    for (name, model) in [
        ("architecture-canonical-full.thf", max_filled_model()),
        ("architecture-only.thf", architecture_only_model()),
    ] {
        let body = serialize(&model);
        let contents = format!(
            "# ThreatForge Threat Model\n# Canonical fixture generated by serde_yaml. Do not hand-edit; see README.md.\n{body}"
        );
        std::fs::write(fixture_path(name), contents)
            .unwrap_or_else(|e| panic!("failed to write {name}: {e}"));
    }
}

/// Count each distinct line in a document, for order-insensitive multiset comparison.
fn line_counts(text: &str) -> std::collections::HashMap<&str, i64> {
    let mut counts = std::collections::HashMap::new();
    for line in text.lines() {
        *counts.entry(line).or_insert(0) += 1;
    }
    counts
}

/// Lines whose multiplicity dropped from `before` to `after`, with the count of each drop.
fn removed_lines<'a>(before: &'a str, after: &'a str) -> Vec<(&'a str, i64)> {
    let after_counts = line_counts(after);
    let mut removed: Vec<(&str, i64)> = line_counts(before)
        .into_iter()
        .filter_map(|(line, count)| {
            let delta = count - after_counts.get(line).copied().unwrap_or(0);
            (delta > 0).then_some((line, delta))
        })
        .collect();
    removed.sort_unstable();
    removed
}

#[test]
fn architecture_canonical_full_fixture_matches_the_rust_helper_byte_for_byte() {
    // Pins Rust field order and presence. If this fails after a schema change, regenerate the
    // fixture with `regenerate_architecture_fixtures` and update the TypeScript literal to match.
    let expected = fixture_body("architecture-canonical-full.thf");
    assert_yaml_bytes_eq(
        "architecture-canonical-full.thf",
        &serialize(&max_filled_model()),
        &expected,
    );
}

#[test]
fn architecture_canonical_full_fixture_deserializes_to_the_rust_helper() {
    let body = fixture_body("architecture-canonical-full.thf");
    let parsed: ThreatModel =
        serde_yaml::from_str(&body).expect("architecture-canonical-full.thf should parse");
    assert_eq!(
        parsed,
        max_filled_model(),
        "deserialized fixture must equal the Rust helper"
    );
}

#[test]
fn architecture_only_fixture_matches_the_rust_helper_and_reads() {
    let expected = fixture_body("architecture-only.thf");
    assert_yaml_bytes_eq(
        "architecture-only.thf",
        &serialize(&architecture_only_model()),
        &expected,
    );

    let model =
        read_threat_model(&fixture_path("architecture-only.thf")).expect("architecture-only reads");
    assert_eq!(model.metadata.threat_analysis_enabled, Some(false));
    assert!(model.threats.is_empty());
}

#[test]
fn architecture_fixtures_pass_reader_validation() {
    for name in ["architecture-canonical-full.thf", "architecture-only.thf"] {
        read_threat_model(&fixture_path(name))
            .unwrap_or_else(|e| panic!("architecture fixture {name} was rejected: {e}"));
    }
}

#[test]
fn reclassifying_one_element_layer_changes_exactly_one_line() {
    // The discriminating test for "git diffs for common architecture edits stay minimal". A
    // `skip_serializing_if` omission or a field reorder would perturb unrelated lines and fail.
    let original = serialize(&max_filled_model());

    let mut edited = max_filled_model();
    let web_app = edited
        .elements
        .iter_mut()
        .find(|e| e.id == "web-app")
        .expect("web-app element");
    assert_eq!(web_app.layer.as_deref(), Some("presentation"));
    web_app.layer = Some("application".to_string());
    let updated = serialize(&edited);

    assert_eq!(
        removed_lines(&original, &updated),
        vec![("  layer: presentation", 1)],
        "exactly one line should be removed"
    );
    assert_eq!(
        removed_lines(&updated, &original),
        vec![("  layer: application", 1)],
        "exactly one line should be added"
    );
}

#[test]
fn appending_one_group_changes_only_that_groups_lines() {
    use crate::models::Group;

    let original = serialize(&max_filled_model());

    let mut edited = max_filled_model();
    edited.groups.push(Group {
        id: "extra-group".to_string(),
        name: "Extra Group".to_string(),
        r#type: None,
        parent: None,
        description: None,
        position: None,
        size: None,
        fill_color: None,
        stroke_color: None,
        fill_opacity: None,
        stroke_opacity: None,
    });
    let updated = serialize(&edited);

    assert!(
        removed_lines(&original, &updated).is_empty(),
        "appending a group must not remove any line"
    );
    // `removed_lines` returns its result sorted; a two-space-indented line sorts before `- id`.
    assert_eq!(
        removed_lines(&updated, &original),
        vec![("  name: Extra Group", 1), ("- id: extra-group", 1)],
        "appending a group adds exactly its own two lines"
    );
}

/// The charter property of the relationships section: architecture overlays must
/// never influence threat generation. Relationships are non-data edges — folding
/// them into flow-targeted STRIDE rules would manufacture tampering and
/// information-disclosure findings on edges that carry no data. This pins the
/// property so a future refactor cannot silently start iterating them.
#[test]
fn architecture_sections_do_not_change_stride_output() {
    let full = read_threat_model(&fixture_path("architecture-canonical-full.thf"))
        .expect("architecture fixture parses");

    let mut stripped = full.clone();
    stripped.layers.clear();
    stripped.groups.clear();
    stripped.relationships.clear();
    stripped.metadata.threat_analysis_enabled = None;
    for element in &mut stripped.elements {
        element.layer = None;
        element.group = None;
        element.tags.clear();
    }

    // Threat ids are freshly generated on every analyze() call, so compare
    // everything except the id.
    let essence = |threats: &[crate::models::Threat]| -> Vec<_> {
        threats
            .iter()
            .map(|t| {
                (
                    t.title.clone(),
                    t.category.clone(),
                    t.element.clone(),
                    t.flow.clone(),
                    t.severity.clone(),
                    t.description.clone(),
                )
            })
            .collect()
    };

    let with_architecture = essence(&crate::stride::analyze(&full));
    let without_architecture = essence(&crate::stride::analyze(&stripped));

    // Guard against a vacuous pass: the fixture must actually produce threats,
    // otherwise "equal outputs" would also hold for two empty vectors.
    assert!(
        !with_architecture.is_empty(),
        "the architecture fixture must generate threats for this comparison to mean anything"
    );
    assert_eq!(
        with_architecture, without_architecture,
        "layers, groups, relationships, and tags must not affect STRIDE output"
    );
}
