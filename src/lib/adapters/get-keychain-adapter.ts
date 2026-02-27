import { isTauri } from "@/lib/platform";
import type { KeychainAdapter } from "./keychain-adapter";

let cached: KeychainAdapter | null = null;

export async function getKeychainAdapter(): Promise<KeychainAdapter> {
	if (cached) return cached;

	if (isTauri()) {
		const { TauriKeychainAdapter } = await import("./tauri-keychain-adapter");
		cached = new TauriKeychainAdapter();
	} else {
		const { BrowserKeychainAdapter } = await import("./browser-keychain-adapter");
		cached = new BrowserKeychainAdapter();
	}

	return cached;
}
