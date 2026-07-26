import { describe, expect, it } from "vitest";
import type { ToolOutcome } from "@/lib/ai/loop/tool-runtime";
import { UNTRUSTED_DOCUMENT_END, UNTRUSTED_DOCUMENT_START } from "@/lib/ai/untrusted-text";
import { COMPONENT_ENTRIES } from "@/lib/registry/component-entries";
import { CATALOG_READ_TOOL } from "./catalog-read-tool";

/** The complete set of keys any catalog entry projection may emit. */
const ALLOWED_ENTRY_KEYS = new Set([
	"id",
	"label",
	"category",
	"provider",
	"icon_id",
	"shape",
	"stride_role",
	"status",
	"aliases",
	"aliases_total",
	"keywords",
	"keywords_total",
	"variants",
	"variants_total",
]);

const ALLOWED_VARIANT_KEYS = new Set(["id", "label", "provider", "icon_id"]);

async function run(raw: unknown): Promise<ToolOutcome> {
	const prepared = CATALOG_READ_TOOL.prepare(raw);
	if (!prepared.ok) throw new Error(`prepare rejected: ${prepared.issues.join("; ")}`);
	// The catalog tool ignores its context, but the signature still demands one.
	return prepared.call.run({
		document: {
			version: "1.0",
			metadata: { title: "", author: "", created: "", modified: "", description: "" },
			elements: [],
			data_flows: [],
			trust_boundaries: [],
			threats: [],
			diagrams: [],
		},
		signal: new AbortController().signal,
	});
}

function parseBody(outcome: ToolOutcome): Record<string, unknown> {
	expect(outcome.status).toBe("ok");
	if (outcome.status !== "ok") throw new Error("unreachable");
	const lines = outcome.result.split("\n");
	expect(lines[0]).toBe(UNTRUSTED_DOCUMENT_START);
	expect(lines[lines.length - 1]).toBe(UNTRUSTED_DOCUMENT_END);
	return JSON.parse(lines.slice(1, -1).join("\n")) as Record<string, unknown>;
}

/** Page through the whole catalog for a filter, following `next_offset` to the end. */
async function sweep(raw: Record<string, unknown>): Promise<Record<string, unknown>[]> {
	const all: Record<string, unknown>[] = [];
	let offset = 0;
	for (;;) {
		const body = parseBody(await run({ ...raw, offset, limit: 50 }));
		const results = body.results as Record<string, unknown>[];
		all.push(...results);
		const page = body.page as { next_offset: number | null };
		if (page.next_offset === null) break;
		offset = page.next_offset;
	}
	return all;
}

describe("search_component_catalog schema", () => {
	it("is a read-only, non-destructive tool", () => {
		expect(CATALOG_READ_TOOL.name).toBe("search_component_catalog");
		expect(CATALOG_READ_TOOL.effect).toBe("read");
		expect(CATALOG_READ_TOOL.destructive).toBe(false);
	});

	it("rejects an unknown category and lists the valid members", () => {
		const result = CATALOG_READ_TOOL.prepare({ category: "not_a_category" });
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("unreachable");
		const joined = result.issues.join(" ");
		expect(joined).toContain("databases");
		expect(joined).toContain("services");
	});

	it("rejects an unknown provider and an out-of-range limit", () => {
		expect(CATALOG_READ_TOOL.prepare({ provider: "digitalocean" }).ok).toBe(false);
		expect(CATALOG_READ_TOOL.prepare({ limit: 51 }).ok).toBe(false);
	});
});

describe("search_component_catalog projection allowlist", () => {
	it("emits only allowlisted keys across a full unfiltered sweep, never provenance or license", async () => {
		const entries = await sweep({ include_deprecated: true });
		expect(entries).toHaveLength(COMPONENT_ENTRIES.length);

		const seenKeys = new Set<string>();
		const seenVariantKeys = new Set<string>();
		for (const entry of entries) {
			for (const key of Object.keys(entry)) seenKeys.add(key);
			for (const variant of entry.variants as Record<string, unknown>[]) {
				for (const key of Object.keys(variant)) seenVariantKeys.add(key);
			}
		}

		for (const key of seenKeys) expect(ALLOWED_ENTRY_KEYS.has(key)).toBe(true);
		for (const key of seenVariantKeys) expect(ALLOWED_VARIANT_KEYS.has(key)).toBe(true);
		for (const forbidden of [
			"provenance",
			"license",
			"artwork",
			"sourceFile",
			"copyright",
			"trademark",
			"iconId",
		]) {
			expect(seenKeys.has(forbidden)).toBe(false);
		}
	});
});

describe("search_component_catalog determinism and filtering", () => {
	it("returns byte-identical results across calls and in declaration order", async () => {
		const first = await run({ limit: 10 });
		const second = await run({ limit: 10 });
		expect(first.status).toBe("ok");
		if (first.status !== "ok" || second.status !== "ok") throw new Error("unreachable");
		expect(first.result).toBe(second.result);

		const results = (parseBody(first).results as { id: string }[]).map((entry) => entry.id);
		const active = COMPONENT_ENTRIES.filter((entry) => entry.status !== "deprecated");
		expect(results).toEqual(active.slice(0, 10).map((entry) => entry.id));
	});

	it("excludes deprecated entries by default and includes them on request", async () => {
		const deprecated = COMPONENT_ENTRIES.filter((entry) => entry.status === "deprecated");
		expect(deprecated.length).toBeGreaterThan(0);

		const defaultIds = (await sweep({})).map((entry) => entry.id as string);
		const withDeprecatedIds = (await sweep({ include_deprecated: true })).map(
			(entry) => entry.id as string,
		);

		for (const entry of deprecated) {
			expect(defaultIds).not.toContain(entry.id);
			expect(withDeprecatedIds).toContain(entry.id);
		}
	});

	it("rejects paging past the end of a non-empty match set", async () => {
		const outcome = await run({ offset: 9999 });
		expect(outcome.status).toBe("error");
		if (outcome.status !== "error") throw new Error("unreachable");
		expect(outcome.result).toContain("is past the end");
	});

	it("rejects an offset exactly equal to the active-entry count (off-by-one boundary)", async () => {
		const activeCount = COMPONENT_ENTRIES.filter((entry) => entry.status !== "deprecated").length;
		const outcome = await run({ offset: activeCount });
		expect(outcome.status).toBe("error");
		if (outcome.status !== "error") throw new Error("unreachable");
		expect(outcome.result).toContain("is past the end");
	});
});
