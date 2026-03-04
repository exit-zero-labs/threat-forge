import {
	AlertCircle,
	Bot,
	Check,
	ChevronDown,
	Loader2,
	Play,
	Plus,
	Send,
	Settings,
	Sparkles,
	Square,
	Trash2,
	User,
	X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { executeActions, executeSingleAction } from "@/lib/ai-action-executor";
import { type AiAction, describeAction, extractActions } from "@/lib/ai-actions";
import { extractThreats, suggestionToThreat } from "@/lib/ai-utils";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/stores/canvas-store";
import { type ChatMessage, useChatStore } from "@/stores/chat-store";
import { useModelStore } from "@/stores/model-store";
import { useSettingsStore } from "@/stores/settings-store";
import type { Threat } from "@/types/threat-model";
import { MarkdownContent } from "./markdown-content";

export function AiChatTab() {
	const model = useModelStore((s) => s.model);
	const filePath = useModelStore((s) => s.filePath);
	const hasApiKey = useChatStore((s) => s.hasApiKey);
	const checkApiKey = useChatStore((s) => s.checkApiKey);
	const loadSessionsForFile = useChatStore((s) => s.loadSessionsForFile);
	const migrateSessionKey = useChatStore((s) => s.migrateSessionKey);
	const openSettingsDialogAtTab = useSettingsStore((s) => s.openSettingsDialogAtTab);
	const prevFilePathRef = useRef<string | null | undefined>(undefined);

	// Check API key on mount
	useEffect(() => {
		void checkApiKey();
	}, [checkApiKey]);

	// Load sessions when file path changes; migrate on Save As
	useEffect(() => {
		const prev = prevFilePathRef.current;
		// Migrate sessions when transitioning from unsaved/old path to a new path
		if (prev !== undefined && filePath && prev !== filePath) {
			migrateSessionKey(filePath);
		}
		loadSessionsForFile(filePath);
		prevFilePathRef.current = filePath;
	}, [filePath, loadSessionsForFile, migrateSessionKey]);

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

	return (
		<div className="flex flex-1 flex-col gap-2 overflow-hidden">
			{/* Session bar */}
			<SessionBar />

			{/* Messages area */}
			<MessageList messages={messages} isStreaming={isStreaming} />

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
	const [dropdownOpen, setDropdownOpen] = useState(false);

	const activeSession = sessions.find((s) => s.id === activeSessionId);
	const dropdownRef = useRef<HTMLDivElement>(null);

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
				onClick={newSession}
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
									switchSession(session.id);
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
					onClick={() => deleteSession(activeSession.id)}
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

function MessageBubble({
	message,
	isLast,
	isStreaming,
}: {
	message: ChatMessage;
	isLast: boolean;
	isStreaming: boolean;
}) {
	const isUser = message.role === "user";

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
					<p className="whitespace-pre-wrap">{message.content}</p>
				) : (
					<AssistantContent content={message.content} isStreaming={isStreaming} isLast={isLast} />
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
}: {
	content: string;
	isStreaming: boolean;
	isLast: boolean;
}) {
	const addThreat = useModelStore((s) => s.addThreat);
	const [acceptedIds, setAcceptedIds] = useState<Set<number>>(new Set());

	const threats = isLast && !isStreaming ? extractThreats(content) : [];
	const actions = isLast && !isStreaming ? extractActions(content) : [];

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
	const sendMessage = useChatStore((s) => s.sendMessage);
	const isStreaming = useChatStore((s) => s.isStreaming);
	const stopGenerating = useChatStore((s) => s.stopGenerating);
	const model = useModelStore((s) => s.model);
	const [input, setInput] = useState("");
	const inputRef = useRef<HTMLTextAreaElement>(null);

	// Keyboard shortcuts: Cmd+L to focus, Escape to stop generating
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			const mod = e.metaKey || e.ctrlKey;
			if (mod && e.key.toLowerCase() === "l") {
				e.preventDefault();
				inputRef.current?.focus();
			}
			if (e.key === "Escape" && useChatStore.getState().isStreaming) {
				stopGenerating();
			}
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [stopGenerating]);

	function handleSubmit() {
		const trimmed = input.trim();
		if (!trimmed || isStreaming || !model) return;

		setInput("");
		void sendMessage(trimmed, model);
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
				disabled={isStreaming}
				className="flex-1 resize-none rounded border border-border bg-background px-2 py-1.5 text-xs placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none disabled:opacity-50"
			/>
			{isStreaming ? (
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
