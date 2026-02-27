import { analyzeStride } from "@/lib/stride-engine";
import type { Threat, ThreatModel } from "@/types/threat-model";
import type { StrideAdapter } from "./stride-adapter";

export class BrowserStrideAdapter implements StrideAdapter {
	async analyze(model: ThreatModel): Promise<Threat[]> {
		return analyzeStride(model);
	}
}
