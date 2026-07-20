import { readFileSync } from "node:fs";

const lockfile = JSON.parse(readFileSync("package-lock.json", "utf8"));
const violations = [];

for (const [packagePath, packageMetadata] of Object.entries(lockfile.packages ?? {})) {
	const { integrity, resolved } = packageMetadata;
	if (!packagePath || packageMetadata.link) {
		continue;
	}

	if (packageMetadata.inBundle && !resolved) {
		continue;
	}

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

	if (typeof integrity !== "string" || !integrity.startsWith("sha512-")) {
		violations.push(`${packagePath}: integrity must use SHA-512`);
	}
}

if (violations.length > 0) {
	console.error("Package lockfile registry validation failed:");
	for (const violation of violations) {
		console.error(`- ${violation}`);
	}
	process.exit(1);
}

console.log("Package lockfile uses registry.npmjs.org with SHA-512 integrity.");
