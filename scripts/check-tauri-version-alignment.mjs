import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const packageLock = JSON.parse(readFileSync("package-lock.json", "utf8"));

const versionPairs = [
	["@tauri-apps/api", "tauri"],
	["@tauri-apps/plugin-clipboard-manager", "tauri-plugin-clipboard-manager"],
	["@tauri-apps/plugin-dialog", "tauri-plugin-dialog"],
	["@tauri-apps/plugin-opener", "tauri-plugin-opener"],
];

const directNpmPackages = [
	"@tauri-apps/api",
	"@tauri-apps/plugin-clipboard-manager",
	"@tauri-apps/plugin-dialog",
	"@tauri-apps/plugin-opener",
	"@tauri-apps/cli",
];

const minimumCargoVersions = [
	{
		packageName: "tauri",
		version: "2.11.1",
		reason: "GHSA-7gmj-67g7-phm9",
	},
];

const cratesIoSource = "registry+https://github.com/rust-lang/crates.io-index";
const cargoConfigPaths = [
	".cargo/config",
	".cargo/config.toml",
	"src-tauri/.cargo/config",
	"src-tauri/.cargo/config.toml",
];

if (process.env.CI) {
	if (!process.env.CARGO_HOME) {
		console.error("CI must use an isolated CARGO_HOME.");
		process.exit(1);
	}

	cargoConfigPaths.push(
		join(process.env.CARGO_HOME, "config"),
		join(process.env.CARGO_HOME, "config.toml"),
	);

	const cargoSourceOverrides = Object.keys(process.env).filter(
		(name) => name.startsWith("CARGO_SOURCE_") || name.startsWith("CARGO_REGISTRIES_CRATES_IO_"),
	);
	if (cargoSourceOverrides.length > 0) {
		console.error(
			`Cargo source override environment is not allowed: ${cargoSourceOverrides.join(", ")}`,
		);
		process.exit(1);
	}
}

for (const cargoConfigPath of cargoConfigPaths) {
	if (existsSync(cargoConfigPath)) {
		console.error(`Cargo configuration is not allowed: ${cargoConfigPath}`);
		process.exit(1);
	}
}

const cargoMetadataResult = spawnSync(
	"cargo",
	["metadata", "--manifest-path", "src-tauri/Cargo.toml", "--locked", "--format-version", "1"],
	{ encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
);

if (cargoMetadataResult.error) {
	console.error(`Unable to run locked Cargo metadata: ${cargoMetadataResult.error.message}`);
	process.exit(1);
}

if (cargoMetadataResult.status !== 0) {
	console.error("Locked Cargo metadata failed:");
	console.error(cargoMetadataResult.stderr.trim() || `cargo exited ${cargoMetadataResult.status}`);
	process.exit(1);
}

let cargoMetadata;
try {
	cargoMetadata = JSON.parse(cargoMetadataResult.stdout);
} catch {
	console.error("Locked Cargo metadata returned invalid JSON.");
	process.exit(1);
}

const violations = [];
const cargoPackages = new Map();
const workspacePackages = new Set(cargoMetadata.workspace_members);
for (const cargoPackage of cargoMetadata.packages) {
	if (!workspacePackages.has(cargoPackage.id) && cargoPackage.source !== cratesIoSource) {
		violations.push(
			`${cargoPackage.name} ${cargoPackage.version}: expected canonical crates.io source`,
		);
	}

	const versions = cargoPackages.get(cargoPackage.name) ?? [];
	versions.push(cargoPackage.version);
	cargoPackages.set(cargoPackage.name, versions);
}

function parseVersion(name, version, violations) {
	const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
	if (!match) {
		violations.push(`${name}: unsupported version ${version}`);
		return null;
	}

	return match.slice(1, 4).map(Number);
}

function compareVersions(left, right) {
	for (let index = 0; index < left.length; index += 1) {
		if (left[index] !== right[index]) {
			return left[index] - right[index];
		}
	}
	return 0;
}

function findNpmVersions(packageName) {
	const packageSuffix = `node_modules/${packageName}`;
	return new Set(
		Object.entries(packageLock.packages ?? {})
			.filter(
				([packagePath]) =>
					packagePath === packageSuffix || packagePath.endsWith(`/${packageSuffix}`),
			)
			.map(([, packageMetadata]) => packageMetadata.version)
			.filter((version) => typeof version === "string"),
	);
}

const alignedVersions = [];

for (const npmPackage of directNpmPackages) {
	const npmVersions = findNpmVersions(npmPackage);
	if (npmVersions.size !== 1) {
		violations.push(`${npmPackage}: expected one installed version, found ${npmVersions.size}`);
		continue;
	}

	const [npmVersion] = npmVersions;
	parseVersion(npmPackage, npmVersion, violations);
	const packageSpec =
		packageJson.dependencies?.[npmPackage] ?? packageJson.devDependencies?.[npmPackage];
	if (packageSpec !== npmVersion) {
		violations.push(
			`${npmPackage}: package.json must pin exact installed version ${npmVersion}, found ${packageSpec ?? "missing"}`,
		);
	}
}

for (const [npmPackage, cargoPackage] of versionPairs) {
	const npmVersions = findNpmVersions(npmPackage);
	const cargoVersions = cargoPackages.get(cargoPackage) ?? [];

	if (npmVersions.size !== 1) {
		violations.push(`${npmPackage}: expected one installed version, found ${npmVersions.size}`);
		continue;
	}

	if (cargoVersions.length !== 1) {
		violations.push(
			`${cargoPackage}: expected one resolved version, found ${cargoVersions.length}`,
		);
		continue;
	}

	const [npmVersion] = npmVersions;
	const [cargoVersion] = cargoVersions;
	const npmParsedVersion = parseVersion(npmPackage, npmVersion, violations);
	const cargoParsedVersion = parseVersion(cargoPackage, cargoVersion, violations);
	if (!npmParsedVersion || !cargoParsedVersion) {
		continue;
	}

	if (
		npmParsedVersion[0] !== cargoParsedVersion[0] ||
		npmParsedVersion[1] !== cargoParsedVersion[1]
	) {
		violations.push(
			`${npmPackage} ${npmVersion} does not align with ${cargoPackage} ${cargoVersion}`,
		);
		continue;
	}

	alignedVersions.push(`${npmPackage} ${npmVersion} / ${cargoPackage} ${cargoVersion}`);
}

for (const minimum of minimumCargoVersions) {
	const cargoVersions = cargoPackages.get(minimum.packageName) ?? [];
	if (cargoVersions.length !== 1) {
		continue;
	}

	const [cargoVersion] = cargoVersions;
	const parsedVersion = parseVersion(minimum.packageName, cargoVersion, violations);
	const parsedMinimum = parseVersion(`${minimum.packageName} minimum`, minimum.version, violations);
	if (parsedVersion && parsedMinimum && compareVersions(parsedVersion, parsedMinimum) < 0) {
		violations.push(
			`${minimum.packageName} ${cargoVersion} is below ${minimum.version} required by ${minimum.reason}`,
		);
	}
}

if (violations.length > 0) {
	console.error("Tauri JavaScript and Rust version alignment failed:");
	for (const violation of violations) {
		console.error(`- ${violation}`);
	}
	process.exit(1);
}

console.log(`Tauri JavaScript and Rust versions align:\n- ${alignedVersions.join("\n- ")}`);
