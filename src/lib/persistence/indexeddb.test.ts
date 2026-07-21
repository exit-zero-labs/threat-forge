import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { mapWorkspaceError, openWorkspaceDb } from "./indexeddb";
import {
	INDEX_BY_DOCUMENT,
	STORE_DOCUMENTS,
	STORE_META,
	STORE_REVISIONS,
	type WorkspaceMigration,
} from "./migrations";
import { WorkspaceStorageError } from "./types";

beforeEach(() => {
	// A fresh in-memory IndexedDB per test keeps opens deterministic and isolated.
	globalThis.indexedDB = new IDBFactory();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("openWorkspaceDb schema creation", () => {
	it("creates the documents, revisions, and meta stores with the by_document index", async () => {
		const db = await openWorkspaceDb();

		expect(db.version).toBe(1);
		expect([...db.objectStoreNames].sort()).toEqual(
			[STORE_DOCUMENTS, STORE_META, STORE_REVISIONS].sort(),
		);

		const transaction = db.transaction(STORE_REVISIONS, "readonly");
		const indexNames = [...transaction.objectStore(STORE_REVISIONS).indexNames];
		expect(indexNames).toContain(INDEX_BY_DOCUMENT);
		db.close();
	});

	it("writes a readable schema marker into the meta store", async () => {
		const db = await openWorkspaceDb();
		const marker = await new Promise((resolve, reject) => {
			const request = db
				.transaction(STORE_META, "readonly")
				.objectStore(STORE_META)
				.get("schemaVersion");
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		expect(marker).toEqual({ key: "schemaVersion", value: 1 });
		db.close();
	});
});

describe("openWorkspaceDb migration failure is fail-closed", () => {
	const throwingMigration: WorkspaceMigration = {
		from: 1,
		to: 2,
		upgrade: () => {
			throw new Error("simulated migration failure");
		},
	};

	it("aborts the upgrade, leaves the database at its prior version, and rejects migration-failed", async () => {
		// Establish version 1 with real data.
		const v1 = await openWorkspaceDb();
		await new Promise<void>((resolve, reject) => {
			const transaction = v1.transaction(STORE_DOCUMENTS, "readwrite");
			transaction.objectStore(STORE_DOCUMENTS).put({
				id: "doc-keep",
				currentRevisionId: "doc-keep#1",
				updatedAt: "2026-07-21T00:00:00.000Z",
			});
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error);
		});
		v1.close();

		// Attempt an upgrade to version 2 whose migration throws.
		const upgrade = openWorkspaceDb({ version: 2, migrations: [throwingMigration] });
		await expect(upgrade).rejects.toBeInstanceOf(WorkspaceStorageError);
		await expect(upgrade).rejects.toMatchObject({ kind: "migration-failed" });

		// The database must remain at version 1 with its data intact — never half-migrated.
		const reopened = await openWorkspaceDb();
		expect(reopened.version).toBe(1);
		const surviving = await new Promise((resolve, reject) => {
			const request = reopened
				.transaction(STORE_DOCUMENTS, "readonly")
				.objectStore(STORE_DOCUMENTS)
				.get("doc-keep");
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		expect(surviving).toMatchObject({ id: "doc-keep" });
		reopened.close();
	});

	it("never deletes the database on migration failure", async () => {
		const v1 = await openWorkspaceDb();
		// Close the v1 connection so the upgrade is not blocked and the migration actually runs.
		v1.close();
		const deleteSpy = vi.spyOn(globalThis.indexedDB, "deleteDatabase");

		await expect(
			openWorkspaceDb({ version: 2, migrations: [throwingMigration] }),
		).rejects.toMatchObject({ kind: "migration-failed" });

		expect(deleteSpy).not.toHaveBeenCalled();
	});
});

describe("openWorkspaceDb environment failures", () => {
	it("rejects with 'unavailable' when indexedDB is absent", async () => {
		const original = globalThis.indexedDB;
		// Simulate an environment with no IndexedDB (e.g. a locked-down context).
		Reflect.deleteProperty(globalThis, "indexedDB");
		try {
			await expect(openWorkspaceDb()).rejects.toMatchObject({ kind: "unavailable" });
		} finally {
			globalThis.indexedDB = original;
		}
	});

	it("rejects with 'private-mode' when open() throws a SecurityError", async () => {
		vi.spyOn(globalThis.indexedDB, "open").mockImplementation(() => {
			throw new DOMException("blocked in private mode", "SecurityError");
		});
		await expect(openWorkspaceDb()).rejects.toMatchObject({ kind: "private-mode" });
	});
});

describe("mapWorkspaceError classification", () => {
	it("distinguishes quota exhaustion from other failures", () => {
		expect(mapWorkspaceError(new DOMException("full", "QuotaExceededError")).kind).toBe(
			"quota-exceeded",
		);
		expect(mapWorkspaceError(new DOMException("aborted", "AbortError")).kind).toBe("aborted");
		expect(mapWorkspaceError(new DOMException("blocked", "SecurityError")).kind).toBe(
			"private-mode",
		);
		expect(mapWorkspaceError(new Error("something else")).kind).toBe("unknown");
	});

	it("passes an already-typed WorkspaceStorageError through unchanged", () => {
		const original = new WorkspaceStorageError("corrupt", "bad record");
		expect(mapWorkspaceError(original)).toBe(original);
	});
});
