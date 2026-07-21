import type { DocumentId } from "@/types/document";

/** Format 16 random bytes as an RFC 4122 version 4 UUID. */
function formatUuidV4(bytes: Uint8Array): string {
	// Version 4 (random) and RFC 4122 variant bits.
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;

	const hex: string[] = [];
	for (const byte of bytes) {
		hex.push(byte.toString(16).padStart(2, "0"));
	}
	return [
		hex.slice(0, 4).join(""),
		hex.slice(4, 6).join(""),
		hex.slice(6, 8).join(""),
		hex.slice(8, 10).join(""),
		hex.slice(10, 16).join(""),
	].join("-");
}

/**
 * Create a stable, opaque identity for a document.
 *
 * The value is randomly generated and never derived from a file path, title, or model
 * content, so a document keeps its identity across `Save As`, rename, and path changes.
 *
 * There is deliberately no `Math.random()` fallback: these ids are persisted as workspace
 * metadata, so a predictable id is a collision and workspace-integrity hazard rather than a
 * cosmetic one. When no cryptographic random source exists this fails closed.
 */
export function createDocumentId(): DocumentId {
	const source = globalThis.crypto;

	if (typeof source?.randomUUID === "function") {
		return `doc-${source.randomUUID()}` as DocumentId;
	}

	if (typeof source?.getRandomValues === "function") {
		return `doc-${formatUuidV4(source.getRandomValues(new Uint8Array(16)))}` as DocumentId;
	}

	throw new Error("Cannot create a document: this environment provides no secure random source.");
}
