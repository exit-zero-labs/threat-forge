import {
	AlertCircle,
	Bot,
	Check,
	ChevronDown,
	Info,
	Loader2,
	Play,
	Plus,
	Send,
	Settings,
	Sparkles,
	Square,
	Trash2,
	Undo2,
	User,
	X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { MarkdownContent } from "./markdown-content";
import { ToolCallBatch } from "./tool-call-card";

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
	const checkApiKey = useChatStore((s) => s.checkApiKey);
	const loadSessionsForFile = useChatStore((s) => s.loadSessionsForFile);
	const migrateSessionKey = useChatStore((s) => s.migrateSessionKey);
	const openSettingsDialogAtTab = useSettingsStore((s) => s.openSettingsDialogAtTab);
	const resetTurn = useAiTurnStore((s) => s.resetTurn);
	const prevFilePathRef = useRef<string | null | undefined>(undefined);

	// Check API key on mount
	useEffect(() => {
		void checkApiKey();
	}, [checkApiKey]);

	// The tool-loop turn is process-global and holds its conversation in memory
	// (durable, per-document retention is #63). Reset it whenever the active
	// document changes — and on mount — so the prior document's turn is never
	// shown here and its transcript is never sent as `baseMessages` to the new
	// document's provider request. Keyed on `activeDocumentId` only, so a Save As
	// (a `filePath` change on the same document) does not discard a live turn.
	// This runs entirely in the panel; `document-registry.ts` is unchanged.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset only on document switch, not on resetTurn identity
	useEffect(() => {
		resetTurn();
	}, [activeDocumentId]);

	// Load sessions when the active document changes; migrate on Save As. `activeDocumentId` is
	// a dependency so a switch between two unsaved documents (both `filePath === null`) still
	// re-binds the panel instead of leaving it on the previous document's sessions.
	// biome-ignore lint/correctness/useExhaustiveDependencies: activeDocumentId re-binds sessions on document switch
	useEffect(() => {
		const prev = prevFilePathRef.current;
		// Migrate sessions when transitioning from unsaved/old path to a new path
		if (prev !== undefined && filePath && prev !== filePath) {
			migrateSessionKey(filePath);
		}
		loadSessionsForFile(filePath);
		prevFilePathRef.current = filePath;
	}, [activeDocumentId, filePath, loadSessionsForFile, migrateSessionKey]);

	if (!model) {
		return (
			<p className="text-xs text-muted-foreground">Open a threat model to use AI assistance.</p>
		);
	}

	const openAiSettings = () => openSettingsDialogAtTab("ai");

	return (
		<div className="flex h-full flex-col">
			{/* Header with settings */}
			<div className="mb-2 flex items-center justify-between">
				<div className="flex items-center gap-1.5">
					<Sparkles className="h-3.5 w-3.5 text-primary" />
					<span className="text-xs font-medium">AI Assistant</span>
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

			{!hasApiKey ? <EmptyState onConfigure={openAiSettings} /> : <ChatView />}
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

	return (
		<div className="flex flex-1 flex-col gap-2 overflow-hidden">
			{/* Session bar */}
			<SessionBar />

			{/* Messages area */}
			{turn ? (
				<TurnConversation turn={turn} />
			) : (
				<MessageList messages={messages} isStreaming={isStreaming} />
			)}

			{/* Error display */}
			{error && (
				<div className="flex items-start gap-1.5 rounded bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
					<AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
					<div className="flex-1">{error}</div>
					<button type="button" onClick={clearError} className="shrink-0 text-[10px] underline">
						Dismiss
					</button>
				</div>
			)}

			{/* Input */}
			<ChatInput />
		</div>
	);
}

function SessionBar() {
	const sessions = useChatStore((s) => s.sessions);
	const activeSessionId = useChatStore((s) => s.activeSessionId);
	const newSession = useChatStore((s) => s.newSession);
	const switchSession = useChatStore((s) => s.switchSession);
	const deleteSession = useChatStore((s) => s.deleteSession);
	const isStreaming = useChatStore((s) => s.isStreaming);
	const resetTurn = useAiTurnStore((s) => s.resetTurn);
	const [dropdownOpen, setDropdownOpen] = useState(false);

	const activeSession = sessions.find((s) => s.id === activeSessionId);
	const dropdownRef = useRef<HTMLDivElement>(null);

	// A session change is a conversation-context change, so it clears the live
	// turn: "New chat" starts fresh, and switching sessions shows that session's
	// transcript instead of the previous turn.
	const startNewSession = () => {
		resetTurn();
		newSession();
	};
	const goToSession = (id: string) => {
		resetTurn();
		switchSession(id);
	};
	const removeSession = (id: string) => {
		resetTurn();
		deleteSession(id);
	};

	// Close dropdown on click outside
	useEffect(() => {
		if (!dropdownOpen) return;
		function handleClick(e: MouseEvent) {
			if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
				setDropdownOpen(false);
			}
		}
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [dropdownOpen]);

	return (
		<div className="flex items-center gap-1" ref={dropdownRef}>
			<button
				type="button"
				onClick={startNewSession}
				disabled={isStreaming}
				className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
				title="New chat session"
			>
				<Plus className="h-3 w-3" />
			</button>

			<div className="relative flex-1">
				<button
					type="button"
					onClick={() => setDropdownOpen(!dropdownOpen)}
					className="flex w-full items-center gap-1 rounded border border-border/50 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:border-border transition-colors"
				>
					<span className="flex-1 truncate text-left">{activeSession?.title ?? "New Chat"}</span>
					<ChevronDown className="h-2.5 w-2.5 shrink-0" />
				</button>

				{dropdownOpen && sessions.length > 1 && (
					<div className="absolute left-0 top-full z-50 mt-0.5 max-h-48 w-full overflow-y-auto rounded border border-border bg-popover shadow-md">
						{sessions.map((session) => (
							<button
								key={session.id}
								type="button"
								onClick={() => {
									goToSession(session.id);
									setDropdownOpen(false);
								}}
								className={cn(
									"flex w-full items-center px-1.5 py-1 text-[10px] transition-colors hover:bg-accent",
									session.id === activeSessionId && "bg-accent/50 font-medium",
								)}
							>
								<span className="flex-1 truncate text-left">{session.title}</span>
							</button>
						))}
					</div>
				)}
			</div>

			{activeSession && sessions.length > 0 && (
				<button
					type="button"
					onClick={() => removeSession(activeSession.id)}
					disabled={isStreaming}
					className="shrink-0 rounded p-1 text-muted-foreground/50 hover:text-destructive transition-colors disabled:opacity-50"
					title="Delete this session"
				>
					<Trash2 className="h-2.5 w-2.5" />
				</button>
			)}
		</div>
	);
}

function MessageList({ messages, isStreaming }: { messages: ChatMessage[]; isStreaming: boolean }) {
	const messagesEndRef = useRef<HTMLDivElement>(null);

	// Auto-scroll to bottom on new messages
	// biome-ignore lint/correctness/useExhaustiveDependencies: messages intentionally in deps to trigger scroll on content change
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages]);

	if (messages.length === 0) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
				<Bot className="h-8 w-8 text-muted-foreground/20" />
				<p className="text-[10px] text-muted-foreground/70">
					Ask about threats, mitigations, or your architecture.
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-1 flex-col gap-2 overflow-y-auto">
			{messages.map((msg, i) => (
				<MessageBubble
					// biome-ignore lint/suspicious/noArrayIndexKey: messages are append-only
					key={i}
					message={msg}
					isLast={i === messages.length - 1}
					isStreaming={isStreaming && i === messages.length - 1 && msg.role === "assistant"}
				/>
			))}
			<div ref={messagesEndRef} />
		</div>
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
	const undoTurn = useAiTurnStore((s) => s.undoTurn);
	const undoAvailability = useAiTurnStore((s) => s.undoAvailability);
	// Undo availability lives in the runner's ledger and depends on the history
	// stack, which changes when the user edits or presses Cmd+Z after the turn
	// without touching the turn. Selecting the stack depth re-renders this panel on
	// those edits so the button's disabled state stays accurate; the depth itself
	// is not otherwise needed, only its change.
	const historyStackDepth = useHistoryStore((s) => s.past.length);
	const messagesEndRef = useRef<HTMLDivElement>(null);

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

	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll to the latest on any turn change
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [turn]);

	return (
		<div className="flex flex-1 flex-col gap-2 overflow-y-auto">
			{bubbles.map((message, i) => (
				<MessageBubble
					// biome-ignore lint/suspicious/noArrayIndexKey: turn messages are append-only
					key={i}
					message={message}
					isLast={i === bubbles.length - 1}
					isStreaming={isStreaming && i === bubbles.length - 1 && message.role === "assistant"}
					fencedEnabled={fencedEnabled}
				/>
			))}

			{turn.calls.length > 0 && (
				<ToolCallBatch
					calls={[...turn.calls]}
					onApprove={approveCall}
					onApproveBatch={approveBatch}
					onDeny={denyCall}
				/>
			)}

			{isStreaming && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}

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
				<div className="flex items-start gap-1.5 rounded bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
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

			<div ref={messagesEndRef} />
		</div>
	);
}

function MessageBubble({
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
		<div className={cn("flex gap-2", isUser ? "flex-row-reverse" : "flex-row")}>
			<div
				className={cn(
					"flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
					isUser ? "bg-primary/10" : "bg-secondary",
				)}
			>
				{isUser ? (
					<User className="h-3 w-3 text-primary" />
				) : (
					<Bot className="h-3 w-3 text-secondary-foreground" />
				)}
			</div>
			<div
				className={cn(
					"max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs",
					isUser ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
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
}

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

function ChatInput() {
	const submitTurn = useAiTurnStore((s) => s.submitTurn);
	const turnPhase = useAiTurnStore((s) => s.turn?.phase);
	const chatIsStreaming = useChatStore((s) => s.isStreaming);
	const stopGenerating = useChatStore((s) => s.stopGenerating);
	const model = useModelStore((s) => s.model);
	const [input, setInput] = useState("");
	const inputRef = useRef<HTMLTextAreaElement>(null);

	// Busy while a tool-loop turn is live or the legacy text stream is running.
	const isBusy = isTurnLive(turnPhase) || chatIsStreaming;

	// Keyboard shortcuts: Cmd+L to focus, Escape to stop generating
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			const mod = e.metaKey || e.ctrlKey;
			if (mod && e.key.toLowerCase() === "l") {
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
		if (!trimmed || isBusy || !model) return;

		setInput("");
		void submitTurn(trimmed, model);
	}

	function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSubmit();
		}
	}

	return (
		<div className="flex gap-1.5">
			<textarea
				ref={inputRef}
				value={input}
				onChange={(e) => setInput(e.target.value)}
				onKeyDown={handleKeyDown}
				placeholder="Ask about threats..."
				rows={2}
				disabled={isBusy}
				className="flex-1 resize-none rounded border border-border bg-background px-2 py-1.5 text-xs placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none disabled:opacity-50"
			/>
			{isBusy ? (
				<button
					type="button"
					onClick={stopGenerating}
					className="self-end rounded bg-destructive p-1.5 text-destructive-foreground transition-colors hover:bg-destructive/90"
					title="Stop generating (Esc)"
				>
					<Square className="h-3.5 w-3.5" />
				</button>
			) : (
				<button
					type="button"
					onClick={handleSubmit}
					disabled={!input.trim()}
					className={cn(
						"self-end rounded p-1.5 transition-colors",
						input.trim()
							? "bg-primary text-primary-foreground hover:bg-primary/90"
							: "cursor-not-allowed bg-muted text-muted-foreground",
					)}
					title="Send (Enter)"
				>
					<Send className="h-3.5 w-3.5" />
				</button>
			)}
		</div>
	);
}
