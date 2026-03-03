import { useEffect } from "react";

const DEFAULT_TITLE = "Threat Forge — Open-Source AI Threat Modeling";

/**
 * Sets `document.title` for the current page.
 *
 * On unmount, restores the default title rather than the previous title.
 * This avoids a clobbering bug: React Router mounts the new route before
 * unmounting the old one, so the old cleanup would overwrite the new title.
 */
export function useDocumentTitle(title: string): void {
	useEffect(() => {
		document.title = title;
		return () => {
			document.title = DEFAULT_TITLE;
		};
	}, [title]);
}
