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
 */
let cached: ChatTransport | null = null;

export async function getChatTransport(): Promise<ChatTransport> {
	if (cached) return cached;

	if (isTauri()) {
		const { TauriChatTransport } = await import("./tauri-chat-adapter");
		cached = new TauriChatTransport();
	} else {
		const { BrowserChatTransport } = await import("./browser-chat-adapter");
		cached = new BrowserChatTransport();
	}

	return cached;
}
