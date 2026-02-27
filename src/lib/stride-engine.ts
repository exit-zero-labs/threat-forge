/**
 * TypeScript port of the Rust STRIDE-per-element threat engine.
 * src-tauri/src/stride/mod.rs
 *
 * Used by the browser adapter when Tauri IPC is unavailable.
 * Desktop app continues to use the Rust implementation via IPC.
 */

import { generateThreatId } from "@/lib/ai-utils";
import type {
	ElementType,
	Severity,
	StrideCategory,
	Threat,
	ThreatModel,
	TrustBoundary,
} from "@/types/threat-model";

interface ThreatRule {
	category: StrideCategory;
	applicableElements: ElementType[];
	targetsFlows: boolean;
	titleTemplate: string;
	descriptionTemplate: string;
	severity: Severity;
}

function buildRules(): ThreatRule[] {
	return [
		// Process threats
		{
			category: "Spoofing",
			applicableElements: ["process"],
			targetsFlows: false,
			titleTemplate: "Spoofing of {name}",
			descriptionTemplate:
				"An attacker may impersonate {name} to gain unauthorized access. Ensure authentication mechanisms verify the identity of callers.",
			severity: "high",
		},
		{
			category: "Tampering",
			applicableElements: ["process"],
			targetsFlows: false,
			titleTemplate: "Tampering with {name}",
			descriptionTemplate:
				"An attacker may modify the behavior or inputs of {name}. Validate all inputs and ensure integrity checks are in place.",
			severity: "high",
		},
		{
			category: "Repudiation",
			applicableElements: ["process"],
			targetsFlows: false,
			titleTemplate: "Repudiation threat for {name}",
			descriptionTemplate:
				"{name} may perform actions without adequate logging. Implement audit logging to ensure all operations are traceable.",
			severity: "medium",
		},
		{
			category: "Information Disclosure",
			applicableElements: ["process"],
			targetsFlows: false,
			titleTemplate: "Information disclosure from {name}",
			descriptionTemplate:
				"{name} may leak sensitive information through error messages, logs, or side channels. Review outputs for data exposure.",
			severity: "medium",
		},
		{
			category: "Denial of Service",
			applicableElements: ["process"],
			targetsFlows: false,
			titleTemplate: "Denial of service on {name}",
			descriptionTemplate:
				"An attacker may overwhelm {name} with excessive requests or malformed inputs. Implement rate limiting and input validation.",
			severity: "medium",
		},
		{
			category: "Elevation of Privilege",
			applicableElements: ["process"],
			targetsFlows: false,
			titleTemplate: "Elevation of privilege via {name}",
			descriptionTemplate:
				"An attacker may exploit {name} to gain unauthorized privileges. Apply least-privilege principles and validate authorization.",
			severity: "high",
		},

		// Data Store threats
		{
			category: "Tampering",
			applicableElements: ["data_store"],
			targetsFlows: false,
			titleTemplate: "Tampering with data in {name}",
			descriptionTemplate:
				"An attacker may modify data in {name}. Use access controls, integrity constraints, and audit trails to detect unauthorized changes.",
			severity: "high",
		},
		{
			category: "Information Disclosure",
			applicableElements: ["data_store"],
			targetsFlows: false,
			titleTemplate: "Information disclosure from {name}",
			descriptionTemplate:
				"Sensitive data stored in {name} may be exposed to unauthorized users. Apply encryption at rest and strict access controls.",
			severity: "high",
		},
		{
			category: "Denial of Service",
			applicableElements: ["data_store"],
			targetsFlows: false,
			titleTemplate: "Denial of service on {name}",
			descriptionTemplate:
				"An attacker may corrupt or exhaust {name} to disrupt service. Implement backups, storage quotas, and connection limits.",
			severity: "medium",
		},

		// External Entity threats
		{
			category: "Spoofing",
			applicableElements: ["external_entity"],
			targetsFlows: false,
			titleTemplate: "Spoofing of {name}",
			descriptionTemplate:
				"An attacker may impersonate {name}. Verify the identity of external actors through authentication and certificate validation.",
			severity: "high",
		},
		{
			category: "Repudiation",
			applicableElements: ["external_entity"],
			targetsFlows: false,
			titleTemplate: "Repudiation by {name}",
			descriptionTemplate:
				"{name} may deny having performed an action. Implement non-repudiation mechanisms such as digital signatures or audit logs.",
			severity: "medium",
		},

		// Data Flow threats
		{
			category: "Tampering",
			applicableElements: [],
			targetsFlows: true,
			titleTemplate: "Tampering with data flow between {source} and {target}",
			descriptionTemplate:
				"Data in transit between {source} and {target} may be modified by an attacker. Use TLS/encryption and message integrity verification.",
			severity: "high",
		},
		{
			category: "Information Disclosure",
			applicableElements: [],
			targetsFlows: true,
			titleTemplate: "Information disclosure on flow between {source} and {target}",
			descriptionTemplate:
				"Sensitive data flowing between {source} and {target} may be intercepted. Ensure encryption in transit and minimize data exposure.",
			severity: "high",
		},
		{
			category: "Denial of Service",
			applicableElements: [],
			targetsFlows: true,
			titleTemplate: "Denial of service on flow between {source} and {target}",
			descriptionTemplate:
				"The communication channel between {source} and {target} may be disrupted. Implement redundancy, timeouts, and retry logic.",
			severity: "medium",
		},
	];
}

function elementName(model: ThreatModel, elementId: string): string {
	const element = model.elements.find((e) => e.id === elementId);
	return element ? element.name : elementId;
}

function existingThreatKeys(model: ThreatModel): Set<string> {
	const keys = new Set<string>();
	for (const t of model.threats) {
		const refId = t.element ?? t.flow;
		if (refId) {
			keys.add(`${refId}::${t.category}`);
		}
	}
	return keys;
}

function elementBoundary(
	boundaries: TrustBoundary[],
	elementId: string,
): TrustBoundary | undefined {
	return boundaries.find((b) => b.contains.includes(elementId));
}

function crossesBoundary(boundaries: TrustBoundary[], source: string, target: string): boolean {
	const srcBoundary = elementBoundary(boundaries, source)?.id;
	const tgtBoundary = elementBoundary(boundaries, target)?.id;
	return srcBoundary !== tgtBoundary;
}

function boostSeverity(severity: Severity): Severity {
	if (severity === "medium") return "high";
	if (severity === "low") return "medium";
	return severity;
}

/**
 * Analyze a threat model using STRIDE-per-element methodology.
 * Returns suggested threats that don't already exist in the model.
 */
export function analyzeStride(model: ThreatModel): Threat[] {
	const rules = buildRules();
	const existing = existingThreatKeys(model);
	const suggestions: Threat[] = [];

	// Element-based rules
	for (const element of model.elements) {
		for (const rule of rules) {
			if (rule.targetsFlows) continue;
			if (!rule.applicableElements.includes(element.type)) continue;

			const key = `${element.id}::${rule.category}`;
			if (existing.has(key)) continue;

			suggestions.push({
				id: generateThreatId(),
				title: rule.titleTemplate.replace("{name}", element.name),
				category: rule.category,
				element: element.id,
				severity: rule.severity,
				description: rule.descriptionTemplate.replace("{name}", element.name),
			});
		}
	}

	// Data flow rules
	for (const flow of model.data_flows) {
		const sourceName = elementName(model, flow.from);
		const targetName = elementName(model, flow.to);

		for (const rule of rules) {
			if (!rule.targetsFlows) continue;

			const key = `${flow.id}::${rule.category}`;
			if (existing.has(key)) continue;

			const severity = crossesBoundary(model.trust_boundaries, flow.from, flow.to)
				? boostSeverity(rule.severity)
				: rule.severity;

			suggestions.push({
				id: generateThreatId(),
				title: rule.titleTemplate.replace("{source}", sourceName).replace("{target}", targetName),
				category: rule.category,
				flow: flow.id,
				severity,
				description: rule.descriptionTemplate
					.replace("{source}", sourceName)
					.replace("{target}", targetName),
			});
		}
	}

	return suggestions;
}
