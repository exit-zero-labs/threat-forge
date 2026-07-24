import { describe, expect, it } from "vitest";
import { COMPONENT_ENTRIES } from "@/lib/registry/component-entries";
import { ICON_ENTRIES } from "@/lib/registry/icon-entries";
import { isAllowedPathData } from "@/lib/registry/icon-source-validation";
import { ICON_LICENSES, type ShippedIconEntry } from "@/lib/registry/types";
import noticeRaw from "../../../NOTICE?raw";
import lucideLicenseRaw from "../../../node_modules/lucide-react/LICENSE?raw";
import lucidePackage from "../../../node_modules/lucide-react/package.json";

/**
 * The license, provenance, and trademark audit. An entry without provenance, with a
 * disallowed license, or with an unflagged shipped vendor mark fails here. `NOTICE` carries
 * the attribution and trademark data and cannot drift from the registry.
 *
 * "Shipping" means the artwork is actually bundled (`lucide` or `paths`). `withdrawn` entries
 * ship no artifact, so they carry no attribution or trademark obligation until their artwork
 * is vendored — see `docs/knowledge/component-registry.md`.
 */

const COPYRIGHT_REQUIRED = new Set(["MIT", "ISC", "BSD-3-Clause", "Apache-2.0"]);
const FORBIDDEN_REFS = new Set(["main", "master", "HEAD", "latest"]);

const shipping = ICON_ENTRIES.filter(
	(entry): entry is ShippedIconEntry => entry.artwork.kind !== "withdrawn",
);
const featherNamesLine = lucideLicenseRaw.split("\n").find((line) => line.startsWith("airplay,"));
const featherDerivedNames = new Set(
	(featherNamesLine ?? "")
		.split(", ")
		.map((name) => name.trim())
		.filter(Boolean),
);

function parseNoticeBlock(marker: string): string[] {
	const start = noticeRaw.indexOf(`<!-- ${marker}:start -->`);
	const end = noticeRaw.indexOf(`<!-- ${marker}:end -->`);
	if (start === -1 || end === -1 || end < start) {
		throw new Error(`NOTICE is missing the ${marker} block`);
	}
	return noticeRaw
		.slice(start + `<!-- ${marker}:start -->`.length, end)
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l.startsWith("- "))
		.map((l) => l.slice(2).trim());
}

describe("provenance audit: license and source", () => {
	for (const entry of shipping) {
		it(`${entry.id} has audited provenance`, () => {
			const p = entry.provenance;
			// Checked against the runtime array as well as the type, so an `as` cast cannot
			// smuggle a disallowed license past `tsc`.
			expect(ICON_LICENSES.includes(p.license), `${entry.id} license ${p.license}`).toBe(true);
			expect(new URL(p.sourceUrl).protocol, `${entry.id} sourceUrl`).toBe("https:");
			expect(p.sourceRef.length, `${entry.id} sourceRef`).toBeGreaterThan(0);
			expect(FORBIDDEN_REFS.has(p.sourceRef), `${entry.id} sourceRef is a moving ref`).toBe(false);
			if (COPYRIGHT_REQUIRED.has(p.license)) {
				expect(
					p.copyright.length,
					`${entry.id} copyright required for ${p.license}`,
				).toBeGreaterThan(0);
			}
		});
	}

	it("binds each Lucide glyph to the installed package version and its upstream license", () => {
		expect(lucidePackage.license).toBe("ISC");
		expect(featherNamesLine, "Lucide LICENSE must identify Feather-derived glyphs").toBeDefined();
		for (const entry of shipping) {
			if (entry.artwork.kind !== "lucide") continue;
			const isFeatherDerived = featherDerivedNames.has(entry.artwork.name);
			expect(entry.provenance.sourceRef, entry.id).toBe(lucidePackage.version);
			expect(entry.provenance.license, entry.id).toBe(isFeatherDerived ? "MIT" : "ISC");
			expect(entry.provenance.project, entry.id).toBe(
				isFeatherDerived ? "Feather (via Lucide)" : "Lucide",
			);
		}
	});
});

describe("provenance audit: shipped path geometry", () => {
	it("every kind:paths entry ships allow-listed path data", () => {
		for (const entry of ICON_ENTRIES) {
			if (entry.artwork.kind !== "paths") continue;
			expect(entry.artwork.paths.length).toBeGreaterThan(0);
			for (const p of entry.artwork.paths) {
				// Re-asserted independently of the parser, so the shipped invariant does not
				// depend on `parseIconSvg` being correct.
				expect(isAllowedPathData(p.d), `${entry.id} d`).toBe(true);
			}
		}
	});
});

describe("provenance audit: trademark policy", () => {
	const thirdPartyIconIds = new Set(
		shipping.filter((entry) => entry.trademark.kind === "third-party").map((entry) => entry.id),
	);

	it("every declared third-party mark has an owner and policy URL", () => {
		for (const entry of shipping) {
			if (entry.trademark.kind !== "third-party") continue;
			expect(entry.trademark.owner.length, `${entry.id} owner`).toBeGreaterThan(0);
			expect(new URL(entry.trademark.policyUrl).protocol, `${entry.id} policyUrl`).toBe("https:");
		}
	});

	it("every shipped Simple Icons artifact is declared as a third-party mark", () => {
		for (const entry of shipping) {
			if (entry.provenance.project !== "Simple Icons") continue;
			expect(entry.trademark.kind, entry.id).toBe("third-party");
		}
	});

	it("no component type uses a third-party mark as its default glyph", () => {
		for (const component of COMPONENT_ENTRIES) {
			expect(
				thirdPartyIconIds.has(component.iconId),
				`${component.id} defaults to third-party mark ${component.iconId}`,
			).toBe(false);
		}
	});
});

describe("provenance audit: NOTICE set equality", () => {
	function attributionKey(e: ShippedIconEntry): string {
		return `${e.provenance.project} — ${e.provenance.license} — ${e.provenance.sourceUrl}`;
	}

	it("the attribution block equals the shipping projects, in both directions", () => {
		const registrySet = new Set(shipping.map(attributionKey));
		const noticeSet = new Set(parseNoticeBlock("icon-attribution"));
		expect(noticeSet).toEqual(registrySet);
	});

	it("the trademark block equals the shipping third-party marks, in both directions", () => {
		const registrySet = new Set(
			shipping
				.filter((e) => e.trademark.kind === "third-party")
				.map((e) =>
					e.trademark.kind === "third-party"
						? `${e.label} — ${e.trademark.owner} — ${e.trademark.policyUrl}`
						: "",
				),
		);
		const noticeSet = new Set(parseNoticeBlock("icon-trademarks"));
		expect(noticeSet).toEqual(registrySet);
	});
});
