import { describe, expect, it } from "vitest";
import { createRegistry } from "@/lib/registry/registry";
import type { ComponentEntry, ComponentVariant, IconEntry, ProviderId } from "@/lib/registry/types";

/**
 * A scale trip-wire, not a benchmark. The budgets carry ~an order of magnitude of headroom
 * over the shipped registry so a regression — e.g. reintroducing a linear `Array.find` or a
 * per-query `new RegExp` — trips them, while normal variance does not. The measured local
 * timing is recorded in the PR body.
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

describe("registry scale budget", () => {
	const { components, icons } = synthetic();

	it("constructs a 5,000-entry registry under 100 ms", () => {
		const start = performance.now();
		createRegistry(components, icons);
		const elapsed = performance.now() - start;
		expect(elapsed, `construction took ${elapsed.toFixed(1)}ms`).toBeLessThan(100);
	});

	it("answers 200 mixed queries under 250 ms and stays correct at scale", () => {
		const registry = createRegistry(components, icons);
		const start = performance.now();
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
			registry.searchComponents(`keyword-${n}`);
			registry.listComponents({ category: "services" });
			registry.listComponents({ provider: PROVIDERS[n % PROVIDERS.length] });
		}
		const elapsed = performance.now() - start;
		expect(elapsed, `200 mixed queries took ${elapsed.toFixed(1)}ms`).toBeLessThan(250);
	});

	it("exact-ID lookup at scale returns the right entry (guards against linear find)", () => {
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
