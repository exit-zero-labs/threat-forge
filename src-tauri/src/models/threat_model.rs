use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Root threat model document — maps to `.threatforge.yaml`
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ThreatModel {
    pub version: String,
    pub metadata: Metadata,
    #[serde(default)]
    pub elements: Vec<Element>,
    #[serde(default)]
    pub data_flows: Vec<DataFlow>,
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
            },
            elements: Vec::new(),
            data_flows: Vec::new(),
            trust_boundaries: Vec::new(),
            threats: Vec::new(),
            diagrams: vec![Diagram {
                id: "main-dfd".to_string(),
                name: "Level 0 DFD".to_string(),
                layout_file: ".threatforge/layouts/main-dfd.json".to_string(),
            }],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Metadata {
    pub title: String,
    pub author: String,
    pub created: NaiveDate,
    pub modified: NaiveDate,
    #[serde(default)]
    pub description: String,
}

/// DFD element types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ElementType {
    Process,
    DataStore,
    ExternalEntity,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Element {
    pub id: String,
    #[serde(rename = "type")]
    pub element_type: ElementType,
    pub name: String,
    #[serde(default)]
    pub trust_zone: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(default)]
    pub description: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub technologies: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stores: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub encryption: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DataFlow {
    pub id: String,
    pub from: String,
    pub to: String,
    #[serde(default)]
    pub protocol: String,
    #[serde(default)]
    pub data: Vec<String>,
    #[serde(default)]
    pub authenticated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct TrustBoundary {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub contains: Vec<String>,
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
#[serde(deny_unknown_fields)]
pub struct Mitigation {
    pub status: MitigationStatus,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
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
#[serde(deny_unknown_fields)]
pub struct Diagram {
    pub id: String,
    pub name: String,
    pub layout_file: String,
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
    fn test_rejects_unknown_fields() {
        let yaml = r#"
version: "1.0"
metadata:
  title: "Test"
  author: "Test"
  created: 2026-03-15
  modified: 2026-03-15
unknown_field: "should fail"
"#;
        let result = serde_yaml::from_str::<ThreatModel>(yaml);
        assert!(result.is_err(), "Should reject unknown top-level fields");
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
}
