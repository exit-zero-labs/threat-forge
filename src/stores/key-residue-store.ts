import { create } from "zustand";
import { getKeychainAdapter } from "@/lib/adapters/get-keychain-adapter";
import type { LegacyResidue } from "@/lib/adapters/keychain-adapter";
import type { AiProvider } from "@/stores/chat-store";

/**
 * Assert at compile time that `list` names every `AiProvider`.
 *
 * A bare `readonly AiProvider[]` annotation only rejects a *wrong* provider; a third provider
 * added to the union would leave this list silently short, and the slot it never refreshes is
 * one nothing would ever warn about. The intersection resolves to `never` — so the call fails
 * to compile — unless every member of the union appears in the tuple. `Object.keys(...) as
 * AiProvider[]` would answer the same question at runtime and is forbidden by `AGENTS.md`.
 */
function everyProvider<T extends readonly AiProvider[]>(
	list: T & (AiProvider extends T[number] ? unknown : never),
): T {
	return list;
}

/**
 * Every provider whose clear-text slot is worth asking about.
 *
 * Exported because the launch effect in `app-layout.tsx` has to walk the same list to settle
 * each provider's migration before the committed read, and a second hand-written list there is
 * one a third provider would be silently missing from.
 *
 * The guard covers this list only. The settings panel hand-writes its own provider set, so
 * adding a provider still means auditing that file — this buys the launch path, not the repo.
 */
export const RESIDUE_PROVIDERS = everyProvider(["anthropic", "openai"] as const);

/**
 * Whether a pre-#133 clear-text API key is still readable in this browser (#233).
 *
 * Kept out of `chat-store` deliberately: `hasApiKey` there answers "can I send a request",
 * while residue is the opposite — a key the transport does not use and a storage-hygiene
 * problem the user has to act on. Folding the two together would invite a future reader to
 * gate requests on it.
 *
 * Deliberately not persisted. Residue is derived from storage and has to be re-derived every
 * session; a stored copy would be a stale claim about a secret, and the store it would be
 * written to is `localStorage` — by hypothesis the storage that is refusing to cooperate.
 */
interface KeyResidueState {
	/** Per-provider clear-text residue. `null` also covers "not checked yet" and desktop. */
	residue: Record<AiProvider, LegacyResidue>;
	/** Re-read one provider's slot through the keychain adapter. Never throws. */
	refreshResidue: (provider: AiProvider) => Promise<void>;
	/** Re-read every provider. */
	refreshAllResidue: () => Promise<void>;
}

export const useKeyResidueStore = create<KeyResidueState>((set, get) => ({
	residue: { anthropic: null, openai: null },

	refreshResidue: async (provider) => {
		try {
			const adapter = await getKeychainAdapter();
			// `?.` rather than a runtime `in` check: `undefined` from the optional call means
			// there is no such storage location on this platform, which — like a checked-and-empty
			// slot — is nothing to warn about. See `LegacyResidue`.
			const answer = (await adapter.readLegacyResidue?.(provider)) ?? null;
			set((state) => ({ residue: { ...state.residue, [provider]: answer } }));
		} catch {
			// The previous value stands, for either failure. Neither "the bundle did not load"
			// nor "the read threw" is evidence the slot is empty, and writing `null` here would
			// retract a warning about a live credential on the strength of one. A module-load
			// failure reaches the user through the settings panel's own adapter-load message,
			// so nothing is swallowed silently.
		}
	},

	refreshAllResidue: async () => {
		// Each refresh already resolves rather than rejecting, so no settling wrapper is needed.
		await Promise.all(RESIDUE_PROVIDERS.map((provider) => get().refreshResidue(provider)));
	},
}));
