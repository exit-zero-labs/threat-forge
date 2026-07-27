/**
 * How a keychain failure becomes text on the settings and chat-store surfaces (#234).
 *
 * The AI settings panel and the chat store both describe the same storage faults, and both
 * used to carry their own copy of this pair. That is how one fault comes to be described in
 * two different ways on two surfaces — the defect #234 exists to remove — so the copy and the
 * `unknown`-shape handling live in one place that both import.
 *
 * Not the only path a vault message can reach a user: `browser-chat-adapter` re-raises a
 * `KeyVaultError` as a `no_api_key` protocol error, so the same sentence can also arrive in
 * the transcript by way of a request the user made. That path authors its own framing and is
 * documented where it lives.
 *
 * Kept beside {@link getKeychainAdapter} rather than inside its module because every suite
 * that renders one of those surfaces mocks `./get-keychain-adapter` to supply a stand-in
 * adapter. Defining the wrapper there would put it behind the same mock, so a test could only
 * exercise it by re-implementing it — and the authored-message guarantee would then be proven
 * against the re-implementation instead of against this code.
 */

import { getKeychainAdapter } from "./get-keychain-adapter";
import type { KeychainAdapter } from "./keychain-adapter";

/** Authored so a bundler or network detail never reaches the user as an error message. */
export const KEYCHAIN_LOAD_ERROR =
	"Key storage could not be loaded. Reload the page and try again.";

/**
 * The fallback for a rejection shaped like nothing this app produces.
 *
 * Deliberately vague, because a value that is neither an `Error` nor a string came from no
 * layer that authored a message, so there is nothing truthful to say about it. Vague and
 * honest beats `[object Object]`, and beats guessing at a cause the app cannot see.
 */
export const KEYCHAIN_UNKNOWN_ERROR =
	"Key storage reported a problem ThreatForge does not recognize. Reload the page and try again.";

/**
 * Load the keychain adapter, replacing a module-load failure with an authored message.
 *
 * Adapters author their own user-safe messages; a failure to load one does not, and would
 * otherwise render a bundle URL and a hash as the explanation. The cause is logged rather
 * than dropped, so a real chunk-load regression is still diagnosable from a bug report.
 */
export async function loadKeychainAdapter(): Promise<KeychainAdapter> {
	try {
		return await getKeychainAdapter();
	} catch (err) {
		console.warn("Key storage adapter failed to load:", err);
		throw new Error(KEYCHAIN_LOAD_ERROR);
	}
}

/**
 * Render a keychain failure as text a user can read.
 *
 * This function authors nothing and filters nothing — it is a shape adapter. What guarantees
 * the text is safe to show lives upstream, in the two layers that produce these rejections:
 * `withVault` remaps every non-`KeyVaultError` to an authored `unavailable()` before it leaves
 * the browser vault, and the Tauri adapter relays a sentence authored in Rust, where
 * `key_refusal` deliberately keeps `ThreatForgeError`'s `Display` — which names storage keys
 * and filesystem paths — off the wire. A new caller that throws its own error is what would
 * break that, not this line.
 *
 * The two shape branches exist because the two platforms reject differently: the browser vault
 * throws an `Error`, and `invoke` rejects with a bare string. Anything else came from no layer
 * that authored a message, so it is replaced rather than stringified — `String(error)` on an
 * object renders `[object Object]` as the app's explanation of itself.
 *
 * The emptiness check is the one that matters most, and it is not decoration. This value ends
 * up in `chat-store`'s `keyFault`, which the chat tab tests for truthiness: an empty string
 * would fall through to the "No API key configured" empty state over a vault that had just
 * faulted, which is the exact defect #234 exists to remove, arriving through the code added to
 * prevent it. An `Error` with nothing in it says no more than an object does.
 */
export function keychainErrorText(error: unknown): string {
	if (error instanceof Error) return error.message || KEYCHAIN_UNKNOWN_ERROR;
	if (typeof error === "string") return error || KEYCHAIN_UNKNOWN_ERROR;
	return KEYCHAIN_UNKNOWN_ERROR;
}
