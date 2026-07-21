import { isTauri } from "@/lib/platform";
import type { WorkspaceStorage } from "./workspace-storage";

let cached: WorkspaceStorage | null = null;

/**
 * Resolve the workspace storage implementation for this platform (issue #56, D4).
 *
 * Mirrors the adapter-factory pattern (`get-file-adapter.ts`): the desktop branch lazy-imports
 * the no-op and the browser branch lazy-imports the IndexedDB implementation, so desktop never
 * loads — and therefore never reaches — any IndexedDB code path. The result is cached for the
 * process lifetime.
 */
export async function getWorkspaceStorage(): Promise<WorkspaceStorage> {
	if (cached) return cached;

	if (isTauri()) {
		const { NoopWorkspaceStorage } = await import("./noop-workspace-storage");
		cached = new NoopWorkspaceStorage();
	} else {
		const { IndexeddbWorkspaceStorage } = await import("./indexeddb-workspace-storage");
		cached = new IndexeddbWorkspaceStorage();
	}

	return cached;
}
