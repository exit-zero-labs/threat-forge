import { describe, expect, it } from "vitest";
import {
	COMPONENT_CATEGORIES,
	COMPONENT_LIBRARY,
	getComponentBySubtype,
	getComponentsByCategory,
	getIconComponent,
	searchComponents,
} from "./component-library";

describe("component-library", () => {
	it("has at least 25 components", () => {
		expect(COMPONENT_LIBRARY.length).toBeGreaterThanOrEqual(25);
	});

	it("has 3 base types in Basics category", () => {
		const basics = getComponentsByCategory("Basics");
		expect(basics).toHaveLength(3);
		expect(basics.map((c) => c.id).sort()).toEqual(["data_store", "external_entity", "process"]);
		for (const c of basics) {
			expect(c.isBaseType).toBe(true);
		}
	});

	it("has unique IDs across all components", () => {
		const ids = COMPONENT_LIBRARY.map((c) => c.id);
		const uniqueIds = new Set(ids);
		expect(uniqueIds.size).toBe(ids.length);
	});

	it("includes expected categories", () => {
		expect(COMPONENT_CATEGORIES).toContain("Basics");
		expect(COMPONENT_CATEGORIES).toContain("Services");
		expect(COMPONENT_CATEGORIES).toContain("Databases");
		expect(COMPONENT_CATEGORIES).toContain("Messaging");
		expect(COMPONENT_CATEGORIES).toContain("Infrastructure");
		expect(COMPONENT_CATEGORIES).toContain("Security");
		expect(COMPONENT_CATEGORIES).toContain("Clients");
	});

	it("getComponentBySubtype returns correct definition", () => {
		const comp = getComponentBySubtype("api_gateway");
		expect(comp).toBeDefined();
		expect(comp?.label).toBe("API Gateway");
		expect(comp?.type).toBe("process");
		expect(comp?.icon).toBe("router");
	});

	it("getComponentBySubtype returns undefined for unknown subtype", () => {
		expect(getComponentBySubtype("nonexistent")).toBeUndefined();
	});

	it("searchComponents finds by label substring", () => {
		const results = searchComponents("gateway");
		expect(results.length).toBeGreaterThanOrEqual(1);
		expect(results.some((c) => c.id === "api_gateway")).toBe(true);
	});

	it("searchComponents finds by tag", () => {
		const results = searchComponents("postgres");
		expect(results.length).toBeGreaterThanOrEqual(1);
		expect(results.some((c) => c.id === "sql_database")).toBe(true);
	});

	it("searchComponents is case-insensitive", () => {
		const upper = searchComponents("API");
		const lower = searchComponents("api");
		expect(upper).toEqual(lower);
	});

	it("searchComponents returns all for empty query", () => {
		expect(searchComponents("")).toEqual(COMPONENT_LIBRARY);
		expect(searchComponents("  ")).toEqual(COMPONENT_LIBRARY);
	});

	it("getComponentsByCategory returns correct items", () => {
		const databases = getComponentsByCategory("Databases");
		expect(databases.length).toBeGreaterThanOrEqual(4);
		for (const c of databases) {
			expect(c.category).toBe("Databases");
		}
	});

	it("all icon names resolve to valid lucide components", () => {
		for (const comp of COMPONENT_LIBRARY) {
			const icon = getIconComponent(comp.icon);
			expect(icon, `Icon "${comp.icon}" for component "${comp.id}" should resolve`).toBeDefined();
		}
	});

	it("getIconComponent returns undefined for unknown icon", () => {
		expect(getIconComponent("nonexistent_icon")).toBeUndefined();
	});

	it("every component has a valid ElementType", () => {
		const validTypes = ["process", "data_store", "external_entity"];
		for (const comp of COMPONENT_LIBRARY) {
			expect(validTypes).toContain(comp.type);
		}
	});
});
