import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useScrollablePage } from "@/hooks/use-scrollable-page";
import { useSettingsStore } from "@/stores/settings-store";
import { FONT_SIZE_PX } from "@/types/settings";
import { NavBar } from "./nav-bar";
import { PageFooter } from "./page-footer";
import { WebsiteSettingsModal } from "./website-settings-modal";

interface PageShellProps {
	title: string;
	children: ReactNode;
}

/**
 * Shared wrapper for all marketing/content pages.
 * Enables scrolling, sets document title, and renders nav + footer.
 */
export function PageShell({ title, children }: PageShellProps) {
	useScrollablePage();
	useDocumentTitle(title);

	// Apply font size preference to <html> so rem-based sizes cascade.
	// No cleanup — React Router mounts the new route before unmounting the old one,
	// so cleanup would clear the incoming page's font size. Same pattern as useDocumentTitle.
	const fontSize = useSettingsStore((s) => s.settings.fontSize);
	useEffect(() => {
		const px = FONT_SIZE_PX[fontSize];
		if (px != null) {
			document.documentElement.style.fontSize = `${px}px`;
		}
	}, [fontSize]);

	const [settingsOpen, setSettingsOpen] = useState(false);
	const openSettings = useCallback(() => setSettingsOpen(true), []);
	const closeSettings = useCallback(() => setSettingsOpen(false), []);

	return (
		<div className="min-h-screen bg-background text-foreground">
			<NavBar />
			<main>{children}</main>
			<PageFooter onOpenSettings={openSettings} />
			<WebsiteSettingsModal open={settingsOpen} onClose={closeSettings} />
		</div>
	);
}
