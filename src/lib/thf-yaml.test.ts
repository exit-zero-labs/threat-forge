import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import type { ThreatModel } from "@/types/threat-model";
import { parseThreatModelYaml, serializeThreatModelYaml, THF_YAML_SCHEMA } from "./thf-yaml";

const TIMESTAMP_TAG = "tag:yaml.org,2002:timestamp";

/** A minimal desktop-written document: unquoted calendar dates, no optional sections. */
const DESKTOP_YAML = `version: "1.0"
metadata:
  title: Round Trip
  author: Alex Chen
  created: 2026-03-15
  modified: 2026-03-20
`;

describe("THF_YAML_SCHEMA", () => {
	it("drops only the YAML 1.1 timestamp type from the default schema", () => {
		const defaultTags = yaml.DEFAULT_SCHEMA.implicit.map((type) => type.tag);
		const thfTags = THF_YAML_SCHEMA.implicit.map((type) => type.tag);

		expect(defaultTags).toContain(TIMESTAMP_TAG);
		expect(thfTags).not.toContain(TIMESTAMP_TAG);
		expect(thfTags).toEqual(defaultTags.filter((tag) => tag !== TIMESTAMP_TAG));
		// Explicit tags — `!!binary`, `!!omap`, `!!set`, and the rest — are untouched.
		expect(THF_YAML_SCHEMA.explicit).toEqual(yaml.DEFAULT_SCHEMA.explicit);
	});
});

describe("parseThreatModelYaml", () => {
	it("reads an unquoted calendar date as a string, not a Date", () => {
		const model = parseThreatModelYaml(DESKTOP_YAML);

		expect(typeof model.metadata.created).toBe("string");
		expect(model.metadata.created).toBe("2026-03-15");
		expect(model.metadata.modified).toBe("2026-03-20");
	});

	it("materializes omitted collection sections as empty arrays", () => {
		const model = parseThreatModelYaml(DESKTOP_YAML);

		expect(model.elements).toEqual([]);
		expect(model.data_flows).toEqual([]);
		expect(model.trust_boundaries).toEqual([]);
		expect(model.threats).toEqual([]);
		expect(model.diagrams).toEqual([]);
	});

	it("defaults a missing technologies array on each element", () => {
		const model = parseThreatModelYaml(`${DESKTOP_YAML}elements:
  - id: app
    type: process
    name: App
`);

		expect(model.elements[0].technologies).toEqual([]);
	});

	it("rejects a date carrying a time of day with an actionable, user-safe message", () => {
		const corrupted = DESKTOP_YAML.replace("2026-03-15", "2026-03-15T00:00:00.000Z");

		expect(() => parseThreatModelYaml(corrupted)).toThrow(
			/metadata\.created is "2026-03-15T00:00:00\.000Z".*calendar date.*created: 2026-03-15/s,
		);
	});

	it("rejects a space-separated timestamp the same way", () => {
		const corrupted = DESKTOP_YAML.replace("2026-03-15", "2026-03-15 12:00:00");

		expect(() => parseThreatModelYaml(corrupted)).toThrow(/metadata\.created/);
	});

	it("rejects a document with no metadata section", () => {
		expect(() => parseThreatModelYaml(`version: "1.0"\n`)).toThrow(/no metadata section/);
	});

	it("rejects a missing date rather than defaulting it", () => {
		const noCreated = `version: "1.0"
metadata:
  title: No Created
  author: Alex Chen
  modified: 2026-03-20
`;

		expect(() => parseThreatModelYaml(noCreated)).toThrow(/metadata\.created is missing/);
	});

	it("rejects a collection section that is not a list", () => {
		const badElements = `${DESKTOP_YAML}elements: not-a-list\n`;

		expect(() => parseThreatModelYaml(badElements)).toThrow(/elements is not a list/);
	});

	it("rejects a document that is not a mapping", () => {
		expect(() => parseThreatModelYaml("just a string")).toThrow(/not a ThreatForge threat model/);
	});

	it("bounds an over-long corrupted scalar in its error message", () => {
		const longValue = `2026-03-15T${"0".repeat(80)}`;
		const corrupted = DESKTOP_YAML.replace("2026-03-15", longValue);

		let message = "";
		try {
			parseThreatModelYaml(corrupted);
		} catch (err) {
			message = err instanceof Error ? err.message : String(err);
		}
		expect(message).toContain("…");
		expect(message).not.toContain("0".repeat(80));
	});
});

describe("serializeThreatModelYaml", () => {
	it("writes calendar dates unquoted and time-free", () => {
		const model = parseThreatModelYaml(DESKTOP_YAML);
		const dumped = serializeThreatModelYaml(model);

		expect(dumped).toContain("created: 2026-03-15\n");
		expect(dumped).toContain("modified: 2026-03-20\n");
		expect(dumped).not.toContain("T00:00:00");
	});

	it("survives a desktop → browser → desktop date round trip", () => {
		const dumped = serializeThreatModelYaml(parseThreatModelYaml(DESKTOP_YAML));
		const reparsed = parseThreatModelYaml(dumped);

		expect(reparsed.metadata.created).toBe("2026-03-15");
		expect(reparsed.metadata.modified).toBe("2026-03-20");
	});

	it("survives a browser → desktop → browser date round trip", () => {
		// A model authored in memory (browser create path uses string dates) must serialize to a
		// form that parses back to the same strings.
		const model: ThreatModel = {
			version: "1.0",
			metadata: {
				title: "Browser Origin",
				author: "Alex Chen",
				created: "2026-06-01",
				modified: "2026-06-02",
				description: "",
			},
			elements: [],
			data_flows: [],
			trust_boundaries: [],
			threats: [],
			diagrams: [],
		};

		const reparsed = parseThreatModelYaml(serializeThreatModelYaml(model));
		expect(reparsed.metadata.created).toBe("2026-06-01");
		expect(reparsed.metadata.modified).toBe("2026-06-02");
	});
});
