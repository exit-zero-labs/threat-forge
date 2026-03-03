use crate::models::ThreatModel;

/// Build a system prompt that includes the current threat model context.
///
/// The prompt instructs the AI to act as a threat modeling expert and provides
/// the full model state so the AI can make contextual suggestions.
pub fn build_system_prompt(model: &ThreatModel) -> String {
    let mut prompt = String::with_capacity(4096);

    prompt.push_str(
        "You are a senior security architect and threat modeling expert. \
         You are helping a user analyze and improve their threat model using the STRIDE methodology.\n\n\
         STRIDE categories:\n\
         - Spoofing: Can an attacker pretend to be someone/something else?\n\
         - Tampering: Can an attacker modify data in transit or at rest?\n\
         - Repudiation: Can an attacker deny performing an action?\n\
         - Information Disclosure: Can an attacker access data they shouldn't?\n\
         - Denial of Service: Can an attacker prevent legitimate access?\n\
         - Elevation of Privilege: Can an attacker gain unauthorized access levels?\n\n",
    );

    prompt.push_str("When suggesting new threats, format them in a fenced code block with the language tag `threats` using YAML syntax:\n\n");
    prompt.push_str("```threats\n");
    prompt.push_str("- title: \"Threat title here\"\n");
    prompt.push_str("  category: Spoofing|Tampering|Repudiation|Information Disclosure|Denial of Service|Elevation of Privilege\n");
    prompt.push_str("  element: element-id-here\n");
    prompt.push_str("  severity: critical|high|medium|low|info\n");
    prompt.push_str("  description: \"Description of the threat and its impact.\"\n");
    prompt.push_str("```\n\n");

    prompt.push_str(
        "Only use element IDs that exist in the current model. \
         Be specific and actionable in your threat descriptions. \
         Consider the trust zones and data flows when assessing severity.\n\n",
    );

    // AI action protocol
    prompt.push_str(
        "When the user asks you to modify the model (add, update, or delete elements, data flows, trust boundaries, or threats), \
         output the changes in a fenced code block with the language tag `actions` as a JSON array:\n\n\
         ```actions\n\
         [\n\
           { \"action\": \"add_element\", \"element\": { \"type\": \"process\", \"name\": \"Auth Service\", \"trust_zone\": \"internal\", \"description\": \"Handles authentication\", \"technologies\": [\"OAuth2\"] } },\n\
           { \"action\": \"add_data_flow\", \"data_flow\": { \"from\": \"web-app\", \"to\": \"auth-service\", \"name\": \"Auth Request\", \"protocol\": \"HTTPS\", \"data\": [\"credentials\"], \"authenticated\": false } },\n\
           { \"action\": \"update_element\", \"id\": \"api-gw\", \"updates\": { \"description\": \"Updated description\" } },\n\
           { \"action\": \"delete_element\", \"id\": \"old-service\" },\n\
           { \"action\": \"add_trust_boundary\", \"trust_boundary\": { \"name\": \"DMZ\", \"contains\": [\"api-gw\"] } },\n\
           { \"action\": \"add_threat\", \"threat\": { \"title\": \"SQL Injection\", \"category\": \"Tampering\", \"element\": \"api-gw\", \"severity\": \"high\", \"description\": \"Risk of SQL injection.\" } }\n\
         ]\n\
         ```\n\n\
         Supported actions: add_element, update_element, delete_element, add_data_flow, update_data_flow, delete_data_flow, \
         add_trust_boundary, update_trust_boundary, delete_trust_boundary, add_threat, update_threat, delete_threat.\n\
         For updates, only include fields that need to change. For deletes, only the id is needed.\n\
         Element types: \"process\", \"data_store\", \"external_entity\", \"text\" (annotation, no STRIDE threats). \
         STRIDE categories: Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege. \
         Severities: critical, high, medium, low, info.\n\
         The user will review and approve actions before they are applied.\n\n",
    );

    // Response format instructions
    prompt.push_str(
        "RESPONSE FORMAT:\n\
         When your response includes actions or threats blocks, structure your output as follows:\n\
         - Wrap all user-facing text (analysis, explanations, summaries) inside <response>...</response> tags.\n\
         - Place ```actions and ```threats code blocks OUTSIDE the <response> tags.\n\
         - Do NOT narrate or list individual actions in your response text. The user sees a structured preview of each action separately.\n\
         - Focus your <response> text on high-level analysis, security insights, and recommendations.\n\n",
    );

    // Serialize the current model context
    prompt.push_str("--- CURRENT THREAT MODEL ---\n\n");

    prompt.push_str(&format!("Title: {}\n", model.metadata.title));
    prompt.push_str(&format!("Author: {}\n", model.metadata.author));
    if !model.metadata.description.is_empty() {
        prompt.push_str(&format!("Description: {}\n", model.metadata.description));
    }
    prompt.push('\n');

    // Elements
    if !model.elements.is_empty() {
        prompt.push_str("Elements:\n");
        for el in &model.elements {
            prompt.push_str(&format!(
                "  - {} (id: {}, type: {}, trust_zone: {}",
                el.name, el.id, el.element_type, el.trust_zone
            ));
            if let Some(ref subtype) = el.subtype {
                prompt.push_str(&format!(", subtype: {subtype}"));
            }
            if !el.technologies.is_empty() {
                prompt.push_str(&format!(", technologies: [{}]", el.technologies.join(", ")));
            }
            if !el.description.is_empty() {
                prompt.push_str(&format!(", description: \"{}\"", el.description));
            }
            prompt.push_str(")\n");
        }
        prompt.push('\n');
    }

    // Data flows
    if !model.data_flows.is_empty() {
        prompt.push_str("Data Flows:\n");
        for flow in &model.data_flows {
            prompt.push_str(&format!(
                "  - {} -> {} (id: {}, protocol: {}, data: [{}], authenticated: {})\n",
                flow.from,
                flow.to,
                flow.id,
                flow.protocol,
                flow.data.join(", "),
                flow.authenticated
            ));
        }
        prompt.push('\n');
    }

    // Trust boundaries
    if !model.trust_boundaries.is_empty() {
        prompt.push_str("Trust Boundaries:\n");
        for boundary in &model.trust_boundaries {
            prompt.push_str(&format!(
                "  - {} (id: {}, contains: [{}])\n",
                boundary.name,
                boundary.id,
                boundary.contains.join(", ")
            ));
        }
        prompt.push('\n');
    }

    // Existing threats
    if !model.threats.is_empty() {
        prompt.push_str("Existing Threats (already identified):\n");
        for threat in &model.threats {
            prompt.push_str(&format!(
                "  - {} (id: {}, category: {:?}, severity: {:?}",
                threat.title, threat.id, threat.category, threat.severity
            ));
            if let Some(ref el) = threat.element {
                prompt.push_str(&format!(", element: {el}"));
            }
            if let Some(ref mitigation) = threat.mitigation {
                prompt.push_str(&format!(", mitigation: {:?}", mitigation.status));
            }
            prompt.push_str(")\n");
        }
        prompt.push('\n');
    }

    prompt.push_str("--- END THREAT MODEL ---\n");

    prompt
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_system_prompt_empty_model() {
        let model = ThreatModel::new("Test Model", "Test Author");
        let prompt = build_system_prompt(&model);

        assert!(prompt.contains("STRIDE"));
        assert!(prompt.contains("Test Model"));
        assert!(prompt.contains("Test Author"));
        assert!(prompt.contains("```threats"));
        assert!(prompt.contains("--- CURRENT THREAT MODEL ---"));
        assert!(prompt.contains("--- END THREAT MODEL ---"));
        assert!(prompt.contains("<response>"));
        assert!(prompt.contains("Do NOT narrate"));
        // Empty model should not have elements/flows sections
        assert!(!prompt.contains("Elements:"));
        assert!(!prompt.contains("Data Flows:"));
    }

    #[test]
    fn test_build_system_prompt_with_elements() {
        use crate::models::Element;

        let mut model = ThreatModel::new("Payment Service", "Alice");
        model.elements.push(Element {
            id: "api-gw".to_string(),
            element_type: "api_gateway".to_string(),
            name: "API Gateway".to_string(),
            trust_zone: "dmz".to_string(),
            subtype: None,
            icon: None,
            description: "Main entry point".to_string(),
            technologies: vec!["nginx".to_string()],
            stores: None,
            encryption: None,
            position: None,
            fill_color: None,
            stroke_color: None,
            fill_opacity: None,
            stroke_opacity: None,
            font_size: None,
            font_weight: None,
        });

        let prompt = build_system_prompt(&model);

        assert!(prompt.contains("Elements:"));
        assert!(prompt.contains("API Gateway"));
        assert!(prompt.contains("api-gw"));
        assert!(prompt.contains("dmz"));
        assert!(prompt.contains("nginx"));
        assert!(prompt.contains("Main entry point"));
    }

    #[test]
    fn test_build_system_prompt_with_flows() {
        use crate::models::DataFlow;

        let mut model = ThreatModel::new("Test", "Author");
        model.data_flows.push(DataFlow {
            id: "flow-1".to_string(),
            flow_number: Some(1),
            name: String::new(),
            from: "web-app".to_string(),
            to: "api-gw".to_string(),
            protocol: "HTTPS".to_string(),
            data: vec!["user_input".to_string()],
            authenticated: true,
            label_offset: None,
            source_handle: None,
            target_handle: None,
            stroke_color: None,
            stroke_opacity: None,
        });

        let prompt = build_system_prompt(&model);

        assert!(prompt.contains("Data Flows:"));
        assert!(prompt.contains("web-app -> api-gw"));
        assert!(prompt.contains("HTTPS"));
        assert!(prompt.contains("authenticated: true"));
    }
}
