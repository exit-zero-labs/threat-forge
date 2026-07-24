import { describe, expect, it } from "vitest";
import { ICON_ENTRIES } from "@/lib/registry/icon-entries";
import { isAllowedPathData, parseIconSvg } from "@/lib/registry/icon-source-validation";
import simpleIconsPackage from "../../../node_modules/simple-icons/package.json";

/**
 * Every `kind: "paths"` icon must ship geometry that reduces from a committed upstream source,
 * and that source must be byte-identical to the pinned `simple-icons` package. Vendored sources
 * live in `tests/fixtures/icons/sources/`; the pinned package is read from
 * `node_modules/simple-icons/icons/<slug>.svg` (installed by `npm ci`, seeded locally per
 * `docs/runbooks/adding-an-icon.md`). If `simple-icons` is missing the suite FAILS — it does not
 * skip — so provenance can never silently drift from the upstream artifact.
 *
 * `aws` (the `amazonwebservices` mark) is absent from the pinned release and stays `withdrawn`
 * with its ID retained.
 */

const sources = import.meta.glob<string>("../../../tests/fixtures/icons/sources/*.svg", {
	query: "?raw",
	import: "default",
	eager: true,
});

const pinnedPackage = import.meta.glob<string>("../../../node_modules/simple-icons/icons/*.svg", {
	query: "?raw",
	import: "default",
	eager: true,
});

/**
 * Maps a committed `sourceFile` (named by icon ID) to its upstream `simple-icons` slug.
 * The slug equals the ID except where Simple Icons namespaces the mark differently.
 */
const UPSTREAM_SLUG: Record<string, string> = {
	"kafka.svg": "apachekafka.svg",
};

function readByName(bag: Record<string, string>, name: string): string | undefined {
	const entry = Object.entries(bag).find(([path]) => path.endsWith(`/${name}`));
	return entry?.[1];
}

const iconIds = new Set(ICON_ENTRIES.map((i) => i.id));
const WITHDRAWN_BRANDS = ["aws"];
const PATHS_BRANDS = ["docker", "postgresql", "redis", "mongodb", "nginx", "graphql", "kafka"];

describe("icon entries: lucide-backed artwork", () => {
	for (const entry of ICON_ENTRIES.filter((e) => e.artwork.kind === "lucide")) {
		it(`${entry.id} names a lucide icon`, () => {
			if (entry.artwork.kind === "lucide") {
				expect(entry.artwork.name.length).toBeGreaterThan(0);
			}
		});
	}
});

describe("icon entries: the seven brand marks ship verified path artwork", () => {
	it("simple-icons is installed (fails, never skips, when the package is absent)", () => {
		expect(
			Object.keys(pinnedPackage).length,
			"node_modules/simple-icons/icons is empty — run `npm ci` or seed the pinned icons",
		).toBeGreaterThan(0);
	});

	for (const id of PATHS_BRANDS) {
		it(`${id} ships kind:paths`, () => {
			const entry = ICON_ENTRIES.find((e) => e.id === id);
			expect(entry?.artwork.kind, id).toBe("paths");
		});
	}
});

describe("icon entries: bundled path artwork is byte-identical to the pinned source", () => {
	const pathEntries = ICON_ENTRIES.filter((e) => e.artwork.kind === "paths");

	it("has exactly the seven brand marks", () => {
		expect(pathEntries.length).toBe(PATHS_BRANDS.length);
	});

	for (const entry of pathEntries) {
		it(`${entry.id} committed source equals simple-icons and reduces to its paths`, () => {
			if (entry.artwork.kind !== "paths") return;
			const source = readByName(sources, entry.artwork.sourceFile);
			expect(source, `missing committed source ${entry.artwork.sourceFile}`).toBeDefined();
			if (source === undefined) throw new Error(`missing ${entry.artwork.sourceFile}`);

			const slug = UPSTREAM_SLUG[entry.artwork.sourceFile] ?? entry.artwork.sourceFile;
			const upstream = readByName(pinnedPackage, slug);
			expect(upstream, `simple-icons is missing icons/${slug} for ${entry.id}`).toBeDefined();
			if (upstream === undefined) throw new Error(`simple-icons is missing icons/${slug}`);
			// Byte-identity: the committed fixture must equal the pinned upstream artifact.
			expect(source, `${entry.id} committed source drifted from simple-icons`).toBe(upstream);

			if (entry.provenance === null) {
				throw new Error(`${entry.id} ships path artwork without provenance`);
			}
			expect(entry.provenance.project).toBe("Simple Icons");
			expect(entry.provenance.sourceRef).toBe(simpleIconsPackage.version);

			const result = parseIconSvg(source);
			expect(result.ok, `${entry.id} source must pass parseIconSvg`).toBe(true);
			if (result.ok) {
				expect(result.paths).toEqual(entry.artwork.paths);
			}
			for (const p of entry.artwork.paths) {
				expect(isAllowedPathData(p.d), `${entry.id} d`).toBe(true);
			}
		});
	}
});

describe("icon entries: withdrawn brand marks retain their IDs", () => {
	it("aws is withdrawn with a valid fallback", () => {
		for (const id of WITHDRAWN_BRANDS) {
			const entry = ICON_ENTRIES.find((e) => e.id === id);
			expect(entry, id).toBeDefined();
			const artwork = entry?.artwork;
			expect(artwork?.kind, id).toBe("withdrawn");
			if (artwork?.kind === "withdrawn") {
				expect(artwork.reason.length, id).toBeGreaterThan(0);
				// The fallback must resolve to a real, non-withdrawn icon so nothing renders empty.
				expect(iconIds.has(artwork.fallbackIconId), `${id} fallback`).toBe(true);
				const fallback = ICON_ENTRIES.find((e) => e.id === artwork.fallbackIconId);
				expect(fallback?.artwork.kind, `${id} fallback must ship artwork`).not.toBe("withdrawn");
			}
		}
	});

	it("no withdrawn entry falls back to another withdrawn entry", () => {
		for (const entry of ICON_ENTRIES) {
			const artwork = entry.artwork;
			if (artwork.kind !== "withdrawn") continue;
			const fallback = ICON_ENTRIES.find((e) => e.id === artwork.fallbackIconId);
			expect(fallback, `${entry.id} fallback must resolve`).toBeDefined();
			expect(fallback?.artwork.kind, entry.id).not.toBe("withdrawn");
		}
	});
});
