import { webcrypto } from "node:crypto";

// Supply real Web Crypto in jsdom without adding Node ambient types to the browser project.
if (!globalThis.crypto?.subtle)
	Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
