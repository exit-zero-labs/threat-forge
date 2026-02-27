import { KeyRound, Loader2, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { getKeychainAdapter } from "@/lib/adapters/get-keychain-adapter";
import { isTauri } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { type AiProvider, useChatStore } from "@/stores/chat-store";

const PROVIDERS: { value: AiProvider; label: string }[] = [
	{ value: "anthropic", label: "Anthropic (Claude)" },
	{ value: "openai", label: "OpenAI (GPT)" },
];

export function AiSettingsDialog({ onClose }: { onClose: () => void }) {
	const provider = useChatStore((s) => s.provider);
	const setProvider = useChatStore((s) => s.setProvider);
	const checkApiKey = useChatStore((s) => s.checkApiKey);

	const [apiKey, setApiKey] = useState("");
	const [saving, setSaving] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [keyStatus, setKeyStatus] = useState<Record<AiProvider, boolean>>({
		anthropic: false,
		openai: false,
	});
	const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

	// Check key status on mount
	useEffect(() => {
		async function checkStatus() {
			try {
				const adapter = await getKeychainAdapter();
				const anthropicStatus = await adapter.hasKey("anthropic");
				const openaiStatus = await adapter.hasKey("openai");
				setKeyStatus({ anthropic: anthropicStatus, openai: openaiStatus });
			} catch {
				// Ignore errors — show as unconfigured
			}
		}
		void checkStatus();
	}, []);

	async function handleSave() {
		if (!apiKey.trim()) return;

		setSaving(true);
		setMessage(null);

		try {
			const adapter = await getKeychainAdapter();
			await adapter.setKey(provider, apiKey.trim());
			setKeyStatus((prev) => ({ ...prev, [provider]: true }));
			setApiKey("");
			const successText = isTauri()
				? "API key saved securely to OS keychain."
				: "API key saved to browser storage.";
			setMessage({ type: "success", text: successText });
			await checkApiKey(provider);
		} catch (err) {
			setMessage({ type: "error", text: String(err) });
		} finally {
			setSaving(false);
		}
	}

	async function handleDelete() {
		setDeleting(true);
		setMessage(null);

		try {
			const adapter = await getKeychainAdapter();
			await adapter.deleteKey(provider);
			setKeyStatus((prev) => ({ ...prev, [provider]: false }));
			const successText = isTauri()
				? "API key removed from keychain."
				: "API key removed from browser storage.";
			setMessage({ type: "success", text: successText });
			await checkApiKey(provider);
		} catch (err) {
			setMessage({ type: "error", text: String(err) });
		} finally {
			setDeleting(false);
		}
	}

	function handleKeyDown(e: React.KeyboardEvent) {
		if (e.key === "Escape") {
			onClose();
		}
	}

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: overlay click to close is a convenience, not the primary interaction
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div
				className="w-full max-w-md rounded-lg border border-border bg-background p-4 shadow-lg"
				onKeyDown={handleKeyDown}
			>
				{/* Header */}
				<div className="mb-4 flex items-center justify-between">
					<div className="flex items-center gap-2">
						<KeyRound className="h-4 w-4 text-muted-foreground" />
						<h2 className="text-sm font-medium">AI Settings</h2>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
					>
						<X className="h-4 w-4" />
					</button>
				</div>

				{/* Provider selector */}
				<div className="mb-3">
					<span className="mb-1 block text-[10px] font-medium text-muted-foreground">Provider</span>
					<select
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

				{/* Key status */}
				<div className="mb-3 flex items-center gap-2">
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
				<div className="mb-3">
					<span className="mb-1 block text-[10px] font-medium text-muted-foreground">
						{keyStatus[provider] ? "Replace API Key" : "API Key"}
					</span>
					<div className="flex gap-2">
						<input
							type="password"
							value={apiKey}
							onChange={(e) => setApiKey(e.target.value)}
							placeholder={provider === "anthropic" ? "sk-ant-..." : "sk-..."}
							className="flex-1 rounded border border-border bg-background px-2 py-1.5 text-xs placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
							onKeyDown={(e) => {
								if (e.key === "Enter") void handleSave();
							}}
						/>
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
						{deleting ? (
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
							"mt-3 rounded px-2 py-1.5 text-xs",
							message.type === "success"
								? "bg-green-500/10 text-green-500"
								: "bg-destructive/10 text-destructive",
						)}
					>
						{message.text}
					</div>
				)}

				{/* Security note */}
				<p className="mt-3 text-[10px] text-muted-foreground/70">
					{isTauri()
						? "API keys are stored securely in your operating system's keychain. They are never written to files or sent anywhere except the selected AI provider."
						: "API keys are stored in your browser's localStorage. For stronger security, use the desktop app which stores keys in your OS keychain. Keys are only sent to the selected AI provider."}
				</p>
			</div>
		</div>
	);
}
