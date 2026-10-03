import { Check, ChevronDown, MessageSquare, PenLine, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat-store";

export function ChatSessionPicker() {
	const sessions = useChatStore((s) => s.sessions);
	const activeId = useChatStore((s) => s.activeSessionId);
	const newSession = useChatStore((s) => s.newSession);
	const switchSession = useChatStore((s) => s.switchSession);
	const renameSession = useChatStore((s) => s.renameSession);
	const deleteSession = useChatStore((s) => s.deleteSession);
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [editing, setEditing] = useState<string | null>(null);
	const [name, setName] = useState("");
	const [deleting, setDeleting] = useState<string | null>(null);
	const rootRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const searchRef = useRef<HTMLInputElement>(null);
	const nameRef = useRef<HTMLInputElement>(null);
	const active = sessions.find((s) => s.id === activeId);
	const filtered = [...sessions]
		.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
		.filter((s) => s.title.toLowerCase().includes(search.toLowerCase()));

	function close() {
		setOpen(false);
		setEditing(null);
		setDeleting(null);
		triggerRef.current?.focus();
	}

	useEffect(() => {
		if (!open) return;
		searchRef.current?.focus();
		function outside(event: MouseEvent) {
			if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
		}
		document.addEventListener("mousedown", outside);
		return () => document.removeEventListener("mousedown", outside);
	}, [open]);

	useEffect(() => {
		if (editing) {
			nameRef.current?.focus();
			nameRef.current?.select();
		}
	}, [editing]);

	return (
		<div ref={rootRef} className="relative flex min-w-0 shrink-0 items-center gap-2">
			<button
				ref={triggerRef}
				type="button"
				aria-label="Choose chat"
				aria-expanded={open}
				aria-haspopup="dialog"
				onClick={() => {
					setSearch("");
					setEditing(null);
					setDeleting(null);
					setOpen(!open);
				}}
				className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-xs transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
			>
				<MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
				<span className="min-w-0 flex-1 truncate text-left">{active?.title ?? "New Chat"}</span>
				<ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
			</button>
			<button
				type="button"
				onClick={() => {
					newSession();
					setOpen(false);
				}}
				title="New chat session"
				aria-label="New chat"
				className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
			>
				<Plus className="size-4" />
			</button>
			{open && (
				<div
					role="dialog"
					aria-label="Chats"
					className="absolute inset-x-0 top-full z-50 mt-2 flex max-h-[min(28rem,65vh)] flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg"
					onKeyDown={(event) => {
						if (event.key === "Escape") {
							event.preventDefault();
							event.stopPropagation();
							if (editing || deleting) {
								setEditing(null);
								setDeleting(null);
								searchRef.current?.focus();
							} else close();
						}
						if (event.key === "ArrowDown" || event.key === "ArrowUp") {
							if (editing) return;
							event.preventDefault();
							const buttons = Array.from(
								rootRef.current?.querySelectorAll<HTMLButtonElement>("[data-chat-choice]") ?? [],
							);
							const current =
								document.activeElement instanceof HTMLButtonElement
									? buttons.indexOf(document.activeElement)
									: -1;
							buttons[
								(current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length
							]?.focus();
						}
					}}
				>
					<div className="flex items-center justify-between px-3 pt-3 pb-2">
						<span className="text-xs font-semibold">
							Chats{" "}
							<span className="ml-1 font-normal text-muted-foreground">{sessions.length}</span>
						</span>
						<button
							type="button"
							aria-label="Close chat picker"
							onClick={close}
							className="rounded p-1 hover:bg-accent"
						>
							<X className="size-3.5" />
						</button>
					</div>
					<div className="mx-3 mb-2 flex items-center gap-2 rounded-md border border-border px-2">
						<Search className="size-3.5 shrink-0 text-muted-foreground" />
						<input
							ref={searchRef}
							aria-label="Search chats"
							placeholder="Search chats…"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && filtered[0]) {
									switchSession(filtered[0].id);
									close();
								}
							}}
							className="min-w-0 flex-1 bg-transparent py-2 text-xs outline-none"
						/>
					</div>
					<div className="min-h-0 overflow-y-auto px-1.5 pb-1.5">
						{filtered.length === 0 && (
							<p className="px-2 py-6 text-center text-xs text-muted-foreground">
								No chats match your search.
							</p>
						)}
						{filtered.map((session) => (
							<div
								key={session.id}
								className={cn("rounded-lg", session.id === activeId && "bg-accent/60")}
							>
								{editing === session.id ? (
									<form
										className="flex items-center gap-1 p-2"
										onSubmit={(e) => {
											e.preventDefault();
											if (name.trim()) {
												renameSession(session.id, name);
												setEditing(null);
												searchRef.current?.focus();
											}
										}}
									>
										<input
											ref={nameRef}
											aria-label="Chat name"
											maxLength={60}
											value={name}
											onChange={(e) => setName(e.target.value)}
											className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1.5 text-xs outline-ring"
										/>
										<button
											type="submit"
											disabled={!name.trim()}
											aria-label="Save chat name"
											className="rounded p-1.5 hover:bg-accent disabled:opacity-40"
										>
											<Check className="size-3.5" />
										</button>
									</form>
								) : deleting === session.id ? (
									<div className="p-3 text-xs">
										<p className="break-words">Delete “{session.title}”?</p>
										<p className="mt-1 text-muted-foreground">This removes this chat’s history.</p>
										<div className="mt-3 flex justify-end gap-2">
											<button
												type="button"
												onClick={() => {
													setDeleting(null);
													searchRef.current?.focus();
												}}
												className="rounded-md border border-border px-2.5 py-1.5"
											>
												Cancel
											</button>
											<button
												type="button"
												onClick={() => {
													deleteSession(session.id);
													setDeleting(null);
													searchRef.current?.focus();
												}}
												className="rounded-md bg-primary px-2.5 py-1.5 text-primary-foreground"
											>
												Delete chat
											</button>
										</div>
									</div>
								) : (
									<div className="flex items-center gap-0.5 pr-1">
										<button
											type="button"
											data-chat-choice
											aria-label={`Open chat: ${session.title}`}
											aria-current={session.id === activeId ? "true" : undefined}
											onClick={() => {
												switchSession(session.id);
												close();
											}}
											className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2.5 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
										>
											<div className="min-w-0 flex-1">
												<p className="truncate text-xs font-medium">{session.title}</p>
												<p className="mt-0.5 text-[11px] text-muted-foreground">
													{session.messages.length === 0
														? "No messages yet"
														: `${session.messages.filter((m) => m.content.some((b) => b.type === "text" && b.text)).length} messages`}
												</p>
											</div>
											{session.id === activeId && (
												<Check className="size-3.5 shrink-0 text-muted-foreground" />
											)}
										</button>
										<button
											type="button"
											aria-label={`Rename chat: ${session.title}`}
											onClick={() => {
												setEditing(session.id);
												setName(session.title);
											}}
											className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
										>
											<PenLine className="size-3.5" />
										</button>
										<button
											type="button"
											aria-label={`Delete chat: ${session.title}`}
											onClick={() => {
												setDeleting(session.id);
												setEditing(null);
											}}
											className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
										>
											<Trash2 className="size-3.5" />
										</button>
									</div>
								)}
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
