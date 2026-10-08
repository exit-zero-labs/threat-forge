import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ANTHROPIC_MODEL } from "@/lib/ai-models";
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

function openMenu() {
	fireEvent.click(screen.getByRole("button", { name: "Model" }));
	return screen.getByRole("menu", { name: "Model" });
}

async function choose(provider: "OpenAI" | "Anthropic", label: string) {
	const menu = openMenu();
	await act(async () => {
		fireEvent.click(
			within(within(menu).getByRole("group", { name: provider })).getByRole("menuitemradio", {
				name: label,
			}),
		);
	});
}

describe("chat model selection", () => {
	it("keeps descriptions in an opened menu and opens without changing selection", () => {
		render(<ChatModelSelector disabled={false} />);
		expect(screen.queryByText("Balanced speed and capability")).not.toBeInTheDocument();
		const trigger = screen.getByRole("button", { name: "Model" });
		expect(trigger).toHaveTextContent("Claude Sonnet 5");
		const menu = openMenu();
		expect(trigger).toHaveAttribute("aria-expanded", "true");
		expect(
			screen.getByRole("menuitemradio", { name: "Claude Sonnet 5" }),
		).toHaveAccessibleDescription("Balanced speed and capability");
		expect(screen.getByRole("menuitemradio", { name: "Claude Sonnet 5" })).toHaveFocus();
		expect(useChatStore.getState().provider).toBe("anthropic");
		fireEvent.keyDown(menu, { key: "Escape" });
		expect(screen.queryByRole("menu")).not.toBeInTheDocument();
		expect(trigger).toHaveFocus();
	});

	it("keeps a legacy ID colliding with another provider's model in its own group", async () => {
		useSettingsStore.getState().updateSetting("aiModelAnthropic", "gpt-5.6-luna");
		render(<ChatModelSelector disabled={false} />);
		const menu = openMenu();
		expect(
			within(within(menu).getByRole("group", { name: "Anthropic" })).getByRole("menuitemradio", {
				name: "gpt-5.6-luna",
			}),
		).toHaveAttribute("aria-checked", "true");
		await act(async () => {
			fireEvent.click(
				within(within(menu).getByRole("group", { name: "OpenAI" })).getByRole("menuitemradio", {
					name: "GPT-5.6 Luna",
				}),
			);
		});
		expect(useChatStore.getState().provider).toBe("openai");
		expect(useSettingsStore.getState().settings.aiModelAnthropic).toBe("gpt-5.6-luna");
		expect(
			within(within(openMenu()).getByRole("group", { name: "OpenAI" })).getByRole("menuitemradio", {
				name: "GPT-5.6 Luna",
			}),
		).toHaveAttribute("aria-checked", "true");
	});

	it("can return to the other provider's saved legacy model without replacing it", async () => {
		useSettingsStore.getState().updateSetting("aiModelOpenai", "retired-openai-model");
		render(<ChatModelSelector disabled={false} />);
		await choose("OpenAI", "retired-openai-model");
		expect(useChatStore.getState().provider).toBe("openai");
		expect(screen.getByRole("button", { name: "Model" })).toHaveTextContent("retired-openai-model");
		await choose("Anthropic", "Claude Sonnet 5");
		await choose("OpenAI", "retired-openai-model");
		expect(useSettingsStore.getState().settings.aiModelOpenai).toBe("retired-openai-model");
	});

	it("groups models under OpenAI and Anthropic and switches both provider and model", async () => {
		render(<ChatModelSelector disabled={false} />);
		const menu = openMenu();
		expect(
			within(menu)
				.getAllByRole("group")
				.map((group) => group.getAttribute("aria-label")),
		).toEqual(["OpenAI", "Anthropic"]);
		await act(async () => {
			fireEvent.click(within(menu).getByRole("menuitemradio", { name: "GPT-5.6 Luna" }));
		});
		expect(useChatStore.getState().provider).toBe("openai");
		expect(useSettingsStore.getState().settings.aiModelOpenai).toBe("gpt-5.6-luna");
		expect(useSettingsStore.getState().settings.aiModelAnthropic).toBe(DEFAULT_ANTHROPIC_MODEL);
		expect(screen.queryByRole("menu")).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Model" })).toHaveFocus();
	});

	it("preserves a saved legacy selection visibly until deliberate replacement", async () => {
		useSettingsStore.getState().updateSetting("aiModelAnthropic", "claude-sonnet-4-20250514");
		render(<ChatModelSelector disabled={false} />);
		expect(screen.getByRole("button", { name: "Model" })).toHaveTextContent(
			"claude-sonnet-4-20250514",
		);
		expect(screen.getByRole("alert")).toHaveTextContent("Tool use stays disabled");
		expect(useSettingsStore.getState().settings.aiModelAnthropic).toBe("claude-sonnet-4-20250514");
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: /recommended default/ }));
		});
		expect(useSettingsStore.getState().settings.aiModelAnthropic).toBe(DEFAULT_ANTHROPIC_MODEL);
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("disables model changes and legacy replacement during an active turn, closing an open menu", () => {
		useSettingsStore.getState().updateSetting("aiModelAnthropic", "retired-model");
		const view = render(<ChatModelSelector disabled={false} />);
		openMenu();
		view.rerender(<ChatModelSelector disabled />);
		expect(screen.queryByRole("menu")).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Model" })).toBeDisabled();
		expect(screen.getByRole("button", { name: /recommended default/ })).toBeDisabled();
		fireEvent.click(screen.getByRole("button", { name: "Model" }));
		expect(useChatStore.getState().provider).toBe("anthropic");
		expect(useSettingsStore.getState().settings.aiModelAnthropic).toBe("retired-model");
	});

	it("uses the default for an empty saved selection without rewriting it", () => {
		useSettingsStore.getState().updateSetting("aiModelAnthropic", "");
		render(<ChatModelSelector disabled={false} />);
		expect(screen.getByRole("button", { name: "Model" })).toHaveTextContent("Claude Sonnet 5");
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
		expect(useSettingsStore.getState().settings.aiModelAnthropic).toBe("");
	});

	it("moves keyboard focus without committing a choice and supports typeahead", () => {
		render(<ChatModelSelector disabled={false} />);
		const trigger = screen.getByRole("button", { name: "Model" });
		fireEvent.keyDown(trigger, { key: "ArrowDown" });
		const menu = screen.getByRole("menu");
		fireEvent.keyDown(menu, { key: "Home" });
		expect(screen.getByRole("menuitemradio", { name: "GPT-5.6 Sol" })).toHaveFocus();
		fireEvent.keyDown(menu, { key: "ArrowUp" });
		expect(screen.getByRole("menuitemradio", { name: "Claude Haiku 4.5" })).toHaveFocus();
		fireEvent.keyDown(menu, { key: "g" });
		expect(screen.getByRole("menuitemradio", { name: "GPT-5.6 Sol" })).toHaveFocus();
		fireEvent.keyDown(menu, { key: "g" });
		expect(screen.getByRole("menuitemradio", { name: "GPT-5.6 Terra" })).toHaveFocus();
		fireEvent.keyDown(menu, { key: "End" });
		expect(screen.getByRole("menuitemradio", { name: "Claude Haiku 4.5" })).toHaveFocus();
		expect(useChatStore.getState().provider).toBe("anthropic");
		expect(useSettingsStore.getState().settings.aiModelAnthropic).toBe(DEFAULT_ANTHROPIC_MODEL);
	});

	it("dismisses on Tab and outside pointer input without redirecting outside focus", () => {
		render(
			<>
				<ChatModelSelector disabled={false} />
				<button type="button">Outside</button>
			</>,
		);
		const menu = openMenu();
		fireEvent.keyDown(menu, { key: "Tab" });
		expect(screen.queryByRole("menu")).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Model" })).toHaveFocus();
		openMenu();
		const outside = screen.getByRole("button", { name: "Outside" });
		fireEvent.pointerDown(outside);
		expect(screen.queryByRole("menu")).not.toBeInTheDocument();
		outside.focus();
		expect(outside).toHaveFocus();
	});

	it("dismisses when keyboard focus leaves the picker", () => {
		render(
			<>
				<ChatModelSelector disabled={false} />
				<input aria-label="Message" />
			</>,
		);
		openMenu();
		const input = screen.getByRole("textbox", { name: "Message" });
		act(() => input.focus());
		expect(screen.queryByRole("menu")).not.toBeInTheDocument();
		expect(input).toHaveFocus();
	});
});
