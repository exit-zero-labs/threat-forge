import { invoke } from "@tauri-apps/api/core";
import type { Threat, ThreatModel } from "@/types/threat-model";
import type { StrideAdapter } from "./stride-adapter";

export class TauriStrideAdapter implements StrideAdapter {
	async analyze(model: ThreatModel): Promise<Threat[]> {
		return invoke<Threat[]>("analyze_stride", { model });
	}
}
