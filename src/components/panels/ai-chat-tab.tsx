import {
	AlertCircle,
	AlertTriangle,
	ArrowUp,
	Bot,
	Check,
	Info,
	Loader2,
	Play,
	Settings,
	Sparkles,
	Square,
	Undo2,
	X,
} from "lucide-react";
import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { KEY_STORAGE_UNREADABLE } from "@/lib/adapters/keychain-adapter";
import {
	extractLegacyActions,
	extractLegacyThreats,
	legacyFencedEnabledForTurn,
} from "@/lib/ai/legacy/fenced-actions";
import type { TurnState } from "@/lib/ai/loop/turn-machine";
import { flattenText, type ProtocolMessage } from "@/lib/ai/protocol/messages";
import { executeActions, executeSingleAction } from "@/lib/ai-action-executor";
import { type AiAction, describeAction } from "@/lib/ai-actions";
import { suggestionToThreat } from "@/lib/ai-utils";
import { cn } from "@/lib/utils";
import { useAiTurnStore } from "@/stores/ai-turn-store";
import { useCanvasStore } from "@/stores/canvas-store";
import { type ChatMessage, useChatStore } from "@/stores/chat-store";
import { useDocumentRegistry } from "@/stores/document-registry";
import { useHistoryStore } from "@/stores/history-store";
import { useModelStore } from "@/stores/model-store";
import { useSettingsStore } from "@/stores/settings-store";
import type { Threat } from "@/types/threat-model";
import { ChatModelSelector } from "./chat-model-selector";
import { ChatSessionPicker } from "./chat-session-picker";
import { ChatViewport } from "./chat-viewport";
import { MarkdownContent } from "./markdown-content";
import { ToolCallBatch, ToolCallCard } from "./tool-call-card";

/** Turn phases in which a request or execution is in flight and can be stopped. */
function isTurnLive(phase: TurnState["phase"] | undefined): boolean {
	return (
		phase === "requesting" ||
		phase === "streaming" ||
		phase === "awaiting_approval" ||
		phase === "executing"
	);
}

export function AiChatTab() {
	const model = useModelStore((s) => s.model);
	const filePath = useModelStore((s) => s.filePath);
	const activeDocumentId = useDocumentRegistry((s) => s.activeDocumentId);
	const hasApiKey = useChatStore((s) => s.hasApiKey);
	const keyFault = useChatStore((s) => s.keyFault);
	const checkApiKey = useChatStore((s) => s.checkApiKey);
	const loadSessionsForFile = useChatStore((s) => s.loadSessionsForFile);
	const openSettingsDialogAtTab = useSettingsStore((s) => s.openSettingsDialogAtTab);

	// Check API key on mount
	useEffect(() => {
		void checkApiKey();
	}, [checkApiKey]);

	// The registry owns document binding and Save As. Standalone callers without
	// a registered document retain the text-only chat path.
	useEffect(() => {
		if (!activeDocumentId && !useChatStore.getState().sessionKey) loadSessionsForFile(filePath);
	}, [activeDocumentId, filePath, loadSessionsForFile]);

	if (!model) {
		return (
			<p className="text-xs text-muted-foreground">Open a threat model to use AI assistance.</p>
		);
	}

	const openAiSettings = () => openSettingsDialogAtTab("ai");

	return (
		<div className="flex h-full min-h-0 min-w-0 flex-col">
			{/* Header with settings */}
			<div className="mb-3 flex shrink-0 items-center justify-between">
				<div className="flex items-center gap-1.5">
					<Sparkles className="h-3.5 w-3.5 text-primary" />
					<span className="text-sm font-semibold">AI Assistant</span>
				</div>
				<button
					type="button"
					onClick={openAiSettings}
					className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
					title="AI Settings"
				>
					<Settings className="h-3.5 w-3.5" />
				</button>
			</div>
			{/* The fault outranks the absence: it is the stronger and truer claim about the same
			    storage, mirroring the documented precedence in the settings panel's
			    `statusToneOf`. Reporting "no API key configured" over a vault nobody could read
			    points the user at entering a key, which is the one thing that will not help. */}
			{keyFault ? (
				<KeyStorageFault message={keyFault} onConfigure={openAiSettings} />
			) : !hasApiKey ? (
				<EmptyState onConfigure={openAiSettings} />
			) : (
				<ChatView />
			)}
			<ChatInput canSend={hasApiKey && !keyFault} />
		</div>
	);
}

/**
 * What the chat surface shows when key storage could not be read at all (#234).
 *
 * The heading is {@link KEY_STORAGE_UNREADABLE}, the same constant the settings panel's status
 * row renders, so a user who checks both surfaces reads one sentence rather than two accounts
 * of one fault. Shared as a constant rather than as matching literals: this issue exists
 * because two surfaces disagreed about one stored key, and a copy edit that reached only one
 * of them would be the same defect in a quieter form.
 *
 * The remedy is the keychain's own authored message, rendered verbatim — no copy is invented
 * here. What keeps an internal string out of it is upstream, not this component: every browser
 * fault is remapped to an authored `KeyVaultError` by `withVault`, and the desktop adapter
 * relays a sentence authored in Rust.
 *
 * The button promises exactly what it does. It opens settings; it does not promise a fix,
 * because for an `unavailable` fault — an insecure origin with no Web Crypto — entering a key
 * there changes nothing. Amber rather than destructive red for the reason the panel records:
 * red belongs to a credential exposed in clear text, and this is a loss of function.
 *
 * `role="alert"` is assertive deliberately. This replaces the whole conversation surface after
 * a check the user did not initiate — on a provider switch, or a re-check that newly fails
 * while the transcript is on screen, a screen-reader user told about it late has already been
 * typing into a panel that was never going to send. (On first mount there is no input yet, so
 * that path is the one that earns the interruption.)
 */
function KeyStorageFault({ message, onConfigure }: { message: string; onConfigure: () => void }) {
	return (
		<div
			role="alert"
			data-testid="key-storage-fault"
			className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center"
		>
			<AlertTriangle className="h-10 w-10 text-amber-600 dark:text-amber-400" />
			<div>
				<p className="text-xs font-medium text-amber-600 dark:text-amber-400">
					{KEY_STORAGE_UNREADABLE}
				</p>
				<p className="mt-1 text-[10px] text-muted-foreground/70">{message}</p>
			</div>
			<button
				type="button"
				onClick={onConfigure}
				className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
			>
				Open AI settings
			</button>
		</div>
	);
}

function EmptyState({ onConfigure }: { onConfigure: () => void }) {
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
			<Bot className="h-10 w-10 text-muted-foreground/30" />
			<div>
				<p className="text-xs font-medium text-muted-foreground">No API key configured</p>
				<p className="mt-1 text-[10px] text-muted-foreground/70">
					Add your Anthropic or OpenAI API key to get AI-powered threat analysis.
				</p>
			</div>
			<button
				type="button"
				onClick={onConfigure}
				className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
			>
				Configure API Key
			</button>
		</div>
	);
}

function ChatView() {
	const messages = useChatStore((s) => s.messages);
	const isStreaming = useChatStore((s) => s.isStreaming);
	const error = useChatStore((s) => s.error);
	const clearError = useChatStore((s) => s.clearError);
	// The live tool-loop turn (issue #62) owns the conversation once one starts;
	// before that, the pre-loop transcript renders as it always has.
	const turn = useAiTurnStore((s) => s.turn);
	const activeSessionId = useChatStore((s) => s.activeSessionId);

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
			{/* Session bar */}
			<ChatSessionPicker />

			{/* Messages area */}
			{turn ? (
				<TurnConversation key={activeSessionId} turn={turn} />
			) : (
				<MessageList
					key={activeSessionId}
					messages={messages}
					isStreaming={isStreaming}
					fencedEnabled={false}
				/>
			)}

			{/* Error display */}
			{error && (
				<div className="flex items-start gap-1.5 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-foreground">
					<AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
					<div className="flex-1">{error}</div>
					<button type="button" onClick={clearError} className="shrink-0 text-[10px] underline">
						Dismiss
					</button>
				</div>
			)}
		</div>
	);
}

function MessageList({
	messages,
	isStreaming,
	fencedEnabled,
}: {
	messages: ChatMessage[];
	isStreaming: boolean;
	fencedEnabled: boolean;
}) {
	const visibleMessages = messages.filter(hasVisibleText);
	if (messages.length === 0) {
		return (
			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
				<div className="my-auto flex shrink-0 flex-col items-center gap-2 py-8 text-center">
					<div className="mb-2 rounded-2xl border border-border bg-secondary/40 p-3">
						<Sparkles className="size-6 text-muted-foreground" />
					</div>
					<p className="text-sm font-medium">Explore your threat model</p>
					<p className="max-w-64 px-2 text-xs leading-relaxed text-muted-foreground">
						Ask about your architecture, find threats, or work through a mitigation.
					</p>
				</div>
			</div>
		);
	}

	return (
		<ChatViewport activity={messages}>
			{visibleMessages.map((msg, i) => (
				<MessageBubble
					// biome-ignore lint/suspicious/noArrayIndexKey: messages are append-only
					key={i}
					message={msg}
					fencedEnabled={fencedEnabled}
					isLast={i === visibleMessages.length - 1}
					isStreaming={isStreaming && i === visibleMessages.length - 1 && msg.role === "assistant"}
				/>
			))}
			{isStreaming && (
				<div role="status" className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
					<Loader2 className="size-3.5 animate-spin" /> Thinking…
				</div>
			)}
		</ChatViewport>
	);
}

/** A message that renders as a chat bubble; tool_result carriers and empty turns are internal. */
function hasVisibleText(message: ProtocolMessage): boolean {
	return message.content.some((block) => block.type === "text" && block.text.trim().length > 0);
}

/** The live tool-loop turn: its conversation, approval cards, notice, and one-step undo. */
function TurnConversation({ turn }: { turn: TurnState }) {
	const approveCall = useAiTurnStore((s) => s.approveCall);
	const approveBatch = useAiTurnStore((s) => s.approveBatch);
	const denyCall = useAiTurnStore((s) => s.denyCall);
	const turnStartIndex = useAiTurnStore((s) => s.turnStartIndex);
	const getToolCallPresentation = useAiTurnStore((s) => s.getToolCallPresentation);
	const undoTurn = useAiTurnStore((s) => s.undoTurn);
	const undoAvailability = useAiTurnStore((s) => s.undoAvailability);
	// Undo availability lives in the runner's ledger and depends on the history
	// stack, which changes when the user edits or presses Cmd+Z after the turn
	// without touching the turn. Selecting the stack depth re-renders this panel on
	// those edits so the button's disabled state stays accurate; the depth itself
	// is not otherwise needed, only its change.
	const historyStackDepth = useHistoryStore((s) => s.past.length);

	// A tool-enabled turn reviews mutations through the approval ledger, so fenced
	// parsing is disabled for it; a text-only fallback turn keeps it.
	const fencedEnabled = legacyFencedEnabledForTurn(turn.toolSet.list().length);
	const isStreaming = turn.phase === "requesting" || turn.phase === "streaming";
	const bubbles = turn.messages.filter(hasVisibleText);
	const hasApplied = turn.phase === "settled" && turn.calls.some((c) => c.status === "succeeded");
	// Reading the stack depth above subscribes this panel so the button's disabled
	// state updates on a post-turn edit; the value itself is only a change signal,
	// and `undoAvailability()` reads the live stack when it recomputes below.
	void historyStackDepth;
	const availability = hasApplied ? undoAvailability() : "already_undone";

	return (
		<ChatViewport activity={turn} runId={turn.budget.startedAtMs}>
			{turn.messages.map((message, i) => {
				const toolIds = message.content.flatMap((b) => (b.type === "tool_call" ? [b.id] : []));
				const calls = i >= turnStartIndex ? turn.calls.filter((c) => toolIds.includes(c.id)) : [];
				const previousCalls = i < turnStartIndex ? getToolCallPresentation(message) : [];
				const last = message === bubbles[bubbles.length - 1];
				return (
					// biome-ignore lint/suspicious/noArrayIndexKey: transcript messages retain their order during a turn
					<Fragment key={i}>
						{hasVisibleText(message) && (
							<MessageBubble
								message={message}
								isLast={last}
								isStreaming={isStreaming && last && message.role === "assistant"}
								fencedEnabled={i >= turnStartIndex && fencedEnabled}
							/>
						)}
						{calls.length > 0 && (
							<ToolCallBatch
								calls={calls}
								onApprove={approveCall}
								onApproveBatch={approveBatch}
								onDeny={denyCall}
							/>
						)}
						{previousCalls.length > 0 && (
							<div className="space-y-2">
								{previousCalls.map((call) => (
									<ToolCallCard key={call.id} call={call} />
								))}
							</div>
						)}
						{i < turnStartIndex && toolIds.length > 0 && previousCalls.length === 0 && (
							<p className="rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">
								{message.content
									.flatMap((b) => (b.type === "tool_call" ? [b.name.replace(/_/g, " ")] : []))
									.join(", ")}{" "}
								· Previous turn
							</p>
						)}
					</Fragment>
				);
			})}

			{isStreaming && (
				<div role="status" className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
					<Loader2 className="size-3.5 animate-spin" /> Thinking…
				</div>
			)}

			{turn.notice && (
				<div
					role="status"
					className="flex items-start gap-1.5 rounded bg-secondary/40 px-2 py-1.5 text-[10px] text-muted-foreground"
				>
					<Info className="mt-0.5 h-3 w-3 shrink-0" />
					<span className="flex-1">{turn.notice}</span>
				</div>
			)}

			{turn.error && (
				<div
					role="alert"
					className="flex items-start gap-1.5 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-foreground"
				>
					<AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
					<span className="flex-1">{turn.error.message}</span>
				</div>
			)}

			{hasApplied && (
				<button
					type="button"
					onClick={undoTurn}
					disabled={availability !== "undoable"}
					title={
						availability === "undoable"
							? "Undo every change this turn applied"
							: availability === "already_undone"
								? "This turn has already been undone"
								: "A later edit has superseded this turn, so it can no longer be undone in one step"
					}
					className="flex items-center gap-1 self-start rounded border border-border/50 px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-muted-foreground"
				>
					<Undo2 className="h-2.5 w-2.5" /> Undo this turn
				</button>
			)}
		</ChatViewport>
	);
}

const MessageBubble = memo(function MessageBubble({
	message,
	isLast,
	isStreaming,
	fencedEnabled = true,
}: {
	message: ProtocolMessage;
	isLast: boolean;
	isStreaming: boolean;
	/** Whether fenced ` ```actions ` parsing runs; a tool-enabled turn disables it. */
	fencedEnabled?: boolean;
}) {
	const isUser = message.role === "user";
	// Messages carry block content now; the bubble renders the accumulated text.
	// The assistant's fenced ` ```actions `/` ```threats ` blocks live inside this
	// text and are parsed only through the legacy boundary in `AssistantContent`.
	const displayText = flattenText(message);

	return (
		<div className={cn("min-w-0", isUser ? "flex justify-end" : "w-full")}>
			<div
				className={cn(
					"min-w-0 text-[13px] leading-relaxed [overflow-wrap:anywhere]",
					isUser
						? "max-w-[90%] rounded-2xl rounded-br-md bg-secondary px-3.5 py-2.5 text-secondary-foreground"
						: "w-full px-1 text-foreground",
				)}
			>
				{isUser ? (
					<p className="whitespace-pre-wrap">{displayText}</p>
				) : (
					<AssistantContent
						content={displayText}
						isStreaming={isStreaming}
						isLast={isLast}
						fencedEnabled={fencedEnabled}
					/>
				)}
			</div>
		</div>
	);
});

/** Extract user-facing text from AI response. Uses <response> tags if present, falls back to block stripping. */
export function extractDisplayContent(content: string): string {
	const responseRegex = /<response>([\s\S]*?)<\/response>/g;
	const parts: string[] = [];
	let match = responseRegex.exec(content);
	while (match) {
		const trimmed = match[1].trim();
		if (trimmed) parts.push(trimmed);
		match = responseRegex.exec(content);
	}
	if (parts.length > 0) return parts.join("\n\n");

	// Fallback: strip fenced blocks and any response tags (backward compat with older/non-compliant responses)
	return content
		.replace(/```threats\n[\s\S]*?```/g, "")
		.replace(/```actions\n[\s\S]*?```/g, "")
		.replace(/<\/?response>/g, "")
		.trim();
}

/** Strip fenced code blocks during streaming (response tags may be incomplete). */
export function stripBlocksForStreaming(content: string): string {
	return content
		.replace(/```threats\n[\s\S]*?```/g, "")
		.replace(/```actions\n[\s\S]*?```/g, "")
		.replace(/<\/?response>/g, "")
		.replace(/<\/?resp(on(se?)?)?$/, "")
		.trim();
}

function AssistantContent({
	content,
	isStreaming,
	isLast,
	fencedEnabled,
}: {
	content: string;
	isStreaming: boolean;
	isLast: boolean;
	/** Whether fenced parsing runs; a tool-enabled turn passes `false`. */
	fencedEnabled: boolean;
}) {
	const addThreat = useModelStore((s) => s.addThreat);
	const [acceptedIds, setAcceptedIds] = useState<Set<number>>(new Set());

	// `content` is the assistant turn's accumulated text; fenced parsing is the
	// legacy boundary's job and only runs there (issue #64 removes it). A
	// tool-enabled turn disables it so an injected fence cannot bypass the ledger.
	const parseFenced = isLast && !isStreaming && fencedEnabled;
	const threats = parseFenced ? extractLegacyThreats(content) : [];
	const actions = parseFenced ? extractLegacyActions(content) : [];

	const handleAccept = useCallback(
		(index: number, threat: Threat) => {
			addThreat(threat);
			setAcceptedIds((prev) => new Set([...prev, index]));
		},
		[addThreat],
	);

	const displayContent = isStreaming
		? stripBlocksForStreaming(content)
		: extractDisplayContent(content);

	return (
		<div className="flex flex-col gap-2">
			{displayContent && <MarkdownContent content={displayContent} />}
			{isStreaming && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}

			{actions.length > 0 && <ActionPreview actions={actions} />}

			{threats.length > 0 && (
				<div className="flex flex-col gap-1.5 border-t border-border/30 pt-1.5">
					<span className="text-[10px] font-medium text-muted-foreground">
						Suggested threats ({threats.length}):
					</span>
					{threats.map((threat, i) => (
						<ThreatSuggestionCard
							// biome-ignore lint/suspicious/noArrayIndexKey: threat index is stable after streaming
							key={i}
							title={threat.title}
							category={threat.category}
							severity={threat.severity}
							accepted={acceptedIds.has(i)}
							onAccept={() => handleAccept(i, suggestionToThreat(threat))}
						/>
					))}
				</div>
			)}
		</div>
	);
}

type ActionStatus = "pending" | "applied" | "failed";

/** Preview and apply AI-suggested model actions. */
function ActionPreview({ actions }: { actions: AiAction[] }) {
	const [actionStatus, setActionStatus] = useState<Map<number, ActionStatus>>(new Map());

	let appliedCount = 0;
	let failedCount = 0;
	for (const s of actionStatus.values()) {
		if (s === "applied") appliedCount++;
		else if (s === "failed") failedCount++;
	}
	const remainingCount = actions.length - appliedCount - failedCount;
	const allDone = appliedCount + failedCount === actions.length;

	const handleApplyOne = useCallback(
		(index: number) => {
			const success = executeSingleAction(actions[index]);
			setActionStatus((prev) => {
				const next = new Map(prev);
				next.set(index, success ? "applied" : "failed");
				return next;
			});
			useCanvasStore.getState().syncFromModel();
		},
		[actions],
	);

	const handleApplyRemaining = useCallback(() => {
		const remaining = actions
			.map((action, i) => ({ action, i }))
			.filter(({ i }) => !actionStatus.has(i));
		const res = executeActions(remaining.map((r) => r.action));
		setActionStatus((prev) => {
			const next = new Map(prev);
			// Mark all as applied only if zero failures; otherwise mark all as failed
			// (batch doesn't track per-action results, so be conservative)
			const status: ActionStatus = res.failed === 0 ? "applied" : "failed";
			for (const { i } of remaining) {
				next.set(i, status);
			}
			return next;
		});
		useCanvasStore.getState().syncFromModel();
	}, [actions, actionStatus]);

	return (
		<div className="flex flex-col gap-1.5 border-t border-border/30 pt-1.5">
			<div className="flex items-center justify-between">
				<span className="text-[10px] font-medium text-muted-foreground">
					Suggested changes ({actions.length}):
				</span>
				{!allDone && (
					<button
						type="button"
						onClick={handleApplyRemaining}
						className="flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors"
					>
						<Play className="h-2.5 w-2.5" />
						{appliedCount === 0 ? "Apply All" : `Apply Remaining (${remainingCount})`}
					</button>
				)}
				{allDone && (
					<span className="text-[10px] text-muted-foreground">
						{appliedCount} applied{failedCount > 0 ? `, ${failedCount} failed` : ""}
					</span>
				)}
			</div>
			{actions.map((action, i) => (
				<ActionRow
					// biome-ignore lint/suspicious/noArrayIndexKey: action index is stable after streaming
					key={i}
					action={action}
					status={actionStatus.get(i) ?? "pending"}
					onApply={() => handleApplyOne(i)}
				/>
			))}
		</div>
	);
}

/** Single action row with per-action apply button. */
function ActionRow({
	action,
	status,
	onApply,
}: {
	action: AiAction;
	status: ActionStatus;
	onApply: () => void;
}) {
	return (
		<div
			className={cn(
				"flex items-center gap-1.5 rounded border p-1.5 text-[10px]",
				status === "applied" && "border-border/50 bg-background/50 opacity-60",
				status === "failed" && "border-destructive/30 bg-background/50",
				status === "pending" && "border-border/50 bg-background/50",
			)}
		>
			<span className="flex-1">{describeAction(action)}</span>
			<button
				type="button"
				onClick={onApply}
				disabled={status !== "pending"}
				className={cn(
					"shrink-0 rounded p-1 transition-colors",
					status === "pending" && "text-primary hover:bg-primary/10",
					status === "applied" && "cursor-default text-green-500",
					status === "failed" && "cursor-default text-destructive",
				)}
				title={
					status === "applied" ? "Applied" : status === "failed" ? "Failed" : "Apply this change"
				}
			>
				{status === "applied" && <Check className="h-3.5 w-3.5" />}
				{status === "failed" && <X className="h-3.5 w-3.5" />}
				{status === "pending" && <Play className="h-3.5 w-3.5" />}
			</button>
		</div>
	);
}

function ThreatSuggestionCard({
	title,
	category,
	severity,
	accepted,
	onAccept,
}: {
	title: string;
	category: string;
	severity: string;
	accepted: boolean;
	onAccept: () => void;
}) {
	return (
		<div className="flex items-start gap-1.5 rounded border border-border/50 bg-background/50 p-1.5">
			<div className="flex-1">
				<p className="text-[10px] font-medium">{title}</p>
				<div className="mt-0.5 flex items-center gap-1">
					<span className="rounded bg-secondary/50 px-1 py-0.5 text-[9px]">{category}</span>
					<span className="rounded bg-secondary/50 px-1 py-0.5 text-[9px] capitalize">
						{severity}
					</span>
				</div>
			</div>
			<button
				type="button"
				onClick={onAccept}
				disabled={accepted}
				className={cn(
					"shrink-0 rounded p-1 transition-colors",
					accepted ? "cursor-default text-green-500" : "text-primary hover:bg-primary/10",
				)}
				title={accepted ? "Accepted" : "Accept threat"}
			>
				<Check className="h-3.5 w-3.5" />
			</button>
		</div>
	);
}

function ChatInput({ canSend }: { canSend: boolean }) {
	const submitTurn = useAiTurnStore((s) => s.submitTurn);
	const turnPhase = useAiTurnStore((s) => s.turn?.phase);
	const chatIsStreaming = useChatStore((s) => s.isStreaming);
	const stopGenerating = useChatStore((s) => s.stopGenerating);
	const model = useModelStore((s) => s.model);
	const activeSessionId = useChatStore((s) => s.activeSessionId);
	const input = useChatStore(
		(s) => s.sessions.find((session) => session.id === s.activeSessionId)?.draft ?? "",
	);
	const setInput = useChatStore((s) => s.setDraft);
	const inputRef = useRef<HTMLTextAreaElement>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: resize when the controlled draft changes or the field becomes available
	useLayoutEffect(() => {
		const el = inputRef.current;
		if (!el) return;
		el.style.height = "0px";
		el.style.height = `${Math.min(160, Math.max(44, el.scrollHeight))}px`;
	}, [input, canSend]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: focus the composer on chat selection
	useLayoutEffect(() => {
		// Key checks can mount the message field after a keyboard model change; keep selection focus.
		if (document.activeElement instanceof HTMLSelectElement) return;
		inputRef.current?.focus();
	}, [activeSessionId, canSend]);

	// Busy while a tool-loop turn is live or the legacy text stream is running.
	const isBusy = isTurnLive(turnPhase) || chatIsStreaming;

	// Keyboard shortcuts: Cmd+L to focus, Escape to stop generating
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			const mod = e.metaKey || e.ctrlKey;
			if (mod && e.key.toLowerCase() === "l" && inputRef.current) {
				e.preventDefault();
				inputRef.current?.focus();
			}
			// `stopGenerating` cancels both the chat stream and any live tool turn.
			const live =
				isTurnLive(useAiTurnStore.getState().turn?.phase) || useChatStore.getState().isStreaming;
			if (e.key === "Escape" && live) {
				stopGenerating();
			}
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [stopGenerating]);

	function handleSubmit() {
		const trimmed = input.trim();
		if (!trimmed || !canSend || isBusy || !model) return;

		setInput("");
		void submitTurn(trimmed, model);
	}

	function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
		if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
			e.preventDefault();
			handleSubmit();
		}
	}

	return (
		<fieldset
			aria-label="Message composer"
			className="mt-3 min-w-0 shrink-0 rounded-xl border border-border bg-background px-3 pt-2.5 pb-2 shadow-sm transition-colors focus-within:border-ring"
		>
			{canSend && (
				<textarea
					ref={inputRef}
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder="Ask about threats..."
					aria-label="Message AI assistant"
					rows={2}
					className="block max-h-40 w-full resize-none overflow-y-auto bg-transparent text-[13px] leading-relaxed placeholder:text-muted-foreground focus:outline-none"
				/>
			)}
			<div className="mt-2 flex items-start justify-between gap-2">
				<ChatModelSelector disabled={isBusy} />
				{isBusy ? (
					<button
						type="button"
						onClick={stopGenerating}
						className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-ring"
						title="Stop generating (Esc)"
						aria-label="Stop response"
					>
						<Square className="size-3 fill-current" />
					</button>
				) : canSend ? (
					<button
						type="button"
						onClick={handleSubmit}
						disabled={!input.trim()}
						className={cn(
							"flex size-8 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-ring",
							input.trim()
								? "bg-primary text-primary-foreground hover:bg-primary/90"
								: "cursor-not-allowed bg-muted text-muted-foreground",
						)}
						title="Send (Enter)"
						aria-label="Send message"
					>
						<ArrowUp className="size-4" />
					</button>
				) : null}
			</div>
			{(canSend || isBusy) && (
				<p className="mt-1 text-[10px] text-muted-foreground">
					{turnPhase === "awaiting_approval"
						? "Review suggested changes"
						: isBusy
							? "Generating…"
							: "Enter to send"}
				</p>
			)}
		</fieldset>
	);
}
