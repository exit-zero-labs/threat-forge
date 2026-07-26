import { AlertTriangle, Eye, EyeOff, Loader2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getKeychainAdapter } from "@/lib/adapters/get-keychain-adapter";
import { LEGACY_RETAINED } from "@/lib/adapters/keychain-adapter";
import { getDefaultModelId, getModelById, getModelsForProvider } from "@/lib/ai-models";
import { isTauri } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { type AiProvider, useChatStore } from "@/stores/chat-store";
import { useSettingsStore } from "@/stores/settings-store";

/** Authored so a bundler or network detail never reaches the user as an error message. */
const ADAPTER_LOAD_ERROR = "Key storage could not be loaded. Reload the page and try again.";

/**
 * Load the keychain adapter, replacing a module-load failure with an authored message.
 *
 * Adapters author their own user-safe messages; a failure to load one does not, and would
 * otherwise render a bundle URL and a hash as the explanation. The cause is logged rather
 * than dropped, so a real chunk-load regression is still diagnosable from a bug report.
 */
async function loadAdapter(): Promise<Awaited<ReturnType<typeof getKeychainAdapter>>> {
	try {
		return await getKeychainAdapter();
	} catch (err) {
		console.warn("Key storage adapter failed to load:", err);
		throw new Error(ADAPTER_LOAD_ERROR);
	}
}

const PROVIDERS: { value: AiProvider; label: string }[] = [
	{ value: "anthropic", label: "Anthropic (Claude)" },
	{ value: "openai", label: "OpenAI (GPT)" },
];

/**
 * Render a keychain failure for display. Adapters throw different shapes — the browser vault
 * throws an `Error` carrying an authored, user-safe message, while the Tauri adapter rejects
 * with a string from `invoke` — so the message is preferred when there is one.
 */
function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Whether `error` reports a removal that succeeded but left a clear-text copy behind.
 *
 * The browser adapter deletes the stored key and *then* rejects, because it cannot claim the
 * credential is gone while a pre-encryption copy is still readable. The removal did happen,
 * so the panel has to record it and still show the warning. Matched structurally rather than
 * by importing the browser vault, which would pull IndexedDB code into the desktop bundle.
 */
function isRetainedLegacyCopy(error: unknown): boolean {
	if (!(error instanceof Error) || !("reason" in error)) return false;
	return error.reason === LEGACY_RETAINED;
}

/** AI settings form content — used inside the settings dialog. */
export function AiSettingsContent() {
	const provider = useChatStore((s) => s.provider);
	const setProvider = useChatStore((s) => s.setProvider);
	const checkApiKey = useChatStore((s) => s.checkApiKey);
	const settings = useSettingsStore((s) => s.settings);
	const updateSetting = useSettingsStore((s) => s.updateSetting);

	// Providers the user has saved or deleted since mount. A status check that started before
	// one of those lands would report the vault as it was, so its answer is not applied over
	// them — but only over them, so the other provider still gets its status and its faults.
	const mutated = useRef(new Set<AiProvider>());
	const [apiKey, setApiKey] = useState("");
	const [saving, setSaving] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [showKey, setShowKey] = useState(false);
	const [keyStatus, setKeyStatus] = useState<Record<AiProvider, boolean>>({
		anthropic: false,
		openai: false,
	});
	const [message, setMessage] = useState<{
		type: "success" | "error";
		text: string;
	} | null>(null);

	const models = getModelsForProvider(provider);
	const selectedModelId =
		provider === "anthropic" ? settings.aiModelAnthropic : settings.aiModelOpenai;
	const selectedModel = models.find((m) => m.id === selectedModelId);
	// Keep a persisted retired/unknown id visible until the user deliberately replaces it.
	const isLegacyModel = selectedModelId !== "" && selectedModel === undefined;
	const defaultModelId = getDefaultModelId(provider);
	const defaultModelLabel = getModelById(defaultModelId)?.label ?? defaultModelId;

	useEffect(() => {
		let current = true;
		async function checkStatus() {
			try {
				const adapter = await loadAdapter();
				if (!current) return;
				// Settled independently so one provider's failure does not erase the other's
				// status. Unreadable storage rejects for both, and a vault too damaged to migrate
				// rejects for a provider whose pre-encryption key is still waiting to be moved;
				// reporting either as "no API key configured" points the user at entering a key,
				// which is the one thing that will not help.
				const [anthropic, openai] = await Promise.allSettled([
					adapter.hasKey("anthropic"),
					adapter.hasKey("openai"),
				]);
				if (!current) return;
				const answers: [AiProvider, PromiseSettledResult<boolean>][] = [
					["anthropic", anthropic],
					["openai", openai],
				];
				const fresh = answers.filter(([name]) => !mutated.current.has(name));
				setKeyStatus((prev) => {
					const next = { ...prev };
					for (const [name, answer] of fresh) {
						next[name] = answer.status === "fulfilled" && answer.value;
					}
					return next;
				});
				const failure = fresh.find(([, answer]) => answer.status === "rejected")?.[1];
				if (failure?.status === "rejected") {
					setMessage({ type: "error", text: errorText(failure.reason) });
				}
			} catch (err) {
				// Only the adapter load rejects here; `allSettled` never does.
				if (current) setMessage({ type: "error", text: errorText(err) });
			}
		}
		void checkStatus();
		return () => {
			current = false;
		};
	}, []);

	async function handleSave() {
		if (!apiKey.trim()) return;

		setSaving(true);
		setMessage(null);

		try {
			const adapter = await loadAdapter();
			await adapter.setKey(provider, apiKey.trim());
			// Recorded once the write has actually landed, so a save that fails does not leave
			// the mount check discarded and the panel stuck reporting no key at all.
			mutated.current.add(provider);
			setKeyStatus((prev) => ({ ...prev, [provider]: true }));
			setApiKey("");
			setShowKey(false);
			const successText = isTauri()
				? "API key saved securely."
				: "API key encrypted and saved in this browser.";
			setMessage({ type: "success", text: successText });
			await checkApiKey(provider);
		} catch (err) {
			setMessage({ type: "error", text: errorText(err) });
		} finally {
			setSaving(false);
		}
	}

	async function handleDelete() {
		setDeleting(true);
		setMessage(null);

		function recordRemoval() {
			mutated.current.add(provider);
			setKeyStatus((prev) => ({ ...prev, [provider]: false }));
		}

		try {
			const adapter = await loadAdapter();
			await adapter.deleteKey(provider);
			recordRemoval();
			const successText = isTauri() ? "API key removed." : "API key removed from this browser.";
			setMessage({ type: "success", text: successText });
			await checkApiKey(provider);
		} catch (err) {
			// A retained clear-text copy is a warning about residue, not a failed removal: the
			// stored key is gone. Leaving the status alone would show the provider as configured
			// underneath a message saying it was removed, and would let a slow mount check
			// overwrite it with the answer from before the delete.
			if (isRetainedLegacyCopy(err)) {
				recordRemoval();
				await checkApiKey(provider);
			}
			setMessage({ type: "error", text: errorText(err) });
		} finally {
			setDeleting(false);
		}
	}

	function handleModelChange(modelId: string) {
		if (provider === "anthropic") {
			updateSetting("aiModelAnthropic", modelId);
		} else {
			updateSetting("aiModelOpenai", modelId);
		}
	}

	return (
		<div className="space-y-4">
			{/* Provider selector */}
			<div>
				<span className="mb-1 block text-[10px] font-medium text-muted-foreground">Provider</span>
				<select
					aria-label="Provider"
					value={provider}
					onChange={(e) => setProvider(e.target.value as AiProvider)}
					className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
				>
					{PROVIDERS.map((p) => (
						<option key={p.value} value={p.value}>
							{p.label}
						</option>
					))}
				</select>
			</div>

			{/* Model selector */}
			<div>
				<span className="mb-1 block text-[10px] font-medium text-muted-foreground">Model</span>
				<select
					aria-label="Model"
					value={selectedModelId}
					onChange={(e) => handleModelChange(e.target.value)}
					className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
				>
					{isLegacyModel && (
						<option value={selectedModelId}>{selectedModelId} (legacy, unavailable)</option>
					)}
					{models.map((m) => (
						<option key={m.id} value={m.id}>
							{m.label}
						</option>
					))}
				</select>
				{selectedModel?.description && (
					<p className="mt-0.5 text-[10px] text-muted-foreground/70">{selectedModel.description}</p>
				)}
				{isLegacyModel && (
					<div
						role="alert"
						className="mt-1.5 flex items-start gap-1.5 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-600 dark:text-amber-400"
					>
						<AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
						<div className="space-y-1">
							<p>
								"{selectedModelId}" is no longer offered for this provider. Tool use stays disabled
								for it; pick a current model above to restore tool use.
							</p>
							<button
								type="button"
								onClick={() => handleModelChange(defaultModelId)}
								className="font-medium underline underline-offset-2 hover:no-underline"
							>
								Switch to {defaultModelLabel} (recommended default)
							</button>
						</div>
					</div>
				)}
			</div>

			{/* Key status */}
			<div className="flex items-center gap-2">
				<div
					className={cn(
						"h-2 w-2 rounded-full",
						keyStatus[provider] ? "bg-green-500" : "bg-muted-foreground/30",
					)}
				/>
				<span className="text-xs text-muted-foreground">
					{keyStatus[provider] ? "API key configured" : "No API key configured"}
				</span>
			</div>

			{/* API key input */}
			<div>
				<span className="mb-1 block text-[10px] font-medium text-muted-foreground">
					{keyStatus[provider] ? "Replace API Key" : "API Key"}
				</span>
				<div className="flex gap-2">
					<div className="relative flex-1">
						<input
							type={showKey ? "text" : "password"}
							value={apiKey}
							onChange={(e) => setApiKey(e.target.value)}
							placeholder={provider === "anthropic" ? "sk-ant-..." : "sk-..."}
							className="w-full rounded border border-border bg-background px-2 py-1.5 pr-8 text-xs placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
							onKeyDown={(e) => {
								e.stopPropagation();
								if (e.key === "Enter") void handleSave();
							}}
						/>
						<button
							type="button"
							onClick={() => setShowKey(!showKey)}
							className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
							title={showKey ? "Hide API key" : "Show API key"}
						>
							{showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
						</button>
					</div>
					<button
						type="button"
						onClick={() => void handleSave()}
						disabled={!apiKey.trim() || saving}
						className={cn(
							"rounded px-3 py-1.5 text-xs font-medium transition-colors",
							apiKey.trim()
								? "bg-primary text-primary-foreground hover:bg-primary/90"
								: "cursor-not-allowed bg-muted text-muted-foreground",
						)}
					>
						{saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
					</button>
				</div>
			</div>

			{/* Delete button */}
			{keyStatus[provider] && (
				<button
					type="button"
					onClick={() => void handleDelete()}
					disabled={deleting}
					className="flex items-center gap-1 rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10 transition-colors"
				>
					{deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
					Remove API key
				</button>
			)}

			{/* Status message */}
			{message && (
				<div
					className={cn(
						"rounded px-2 py-1.5 text-xs",
						message.type === "success"
							? "bg-green-500/10 text-green-500"
							: "bg-destructive/10 text-destructive",
					)}
				>
					{message.text}
				</div>
			)}

			{/* Security note */}
			<p className="text-[10px] text-muted-foreground/70">
				{isTauri()
					? "API keys are encrypted at rest and stored locally. They are never sent anywhere except the selected AI provider."
					: "API keys are encrypted before being stored in this browser, using a key the browser will not export. Anything running on this page can still use the key. The desktop app keeps the key outside the browser entirely. Keys are only sent to the selected AI provider."}
			</p>
		</div>
	);
}
