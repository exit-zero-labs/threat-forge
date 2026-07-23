/**
 * The desktop key boundary, asserted at compile time and at runtime.
 *
 * The invariant is that the desktop API key never enters the webview. Before
 * issue #61 step 9 it held by accident: `TauriKeychainAdapter.getKey` invoked a
 * `get_api_key` command that was never registered and swallowed the failure into
 * `null`, so the boundary looked like a lookup that always missed. Now the
 * shared `KeychainAdapter` interface simply does not declare a key-reading
 * method, which makes asking for one a build failure rather than a silent
 * `null`.
 */

import { afterEach, describe, expect, it } from "vitest";
import { BrowserKeychainAdapter } from "./browser-keychain-adapter";
import type { KeychainAdapter } from "./keychain-adapter";
import { TauriKeychainAdapter } from "./tauri-keychain-adapter";

afterEach(() => {
	localStorage.clear();
});

describe("the shared keychain interface", () => {
	it("makes asking a desktop adapter for a stored key a type error", () => {
		const desktop: KeychainAdapter = new TauriKeychainAdapter();

		// The compile assertion. `tsc --noEmit` fails with "unused '@ts-expect-error'
		// directive" the moment this line starts type-checking, which is exactly what
		// re-declaring `getKey` on `KeychainAdapter` would do.
		// @ts-expect-error `getKey` is not part of `KeychainAdapter`: on desktop the
		// key lives only in Rust and no command returns it.
		const askForTheKey = (): unknown => desktop.getKey("anthropic");

		// And the method is genuinely absent, so the type is not the only thing
		// standing between a caller and the desktop key.
		expect(askForTheKey).toThrowError(TypeError);
	});

	it("does not carry a key-reading method anywhere on the desktop adapter", () => {
		expect("getKey" in new TauriKeychainAdapter()).toBe(false);
	});

	it("still lets the desktop adapter report whether a key exists", () => {
		const desktop: KeychainAdapter = new TauriKeychainAdapter();
		expect(desktop.hasKey).toBeTypeOf("function");
		expect(desktop.setKey).toBeTypeOf("function");
		expect(desktop.deleteKey).toBeTypeOf("function");
	});
});

describe("the browser keychain adapter", () => {
	it("reads a stored key back, because the browser transport has to sign requests", async () => {
		const browser = new BrowserKeychainAdapter();
		await browser.setKey("openai", "sk-browser-test-key");

		expect(await browser.getKey("openai")).toBe("sk-browser-test-key");
		expect(await browser.hasKey("openai")).toBe(true);
	});

	it("reports a missing key as null rather than an error", async () => {
		expect(await new BrowserKeychainAdapter().getKey("anthropic")).toBeNull();
	});

	it("does not widen the shared interface, even though this class reads keys", async () => {
		await new BrowserKeychainAdapter().setKey("openai", "sk-browser-test-key");
		const shared: KeychainAdapter = new BrowserKeychainAdapter();

		// The compile assertion, as in the desktop case above: the browser adapter
		// has a working `getKey`, but reaching it through `KeychainAdapter` must
		// stay a type error, or the same interface would hand desktop callers a
		// method Rust deliberately does not implement.
		// @ts-expect-error `getKey` is not part of `KeychainAdapter`.
		const readThroughTheInterface = (): Promise<string | null> => shared.getKey("openai");

		// And the directive is guarding a real call rather than a name that never
		// resolves — which is what would make the assertion above vacuous.
		await expect(readThroughTheInterface()).resolves.toBe("sk-browser-test-key");
	});
});
