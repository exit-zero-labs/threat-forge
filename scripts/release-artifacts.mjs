import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const layouts = {
	linux: ["deb/.deb", "rpm/.rpm", "appimage/.AppImage"],
	windows: ["nsis/.exe", "msi/.msi"],
	"aarch64-apple-darwin": ["dmg/.dmg", "macos/.app.tar.gz"],
	"x86_64-apple-darwin": ["dmg/.dmg", "macos/.app.tar.gz"],
};

async function digest(path) {
	const stat = await lstat(path);
	if (!stat.isFile() || stat.isSymbolicLink())
		throw new Error("Release asset must be a regular file");
	return createHash("sha256")
		.update(await readFile(path))
		.digest("hex");
}

/** Copy only expected final containers after native verification and bind their final bytes to the CI source. */
export async function collectReleaseArtifacts(platform, bundleRoot, output, source, version) {
	const layout = layouts[platform];
	if (
		!layout ||
		!/^[a-f0-9]{40}$/.test(source) ||
		!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)
	) {
		throw new Error("Invalid release platform/source/version");
	}
	await mkdir(output, { recursive: false });
	const files = [];
	for (const pattern of layout) {
		const [folder, suffix] = pattern.split("/");
		const matches = (await readdir(join(bundleRoot, folder))).filter((name) =>
			name.endsWith(suffix),
		);
		if (matches.length !== 1) throw new Error(`Expected one ${platform} ${suffix} container`);
		const name = matches[0];
		const sourceFile = join(bundleRoot, folder, name);
		const sha256 = await digest(sourceFile);
		await copyFile(sourceFile, join(output, name));
		if ((await digest(join(output, name))) !== sha256)
			throw new Error("Copied asset hash mismatch");
		files.push({ name, sha256 });
	}
	await writeFile(
		join(output, "manifest.json"),
		`${JSON.stringify({ platform, source, version, files }, null, 2)}\n`,
	);
}

/** Reject missing, extra, traversing, symlinked or modified downloaded assets before release upload. */
export async function verifyReleaseArtifacts(directory, platform, source, version) {
	const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
	const layout = layouts[platform];
	if (
		!layout ||
		manifest.platform !== platform ||
		manifest.source !== source ||
		manifest.version !== version ||
		!Array.isArray(manifest.files) ||
		manifest.files.length !== layout.length
	) {
		throw new Error("Downloaded release manifest does not match expected source/platform/version");
	}
	const names = new Set();
	for (const file of manifest.files) {
		if (
			typeof file.name !== "string" ||
			file.name !== basename(file.name) ||
			file.name.includes("\\") ||
			!/^[A-Za-z0-9_. -]+$/.test(file.name) ||
			names.has(file.name) ||
			!/^[a-f0-9]{64}$/.test(file.sha256)
		) {
			throw new Error("Invalid release asset identity");
		}
		names.add(file.name);
		if ((await digest(join(directory, file.name))) !== file.sha256)
			throw new Error(`Modified release asset: ${file.name}`);
	}
	for (const pattern of layout) {
		const suffix = pattern.split("/")[1];
		if ([...names].filter((name) => name.endsWith(suffix)).length !== 1)
			throw new Error("Expected release container is missing");
	}
	const actual = await readdir(directory);
	if (
		actual.length !== names.size + 1 ||
		actual.some((name) => name !== "manifest.json" && !names.has(name))
	)
		throw new Error("Unexpected downloaded release file");
	return [...names].map((name) => join(directory, name));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const [command, platform, directory, output] = process.argv.slice(2);
	const version = JSON.parse(
		await readFile(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
	).version;
	const source = process.env.GITHUB_SHA;
	if (command === "collect" && output) {
		await collectReleaseArtifacts(platform, directory, output, source, version);
	} else if (command === "verify" && !output) {
		for (const path of await verifyReleaseArtifacts(directory, platform, source, version))
			console.log(path);
	} else {
		throw new Error(
			"Usage: release-artifacts.mjs collect <platform> <bundle-root> <output> | verify <platform> <download>",
		);
	}
}
