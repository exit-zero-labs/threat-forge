import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "vitest";

const run = (script, args, extra = {}) =>
	spawnSync("bash", [`scripts/${script}`, ...args], {
		encoding: "utf8",
		env: { PATH: process.env.PATH, ...extra },
	});

test("signer rejects missing credentials before creating keychains or build outputs", () => {
	const result = run("sign-macos.sh", ["aarch64-apple-darwin"]);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /Required signing input missing: APPLE_CERTIFICATE/);
});

test("signer rejects unsupported targets before credential handling", () => {
	const result = run("sign-macos.sh", ["../../other"]);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /Unsupported macOS target/);
});

test("verifier rejects a different legal publisher before opening artifacts", () => {
	const result = run("verify-macos-signing.sh", ["x86_64-apple-darwin", "/tmp/unused"], {
		APPLE_TEAM_ID: "Q4N97LZS6U",
		APPLE_SIGNING_IDENTITY: "Developer ID Application: Other Org",
	});
	assert.equal(result.status, 1);
	assert.match(result.stderr, /Unexpected Apple signing identity/);
});

test("verifier rejects an unapproved team before opening artifacts", () => {
	const result = run("verify-macos-signing.sh", ["aarch64-apple-darwin", "/tmp/unused"], {
		APPLE_TEAM_ID: "OTHER",
		APPLE_SIGNING_IDENTITY: "Developer ID Application: Exit Zero Labs LLC (Q4N97LZS6U)",
	});
	assert.equal(result.status, 1);
	assert.match(result.stderr, /Unexpected Apple team/);
});
