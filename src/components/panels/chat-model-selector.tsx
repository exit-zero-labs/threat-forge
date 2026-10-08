import { Check, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { getDefaultModelId, getModelById, getModelsForProvider } from "@/lib/ai-models";
import { cn } from "@/lib/utils";
import { type AiProvider, useChatStore } from "@/stores/chat-store";
import { useSettingsStore } from "@/stores/settings-store";

const PROVIDERS = ["openai", "anthropic"] as const;

/** Choose the next turn's provider/model; saved legacy choices require deliberate replacement. */
export function ChatModelSelector({ disabled }: { disabled: boolean }) {
	const provider = useChatStore((s) => s.provider);
	const setProvider = useChatStore((s) => s.setProvider);
	const settings = useSettingsStore((s) => s.settings);
	const updateSetting = useSettingsStore((s) => s.updateSetting);
	const [open, setOpen] = useState(false);
	const [menuHeight, setMenuHeight] = useState(384);
	const rootRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const typeahead = useRef({ text: "", at: 0 });
	const menuId = useId();
	const savedModel = (name: AiProvider) =>
		(name === "anthropic" ? settings.aiModelAnthropic : settings.aiModelOpenai) ||
		getDefaultModelId(name);
	const selectedId = savedModel(provider);
	const selectedModel = getModelsForProvider(provider).find((model) => model.id === selectedId);

	function close() {
		setOpen(false);
		triggerRef.current?.focus();
	}

	function selectModel(target: AiProvider, id: string) {
		if (disabled) return;
		const model = getModelsForProvider(target).find((model) => model.id === id);
		if (!model && id !== savedModel(target)) return;
		if (model)
			updateSetting(target === "anthropic" ? "aiModelAnthropic" : "aiModelOpenai", model.id);
		close();
		setProvider(target);
	}

	const focusChoice = useCallback((choice: HTMLButtonElement | undefined) => {
		if (!choice) return;
		choice.focus({ preventScroll: true });
		const menu = menuRef.current;
		if (!menu) return;
		// Keep focus inside the menu's padding without scrolling its conversation anchor.
		const bounds = menu.getBoundingClientRect();
		const choiceBounds = choice.getBoundingClientRect();
		const scale = menu.offsetHeight ? bounds.height / menu.offsetHeight : 1;
		const top = (choiceBounds.top - bounds.top) / scale;
		const bottom = (choiceBounds.bottom - bounds.top) / scale;
		if (top < menu.clientTop + 4) menu.scrollTop -= Math.ceil(menu.clientTop + 4 - top);
		else if (bottom > menu.clientTop + menu.clientHeight - 4)
			menu.scrollTop += Math.ceil(bottom - menu.clientTop - menu.clientHeight + 4);
	}, []);

	useLayoutEffect(() => {
		if (!open || disabled) return;
		const root = rootRef.current;
		if (!root) return;
		const bounds = root.getBoundingClientRect();
		const surface = root.closest("[data-ai-chat]");
		const surfaceTop = Math.max(
			0,
			surface?.getBoundingClientRect().top ?? 0,
			surface?.parentElement?.getBoundingClientRect().top ?? 0,
		);
		const scale = root.offsetHeight ? bounds.height / root.offsetHeight : 1;
		// Keep the popup inside the chat surface, accounting for CSS zoom.
		const height = Math.max(44, (bounds.top - surfaceTop) / scale - 8);
		if (menuHeight !== height) setMenuHeight(height);
		const choices = Array.from(
			menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [],
		);
		focusChoice(choices.find((choice) => choice.getAttribute("aria-checked") === "true"));
		typeahead.current = { text: "", at: 0 };
	}, [open, disabled, focusChoice, menuHeight]);

	useEffect(() => {
		if (disabled) setOpen(false);
	}, [disabled]);

	useEffect(() => {
		if (!open) return;
		function outside(event: PointerEvent) {
			if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
		}
		function reposition(event: Event) {
			if (
				event.type === "scroll" &&
				event.target instanceof Node &&
				menuRef.current?.contains(event.target)
			)
				return;
			if (menuRef.current?.contains(document.activeElement))
				triggerRef.current?.focus({ preventScroll: true });
			setOpen(false);
		}
		document.addEventListener("pointerdown", outside);
		window.addEventListener("resize", reposition);
		document.addEventListener("scroll", reposition, true);
		return () => {
			document.removeEventListener("pointerdown", outside);
			window.removeEventListener("resize", reposition);
			document.removeEventListener("scroll", reposition, true);
		};
	}, [open]);

	function handleMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
		const choices = Array.from(
			menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [],
		);
		const current =
			document.activeElement instanceof HTMLButtonElement
				? choices.indexOf(document.activeElement)
				: -1;
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			close();
		} else if (event.key === "Tab") {
			// Start native Tab traversal at the trigger, instead of inside the removed menu.
			close();
		} else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
			event.preventDefault();
			const next =
				event.key === "Home"
					? 0
					: event.key === "End"
						? choices.length - 1
						: (current + (event.key === "ArrowDown" ? 1 : -1) + choices.length) % choices.length;
			focusChoice(choices[next]);
		} else if (
			event.key.length === 1 &&
			event.key !== " " &&
			!event.ctrlKey &&
			!event.metaKey &&
			!event.altKey
		) {
			event.preventDefault();
			const now = Date.now();
			const previous = now - typeahead.current.at < 700 ? typeahead.current.text : "";
			const char = event.key.toLowerCase();
			const text = previous === char ? char : previous + char;
			typeahead.current = { text, at: now };
			const ordered = [...choices.slice(current + 1), ...choices.slice(0, current + 1)];
			focusChoice(
				ordered.find((choice) => choice.getAttribute("aria-label")?.toLowerCase().startsWith(text)),
			);
		}
	}

	return (
		<div
			ref={rootRef}
			data-chat-model-picker
			className="min-w-0 flex-1"
			onBlur={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
			}}
		>
			<button
				ref={triggerRef}
				type="button"
				aria-label="Model"
				aria-describedby={`${menuId}-selection`}
				aria-haspopup="menu"
				aria-expanded={open && !disabled}
				aria-controls={open && !disabled ? menuId : undefined}
				disabled={disabled}
				title={selectedModel?.label ?? selectedId}
				onClick={() => setOpen(!open)}
				onKeyDown={(event) => {
					if (event.key === "ArrowDown" || event.key === "ArrowUp") {
						event.preventDefault();
						setOpen(true);
					}
				}}
				className="flex h-11 max-w-full min-w-11 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground active:bg-accent focus-visible:outline-1 focus-visible:outline-foreground disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
			>
				<span className="min-w-0 truncate">{selectedModel?.label ?? selectedId}</span>
				<ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
			</button>
			<span id={`${menuId}-selection`} className="sr-only">
				{provider === "openai" ? "OpenAI" : "Anthropic"}: {selectedModel?.label ?? selectedId}
			</span>
			{open && !disabled && (
				<div
					ref={menuRef}
					id={menuId}
					role="menu"
					aria-label="Model"
					onKeyDown={handleMenuKeyDown}
					style={{ maxHeight: menuHeight }}
					className="absolute inset-x-0 bottom-full z-50 mb-1 overflow-y-auto overscroll-contain rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
				>
					{PROVIDERS.map((name) => {
						const saved = savedModel(name);
						const models = getModelsForProvider(name);
						const choices = models.some((model) => model.id === saved)
							? models
							: [
									{ id: saved, label: saved, description: "Legacy model · tool use disabled" },
									...models,
								];
						return (
							<fieldset
								key={name}
								aria-label={name === "openai" ? "OpenAI" : "Anthropic"}
								className="py-1 first:pt-0"
							>
								<p className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">
									{name === "openai" ? "OpenAI" : "Anthropic"}
								</p>
								{choices.map((model, index) => {
									const selected = provider === name && selectedId === model.id;
									return (
										<button
											key={`${name}:${model.id}`}
											type="button"
											role="menuitemradio"
											aria-label={model.label}
											aria-describedby={`${menuId}-${name}-${index}`}
											aria-checked={selected}
											title={`${model.label} — ${model.description}`}
											tabIndex={-1}
											onClick={() => selectModel(name, model.id)}
											className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-accent active:bg-accent focus:bg-accent focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-foreground"
										>
											<Check
												className={cn("size-3.5 shrink-0", !selected && "invisible")}
												aria-hidden="true"
											/>
											<span className="min-w-0">
												<span className="line-clamp-2 break-words text-xs">{model.label}</span>
												<span id={`${menuId}-${name}-${index}`} className="sr-only">
													{model.description}
												</span>
											</span>
										</button>
									);
								})}
							</fieldset>
						);
					})}
				</div>
			)}
			{!selectedModel && (
				<div
					role="alert"
					className="px-2 pb-2 text-xs leading-relaxed text-amber-700 dark:text-amber-400"
				>
					<p>
						This saved model is no longer offered. Tool use stays disabled until you choose a
						current model.
					</p>
					<button
						type="button"
						disabled={disabled}
						onClick={() => selectModel(provider, getDefaultModelId(provider))}
						className="mt-1 min-h-11 rounded-md text-left underline underline-offset-2 focus-visible:outline-1 focus-visible:outline-foreground disabled:opacity-50"
					>
						Switch to {getModelById(getDefaultModelId(provider))?.label} (recommended default)
					</button>
				</div>
			)}
		</div>
	);
}
