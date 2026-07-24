/** AI settings model picker and persisted legacy-selection behavior. */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ANTHROPIC_MODEL, DEFAULT_OPENAI_MODEL } from "@/lib/ai-models";
import { useChatStore } from "@/stores/chat-store";
import { useSettingsStore } from "@/stores/settings-store";
import { DEFAULT_USER_SETTINGS } from "@/types/settings";
import { AiSettingsContent } from "./ai-settings-content";

vi.mock("@/lib/adapters/get-keychain-adapter", () => ({
	getKeychainAdapter: () =>
		Promise.resolve({
			hasKey: async () => false,
			setKey: async () => undefined,
			deleteKey: async () => undefined,
		}),
}));

function modelSelect(): HTMLSelectElement {
	return screen.getByRole<HTMLSelectElement>("combobox", { name: "Model" });
}

function providerSelect(): HTMLSelectElement {
	return screen.getByRole<HTMLSelectElement>("combobox", { name: "Provider" });
}

beforeEach(() => {
	localStorage.clear();
	useChatStore.setState({ provider: "anthropic" });
	useSettingsStore.setState({ settings: { ...DEFAULT_USER_SETTINGS } });
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
