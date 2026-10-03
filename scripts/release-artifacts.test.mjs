import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { collectReleaseArtifacts, verifyReleaseArtifacts } from "./release-artifacts.mjs";

const source = "a".repeat(40);

for (const [platform, suffix] of [
	["aarch64-apple-darwin", "aarch64"],
	["x86_64-apple-darwin", "x64"],
]) {
	test(`actual ${platform} DMG filename with spaces survives final artifact verification`, async (t) => {
		const root = await mkdtemp(join(tmpdir(), "threatforge-mac-manifest-"));
		t.onTestFinished(() => rm(root, { recursive: true, force: true }));
		await mkdir(join(root, "dmg"));
		await mkdir(join(root, "macos"));
		await writeFile(join(root, "dmg", `Threat Forge_0.3.0_${suffix}.dmg`), "DMG integrity fixture");
		await writeFile(
			join(root, "macos", `Threat.Forge_${suffix}.app.tar.gz`),
			"App archive integrity fixture",
		);
		const output = join(root, "output");
		await collectReleaseArtifacts(platform, root, output, source, "0.3.0");
		const files = await verifyReleaseArtifacts(output, platform, source, "0.3.0");
		assert.ok(files.includes(join(output, `Threat Forge_0.3.0_${suffix}.dmg`)));
	});
}

async function fixture(t) {
	const root = await mkdtemp(join(tmpdir(), "threatforge-release-manifest-"));
	t.onTestFinished(() => rm(root, { recursive: true, force: true }));
	for (const folder of ["nsis", "msi"]) await mkdir(join(root, folder));
	await writeFile(
		join(root, "nsis", "Threat.Forge_0.3.0_x64-setup.exe"),
		"signed installer fixture",
	);
	await writeFile(join(root, "msi", "Threat.Forge_0.3.0_x64.msi"), "signed msi fixture");
	return root;
}

test("final container manifest binds copied bytes to source and rejects modified downloads", async (t) => {
	const root = await fixture(t);
	const output = join(root, "output");
	await collectReleaseArtifacts("windows", root, output, source, "0.3.0");
	assert.equal((await verifyReleaseArtifacts(output, "windows", source, "0.3.0")).length, 2);
	await assert.rejects(
		verifyReleaseArtifacts(output, "windows", "b".repeat(40), "0.3.0"),
		/source/,
	);
	await writeFile(join(output, "Threat.Forge_0.3.0_x64.msi"), "modified");
	await assert.rejects(verifyReleaseArtifacts(output, "windows", source, "0.3.0"), /Modified/);
});

test("collection rejects missing and ambiguous expected containers", async (t) => {
	const root = await fixture(t);
	await writeFile(join(root, "nsis", "extra.exe"), "extra");
	await assert.rejects(
		collectReleaseArtifacts("windows", root, join(root, "output"), source, "0.3.0"),
		/Expected one/,
	);
	await rm(join(root, "msi"), { recursive: true });
	await rm(join(root, "nsis", "extra.exe"));
	await assert.rejects(
		collectReleaseArtifacts("windows", root, join(root, "missing"), source, "0.3.0"),
	);
});

test("download verification rejects traversal, duplicate names, symlinks and extra files", async (t) => {
	const root = await fixture(t);
	const output = join(root, "output");
	await collectReleaseArtifacts("windows", root, output, source, "0.3.0");
	const path = join(output, "manifest.json");
	const original = await readFile(path, "utf8");
	const manifest = JSON.parse(original);
	manifest.files[0].name = "../outside.exe";
	await writeFile(path, JSON.stringify(manifest));
	await assert.rejects(verifyReleaseArtifacts(output, "windows", source, "0.3.0"), /identity/);
	manifest.files[0] = manifest.files[1];
	await writeFile(path, JSON.stringify(manifest));
	await assert.rejects(verifyReleaseArtifacts(output, "windows", source, "0.3.0"), /identity/);
	await writeFile(path, original);
	await writeFile(join(output, "extra.txt"), "extra");
	await assert.rejects(verifyReleaseArtifacts(output, "windows", source, "0.3.0"), /Unexpected/);
	await rm(join(output, "extra.txt"));
	await rm(join(output, "Threat.Forge_0.3.0_x64.msi"));
	await symlink(
		join(root, "msi", "Threat.Forge_0.3.0_x64.msi"),
		join(output, "Threat.Forge_0.3.0_x64.msi"),
	);
	await assert.rejects(verifyReleaseArtifacts(output, "windows", source, "0.3.0"), /regular file/);
});
