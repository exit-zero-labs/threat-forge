import { describe, expect, it } from "vitest";
import {
	authorizeStart,
	autoGrantReadOnly,
	type DenialRecord,
	grantForBatch,
	grantForCall,
	isDenied,
} from "./authorization";
import {
	canonicalJson,
	createToolRegistry,
	type RegisteredTool,
	type ToolEffect,
} from "./tool-runtime";
import { type CallRecord, createIdleTurnState, type TurnState } from "./turn-machine";

/** A minimal registered tool, so a destructive read tool (which `defineExecutableTool` refuses to build) can be constructed for the guard test. */
function fakeTool(name: string, effect: ToolEffect, destructive: boolean): RegisteredTool {
	return {
		name,
		description: name,
		effect,
		destructive,
		jsonSchema: () => ({ type: "object", properties: {}, additionalProperties: false }),
		prepare: (raw) => ({
			ok: true,
			call: {
				summary: "",
				inputDigest: canonicalJson(raw),
				run: async () => ({ status: "ok", result: "" }),
			},
		}),
	};
}

const updateTool = fakeTool("update_thing", "mutate", false);
const readTool = fakeTool("read_thing", "read", false);
const registry = createToolRegistry([updateTool, readTool]);

function call(overrides: Partial<CallRecord> & Pick<CallRecord, "id" | "toolName">): CallRecord {
	return {
		inputDigest: "digest-a",
		summary: "",
		effect: "mutate",
		destructive: false,
		iteration: 1,
		status: "approved",
		prepared: null,
		result: null,
		isError: false,
		denialReason: null,
		...overrides,
	};
}

function state(overrides: Partial<TurnState>): TurnState {
	return {
		...createIdleTurnState(),
		phase: "executing",
		iteration: 1,
		toolSet: registry,
		...overrides,
	};
}

describe("grant constructors", () => {
	it("grantForCall binds the call id, tool, digest, and iteration with call scope", () => {
		const record = call({ id: "toolu_1", toolName: "update_thing", inputDigest: "d1" });
		expect(grantForCall(record, 2)).toEqual({
			callId: "toolu_1",
			toolName: "update_thing",
			inputDigest: "d1",
			scope: "call",
			iteration: 2,
		});
	});

	it("grantForBatch produces one batch-scoped grant per explicit record", () => {
		const grants = grantForBatch(
			[
				call({ id: "a", toolName: "update_thing", inputDigest: "da" }),
				call({ id: "b", toolName: "update_thing", inputDigest: "db" }),
			],
			1,
		);
		expect(grants.map((g) => g.callId)).toEqual(["a", "b"]);
		expect(grants.every((g) => g.scope === "batch")).toBe(true);
	});

	it("autoGrantReadOnly grants a read-only, non-destructive tool", () => {
		const grant = autoGrantReadOnly(readTool, { callId: "r1", inputDigest: "dr" }, 1);
		expect(grant).toEqual({
			callId: "r1",
			toolName: "read_thing",
			inputDigest: "dr",
			scope: "auto",
			iteration: 1,
		});
	});

	it("autoGrantReadOnly throws for a mutating tool", () => {
		expect(() => autoGrantReadOnly(updateTool, { callId: "x", inputDigest: "d" }, 1)).toThrow(
			/mutating tool/,
		);
	});

	it("autoGrantReadOnly throws for a destructive read tool", () => {
		const destructiveRead = fakeTool("read_and_wipe", "read", true);
		expect(() => autoGrantReadOnly(destructiveRead, { callId: "x", inputDigest: "d" }, 1)).toThrow(
			/destructive tool/,
		);
	});
});

describe("authorizeStart", () => {
	it("authorizes an approved call whose grant matches its input and iteration", () => {
		const record = call({
			id: "toolu_1",
			toolName: "update_thing",
			inputDigest: "d1",
			status: "approved",
		});
		const result = authorizeStart(
			state({ calls: [record], grants: [grantForCall(record, 1)] }),
			"toolu_1",
		);
		expect(result.ok).toBe(true);
	});

	it("refuses a call with no grant as no_grant", () => {
		const record = call({ id: "toolu_1", toolName: "update_thing", status: "pending" });
		const result = authorizeStart(state({ calls: [record], grants: [] }), "toolu_1");
		expect(result).toEqual({ ok: false, violation: "no_grant" });
	});

	it("refuses a grant whose digest no longer matches the call input as digest_mismatch", () => {
		const record = call({ id: "toolu_1", toolName: "update_thing", inputDigest: "d-current" });
		const staleGrant = { ...grantForCall(record, 1), inputDigest: "d-approved" };
		const result = authorizeStart(state({ calls: [record], grants: [staleGrant] }), "toolu_1");
		expect(result).toEqual({ ok: false, violation: "digest_mismatch" });
	});

	it("refuses a grant from another iteration as foreign_iteration", () => {
		const record = call({ id: "toolu_1", toolName: "update_thing", inputDigest: "d1" });
		const iterationOneGrant = grantForCall(record, 1);
		const result = authorizeStart(
			state({ iteration: 2, calls: [record], grants: [iterationOneGrant] }),
			"toolu_1",
		);
		expect(result).toEqual({ ok: false, violation: "foreign_iteration" });
	});

	it("refuses a second start on a consumed grant as grant_already_consumed", () => {
		const record = call({
			id: "toolu_1",
			toolName: "update_thing",
			inputDigest: "d1",
			status: "running",
		});
		const result = authorizeStart(
			state({ calls: [record], grants: [grantForCall({ ...record, status: "approved" }, 1)] }),
			"toolu_1",
		);
		expect(result).toEqual({ ok: false, violation: "grant_already_consumed" });
	});

	it("refuses a call whose (tool, input) was previously denied as denied_replay", () => {
		const record = call({
			id: "toolu_1",
			toolName: "update_thing",
			inputDigest: "d1",
			status: "approved",
		});
		const denial: DenialRecord = {
			toolName: "update_thing",
			inputDigest: "d1",
			reason: "user_declined",
		};
		const result = authorizeStart(
			state({ calls: [record], grants: [grantForCall(record, 1)], denials: [denial] }),
			"toolu_1",
		);
		expect(result).toEqual({ ok: false, violation: "denied_replay" });
	});

	it("refuses a call whose tool is not in the frozen tool set as unknown_tool", () => {
		const record = call({
			id: "toolu_1",
			toolName: "run_shell",
			inputDigest: "d1",
			status: "approved",
		});
		const result = authorizeStart(
			state({ calls: [record], grants: [grantForCall(record, 1)] }),
			"toolu_1",
		);
		expect(result).toEqual({ ok: false, violation: "unknown_tool" });
	});
});

describe("isDenied", () => {
	it("matches a denial by exact tool name and digest", () => {
		const denials: DenialRecord[] = [
			{ toolName: "update_thing", inputDigest: "d1", reason: "user_declined" },
		];
		expect(isDenied(denials, "update_thing", "d1")).toBe(true);
		expect(isDenied(denials, "update_thing", "d2")).toBe(false);
		expect(isDenied(denials, "delete_thing", "d1")).toBe(false);
	});
});
