import { describe, expect, it } from "vitest";

import { CHANGELOG, type ChangelogEntry, selectUnseenEntries } from "./whats-new";

function entries(...versions: string[]): ChangelogEntry[] {
	return versions.map((version) => ({ version, date: "2026-01-01", changes: ["something"] }));
}

function versionsOf(result: ChangelogEntry[]): string[] {
	return result.map((entry) => entry.version);
}

describe("selectUnseenEntries", () => {
	it("announces nothing when the running version was already acknowledged", () => {
		expect(selectUnseenEntries("0.3.0", "0.3.0", entries("0.3.0", "0.2.0"))).toEqual([]);
	});

	it("announces only the newest entry on a first launch", () => {
		expect(
			versionsOf(selectUnseenEntries(null, "0.3.0", entries("0.3.0", "0.2.0", "0.1.0"))),
		).toEqual(["0.3.0"]);
	});

	it("announces every entry newer than the acknowledged version", () => {
		expect(
			versionsOf(selectUnseenEntries("0.1.0", "0.3.0", entries("0.3.0", "0.2.0", "0.1.0"))),
		).toEqual(["0.3.0", "0.2.0"]);
	});

	it("compares versions numerically rather than lexicographically", () => {
		// As text "0.9.0" sorts above both "0.10.0" and "0.11.0", so a string comparison
		// reads a 0.9.0 user as being ahead of the newest entry and re-announces only the
		// latest instead of both versions they missed.
		expect(
			versionsOf(selectUnseenEntries("0.9.0", "0.11.0", entries("0.11.0", "0.10.0", "0.9.0"))),
		).toEqual(["0.11.0", "0.10.0"]);

		// And in the filter itself: "0.9.0" > "0.10.0" as text would re-announce an entry
		// the user has already acknowledged.
		expect(
			versionsOf(selectUnseenEntries("0.10.0", "0.11.0", entries("0.11.0", "0.10.0", "0.9.0"))),
		).toEqual(["0.11.0"]);
	});

	it("re-announces when a prior build stored a version that was never released", () => {
		// Builds up to 0.2.0 wrote a hard-coded "1.0.0" (#246).
		expect(versionsOf(selectUnseenEntries("1.0.0", "0.3.0", entries("0.3.0", "0.2.0")))).toEqual([
			"0.3.0",
		]);
	});

	it("re-announces when the stored value is not a version at all", () => {
		for (const junk of ["not-a-version", "", "0.3", "v0.3.0", "0.3.0-beta.1"]) {
			expect(versionsOf(selectUnseenEntries(junk, "0.3.0", entries("0.3.0", "0.2.0")))).toEqual([
				"0.3.0",
			]);
		}
	});

	it("accepts a stored version from a build that shipped without a changelog entry", () => {
		// v0.1.1 shipped with no entry of its own. A user who dismissed on that build
		// stored 0.1.1; treating it as impossible would re-announce on every launch of
		// the very next release rather than showing what actually changed.
		expect(versionsOf(selectUnseenEntries("0.2.1", "0.2.1", entries("0.2.0", "0.1.0")))).toEqual(
			[],
		);
		expect(versionsOf(selectUnseenEntries("0.2.1", "0.3.0", entries("0.3.0", "0.2.0")))).toEqual([
			"0.3.0",
		]);
	});

	it("does not treat the running version as seen when the changelog is empty", () => {
		expect(selectUnseenEntries(null, "0.3.0", [])).toEqual([]);
	});
});

describe("CHANGELOG", () => {
	it("is ordered newest first", () => {
		const versions = CHANGELOG.map((entry) => entry.version);
		const sorted = [...versions].sort((a, b) => {
			const pa = a.split(".").map(Number);
			const pb = b.split(".").map(Number);
			return pb[0] - pa[0] || pb[1] - pa[1] || pb[2] - pa[2];
		});
		expect(versions).toEqual(sorted);
	});

	it("announces the running build", () => {
		// Bumping the version without adding an entry tells upgrading users nothing, and
		// it would leave a dismissing user holding a version above every known entry —
		// which selectUnseenEntries reads as impossible and re-announces forever. The
		// release runbook carries the step; this is what catches skipping it.
		expect(CHANGELOG[0]?.version).toBe(__APP_VERSION__);
	});

	it("uses plain major.minor.patch versions matching real tags", () => {
		for (const entry of CHANGELOG) {
			expect(entry.version).toMatch(/^\d+\.\d+\.\d+$/);
			expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(entry.changes.length).toBeGreaterThan(0);
		}
	});
});
