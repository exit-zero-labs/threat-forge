import { isTauri } from "@/lib/platform";
import type { ChatAdapter } from "./chat-adapter";

let cached: ChatAdapter | null = null;

export async function getChatAdapter(): Promise<ChatAdapter> {
	if (cached) return cached;

	if (isTauri()) {
		const { TauriChatAdapter } = await import("./tauri-chat-adapter");
		cached = new TauriChatAdapter();
	} else {
		const { BrowserChatAdapter } = await import("./browser-chat-adapter");
		cached = new BrowserChatAdapter();
	}

	return cached;
}
