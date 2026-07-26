import { beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalJson, type RegisteredTool, type ToolOutcome } from "@/lib/ai/loop/tool-runtime";
import { commitToolOutcome, createTurnUndoLedger } from "@/lib/ai/loop/transaction";
import { buildReadResult, READ_RESULT_MAX_BYTES } from "@/lib/ai/tools/read-result";
import { READ_TOOLS } from "@/lib/ai/tools/tool-registry";
import { UNTRUSTED_DOCUMENT_START } from "@/lib/ai/untrusted-text";
import { serializeThreatModelYaml } from "@/lib/thf-yaml";
import { useHistoryStore } from "@/stores/history-store";
import { useModelStore } from "@/stores/model-store";
import type { ThreatModel } from "@/types/threat-model";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

// The invariants of this issue as tests: no production read tool changes the
// document by byte or by structure, none returns a document, none reaches state
// outside its context, and none emits an unlisted key.

function richModel(): ThreatModel {
	return {
		version: "1.0",
		metadata: {
			title: "Payments platform",
			author: "Ada",
			created: "2026-01-01",
			modified: "2026-01-02",
			description: "the system",
			threat_analysis_enabled: true,
		},
		layers: [{ id: "L1", name: "Edge", description: "edge layer" }],
		groups: [{ id: "G1", name: "Payments", type: "service", description: "payments" }],
		elements: [
			{
				id: "web",
				type: "process",
				name: "Web",
				trust_zone: "internal",
				layer: "L1",
				group: "G1",
				subtype: "spa",
				icon: "react",
				encryption: "tls",
				description: "front end",
				technologies: ["react", "vite"],
				tags: ["frontend"],
				stores: ["session"],
			},
			{
				id: "db",
				type: "sql_database",
				name: "DB",
				trust_zone: "restricted",
				description: "store",
				technologies: [],
			},
		],
		data_flows: [
			{
				id: "f1",
				name: "query",
				from: "web",
				to: "db",
				protocol: "SQL",
				data: ["rows"],
				authenticated: true,
			},
		],
		trust_boundaries: [{ id: "tb1", name: "Internal", contains: ["web", "db"] }],
		relationships: [{ id: "r1", type: "depends_on", from: "web", to: "db" }],
		threats: [
			{
				id: "t1",
				title: "Spoof",
				category: "Spoofing",
				severity: "high",
				element: "web",
				description: "risk",
			},
			{
				id: "t2",
				title: "Tamper",
				category: "Tampering",
				severity: "critical",
				flow: "f1",
				description: "risk",
				mitigation: { status: "mitigated", description: "signed" },
			},
		],
		diagrams: [{ id: "d1", name: "Arch", kind: "architecture" }],
	};
}

/** At least one valid input per read tool, covering every kind for search_entities. */
const READ_TOOL_INPUTS: { tool: string; raw: unknown }[] = [
	{ tool: "get_document_summary", raw: {} },
	{ tool: "get_entity", raw: { kind: "elements", id: "web" } },
	{ tool: "get_entity", raw: { kind: "threats", id: "t1" } },
	{ tool: "search_entities", raw: { kind: "elements" } },
	{ tool: "search_entities", raw: { kind: "data_flows" } },
	{ tool: "search_entities", raw: { kind: "trust_boundaries" } },
	{ tool: "search_entities", raw: { kind: "threats" } },
	{ tool: "search_entities", raw: { kind: "layers" } },
	{ tool: "search_entities", raw: { kind: "groups" } },
	{ tool: "search_entities", raw: { kind: "relationships" } },
	{ tool: "search_entities", raw: { kind: "diagrams" } },
	{ tool: "search_component_catalog", raw: { include_deprecated: true } },
];

function toolNamed(name: string): RegisteredTool {
	const tool = READ_TOOLS.find((candidate) => candidate.name === name);
	if (tool === undefined) throw new Error(`no read tool named ${name}`);
	return tool;
}

async function runInput(entry: { tool: string; raw: unknown }): Promise<ToolOutcome> {
	const prepared = toolNamed(entry.tool).prepare(entry.raw);
	if (!prepared.ok)
		throw new Error(`prepare rejected ${entry.tool}: ${prepared.issues.join("; ")}`);
	const model = useModelStore.getState().model;
	if (!model) throw new Error("no model");
	return prepared.call.run({ document: model, signal: new AbortController().signal });
}

beforeEach(() => {
	useModelStore.getState().clearModel();
	useHistoryStore.getState().clear();
	useModelStore.getState().setModel(structuredClone(richModel()), null);
	useHistoryStore.getState().clear();
});

describe("read tool coverage guard", () => {
	it("names an input for every registered read tool, so a new tool needs a proof", () => {
		const covered = new Set(READ_TOOL_INPUTS.map((entry) => entry.tool));
		for (const tool of READ_TOOLS) expect(covered.has(tool.name)).toBe(true);
	});
});

describe("read tools never mutate the document", () => {
	it("leaves the document byte- and structure-identical and pushes no history", async () => {
		for (const entry of READ_TOOL_INPUTS) {
			const before = useModelStore.getState().model;
			if (!before) throw new Error("no model");
			const yamlBefore = serializeThreatModelYaml(before);
			const jsonBefore = canonicalJson(before);
			const pastBefore = useHistoryStore.getState().past.length;

			await runInput(entry);

			const after = useModelStore.getState().model;
			expect(after, `${entry.tool} replaced the model reference`).toBe(before);
			expect(serializeThreatModelYaml(after as ThreatModel)).toBe(yamlBefore);
			expect(canonicalJson(after)).toBe(jsonBefore);
			expect(useHistoryStore.getState().past.length).toBe(pastBefore);
		}
	});

	it("never returns a document key on any outcome", async () => {
		for (const entry of READ_TOOL_INPUTS) {
			const outcome = await runInput(entry);
			expect("document" in outcome, `${entry.tool} returned a document`).toBe(false);
		}
	});

	it("commits every read outcome as unchanged, never committed or refused", async () => {
		for (const entry of READ_TOOL_INPUTS) {
			const expected = useModelStore.getState().model;
			if (!expected) throw new Error("no model");
			const outcome = await runInput(entry);
			const commit = commitToolOutcome(outcome, {
				expected,
				effect: "read",
				ledger: createTurnUndoLedger(),
			});
			expect(commit.status, `${entry.tool} did not commit as unchanged`).toBe("unchanged");
		}
	});

	it("refuses a deliberately mutating read outcome, so the unchanged assertion is not vacuous", () => {
		const expected = useModelStore.getState().model;
		if (!expected) throw new Error("no model");
		const mutated: ThreatModel = { ...expected, version: "9.9" };
		const commit = commitToolOutcome(
			{ status: "ok", result: "read", document: mutated },
			{ expected, effect: "read", ledger: createTurnUndoLedger() },
		);
		expect(commit.status).toBe("refused");
		if (commit.status !== "refused") throw new Error("unreachable");
		expect(commit.refusal).toBe("read_tool_mutated");
	});
});

describe("read tool output-key allowlist", () => {
	// Every key any read-tool payload may emit. A leaked field (a store handle, a
	// filesystem path, an icon's provenance) would add a key not in this set.
	const ALLOWED_KEYS = new Set([
		// envelope
		"tool",
		"version",
		"metadata",
		"counts",
		"threats_by_severity",
		"threats_by_category",
		"threats_by_mitigation_status",
		"kind",
		"entity",
		"page",
		"results",
		// metadata
		"title",
		"author",
		"created",
		"modified",
		"description",
		"threat_analysis_enabled",
		// counts / breakdowns
		"elements",
		"data_flows",
		"trust_boundaries",
		"threats",
		"layers",
		"groups",
		"relationships",
		"diagrams",
		"severity",
		"category",
		"status",
		"count",
		// page meta
		"offset",
		"limit",
		"returned",
		"total",
		"next_offset",
		"stopped_by",
		// entity/catalog fields
		"id",
		"name",
		"type",
		"trust_zone",
		"layer",
		"group",
		"subtype",
		"icon",
		"encryption",
		"technologies",
		"technologies_total",
		"tags",
		"tags_total",
		"stores",
		"stores_total",
		"incoming_flow_ids",
		"outgoing_flow_ids",
		"trust_boundary_ids",
		"threat_ids",
		"from",
		"to",
		"protocol",
		"authenticated",
		"data",
		"data_total",
		"contains",
		"contains_count",
		"element",
		"flow",
		"mitigation_status",
		"mitigation_description",
		"parent",
		"truncated",
		// catalog
		"label",
		"provider",
		"icon_id",
		"shape",
		"stride_role",
		"aliases",
		"aliases_total",
		"keywords",
		"keywords_total",
		"variants",
		"variants_total",
	]);

	function collectKeys(value: unknown, into: Set<string>): void {
		if (Array.isArray(value)) {
			for (const item of value) collectKeys(item, into);
		} else if (value !== null && typeof value === "object") {
			for (const [key, child] of Object.entries(value)) {
				into.add(key);
				collectKeys(child, into);
			}
		}
	}

	it("emits only allowlisted keys across every read tool", async () => {
		const seen = new Set<string>();
		for (const entry of READ_TOOL_INPUTS) {
			const outcome = await runInput(entry);
			expect(outcome.status).toBe("ok");
			if (outcome.status !== "ok") throw new Error("unreachable");
			const body = outcome.result.split("\n").slice(1, -1).join("\n");
			collectKeys(JSON.parse(body), seen);
		}
		const leaked = [...seen].filter((key) => !ALLOWED_KEYS.has(key));
		expect(leaked, `unlisted keys leaked: ${leaked.join(", ")}`).toEqual([]);
	});
});

describe("read tool import allowlist", () => {
	const sources = import.meta.glob<string>("/src/lib/ai/tools/*.ts", {
		query: "?raw",
		import: "default",
		eager: true,
	});

	const FORBIDDEN = [
		/from ["']@\/stores\//,
		/from ["']@\/lib\/adapters\//,
		/settings-store/,
		/@tauri-apps\//,
		/import\.meta\.env/,
		/process\.env/,
	];

	it("no read-tool module reaches a store, adapter, settings, tauri, or the environment", () => {
		const offenders: string[] = [];
		let scanned = 0;
		for (const [path, contents] of Object.entries(sources)) {
			if (path.endsWith(".test.ts")) continue;
			if (path.endsWith("graph-action-tools.ts")) continue; // mutation tools, out of scope
			scanned += 1;
			for (const pattern of FORBIDDEN) {
				if (pattern.test(contents)) offenders.push(`${path} matched ${pattern}`);
			}
		}
		expect(scanned).toBeGreaterThan(0);
		expect(offenders).toEqual([]);
	});
});

describe("worst-case projection and the byte cap", () => {
	// The plan's Decision 5 asserted that every single-entity projection is provably
	// under READ_RESULT_MAX_BYTES, so no "too large" branch was written. That is true
	// of every kind except `elements`, which carries seven list fields. These tests
	// pin the measured behaviour, and the tool reports the overflow rather than
	// throwing it. See the Replan log in docs/plans/203-bounded-ai-read-tools.md.

	const cappedScalar = "x".repeat(200);
	const cappedText = "y".repeat(400);
	const cappedList = Array.from({ length: 10 }, () => "z".repeat(200));

	it("keeps a maximal threat projection (no list fields) well under the cap", () => {
		const entity: Record<string, unknown> = {
			id: cappedScalar,
			title: cappedScalar,
			category: cappedScalar,
			severity: cappedScalar,
			element: cappedScalar,
			flow: cappedScalar,
			mitigation_status: cappedScalar,
			description: cappedText,
			mitigation_description: cappedText,
			truncated: true,
		};
		const result = buildReadResult({ tool: "get_entity", payload: { kind: "threats", entity } });
		const body = result.split("\n").slice(1, -1).join("\n");
		expect(new TextEncoder().encode(body).length).toBeLessThan(READ_RESULT_MAX_BYTES);
	});

	/**
	 * A document whose single element projects past the byte cap.
	 *
	 * The three free-text lists are filled at the cap, and all four derived id lists
	 * are filled by attaching outbound flows, inbound flows, boundaries and threats
	 * whose own ids are at the scalar cap. Every value here is one a document could
	 * legitimately hold, which is why the overflow needs an answer rather than an
	 * assertion that it cannot happen.
	 */
	function oversizedElementModel(idWidth = 196): ThreatModel {
		const wide = (suffix: string) => `${"i".repeat(idWidth)}${suffix}`;
		return {
			version: "1.0",
			metadata: {
				title: "Wide",
				author: "Ada",
				created: "2026-01-01",
				modified: "2026-01-02",
			},
			elements: [
				{
					id: "web",
					type: "process",
					name: cappedScalar,
					trust_zone: "internal",
					description: cappedText,
					technologies: cappedList,
					tags: cappedList,
					stores: cappedList,
				},
			],
			data_flows: [
				...Array.from({ length: 10 }, (_, i) => ({
					id: wide(`f${i}`),
					name: "flow",
					from: "web",
					to: wide(`o${i}`),
					protocol: "https",
					data: [],
					authenticated: true,
				})),
				...Array.from({ length: 10 }, (_, i) => ({
					id: wide(`g${i}`),
					name: "flow",
					from: wide(`o${i}`),
					to: "web",
					protocol: "https",
					data: [],
					authenticated: true,
				})),
			],
			trust_boundaries: Array.from({ length: 10 }, (_, i) => ({
				id: wide(`b${i}`),
				name: "boundary",
				type: "network",
				contains: ["web"],
			})),
			threats: Array.from({ length: 10 }, (_, i) => ({
				id: wide(`t${i}`),
				title: "threat",
				category: "Spoofing",
				severity: "high",
				element: "web",
				description: "d",
			})),
		} as unknown as ThreatModel;
	}

	it("reports an element too large to return whole instead of throwing or truncating", async () => {
		useModelStore.getState().clearModel();
		useModelStore.getState().setModel(oversizedElementModel(), null);

		const outcome = await runInput({ tool: "get_entity", raw: { kind: "elements", id: "web" } });

		// A structured, corrective failure — not a throw the loop renders as a generic
		// tool error, and not a truncated entity the model would read as complete.
		expect(outcome.status).toBe("error");
		expect(outcome.result).toContain("over the 8192-byte result cap");
		expect(outcome.result).toContain(`search_entities with kind "elements"`);
		expect(outcome.result).not.toContain(UNTRUSTED_DOCUMENT_START);
	});

	it("fills all four derived id lists in the oversized fixture", async () => {
		// The fixture is only honest if the flows, boundaries and threats it attaches
		// actually reach the element's projection. A field-name drift here would leave
		// the lists empty and quietly narrow what the overflow test covers.
		useModelStore.getState().clearModel();
		// Narrow ids and no free text, so the same wiring projects small enough to
		// return whole — this test is about which lists are populated, not the cap.
		const model = oversizedElementModel(4);
		model.elements[0].technologies = [];
		model.elements[0].tags = [];
		model.elements[0].stores = [];
		model.elements[0].description = "d";
		useModelStore.getState().setModel(model, null);

		const outcome = await runInput({ tool: "get_entity", raw: { kind: "elements", id: "web" } });

		expect(outcome.status).toBe("ok");
		const body = JSON.parse(outcome.result.split("\n").slice(1, -1).join("\n")) as {
			entity: Record<string, unknown>;
		};
		for (const field of [
			"incoming_flow_ids",
			"outgoing_flow_ids",
			"trust_boundary_ids",
			"threat_ids",
		]) {
			expect((body.entity[field] as unknown[]).length).toBeGreaterThan(0);
		}
	});

	it("still answers the same oversized element through its compact projection", async () => {
		useModelStore.getState().clearModel();
		useModelStore.getState().setModel(oversizedElementModel(), null);

		const outcome = await runInput({
			tool: "search_entities",
			raw: { kind: "elements", limit: 10, offset: 0 },
		});

		// The remedy the failure message names has to actually work, or the model is
		// being sent somewhere that dead-ends.
		expect(outcome.status).toBe("ok");
		expect(outcome.result).toContain('"id":"web"');
	});
});
