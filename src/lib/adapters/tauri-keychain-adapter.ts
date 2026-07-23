import { invoke } from "@tauri-apps/api/core";
import type { AiProvider } from "@/stores/chat-store";
import type { KeychainAdapter } from "./keychain-adapter";

/**
 * Desktop API key storage over the encrypted `KeyStorage` commands.
 *
 * There is no key-reading method: the stored key is used only inside Rust, by
 * `auth_headers` in `src-tauri/src/ai/providers.rs`, and no command exposes it.
 * An earlier `getKey` here invoked a `get_api_key` command that has never been
 * registered and turned the resulting error into `null`, which made the
 * boundary look like a lookup that always missed rather than a capability that
 * does not exist.
 */
export class TauriKeychainAdapter implements KeychainAdapter {
	async setKey(provider: AiProvider, key: string): Promise<void> {
		await invoke("set_api_key", { provider, key });
	}

	async hasKey(provider: AiProvider): Promise<boolean> {
		return invoke<boolean>("get_api_key_status", { provider });
	}

	async deleteKey(provider: AiProvider): Promise<void> {
		await invoke("delete_api_key", { provider });
	}
}
