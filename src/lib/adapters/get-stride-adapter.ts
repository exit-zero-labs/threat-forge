import { isTauri } from "@/lib/platform";
import type { StrideAdapter } from "./stride-adapter";

let cached: StrideAdapter | null = null;

export async function getStrideAdapter(): Promise<StrideAdapter> {
	if (cached) return cached;

	if (isTauri()) {
		const { TauriStrideAdapter } = await import("./tauri-stride-adapter");
		cached = new TauriStrideAdapter();
	} else {
		const { BrowserStrideAdapter } = await import("./browser-stride-adapter");
		cached = new BrowserStrideAdapter();
	}

	return cached;
}
