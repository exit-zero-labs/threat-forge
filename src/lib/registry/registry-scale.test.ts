import { describe, expect, it } from "vitest";
import { createRegistry } from "@/lib/registry/registry";
import type { ComponentEntry, ComponentVariant, IconEntry, ProviderId } from "@/lib/registry/types";

/**
 * A scale trip-wire, not a benchmark.
 *
 * Every guard here counts work rather than measuring time. The fixture arrays and entries handed
 * to `createRegistry` are wrapped in proxies that tally reads, so each test asserts an exact
 * integer: a `Map`-backed lookup touches zero array elements, a cached haystack never reads
 * `keywords`, and construction visits each entry once. Those counts are identical on an idle
 * laptop and on a saturated CI runner, which is the whole point.
 *
 * The file previously asserted wall-clock budgets and #248 is the record of why it no longer
 * does. The mixed-query budget flaked on CI at 250.7ms and 278.6ms against a 250ms limit while
 * passing locally, and measurement showed it did not detect the per-query `new RegExp`
 * regression its docblock claimed to guard — timings were indistinguishable with and without it.
 * A ratio between two timed windows was tried next and rejected for the same root cause: it
 * cancels sustained slowness but not scheduler preemption, and reviewers reproduced it going red
 * on healthy code in roughly a fifth of full-suite runs. The construction budget was dropped
 * last, having been caught failing once in eighteen loaded runs despite ~20x headroom measured
 * in isolation — headroom measured on an idle machine is not headroom.
 *
 * What is deliberately not guarded: the constant factor of `searchComponents`. It scans every
 * entry by design, so its cost is linear even when healthy. This file catches the algorithmic
 * regressions — losing an index, losing a memo — and pinning a constant needs a benchmark
 * harness rather than a trip-wire.
 */

const SIZE = 5000;
const PROVIDERS: ProviderId[] = [
	"generic",
	"aws",
	"azure",
	"gcp",
	"cloudflare",
	"kubernetes",
	"oss",
];

function synthetic(): { components: ComponentEntry[]; icons: IconEntry[] } {
	const variants: ComponentVariant[] = Array.from({ length: SIZE }, (_, i) => ({
		id: `variant-${i}`,
		label: `Variant ${i}`,
		aliases: [`variant-alias-${i}`],
		provider: PROVIDERS[i % PROVIDERS.length],
		iconId: `icon-${i}`,
		status: "active",
	}));
	const components: ComponentEntry[] = [
		{
			id: "generic",
			label: "Generic",
			aliases: [],
			category: "generic",
			provider: "generic",
			iconId: "icon-0",
			shape: "rounded",
			strideRole: "service",
			keywords: [],
			variants,
			status: "active",
		},
	];
	const icons: IconEntry[] = [];
	for (let i = 0; i < SIZE; i++) {
		components.push({
			id: `component-${i}`,
			label: `Component ${i}`,
			aliases: [`alias-${i}`],
			category: "services",
			provider: PROVIDERS[i % PROVIDERS.length],
			iconId: `icon-${i}`,
			shape: "rounded",
			strideRole: "service",
			keywords: [`keyword-${i}`, `synthetic`],
			variants: [],
			status: "active",
		});
		icons.push({
			id: `icon-${i}`,
			label: `Icon ${i}`,
			aliases: [],
			artwork: { kind: "lucide", name: "box" },
			provenance: {
				project: "Lucide",
				sourceUrl: "https://github.com/lucide-icons/lucide",
				sourceRef: "1.25.0",
				license: "ISC",
				copyright: "Lucide Contributors",
			},
			trademark: { kind: "none" },
			status: "active",
		});
	}
	return { components, icons };
}

/**
 * Instruments the fixture so a test can assert how much work a call did instead of how long it
 * took. `watchArray` tallies indexed reads, which is how losing an index shows up: a `Map` lookup
 * reads no elements while an `Array.find` reads thousands. `watchEntry` tallies reads of a single
 * property, which is how losing a memo shows up: `buildHaystack` reads `keywords`, and a cached
 * haystack never does.
 */
function scanCounter(watchedProperty: keyof ComponentEntry) {
	let arrayReads = 0;
	let propertyReads = 0;

	function watchArray<T extends object>(items: readonly T[]): readonly T[] {
		return new Proxy(items, {
			get(target, prop, receiver) {
				if (typeof prop === "string" && Number.isInteger(Number(prop))) arrayReads += 1;
				return Reflect.get(target, prop, receiver);
			},
		});
	}

	function watchEntry(entry: ComponentEntry): ComponentEntry {
		return new Proxy(entry, {
			get(target, prop, receiver) {
				if (prop === watchedProperty) propertyReads += 1;
				return Reflect.get(target, prop, receiver);
			},
		});
	}

	return {
		watchArray,
		watchEntry,
		arrayReads: () => arrayReads,
		propertyReads: () => propertyReads,
		reset: () => {
			arrayReads = 0;
			propertyReads = 0;
		},
	};
}

/** Wires the whole fixture through one counter, including the per-component variant arrays. */
function instrumented(components: ComponentEntry[], icons: IconEntry[]) {
	const counter = scanCounter("keywords");
	const entries = components.map((entry) =>
		counter.watchEntry({
			...entry,
			variants: counter.watchArray(entry.variants) as ComponentVariant[],
		}),
	);
	const registry = createRegistry(counter.watchArray(entries), counter.watchArray(icons));
	return { registry, counter };
}

describe("registry scale budget", () => {
	const { components, icons } = synthetic();
	// Every watched array element: components, icons, and the generic component's variants.
	const ELEMENT_COUNT = SIZE + 1 + SIZE + SIZE;

	it("builds its indexes in a single pass over each entry", () => {
		const { counter } = instrumented(components, icons);
		// Measured at 25,001 reads for 15,001 elements: entries once, variants three times (the
		// variant index, the haystack, and the provider set). A nested scan measures 12.5M.
		expect(
			counter.arrayReads(),
			`construction read ${counter.arrayReads()} array elements for ${ELEMENT_COUNT} ` +
				"elements; a bounded number of passes is expected, a large multiple means a nested scan",
		).toBeLessThanOrEqual(ELEMENT_COUNT * 4);
	});

	it("stays correct at scale", () => {
		const registry = createRegistry(components, icons);
		expect(registry.listComponents({ category: "services" })).toHaveLength(SIZE);
		for (let i = 0; i < 200; i++) {
			const n = (i * 37) % SIZE;
			expect(registry.getComponent(`component-${n}`)?.id).toBe(`component-${n}`);
			expect(registry.resolveComponent(`alias-${n}`).id).toBe(`component-${n}`);
			expect(
				registry.resolveElementIcon({
					type: "generic",
					subtype: `variant-alias-${n}`,
				}).id,
			).toBe(`icon-${n}`);

			// `keyword-42` is a substring of `keyword-420`, so the match set is a prefix family
			// rather than a single entry. Asserting the family pins that search honours its query;
			// `toContain` alone stays green when the query is ignored entirely.
			const hits = registry.searchComponents(`keyword-${n}`).map((e) => e.id);
			expect(hits).toContain(`component-${n}`);
			expect(hits.filter((id) => !id.startsWith(`component-${n}`))).toEqual([]);

			const provider = PROVIDERS[n % PROVIDERS.length];
			const listed = registry.listComponents({ provider });
			expect(listed.length).toBeGreaterThan(0);
			expect(
				listed.every(
					(e) => e.provider === provider || e.variants.some((v) => v.provider === provider),
				),
				`listComponents({ provider: "${provider}" }) returned an entry from another provider`,
			).toBe(true);
		}
	});

	it("resolves ids, aliases, and variants without scanning any entry array", () => {
		const { registry, counter } = instrumented(components, icons);

		// Construction is allowed one pass over everything; only lookups are under test.
		counter.reset();
		for (let i = 0; i < 200; i++) {
			const n = (i * 37) % SIZE;
			expect(registry.getComponent(`component-${n}`)?.id).toBe(`component-${n}`);
			expect(registry.resolveComponent(`alias-${n}`).id).toBe(`component-${n}`);
			expect(
				registry.resolveElementIcon({ type: "generic", subtype: `variant-alias-${n}` }).id,
			).toBe(`icon-${n}`);
		}

		expect(
			counter.arrayReads(),
			`lookups walked ${counter.arrayReads()} array elements; a map-backed registry walks ` +
				"none, so this is a linear scan reintroduced on the lookup path",
		).toBe(0);
	});

	it("searches the prebuilt haystack instead of rebuilding it per query", () => {
		const { registry, counter } = instrumented(components, icons);

		counter.reset();
		for (let i = 0; i < 20; i++) {
			expect(registry.searchComponents(`keyword-${i}`).length).toBeGreaterThan(0);
		}

		expect(
			counter.propertyReads(),
			`search read entry.keywords ${counter.propertyReads()} times; the haystack is built ` +
				"once during construction, so any read here means it is being rebuilt per query",
		).toBe(0);
	});

	it("resolves the last entry, the worst case for any scan-based lookup", () => {
		const registry = createRegistry(components, icons);
		expect(registry.getComponent(`component-${SIZE - 1}`)?.iconId).toBe(`icon-${SIZE - 1}`);
		expect(
			registry.resolveElementIcon({
				type: "generic",
				subtype: `variant-alias-${SIZE - 1}`,
			}).id,
		).toBe(`icon-${SIZE - 1}`);
	});
});
