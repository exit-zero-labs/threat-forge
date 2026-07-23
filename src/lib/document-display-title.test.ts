import { describe, expect, it } from "vitest";
import type { ThreatModel } from "@/types/threat-model";
import { documentDisplayTitle } from "./document-display-title";

function makeModel(title: string): ThreatModel {
	return {
		version: "1.0",
		metadata: { title, author: "", created: "", modified: "", description: "" },
		elements: [],
		data_flows: [],
		trust_boundaries: [],
		threats: [],
		diagrams: [],
	};
}

describe("documentDisplayTitle", () => {
	it("uses the POSIX file basename without its extension", () => {
		expect(documentDisplayTitle(makeModel("Ignored"), "/home/jane/payments.thf")).toBe("payments");
	});

	it("resolves a Windows path to its basename on every platform", () => {
		// The discriminating case: a naive `split('/')` leaves the whole backslash path intact.
		expect(documentDisplayTitle(makeModel("Ignored"), "C:\\models\\payments.thf")).toBe("payments");
	});

	it("falls back to the model metadata title when there is no path", () => {
		expect(documentDisplayTitle(makeModel("Untitled Threat Model"), null)).toBe(
			"Untitled Threat Model",
		);
	});

	it("falls back to the app name when there is neither a path nor a model", () => {
		expect(documentDisplayTitle(null, null)).toBe("Threat Forge");
	});

	it("prefers the basename over the metadata title when both exist", () => {
		expect(documentDisplayTitle(makeModel("Metadata Title"), "/tmp/on-disk-name.thf")).toBe(
			"on-disk-name",
		);
	});
});
