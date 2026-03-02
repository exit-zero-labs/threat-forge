import { describe, expect, it } from "vitest";
import {
	COMPONENT_CATEGORIES,
	COMPONENT_LIBRARY,
	getComponentBySubtype,
	getComponentByType,
	getComponentsByCategory,
	getIconComponent,
	getShapeForType,
	getStrideCategoryForType,
	getSubtypesForType,
	searchComponents,
} from "./component-library";

describe("component-library", () => {
	it("has at least 25 components", () => {
		expect(COMPONENT_LIBRARY.length).toBeGreaterThanOrEqual(25);
	});

	it("has a generic component entry", () => {
		const generic = getComponentByType("generic");
		expect(generic).toBeDefined();
		expect(generic?.shape).toBe("rounded");
		expect(generic?.strideCategory).toBe("service");
		expect(generic?.category).toBe("Generic");
	});

	it("has unique IDs across all components", () => {
		const ids = COMPONENT_LIBRARY.map((c) => c.id);
		const uniqueIds = new Set(ids);
		expect(uniqueIds.size).toBe(ids.length);
	});

	it("includes expected categories", () => {
		expect(COMPONENT_CATEGORIES).toContain("Services");
		expect(COMPONENT_CATEGORIES).toContain("Databases");
		expect(COMPONENT_CATEGORIES).toContain("Messaging");
		expect(COMPONENT_CATEGORIES).toContain("Infrastructure");
		expect(COMPONENT_CATEGORIES).toContain("Security");
		expect(COMPONENT_CATEGORIES).toContain("Clients");
	});

	it("excludes Generic from COMPONENT_CATEGORIES", () => {
		expect(COMPONENT_CATEGORIES).not.toContain("Generic");
	});

	it("getComponentByType returns correct definition", () => {
		const comp = getComponentByType("api_gateway");
		expect(comp).toBeDefined();
		expect(comp?.label).toBe("API Gateway");
		expect(comp?.shape).toBe("rounded");
		expect(comp?.strideCategory).toBe("service");
		expect(comp?.icon).toBe("router");
	});

	it("getComponentByType returns undefined for unknown type", () => {
		expect(getComponentByType("nonexistent")).toBeUndefined();
	});

	it("getComponentBySubtype is a deprecated alias for getComponentByType", () => {
		const byType = getComponentByType("sql_database");
		const bySubtype = getComponentBySubtype("sql_database");
		expect(byType).toBe(bySubtype);
	});

	it("getShapeForType returns correct shapes", () => {
		expect(getShapeForType("web_server")).toBe("rounded");
		expect(getShapeForType("sql_database")).toBe("database");
		expect(getShapeForType("web_browser")).toBe("rect");
		expect(getShapeForType("load_balancer")).toBe("hexagon");
		expect(getShapeForType("unknown_type")).toBe("rounded"); // default
	});

	it("getStrideCategoryForType returns correct categories", () => {
		expect(getStrideCategoryForType("api_gateway")).toBe("service");
		expect(getStrideCategoryForType("sql_database")).toBe("store");
		expect(getStrideCategoryForType("web_browser")).toBe("actor");
		expect(getStrideCategoryForType("unknown_type")).toBe("service"); // default
	});

	it("getSubtypesForType returns subtypes for sql_database", () => {
		const subtypes = getSubtypesForType("sql_database");
		expect(subtypes.length).toBeGreaterThanOrEqual(2);
		expect(subtypes.some((st) => st.id === "rds")).toBe(true);
	});

	it("getSubtypesForType returns empty array for no subtypes", () => {
		expect(getSubtypesForType("web_server")).toEqual([]);
		expect(getSubtypesForType("nonexistent")).toEqual([]);
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

	it("searchComponents excludes Generic for empty query", () => {
		const results = searchComponents("");
		expect(results.every((c) => c.category !== "Generic")).toBe(true);
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

	it("every component has a valid shape and stride category", () => {
		const validShapes = ["rounded", "database", "rect", "hexagon"];
		const validStride = ["service", "store", "actor"];
		for (const comp of COMPONENT_LIBRARY) {
			expect(validShapes, `Invalid shape for ${comp.id}`).toContain(comp.shape);
			expect(validStride, `Invalid strideCategory for ${comp.id}`).toContain(comp.strideCategory);
		}
	});
});
