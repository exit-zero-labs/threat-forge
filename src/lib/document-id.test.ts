import { afterEach, describe, expect, it, vi } from "vitest";
import { createDocumentId } from "./document-id";

const DOCUMENT_ID_PATTERN =
	/^doc-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("createDocumentId", () => {
	it("generates unique, well-formed ids", () => {
		const ids = new Set<string>();
		for (let i = 0; i < 1000; i++) {
			const id = createDocumentId();
			expect(id).toMatch(DOCUMENT_ID_PATTERN);
			ids.add(id);
		}
		expect(ids.size).toBe(1000);
	});

	it("falls back to getRandomValues when randomUUID is unavailable", () => {
		let counter = 0;
		vi.stubGlobal("crypto", {
			getRandomValues: (bytes: Uint8Array) => {
				// Deterministic but distinct per call, so uniqueness is attributable to the
				// random source rather than to chance.
				for (let i = 0; i < bytes.length; i++) {
					bytes[i] = (counter + i) % 256;
				}
				counter += 1;
				return bytes;
			},
		});

		const first = createDocumentId();
		const second = createDocumentId();

		expect(first).toMatch(DOCUMENT_ID_PATTERN);
		expect(second).toMatch(DOCUMENT_ID_PATTERN);
		expect(first).not.toBe(second);
	});

	it("throws instead of using a predictable fallback when no crypto source exists", () => {
		vi.stubGlobal("crypto", undefined);

		expect(() => createDocumentId()).toThrow(/no secure random source/);
	});

	it("throws when crypto exists but exposes neither random primitive", () => {
		vi.stubGlobal("crypto", {});

		expect(() => createDocumentId()).toThrow(/no secure random source/);
	});
});
