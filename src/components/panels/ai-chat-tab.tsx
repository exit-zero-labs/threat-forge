import {
	AlertCircle,
	Bot,
	Check,
	Loader2,
	Send,
	Settings,
	Sparkles,
	Trash2,
	User,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { extractThreats, suggestionToThreat } from "@/lib/ai-utils";
import { cn } from "@/lib/utils";
import { type ChatMessage, useChatStore } from "@/stores/chat-store";
import { useModelStore } from "@/stores/model-store";
import type { Threat } from "@/types/threat-model";
import { AiSettingsDialog } from "./ai-settings-dialog";

export function AiChatTab() {
	const model = useModelStore((s) => s.model);
	const hasApiKey = useChatStore((s) => s.hasApiKey);
	const checkApiKey = useChatStore((s) => s.checkApiKey);
	const [showSettings, setShowSettings] = useState(false);

	// Check API key on mount
	useEffect(() => {
		void checkApiKey();
	}, [checkApiKey]);

	if (!model) {
		return (
			<p className="text-xs text-muted-foreground">Open a threat model to use AI assistance.</p>
		);
	}

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
					onClick={() => setShowSettings(true)}
					className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
					title="AI Settings"
				>
					<Settings className="h-3.5 w-3.5" />
				</button>
			</div>

			{!hasApiKey ? <EmptyState onConfigure={() => setShowSettings(true)} /> : <ChatView />}

			{showSettings && <AiSettingsDialog onClose={() => setShowSettings(false)} />}
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
	const clearMessages = useChatStore((s) => s.clearMessages);

	return (
		<div className="flex flex-1 flex-col gap-2 overflow-hidden">
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

			{/* Clear chat button */}
			{messages.length > 0 && !isStreaming && (
				<button
					type="button"
					onClick={clearMessages}
					className="flex items-center gap-1 self-start text-[10px] text-muted-foreground hover:text-foreground transition-colors"
				>
					<Trash2 className="h-2.5 w-2.5" />
					Clear chat
				</button>
			)}

			{/* Input */}
			<ChatInput />
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

	const handleAccept = useCallback(
		(index: number, threat: Threat) => {
			addThreat(threat);
			setAcceptedIds((prev) => new Set([...prev, index]));
		},
		[addThreat],
	);

	// Render content with threats extracted as actionable cards
	const displayContent = content.replace(/```threats\n[\s\S]*?```/g, "").trim();

	return (
		<div className="flex flex-col gap-2">
			{displayContent && <p className="whitespace-pre-wrap">{displayContent}</p>}
			{isStreaming && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}

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
	const model = useModelStore((s) => s.model);
	const [input, setInput] = useState("");
	const inputRef = useRef<HTMLTextAreaElement>(null);

	// Expose ref for keyboard shortcut focus
	useEffect(() => {
		function handleFocusChat(e: KeyboardEvent) {
			const mod = e.metaKey || e.ctrlKey;
			if (mod && e.key.toLowerCase() === "l") {
				e.preventDefault();
				inputRef.current?.focus();
			}
		}
		window.addEventListener("keydown", handleFocusChat);
		return () => window.removeEventListener("keydown", handleFocusChat);
	}, []);

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
			<button
				type="button"
				onClick={handleSubmit}
				disabled={!input.trim() || isStreaming}
				className={cn(
					"self-end rounded p-1.5 transition-colors",
					input.trim() && !isStreaming
						? "bg-primary text-primary-foreground hover:bg-primary/90"
						: "cursor-not-allowed bg-muted text-muted-foreground",
				)}
				title="Send (Enter)"
			>
				{isStreaming ? (
					<Loader2 className="h-3.5 w-3.5 animate-spin" />
				) : (
					<Send className="h-3.5 w-3.5" />
				)}
			</button>
		</div>
	);
}
