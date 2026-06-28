import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

function removeBeacons() {
	for (const s of document.querySelectorAll("script[data-cf-beacon]")) {
		s.remove();
	}
}

describe("CloudflareAnalytics", () => {
	afterEach(() => {
		removeBeacons();
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	it("injects no beacon when the token is unset", async () => {
		vi.stubEnv("VITE_CF_BEACON_TOKEN", "");
		vi.resetModules();
		const { CloudflareAnalytics } = await import("./cloudflare-analytics");

		render(<CloudflareAnalytics />);

		expect(document.querySelector("script[data-cf-beacon]")).toBeNull();
	});

	it("injects the Cloudflare beacon with the token when set", async () => {
		vi.stubEnv("VITE_CF_BEACON_TOKEN", "test-token-123");
		vi.resetModules();
		const { CloudflareAnalytics } = await import("./cloudflare-analytics");

		render(<CloudflareAnalytics />);

		const script = document.querySelector("script[data-cf-beacon]");
		expect(script).not.toBeNull();
		expect(script?.getAttribute("src")).toBe("https://static.cloudflareinsights.com/beacon.min.js");
		expect(script?.getAttribute("data-cf-beacon")).toBe(
			JSON.stringify({ token: "test-token-123" }),
		);
	});

	it("injects only one beacon even when mounted twice", async () => {
		vi.stubEnv("VITE_CF_BEACON_TOKEN", "test-token-123");
		vi.resetModules();
		const { CloudflareAnalytics } = await import("./cloudflare-analytics");

		render(<CloudflareAnalytics />);
		render(<CloudflareAnalytics />);

		expect(document.querySelectorAll("script[data-cf-beacon]")).toHaveLength(1);
	});
});
