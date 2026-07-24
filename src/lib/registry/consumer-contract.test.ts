import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import { getComponent, getIcon, isKnownSubtype } from "@/lib/registry/registry";
import { loadTemplate, TEMPLATES } from "@/lib/templates";

/**
 * The guard `#60` inherits: every `type`, `subtype`, and `icon` value referenced by a shipped
 * template or a committed `.thf` fixture must resolve to a real (non-fallback) registry entry.
 * A template or fixture that names a renamed or missing ID fails here rather than shipping
 * broken.
 */

interface ElementVocab {
	type?: unknown;
	subtype?: unknown;
	icon?: unknown;
}

function assertElementResolves(source: string, el: ElementVocab): void {
	if (typeof el.type === "string") {
		expect(getComponent(el.type), `${source}: type "${el.type}" does not resolve`).toBeDefined();
	}
	if (typeof el.subtype === "string") {
		expect(
			typeof el.type === "string" && isKnownSubtype(el.type, el.subtype),
			`${source}: subtype "${el.subtype}" does not resolve for type "${String(el.type)}"`,
		).toBe(true);
	}
	if (typeof el.icon === "string") {
		expect(getIcon(el.icon), `${source}: icon "${el.icon}" does not resolve`).toBeDefined();
	}
}

function isElementVocab(value: unknown): value is ElementVocab {
	return typeof value === "object" && value !== null;
}

describe("consumer contract: shipped templates resolve", () => {
	for (const info of TEMPLATES) {
		it(`${info.id} references only real registry entries`, () => {
			const model = loadTemplate(info.id);
			expect(model, `${info.id} failed to load`).not.toBeNull();
			for (const el of model?.elements ?? []) {
				assertElementResolves(`template ${info.id}`, el);
			}
		});
	}
});

describe("consumer contract: committed .thf fixtures resolve", () => {
	const fixtures = import.meta.glob<string>("../../../tests/fixtures/thf/**/*.thf", {
		query: "?raw",
		import: "default",
		eager: true,
	});

	for (const [path, raw] of Object.entries(fixtures)) {
		it(`${path} references only real registry entries`, () => {
			let parsed: unknown;
			try {
				parsed = load(raw);
			} catch (error) {
				if (path.endsWith("/invalid/truncated.thf")) return;
				throw error;
			}
			const elements =
				parsed && typeof parsed === "object" && "elements" in parsed ? parsed.elements : undefined;
			if (!Array.isArray(elements)) return;
			for (const el of elements) {
				if (isElementVocab(el)) assertElementResolves(path, el);
			}
		});
	}
});
