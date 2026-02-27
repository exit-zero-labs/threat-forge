import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AiProvider, ChatMessage } from "@/stores/chat-store";
import type { ThreatModel } from "@/types/threat-model";
import type { ChatAdapter, ChatStreamCallbacks } from "./chat-adapter";

export class TauriChatAdapter implements ChatAdapter {
	async sendMessage(
		provider: AiProvider,
		messages: ChatMessage[],
		model: ThreatModel,
		callbacks: ChatStreamCallbacks,
	): Promise<void> {
		const unlisteners: (() => void)[] = [];

		try {
			const unlisten1 = await listen<{ text: string }>("ai:stream-chunk", (event) => {
				callbacks.onChunk(event.payload.text);
			});
			unlisteners.push(unlisten1);

			const donePromise = new Promise<void>((resolve, reject) => {
				listen("ai:stream-done", () => {
					resolve();
				}).then((unlisten) => unlisteners.push(unlisten));

				listen<{ error: string }>("ai:stream-error", (event) => {
					reject(new Error(event.payload.error));
				}).then((unlisten) => unlisteners.push(unlisten));
			});

			const ipcMessages = messages.map((m) => ({
				role: m.role,
				content: m.content,
			}));

			await invoke("send_chat_message", {
				provider,
				messages: ipcMessages,
				model,
			});

			await donePromise;
			callbacks.onDone();
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			callbacks.onError(errorMessage);
			throw err;
		} finally {
			for (const unlisten of unlisteners) {
				unlisten();
			}
		}
	}
}
