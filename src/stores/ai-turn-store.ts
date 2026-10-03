/** Native turns belong to the selected document and chat. Protocol history lives
 * in chat-store; terminal runners retain review status and Undo during this app
 * session. Durable tool history remains #63's scope. */

import { create } from "zustand";
import { getChatTransport } from "@/lib/adapters/get-chat-transport";
import { DEFAULT_TURN_LIMITS } from "@/lib/ai/loop/limits";
import { createToolRegistry } from "@/lib/ai/loop/tool-runtime";
import type { UndoAvailability } from "@/lib/ai/loop/transaction";
import type { TurnState } from "@/lib/ai/loop/turn-machine";
import { createTurnRunner, type TurnRunner } from "@/lib/ai/loop/turn-runner";
import { streamConversation } from "@/lib/ai/protocol/client";
import type { ProtocolMessage } from "@/lib/ai/protocol/messages";
import { createAiToolRegistry } from "@/lib/ai/tools/tool-registry";
import { getDefaultModelId, resolveCapabilities } from "@/lib/ai-models";
import { buildSystemPrompt } from "@/lib/ai-prompt";
import { useChatStore } from "@/stores/chat-store";
import { useModelStore } from "@/stores/model-store";
import { useSettingsStore } from "@/stores/settings-store";
import type { ThreatModel } from "@/types/threat-model";
import { registerActiveTurnCanceller, registerDocumentTurnDisposer } from "./ai-turn-bridge";

/** The live turn plus its in-memory conversation history. */
interface AiTurnState {
	/** The current turn, or `null` before the first one. */
	turn: TurnState | null;
	turnStartIndex: number;
	submitTurn: (text: string, model: ThreatModel) => Promise<void>;
	approveCall: (id: string) => void;
	approveBatch: (ids: readonly string[]) => void;
	denyCall: (id: string) => void;
	/** Cancel the live turn. Idempotent when idle or already settled. */
	cancelActiveTurn: () => void;
	undoTurn: () => void;
	/**
	 * Whether the settled turn's single undo entry is still undoable, already
	 * undone, or superseded by a later edit. Read at render time; the panel
	 * subscribes to history depth to re-evaluate it as the user edits.
	 */
	undoAvailability: () => UndoAvailability;
	/** Explicitly clear runtime runners and standalone history; session selection preserves them. */
	resetTurn: () => void;
}

/** The single active runner, module-scoped so the bridge canceller can reach it. */
let activeRunner: TurnRunner | null = null;

/** Context for standalone callers that have not bound a chat session. */
let conversationHistory: ProtocolMessage[] = [];

interface SessionRunner {
	documentId: string | null;
	sessionId: string;
	runner: TurnRunner;
	startIndex: number;
}

const sessionRunners = new Map<string, SessionRunner>();

function ownsActiveSession(entry: SessionRunner): boolean {
	const chat = useChatStore.getState();
	return chat.documentId === entry.documentId && chat.activeSessionId === entry.sessionId;
}

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
	turnStartIndex: 0,

	submitTurn: async (text, model) => {
		// One turn at a time: refuse a submit while a turn is still live.
		if (isLive(activeRunner?.getState().phase)) return;

		const provider = useChatStore.getState().provider;
		const { documentId, activeSessionId, messages } = useChatStore.getState();
		const baseMessages = activeSessionId ? messages : conversationHistory;
		const settings = useSettingsStore.getState().settings;
		const configuredModel =
			provider === "anthropic" ? settings.aiModelAnthropic : settings.aiModelOpenai;
		const modelId = configuredModel || getDefaultModelId(provider);

		// Tool-set selection happens before preflight: an unknown or tool-incapable
		// model runs a text-only turn with an empty tool set, keeping the fenced path.
		const resolution = resolveCapabilities(provider, modelId);
		const toolCapable = resolution.known && resolution.capabilities.toolCalling;
		const toolSet = toolCapable ? createAiToolRegistry() : createToolRegistry([]);
		const system = buildSystemPrompt(model, { tools: toolSet.list() });

		const runner = createTurnRunner({
			stream: async (request, onEvent, signal) => {
				const transport = await getChatTransport();
				await streamConversation(request, transport, { onEvent }, signal);
			},
			getDocument: () => useModelStore.getState().model,
			onState: (turn) => {
				if (activeRunner !== runner) return;
				if (
					activeSessionId &&
					(useChatStore.getState().documentId !== documentId ||
						useChatStore.getState().activeSessionId !== activeSessionId)
				)
					return;
				set({ turn, turnStartIndex: baseMessages.length });
				if (activeSessionId)
					useChatStore
						.getState()
						.recordTurn(activeSessionId, turn.messages, turn.phase === "settled");
				// When the turn settles, fold its messages into the running history so
				// the next turn continues the conversation.
				if (turn.phase === "settled") conversationHistory = [...turn.messages];
			},
		});
		activeRunner = runner;
		if (activeSessionId)
			sessionRunners.set(activeSessionId, {
				documentId,
				sessionId: activeSessionId,
				runner,
				startIndex: baseMessages.length,
			});

		await runner.submit({
			text,
			baseMessages,
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

	undoAvailability: () => activeRunner?.undoAvailability() ?? "already_undone",

	resetTurn: () => {
		if (isLive(activeRunner?.getState().phase)) activeRunner?.cancel();
		activeRunner = null;
		conversationHistory = [];
		sessionRunners.clear();
		set({ turn: null, turnStartIndex: 0 });
	},
}));

// Chat selection is shared by the panel and document activation. Bind here so
// changing panels cannot erase history and a hidden panel still cancels correctly.
useChatStore.subscribe((chat, previous) => {
	for (const [id, entry] of sessionRunners) {
		if (entry.documentId === chat.documentId && !chat.sessions.some((s) => s.id === id))
			sessionRunners.delete(id);
	}
	if (chat.documentId === previous.documentId && chat.activeSessionId === previous.activeSessionId)
		return;
	if (isLive(activeRunner?.getState().phase)) activeRunner?.cancel();
	const entry = chat.activeSessionId ? sessionRunners.get(chat.activeSessionId) : undefined;
	activeRunner = entry && ownsActiveSession(entry) ? entry.runner : null;
	conversationHistory = [];
	useAiTurnStore.setState({
		turn: activeRunner?.getState() ?? null,
		turnStartIndex: entry?.startIndex ?? 0,
	});
});

registerDocumentTurnDisposer((documentId) => {
	for (const [id, entry] of sessionRunners) {
		if (entry.documentId === documentId) sessionRunners.delete(id);
	}
});
