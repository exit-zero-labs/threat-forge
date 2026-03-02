use std::collections::HashSet;

use crate::models::{
    generate_threat_id, Severity, StrideCategory, Threat, ThreatModel, TrustBoundary,
};

/// STRIDE category for threat matching — determined by component type.
#[derive(Debug, Clone, PartialEq, Eq)]
enum ComponentStrideCategory {
    Service,
    Store,
    Actor,
}

/// Map a component type string to its STRIDE category.
fn stride_category_for_type(element_type: &str) -> ComponentStrideCategory {
    match element_type {
        // Databases / stores
        "sql_database" | "nosql_database" | "cache" | "search_index" | "object_storage"
        | "secret_manager" | "data_store" | "file_storage" | "data_lake" | "backup_service"
        | "key_management" | "container_registry" => ComponentStrideCategory::Store,
        // Clients / actors
        "web_browser" | "mobile_app" | "desktop_app" | "iot_device" | "external_entity"
        | "api_client" | "cli_tool" => ComponentStrideCategory::Actor,
        // Everything else is a service (services, messaging, infra, security, networking, cloud, generic, process)
        _ => ComponentStrideCategory::Service,
    }
}

/// A rule template for generating STRIDE threats.
struct ThreatRule {
    category: StrideCategory,
    /// Which STRIDE categories this rule applies to.
    applicable_categories: Vec<ComponentStrideCategory>,
    /// Whether this rule targets data flows instead of elements.
    targets_flows: bool,
    title_template: &'static str,
    description_template: &'static str,
    severity: Severity,
}

/// Build the hardcoded set of STRIDE threat rules.
///
/// Rules are derived from Microsoft's STRIDE-per-element methodology:
/// - Service: Spoofing, Tampering, Repudiation, Information Disclosure, DoS, EoP
/// - Store: Tampering, Information Disclosure, Denial of Service
/// - Actor: Spoofing, Repudiation
/// - Data Flow: Tampering, Information Disclosure, Denial of Service
fn build_rules() -> Vec<ThreatRule> {
    vec![
        // ── Service threats ──────────────────────────────────────────
        ThreatRule {
            category: StrideCategory::Spoofing,
            applicable_categories: vec![ComponentStrideCategory::Service],
            targets_flows: false,
            title_template: "Spoofing of {name}",
            description_template: "An attacker may impersonate {name} to gain unauthorized access. Ensure authentication mechanisms verify the identity of callers.",
            severity: Severity::High,
        },
        ThreatRule {
            category: StrideCategory::Tampering,
            applicable_categories: vec![ComponentStrideCategory::Service],
            targets_flows: false,
            title_template: "Tampering with {name}",
            description_template: "An attacker may modify the behavior or inputs of {name}. Validate all inputs and ensure integrity checks are in place.",
            severity: Severity::High,
        },
        ThreatRule {
            category: StrideCategory::Repudiation,
            applicable_categories: vec![ComponentStrideCategory::Service],
            targets_flows: false,
            title_template: "Repudiation threat for {name}",
            description_template: "{name} may perform actions without adequate logging. Implement audit logging to ensure all operations are traceable.",
            severity: Severity::Medium,
        },
        ThreatRule {
            category: StrideCategory::InformationDisclosure,
            applicable_categories: vec![ComponentStrideCategory::Service],
            targets_flows: false,
            title_template: "Information disclosure from {name}",
            description_template: "{name} may leak sensitive information through error messages, logs, or side channels. Review outputs for data exposure.",
            severity: Severity::Medium,
        },
        ThreatRule {
            category: StrideCategory::DenialOfService,
            applicable_categories: vec![ComponentStrideCategory::Service],
            targets_flows: false,
            title_template: "Denial of service on {name}",
            description_template: "An attacker may overwhelm {name} with excessive requests or malformed inputs. Implement rate limiting and input validation.",
            severity: Severity::Medium,
        },
        ThreatRule {
            category: StrideCategory::ElevationOfPrivilege,
            applicable_categories: vec![ComponentStrideCategory::Service],
            targets_flows: false,
            title_template: "Elevation of privilege via {name}",
            description_template: "An attacker may exploit {name} to gain unauthorized privileges. Apply least-privilege principles and validate authorization.",
            severity: Severity::High,
        },

        // ── Store threats ───────────────────────────────────────
        ThreatRule {
            category: StrideCategory::Tampering,
            applicable_categories: vec![ComponentStrideCategory::Store],
            targets_flows: false,
            title_template: "Tampering with data in {name}",
            description_template: "An attacker may modify data in {name}. Use access controls, integrity constraints, and audit trails to detect unauthorized changes.",
            severity: Severity::High,
        },
        ThreatRule {
            category: StrideCategory::InformationDisclosure,
            applicable_categories: vec![ComponentStrideCategory::Store],
            targets_flows: false,
            title_template: "Information disclosure from {name}",
            description_template: "Sensitive data stored in {name} may be exposed to unauthorized users. Apply encryption at rest and strict access controls.",
            severity: Severity::High,
        },
        ThreatRule {
            category: StrideCategory::DenialOfService,
            applicable_categories: vec![ComponentStrideCategory::Store],
            targets_flows: false,
            title_template: "Denial of service on {name}",
            description_template: "An attacker may corrupt or exhaust {name} to disrupt service. Implement backups, storage quotas, and connection limits.",
            severity: Severity::Medium,
        },

        // ── Actor threats ──────────────────────────────────
        ThreatRule {
            category: StrideCategory::Spoofing,
            applicable_categories: vec![ComponentStrideCategory::Actor],
            targets_flows: false,
            title_template: "Spoofing of {name}",
            description_template: "An attacker may impersonate {name}. Verify the identity of external actors through authentication and certificate validation.",
            severity: Severity::High,
        },
        ThreatRule {
            category: StrideCategory::Repudiation,
            applicable_categories: vec![ComponentStrideCategory::Actor],
            targets_flows: false,
            title_template: "Repudiation by {name}",
            description_template: "{name} may deny having performed an action. Implement non-repudiation mechanisms such as digital signatures or audit logs.",
            severity: Severity::Medium,
        },

        // ── Data Flow threats ────────────────────────────────────────
        ThreatRule {
            category: StrideCategory::Tampering,
            applicable_categories: vec![],
            targets_flows: true,
            title_template: "Tampering with data flow between {source} and {target}",
            description_template: "Data in transit between {source} and {target} may be modified by an attacker. Use TLS/encryption and message integrity verification.",
            severity: Severity::High,
        },
        ThreatRule {
            category: StrideCategory::InformationDisclosure,
            applicable_categories: vec![],
            targets_flows: true,
            title_template: "Information disclosure on flow between {source} and {target}",
            description_template: "Sensitive data flowing between {source} and {target} may be intercepted. Ensure encryption in transit and minimize data exposure.",
            severity: Severity::High,
        },
        ThreatRule {
            category: StrideCategory::DenialOfService,
            applicable_categories: vec![],
            targets_flows: true,
            title_template: "Denial of service on flow between {source} and {target}",
            description_template: "The communication channel between {source} and {target} may be disrupted. Implement redundancy, timeouts, and retry logic.",
            severity: Severity::Medium,
        },
    ]
}

/// Look up element name by ID, falling back to the raw ID.
fn element_name<'a>(model: &'a ThreatModel, element_id: &'a str) -> &'a str {
    model
        .elements
        .iter()
        .find(|e| e.id == element_id)
        .map(|e| e.name.as_str())
        .unwrap_or(element_id)
}

/// Build a set of (element_id, category) pairs from existing threats for dedup.
fn existing_threat_keys(model: &ThreatModel) -> HashSet<(String, String)> {
    model
        .threats
        .iter()
        .filter_map(|t| {
            let ref_id = t.element.as_deref().or(t.flow.as_deref())?;
            Some((ref_id.to_string(), format!("{:?}", t.category)))
        })
        .collect()
}

/// Which trust boundary (if any) does an element belong to?
fn element_boundary<'a>(
    boundaries: &'a [TrustBoundary],
    element_id: &str,
) -> Option<&'a TrustBoundary> {
    boundaries
        .iter()
        .find(|b| b.contains.iter().any(|c| c == element_id))
}

/// Returns true if source and target are in different trust boundaries (or one is unbound).
fn crosses_boundary(boundaries: &[TrustBoundary], source: &str, target: &str) -> bool {
    let src_boundary = element_boundary(boundaries, source).map(|b| &b.id);
    let tgt_boundary = element_boundary(boundaries, target).map(|b| &b.id);
    src_boundary != tgt_boundary
}

/// Analyze a threat model using STRIDE-per-element methodology.
/// Returns a list of suggested threats that don't already exist in the model.
pub fn analyze(model: &ThreatModel) -> Vec<Threat> {
    let rules = build_rules();
    let existing = existing_threat_keys(model);
    let mut suggestions: Vec<Threat> = Vec::new();

    // Element-based rules
    for element in &model.elements {
        let element_category = stride_category_for_type(&element.element_type);
        for rule in &rules {
            if rule.targets_flows {
                continue;
            }
            if !rule.applicable_categories.contains(&element_category) {
                continue;
            }
            let key = (element.id.clone(), format!("{:?}", rule.category));
            if existing.contains(&key) {
                continue;
            }

            let title = rule.title_template.replace("{name}", &element.name);
            let description = rule.description_template.replace("{name}", &element.name);

            suggestions.push(Threat {
                id: generate_threat_id(),
                title,
                category: rule.category.clone(),
                element: Some(element.id.clone()),
                flow: None,
                severity: rule.severity.clone(),
                description,
                mitigation: None,
            });
        }
    }

    // Data flow rules
    for flow in &model.data_flows {
        let source_name = element_name(model, &flow.from);
        let target_name = element_name(model, &flow.to);

        for rule in &rules {
            if !rule.targets_flows {
                continue;
            }
            let key = (flow.id.clone(), format!("{:?}", rule.category));
            if existing.contains(&key) {
                continue;
            }

            // For data flows, boost severity if the flow crosses a trust boundary
            let severity = if crosses_boundary(&model.trust_boundaries, &flow.from, &flow.to) {
                // Bump severity one level for cross-boundary flows
                match &rule.severity {
                    Severity::Medium => Severity::High,
                    Severity::Low => Severity::Medium,
                    other => other.clone(),
                }
            } else {
                rule.severity.clone()
            };

            let title = rule
                .title_template
                .replace("{source}", source_name)
                .replace("{target}", target_name);
            let description = rule
                .description_template
                .replace("{source}", source_name)
                .replace("{target}", target_name);

            suggestions.push(Threat {
                id: generate_threat_id(),
                title,
                category: rule.category.clone(),
                element: None,
                flow: Some(flow.id.clone()),
                severity,
                description,
                mitigation: None,
            });
        }
    }

    suggestions
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{DataFlow, Element, Metadata, ThreatModel, TrustBoundary};
    use chrono::NaiveDate;

    fn sample_model() -> ThreatModel {
        ThreatModel {
            version: "1.0".to_string(),
            metadata: Metadata {
                title: "Test".to_string(),
                author: "Test".to_string(),
                created: NaiveDate::from_ymd_opt(2026, 1, 1).unwrap(),
                modified: NaiveDate::from_ymd_opt(2026, 1, 1).unwrap(),
                description: String::new(),
                created_by: None,
                modified_by: None,
                last_edit_timestamp: None,
                settings: None,
            },
            elements: vec![
                Element {
                    id: "web-app".to_string(),
                    element_type: "web_server".to_string(),
                    name: "Web Application".to_string(),
                    trust_zone: "internal".to_string(),
                    subtype: None,
                    icon: None,
                    description: String::new(),
                    technologies: vec![],
                    stores: None,
                    encryption: None,
                    position: None,
                    fill_color: None,
                    stroke_color: None,
                    fill_opacity: None,
                    stroke_opacity: None,
                },
                Element {
                    id: "db".to_string(),
                    element_type: "sql_database".to_string(),
                    name: "Database".to_string(),
                    trust_zone: "internal".to_string(),
                    subtype: None,
                    icon: None,
                    description: String::new(),
                    technologies: vec!["PostgreSQL".to_string()],
                    stores: None,
                    encryption: None,
                    position: None,
                    fill_color: None,
                    stroke_color: None,
                    fill_opacity: None,
                    stroke_opacity: None,
                },
                Element {
                    id: "user".to_string(),
                    element_type: "web_browser".to_string(),
                    name: "End User".to_string(),
                    trust_zone: "external".to_string(),
                    subtype: None,
                    icon: None,
                    description: String::new(),
                    technologies: vec![],
                    stores: None,
                    encryption: None,
                    position: None,
                    fill_color: None,
                    stroke_color: None,
                    fill_opacity: None,
                    stroke_opacity: None,
                },
            ],
            data_flows: vec![DataFlow {
                id: "flow-1".to_string(),
                name: String::new(),
                from: "web-app".to_string(),
                to: "db".to_string(),
                protocol: "PostgreSQL/TLS".to_string(),
                data: vec!["user_records".to_string()],
                authenticated: true,
                label_offset: None,
                source_handle: None,
                target_handle: None,
            }],
            trust_boundaries: vec![TrustBoundary {
                id: "boundary-1".to_string(),
                name: "Internal Network".to_string(),
                contains: vec!["web-app".to_string(), "db".to_string()],
                position: None,
                size: None,
                fill_color: None,
                stroke_color: None,
                fill_opacity: None,
                stroke_opacity: None,
            }],
            threats: vec![],
            diagrams: vec![],
        }
    }

    #[test]
    fn test_generates_threats_for_service() {
        let model = sample_model();
        let threats = analyze(&model);
        let service_threats: Vec<_> = threats
            .iter()
            .filter(|t| t.element.as_deref() == Some("web-app"))
            .collect();
        // Service should get: Spoofing, Tampering, Repudiation, InfoDisclosure, DoS, EoP
        assert_eq!(
            service_threats.len(),
            6,
            "Service should have 6 STRIDE threats"
        );
    }

    #[test]
    fn test_generates_threats_for_store() {
        let model = sample_model();
        let threats = analyze(&model);
        let ds_threats: Vec<_> = threats
            .iter()
            .filter(|t| t.element.as_deref() == Some("db"))
            .collect();
        // Store should get: Tampering, InfoDisclosure, DoS
        assert_eq!(ds_threats.len(), 3, "Store should have 3 threats");
    }

    #[test]
    fn test_generates_threats_for_actor() {
        let model = sample_model();
        let threats = analyze(&model);
        let ee_threats: Vec<_> = threats
            .iter()
            .filter(|t| t.element.as_deref() == Some("user"))
            .collect();
        // Actor should get: Spoofing, Repudiation
        assert_eq!(ee_threats.len(), 2, "Actor should have 2 threats");
    }

    #[test]
    fn test_generates_threats_for_data_flows() {
        let model = sample_model();
        let threats = analyze(&model);
        let flow_threats: Vec<_> = threats
            .iter()
            .filter(|t| t.flow.as_deref() == Some("flow-1"))
            .collect();
        // DataFlow should get: Tampering, InfoDisclosure, DoS
        assert_eq!(flow_threats.len(), 3, "DataFlow should have 3 threats");
    }

    #[test]
    fn test_total_threat_count() {
        let model = sample_model();
        let threats = analyze(&model);
        // 6 (service) + 3 (store) + 2 (actor) + 3 (flow) = 14
        assert_eq!(
            threats.len(),
            14,
            "Total should be 14 threats for the sample model"
        );
    }

    #[test]
    fn test_deduplication_skips_existing() {
        let mut model = sample_model();
        model.threats.push(Threat {
            id: "existing-1".to_string(),
            title: "Existing spoofing".to_string(),
            category: StrideCategory::Spoofing,
            element: Some("web-app".to_string()),
            flow: None,
            severity: Severity::High,
            description: String::new(),
            mitigation: None,
        });

        let threats = analyze(&model);
        let spoofing_web: Vec<_> = threats
            .iter()
            .filter(|t| {
                t.element.as_deref() == Some("web-app") && t.category == StrideCategory::Spoofing
            })
            .collect();
        assert_eq!(
            spoofing_web.len(),
            0,
            "Should not suggest spoofing for web-app since it already exists"
        );
    }

    #[test]
    fn test_threat_titles_contain_element_names() {
        let model = sample_model();
        let threats = analyze(&model);
        let web_threats: Vec<_> = threats
            .iter()
            .filter(|t| t.element.as_deref() == Some("web-app"))
            .collect();
        for t in &web_threats {
            assert!(
                t.title.contains("Web Application"),
                "Threat title '{}' should contain element name 'Web Application'",
                t.title
            );
        }
    }

    #[test]
    fn test_cross_boundary_flow_boosts_severity() {
        let mut model = sample_model();
        // Add a flow from internal to external (crosses boundary)
        model.data_flows.push(DataFlow {
            id: "flow-2".to_string(),
            name: String::new(),
            from: "web-app".to_string(),
            to: "user".to_string(),
            protocol: "HTTPS".to_string(),
            data: vec!["response".to_string()],
            authenticated: false,
            label_offset: None,
            source_handle: None,
            target_handle: None,
        });

        let threats = analyze(&model);
        let cross_flow_threats: Vec<_> = threats
            .iter()
            .filter(|t| t.flow.as_deref() == Some("flow-2"))
            .collect();

        // DoS rule has base severity Medium but should be boosted to High for cross-boundary
        let dos_threat = cross_flow_threats
            .iter()
            .find(|t| t.category == StrideCategory::DenialOfService);
        assert!(
            dos_threat.is_some(),
            "Should have DoS threat for cross-boundary flow"
        );
        assert_eq!(
            dos_threat.unwrap().severity,
            Severity::High,
            "Cross-boundary DoS should be boosted from Medium to High"
        );
    }

    #[test]
    fn test_same_boundary_flow_no_boost() {
        let model = sample_model();
        let threats = analyze(&model);
        // flow-1 is web-app → db, both in boundary-1 (same boundary)
        let dos_threat = threats.iter().find(|t| {
            t.flow.as_deref() == Some("flow-1") && t.category == StrideCategory::DenialOfService
        });
        assert!(dos_threat.is_some());
        assert_eq!(
            dos_threat.unwrap().severity,
            Severity::Medium,
            "Same-boundary flow should keep base severity Medium"
        );
    }

    #[test]
    fn test_stride_category_mapping() {
        // Services
        assert_eq!(
            stride_category_for_type("api_gateway"),
            ComponentStrideCategory::Service
        );
        assert_eq!(
            stride_category_for_type("generic"),
            ComponentStrideCategory::Service
        );
        assert_eq!(
            stride_category_for_type("process"),
            ComponentStrideCategory::Service
        );
        // Networking / Cloud services
        assert_eq!(
            stride_category_for_type("vpn_gateway"),
            ComponentStrideCategory::Service
        );
        assert_eq!(
            stride_category_for_type("webhook"),
            ComponentStrideCategory::Service
        );
        assert_eq!(
            stride_category_for_type("service_mesh"),
            ComponentStrideCategory::Service
        );
        assert_eq!(
            stride_category_for_type("kubernetes"),
            ComponentStrideCategory::Service
        );
        assert_eq!(
            stride_category_for_type("ci_cd_pipeline"),
            ComponentStrideCategory::Service
        );

        // Stores
        assert_eq!(
            stride_category_for_type("sql_database"),
            ComponentStrideCategory::Store
        );
        assert_eq!(
            stride_category_for_type("data_store"),
            ComponentStrideCategory::Store
        );
        assert_eq!(
            stride_category_for_type("file_storage"),
            ComponentStrideCategory::Store
        );
        assert_eq!(
            stride_category_for_type("data_lake"),
            ComponentStrideCategory::Store
        );
        assert_eq!(
            stride_category_for_type("backup_service"),
            ComponentStrideCategory::Store
        );
        assert_eq!(
            stride_category_for_type("key_management"),
            ComponentStrideCategory::Store
        );
        assert_eq!(
            stride_category_for_type("container_registry"),
            ComponentStrideCategory::Store
        );

        // Actors
        assert_eq!(
            stride_category_for_type("web_browser"),
            ComponentStrideCategory::Actor
        );
        assert_eq!(
            stride_category_for_type("external_entity"),
            ComponentStrideCategory::Actor
        );
        assert_eq!(
            stride_category_for_type("api_client"),
            ComponentStrideCategory::Actor
        );
        assert_eq!(
            stride_category_for_type("cli_tool"),
            ComponentStrideCategory::Actor
        );
    }
}
