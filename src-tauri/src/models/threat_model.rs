use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Root threat model document — maps to `.thf`
///
/// Section order is declarations-before-references:
/// `version → metadata → layers → groups → elements → data_flows → relationships →
/// trust_boundaries → threats → diagrams`. The three architecture sections (`layers`, `groups`,
/// `relationships`) carry `skip_serializing_if = "Vec::is_empty"`, so a document written before
/// they existed re-serializes byte-for-byte unchanged — their insertion position cannot perturb
/// it.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ThreatModel {
    pub version: String,
    pub metadata: Metadata,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub layers: Vec<Layer>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub groups: Vec<Group>,
    #[serde(default)]
    pub elements: Vec<Element>,
    #[serde(default)]
    pub data_flows: Vec<DataFlow>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub relationships: Vec<Relationship>,
    #[serde(default)]
    pub trust_boundaries: Vec<TrustBoundary>,
    #[serde(default)]
    pub threats: Vec<Threat>,
    #[serde(default)]
    pub diagrams: Vec<Diagram>,
}

impl ThreatModel {
    pub fn new(title: &str, author: &str) -> Self {
        let today = chrono::Local::now().date_naive();
        Self {
            version: "1.0".to_string(),
            metadata: Metadata {
                title: title.to_string(),
                author: author.to_string(),
                created: today,
                modified: today,
                description: String::new(),
                created_by: None,
                modified_by: None,
                last_edit_timestamp: None,
                threat_analysis_enabled: None,
                settings: None,
            },
            layers: Vec::new(),
            groups: Vec::new(),
            elements: Vec::new(),
            data_flows: Vec::new(),
            relationships: Vec::new(),
            trust_boundaries: Vec::new(),
            threats: Vec::new(),
            diagrams: vec![Diagram {
                id: "main-dfd".to_string(),
                name: "Level 0 DFD".to_string(),
                kind: None,
                description: None,
                layout_file: None,
                viewport: None,
            }],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Metadata {
    pub title: String,
    pub author: String,
    pub created: NaiveDate,
    pub modified: NaiveDate,
    #[serde(default)]
    pub description: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_by: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub modified_by: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_edit_timestamp: Option<i64>,
    /// Tri-state threat-analysis flag. `None` must not be read as "disabled": an existing file
    /// carries no flag, and its analysis state is inferred from whether it has threats (see the
    /// resolution helper deferred to issue #58). Only an explicit value overrides that inference.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub threat_analysis_enabled: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub settings: Option<FileSettings>,
}

/// Per-file settings stored in the YAML metadata section.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FileSettings {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub grid_size: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_element_fill: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_element_stroke: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_boundary_fill: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_boundary_stroke: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Element {
    pub id: String,
    /// Component type string (e.g. "api_gateway", "sql_database", "generic").
    #[serde(rename = "type")]
    pub element_type: String,
    pub name: String,
    #[serde(default)]
    pub trust_zone: String,
    /// Optional architecture layer this element belongs to (references `layers[].id`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub layer: Option<String>,
    /// Optional non-security group this element belongs to (references `groups[].id`).
    /// Membership lives on the element, not as a `contains` list on the group.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subtype: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(default)]
    pub description: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub technologies: Vec<String>,
    /// Free-form classification labels. Mirrors `technologies` serde behavior so an unset tag
    /// list never materializes a `tags: []` line.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stores: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub encryption: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub position: Option<Position>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fill_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stroke_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fill_opacity: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stroke_opacity: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_size: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_weight: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DataFlow {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub flow_number: Option<u32>,
    #[serde(default)]
    pub name: String,
    pub from: String,
    pub to: String,
    #[serde(default)]
    pub protocol: String,
    #[serde(default)]
    pub data: Vec<String>,
    #[serde(default)]
    pub authenticated: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label_offset: Option<Position>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_handle: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_handle: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stroke_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stroke_opacity: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TrustBoundary {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub contains: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub position: Option<Position>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size: Option<Size>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fill_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stroke_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fill_opacity: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stroke_opacity: Option<f64>,
}

/// A horizontal architecture layer (e.g. presentation, application, data).
///
/// Array order is display order; there is deliberately no `order` integer, which would create
/// renumbering churn on every reorder.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Layer {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

/// A non-security grouping of components (e.g. a cluster or subsystem).
///
/// Field set and serde attributes mirror [`TrustBoundary`] so the boundary node machinery can be
/// reused, with two differences: membership is element-side (`element.group`) rather than a
/// `contains` list, and a group may nest inside another via `parent`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Group {
    pub id: String,
    pub name: String,
    /// Free-form group kind. Serialized as `type`, following the `Element::element_type`
    /// precedent.
    #[serde(rename = "type", default, skip_serializing_if = "Option::is_none")]
    pub r#type: Option<String>,
    /// Optional parent group for nesting (references another `groups[].id`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub position: Option<Position>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size: Option<Size>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fill_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stroke_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fill_opacity: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stroke_opacity: Option<f64>,
}

/// A non-data-flow relationship between two elements (e.g. `deploys_to`, `depends_on`).
///
/// Deliberately separate from [`DataFlow`]: STRIDE analyzes data flows, so folding these edges
/// into `data_flows` would manufacture false-positive threats. `type` is required — the section
/// is new, so requiring it costs no backward compatibility and fails closed on an untyped edge.
/// The visual fields mirror [`DataFlow`] and nothing more.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Relationship {
    pub id: String,
    #[serde(rename = "type")]
    pub relationship_type: String,
    pub from: String,
    pub to: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_handle: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_handle: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label_offset: Option<Position>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stroke_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stroke_opacity: Option<f64>,
}

/// STRIDE threat categories
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum StrideCategory {
    Spoofing,
    Tampering,
    Repudiation,
    #[serde(rename = "Information Disclosure")]
    InformationDisclosure,
    #[serde(rename = "Denial of Service")]
    DenialOfService,
    #[serde(rename = "Elevation of Privilege")]
    ElevationOfPrivilege,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Critical,
    High,
    Medium,
    Low,
    Info,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MitigationStatus {
    NotStarted,
    InProgress,
    Mitigated,
    Accepted,
    Transferred,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Mitigation {
    pub status: MitigationStatus,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Threat {
    pub id: String,
    pub title: String,
    pub category: StrideCategory,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub element: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub flow: Option<String>,
    pub severity: Severity,
    #[serde(default)]
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mitigation: Option<Mitigation>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Diagram {
    pub id: String,
    pub name: String,
    /// Free-form view kind (e.g. `architecture`, `dfd`, `deployment`). The vocabulary is owned by
    /// the component/icon registry (#59), so extending it needs no schema change.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub layout_file: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub viewport: Option<Viewport>,
}

/// Layout data stored in `.threatforge/layouts/*.json`
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DiagramLayout {
    pub diagram_id: String,
    pub viewport: Viewport,
    #[serde(default)]
    pub nodes: Vec<NodePosition>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Viewport {
    pub x: f64,
    pub y: f64,
    pub zoom: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Position {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Size {
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NodePosition {
    pub id: String,
    pub x: f64,
    pub y: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<f64>,
}

/// Generate a new element ID from a name
#[allow(dead_code)]
pub fn generate_element_id(name: &str) -> String {
    name.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

/// Generate a unique threat ID
pub fn generate_threat_id() -> String {
    format!(
        "threat-{}",
        Uuid::new_v4()
            .as_simple()
            .to_string()
            .get(..8)
            .unwrap_or("00000000")
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_serialize_deserialize_round_trip() {
        let model = ThreatModel::new("Test Model", "Test Author");
        let yaml = serde_yaml::to_string(&model).expect("Failed to serialize");
        let deserialized: ThreatModel = serde_yaml::from_str(&yaml).expect("Failed to deserialize");
        assert_eq!(
            model, deserialized,
            "Round-trip serialization should produce equal models"
        );
    }

    #[test]
    fn test_sample_yaml_deserialization() {
        let yaml = r#"
version: "1.0"
metadata:
  title: "Payment Processing Service"
  author: "Alex Chen"
  created: 2026-03-15
  modified: 2026-03-20
  description: |
    Threat model for the payment processing microservice.

elements:
  - id: web-app
    type: process
    name: "Web Application"
    trust_zone: internal
    description: "React frontend served via CDN"

  - id: payment-db
    type: data_store
    name: "Payment Database"
    trust_zone: internal
    stores: [transaction_records, tokenized_card_data]
    encryption: AES-256-at-rest

  - id: stripe-api
    type: external_entity
    name: "Stripe API"
    trust_zone: external

data_flows:
  - id: flow-1
    from: web-app
    to: payment-db
    protocol: PostgreSQL/TLS
    data: [transaction_records]
    authenticated: true

trust_boundaries:
  - id: boundary-1
    name: "Corporate Network"
    contains: [web-app, payment-db]

threats:
  - id: threat-1
    title: "SQL Injection on payment queries"
    category: Tampering
    element: web-app
    flow: flow-1
    severity: high
    description: |
      Malicious SQL could be injected through payment
      parameters if input validation is insufficient.
    mitigation:
      status: mitigated
      description: "Parameterized queries via ORM"

diagrams:
  - id: main-dfd
    name: "Level 0 DFD"
    layout_file: ".threatforge/layouts/main-dfd.json"
"#;
        let model: ThreatModel = serde_yaml::from_str(yaml).expect("Failed to parse sample YAML");
        assert_eq!(model.version, "1.0");
        assert_eq!(model.metadata.title, "Payment Processing Service");
        assert_eq!(model.elements.len(), 3);
        assert_eq!(model.data_flows.len(), 1);
        assert_eq!(model.trust_boundaries.len(), 1);
        assert_eq!(model.threats.len(), 1);
        assert_eq!(model.threats[0].category, StrideCategory::Tampering);
        assert_eq!(model.threats[0].severity, Severity::High);
    }

    #[test]
    fn test_generate_element_id() {
        assert_eq!(generate_element_id("Web Application"), "web-application");
        assert_eq!(generate_element_id("API Gateway"), "api-gateway");
        assert_eq!(generate_element_id("payment-db"), "payment-db");
        assert_eq!(generate_element_id("  Stripe  API  "), "stripe-api");
    }

    #[test]
    fn test_generate_threat_id() {
        let id = generate_threat_id();
        assert!(id.starts_with("threat-"));
        assert_eq!(id.len(), 15); // "threat-" (7) + 8 hex chars
    }

    #[test]
    fn test_inline_position_round_trip() {
        let yaml = r##"
version: "1.0"
metadata:
  title: "Position Test"
  author: "Test"
  created: 2026-03-15
  modified: 2026-03-15
elements:
  - id: web-app
    type: process
    name: "Web App"
    position:
      x: 100.0
      y: 200.0
trust_boundaries:
  - id: boundary-1
    name: "Internal"
    contains: [web-app]
    position:
      x: 50.0
      y: 50.0
    size:
      width: 500.0
      height: 400.0
    fill_color: "#3b82f6"
    stroke_color: "#1e40af"
    fill_opacity: 0.1
    stroke_opacity: 0.6
data_flows:
  - id: flow-1
    from: web-app
    to: web-app
    label_offset:
      x: 10.0
      y: -5.0
    stroke_color: "#ef4444"
    stroke_opacity: 0.8
diagrams:
  - id: main-dfd
    name: "Level 0 DFD"
    viewport:
      x: 0.0
      y: 0.0
      zoom: 1.5
"##;
        let model: ThreatModel = serde_yaml::from_str(yaml).expect("Failed to parse");
        assert_eq!(
            model.elements[0].position,
            Some(Position { x: 100.0, y: 200.0 })
        );
        assert_eq!(
            model.trust_boundaries[0].position,
            Some(Position { x: 50.0, y: 50.0 })
        );
        assert_eq!(
            model.trust_boundaries[0].size,
            Some(Size {
                width: 500.0,
                height: 400.0
            })
        );
        assert_eq!(
            model.trust_boundaries[0].fill_color,
            Some(String::from("#3b82f6"))
        );
        assert_eq!(model.trust_boundaries[0].fill_opacity, Some(0.1));
        assert_eq!(
            model.data_flows[0].label_offset,
            Some(Position { x: 10.0, y: -5.0 })
        );
        assert_eq!(
            model.data_flows[0].stroke_color,
            Some(String::from("#ef4444"))
        );
        assert_eq!(model.data_flows[0].stroke_opacity, Some(0.8));
        assert_eq!(
            model.diagrams[0].viewport,
            Some(Viewport {
                x: 0.0,
                y: 0.0,
                zoom: 1.5
            })
        );
        assert!(model.diagrams[0].layout_file.is_none());

        // Round-trip
        let reserialized = serde_yaml::to_string(&model).expect("Failed to serialize");
        let reparsed: ThreatModel = serde_yaml::from_str(&reserialized).expect("Failed to reparse");
        assert_eq!(model, reparsed, "Round-trip should produce equal models");
    }

    #[test]
    fn test_old_yaml_without_positions_parses() {
        let yaml = r#"
version: "1.0"
metadata:
  title: "Old Format"
  author: "Test"
  created: 2026-03-15
  modified: 2026-03-15
elements:
  - id: app
    type: process
    name: "App"
trust_boundaries:
  - id: boundary-1
    name: "Internal"
    contains: [app]
data_flows:
  - id: flow-1
    from: app
    to: app
diagrams:
  - id: main-dfd
    name: "Level 0 DFD"
    layout_file: ".threatforge/layouts/main-dfd.json"
"#;
        let model: ThreatModel = serde_yaml::from_str(yaml).expect("Old format should parse");
        assert!(model.elements[0].position.is_none());
        assert!(model.trust_boundaries[0].position.is_none());
        assert!(model.trust_boundaries[0].size.is_none());
        assert!(model.trust_boundaries[0].fill_color.is_none());
        assert!(model.data_flows[0].label_offset.is_none());
        assert!(model.data_flows[0].stroke_color.is_none());
        assert!(model.data_flows[0].stroke_opacity.is_none());
        assert_eq!(
            model.diagrams[0].layout_file,
            Some(".threatforge/layouts/main-dfd.json".to_string())
        );
        assert!(model.diagrams[0].viewport.is_none());
    }

    #[test]
    fn test_unknown_fields_are_tolerated() {
        let yaml = r#"
version: "1.0"
metadata:
  title: "Test"
  author: "Test"
  created: 2026-03-15
  modified: 2026-03-15
unknown_field: "should be tolerated"
"#;
        let result = serde_yaml::from_str::<ThreatModel>(yaml);
        assert!(
            result.is_ok(),
            "Unknown fields should be tolerated for forward compatibility"
        );
    }

    #[test]
    fn test_subtype_round_trip() {
        let yaml = r#"
version: "1.0"
metadata:
  title: "Subtype Test"
  author: "Test"
  created: 2026-03-15
  modified: 2026-03-15
elements:
  - id: api-gw
    type: process
    name: "API Gateway"
    subtype: api_gateway
    icon: router
"#;
        let model: ThreatModel = serde_yaml::from_str(yaml).expect("Failed to parse");
        assert_eq!(model.elements[0].subtype, Some("api_gateway".to_string()));
        assert_eq!(model.elements[0].icon, Some("router".to_string()));

        // Round-trip
        let reserialized = serde_yaml::to_string(&model).expect("Failed to serialize");
        let reparsed: ThreatModel = serde_yaml::from_str(&reserialized).expect("Failed to reparse");
        assert_eq!(model, reparsed, "Round-trip should produce equal models");
    }

    #[test]
    fn test_yaml_without_subtype_parses() {
        let yaml = r#"
version: "1.0"
metadata:
  title: "No Subtype"
  author: "Test"
  created: 2026-03-15
  modified: 2026-03-15
elements:
  - id: app
    type: process
    name: "App"
"#;
        let model: ThreatModel = serde_yaml::from_str(yaml).expect("Old format should parse");
        assert!(model.elements[0].subtype.is_none());
    }

    #[test]
    fn test_file_settings_round_trip() {
        let yaml = r##"
version: "1.0"
metadata:
  title: "Settings Test"
  author: "Test"
  created: 2026-03-15
  modified: 2026-03-15
  settings:
    grid_size: 24
    default_element_fill: "#3b82f6"
    default_element_stroke: "#1e40af"
    default_boundary_fill: "#22c55e"
    default_boundary_stroke: "#15803d"
"##;
        let model: ThreatModel = serde_yaml::from_str(yaml).expect("Failed to parse");
        let settings = model
            .metadata
            .settings
            .as_ref()
            .expect("settings should be present");
        assert_eq!(settings.grid_size, Some(24));
        assert_eq!(settings.default_element_fill, Some("#3b82f6".to_string()));
        assert_eq!(settings.default_element_stroke, Some("#1e40af".to_string()));
        assert_eq!(settings.default_boundary_fill, Some("#22c55e".to_string()));
        assert_eq!(
            settings.default_boundary_stroke,
            Some("#15803d".to_string())
        );

        // Round-trip
        let reserialized = serde_yaml::to_string(&model).expect("Failed to serialize");
        let reparsed: ThreatModel = serde_yaml::from_str(&reserialized).expect("Failed to reparse");
        assert_eq!(model, reparsed, "Round-trip should produce equal models");
    }

    #[test]
    fn test_yaml_without_settings_parses() {
        let yaml = r#"
version: "1.0"
metadata:
  title: "No Settings"
  author: "Test"
  created: 2026-03-15
  modified: 2026-03-15
"#;
        let model: ThreatModel = serde_yaml::from_str(yaml).expect("Should parse without settings");
        assert!(model.metadata.settings.is_none());
    }

    #[test]
    fn test_file_settings_omitted_when_none() {
        let model = ThreatModel::new("Test", "Author");
        let yaml = serde_yaml::to_string(&model).expect("Failed to serialize");
        assert!(
            !yaml.contains("settings"),
            "settings should be omitted from YAML when None"
        );
    }

    #[test]
    fn test_flow_number_round_trip() {
        let yaml = r#"
version: "1.0"
metadata:
  title: "Flow Number Test"
  author: "Test"
  created: 2026-03-15
  modified: 2026-03-15
elements:
  - id: app
    type: process
    name: "App"
  - id: db
    type: data_store
    name: "DB"
data_flows:
  - id: flow-1
    flow_number: 1
    from: app
    to: db
  - id: flow-2
    flow_number: 2
    from: db
    to: app
"#;
        let model: ThreatModel = serde_yaml::from_str(yaml).expect("Failed to parse");
        assert_eq!(model.data_flows[0].flow_number, Some(1));
        assert_eq!(model.data_flows[1].flow_number, Some(2));

        // Round-trip
        let reserialized = serde_yaml::to_string(&model).expect("Failed to serialize");
        let reparsed: ThreatModel = serde_yaml::from_str(&reserialized).expect("Failed to reparse");
        assert_eq!(model, reparsed, "Round-trip should produce equal models");
    }

    #[test]
    fn test_flow_number_backward_compat() {
        let yaml = r#"
version: "1.0"
metadata:
  title: "No Flow Number"
  author: "Test"
  created: 2026-03-15
  modified: 2026-03-15
data_flows:
  - id: flow-1
    from: app
    to: db
"#;
        let model: ThreatModel = serde_yaml::from_str(yaml).expect("Old format should parse");
        assert!(
            model.data_flows[0].flow_number.is_none(),
            "flow_number should be None for old files"
        );
    }

    #[test]
    fn test_flow_number_omitted_when_none() {
        let model = ThreatModel::new("Test", "Author");
        let yaml = serde_yaml::to_string(&model).expect("Failed to serialize");
        assert!(
            !yaml.contains("flow_number"),
            "flow_number should be omitted from YAML when None"
        );
    }

    #[test]
    fn test_layout_serialization() {
        let layout = DiagramLayout {
            diagram_id: "main-dfd".to_string(),
            viewport: Viewport {
                x: 0.0,
                y: 0.0,
                zoom: 1.0,
            },
            nodes: vec![NodePosition {
                id: "web-app".to_string(),
                x: 100.0,
                y: 200.0,
                width: None,
                height: None,
            }],
        };
        let json = serde_json::to_string_pretty(&layout).expect("Failed to serialize layout");
        let deserialized: DiagramLayout =
            serde_json::from_str(&json).expect("Failed to deserialize layout");
        assert_eq!(layout, deserialized);
    }

    #[test]
    fn test_font_size_font_weight_round_trip() {
        let yaml = r##"
version: "1.0"
metadata:
  title: "Font Test"
  author: "Test"
  created: 2026-03-15
  modified: 2026-03-15
elements:
  - id: text-1
    type: text
    name: "API Gateway Cluster"
    font_size: 20.0
    font_weight: bold
    fill_color: "#94A3B8"
    fill_opacity: 0.8
"##;
        let model: ThreatModel = serde_yaml::from_str(yaml).expect("Failed to parse");
        assert_eq!(model.elements[0].element_type, "text");
        assert_eq!(model.elements[0].font_size, Some(20.0));
        assert_eq!(model.elements[0].font_weight, Some("bold".to_string()));

        // Round-trip
        let reserialized = serde_yaml::to_string(&model).expect("Failed to serialize");
        let reparsed: ThreatModel = serde_yaml::from_str(&reserialized).expect("Failed to reparse");
        assert_eq!(model, reparsed, "Round-trip should produce equal models");
    }

    #[test]
    fn test_font_fields_omitted_when_none() {
        let model = ThreatModel::new("Test", "Author");
        let yaml = serde_yaml::to_string(&model).expect("Failed to serialize");
        assert!(
            !yaml.contains("font_size"),
            "font_size should be omitted from YAML when None"
        );
        assert!(
            !yaml.contains("font_weight"),
            "font_weight should be omitted from YAML when None"
        );
    }

    #[test]
    fn test_old_yaml_without_font_fields_parses() {
        let yaml = r#"
version: "1.0"
metadata:
  title: "No Font Fields"
  author: "Test"
  created: 2026-03-15
  modified: 2026-03-15
elements:
  - id: app
    type: process
    name: "App"
"#;
        let model: ThreatModel = serde_yaml::from_str(yaml).expect("Old format should parse");
        assert!(model.elements[0].font_size.is_none());
        assert!(model.elements[0].font_weight.is_none());
    }

    #[test]
    fn test_new_sections_omitted_when_empty() {
        // A model with no architecture data must emit none of the new sections or fields, so a
        // document that predates them re-serializes unchanged.
        let model = ThreatModel::new("Test", "Author");
        let yaml = serde_yaml::to_string(&model).expect("Failed to serialize");
        for absent in [
            "layers",
            "groups",
            "relationships",
            "tags",
            "threat_analysis_enabled",
            "kind",
        ] {
            assert!(
                !yaml.contains(absent),
                "`{absent}` should be omitted from an empty model, got:\n{yaml}"
            );
        }
    }

    #[test]
    fn test_architecture_sections_round_trip() {
        let yaml = r#"
version: "1.0"
metadata:
  title: "Architecture Test"
  author: "Test"
  created: 2026-03-15
  modified: 2026-03-15
  threat_analysis_enabled: true
layers:
  - id: presentation
    name: "Presentation"
    description: "User-facing surfaces"
groups:
  - id: cluster-1
    name: "Frontend Cluster"
    type: cluster
  - id: cluster-2
    name: "API Cluster"
    type: cluster
    parent: cluster-1
elements:
  - id: web-app
    type: process
    name: "Web App"
    layer: presentation
    group: cluster-1
    tags: [pci, tier-1]
relationships:
  - id: rel-1
    type: depends_on
    from: web-app
    to: web-app
diagrams:
  - id: main-arch
    name: "Architecture View"
    kind: architecture
    description: "Top-level system view"
"#;
        let model: ThreatModel = serde_yaml::from_str(yaml).expect("Failed to parse");
        assert_eq!(model.metadata.threat_analysis_enabled, Some(true));
        assert_eq!(model.layers.len(), 1);
        assert_eq!(model.layers[0].id, "presentation");
        assert_eq!(model.groups.len(), 2);
        assert_eq!(model.groups[1].r#type.as_deref(), Some("cluster"));
        assert_eq!(model.groups[1].parent.as_deref(), Some("cluster-1"));
        assert_eq!(model.elements[0].layer.as_deref(), Some("presentation"));
        assert_eq!(model.elements[0].group.as_deref(), Some("cluster-1"));
        assert_eq!(model.elements[0].tags, vec!["pci", "tier-1"]);
        assert_eq!(model.relationships.len(), 1);
        assert_eq!(model.relationships[0].relationship_type, "depends_on");
        assert_eq!(model.diagrams[0].kind.as_deref(), Some("architecture"));
        assert_eq!(
            model.diagrams[0].description.as_deref(),
            Some("Top-level system view")
        );

        // Round-trip
        let reserialized = serde_yaml::to_string(&model).expect("Failed to serialize");
        let reparsed: ThreatModel = serde_yaml::from_str(&reserialized).expect("Failed to reparse");
        assert_eq!(model, reparsed, "Round-trip should produce equal models");
    }

    #[test]
    fn test_architecture_sections_backward_compat() {
        // A document with no architecture sections still parses, and every new collection is empty
        // and every new option is None.
        let yaml = r#"
version: "1.0"
metadata:
  title: "No Architecture"
  author: "Test"
  created: 2026-03-15
  modified: 2026-03-15
elements:
  - id: app
    type: process
    name: "App"
"#;
        let model: ThreatModel = serde_yaml::from_str(yaml).expect("Old format should parse");
        assert!(model.layers.is_empty());
        assert!(model.groups.is_empty());
        assert!(model.relationships.is_empty());
        assert!(model.metadata.threat_analysis_enabled.is_none());
        assert!(model.elements[0].layer.is_none());
        assert!(model.elements[0].group.is_none());
        assert!(model.elements[0].tags.is_empty());
    }

    #[test]
    fn test_group_type_serializes_as_type() {
        let yaml = r#"
version: "1.0"
metadata:
  title: "Group Type"
  author: "Test"
  created: 2026-03-15
  modified: 2026-03-15
groups:
  - id: cluster-1
    name: "Cluster"
    type: kubernetes_namespace
"#;
        let model: ThreatModel = serde_yaml::from_str(yaml).expect("Failed to parse");
        assert_eq!(
            model.groups[0].r#type.as_deref(),
            Some("kubernetes_namespace")
        );
        let reserialized = serde_yaml::to_string(&model).expect("Failed to serialize");
        assert!(
            reserialized.contains("type: kubernetes_namespace"),
            "group.r#type must serialize as `type`, got:\n{reserialized}"
        );
        assert!(
            !reserialized.contains("r#type"),
            "the raw identifier must not leak into YAML"
        );
    }

    #[test]
    fn test_unknown_fields_in_new_sections_are_tolerated() {
        // Forward compatibility must hold for the interiors of the new sections too: a future field
        // on a layer, group, or relationship parses without error (and is dropped on write).
        let yaml = r#"
version: "1.0"
metadata:
  title: "Forward Compat"
  author: "Test"
  created: 2026-03-15
  modified: 2026-03-15
layers:
  - id: presentation
    name: "Presentation"
    unknown_layer_field: ignored
groups:
  - id: cluster-1
    name: "Cluster"
    unknown_group_field: ignored
elements:
  - id: web-app
    type: process
    name: "Web App"
    layer: presentation
    group: cluster-1
relationships:
  - id: rel-1
    type: depends_on
    from: web-app
    to: web-app
    unknown_relationship_field: ignored
"#;
        let model: ThreatModel =
            serde_yaml::from_str(yaml).expect("unknown fields in new sections should be tolerated");
        assert_eq!(model.layers[0].id, "presentation");
        assert_eq!(model.groups[0].id, "cluster-1");
        assert_eq!(model.relationships[0].id, "rel-1");
    }
}
