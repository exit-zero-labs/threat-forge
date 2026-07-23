import { createRetryingTransport } from "@/lib/ai/protocol/retry";
import { isTauri } from "@/lib/platform";
import type { ChatTransport } from "./chat-adapter";

/**
 * Resolve the platform's chat transport, lazily and once.
 *
 * The transport is the only platform-specific piece of the AI stack: the
 * protocol client (`src/lib/ai/protocol/client.ts`) drives it and decodes its
 * frames the same way on both platforms. The browser transport fetches the
 * provider directly with the user's stored key; the desktop transport relays
 * through Rust, which holds the key and owns the endpoint and headers.
 *
 * Both platform transports are wrapped in the retry decorator
 * (`src/lib/ai/protocol/retry.ts`), so a transient `429`, `5xx`, or dropped
 * connection before the first frame is retried identically on both platforms.
 * Retry is a transport concern, not a store one: it must not run after the store
 * has begun rendering a partial turn, and wrapping here keeps the client and
 * store unaware of it.
 */
let cached: ChatTransport | null = null;

export async function getChatTransport(): Promise<ChatTransport> {
	if (cached) return cached;

	let platformTransport: ChatTransport;
	if (isTauri()) {
		const { TauriChatTransport } = await import("./tauri-chat-adapter");
		platformTransport = new TauriChatTransport();
	} else {
		const { BrowserChatTransport } = await import("./browser-chat-adapter");
		platformTransport = new BrowserChatTransport();
	}

	cached = createRetryingTransport(platformTransport);
	return cached;
}
