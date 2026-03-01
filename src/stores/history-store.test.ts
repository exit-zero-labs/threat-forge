import { beforeEach, describe, expect, it } from "vitest";
import type { ThreatModel } from "@/types/threat-model";
import { useHistoryStore } from "./history-store";

function makeModel(title: string): ThreatModel {
	return {
		version: "1.0",
		metadata: {
			title,
			author: "Test",
			created: "2026-03-01",
			modified: "2026-03-01",
			description: "",
		},
		elements: [],
		data_flows: [],
		trust_boundaries: [],
		threats: [],
		diagrams: [{ id: "main", name: "Main" }],
	};
}

/** Helper that asserts a value is not null and returns it typed. */
function assertDefined<T>(value: T | null | undefined): T {
	expect(value).not.toBeNull();
	return value as T;
}

describe("useHistoryStore", () => {
	beforeEach(() => {
		useHistoryStore.setState({ past: [], future: [] });
	});

	it("starts with empty stacks", () => {
		const state = useHistoryStore.getState();
		expect(state.past).toHaveLength(0);
		expect(state.future).toHaveLength(0);
		expect(state.canUndo()).toBe(false);
		expect(state.canRedo()).toBe(false);
	});

	it("pushSnapshot adds to past and clears future", () => {
		const m0 = makeModel("M0");
		const m1 = makeModel("M1");

		useHistoryStore.getState().pushSnapshot(m0);
		expect(useHistoryStore.getState().past).toHaveLength(1);
		expect(useHistoryStore.getState().canUndo()).toBe(true);

		useHistoryStore.getState().pushSnapshot(m1);
		expect(useHistoryStore.getState().past).toHaveLength(2);
	});

	it("undo pops from past and pushes current to future", () => {
		const m0 = makeModel("M0");
		const m1 = makeModel("M1");
		const mCurrent = makeModel("Current");

		useHistoryStore.getState().pushSnapshot(m0);
		useHistoryStore.getState().pushSnapshot(m1);

		const restored = useHistoryStore.getState().undo(mCurrent);
		expect(restored?.metadata.title).toBe("M1");
		expect(useHistoryStore.getState().past).toHaveLength(1);
		expect(useHistoryStore.getState().future).toHaveLength(1);
		expect(useHistoryStore.getState().future[0].metadata.title).toBe("Current");
	});

	it("redo pops from future and pushes current to past", () => {
		const m0 = makeModel("M0");
		const m1 = makeModel("M1");
		const mCurrent = makeModel("Current");

		useHistoryStore.getState().pushSnapshot(m0);
		useHistoryStore.getState().pushSnapshot(m1);

		// Undo first
		const afterUndo = assertDefined(useHistoryStore.getState().undo(mCurrent));

		// Redo
		const restored = useHistoryStore.getState().redo(afterUndo);
		expect(restored?.metadata.title).toBe("Current");
		expect(useHistoryStore.getState().past).toHaveLength(2);
		expect(useHistoryStore.getState().future).toHaveLength(0);
	});

	it("push after undo clears future (redo stack)", () => {
		const m0 = makeModel("M0");
		const m1 = makeModel("M1");
		const mCurrent = makeModel("Current");
		const mNew = makeModel("New");

		useHistoryStore.getState().pushSnapshot(m0);
		useHistoryStore.getState().pushSnapshot(m1);
		useHistoryStore.getState().undo(mCurrent);

		// Future should have 1 entry
		expect(useHistoryStore.getState().future).toHaveLength(1);

		// New mutation clears future
		useHistoryStore.getState().pushSnapshot(mNew);
		expect(useHistoryStore.getState().future).toHaveLength(0);
	});

	it("limits history to 20 entries", () => {
		for (let i = 0; i < 25; i++) {
			useHistoryStore.getState().pushSnapshot(makeModel(`M${i}`));
		}
		expect(useHistoryStore.getState().past).toHaveLength(20);
		// Oldest entries should have been dropped; newest is M24
		expect(useHistoryStore.getState().past[19].metadata.title).toBe("M24");
		expect(useHistoryStore.getState().past[0].metadata.title).toBe("M5");
	});

	it("undo on empty past returns null", () => {
		const result = useHistoryStore.getState().undo(makeModel("Current"));
		expect(result).toBeNull();
		expect(useHistoryStore.getState().future).toHaveLength(0);
	});

	it("redo on empty future returns null", () => {
		const result = useHistoryStore.getState().redo(makeModel("Current"));
		expect(result).toBeNull();
		expect(useHistoryStore.getState().past).toHaveLength(0);
	});

	it("clear resets both stacks", () => {
		useHistoryStore.getState().pushSnapshot(makeModel("M0"));
		useHistoryStore.getState().pushSnapshot(makeModel("M1"));
		useHistoryStore.getState().undo(makeModel("Current"));

		useHistoryStore.getState().clear();
		expect(useHistoryStore.getState().past).toHaveLength(0);
		expect(useHistoryStore.getState().future).toHaveLength(0);
		expect(useHistoryStore.getState().canUndo()).toBe(false);
		expect(useHistoryStore.getState().canRedo()).toBe(false);
	});

	it("snapshots are deep clones (mutations to original don't affect history)", () => {
		const m = makeModel("Original");
		useHistoryStore.getState().pushSnapshot(m);

		// Mutate the original
		m.metadata.title = "Mutated";

		// History should still have the original
		expect(useHistoryStore.getState().past[0].metadata.title).toBe("Original");
	});

	it("undo/redo full round-trip: 5 actions -> undo 3 -> redo 1", () => {
		const models = Array.from({ length: 5 }, (_, i) => makeModel(`M${i}`));

		// Push 5 snapshots (simulating 5 mutations)
		for (const m of models) {
			useHistoryStore.getState().pushSnapshot(m);
		}
		expect(useHistoryStore.getState().past).toHaveLength(5);

		const current = makeModel("M5");

		// Undo 3 times
		const u1 = assertDefined(useHistoryStore.getState().undo(current));
		expect(u1.metadata.title).toBe("M4");

		const u2 = assertDefined(useHistoryStore.getState().undo(u1));
		expect(u2.metadata.title).toBe("M3");

		const u3 = assertDefined(useHistoryStore.getState().undo(u2));
		expect(u3.metadata.title).toBe("M2");

		expect(useHistoryStore.getState().past).toHaveLength(2);
		expect(useHistoryStore.getState().future).toHaveLength(3);

		// Redo 1 time
		const r1 = assertDefined(useHistoryStore.getState().redo(u3));
		expect(r1.metadata.title).toBe("M3");

		expect(useHistoryStore.getState().past).toHaveLength(3);
		expect(useHistoryStore.getState().future).toHaveLength(2);
	});
});
