import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { test } from "vitest";

const workflow = load(readFileSync(".github/workflows/release.yml", "utf8"));

test("tag validation accepts the configured release and reserved rehearsal tags, rejects unrelated versions", () => {
	const version = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")).version;
	const step = workflow.jobs.validate.steps.find(
		(entry) => entry.name === "Validate release or nonpublishing rehearsal tag",
	);
	const script = step.run.match(/node - <<'NODE'\n([\s\S]*)\nNODE\n?$/)[1];
	for (const tag of [`v${version}`, `v${version}-signing.1`, `v${version}-signing.42`]) {
		assert.equal(
			spawnSync(process.execPath, ["-e", script], { env: { ...process.env, RELEASE_TAG: tag } })
				.status,
			0,
		);
	}
	for (const tag of [
		"main",
		"v999.999.999",
		`v${version}-signing.`,
		`v${version}-signing.no`,
		`v${version}-evil-signing.1`,
	]) {
		assert.notEqual(
			spawnSync(process.execPath, ["-e", script], { env: { ...process.env, RELEASE_TAG: tag } })
				.status,
			0,
		);
	}
	assert.match(workflow.jobs["publish-draft"].if, /!contains\(github.ref_name, '-signing\.'\)/);
	const gate = workflow.jobs.windows.steps.find(
		(entry) => entry.name === "Require verified rollout for release pushes",
	);
	assert.match(gate.if, /!contains\(github.ref_name, '-signing\.'\)/);
});

test("only the protected Windows job can mint Azure tokens; Apple credentials stay in the Mac signer", () => {
	assert.equal(workflow.permissions.contents, "read");
	const tokenJobs = Object.entries(workflow.jobs).filter(
		([, job]) => job.permissions?.["id-token"] === "write",
	);
	assert.deepEqual(
		tokenJobs.map(([name]) => name),
		["windows"],
	);
	assert.equal(workflow.jobs.windows.environment, "Production");
	assert.equal(workflow.jobs.macos.environment, "Production");
	assert.equal(workflow.jobs["publish-draft"].environment, "Production");
	assert.doesNotMatch(JSON.stringify(workflow), /AZURE_CLIENT_SECRET/);
	for (const [name, job] of Object.entries(workflow.jobs)) {
		if (name !== "macos") assert.doesNotMatch(JSON.stringify(job), /secrets\.APPLE_/);
	}
	assert.equal(
		workflow.jobs.macos.steps.filter((step) => /secrets\.APPLE_/.test(JSON.stringify(step))).length,
		1,
	);
});

test("native package verification precedes every signing-job asset upload and all platforms gate the draft", () => {
	for (const platform of ["windows", "macos"]) {
		const steps = workflow.jobs[platform].steps;
		const verifier = steps.findIndex((step) =>
			step.run?.includes(platform === "windows" ? "verify-windows-signing.ps1" : "sign-macos.sh"),
		);
		assert.ok(verifier >= 0);
		for (const [index, step] of steps.entries()) {
			if (step.uses?.startsWith("actions/upload-artifact@")) assert.ok(index > verifier);
		}
	}
	assert.deepEqual(workflow.jobs["publish-draft"].needs, ["linux", "windows", "macos"]);
	assert.equal(
		workflow.jobs["publish-draft"].if,
		"github.event_name == 'push' && !contains(github.ref_name, '-signing.')",
	);
	assert.ok(Object.hasOwn(workflow.on, "workflow_dispatch"));
	const publication = workflow.jobs["publish-draft"].steps.find((step) =>
		step.run?.includes("gh release create"),
	);
	assert.ok(
		publication.run.indexOf("release-artifacts.mjs verify") <
			publication.run.indexOf("gh release create"),
	);
	assert.match(publication.run, /--draft/);
	assert.doesNotMatch(publication.run, /--clobber/);
	assert.ok(
		workflow.jobs.windows.steps.some(
			(step) => step.if?.includes("WINDOWS_SIGNING != 'true'") && step.run.startsWith("throw "),
		),
	);
});

test("third-party release actions use immutable commit pins and signing jobs never cache target outputs", () => {
	for (const job of Object.values(workflow.jobs)) {
		for (const step of job.steps) {
			if (step.uses) assert.match(step.uses, /^[^@]+@[a-f0-9]{40}$/);
		}
	}
	for (const platform of ["windows", "macos"])
		assert.doesNotMatch(
			JSON.stringify(workflow.jobs[platform]),
			/actions\/cache@|AZURE_CLIENT_SECRET/,
		);
});
