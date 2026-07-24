import { describe, expect, it } from "vitest";
import {
	createRegistry,
	getComponent,
	getIcon,
	isKnownSubtype,
	listCategories,
	listComponents,
	listProviders,
	resolveComponent,
	resolveElementIcon,
	searchComponents,
} from "@/lib/registry/registry";

describe("registry lookup and total resolution", () => {
	it("getComponent and getIcon return undefined for unknown ids", () => {
		expect(getComponent("does_not_exist")).toBeUndefined();
		expect(getIcon("does_not_exist")).toBeUndefined();
	});

	it("resolveComponent is total: unknown types fall back to generic", () => {
		expect(resolveComponent("api_gateway").id).toBe("api_gateway");
		expect(resolveComponent("does_not_exist").id).toBe("generic");
		expect(resolveComponent("../../etc/passwd").id).toBe("generic");
	});

	it("resolveElementIcon follows the documented precedence", () => {
		// subtype naming a component -> that component's iconId
		expect(
			resolveElementIcon({ type: "process", subtype: "api_gateway", icon: "database" }).id,
		).toBe("router");
		// subtype naming a variant -> the variant's iconId (the shipped redis brand mark)
		expect(resolveElementIcon({ type: "cache", subtype: "redis" }).id).toBe("redis");
		// no subtype -> the component's default iconId
		expect(resolveElementIcon({ type: "web_server" }).id).toBe("globe");
	});

	it("an explicit icon now beats the component default", () => {
		// Reachable only by a hand- or AI-authored document that sets `icon` to a real icon id.
		expect(resolveElementIcon({ type: "web_server", icon: "database" }).id).toBe("database");
	});

	it("recognizes subtypes only in their component context", () => {
		expect(isKnownSubtype("cache", "redis")).toBe(true);
		expect(isKnownSubtype("cache", "rds")).toBe(false);
		expect(isKnownSubtype("process", "api_gateway")).toBe(true);
		expect(isKnownSubtype("unknown", "api_gateway")).toBe(false);
	});

	it("resolveElementIcon is total and never returns markup for untrusted input", () => {
		const icon = resolveElementIcon({
			type: "../../etc/passwd",
			subtype: "</path><script>",
			icon: "</path><script>alert(1)</script>",
		});
		expect(icon.id).toBe("box"); // the generic fallback glyph
		expect(icon.artwork.kind).toBe("lucide");
	});
});

describe("registry filtered listing", () => {
	it("listComponents excludes deprecated legacy DFD types by default", () => {
		const ids = listComponents().map((c) => c.id);
		expect(ids).not.toContain("process");
		expect(ids).not.toContain("data_store");
		expect(ids).not.toContain("external_entity");
		expect(listComponents({ includeDeprecated: true }).map((c) => c.id)).toContain("data_store");
	});

	it("listComponents filters by category and provider", () => {
		const databases = listComponents({ category: "databases" }).map((c) => c.id);
		expect(databases).toContain("sql_database");
		expect(databases).not.toContain("web_server");
		expect(listComponents({ provider: "aws" }).map((c) => c.id)).toEqual([
			"sql_database",
			"nosql_database",
			"object_storage",
			"message_queue",
			"event_bus",
			"cdn",
		]);
		expect(listComponents({ provider: "aws", category: "databases" }).map((c) => c.id)).toEqual([
			"sql_database",
			"nosql_database",
			"object_storage",
		]);
		expect(listComponents({ provider: "oss" }).map((c) => c.id)).toEqual([
			"cache",
			"message_queue",
			"event_bus",
		]);
	});

	it("searchComponents matches label, keywords, and variant labels", () => {
		expect(searchComponents("postgres").map((c) => c.id)).toContain("sql_database");
		expect(searchComponents("kafka").map((c) => c.id)).toContain("event_bus");
		expect(searchComponents("Amazon Web Services").map((c) => c.id)).toContain("sql_database");
		expect(searchComponents("database", { provider: "aws" }).map((c) => c.id)).toContain(
			"sql_database",
		);
		expect(searchComponents("").length).toBe(listComponents().length);
	});

	it("listCategories yields the legacy insertion order without generic", () => {
		expect(listCategories().map((c) => c.id)).toEqual([
			"annotations",
			"services",
			"databases",
			"messaging",
			"infrastructure",
			"security",
			"clients",
			"networking",
			"platform",
		]);
	});

	it("listProviders returns labelled, stable provider slugs", () => {
		const providers = listProviders().map((p) => p.id);
		expect(providers[0]).toBe("generic");
		expect(providers).toContain("aws");
		expect(providers).toContain("oss");
		expect(new Set(providers).size).toBe(providers.length);
	});
});

describe("createRegistry factory", () => {
	it("builds an isolated registry from injected data", () => {
		const custom = createRegistry(
			[
				{
					id: "generic",
					label: "Generic",
					aliases: [],
					category: "generic",
					provider: "generic",
					iconId: "box",
					shape: "rounded",
					strideRole: "service",
					keywords: [],
					variants: [],
					status: "active",
				},
			],
			[
				{
					id: "box",
					label: "Box",
					aliases: [],
					artwork: { kind: "lucide", name: "box" },
					provenance: {
						project: "Lucide",
						sourceUrl: "https://github.com/lucide-icons/lucide",
						sourceRef: "1.25.0",
						license: "ISC",
						copyright: "Lucide Contributors",
					},
					trademark: { kind: "none" },
					status: "active",
				},
			],
		);
		expect(custom.resolveComponent("anything").id).toBe("generic");
		expect(custom.resolveElementIcon({ type: "anything" }).id).toBe("box");
	});
});
