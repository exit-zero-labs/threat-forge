/** AI settings model picker and persisted legacy-selection behavior. */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ANTHROPIC_MODEL, DEFAULT_OPENAI_MODEL } from "@/lib/ai-models";
import { useChatStore } from "@/stores/chat-store";
import { useSettingsStore } from "@/stores/settings-store";
import { DEFAULT_USER_SETTINGS } from "@/types/settings";
import { AiSettingsContent } from "./ai-settings-content";

let hasKey: (provider: string) => Promise<boolean> = async () => false;
let loadAdapter: () => Promise<unknown> = async () => ({
	hasKey: (provider: string) => hasKey(provider),
	setKey: async () => undefined,
	deleteKey: async () => undefined,
});

vi.mock("@/lib/adapters/get-keychain-adapter", () => ({
	getKeychainAdapter: () => loadAdapter(),
}));

function modelSelect(): HTMLSelectElement {
	return screen.getByRole<HTMLSelectElement>("combobox", { name: "Model" });
}

function providerSelect(): HTMLSelectElement {
	return screen.getByRole<HTMLSelectElement>("combobox", { name: "Provider" });
}

beforeEach(() => {
	localStorage.clear();
	vi.restoreAllMocks();
	hasKey = async () => false;
	loadAdapter = async () => ({
		hasKey: (provider: string) => hasKey(provider),
		setKey: async () => undefined,
		deleteKey: async () => undefined,
	});
	useChatStore.setState({ provider: "anthropic" });
	useSettingsStore.setState({ settings: { ...DEFAULT_USER_SETTINGS } });
});

describe("key storage that cannot answer", () => {
	it("reports the fault and still shows the provider that answered", async () => {
		hasKey = async (provider) => {
			if (provider === "anthropic") throw new Error("Key storage in this browser is damaged.");
			return true;
		};

		await act(async () => {
			render(<AiSettingsContent />);
		});

		// A rejection for one provider used to take the other's status down with it and surface
		// nothing, so a damaged vault read as "no API key configured" — which invites the user to
		// enter a key, the one action that cannot help.
		expect(screen.getByText("Key storage in this browser is damaged.")).toBeInTheDocument();
		fireEvent.change(providerSelect(), { target: { value: "openai" } });
		expect(screen.getByText("API key configured")).toBeInTheDocument();
	});

	it("does not let a slow status check undo a save that landed first", async () => {
		let release: () => void = () => undefined;
		const stalled = new Promise<void>((resolve) => {
			release = resolve;
		});
		hasKey = async () => {
			await stalled;
			return false;
		};

		await act(async () => {
			render(<AiSettingsContent />);
		});
		fireEvent.change(screen.getByPlaceholderText("sk-ant-..."), {
			target: { value: "sk-ant-new" },
		});
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Save" }));
		});
		await act(async () => {
			release();
			await stalled;
		});

		// The check started before the save and reports the vault as it was. Applying it would
		// tell the user the key they just saved is not there, and replace the confirmation with
		// a stale reading of storage.
		expect(screen.getByText("API key configured")).toBeInTheDocument();
	});

	it("still applies the status of a provider the user did not touch", async () => {
		let release: () => void = () => undefined;
		const stalled = new Promise<void>((resolve) => {
			release = resolve;
		});
		hasKey = async (provider) => {
			await stalled;
			return provider === "openai";
		};

		await act(async () => {
			render(<AiSettingsContent />);
		});
		fireEvent.change(screen.getByPlaceholderText("sk-ant-..."), {
			target: { value: "sk-ant-new" },
		});
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Save" }));
		});
		await act(async () => {
			release();
			await stalled;
		});

		// Only the saved provider's answer is stale. Discarding the whole check would leave the
		// other provider reading "No API key configured" for a key that is really there, until
		// the panel is closed and reopened.
		fireEvent.change(providerSelect(), { target: { value: "openai" } });
		expect(screen.getByText("API key configured")).toBeInTheDocument();
	});

	it("says so when the storage adapter itself will not load", async () => {
		loadAdapter = async () => {
			throw new Error("Failed to fetch dynamically imported module: /assets/x-9f2a1c.js");
		};

		await act(async () => {
			render(<AiSettingsContent />);
		});

		expect(screen.getByText(/Key storage could not be loaded/)).toBeInTheDocument();
		// A bundle path and content hash are not an explanation, and this is a surface that
		// otherwise only ever shows messages the app authored.
		expect(screen.queryByText(/dynamically imported module/)).not.toBeInTheDocument();
	});

	it("does not put a bundler failure in front of the user when saving", async () => {
		loadAdapter = async () => {
			throw new Error("Failed to fetch dynamically imported module: /assets/x-9f2a1c.js");
		};

		await act(async () => {
			render(<AiSettingsContent />);
		});
		fireEvent.change(screen.getByPlaceholderText("sk-ant-..."), {
			target: { value: "sk-ant-new" },
		});
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Save" }));
		});

		expect(screen.getByText(/Key storage could not be loaded/)).toBeInTheDocument();
		expect(screen.queryByText(/dynamically imported module/)).not.toBeInTheDocument();
	});
});

/**
 * #133 requires the browser's storage limit to be stated in the UI without overstating the
 * protection. This pins that sentence so it cannot silently regress or drift into a claim
 * the implementation does not make. `isTauri()` is false under jsdom, so this is the
 * browser copy.
 */
describe("the browser security notice", () => {
	it("states that the key is encrypted and that page script can still use it", async () => {
		await act(async () => {
			render(<AiSettingsContent />);
		});

		const notice = screen.getByText(/encrypted before being stored in this browser/i);
		expect(notice).toHaveTextContent("a key the browser will not export");
		expect(notice).toHaveTextContent("Anything running on this page can still use the key");
	});
});

describe("a current catalog model", () => {
	it("renders selected, with its description, and no legacy warning", async () => {
		await act(async () => {
			render(<AiSettingsContent />);
		});

		expect(modelSelect().value).toBe(DEFAULT_ANTHROPIC_MODEL);
		expect(screen.getByText("Balanced speed and capability")).toBeInTheDocument();
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});
});

describe("a persisted legacy model id", () => {
	beforeEach(() => {
		useSettingsStore.setState((state) => ({
			settings: { ...state.settings, aiModelAnthropic: "claude-sonnet-4-20250514" },
		}));
	});

	it("shows the legacy id as the selected, visibly labeled option without rewriting settings", async () => {
		await act(async () => {
			render(<AiSettingsContent />);
		});

		expect(modelSelect().value).toBe("claude-sonnet-4-20250514");
		expect(screen.getByText(/claude-sonnet-4-20250514.*legacy/i)).toBeInTheDocument();
		expect(screen.getByRole("alert")).toHaveTextContent(
			/"claude-sonnet-4-20250514" is no longer offered/,
		);
		expect(useSettingsStore.getState().settings.aiModelAnthropic).toBe("claude-sonnet-4-20250514");
	});

	it("switches to the recommended default only when the user clicks the deliberate control", async () => {
		await act(async () => {
			render(<AiSettingsContent />);
		});

		fireEvent.click(screen.getByRole("button", { name: /switch to .*recommended default/i }));

		expect(useSettingsStore.getState().settings.aiModelAnthropic).toBe(DEFAULT_ANTHROPIC_MODEL);
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("switches deliberately by picking any current model from the dropdown", async () => {
		await act(async () => {
			render(<AiSettingsContent />);
		});

		fireEvent.change(modelSelect(), { target: { value: "claude-haiku-4-5-20251001" } });

		expect(useSettingsStore.getState().settings.aiModelAnthropic).toBe("claude-haiku-4-5-20251001");
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});
});

describe("provider switching", () => {
	it("shows the OpenAI catalog and default after switching providers", async () => {
		await act(async () => {
			render(<AiSettingsContent />);
		});

		fireEvent.change(providerSelect(), { target: { value: "openai" } });

		expect(useChatStore.getState().provider).toBe("openai");
		expect(modelSelect().value).toBe(DEFAULT_OPENAI_MODEL);
	});
});
