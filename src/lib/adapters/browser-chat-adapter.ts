import { getKeychainAdapter } from "@/lib/adapters/get-keychain-adapter";
import { buildSystemPrompt } from "@/lib/ai-prompt";
import type { AiProvider, ChatMessage } from "@/stores/chat-store";
import type { ThreatModel } from "@/types/threat-model";
import type { ChatAdapter, ChatStreamCallbacks } from "./chat-adapter";

/**
 * Browser chat adapter — direct fetch() to LLM APIs with SSE streaming.
 *
 * Anthropic requires `anthropic-dangerous-direct-browser-access: true` header
 * for direct browser calls without a proxy.
 */
export class BrowserChatAdapter implements ChatAdapter {
	async sendMessage(
		provider: AiProvider,
		messages: ChatMessage[],
		model: ThreatModel,
		callbacks: ChatStreamCallbacks,
	): Promise<void> {
		const keychainAdapter = await getKeychainAdapter();
		const apiKey = await keychainAdapter.getKey(provider);
		if (!apiKey) {
			throw new Error(`No API key configured for ${provider}. Open AI Settings to add one.`);
		}

		const systemPrompt = buildSystemPrompt(model);

		if (provider === "anthropic") {
			await streamAnthropic(apiKey, systemPrompt, messages, callbacks);
		} else {
			await streamOpenAI(apiKey, systemPrompt, messages, callbacks);
		}
	}
}

async function streamAnthropic(
	apiKey: string,
	systemPrompt: string,
	messages: ChatMessage[],
	callbacks: ChatStreamCallbacks,
): Promise<void> {
	const response = await fetch("https://api.anthropic.com/v1/messages", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": apiKey,
			"anthropic-version": "2023-06-01",
			"anthropic-dangerous-direct-browser-access": "true",
		},
		body: JSON.stringify({
			model: "claude-sonnet-4-20250514",
			max_tokens: 4096,
			system: systemPrompt,
			messages: messages.map((m) => ({ role: m.role, content: m.content })),
			stream: true,
		}),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
	}

	await parseSSEStream(response, (event, data) => {
		if (event === "content_block_delta") {
			const parsed = JSON.parse(data) as { delta?: { text?: string } };
			if (parsed.delta?.text) {
				callbacks.onChunk(parsed.delta.text);
			}
		} else if (event === "message_stop") {
			callbacks.onDone();
		} else if (event === "error") {
			const parsed = JSON.parse(data) as { error?: { message?: string } };
			callbacks.onError(parsed.error?.message ?? "Unknown Anthropic error");
		}
	});
}

async function streamOpenAI(
	apiKey: string,
	systemPrompt: string,
	messages: ChatMessage[],
	callbacks: ChatStreamCallbacks,
): Promise<void> {
	const response = await fetch("https://api.openai.com/v1/chat/completions", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			model: "gpt-4o",
			messages: [
				{ role: "system", content: systemPrompt },
				...messages.map((m) => ({ role: m.role, content: m.content })),
			],
			stream: true,
		}),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
	}

	await parseSSEStream(response, (_event, data) => {
		if (data === "[DONE]") {
			callbacks.onDone();
			return;
		}

		try {
			const parsed = JSON.parse(data) as {
				choices?: Array<{ delta?: { content?: string } }>;
			};
			const content = parsed.choices?.[0]?.delta?.content;
			if (content) {
				callbacks.onChunk(content);
			}
		} catch {
			// Skip unparseable lines
		}
	});
}

async function parseSSEStream(
	response: Response,
	onEvent: (event: string, data: string) => void,
): Promise<void> {
	const reader = response.body?.getReader();
	if (!reader) throw new Error("No response body");

	const decoder = new TextDecoder();
	let buffer = "";
	let currentEvent = "message";

	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;

		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split("\n");
		// Keep the last potentially incomplete line in the buffer
		buffer = lines.pop() ?? "";

		for (const line of lines) {
			if (line.startsWith("event: ")) {
				currentEvent = line.slice(7).trim();
			} else if (line.startsWith("data: ")) {
				const data = line.slice(6);
				onEvent(currentEvent, data);
				currentEvent = "message";
			}
			// Skip empty lines and comments
		}
	}
}
