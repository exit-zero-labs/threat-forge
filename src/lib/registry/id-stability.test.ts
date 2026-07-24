import { describe, expect, it } from "vitest";
import { COMPONENT_ENTRIES } from "@/lib/registry/component-entries";
import { ICON_ENTRIES } from "@/lib/registry/icon-entries";
import { getComponent, getIcon } from "@/lib/registry/registry";
import manifest from "../../../tests/fixtures/registry/shipped-ids.json";

/**
 * The ID stability contract. `shipped-ids.json` is the public ID floor: IDs are appended,
 * never removed or renamed. A rename is a new entry whose `aliases` contains the old ID; a
 * retirement is `status: "deprecated"`, not deletion. See
 * `docs/knowledge/component-registry.md`.
 */

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

const componentIds = COMPONENT_ENTRIES.map((c) => c.id);
const componentAliases = COMPONENT_ENTRIES.flatMap((c) => c.aliases);
const variantIds = COMPONENT_ENTRIES.flatMap((c) => c.variants.map((v) => v.id));
const variantAliases = COMPONENT_ENTRIES.flatMap((c) => c.variants.flatMap((v) => v.aliases));
const iconIds = ICON_ENTRIES.map((i) => i.id);
const iconAliases = ICON_ENTRIES.flatMap((i) => i.aliases);

/** All values that a variant lookup accepts (canonical ids and aliases). */
const variantResolvable = new Set([...variantIds, ...variantAliases]);

describe("id-stability: every manifest ID still resolves", () => {
	// The removal/rename trip-wire: a manifest ID that no longer resolves means an entry was
	// deleted or renamed. The fix is a `status: "deprecated"` entry or an `aliases` entry —
	// never dropping the ID from the manifest.
	for (const id of manifest.componentIds) {
		it(`component ${id} resolves`, () => {
			expect(
				getComponent(id),
				`component id "${id}" no longer resolves. IDs are permanent: add a deprecated entry or an alias instead of removing it.`,
			).toBeDefined();
		});
	}
	for (const id of manifest.variantIds) {
		it(`variant ${id} resolves`, () => {
			expect(
				variantResolvable.has(id),
				`variant id "${id}" no longer resolves. Add it back as a variant or an alias.`,
			).toBe(true);
		});
	}
	for (const id of manifest.iconIds) {
		it(`icon ${id} resolves`, () => {
			expect(
				getIcon(id),
				`icon id "${id}" no longer resolves. IDs are permanent: withdraw the artwork or add an alias instead of removing it.`,
			).toBeDefined();
		});
	}
});

describe("id-stability: registry ID set equals the manifest set", () => {
	// Additions are reported as an actionable, one-line diff so growth stays reviewed.
	const cases: { name: string; registry: string[]; manifest: string[]; file: string }[] = [
		{
			name: "components",
			registry: componentIds,
			manifest: manifest.componentIds,
			file: "componentIds",
		},
		{ name: "variants", registry: variantIds, manifest: manifest.variantIds, file: "variantIds" },
		{ name: "icons", registry: iconIds, manifest: manifest.iconIds, file: "iconIds" },
	];

	for (const { name, registry, manifest: manifestIds, file } of cases) {
		it(`${name}: no unmanifested additions`, () => {
			const manifestSet = new Set(manifestIds);
			const added = registry.filter((id) => !manifestSet.has(id));
			expect(
				added,
				`append ${added.map((id) => `"${id}"`).join(", ")} to shipped-ids.json (${file})`,
			).toEqual([]);
		});
	}
});

describe("id-stability: ID hygiene", () => {
	it("component ids are unique and well-formed", () => {
		expect(new Set(componentIds).size).toBe(componentIds.length);
		for (const id of componentIds) expect(id, id).toMatch(ID_PATTERN);
	});
	it("variant ids are unique and well-formed", () => {
		expect(new Set(variantIds).size).toBe(variantIds.length);
		for (const id of variantIds) expect(id, id).toMatch(ID_PATTERN);
	});
	it("icon ids are unique and well-formed", () => {
		expect(new Set(iconIds).size).toBe(iconIds.length);
		for (const id of iconIds) expect(id, id).toMatch(ID_PATTERN);
	});

	it("no alias collides with a canonical id or another alias in its namespace", () => {
		for (const [namespace, ids, aliases] of [
			["component", componentIds, componentAliases],
			["variant", variantIds, variantAliases],
			["icon", iconIds, iconAliases],
		] as const) {
			const canonical = new Set(ids);
			const seen = new Set<string>();
			for (const alias of aliases) {
				expect(
					canonical.has(alias),
					`${namespace} alias "${alias}" collides with a canonical id`,
				).toBe(false);
				expect(seen.has(alias), `${namespace} alias "${alias}" is claimed twice`).toBe(false);
				seen.add(alias);
			}
		}
	});
});
