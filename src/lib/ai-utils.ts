import type { Severity, StrideCategory, Threat } from "@/types/threat-model";

const VALID_CATEGORIES: StrideCategory[] = [
	"Spoofing",
	"Tampering",
	"Repudiation",
	"Information Disclosure",
	"Denial of Service",
	"Elevation of Privilege",
];

const VALID_SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "info"];

interface ParsedThreatSuggestion {
	title: string;
	category: StrideCategory;
	element?: string;
	severity: Severity;
	description: string;
}

/**
 * Extract threat suggestions from AI response text.
 * Looks for fenced code blocks with language tag `threats` containing YAML-like content.
 */
export function extractThreats(text: string): ParsedThreatSuggestion[] {
	const threats: ParsedThreatSuggestion[] = [];
	const codeBlockRegex = /```threats\n([\s\S]*?)```/g;

	let match = codeBlockRegex.exec(text);
	while (match !== null) {
		const block = match[1];
		const parsed = parseThreatsBlock(block);
		threats.push(...parsed);
		match = codeBlockRegex.exec(text);
	}

	return threats;
}

/**
 * Parse a YAML-like threats block into threat suggestions.
 * Uses simple line-based parsing — not a full YAML parser.
 */
function parseThreatsBlock(block: string): ParsedThreatSuggestion[] {
	const threats: ParsedThreatSuggestion[] = [];
	const lines = block.split("\n");

	let current: Partial<ParsedThreatSuggestion> | null = null;

	for (const line of lines) {
		const trimmed = line.trim();

		// New threat item starts with "- title:"
		if (trimmed.startsWith("- title:")) {
			if (current) {
				const validated = validateThreat(current);
				if (validated) threats.push(validated);
			}
			current = { title: extractValue(trimmed.slice("- title:".length)) };
			continue;
		}

		if (!current) continue;

		if (trimmed.startsWith("category:")) {
			current.category = extractValue(trimmed.slice("category:".length)) as StrideCategory;
		} else if (trimmed.startsWith("element:")) {
			current.element = extractValue(trimmed.slice("element:".length));
		} else if (trimmed.startsWith("severity:")) {
			current.severity = extractValue(trimmed.slice("severity:".length)) as Severity;
		} else if (trimmed.startsWith("description:")) {
			current.description = extractValue(trimmed.slice("description:".length));
		}
	}

	// Don't forget the last threat
	if (current) {
		const validated = validateThreat(current);
		if (validated) threats.push(validated);
	}

	return threats;
}

/** Extract value from a YAML-like "key: value" pair, stripping quotes */
function extractValue(raw: string): string {
	const trimmed = raw.trim();
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

/** Validate that a partial threat has all required fields with valid values */
function validateThreat(partial: Partial<ParsedThreatSuggestion>): ParsedThreatSuggestion | null {
	if (!partial.title || !partial.category || !partial.severity || !partial.description) {
		return null;
	}

	if (!VALID_CATEGORIES.includes(partial.category)) {
		return null;
	}

	if (!VALID_SEVERITIES.includes(partial.severity)) {
		return null;
	}

	return {
		title: partial.title,
		category: partial.category,
		element: partial.element,
		severity: partial.severity,
		description: partial.description,
	};
}

/** Generate a unique threat ID for an AI-suggested threat */
export function generateThreatId(): string {
	const hex = Math.random().toString(16).slice(2, 10);
	return `threat-${hex}`;
}

/** Convert a parsed threat suggestion into a full Threat object */
export function suggestionToThreat(suggestion: ParsedThreatSuggestion): Threat {
	return {
		id: generateThreatId(),
		title: suggestion.title,
		category: suggestion.category,
		element: suggestion.element,
		severity: suggestion.severity,
		description: suggestion.description,
	};
}
