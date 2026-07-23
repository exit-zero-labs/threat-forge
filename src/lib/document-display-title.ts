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
	if (filePath) {
		const basename = filePath
			.split(/[/\\]/)
			.pop()
			?.replace(/\.[^.]+$/, "");
		if (basename) return basename;
	}
	return model?.metadata.title ?? "Threat Forge";
}
