/**
 * TypeScript port of the Rust system prompt builder.
 * src-tauri/src/ai/prompt.rs
 *
 * Used by the browser chat adapter when Tauri IPC is unavailable.
 */

import type { ThreatModel } from "@/types/threat-model";

/**
 * Build a system prompt that includes the current threat model context.
 * The prompt instructs the AI to act as a threat modeling expert and provides
 * the full model state so the AI can make contextual suggestions.
 */
export function buildSystemPrompt(model: ThreatModel): string {
	const parts: string[] = [];

	parts.push(
		"You are a senior security architect and threat modeling expert. " +
			"You are helping a user analyze and improve their threat model using the STRIDE methodology.\n\n" +
			"STRIDE categories:\n" +
			"- Spoofing: Can an attacker pretend to be someone/something else?\n" +
			"- Tampering: Can an attacker modify data in transit or at rest?\n" +
			"- Repudiation: Can an attacker deny performing an action?\n" +
			"- Information Disclosure: Can an attacker access data they shouldn't?\n" +
			"- Denial of Service: Can an attacker prevent legitimate access?\n" +
			"- Elevation of Privilege: Can an attacker gain unauthorized access levels?\n\n",
	);

	parts.push(
		"When suggesting new threats, format them in a fenced code block with the language tag `threats` using YAML syntax:\n\n" +
			"```threats\n" +
			'- title: "Threat title here"\n' +
			"  category: Spoofing|Tampering|Repudiation|Information Disclosure|Denial of Service|Elevation of Privilege\n" +
			"  element: element-id-here\n" +
			"  severity: critical|high|medium|low|info\n" +
			'  description: "Description of the threat and its impact."\n' +
			"```\n\n",
	);

	parts.push(
		"Only use element IDs that exist in the current model. " +
			"Be specific and actionable in your threat descriptions. " +
			"Consider the trust zones and data flows when assessing severity.\n\n",
	);

	// AI action protocol
	parts.push(
		"When the user asks you to modify the model (add, update, or delete elements, data flows, trust boundaries, or threats), " +
			"output the changes in a fenced code block with the language tag `actions` as a JSON array:\n\n" +
			"```actions\n" +
			"[\n" +
			'  { "action": "add_element", "element": { "type": "process", "name": "Auth Service", "trust_zone": "internal", "description": "Handles authentication", "technologies": ["OAuth2"] } },\n' +
			'  { "action": "add_data_flow", "data_flow": { "from": "web-app", "to": "auth-service", "name": "Auth Request", "protocol": "HTTPS", "data": ["credentials"], "authenticated": false } },\n' +
			'  { "action": "update_element", "id": "api-gw", "updates": { "description": "Updated description" } },\n' +
			'  { "action": "delete_element", "id": "old-service" },\n' +
			'  { "action": "add_trust_boundary", "trust_boundary": { "name": "DMZ", "contains": ["api-gw"] } },\n' +
			'  { "action": "add_threat", "threat": { "title": "SQL Injection", "category": "Tampering", "element": "api-gw", "severity": "high", "description": "Risk of SQL injection." } }\n' +
			"]\n" +
			"```\n\n" +
			"Supported actions: add_element, update_element, delete_element, add_data_flow, update_data_flow, delete_data_flow, " +
			"add_trust_boundary, update_trust_boundary, delete_trust_boundary, add_threat, update_threat, delete_threat.\n" +
			"For updates, only include fields that need to change. For deletes, only the id is needed.\n" +
			'Element types: "process", "data_store", "external_entity". ' +
			"STRIDE categories: Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege. " +
			"Severities: critical, high, medium, low, info.\n" +
			"The user will review and approve actions before they are applied.\n\n",
	);

	// Response format instructions
	parts.push(
		"RESPONSE FORMAT:\n" +
			"When your response includes actions or threats blocks, structure your output as follows:\n" +
			"- Wrap all user-facing text (analysis, explanations, summaries) inside <response>...</response> tags.\n" +
			"- Place ```actions and ```threats code blocks OUTSIDE the <response> tags.\n" +
			"- Do NOT narrate or list individual actions in your response text. The user sees a structured preview of each action separately.\n" +
			"- Focus your <response> text on high-level analysis, security insights, and recommendations.\n\n",
	);

	parts.push("--- CURRENT THREAT MODEL ---\n\n");

	parts.push(`Title: ${model.metadata.title}\n`);
	parts.push(`Author: ${model.metadata.author}\n`);
	if (model.metadata.description) {
		parts.push(`Description: ${model.metadata.description}\n`);
	}
	parts.push("\n");

	// Elements
	if (model.elements.length > 0) {
		parts.push("Elements:\n");
		for (const el of model.elements) {
			let line = `  - ${el.name} (id: ${el.id}, type: ${el.type}, trust_zone: ${el.trust_zone}`;
			if (el.subtype) {
				line += `, subtype: ${el.subtype}`;
			}
			if (el.technologies && el.technologies.length > 0) {
				line += `, technologies: [${el.technologies.join(", ")}]`;
			}
			if (el.description) {
				line += `, description: "${el.description}"`;
			}
			line += ")\n";
			parts.push(line);
		}
		parts.push("\n");
	}

	// Data flows
	if (model.data_flows.length > 0) {
		parts.push("Data Flows:\n");
		for (const flow of model.data_flows) {
			parts.push(
				`  - ${flow.from} -> ${flow.to} (id: ${flow.id}, protocol: ${flow.protocol}, data: [${flow.data.join(", ")}], authenticated: ${flow.authenticated})\n`,
			);
		}
		parts.push("\n");
	}

	// Trust boundaries
	if (model.trust_boundaries.length > 0) {
		parts.push("Trust Boundaries:\n");
		for (const boundary of model.trust_boundaries) {
			parts.push(
				`  - ${boundary.name} (id: ${boundary.id}, contains: [${boundary.contains.join(", ")}])\n`,
			);
		}
		parts.push("\n");
	}

	// Existing threats
	if (model.threats.length > 0) {
		parts.push("Existing Threats (already identified):\n");
		for (const threat of model.threats) {
			let line = `  - ${threat.title} (id: ${threat.id}, category: ${threat.category}, severity: ${threat.severity}`;
			if (threat.element) {
				line += `, element: ${threat.element}`;
			}
			if (threat.mitigation) {
				line += `, mitigation: ${threat.mitigation.status}`;
			}
			line += ")\n";
			parts.push(line);
		}
		parts.push("\n");
	}

	parts.push("--- END THREAT MODEL ---\n");

	return parts.join("");
}
