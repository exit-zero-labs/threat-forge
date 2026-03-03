import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useScrollablePage } from "./use-scrollable-page";

describe("useScrollablePage", () => {
	afterEach(() => {
		document.documentElement.style.overflow = "";
		document.body.style.overflow = "";
	});

	it("sets overflow to auto on mount", () => {
		renderHook(() => useScrollablePage());

		expect(document.documentElement.style.overflow).toBe("auto");
		expect(document.body.style.overflow).toBe("auto");
	});

	it("clears overflow on unmount", () => {
		const { unmount } = renderHook(() => useScrollablePage());
		expect(document.documentElement.style.overflow).toBe("auto");

		unmount();
		expect(document.documentElement.style.overflow).toBe("");
		expect(document.body.style.overflow).toBe("");
	});
});
