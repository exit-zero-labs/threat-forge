import type { ThreatModel } from "@/types/threat-model";

/**
 * The name a document shows to the user, resolved from one place so the tab, the window/tab
 * title, and the menu-bar title cannot drift (`#54` D2).
 *
 * The file basename with its extension stripped wins when the document has a path; otherwise the
 * model's metadata title; otherwise the app name. The path is split on both `/` and `\`, so a
 * Windows path resolves to its basename on every platform — which `use-window-title.ts` already
 * did and `top-menu-bar.tsx` did not.
 *
 * The module is named `document-display-title` rather than `document-title` because
 * `use-document-title.ts` already exists for the unrelated marketing routes.
 */
export function documentDisplayTitle(model: ThreatModel | null, filePath: string | null): string {
	return resolveDisplayTitle(model?.metadata.title ?? null, filePath);
}

/**
 * The same title resolution as {@link documentDisplayTitle}, but from a bare cached title rather
 * than a loaded model. Used to label a persisted, un-hydrated tab (`#56`), whose body is not in
 * memory yet: the workspace manifest caches only the `metadata.title` string, so a restored tab
 * resolves its label identically to the hydrated one — path basename first, then the cached
 * title, then the app name — and the two cannot drift when the document is finally hydrated.
 */
export function resolveDisplayTitle(title: string | null, filePath: string | null): string {
	if (filePath) {
		const basename = filePath
			.split(/[/\\]/)
			.pop()
			?.replace(/\.[^.]+$/, "");
		if (basename) return basename;
	}
	return title ?? "Threat Forge";
}
