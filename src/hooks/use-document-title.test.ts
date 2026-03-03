import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useDocumentTitle } from "./use-document-title";

const DEFAULT_TITLE = "Threat Forge — Open-Source AI Threat Modeling";

describe("useDocumentTitle", () => {
	afterEach(() => {
		document.title = DEFAULT_TITLE;
	});

	it("sets document.title to the provided value", () => {
		renderHook(() => useDocumentTitle("Download Threat Forge"));
		expect(document.title).toBe("Download Threat Forge");
	});

	it("restores default title on unmount", () => {
		const { unmount } = renderHook(() => useDocumentTitle("About"));
		expect(document.title).toBe("About");

		unmount();
		expect(document.title).toBe(DEFAULT_TITLE);
	});

	it("updates title when prop changes", () => {
		const { rerender } = renderHook(({ title }) => useDocumentTitle(title), {
			initialProps: { title: "Page A" },
		});
		expect(document.title).toBe("Page A");

		rerender({ title: "Page B" });
		expect(document.title).toBe("Page B");
	});
});
