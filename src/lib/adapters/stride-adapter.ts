import type { Threat, ThreatModel } from "@/types/threat-model";

/**
 * Adapter interface for STRIDE threat analysis.
 *
 * Tauri implementation calls the Rust STRIDE engine via IPC.
 * Browser implementation runs a TypeScript port of the same rules.
 */
export interface StrideAdapter {
	/** Analyze a threat model and return suggested threats (excluding duplicates). */
	analyze(model: ThreatModel): Promise<Threat[]>;
}
