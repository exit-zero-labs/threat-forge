import { describe, expect, it } from "vitest";
import { COMPONENT_ENTRIES } from "@/lib/registry/component-entries";
import { getComponent } from "@/lib/registry/registry";
import type { StrideRole } from "@/lib/registry/types";
import strideRoles from "../../../tests/fixtures/registry/stride-roles.json";

/**
 * STRIDE role parity. `stride-roles.json` is authored from the Rust match arms
 * (`src-tauri/src/stride/mod.rs`) plus every registry ID, and is asserted load-bearing on
 * both sides: this test checks the TypeScript registry, and the Rust test in
 * `src-tauri/src/stride/mod.rs` checks `stride_category_for_type` against the same file.
 *
 * This closes the desktop/browser divergence for the legacy DFD types the format
 * documentation's own example uses: with the `data_store` and `external_entity` entries added
 * in `#59` Step 9, the browser registry now agrees with the Rust engine.
 *
 * Residual gap, stated honestly: the Rust `match` is not enumerable, so a Rust-only arm added
 * later without a table row is not caught here. Single-sourcing the table is tracked in #207.
 */

function isStrideRole(value: string): value is StrideRole {
	return value === "service" || value === "store" || value === "actor" || value === "none";
}

const table = new Map<string, StrideRole>(
	Object.entries(strideRoles).map(([id, role]) => {
		if (!isStrideRole(role)) throw new Error(`invalid STRIDE role for ${id}: ${role}`);
		return [id, role];
	}),
);

describe("stride role parity: TypeScript registry matches the shared table", () => {
	it("the shared table covers every permanent component ID", () => {
		expect([...table.keys()].sort()).toEqual(COMPONENT_ENTRIES.map((entry) => entry.id).sort());
	});

	for (const [id, role] of table) {
		it(`${id} resolves to ${role}`, () => {
			expect(getComponent(id)?.strideRole, id).toBe(role);
		});
	}

	it("covers the legacy DFD types that previously diverged", () => {
		expect(table.get("process")).toBe("service");
		expect(table.get("data_store")).toBe("store");
		expect(table.get("external_entity")).toBe("actor");
	});
});
