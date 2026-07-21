import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import type { DocumentId } from "@/types/document";
import { NoopWorkspaceStorage } from "./noop-workspace-storage";

const { isTauriMock } = vi.hoisted(() => ({ isTauriMock: vi.fn<() => boolean>() }));
vi.mock("@/lib/platform", () => ({ isTauri: isTauriMock }));

beforeEach(() => {
	// A fresh module registry gives each test its own factory cache.
	vi.resetModules();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("getWorkspaceStorage platform selection", () => {
	it("resolves the no-op on desktop without ever touching IndexedDB", async () => {
		isTauriMock.mockReturnValue(true);
		const openSpy = vi.spyOn(globalThis.indexedDB, "open");

		const { getWorkspaceStorage } = await import("./get-workspace-storage");
		const storage = await getWorkspaceStorage();

		expect(storage.constructor.name).toBe("NoopWorkspaceStorage");
		// Exercising the storage on desktop must not reach the IndexedDB path either.
		expect(await storage.isAvailable()).toBe(false);
		expect(await storage.listDocuments()).toEqual([]);
		expect(openSpy).not.toHaveBeenCalled();
	});

	it("resolves the IndexedDB implementation in the browser", async () => {
		isTauriMock.mockReturnValue(false);

		const { getWorkspaceStorage } = await import("./get-workspace-storage");
		const storage = await getWorkspaceStorage();

		expect(storage.constructor.name).toBe("IndexeddbWorkspaceStorage");
		expect(await storage.isAvailable()).toBe(true);
	});

	it("caches a single instance across calls", async () => {
		isTauriMock.mockReturnValue(false);

		const { getWorkspaceStorage } = await import("./get-workspace-storage");
		const first = await getWorkspaceStorage();
		const second = await getWorkspaceStorage();

		expect(first).toBe(second);
	});
});

describe("NoopWorkspaceStorage interface conformance", () => {
	it("satisfies every WorkspaceStorage method as an inert no-op", async () => {
		const storage = new NoopWorkspaceStorage();
		const id = "doc-noop" as DocumentId;

		expect(await storage.isAvailable()).toBe(false);
		expect(await storage.listDocuments()).toEqual([]);
		expect(await storage.readDocumentBody(id)).toBeNull();
		expect(await storage.listRevisions(id)).toEqual([]);
		// Writes and deletes resolve without error and store nothing.
		await expect(storage.writeDocumentBody(id, "body")).resolves.toBeUndefined();
		await expect(storage.deleteDocument(id)).resolves.toBeUndefined();
	});
});
