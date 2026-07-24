import { describe, expect, it } from "vitest";
import type { WorkspaceManifestEntry } from "@/lib/persistence/types";
import type { DocumentId } from "@/types/document";
import { mergeWorkspaceTabs, type WorkspaceTab } from "./workspace-tabs";

function entry(id: string, order: number, title = id): WorkspaceManifestEntry {
	return {
		id: id as DocumentId,
		title,
		filePath: null,
		order,
		createdAt: "2026-07-01T00:00:00.000Z",
		updatedAt: "2026-07-02T00:00:00.000Z",
	};
}

function ids(tabs: WorkspaceTab[]): string[] {
	return tabs.map((tab) => tab.id);
}

describe("mergeWorkspaceTabs", () => {
	it("renders a persisted-but-un-hydrated sibling in manifest order beside the hydrated active tab", () => {
		// The reload bug this fixes: manifest lists [Alpha, Bravo] in persisted order but only the
		// active Bravo is hydrated into the registry. The registry alone would hide Alpha.
		const manifest = [entry("alpha", 0), entry("bravo", 1)];
		const tabs = mergeWorkspaceTabs(manifest, ["bravo"] as DocumentId[]);

		expect(ids(tabs)).toEqual(["alpha", "bravo"]);
		expect(tabs[0]).toMatchObject({ id: "alpha", hydrated: false, title: "alpha" });
		expect(tabs[1]).toEqual({ id: "bravo", hydrated: true });
	});

	it("threads several un-hydrated documents into their persisted slots around the hydrated one", () => {
		const manifest = [entry("a", 0), entry("b", 1), entry("c", 2)];
		// Only the middle document is hydrated; the merge must place A before it and C after it.
		const tabs = mergeWorkspaceTabs(manifest, ["b"] as DocumentId[]);
		expect(ids(tabs)).toEqual(["a", "b", "c"]);
	});

	it("keeps the registry order authoritative for hydrated tabs so pin and reorder are honored", () => {
		const manifest = [entry("a", 0), entry("b", 1), entry("c", 2)];
		// The user reordered live tabs to [c, a, b]; the manifest still lists creation order.
		const registry = ["c", "a", "b"] as DocumentId[];
		const tabs = mergeWorkspaceTabs(manifest, registry);
		expect(ids(tabs)).toEqual(["c", "a", "b"]);
	});

	it("orders registry-only new documents after the persisted manifest tabs", () => {
		// "live" has no manifest entry yet (created this session, not yet autosaved); it must still
		// render, but it follows the persisted "stored" tab rather than jumping ahead of it — the
		// persisted manifest is the order authority for a document the user has actually seen.
		const manifest = [entry("stored", 0)];
		const registry = ["live"] as DocumentId[];
		const tabs = mergeWorkspaceTabs(manifest, registry);
		expect(ids(tabs)).toEqual(["stored", "live"]);
	});

	it("keeps a hydrated pinned tab leading even when the manifest lists an un-hydrated tab first", () => {
		// The pin invariant vs. the persisted order: the manifest lists [restored, pinnedLive] but
		// pinnedLive is pinned, so it must stay the leading block — a persisted-but-un-hydrated tab
		// can never thread ahead of a pinned live tab.
		const manifest = [entry("restored", 0), entry("pinnedLive", 1)];
		const registry = ["pinnedLive"] as DocumentId[];
		const tabs = mergeWorkspaceTabs(manifest, registry, new Set(["pinnedLive"] as DocumentId[]));
		expect(ids(tabs)).toEqual(["pinnedLive", "restored"]);
		expect(tabs[0]).toEqual({ id: "pinnedLive", hydrated: true });
		expect(tabs[1]).toMatchObject({ id: "restored", hydrated: false });
	});

	it("leads with the pinned block, then manifest-anchored tabs, then registry-only new tabs", () => {
		// A full three-block ordering: pinnedLive leads, the un-hydrated manifest tab renders in its
		// persisted slot, and the brand-new unwritten "fresh" tab trails everything.
		const manifest = [entry("stored", 0), entry("pinnedLive", 1)];
		const registry = ["pinnedLive", "fresh"] as DocumentId[];
		const tabs = mergeWorkspaceTabs(manifest, registry, new Set(["pinnedLive"] as DocumentId[]));
		expect(ids(tabs)).toEqual(["pinnedLive", "stored", "fresh"]);
	});

	it("falls back to pure registry order when nothing is persisted (desktop parity)", () => {
		const registry = ["one", "two", "three"] as DocumentId[];
		const tabs = mergeWorkspaceTabs([], registry);
		expect(ids(tabs)).toEqual(["one", "two", "three"]);
		expect(tabs.every((tab) => tab.hydrated)).toBe(true);
	});

	it("carries the manifest title and path onto an un-hydrated tab", () => {
		const manifest: WorkspaceManifestEntry[] = [
			{ ...entry("doc", 0, "Payments"), filePath: "/models/payments.thf" },
		];
		const tabs = mergeWorkspaceTabs(manifest, []);
		expect(tabs).toEqual([
			{ id: "doc", hydrated: false, title: "Payments", filePath: "/models/payments.thf" },
		]);
	});
});
