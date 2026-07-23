/**
 * The single live tool-loop turn.
 *
 * This store owns the one turn that can be in flight at a time, driving the
 * bounded loop through a {@link TurnRunner}. It reads the provider and model from
 * the chat store and settings, decides the tool set by capability (a
 * tool-incapable or unknown model runs a text-only turn on the fenced path, which
 * is today's behavior rather than a refusal), builds the system prompt, and
 * exposes the review commands the panel binds to.
 *
 * Conversation history accumulates in memory across turns so a multi-turn loop
 * has context; durable persistence is issue #63's job. `stopGenerating` settles
 * the live turn through the bridge, so `document-registry` needs no change.
 */

import { create } from "zustand";
import { getChatTransport } from "@/lib/adapters/get-chat-transport";
import { DEFAULT_TURN_LIMITS } from "@/lib/ai/loop/limits";
import { createToolRegistry } from "@/lib/ai/loop/tool-runtime";
import type { TurnState } from "@/lib/ai/loop/turn-machine";
import { createTurnRunner, type TurnRunner } from "@/lib/ai/loop/turn-runner";
import { streamConversation } from "@/lib/ai/protocol/client";
import type { ProtocolMessage } from "@/lib/ai/protocol/messages";
import { createGraphToolRegistry } from "@/lib/ai/tools/graph-action-tools";
import { getDefaultModelId, resolveCapabilities } from "@/lib/ai-models";
import { buildSystemPrompt } from "@/lib/ai-prompt";
import { useChatStore } from "@/stores/chat-store";
import { useModelStore } from "@/stores/model-store";
import { useSettingsStore } from "@/stores/settings-store";
import type { ThreatModel } from "@/types/threat-model";
import { registerActiveTurnCanceller } from "./ai-turn-bridge";

/** The live turn plus its in-memory conversation history. */
interface AiTurnState {
	/** The current turn, or `null` before the first one. */
	turn: TurnState | null;
	submitTurn: (text: string, model: ThreatModel) => Promise<void>;
	approveCall: (id: string) => void;
	approveBatch: (ids: readonly string[]) => void;
	denyCall: (id: string) => void;
	/** Cancel the live turn. Idempotent when idle or already settled. */
	cancelActiveTurn: () => void;
	undoTurn: () => void;
	/** Clear the live turn and its in-memory history, e.g. when starting a new chat. */
	resetTurn: () => void;
}

/** The single active runner, module-scoped so the bridge canceller can reach it. */
let activeRunner: TurnRunner | null = null;

/** Conversation carried across turns, so a follow-up turn has prior context. */
let conversationHistory: ProtocolMessage[] = [];

/** A phase that still accepts a cancel. */
function isLive(phase: TurnState["phase"] | undefined): boolean {
	return (
		phase === "requesting" ||
		phase === "streaming" ||
		phase === "awaiting_approval" ||
		phase === "executing"
	);
}

// Route `chat-store.stopGenerating` to the live runner without a static cycle.
registerActiveTurnCanceller(() => {
	if (isLive(activeRunner?.getState().phase)) activeRunner?.cancel();
});

export const useAiTurnStore = create<AiTurnState>((set) => ({
	turn: null,

	submitTurn: async (text, model) => {
		// One turn at a time: refuse a submit while a turn is still live.
		if (isLive(activeRunner?.getState().phase)) return;

		const provider = useChatStore.getState().provider;
		const settings = useSettingsStore.getState().settings;
		const configuredModel =
			provider === "anthropic" ? settings.aiModelAnthropic : settings.aiModelOpenai;
		const modelId = configuredModel || getDefaultModelId(provider);

		// Tool-set selection happens before preflight: an unknown or tool-incapable
		// model runs a text-only turn with an empty tool set, keeping the fenced path.
		const resolution = resolveCapabilities(provider, modelId);
		const toolCapable = resolution.known && resolution.capabilities.toolCalling;
		const toolSet = toolCapable ? createGraphToolRegistry() : createToolRegistry([]);
		const system = buildSystemPrompt(model, { tools: toolSet.list() });

		const runner = createTurnRunner({
			stream: async (request, onEvent, signal) => {
				const transport = await getChatTransport();
				await streamConversation(request, transport, { onEvent }, signal);
			},
			getDocument: () => useModelStore.getState().model,
			onState: (turn) => {
				set({ turn });
				// When the turn settles, fold its messages into the running history so
				// the next turn continues the conversation.
				if (turn.phase === "settled") conversationHistory = [...turn.messages];
			},
		});
		activeRunner = runner;

		await runner.submit({
			text,
			baseMessages: conversationHistory,
			provider,
			modelId,
			system,
			toolSet,
			limits: DEFAULT_TURN_LIMITS,
			maxOutputTokens: DEFAULT_TURN_LIMITS.reserveOutputTokens,
		});
	},

	approveCall: (id) => {
		void activeRunner?.approveCall(id);
	},
	approveBatch: (ids) => {
		void activeRunner?.approveBatch(ids);
	},
	denyCall: (id) => {
		void activeRunner?.denyCall(id);
	},

	cancelActiveTurn: () => {
		if (isLive(activeRunner?.getState().phase)) activeRunner?.cancel();
	},

	undoTurn: () => {
		activeRunner?.undo();
	},

	resetTurn: () => {
		if (isLive(activeRunner?.getState().phase)) activeRunner?.cancel();
		activeRunner = null;
		conversationHistory = [];
		set({ turn: null });
	},
}));
