/**
 * #234: the AI settings panel over a real, damaged browser key vault.
 *
 * The panel suite in `ai-settings-content.test.tsx` mocks the keychain adapter, so it can pin
 * how the panel renders a rejection but not that a damaged vault produces one. This file
 * composes the real {@link BrowserKeychainAdapter}, real IndexedDB and real Web Crypto with
 * the rendered panel, so the property under test is end to end: a profile whose wrapping key
 * is gone while its encrypted record survives must not read as "API key configured", and must
 * not read as "No API key configured" either.
 *
 * Separate from that suite deliberately. It needs `fake-indexeddb/auto` installed as the
 * global factory, and doing that inside the mocked suite would change the environment for
 * eight hundred lines of tests that must not have one.
 * `src/lib/persistence/no-key-leakage.test.ts` is the precedent for a property-named file that
 * composes real storage with rendered components.
 */

import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { BrowserKeychainAdapter } from "@/lib/adapters/browser-keychain-adapter";
import { resetKeyVault, writeWrapKeyStore } from "@/lib/adapters/test-fixtures/key-vault";
import { useChatStore } from "@/stores/chat-store";
import { useKeyResidueStore } from "@/stores/key-residue-store";
import { useSettingsStore } from "@/stores/settings-store";
import { DEFAULT_USER_SETTINGS } from "@/types/settings";
import { AiSettingsContent } from "./ai-settings-content";

/**
 * The vault's authored sentence for a damaged vault, written out rather than imported.
 *
 * `VAULT_CORRUPT_MESSAGE` is private to `browser-key-vault.ts`, and exporting it so a test
 * could compare against it would make this assertion tautological — the test would agree with
 * whatever the module said. Spelled out here, it fails if the copy changes, which is the
 * point: this is the exact text acceptance criterion 5 requires the user to see.
 */
const VAULT_DAMAGED_SENTENCE =
	"Encrypted key storage in this browser is damaged. Clear this site's browser data, then add your API key again.";

const SECRET = "sk-ant-test-0123456789abcdef";

vi.mock("@/lib/adapters/get-keychain-adapter", () => ({
	getKeychainAdapter: async () => new BrowserKeychainAdapter(),
}));

beforeEach(() => {
	resetKeyVault();
	localStorage.clear();
	useChatStore.setState({ provider: "anthropic" });
	useKeyResidueStore.setState({ residue: { anthropic: null, openai: null } });
	useSettingsStore.setState({ settings: { ...DEFAULT_USER_SETTINGS } });
});

describe("AI settings over a vault this browser cannot read", () => {
	it("reports the fault instead of reporting the stored key as configured", async () => {
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);
		// The state the issue describes: the ciphertext survives, the wrapping key does not.
		await writeWrapKeyStore([]);

		await act(async () => {
			render(<AiSettingsContent />);
		});

		// Awaited rather than read synchronously: the real vault answers over several IndexedDB
		// task turns, so the panel is still on "Checking key storage…" when `render` returns.
		expect(await screen.findByText("Key storage could not be read")).toBeInTheDocument();
		// The defect, stated as an assertion: a green dot over a credential nothing can
		// decrypt, which the user only discovers when a request fails.
		expect(screen.queryByText("API key configured")).toBeNull();
		// And not the opposite claim either. The record is still there; "no API key" points the
		// user at entering one, and hides that their stored credential is stranded.
		expect(screen.queryByText("No API key configured")).toBeNull();

		// The remedy reaches the user, and nothing else does. Compared exactly rather than by
		// substring: a raw `DOMException` appended to the authored sentence would still satisfy
		// a `/damaged/` match, and this is the check that a vault fault carries no internal
		// detail to the UI.
		const messageBlock = screen.getByText(/Encrypted key storage in this browser is damaged/);
		expect(messageBlock.textContent).toBe(VAULT_DAMAGED_SENTENCE);

		// `deleteKey` writes a permanent revocation marker. A status the panel could not read is
		// not a licence to offer that over a record nobody has successfully read.
		expect(screen.queryByRole("button", { name: "Remove API key" })).toBeNull();
	});

	it("still reports a healthy vault's stored key as configured", async () => {
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);

		await act(async () => {
			render(<AiSettingsContent />);
		});

		// Without this, the fault branch could report every vault as damaged and the case above
		// would still pass. The status check has to keep answering for the ordinary profile.
		expect(await screen.findByText("API key configured")).toBeInTheDocument();
		expect(screen.queryByText("Key storage could not be read")).toBeNull();
		expect(screen.queryByText(/Encrypted key storage in this browser is damaged/)).toBeNull();
	});
});
