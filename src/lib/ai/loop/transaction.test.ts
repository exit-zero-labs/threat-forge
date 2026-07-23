import { beforeEach, describe, expect, it, vi } from "vitest";
import { useHistoryStore } from "@/stores/history-store";
import { useModelStore } from "@/stores/model-store";
import type { ThreatModel } from "@/types/threat-model";
import { canonicalJson } from "./tool-runtime";
import {
	commitToolOutcome,
	createTurnUndoLedger,
	turnUndoAvailability,
	undoTurn,
} from "./transaction";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const baseModel: ThreatModel = {
	version: "1.0",
	metadata: {
		title: "T",
		author: "A",
		created: "2026-01-01",
		modified: "2026-01-01",
		description: "",
	},
	elements: [
		{
			id: "web-app",
			type: "process",
			name: "Web App",
			trust_zone: "internal",
			description: "",
			technologies: [],
		},
	],
	data_flows: [],
	trust_boundaries: [],
	threats: [],
	diagrams: [],
};

function currentModel(): ThreatModel {
	const model = useModelStore.getState().model;
	if (!model) throw new Error("no model");
	return model;
}

function addElement(model: ThreatModel, id: string): ThreatModel {
	return {
		...model,
		elements: [
			...model.elements,
			{ id, type: "process", name: id, trust_zone: "", description: "", technologies: [] },
		],
	};
}

beforeEach(() => {
	useModelStore.getState().clearModel();
	useHistoryStore.getState().clear();
	useModelStore.getState().setModel(structuredClone(baseModel), null);
	useHistoryStore.getState().clear();
});

describe("commitToolOutcome refusals", () => {
	it("refuses a tool error and commits nothing", () => {
		const before = currentModel();
		const ledger = createTurnUndoLedger();
		const result = commitToolOutcome(
			{ status: "error", result: "no such element" },
			{ expected: before, effect: "mutate", ledger },
		);
		expect(result).toEqual({ status: "refused", refusal: "tool_error", result: "no such element" });
		expect(useModelStore.getState().model).toBe(before);
		expect(useHistoryStore.getState().past).toHaveLength(0);
	});

	it("refuses a read-only tool that returned a document", () => {
		const before = currentModel();
		const result = commitToolOutcome(
			{ status: "ok", result: "read", document: addElement(before, "x") },
			{ expected: before, effect: "read", ledger: createTurnUndoLedger() },
		);
		expect(result.status).toBe("refused");
		if (result.status === "refused") expect(result.refusal).toBe("read_tool_mutated");
		expect(useModelStore.getState().model).toBe(before);
	});

	it("refuses when the live document changed under the call", () => {
		const stale = currentModel();
		// Simulate a concurrent edit: the live model is replaced with a new reference.
		useModelStore.getState().restoreSnapshot(addElement(stale, "user-edit"));
		const nowLive = currentModel();
		const result = commitToolOutcome(
			{ status: "ok", result: "ok", document: addElement(stale, "ai-edit") },
			{ expected: stale, effect: "mutate", ledger: createTurnUndoLedger() },
		);
		expect(result.status).toBe("refused");
		if (result.status === "refused") expect(result.refusal).toBe("document_changed");
		// The user's edit is untouched; the stale AI write was discarded.
		expect(useModelStore.getState().model).toBe(nowLive);
	});

	it("refuses a document that would fail to reopen and returns the validator message", () => {
		const before = currentModel();
		const broken: ThreatModel = {
			...before,
			data_flows: [
				{
					id: "flow-1",
					flow_number: 1,
					name: "",
					from: "ghost",
					to: "web-app",
					protocol: "",
					data: [],
					authenticated: false,
				},
			],
		};
		const result = commitToolOutcome(
			{ status: "ok", result: "linked", document: broken },
			{ expected: before, effect: "mutate", ledger: createTurnUndoLedger() },
		);
		expect(result.status).toBe("refused");
		if (result.status === "refused") {
			expect(result.refusal).toBe("invalid_document");
			expect(result.result).toContain("not found");
		}
		// Reference-identical: nothing was applied.
		expect(useModelStore.getState().model).toBe(before);
	});
});

describe("commitToolOutcome success", () => {
	it("commits a valid mutation and preserves the current selection", () => {
		useModelStore.getState().setSelectedElement("web-app");
		const before = currentModel();
		const next = addElement(before, "cache");

		const result = commitToolOutcome(
			{ status: "ok", result: "added cache", document: next },
			{ expected: before, effect: "mutate", ledger: createTurnUndoLedger() },
		);

		expect(result.status).toBe("committed");
		expect(useModelStore.getState().model?.elements.map((e) => e.id)).toContain("cache");
		// The regression guard against reintroducing setModel, which clears selection.
		expect(useModelStore.getState().selectedElementId).toBe("web-app");
	});

	it("pushes exactly one snapshot for a three-mutation turn", () => {
		const ledger = createTurnUndoLedger();
		for (const id of ["a", "b", "c"]) {
			const before = currentModel();
			commitToolOutcome(
				{ status: "ok", result: `added ${id}`, document: addElement(before, id) },
				{ expected: before, effect: "mutate", ledger },
			);
		}
		expect(useHistoryStore.getState().past).toHaveLength(1);
		expect(useModelStore.getState().model?.elements.map((e) => e.id)).toEqual([
			"web-app",
			"a",
			"b",
			"c",
		]);
	});
});

describe("undoTurn", () => {
	it("restores a document deep-equal to the pre-turn document in one step", () => {
		const preTurn = currentModel();
		const ledger = createTurnUndoLedger();
		for (const id of ["a", "b", "c"]) {
			const before = currentModel();
			commitToolOutcome(
				{ status: "ok", result: `added ${id}`, document: addElement(before, id) },
				{ expected: before, effect: "mutate", ledger },
			);
		}
		expect(turnUndoAvailability(ledger)).toBe("undoable");

		expect(undoTurn(ledger)).toBe(true);
		expect(canonicalJson(currentModel())).toBe(canonicalJson(preTurn));
		expect(turnUndoAvailability(ledger)).toBe("already_undone");
	});

	it("is superseded (and a no-op) after twenty unrelated edits", () => {
		const before = currentModel();
		const ledger = createTurnUndoLedger();
		commitToolOutcome(
			{ status: "ok", result: "added a", document: addElement(before, "a") },
			{ expected: before, effect: "mutate", ledger },
		);
		const afterCommit = currentModel();

		// Twenty unrelated edits trim the 20-entry history so the turn's index aliases a newer entry.
		for (let i = 0; i < 20; i += 1) {
			useHistoryStore.getState().pushSnapshot(currentModel());
		}

		expect(turnUndoAvailability(ledger)).toBe("superseded");
		expect(undoTurn(ledger)).toBe(false);
		expect(useModelStore.getState().model).toBe(afterCommit);
	});
});
