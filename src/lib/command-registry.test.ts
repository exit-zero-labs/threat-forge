import { describe, expect, it, vi } from "vitest";
import { buildCommands, fuzzyMatch, searchCommands } from "./command-registry";

describe("command-registry", () => {
	describe("fuzzyMatch", () => {
		it("matches exact string", () => {
			expect(fuzzyMatch("save", "Save")).toBe(true);
		});

		it("matches subsequence", () => {
			expect(fuzzyMatch("sv", "Save")).toBe(true);
		});

		it("matches case-insensitively", () => {
			expect(fuzzyMatch("SAVE", "save")).toBe(true);
		});

		it("rejects non-matching string", () => {
			expect(fuzzyMatch("xyz", "Save")).toBe(false);
		});

		it("matches empty query against any string", () => {
			expect(fuzzyMatch("", "anything")).toBe(true);
		});

		it("matches partial beginning", () => {
			expect(fuzzyMatch("fit", "Fit to View")).toBe(true);
		});
	});

	describe("buildCommands", () => {
		const mockDeps = {
			newModel: vi.fn(),
			openModel: vi.fn(),
			importModel: vi.fn(),
			saveModel: vi.fn(),
			saveModelAs: vi.fn(),
			hasModel: false,
		};

		it("returns non-empty command list", () => {
			const commands = buildCommands(mockDeps);
			expect(commands.length).toBeGreaterThan(10);
		});

		it("all commands have required fields", () => {
			const commands = buildCommands(mockDeps);
			for (const cmd of commands) {
				expect(cmd.id).toBeTruthy();
				expect(cmd.label).toBeTruthy();
				expect(cmd.category).toBeTruthy();
				expect(typeof cmd.action).toBe("function");
			}
		});

		it("has unique IDs", () => {
			const commands = buildCommands(mockDeps);
			const ids = commands.map((c) => c.id);
			expect(new Set(ids).size).toBe(ids.length);
		});

		it("includes commands from all categories", () => {
			const commands = buildCommands(mockDeps);
			const categories = new Set(commands.map((c) => c.category));
			expect(categories).toContain("file");
			expect(categories).toContain("view");
			expect(categories).toContain("canvas");
			expect(categories).toContain("navigate");
			expect(categories).toContain("settings");
		});

		it("file:new action calls newModel", () => {
			const commands = buildCommands(mockDeps);
			const newCmd = commands.find((c) => c.id === "file:new");
			expect(newCmd).toBeDefined();
			newCmd?.action();
			expect(mockDeps.newModel).toHaveBeenCalled();
		});

		it("file:import action calls importModel", () => {
			const commands = buildCommands(mockDeps);
			const importCmd = commands.find((c) => c.id === "file:import");
			expect(importCmd).toBeDefined();
			importCmd?.action();
			expect(mockDeps.importModel).toHaveBeenCalled();
		});

		it("excludes component commands when hasModel is false", () => {
			const commands = buildCommands({ ...mockDeps, hasModel: false });
			const componentCmds = commands.filter((c) => c.category === "component");
			expect(componentCmds).toHaveLength(0);
		});

		it("includes component commands when hasModel is true", () => {
			const commands = buildCommands({ ...mockDeps, hasModel: true });
			const componentCmds = commands.filter((c) => c.category === "component");
			expect(componentCmds.length).toBeGreaterThan(20);
			expect(componentCmds.every((c) => c.id.startsWith("component:"))).toBe(true);
			expect(componentCmds.every((c) => c.label.startsWith("Add "))).toBe(true);
		});

		it("component commands have unique IDs", () => {
			const commands = buildCommands({ ...mockDeps, hasModel: true });
			const componentIds = commands.filter((c) => c.category === "component").map((c) => c.id);
			expect(new Set(componentIds).size).toBe(componentIds.length);
		});
	});

	describe("searchCommands", () => {
		const mockDeps = {
			newModel: vi.fn(),
			openModel: vi.fn(),
			importModel: vi.fn(),
			saveModel: vi.fn(),
			saveModelAs: vi.fn(),
			hasModel: false,
		};

		it("returns all commands for empty query", () => {
			const commands = buildCommands(mockDeps);
			expect(searchCommands(commands, "")).toEqual(commands);
			expect(searchCommands(commands, "  ")).toEqual(commands);
		});

		it("filters by label text", () => {
			const commands = buildCommands(mockDeps);
			const result = searchCommands(commands, "save");
			expect(result.length).toBeGreaterThanOrEqual(2); // "Save" and "Save As"
			expect(result.every((c) => fuzzyMatch("save", c.label) || fuzzyMatch("save", c.id))).toBe(
				true,
			);
		});

		it("filters by command ID", () => {
			const commands = buildCommands(mockDeps);
			const result = searchCommands(commands, "file:new");
			expect(result.length).toBe(1);
			expect(result[0].id).toBe("file:new");
		});

		it("returns empty array for non-matching query", () => {
			const commands = buildCommands(mockDeps);
			expect(searchCommands(commands, "xyznonexistent")).toEqual([]);
		});
	});
});
