import { isTauri } from "@/lib/platform";
import type { FileAdapter } from "./file-adapter";

let cached: FileAdapter | null = null;

export async function getFileAdapter(): Promise<FileAdapter> {
	if (cached) return cached;

	if (isTauri()) {
		const { TauriFileAdapter } = await import("./tauri-file-adapter");
		cached = new TauriFileAdapter();
	} else {
		const { BrowserFileAdapter } = await import("./browser-file-adapter");
		cached = new BrowserFileAdapter();
	}

	return cached;
}
