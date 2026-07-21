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
