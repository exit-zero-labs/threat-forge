import { useEffect } from "react";

/**
 * Enables page scrolling for marketing pages.
 *
 * The app's base styles set `html, body { overflow: hidden }` for the
 * desktop-app feel. Marketing pages need vertical scrolling, so this
 * hook toggles overflow on mount and restores on unmount.
 */
export function useScrollablePage(): void {
	useEffect(() => {
		const html = document.documentElement;
		const body = document.body;

		html.style.overflow = "auto";
		body.style.overflow = "auto";

		return () => {
			html.style.overflow = "";
			body.style.overflow = "";
		};
	}, []);
}
