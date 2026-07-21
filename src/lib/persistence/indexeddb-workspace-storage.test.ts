import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import type { DocumentId } from "@/types/document";
import { IndexeddbWorkspaceStorage } from "./indexeddb-workspace-storage";
import { WorkspaceStorageError } from "./types";

const DOC = "doc-1111" as DocumentId;
const OTHER = "doc-2222" as DocumentId;

beforeEach(() => {
	globalThis.indexedDB = new IDBFactory();
});

afterEach(() => {
	vi.restoreAllMocks();
});

async function pointerFor(
	storage: IndexeddbWorkspaceStorage,
	id: DocumentId,
): Promise<string | undefined> {
	const documents = await storage.listDocuments();
	return documents.find((record) => record.id === id)?.currentRevisionId;
}

describe("IndexeddbWorkspaceStorage reads and writes", () => {
	it("resolves the latest committed body through the pointer", async () => {
		const storage = new IndexeddbWorkspaceStorage();
		await storage.writeDocumentBody(DOC, "version-a");
		await storage.writeDocumentBody(DOC, "version-b");

		expect(await storage.readDocumentBody(DOC)).toBe("version-b");
		expect(await pointerFor(storage, DOC)).toBe(`${DOC}#2`);
	});

	it("returns null for a document that was never stored", async () => {
		const storage = new IndexeddbWorkspaceStorage();
		expect(await storage.readDocumentBody(DOC)).toBeNull();
	});

	it("reports availability when IndexedDB opens", async () => {
		const storage = new IndexeddbWorkspaceStorage();
		expect(await storage.isAvailable()).toBe(true);
	});

	it("keeps documents isolated from one another", async () => {
		const storage = new IndexeddbWorkspaceStorage();
		await storage.writeDocumentBody(DOC, "doc-1-body");
		await storage.writeDocumentBody(OTHER, "doc-2-body");

		expect(await storage.readDocumentBody(DOC)).toBe("doc-1-body");
		expect(await storage.readDocumentBody(OTHER)).toBe("doc-2-body");
	});
});

describe("crash safety: write-new-revision-then-flip-pointer is atomic", () => {
	it("keeps the old pointer AND old body when a write aborts after the revision put, before commit", async () => {
		const storage = new IndexeddbWorkspaceStorage();
		// First write commits normally.
		await storage.writeDocumentBody(DOC, "committed-body");
		const pointerBefore = await pointerFor(storage, DOC);
		expect(pointerBefore).toBe(`${DOC}#1`);

		// Second write is aborted after the revision put and pointer flip are queued but before
		// the transaction commits. A non-atomic "flip pointer then write revision" implementation
		// would leave the pointer advanced to a revision that never landed and fail here.
		const aborted = storage.writeDocumentBody(DOC, "never-committed-body", {
			beforeCommit: (transaction) => transaction.abort(),
		});
		await expect(aborted).rejects.toBeInstanceOf(WorkspaceStorageError);

		// The pointer still references the first revision...
		expect(await pointerFor(storage, DOC)).toBe(pointerBefore);
		// ...and reading returns the old, still-intact body.
		expect(await storage.readDocumentBody(DOC)).toBe("committed-body");
		// ...and the aborted revision never became a stored revision.
		const revisions = await storage.listRevisions(DOC);
		expect(revisions).toHaveLength(1);
		expect(revisions[0].thf).toBe("committed-body");
	});

	it("durably persists a committed body across a fresh reconnection", async () => {
		const writer = new IndexeddbWorkspaceStorage();
		await writer.writeDocumentBody(DOC, "durable-body");

		// A brand-new instance opens its own connection — the reconnect a browser restart makes.
		const reader = new IndexeddbWorkspaceStorage();
		expect(await reader.readDocumentBody(DOC)).toBe("durable-body");
		expect(await pointerFor(reader, DOC)).toBe(`${DOC}#1`);
	});
});

describe("bounded revision retention", () => {
	it("prunes the oldest revision at the boundary: the 21st write drops the 1st, pointer intact", async () => {
		const storage = new IndexeddbWorkspaceStorage();
		for (let i = 1; i <= 21; i++) {
			await storage.writeDocumentBody(DOC, `body-${i}`);
		}

		const revisions = await storage.listRevisions(DOC);
		expect(revisions).toHaveLength(20);
		// The first revision (seq 1) is gone; the retained window is seq 2..21.
		expect(revisions.map((revision) => revision.seq)).toEqual(
			Array.from({ length: 20 }, (_, index) => index + 2),
		);
		// The pointer still resolves the newest committed body.
		expect(await pointerFor(storage, DOC)).toBe(`${DOC}#21`);
		expect(await storage.readDocumentBody(DOC)).toBe("body-21");
	});

	it("never retains more than the cap even after many writes", async () => {
		const storage = new IndexeddbWorkspaceStorage();
		for (let i = 1; i <= 25; i++) {
			await storage.writeDocumentBody(DOC, `body-${i}`);
		}
		const revisions = await storage.listRevisions(DOC);
		expect(revisions).toHaveLength(20);
		expect(revisions[0].seq).toBe(6);
		expect(revisions[revisions.length - 1].seq).toBe(25);
	});
});

describe("quota exhaustion fails visibly and non-destructively", () => {
	it("rejects with a typed quota error and leaves the prior committed revision readable", async () => {
		const storage = new IndexeddbWorkspaceStorage();
		await storage.writeDocumentBody(DOC, "safe-body");

		// Simulate the store rejecting the next write for lack of space.
		vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => {
			throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
		});

		const write = storage.writeDocumentBody(DOC, "too-big-body");
		await expect(write).rejects.toMatchObject({ kind: "quota-exceeded" });

		vi.restoreAllMocks();
		// The earlier committed revision is untouched and still readable.
		expect(await storage.readDocumentBody(DOC)).toBe("safe-body");
	});
});

describe("deleteDocument", () => {
	it("removes the pointer and every revision for the document", async () => {
		const storage = new IndexeddbWorkspaceStorage();
		await storage.writeDocumentBody(DOC, "a");
		await storage.writeDocumentBody(DOC, "b");
		await storage.writeDocumentBody(OTHER, "other");

		await storage.deleteDocument(DOC);

		expect(await storage.readDocumentBody(DOC)).toBeNull();
		expect(await storage.listRevisions(DOC)).toHaveLength(0);
		// A sibling document is unaffected.
		expect(await storage.readDocumentBody(OTHER)).toBe("other");
	});
});
