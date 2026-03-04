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
		modelId: string,
		signal?: AbortSignal,
	): Promise<void> {
		const unlisteners: (() => void)[] = [];

		// Listen for abort signal to cancel the stream on the Rust side
		const onAbort = () => {
			void invoke("cancel_chat_stream").catch(() => {});
		};
		if (signal) {
			signal.addEventListener("abort", onAbort, { once: true });
		}

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
				modelId,
			});

			await donePromise;

			if (!signal?.aborted) {
				callbacks.onDone();
			}
		} catch (err) {
			// Don't treat abort as an error
			if (signal?.aborted) return;
			const errorMessage = err instanceof Error ? err.message : String(err);
			callbacks.onError(errorMessage);
			throw err;
		} finally {
			if (signal) {
				signal.removeEventListener("abort", onAbort);
			}
			for (const unlisten of unlisteners) {
				unlisten();
			}
		}
	}
}
