import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import tauriConfigSource from "../../src-tauri/tauri.conf.json?raw";
import { PrivacyPage } from "./privacy-page";

/**
 * The privacy page states what the desktop app sends over the network, and that is only true
 * for one particular updater configuration. The two live in files nobody would think to change
 * together, so each assertion reads the real `tauri.conf.json` and only demands something of
 * the copy when the configuration makes the claim checkable (#259).
 */

const tauriConfigSchema = z.object({
	plugins: z.object({
		updater: z.object({
			endpoints: z.array(z.string()).nonempty(),
			pubkey: z.string(),
		}),
	}),
});

const updater = tauriConfigSchema.parse(JSON.parse(tauriConfigSource)).plugins.updater;

function privacyText(): string {
	render(
		<MemoryRouter>
			<PrivacyPage />
		</MemoryRouter>,
	);
	// Anchor on painted content so an empty render cannot pass as clean copy.
	expect(screen.getByRole("heading", { name: "Privacy Policy" })).toBeInTheDocument();
	return document.body.textContent ?? "";
}

describe("Privacy page auto-updater section", () => {
	it("does not claim the check sends data the endpoint has no way to carry", () => {
		const carriesVersion = updater.endpoints.some((e) => e.includes("{{current_version}}"));
		// tauri-plugin-updater substitutes exactly four placeholders (updater.rs:437-440).
		// `{{bundle_type}}` names the installer format, which reveals the platform too.
		const carriesTarget = updater.endpoints.some(
			(e) => e.includes("{{target}}") || e.includes("{{arch}}") || e.includes("{{bundle_type}}"),
		);
		expect(
			carriesVersion,
			"endpoint gained a version placeholder — the privacy copy must now say the version is sent",
		).toBe(false);
		expect(
			carriesTarget,
			"endpoint gained a target placeholder — the privacy copy must now say the platform is sent",
		).toBe(false);

		const text = privacyText();
		expect(text).toContain("carries no version number and nothing about your machine");
	});

	it("says what GitHub does see, rather than claiming nothing identifying is sent", () => {
		const text = privacyText();
		expect(text).toContain("GitHub does see your IP address");
		expect(text).not.toContain("no personally identifiable information is transmitted");
	});

	it("describes updates as unavailable for as long as releases are unsigned", () => {
		expect(
			updater.pubkey,
			"a signing pubkey was configured — the privacy copy still says updates are not switched on",
		).toBe("");

		const text = privacyText();
		expect(text).toContain("Automatic updates are not switched on yet");
	});
});
