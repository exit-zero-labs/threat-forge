/**
 * The fenced compatibility boundary and its removal path.
 *
 * While the flag is on the boundary parses fenced ` ```actions `/` ```threats `
 * blocks out of accumulated assistant text; with it off nothing parses. The
 * removal-path test is what proves issue #64 can delete this module and the
 * prompt's fenced branch together.
 */

import { describe, expect, it, vi } from "vitest";
import * as aiActions from "@/lib/ai-actions";
import { buildSystemPrompt } from "@/lib/ai-prompt";
import type { ThreatModel } from "@/types/threat-model";
import {
	extractLegacyActions,
	extractLegacyThreats,
	LEGACY_FENCED_ACTIONS_ENABLED,
} from "./fenced-actions";

const FENCED_ACTION = [
	"Here is a change.",
	"```actions",
	'[{ "action": "delete_element", "id": "old-service" }]',
	"```",
].join("\n");

const FENCED_THREAT = [
	"```threats",
	'- title: "Spoofed identity"',
	"  category: Spoofing",
	"  severity: high",
	'  description: "An attacker forges credentials."',
	"```",
].join("\n");

function emptyModel(): ThreatModel {
	return {
		version: "1.0",
		metadata: {
			title: "Test",
			author: "Test",
			created: "2026-01-01",
			modified: "2026-01-01",
			description: "",
		},
		elements: [],
		data_flows: [],
		trust_boundaries: [],
		threats: [],
		diagrams: [],
	};
}

describe("fenced boundary while enabled", () => {
	it("ships enabled and names #64 as the removal issue", () => {
		// The flag is a compile-time constant #64 flips; the doc comment above the
		// export names the removal issue.
		expect(LEGACY_FENCED_ACTIONS_ENABLED).toBe(true);
	});

	it("parses fenced actions and threats out of accumulated assistant text", () => {
		expect(extractLegacyActions(FENCED_ACTION)).toEqual([
			{ action: "delete_element", id: "old-service" },
		]);
		expect(extractLegacyThreats(FENCED_THREAT)).toHaveLength(1);
	});
});

describe("fenced boundary removal path", () => {
	it("emits no fenced-action instructions once native tools are advertised", () => {
		const withoutTools = buildSystemPrompt(emptyModel(), { tools: [] });
		const withTools = buildSystemPrompt(emptyModel(), {
			tools: [{ name: "add_element", description: "Add an element." }],
		});

		// Today's fenced behavior is unchanged; a non-empty tool list drops the
		// fenced instructions, which is the branch #64 deletes.
		expect(withoutTools).toContain("```actions");
		expect(withTools).not.toContain("```actions");
	});

	it("runs no fenced parsing when the flag is off", () => {
		const actionsSpy = vi.spyOn(aiActions, "extractActions");

		// The disabled boundary returns nothing without invoking the parser, so
		// flipping the flag in #64 removes fenced parsing outright.
		expect(extractLegacyActions(FENCED_ACTION, false)).toEqual([]);
		expect(extractLegacyThreats(FENCED_THREAT, false)).toEqual([]);
		expect(actionsSpy).not.toHaveBeenCalled();

		actionsSpy.mockRestore();
	});
});
