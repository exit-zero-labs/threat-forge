use crate::errors::ThreatForgeError;
use crate::models::{DiagramLayout, ThreatModel};
use std::path::Path;

/// Read and parse a `.threatforge.yaml` file
pub fn read_threat_model(path: &Path) -> Result<ThreatModel, ThreatForgeError> {
    let contents = std::fs::read_to_string(path).map_err(|e| ThreatForgeError::FileRead {
        path: path.display().to_string(),
        source: e,
    })?;

    let model: ThreatModel =
        serde_yaml::from_str(&contents).map_err(|e| ThreatForgeError::YamlParse {
            path: path.display().to_string(),
            source: e,
        })?;

    validate_version(&model.version)?;
    validate_references(&model)?;

    Ok(model)
}

/// Read a diagram layout JSON file
pub fn read_layout(path: &Path) -> Result<DiagramLayout, ThreatForgeError> {
    let contents = std::fs::read_to_string(path).map_err(|e| ThreatForgeError::FileRead {
        path: path.display().to_string(),
        source: e,
    })?;

    let layout: DiagramLayout =
        serde_json::from_str(&contents).map_err(|e| ThreatForgeError::JsonParse {
            path: path.display().to_string(),
            source: e,
        })?;

    Ok(layout)
}

/// Validate the schema version is supported
fn validate_version(version: &str) -> Result<(), ThreatForgeError> {
    match version {
        "1.0" => Ok(()),
        _ => Err(ThreatForgeError::UnsupportedVersion {
            version: version.to_string(),
            supported: vec!["1.0".to_string()],
        }),
    }
}

/// Validate cross-references within the model
fn validate_references(model: &ThreatModel) -> Result<(), ThreatForgeError> {
    let element_ids: Vec<&str> = model.elements.iter().map(|e| e.id.as_str()).collect();
    let flow_ids: Vec<&str> = model.data_flows.iter().map(|f| f.id.as_str()).collect();

    // Check for duplicate element IDs
    let mut seen = std::collections::HashSet::new();
    for id in &element_ids {
        if !seen.insert(id) {
            return Err(ThreatForgeError::DuplicateId {
                id: id.to_string(),
                section: "elements".to_string(),
            });
        }
    }

    // Check for duplicate flow IDs
    seen.clear();
    for id in &flow_ids {
        if !seen.insert(id) {
            return Err(ThreatForgeError::DuplicateId {
                id: id.to_string(),
                section: "data_flows".to_string(),
            });
        }
    }

    // Validate data flow references point to existing elements
    for flow in &model.data_flows {
        if !element_ids.contains(&flow.from.as_str()) {
            return Err(ThreatForgeError::InvalidReference {
                field: format!("data_flows[{}].from", flow.id),
                reference: flow.from.clone(),
                valid: element_ids.iter().map(|s| s.to_string()).collect(),
            });
        }
        if !element_ids.contains(&flow.to.as_str()) {
            return Err(ThreatForgeError::InvalidReference {
                field: format!("data_flows[{}].to", flow.id),
                reference: flow.to.clone(),
                valid: element_ids.iter().map(|s| s.to_string()).collect(),
            });
        }
    }

    // Validate trust boundary references
    for boundary in &model.trust_boundaries {
        for contained in &boundary.contains {
            if !element_ids.contains(&contained.as_str()) {
                return Err(ThreatForgeError::InvalidReference {
                    field: format!("trust_boundaries[{}].contains", boundary.id),
                    reference: contained.clone(),
                    valid: element_ids.iter().map(|s| s.to_string()).collect(),
                });
            }
        }
    }

    // Validate threat references
    for threat in &model.threats {
        if let Some(ref element) = threat.element {
            if !element_ids.contains(&element.as_str()) {
                return Err(ThreatForgeError::InvalidReference {
                    field: format!("threats[{}].element", threat.id),
                    reference: element.clone(),
                    valid: element_ids.iter().map(|s| s.to_string()).collect(),
                });
            }
        }
        if let Some(ref flow) = threat.flow {
            if !flow_ids.contains(&flow.as_str()) {
                return Err(ThreatForgeError::InvalidReference {
                    field: format!("threats[{}].flow", threat.id),
                    reference: flow.clone(),
                    valid: flow_ids.iter().map(|s| s.to_string()).collect(),
                });
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    fn write_temp_yaml(content: &str) -> NamedTempFile {
        let mut file = NamedTempFile::new().unwrap();
        file.write_all(content.as_bytes()).unwrap();
        file
    }

    #[test]
    fn test_read_valid_threat_model() {
        let yaml = r#"
version: "1.0"
metadata:
  title: "Test Model"
  author: "Test"
  created: 2026-03-15
  modified: 2026-03-15
elements:
  - id: app
    type: process
    name: "Application"
data_flows: []
trust_boundaries: []
threats: []
diagrams:
  - id: main-dfd
    name: "Level 0 DFD"
    layout_file: ".threatforge/layouts/main-dfd.json"
"#;
        let file = write_temp_yaml(yaml);
        let model = read_threat_model(file.path()).unwrap();
        assert_eq!(model.metadata.title, "Test Model");
        assert_eq!(model.elements.len(), 1);
    }

    #[test]
    fn test_rejects_unsupported_version() {
        let yaml = r#"
version: "2.0"
metadata:
  title: "Test"
  author: "Test"
  created: 2026-03-15
  modified: 2026-03-15
"#;
        let file = write_temp_yaml(yaml);
        let result = read_threat_model(file.path());
        assert!(result.is_err());
        assert!(
            result.unwrap_err().to_string().contains("Unsupported"),
            "Error should mention unsupported version"
        );
    }

    #[test]
    fn test_rejects_duplicate_element_ids() {
        let yaml = r#"
version: "1.0"
metadata:
  title: "Test"
  author: "Test"
  created: 2026-03-15
  modified: 2026-03-15
elements:
  - id: app
    type: process
    name: "App 1"
  - id: app
    type: process
    name: "App 2"
"#;
        let file = write_temp_yaml(yaml);
        let result = read_threat_model(file.path());
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Duplicate"));
    }

    #[test]
    fn test_rejects_invalid_flow_reference() {
        let yaml = r#"
version: "1.0"
metadata:
  title: "Test"
  author: "Test"
  created: 2026-03-15
  modified: 2026-03-15
elements:
  - id: app
    type: process
    name: "App"
data_flows:
  - id: flow-1
    from: app
    to: nonexistent
    protocol: HTTPS
"#;
        let file = write_temp_yaml(yaml);
        let result = read_threat_model(file.path());
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Invalid reference"));
    }
}
