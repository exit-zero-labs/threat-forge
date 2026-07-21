import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const lockfile = JSON.parse(readFileSync("package-lock.json", "utf8"));
const violations = [];
const canonicalRegistry = "https://registry.npmjs.org/";

if (existsSync("npm-shrinkwrap.json")) {
	violations.push("npm-shrinkwrap.json: shrinkwrap files are not allowed");
}

if (lockfile.lockfileVersion !== 3) {
	violations.push(
		`package-lock.json: expected lockfileVersion 3, found ${lockfile.lockfileVersion}`,
	);
}

const rootPackage = lockfile.packages?.[""];
if (
	!rootPackage ||
	rootPackage.name !== packageJson.name ||
	rootPackage.version !== packageJson.version
) {
	violations.push("package-lock.json: invalid root package metadata");
}

for (const dependencyType of ["dependencies", "devDependencies", "optionalDependencies"]) {
	const declaredDependencies = packageJson[dependencyType] ?? {};
	const lockedDependencies = rootPackage?.[dependencyType] ?? {};
	if (
		JSON.stringify(Object.entries(declaredDependencies).sort()) !==
		JSON.stringify(Object.entries(lockedDependencies).sort())
	) {
		violations.push(`package-lock.json: root ${dependencyType} do not match package.json`);
	}
}

function readNpmConfig(key) {
	const result = spawnSync("npm", ["config", "get", key], { encoding: "utf8" });
	if (result.error || result.status !== 0) {
		violations.push(`npm config ${key}: unable to read effective value`);
		return null;
	}
	return result.stdout.trim();
}

const effectiveRegistry = readNpmConfig("registry");
if (effectiveRegistry !== canonicalRegistry) {
	violations.push(`npm registry: expected ${canonicalRegistry}, found ${effectiveRegistry}`);
}

const replaceRegistryHost = readNpmConfig("replace-registry-host");
if (replaceRegistryHost !== "never") {
	violations.push(
		`npm replace-registry-host: expected never, found ${replaceRegistryHost ?? "missing"}`,
	);
}

function packageNameFromPath(packagePath) {
	return packagePath.slice(packagePath.lastIndexOf("node_modules/") + 13);
}

function validateBundledPackage(packagePath) {
	let currentPath = packagePath;
	let currentMetadata = lockfile.packages[currentPath];
	const visited = new Set();

	while (currentMetadata?.inBundle && !currentMetadata.resolved) {
		if (visited.has(currentPath)) {
			violations.push(`${packagePath}: cyclic bundled dependency ancestry`);
			return;
		}
		visited.add(currentPath);

		const parentSeparator = currentPath.lastIndexOf("/node_modules/");
		if (parentSeparator < 0) {
			violations.push(`${packagePath}: bundled dependency has no package parent`);
			return;
		}

		const bundledName = packageNameFromPath(currentPath);
		const parentPath = currentPath.slice(0, parentSeparator);
		const parentMetadata = lockfile.packages[parentPath];
		if (!parentMetadata) {
			violations.push(`${packagePath}: missing bundled dependency parent ${parentPath}`);
			return;
		}

		if (
			!Array.isArray(parentMetadata.bundleDependencies) ||
			!parentMetadata.bundleDependencies.includes(bundledName) ||
			typeof parentMetadata.dependencies?.[bundledName] !== "string"
		) {
			violations.push(`${packagePath}: parent does not declare bundled dependency ${bundledName}`);
			return;
		}

		currentPath = parentPath;
		currentMetadata = parentMetadata;
	}

	if (!currentMetadata?.resolved || !currentMetadata.integrity) {
		violations.push(`${packagePath}: bundled ancestry has no checked package tarball`);
	}
}

for (const [packagePath, packageMetadata] of Object.entries(lockfile.packages ?? {})) {
	const { integrity, resolved } = packageMetadata;
	if (!packagePath) {
		continue;
	}

	if (packageMetadata.link) {
		violations.push(`${packagePath}: linked packages are not allowed`);
		continue;
	}

	if (packageMetadata.inBundle && !resolved) {
		validateBundledPackage(packagePath);
		continue;
	}

	const packageName = packageNameFromPath(packagePath);
	if (!resolved) {
		violations.push(`${packagePath}: missing resolved URL`);
		continue;
	}

	let packageUrl;
	try {
		packageUrl = new URL(resolved);
	} catch {
		violations.push(`${packagePath}: invalid resolved URL ${resolved}`);
		continue;
	}

	if (packageUrl.protocol !== "https:" || packageUrl.hostname !== "registry.npmjs.org") {
		violations.push(`${packagePath}: non-canonical registry ${resolved}`);
	}

	const packageBasename = packageName.split("/").at(-1);
	const expectedUrl = `https://registry.npmjs.org/${packageName}/-/${packageBasename}-${packageMetadata.version}.tgz`;
	if (resolved !== expectedUrl) {
		violations.push(`${packagePath}: expected package tarball ${expectedUrl}`);
	}

	if (typeof integrity !== "string" || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(integrity)) {
		violations.push(`${packagePath}: integrity must be one complete SHA-512 SRI value`);
	}
}

if (violations.length > 0) {
	console.error("Package lockfile registry validation failed:");
	for (const violation of violations) {
		console.error(`- ${violation}`);
	}
	process.exit(1);
}

console.log("Package lockfile uses exact registry.npmjs.org tarballs with SHA-512 integrity.");
