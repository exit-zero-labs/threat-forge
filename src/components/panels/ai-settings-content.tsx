import { AlertTriangle, Eye, EyeOff, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getKeychainAdapter } from "@/lib/adapters/get-keychain-adapter";
import {
	CLEARING_SITE_DATA_COST,
	LEGACY_RETAINED,
	type LegacyResidue,
} from "@/lib/adapters/keychain-adapter";
import { getDefaultModelId, getModelById, getModelsForProvider } from "@/lib/ai-models";
import { isTauri } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { type AiProvider, useChatStore } from "@/stores/chat-store";
import { useKeyResidueStore } from "@/stores/key-residue-store";
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

/**
 * The providers this panel offers, and the company each key belongs to.
 *
 * `vendor` is deliberately not the selector label: "revoke the key with Anthropic (Claude)"
 * would name a model family the user cannot revoke anything with. Both live on one entry so
 * adding a provider is one edit rather than two structures that can drift apart.
 */
const PROVIDERS: { value: AiProvider; label: string; vendor: string }[] = [
	{ value: "anthropic", label: "Anthropic (Claude)", vendor: "Anthropic" },
	{ value: "openai", label: "OpenAI (GPT)", vendor: "OpenAI" },
];

/**
 * What the panel knows about a provider's stored key.
 *
 * Neither non-boolean member is the same as `false`. `"unknown"` is a `hasKey` that rejected —
 * an unreadable vault, a record that will not decrypt — which used to be collapsed into "no API
 * key configured", reassurance in exactly the wrong direction. `"unchecked"` is the seed value
 * before the mount check has answered at all, which used to be `false` for the same reason
 * `useState` needs something: it made the panel assert that the encrypted record was gone during
 * every mount, over a vault that may well hold a key.
 */
type KeyStatus = boolean | "unknown" | "unchecked";

/**
 * How the status row reads a provider's storage, in precedence order.
 *
 * A readable clear-text copy is never reported as "no API key configured": the encrypted record
 * is gone, but a usable credential is still in this browser. Neither a check that failed nor one
 * that has not answered yet is reported that way either — that sentence is a claim about storage
 * that answered.
 */
type StatusTone = "configured" | "retained" | "unknown" | "checking" | "empty";

function statusToneOf(status: KeyStatus, residue: LegacyResidue): StatusTone {
	if (status === true) return "configured";
	if (residue === "retained") return "retained";
	if (status === "unknown") return "unknown";
	if (status === "unchecked") return "checking";
	return "empty";
}

const STATUS_TEXT: Record<StatusTone, string> = {
	configured: "API key configured",
	retained: "Clear-text API key still in this browser",
	unknown: "Key storage could not be checked",
	checking: "Checking key storage…",
	empty: "No API key configured",
};

const STATUS_DOT_CLASS: Record<StatusTone, string> = {
	configured: "bg-green-500",
	retained: "bg-destructive",
	unknown: "bg-amber-500",
	checking: "bg-muted-foreground/30",
	empty: "bg-muted-foreground/30",
};

const STATUS_TEXT_CLASS: Record<StatusTone, string> = {
	configured: "text-muted-foreground",
	retained: "text-destructive",
	unknown: "text-amber-600 dark:text-amber-400",
	checking: "text-muted-foreground",
	empty: "text-muted-foreground",
};

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

/**
 * What a retry that changed nothing says, once (#233).
 *
 * `deleteKey` used to author this: the destructive retry it backed reported through its own
 * rejection that the browser still would not erase the slot. The retry is a re-read now, which
 * succeeds either way, so the panel has to make that report itself — otherwise clicking the
 * control leaves the identical notice on screen and no evidence that anything happened. The
 * "removed from encrypted storage" clause of the adapter's wording is deliberately dropped: a
 * re-read removes nothing, and repeating it here would be a claim about a write that never ran.
 *
 * Both readings report, because both are outcomes a user just asked for. `unverified` is the
 * one that is permanent on a blocked-storage profile, so leaving it silent made the only
 * control the panel offers do visibly nothing, forever. Its wording claims no removal and no
 * absence: `migrateLegacyKey` returns before it touches the slot when the read is refused, so
 * nothing was attempted and nothing is known either way.
 *
 * Neither reading repeats the remedy or its cost. This report is only ever set while `residue`
 * is non-null, which is the same condition that renders the notice directly above it — so the
 * remedy and the site-data cost are already on screen, and saying them again put the same
 * sentence twice within a few lines.
 */
function retryReportText(residue: Exclude<LegacyResidue, null>, vendor: string): string {
	return residue === "retained"
		? `This browser still would not delete the older clear-text ${vendor} API key.`
		: `This browser still blocked the check for an older clear-text ${vendor} API key. Nothing was removed, and whether a copy is there is still unknown.`;
}

/**
 * The standing notice for a pre-encryption clear-text key that is still in this browser (#233).
 *
 * `deleteKey` already reports the condition once, through `message`, and that report is cleared
 * by the next action and lost when the dialog closes. This block is the version that stays for
 * as long as the slot is readable, so a user who revoked a possibly-compromised key and missed
 * the one-shot banner is still told the credential is sitting in clear text.
 *
 * The two states are told apart by heading, wording, and colour rather than colour alone:
 * `retained` asserts a readable copy exists, `unverified` only says the check was refused.
 *
 * It carries its own action, bound to its own provider, because the notice renders for whichever
 * provider has residue rather than only the selected one — the status bar escalates any
 * provider's, so routing here has to lead somewhere that can act on it.
 *
 * That action only ever re-reads; nothing in this notice can reach `deleteKey`. See
 * `handleRecheck` for why a destructive retry here was unsafe and bought nothing.
 */
function ClearTextKeyNotice({
	residue,
	provider,
	vendor,
	busy,
	onRecheck,
}: {
	residue: Exclude<LegacyResidue, null>;
	provider: AiProvider;
	vendor: string;
	busy: boolean;
	onRecheck: () => void;
}) {
	return (
		<div
			role="alert"
			data-testid={`clear-text-key-notice-${provider}`}
			className={cn(
				"flex items-start gap-1.5 rounded border px-2 py-1.5 text-[10px]",
				residue === "retained"
					? "border-destructive/40 bg-destructive/10 text-destructive"
					: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
			)}
		>
			<AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
			<div className="space-y-1">
				{residue === "retained" ? (
					<>
						<p className="font-medium">
							A clear-text {vendor} API key is still stored in this browser.
						</p>
						<p>
							It was saved before ThreatForge encrypted keys, and ThreatForge has not been able to
							delete it. Anything that can read this site's storage can read the key. Clear this
							site's browser data to remove it, and revoke the key with {vendor} if it may have been
							exposed.
						</p>
						<p>{CLEARING_SITE_DATA_COST}</p>
						<p>This copy is not a backup — ThreatForge erases it as soon as the browser allows.</p>
					</>
				) : (
					<>
						<p className="font-medium">
							ThreatForge could not check for an older clear-text {vendor} API key.
						</p>
						<p>
							This browser blocked the check, so an unencrypted copy saved by an older version may
							or may not still be there. If you used ThreatForge in this browser before keys were
							encrypted, clear this site's browser data to be sure.
						</p>
						<p>{CLEARING_SITE_DATA_COST}</p>
					</>
				)}
				<button
					type="button"
					onClick={onRecheck}
					disabled={busy}
					className="flex items-center gap-1 rounded font-medium underline underline-offset-2 hover:no-underline disabled:no-underline disabled:opacity-60"
				>
					{busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
					{/* Only the `retained` reading has ever had a removal attempted on it. When the read
					    itself was refused, `migrateLegacyKey` returns before it touches the slot, so
					    neither "removing" nor "again" would be true. */}
					{residue === "retained" ? "Try removing it again" : "Check again"}
				</button>
			</div>
		</div>
	);
}

/** AI settings form content — used inside the settings dialog. */
export function AiSettingsContent() {
	const provider = useChatStore((s) => s.provider);
	const setProvider = useChatStore((s) => s.setProvider);
	const checkApiKey = useChatStore((s) => s.checkApiKey);
	const settings = useSettingsStore((s) => s.settings);
	const updateSetting = useSettingsStore((s) => s.updateSetting);
	// Residue lives in a store rather than in this component because the panel unmounts with
	// the settings dialog, and a warning that dies with the dialog is the bug (#233).
	const residue = useKeyResidueStore((s) => s.residue);
	const refreshResidue = useKeyResidueStore((s) => s.refreshResidue);
	const refreshAllResidue = useKeyResidueStore((s) => s.refreshAllResidue);

	// Providers the user has saved or deleted since mount. A status check that started before
	// one of those lands would report the vault as it was, so its answer is not applied over
	// them — but only over them, so the other provider still gets its status and its faults.
	const mutated = useRef(new Set<AiProvider>());
	const [apiKey, setApiKey] = useState("");
	const [saving, setSaving] = useState(false);
	// A set rather than one slot: a residue notice renders for a provider that is not the
	// selected one and each carries its own control, so two removals or rechecks can genuinely
	// be in flight at once. With a single slot the first one to finish cleared the flag, which
	// stopped the other's spinner and re-enabled its button mid-operation.
	const [busyProviders, setBusyProviders] = useState<ReadonlySet<AiProvider>>(new Set());
	const [showKey, setShowKey] = useState(false);
	const [keyStatus, setKeyStatus] = useState<Record<AiProvider, KeyStatus>>({
		anthropic: "unchecked",
		openai: "unchecked",
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
	const providerResidue = residue[provider];
	const statusTone = statusToneOf(keyStatus[provider], providerResidue);

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
				// Read after the status checks, never before: `hasKey` runs the legacy migration,
				// which retries the erase, so a residue read that went first would warn about a
				// slot this same mount was in the middle of removing. Not gated on `current` —
				// the answer belongs to a store that outlives this panel.
				void refreshAllResidue();
				if (!current) return;
				const answers: [AiProvider, PromiseSettledResult<boolean>][] = [
					["anthropic", anthropic],
					["openai", openai],
				];
				const fresh = answers.filter(([name]) => !mutated.current.has(name));
				setKeyStatus((prev) => {
					const next = { ...prev };
					for (const [name, answer] of fresh) {
						// A rejected check is recorded as `"unknown"`, not `false`. "No API key
						// configured" is a claim about storage that answered, and reporting an
						// unreadable vault that way points the user at entering a key — the one
						// action that cannot help — and would let a destructive control render
						// over a record nobody has read.
						next[name] = answer.status === "fulfilled" ? answer.value : "unknown";
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
	}, [refreshAllResidue]);

	function setBusy(target: AiProvider, busy: boolean) {
		setBusyProviders((prev) => {
			const next = new Set(prev);
			if (busy) next.add(target);
			else next.delete(target);
			return next;
		});
	}

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
			// `setKey` attempts the clear-text erase and deliberately ignores the outcome, so a
			// save can clear residue or — on a browser that refuses removal — leave it standing.
			// Re-read either way, including after a failure, rather than assuming.
			await refreshResidue(provider);
		}
	}

	async function handleDelete(target: AiProvider) {
		setBusy(target, true);
		setMessage(null);

		function recordRemoval() {
			mutated.current.add(target);
			setKeyStatus((prev) => ({ ...prev, [target]: false }));
		}

		// The chat transport tracks the *selected* provider's key, so a removal for another
		// provider — reachable from that provider's residue notice — leaves it untouched.
		async function syncTransport() {
			if (target === provider) await checkApiKey(provider);
		}

		try {
			const adapter = await loadAdapter();
			await adapter.deleteKey(target);
			recordRemoval();
			const successText = isTauri() ? "API key removed." : "API key removed from this browser.";
			setMessage({ type: "success", text: successText });
			await syncTransport();
		} catch (err) {
			// A retained clear-text copy is a warning about residue, not a failed removal: the
			// stored key is gone. Leaving the status alone would show the provider as configured
			// underneath a message saying it was removed, and would let a slow mount check
			// overwrite it with the answer from before the delete.
			if (isRetainedLegacyCopy(err)) {
				recordRemoval();
				await syncTransport();
			}
			setMessage({ type: "error", text: errorText(err) });
		} finally {
			setBusy(target, false);
			// The state transition this issue is about. Covers the retained rejection, a clean
			// removal, and a vault error thrown after the slot had already been erased.
			await refreshResidue(target);
		}
	}

	/**
	 * Re-read a provider's stored key and clear-text slot, and report what is still there.
	 *
	 * This is the only thing a residue notice ever does. It must not call `deleteKey`, which
	 * commits a permanent revocation marker: the notice renders from a snapshot that cannot rule
	 * out a key saved in another tab, or one saved before the mount check answered. `hasKey` is
	 * what runs the legacy migration, which retries the erase, so on a browser that has started
	 * allowing removals this is also what actually clears the slot — and where it has not, the
	 * retirement marker `deleteKey` already wrote means nothing can re-import the slot either.
	 *
	 * Residue is read after `hasKey` for the same reason the mount check reads it last, and a
	 * reading that survives is reported here because `deleteKey` used to be what said it.
	 */
	async function handleRecheck(target: AiProvider, vendor: string) {
		setBusy(target, true);
		setMessage(null);
		let reported = false;
		try {
			const adapter = await loadAdapter();
			const present = await adapter.hasKey(target);
			// This answer is newer than any mount check still in flight, so it outranks it.
			mutated.current.add(target);
			setKeyStatus((prev) => ({ ...prev, [target]: present }));
			if (target === provider) await checkApiKey(provider);
		} catch (err) {
			setKeyStatus((prev) => ({ ...prev, [target]: "unknown" }));
			setMessage({ type: "error", text: errorText(err) });
			reported = true;
		} finally {
			setBusy(target, false);
			await refreshResidue(target);
			// Read from the store rather than the render snapshot, which predates the refresh.
			// A retry that changed nothing has to say so: the standing notice looks identical
			// before and after, so without this the click has no outcome the user can see.
			const reading = useKeyResidueStore.getState().residue[target];
			if (!reported && reading !== null) {
				setMessage({ type: "error", text: retryReportText(reading, vendor) });
			}
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
			<div className="space-y-1.5">
				<div className="flex items-center gap-2">
					<div className={cn("h-2 w-2 rounded-full", STATUS_DOT_CLASS[statusTone])} />
					<span className={cn("text-xs", STATUS_TEXT_CLASS[statusTone])}>
						{STATUS_TEXT[statusTone]}
					</span>
				</div>

				{/* Every provider with residue, not only the selected one: the status bar escalates
				    any provider's retained slot, and routing a user here to a panel that shows
				    nothing would restore the contradiction this issue exists to remove. */}
				{PROVIDERS.map(({ value, vendor }) => {
					const noticeResidue = residue[value];
					if (noticeResidue === null) return null;
					return (
						<ClearTextKeyNotice
							key={value}
							residue={noticeResidue}
							provider={value}
							vendor={vendor}
							busy={busyProviders.has(value)}
							onRecheck={() => void handleRecheck(value, vendor)}
						/>
					);
				})}
			</div>

			{/* API key input */}
			<div>
				<span className="mb-1 block text-[10px] font-medium text-muted-foreground">
					{keyStatus[provider] === true ? "Replace API Key" : "API Key"}
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

			{/* Removal. Rendered only where a stored key is known to be there: `deleteKey` commits
			    a permanent revocation marker, so it must never be what a user reaches for when
			    the panel could not read storage, or has not read it yet. */}
			{keyStatus[provider] === true && (
				<button
					type="button"
					onClick={() => void handleDelete(provider)}
					disabled={busyProviders.has(provider)}
					className="flex items-center gap-1 rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10 transition-colors"
				>
					{busyProviders.has(provider) ? (
						<Loader2 className="h-3 w-3 animate-spin" />
					) : (
						<Trash2 className="h-3 w-3" />
					)}
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
