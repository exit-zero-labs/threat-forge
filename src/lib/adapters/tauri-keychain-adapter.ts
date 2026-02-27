import { invoke } from "@tauri-apps/api/core";
import type { AiProvider } from "@/stores/chat-store";
import type { KeychainAdapter } from "./keychain-adapter";

export class TauriKeychainAdapter implements KeychainAdapter {
	async setKey(provider: AiProvider, key: string): Promise<void> {
		await invoke("set_api_key", { provider, key });
	}

	async hasKey(provider: AiProvider): Promise<boolean> {
		return invoke<boolean>("get_api_key_status", { provider });
	}

	async getKey(provider: AiProvider): Promise<string | null> {
		try {
			return await invoke<string>("get_api_key", { provider });
		} catch {
			return null;
		}
	}

	async deleteKey(provider: AiProvider): Promise<void> {
		await invoke("delete_api_key", { provider });
	}
}
