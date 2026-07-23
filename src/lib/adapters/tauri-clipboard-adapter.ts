import { writeText } from "@tauri-apps/plugin-clipboard-manager";

export async function writeTextToTauriClipboard(text: string): Promise<void> {
	await writeText(text);
}
