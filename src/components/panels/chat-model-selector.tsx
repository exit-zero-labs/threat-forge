import { getDefaultModelId, getModelById, getModelsForProvider } from "@/lib/ai-models";
import { type AiProvider, useChatStore } from "@/stores/chat-store";
import { useSettingsStore } from "@/stores/settings-store";

const PROVIDERS = ["openai", "anthropic"] as const;

/** Select the model and its provider for subsequent turns, keeping saved legacy IDs visible. */
export function ChatModelSelector({ disabled }: { disabled: boolean }) {
	const provider = useChatStore((s) => s.provider);
	const setProvider = useChatStore((s) => s.setProvider);
	const settings = useSettingsStore((s) => s.settings);
	const updateSetting = useSettingsStore((s) => s.updateSetting);
	const savedModel = (name: AiProvider) =>
		(name === "anthropic" ? settings.aiModelAnthropic : settings.aiModelOpenai) ||
		getDefaultModelId(name);
	const selectedId = savedModel(provider);
	const selectedModel = getModelsForProvider(provider).find((model) => model.id === selectedId);

	function selectModel(choice: string) {
		if (disabled) return;
		for (const target of PROVIDERS) {
			const model = getModelsForProvider(target).find(
				(model) => `${target}:${model.id}` === choice,
			);
			if (!model && choice !== `${target}:${savedModel(target)}`) continue;
			// Saved legacy choices remain selectable, but arbitrary IDs never enter settings.
			if (model)
				updateSetting(target === "anthropic" ? "aiModelAnthropic" : "aiModelOpenai", model.id);
			setProvider(target);
			return;
		}
	}

	return (
		<div className="mb-3 shrink-0 space-y-1">
			<label htmlFor="chat-model" className="block text-xs text-muted-foreground">
				Model
			</label>
			<select
				id="chat-model"
				value={`${provider}:${selectedId}`}
				disabled={disabled}
				onChange={(event) => selectModel(event.target.value)}
				className="w-full min-w-0 rounded-md border border-border bg-background px-2 py-1.5 text-xs focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
			>
				{PROVIDERS.map((name) => {
					const models = getModelsForProvider(name);
					const saved = savedModel(name);
					const legacy = !models.some((model) => model.id === saved);
					return (
						<optgroup key={name} label={name === "openai" ? "OpenAI" : "Anthropic"}>
							{legacy && <option value={`${name}:${saved}`}>{saved} (legacy, unavailable)</option>}
							{models.map((model) => (
								<option key={model.id} value={`${name}:${model.id}`}>
									{model.label}
								</option>
							))}
						</optgroup>
					);
				})}
			</select>
			{selectedModel && (
				<p className="text-xs text-muted-foreground">{selectedModel.description}</p>
			)}
			{!selectedModel && (
				<div role="alert" className="break-words text-xs text-amber-700 dark:text-amber-400">
					<p>
						"{selectedId}" is no longer offered for this provider. Tool use stays disabled for it;
						pick a current model above to restore tool use.
					</p>
					<button
						type="button"
						disabled={disabled}
						onClick={() => selectModel(`${provider}:${getDefaultModelId(provider)}`)}
						className="mt-1 rounded underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
					>
						Switch to {getModelById(getDefaultModelId(provider))?.label} (recommended default)
					</button>
				</div>
			)}
		</div>
	);
}
