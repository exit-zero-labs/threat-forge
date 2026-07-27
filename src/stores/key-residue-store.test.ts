/**
 * The residue store is the standing record of a clear-text API key that survived deletion
 * (#233). Its contract is narrow and load-bearing: it never rejects, it never persists, and it
 * never writes `null` — the value that hides the warning — on evidence it does not have.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LegacyResidue } from "@/lib/adapters/keychain-adapter";
import { useKeyResidueStore } from "./key-residue-store";

let getAdapter: () => Promise<unknown> = async () => ({});

vi.mock("@/lib/adapters/get-keychain-adapter", () => ({
	getKeychainAdapter: () => getAdapter(),
}));

/** An adapter with the browser capability, answering whatever the case sets up. */
function browserAdapter(answers: Record<string, LegacyResidue>) {
	return {
		setKey: async () => undefined,
		hasKey: async () => false,
		deleteKey: async () => undefined,
		readLegacyResidue: async (provider: string) => answers[provider] ?? null,
	};
}

beforeEach(() => {
	localStorage.clear();
	useKeyResidueStore.setState({ residue: { anthropic: null, openai: null } });
	getAdapter = async () => browserAdapter({});
});

describe("the clear-text key residue store", () => {
	it("records what the keychain capability reports for a provider", async () => {
		getAdapter = async () => browserAdapter({ anthropic: "retained", openai: "unverified" });

		await useKeyResidueStore.getState().refreshResidue("anthropic");

		expect(useKeyResidueStore.getState().residue.anthropic).toBe("retained");
		// One refresh answers for one provider; the other is not guessed at.
		expect(useKeyResidueStore.getState().residue.openai).toBeNull();
	});

	it("covers every provider when refreshing them all", async () => {
		getAdapter = async () => browserAdapter({ anthropic: "retained", openai: "unverified" });

		await useKeyResidueStore.getState().refreshAllResidue();

		expect(useKeyResidueStore.getState().residue).toEqual({
			anthropic: "retained",
			openai: "unverified",
		});
	});

	it("reports nothing when the platform has no clear-text slot to check", async () => {
		// The shape `TauriKeychainAdapter` actually has: the answer comes from the absence of
		// the method, not from a desktop implementation claiming it performed a check. See
		// `LegacyResidue` for why that distinction is kept.
		getAdapter = async () => ({
			setKey: async () => undefined,
			hasKey: async () => false,
			deleteKey: async () => undefined,
		});
		useKeyResidueStore.setState({ residue: { anthropic: "retained", openai: null } });

		await useKeyResidueStore.getState().refreshResidue("anthropic");

		expect(useKeyResidueStore.getState().residue.anthropic).toBeNull();
	});

	it("clears a provider's warning once the slot reads empty", async () => {
		useKeyResidueStore.setState({ residue: { anthropic: "retained", openai: null } });
		getAdapter = async () => browserAdapter({ anthropic: null });

		await useKeyResidueStore.getState().refreshResidue("anthropic");

		// Every refresh recomputes from storage, so nothing has to clear the warning by hand.
		expect(useKeyResidueStore.getState().residue.anthropic).toBeNull();
	});

	it("keeps the previous answer when the adapter module will not load", async () => {
		useKeyResidueStore.setState({ residue: { anthropic: "retained", openai: null } });
		getAdapter = async () => {
			throw new Error("Failed to fetch dynamically imported module: /assets/x-9f2a1c.js");
		};

		await expect(
			useKeyResidueStore.getState().refreshResidue("anthropic"),
		).resolves.toBeUndefined();

		// "The bundle did not load" is not evidence the slot is empty. Writing `null` here would
		// retract a warning about a live credential on the strength of a chunk-load failure.
		expect(useKeyResidueStore.getState().residue.anthropic).toBe("retained");
	});

	it("keeps the previous answer when the read itself rejects", async () => {
		useKeyResidueStore.setState({ residue: { anthropic: "retained", openai: null } });
		getAdapter = async () => ({
			setKey: async () => undefined,
			hasKey: async () => false,
			deleteKey: async () => undefined,
			readLegacyResidue: async () => {
				throw new DOMException("blocked", "SecurityError");
			},
		});

		// Both panel callers await this inside a `finally`, so a rejection escaping here would
		// surface as an unhandled rejection and mask the error the `catch` had just rendered.
		await expect(
			useKeyResidueStore.getState().refreshResidue("anthropic"),
		).resolves.toBeUndefined();

		// A failed read is not evidence of an empty slot, for the same reason a failed module
		// load is not: `null` here would retract a warning about a live credential.
		expect(useKeyResidueStore.getState().residue.anthropic).toBe("retained");
	});

	it("keeps nothing in web storage, because the storage it describes is the one refusing", () => {
		useKeyResidueStore.setState({ residue: { anthropic: "retained", openai: "unverified" } });

		// A persisted copy would be a stale claim about a secret, written to the storage that is
		// by hypothesis misbehaving. The state is re-derived every session instead.
		const stored = Object.keys(localStorage).map((key) => localStorage.getItem(key) ?? "");
		expect(stored.join("|")).not.toContain("retained");
	});

	it("has no persistence middleware to write anywhere else either", () => {
		// The scan above only proves `localStorage` is clean; `persist` can be pointed at
		// `sessionStorage` or IndexedDB and would pass it. Read the module as raw text at test
		// time and assert the middleware is absent at the source, in the spirit of
		// `src/lib/persistence/no-key-leakage.test.ts`.
		const sources = import.meta.glob("./key-residue-store.ts", {
			query: "?raw",
			import: "default",
			eager: true,
		}) as Record<string, string>;
		const [[path, contents]] = Object.entries(sources);
		expect(path).toContain("key-residue-store.ts");
		// Matched as code rather than as a word, so the module's own prose about not persisting
		// does not satisfy the check it is describing.
		expect(contents).not.toMatch(/from ["']zustand\/middleware["']/);
		expect(contents).not.toMatch(/\bpersist\s*\(/);
	});
});
