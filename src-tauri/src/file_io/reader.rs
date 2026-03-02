use crate::errors::ThreatForgeError;
use crate::models::{DiagramLayout, Position, Size, ThreatModel, Viewport};
use std::collections::HashMap;
use std::path::Path;

/// Read and parse a `.thf` file
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

/// Migrate old-format models that use sidecar layout JSON files.
///
/// Detects diagrams with `layout_file: Some(...)` and `viewport: None`,
/// reads the sidecar JSON, and merges positions into inline model fields.
/// Failures are non-fatal — missing layout files are silently skipped.
pub fn merge_layout_into_model(model: &mut ThreatModel, model_path: &Path) {
    let model_dir = match model_path.parent() {
        Some(dir) => dir,
        None => return,
    };

    for diagram in &mut model.diagrams {
        // Only migrate if there's a layout_file but no inline viewport yet
        let layout_file = match (&diagram.layout_file, &diagram.viewport) {
            (Some(lf), None) => lf.clone(),
            _ => continue,
        };

        let layout_path = model_dir.join(&layout_file);
        let layout = match read_layout(&layout_path) {
            Ok(l) => l,
            Err(_) => continue, // Non-fatal: layout file may not exist
        };

        // Build lookup from node ID to position data
        let positions: HashMap<&str, _> = layout.nodes.iter().map(|n| (n.id.as_str(), n)).collect();

        // Merge positions into elements
        for element in &mut model.elements {
            if let Some(np) = positions.get(element.id.as_str()) {
                if element.position.is_none() {
                    element.position = Some(Position { x: np.x, y: np.y });
                }
            }
        }

        // Merge positions and sizes into trust boundaries
        for boundary in &mut model.trust_boundaries {
            if let Some(np) = positions.get(boundary.id.as_str()) {
                if boundary.position.is_none() {
                    boundary.position = Some(Position { x: np.x, y: np.y });
                }
                if boundary.size.is_none() {
                    if let (Some(w), Some(h)) = (np.width, np.height) {
                        boundary.size = Some(Size {
                            width: w,
                            height: h,
                        });
                    }
                }
            }
        }

        // Set diagram viewport from layout
        diagram.viewport = Some(Viewport {
            x: layout.viewport.x,
            y: layout.viewport.y,
            zoom: layout.viewport.zoom,
        });
    }
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
    use tempfile::{NamedTempFile, TempDir};

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
    fn test_merge_layout_into_model() {
        let dir = TempDir::new().unwrap();
        let model_path = dir.path().join("test.thf");
        let layout_dir = dir.path().join(".threatforge/layouts");
        std::fs::create_dir_all(&layout_dir).unwrap();

        // Write a YAML model with old-style layout_file reference
        let yaml = r#"
version: "1.0"
metadata:
  title: "Migration Test"
  author: "Test"
  created: 2026-03-15
  modified: 2026-03-15
elements:
  - id: web-app
    type: process
    name: "Web App"
  - id: db
    type: data_store
    name: "Database"
trust_boundaries:
  - id: boundary-1
    name: "Internal"
    contains: [web-app, db]
diagrams:
  - id: main-dfd
    name: "Level 0 DFD"
    layout_file: ".threatforge/layouts/main-dfd.json"
"#;
        std::fs::write(&model_path, yaml).unwrap();

        // Write matching layout JSON
        let layout_json = r#"{
  "diagram_id": "main-dfd",
  "viewport": { "x": 10.0, "y": 20.0, "zoom": 1.5 },
  "nodes": [
    { "id": "web-app", "x": 100.0, "y": 200.0 },
    { "id": "db", "x": 300.0, "y": 400.0 },
    { "id": "boundary-1", "x": 50.0, "y": 50.0, "width": 600.0, "height": 500.0 }
  ]
}"#;
        std::fs::write(layout_dir.join("main-dfd.json"), layout_json).unwrap();

        let mut model = read_threat_model(&model_path).unwrap();
        merge_layout_into_model(&mut model, &model_path);

        // Verify element positions were merged
        assert_eq!(
            model.elements[0].position,
            Some(Position { x: 100.0, y: 200.0 }),
            "web-app position should be merged from layout"
        );
        assert_eq!(
            model.elements[1].position,
            Some(Position { x: 300.0, y: 400.0 }),
            "db position should be merged from layout"
        );

        // Verify boundary position and size
        assert_eq!(
            model.trust_boundaries[0].position,
            Some(Position { x: 50.0, y: 50.0 })
        );
        assert_eq!(
            model.trust_boundaries[0].size,
            Some(Size {
                width: 600.0,
                height: 500.0
            })
        );

        // Verify viewport was set on diagram
        assert_eq!(
            model.diagrams[0].viewport,
            Some(Viewport {
                x: 10.0,
                y: 20.0,
                zoom: 1.5
            })
        );
    }

    #[test]
    fn test_merge_layout_skips_when_no_layout_file() {
        let dir = TempDir::new().unwrap();
        let model_path = dir.path().join("test.thf");

        // Write a model without layout_file (new format)
        let yaml = r#"
version: "1.0"
metadata:
  title: "New Format"
  author: "Test"
  created: 2026-03-15
  modified: 2026-03-15
elements:
  - id: app
    type: process
    name: "App"
    position:
      x: 50.0
      y: 60.0
diagrams:
  - id: main-dfd
    name: "Level 0 DFD"
    viewport:
      x: 0.0
      y: 0.0
      zoom: 1.0
"#;
        std::fs::write(&model_path, yaml).unwrap();

        let mut model = read_threat_model(&model_path).unwrap();
        merge_layout_into_model(&mut model, &model_path);

        // Position should remain unchanged (not overwritten)
        assert_eq!(
            model.elements[0].position,
            Some(Position { x: 50.0, y: 60.0 })
        );
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
