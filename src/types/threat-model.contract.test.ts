/**
 * Cross-language schema contract for the architecture golden fixture (issue #57, step 6).
 *
 * Three artifacts must be updated together, and that friction is intentional — it is the only
 * thing that keeps the Rust model, this TypeScript model, and the on-disk `.thf` schema from
 * drifting apart silently:
 *
 *   1. `max_filled_model()` in `src-tauri/src/file_io/fixtures_test.rs`
 *   2. `maxFilledModel` below
 *   3. `tests/fixtures/thf/architecture-canonical-full.thf`
 *
 * The Rust side pins byte identity against the fixture. This side proves the same fixture parses
 * to a value structurally identical to the TypeScript model, so a field present in Rust and the
 * fixture but missing from the TS interface — or reordered in either — fails here.
 */

import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import architectureCanonicalFullRaw from "../../tests/fixtures/thf/architecture-canonical-full.thf?raw";
import architectureOnlyRaw from "../../tests/fixtures/thf/architecture-only.thf?raw";
import type { ThreatModel } from "./threat-model";

/** The exact option object `BrowserFileAdapter.saveThreatModel` passes to `yaml.dump`. */
const BROWSER_DUMP_OPTIONS = {
	lineWidth: -1,
	noRefs: true,
	sortKeys: false,
	quotingType: '"',
} as const;

/** Fixture contents with the leading `#` comment header removed, mirroring the Rust helper. */
function fixtureBody(raw: string): string {
	const lines = raw.split(/(?<=\n)/);
	let start = 0;
	while (start < lines.length && lines[start].startsWith("#")) start += 1;
	return lines.slice(start).join("");
}

/**
 * Recursively convert `Date` values to `YYYY-MM-DD` strings. `js-yaml` resolves an unquoted YAML
 * timestamp such as `2026-04-01` to a `Date`, but `Metadata.created` is typed `string`; the
 * emitter divergence is characterized in `thf-fixtures.test.ts` and normalized here so the
 * contract compares structure and values rather than parser quirks.
 */
function normalizeDates(value: unknown): unknown {
	if (value instanceof Date) return value.toISOString().slice(0, 10);
	if (Array.isArray(value)) return value.map(normalizeDates);
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([key, inner]) => [key, normalizeDates(inner)]),
		);
	}
	return value;
}

/**
 * Ordered list of every key path in a value, descending into objects and arrays but treating
 * `Date` and scalars as leaves. Order-sensitive: it is the drift detector for field insertion or
 * reordering in either the Rust model or the TypeScript interface.
 */
function keyPaths(value: unknown, prefix = ""): string[] {
	if (Array.isArray(value)) {
		return value.flatMap((item, index) => keyPaths(item, `${prefix}[${index}]`));
	}
	if (value && typeof value === "object" && !(value instanceof Date)) {
		return Object.entries(value).flatMap(([key, inner]) => {
			const path = prefix ? `${prefix}.${key}` : key;
			return [path, ...keyPaths(inner, path)];
		});
	}
	return [];
}

/**
 * The TypeScript twin of the Rust `max_filled_model()` helper. Typed as `ThreatModel`, so a Rust
 * field missing from the interface cannot be expressed here, and object key order matches the
 * fixture's canonical field order (the browser writer emits keys in this order under
 * `sortKeys: false`).
 */
const maxFilledModel: ThreatModel = {
	version: "1.0",
	metadata: {
		title: "Order Fulfillment Platform",
		author: "Dana Lee",
		created: "2026-04-01",
		modified: "2026-04-10",
		description: "System architecture and threat model for the order fulfillment platform.\n",
		created_by: "Dana Lee <dana@example.com>",
		modified_by: "Sam Ortiz <sam@example.com>",
		last_edit_timestamp: 1743206400,
		threat_analysis_enabled: true,
		settings: {
			grid_size: 24,
			default_element_fill: "#3b82f6",
			default_element_stroke: "#1e40af",
			default_boundary_fill: "#22c55e",
			default_boundary_stroke: "#15803d",
		},
	},
	layers: [
		{ id: "presentation", name: "Presentation", description: "User-facing surfaces" },
		{ id: "application", name: "Application", description: "Business logic and services" },
		{ id: "data", name: "Data", description: "Persistence and storage" },
	],
	groups: [
		{
			id: "frontend-cluster",
			name: "Frontend Cluster",
			type: "cluster",
			description: "Edge-facing services",
			position: { x: 40, y: 40 },
			size: { width: 320, height: 220 },
			fill_color: "#3b82f6",
			stroke_color: "#1e40af",
			fill_opacity: 0.1,
			stroke_opacity: 0.6,
		},
		{
			id: "backend-cluster",
			name: "Backend Cluster",
			type: "cluster",
			description: "Internal services and stores",
			position: { x: 420, y: 40 },
			size: { width: 420, height: 360 },
			fill_color: "#22c55e",
			stroke_color: "#15803d",
			fill_opacity: 0.1,
			stroke_opacity: 0.6,
		},
		{
			id: "api-subcluster",
			name: "API Subcluster",
			type: "cluster",
			parent: "backend-cluster",
			description: "API tier nested inside the backend",
			position: { x: 440, y: 80 },
			size: { width: 200, height: 160 },
			fill_color: "#f97316",
			stroke_color: "#c2410c",
			fill_opacity: 0.12,
			stroke_opacity: 0.7,
		},
	],
	elements: [
		{
			id: "web-app",
			type: "process",
			name: "Web Application",
			trust_zone: "internal",
			layer: "presentation",
			group: "frontend-cluster",
			description: "React storefront",
			technologies: ["react", "vite"],
			tags: ["tier-1"],
			position: { x: 100, y: 120 },
		},
		{
			id: "api-gateway",
			type: "process",
			name: "API Gateway",
			trust_zone: "dmz",
			layer: "application",
			group: "api-subcluster",
			subtype: "api_gateway",
			icon: "router",
			description: "Terminates TLS and routes requests",
			technologies: ["nginx"],
			tags: ["pci", "tier-1"],
			position: { x: 480, y: 120 },
			fill_color: "#3b82f6",
			stroke_color: "#1e40af",
			fill_opacity: 0.15,
			stroke_opacity: 0.9,
			font_size: 14,
			font_weight: "normal",
		},
		{
			id: "orders-db",
			type: "data_store",
			name: "Orders Database",
			trust_zone: "internal",
			layer: "data",
			group: "backend-cluster",
			subtype: "sql_database",
			icon: "database",
			description: "Primary order store",
			technologies: ["postgresql"],
			tags: ["pci"],
			stores: ["order_records"],
			encryption: "AES-256-at-rest",
			position: { x: 480, y: 320 },
			fill_color: "#22c55e",
			stroke_color: "#15803d",
			fill_opacity: 0.2,
			stroke_opacity: 0.95,
		},
	],
	data_flows: [
		{
			id: "flow-1",
			flow_number: 1,
			name: "Checkout request",
			from: "web-app",
			to: "api-gateway",
			protocol: "HTTPS/TLS-1.3",
			data: ["order_request"],
			authenticated: true,
			label_offset: { x: 12, y: -6 },
			source_handle: "right",
			target_handle: "left",
			stroke_color: "#ef4444",
			stroke_opacity: 0.85,
		},
		{
			id: "flow-2",
			flow_number: 2,
			name: "Persist order",
			from: "api-gateway",
			to: "orders-db",
			protocol: "PostgreSQL/TLS",
			data: ["order_records"],
			authenticated: true,
		},
	],
	relationships: [
		{
			id: "rel-1",
			type: "deploys_to",
			from: "api-gateway",
			to: "orders-db",
			name: "Runs alongside",
			description: "Gateway is deployed in the same cluster as the store",
			source_handle: "bottom",
			target_handle: "top",
			label_offset: { x: 8, y: 4 },
			stroke_color: "#64748b",
			stroke_opacity: 0.5,
		},
		{
			id: "rel-2",
			type: "depends_on",
			from: "web-app",
			to: "orders-db",
		},
	],
	trust_boundaries: [
		{
			id: "boundary-1",
			name: "Corporate Network",
			contains: ["web-app", "api-gateway", "orders-db"],
			position: { x: 20, y: 20 },
			size: { width: 840, height: 400 },
			fill_color: "#22c55e",
			stroke_color: "#15803d",
			fill_opacity: 0.1,
			stroke_opacity: 0.6,
		},
	],
	threats: [
		{
			id: "threat-1",
			title: "SQL injection on order queries",
			category: "Tampering",
			element: "api-gateway",
			flow: "flow-2",
			severity: "high",
			description: "Unvalidated input could inject SQL into order queries.",
			mitigation: {
				status: "mitigated",
				description: "Parameterized queries via ORM",
			},
		},
	],
	diagrams: [
		{
			id: "main-arch",
			name: "Architecture View",
			kind: "architecture",
			description: "Top-level system architecture",
			viewport: { x: -40, y: 25, zoom: 0.85 },
		},
	],
};

describe("architecture schema contract", () => {
	const body = fixtureBody(architectureCanonicalFullRaw);
	const loaded = yaml.load(body);

	it("parses the canonical fixture to the TypeScript model", () => {
		// Numbers are compared numerically (the fixture's `x: 100.0` parses to JS `100`); dates are
		// normalized from `Date` back to `YYYY-MM-DD` strings.
		expect(normalizeDates(loaded)).toEqual(maxFilledModel);
	});

	it("keeps the fixture and the TypeScript model in identical field order", () => {
		// The drift detector: a field added to Rust and the fixture but not to the TS model, or
		// reordered in either, changes this ordered key-path list.
		expect(keyPaths(loaded)).toEqual(keyPaths(maxFilledModel));
	});

	it("round-trips the TypeScript model through the browser writer", () => {
		const reloaded = yaml.load(yaml.dump(maxFilledModel, BROWSER_DUMP_OPTIONS));
		expect(normalizeDates(reloaded)).toEqual(maxFilledModel);
	});

	it("mirrors the architecture-only document shape", () => {
		const model = yaml.load(fixtureBody(architectureOnlyRaw));
		const asRecord = model as Record<string, unknown>;
		const metadata = asRecord.metadata as Record<string, unknown>;
		expect(metadata.threat_analysis_enabled).toBe(false);
		expect(asRecord.threats).toEqual([]);
		expect(Array.isArray(asRecord.relationships)).toBe(true);
	});
});
