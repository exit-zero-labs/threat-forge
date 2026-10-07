import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ANTHROPIC_MODEL, DEFAULT_OPENAI_MODEL } from "@/lib/ai-models";
import { useChatStore } from "@/stores/chat-store";
import { useSettingsStore } from "@/stores/settings-store";
import { DEFAULT_USER_SETTINGS } from "@/types/settings";
import { ChatModelSelector } from "./chat-model-selector";

vi.mock("@/lib/adapters/get-keychain-adapter", () => ({
	getKeychainAdapter: async () => ({ hasKey: async () => false }),
}));

beforeEach(() => {
	localStorage.clear();
	useChatStore.setState({ provider: "anthropic", hasApiKey: false, keyFault: null });
	useSettingsStore.setState({ settings: { ...DEFAULT_USER_SETTINGS } });
});

describe("chat model selection", () => {
	it("keeps a legacy ID colliding with another provider's model in its own group", async () => {
		useSettingsStore.getState().updateSetting("aiModelAnthropic", "gpt-5.6-luna");
		render(<ChatModelSelector disabled={false} />);
		const picker = screen.getByRole<HTMLSelectElement>("combobox", { name: "Model" });
		expect(picker).toHaveValue("anthropic:gpt-5.6-luna");
		expect(picker.selectedOptions[0].parentElement).toBe(
			within(picker).getByRole("group", { name: "Anthropic" }),
		);
		expect(useChatStore.getState().provider).toBe("anthropic");
		await act(async () => {
			fireEvent.change(picker, { target: { value: "openai:gpt-5.6-luna" } });
		});
		expect(useChatStore.getState().provider).toBe("openai");
		expect(picker.selectedOptions[0].parentElement).toBe(
			within(picker).getByRole("group", { name: "OpenAI" }),
		);
		expect(useSettingsStore.getState().settings.aiModelAnthropic).toBe("gpt-5.6-luna");
	});

	it("can return to the other provider's saved legacy model without replacing it", async () => {
		useSettingsStore.getState().updateSetting("aiModelOpenai", "retired-openai-model");
		render(<ChatModelSelector disabled={false} />);
		const picker = screen.getByRole("combobox", { name: "Model" });
		await act(async () => {
			fireEvent.change(picker, { target: { value: "openai:retired-openai-model" } });
		});
		expect(useChatStore.getState().provider).toBe("openai");
		expect(screen.getByRole("alert")).toHaveTextContent("retired-openai-model");
		await act(async () => {
			fireEvent.change(picker, { target: { value: `anthropic:${DEFAULT_ANTHROPIC_MODEL}` } });
		});
		await act(async () => {
			fireEvent.change(picker, { target: { value: "openai:retired-openai-model" } });
		});
		expect(picker).toHaveValue("openai:retired-openai-model");
		expect(useSettingsStore.getState().settings.aiModelOpenai).toBe("retired-openai-model");
	});

	it("groups models under OpenAI and Anthropic and switches both provider and model", async () => {
		render(<ChatModelSelector disabled={false} />);
		const picker = screen.getByRole("combobox", { name: "Model" });
		expect(picker).toHaveValue(`anthropic:${DEFAULT_ANTHROPIC_MODEL}`);
		expect(screen.getByText("Balanced speed and capability")).toBeInTheDocument();
		expect(
			within(picker)
				.getAllByRole("group")
				.map((group) => group.getAttribute("label")),
		).toEqual(["OpenAI", "Anthropic"]);
		await act(async () => {
			fireEvent.change(picker, { target: { value: "openai:gpt-5.6-luna" } });
		});
		expect(useChatStore.getState().provider).toBe("openai");
		expect(useSettingsStore.getState().settings.aiModelOpenai).toBe("gpt-5.6-luna");
		expect(useSettingsStore.getState().settings.aiModelAnthropic).toBe(DEFAULT_ANTHROPIC_MODEL);
	});

	it("preserves a saved legacy selection visibly until deliberate replacement", async () => {
		useSettingsStore.getState().updateSetting("aiModelAnthropic", "claude-sonnet-4-20250514");
		render(<ChatModelSelector disabled={false} />);
		expect(screen.getByRole("combobox", { name: "Model" })).toHaveValue(
			"anthropic:claude-sonnet-4-20250514",
		);
		expect(screen.getByRole("alert")).toHaveTextContent("Tool use stays disabled");
		expect(useSettingsStore.getState().settings.aiModelAnthropic).toBe("claude-sonnet-4-20250514");
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: /recommended default/ }));
		});
		expect(useSettingsStore.getState().settings.aiModelAnthropic).toBe(DEFAULT_ANTHROPIC_MODEL);
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("disables model changes and legacy replacement during an active turn", () => {
		useSettingsStore.getState().updateSetting("aiModelAnthropic", "retired-model");
		render(<ChatModelSelector disabled />);
		const picker = screen.getByRole("combobox", { name: "Model" });
		expect(picker).toBeDisabled();
		expect(screen.getByRole("button", { name: /recommended default/ })).toBeDisabled();
		fireEvent.change(picker, { target: { value: `openai:${DEFAULT_OPENAI_MODEL}` } });
		expect(useChatStore.getState().provider).toBe("anthropic");
		expect(useSettingsStore.getState().settings.aiModelAnthropic).toBe("retired-model");
	});

	it("uses the default for an empty saved selection without rewriting it", () => {
		useSettingsStore.getState().updateSetting("aiModelAnthropic", "");
		render(<ChatModelSelector disabled={false} />);
		expect(screen.getByRole("combobox", { name: "Model" })).toHaveValue(
			`anthropic:${DEFAULT_ANTHROPIC_MODEL}`,
		);
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
		expect(useSettingsStore.getState().settings.aiModelAnthropic).toBe("");
	});
});
