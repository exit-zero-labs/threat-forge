/**
 * The registry: O(1) lookup, alias resolution, filtered search, and total resolvers built
 * once from entry data. `#58` and `#60` compile against the public functions at the bottom
 * of this file; ordering is declaration order and stable across calls.
 *
 * Resolution is **total**: an unknown `.thf` `type`/`subtype`/`icon` value never throws and
 * never becomes markup — it resolves to an inert generic fallback so the document still
 * opens and renders.
 */

import { COMPONENT_ENTRIES } from "@/lib/registry/component-entries";
import { ICON_ENTRIES } from "@/lib/registry/icon-entries";
import {
	COMPONENT_CATEGORY_LABELS,
	type ComponentCategory,
	type ComponentEntry,
	type ComponentVariant,
	type IconEntry,
	PROVIDER_LABELS,
	type ProviderId,
} from "@/lib/registry/types";

/** The id of the component every unknown `type` resolves to. */
const GENERIC_COMPONENT_ID = "generic";

/** Frozen IDs that the pre-registry renderer accepted through `.thf` `element.subtype`. */
const LEGACY_SUBTYPE_ICON_IDS = new Set([
	"aws",
	"docker",
	"postgresql",
	"redis",
	"mongodb",
	"nginx",
	"graphql",
	"kafka",
]);

/** Filter for `listComponents`/`searchComponents`. */
export interface ComponentFilter {
	readonly category?: ComponentCategory;
	readonly provider?: ProviderId;
	readonly includeDeprecated?: boolean;
}

/** The query object returned by `createRegistry`. */
export interface Registry {
	getComponent(id: string): ComponentEntry | undefined;
	getIcon(id: string): IconEntry | undefined;
	resolveComponent(typeValue: string): ComponentEntry;
	isKnownSubtype(typeValue: string, subtypeValue: string): boolean;
	resolveElementIcon(el: { type: string; subtype?: string; icon?: string }): IconEntry;
	listComponents(filter?: ComponentFilter): readonly ComponentEntry[];
	searchComponents(query: string, filter?: ComponentFilter): readonly ComponentEntry[];
	listCategories(): readonly { id: ComponentCategory; label: string }[];
	listProviders(): readonly { id: ProviderId; label: string }[];
}

/** Build a search haystack once per entry. */
function buildHaystack(entry: ComponentEntry): string {
	return [
		entry.label,
		entry.id,
		...entry.aliases,
		...entry.keywords,
		COMPONENT_CATEGORY_LABELS[entry.category],
		PROVIDER_LABELS[entry.provider],
		...entry.variants.flatMap((v) => [v.label, v.id, ...v.aliases, PROVIDER_LABELS[v.provider]]),
	]
		.join(" ")
		.toLowerCase();
}

/**
 * Construct a registry from component and icon entry data. The factory exists so the scale
 * test can build a synthetic registry without shipping thousands of entries, mirroring the
 * injected-factory pattern in `src/stores/document-stores.ts`.
 */
export function createRegistry(
	components: readonly ComponentEntry[],
	icons: readonly IconEntry[],
): Registry {
	const componentById = new Map<string, ComponentEntry>();
	const componentAlias = new Map<string, string>();
	const iconById = new Map<string, IconEntry>();
	const iconAlias = new Map<string, string>();
	const byCategory = new Map<ComponentCategory, ComponentEntry[]>();
	const byProvider = new Map<ProviderId, ComponentEntry[]>();
	const variantsByComponentId = new Map<string, Map<string, ComponentVariant>>();
	const haystacks = new Map<string, string>();
	const categoryOrder: ComponentCategory[] = [];
	const providerOrder: ProviderId[] = [];

	for (const entry of components) {
		componentById.set(entry.id, entry);
		for (const alias of entry.aliases) componentAlias.set(alias, entry.id);
		const variants = new Map<string, ComponentVariant>();
		for (const variant of entry.variants) {
			variants.set(variant.id, variant);
			for (const alias of variant.aliases) variants.set(alias, variant);
		}
		variantsByComponentId.set(entry.id, variants);
		haystacks.set(entry.id, buildHaystack(entry));

		let categoryBucket = byCategory.get(entry.category);
		if (!categoryBucket) {
			categoryBucket = [];
			byCategory.set(entry.category, categoryBucket);
			if (entry.category !== "generic") categoryOrder.push(entry.category);
		}
		categoryBucket.push(entry);

		const entryProviders = new Set<ProviderId>([
			entry.provider,
			...entry.variants.map((variant) => variant.provider),
		]);
		for (const provider of entryProviders) {
			let providerBucket = byProvider.get(provider);
			if (!providerBucket) {
				providerBucket = [];
				byProvider.set(provider, providerBucket);
				providerOrder.push(provider);
			}
			providerBucket.push(entry);
		}
	}

	for (const icon of icons) {
		iconById.set(icon.id, icon);
		for (const alias of icon.aliases) iconAlias.set(alias, icon.id);
	}

	function getComponent(id: string): ComponentEntry | undefined {
		return componentById.get(id) ?? componentById.get(componentAlias.get(id) ?? "");
	}

	function getIcon(id: string): IconEntry | undefined {
		return iconById.get(id) ?? iconById.get(iconAlias.get(id) ?? "");
	}

	function resolveComponent(typeValue: string): ComponentEntry {
		const entry = getComponent(typeValue);
		if (entry) return entry;
		const generic = componentById.get(GENERIC_COMPONENT_ID);
		if (!generic) throw new Error("registry is missing the required generic component");
		return generic;
	}

	function genericIcon(): IconEntry {
		const generic = componentById.get(GENERIC_COMPONENT_ID);
		const fallback = generic ? getIcon(generic.iconId) : undefined;
		if (!fallback) throw new Error("registry is missing the required generic fallback icon");
		return fallback;
	}

	function findVariant(component: ComponentEntry, subtype: string): ComponentVariant | undefined {
		return variantsByComponentId.get(component.id)?.get(subtype);
	}

	function resolveSubtypeIcon(component: ComponentEntry, subtype: string): IconEntry | undefined {
		if (LEGACY_SUBTYPE_ICON_IDS.has(subtype)) {
			const legacyIcon = getIcon(subtype);
			if (legacyIcon) return legacyIcon;
		}
		const variant = findVariant(component, subtype);
		if (variant) return getIcon(variant.iconId);
		const subtypeComponent = getComponent(subtype);
		return subtypeComponent ? getIcon(subtypeComponent.iconId) : undefined;
	}

	function isKnownSubtype(typeValue: string, subtypeValue: string): boolean {
		const component = getComponent(typeValue);
		return component ? resolveSubtypeIcon(component, subtypeValue) !== undefined : false;
	}

	// Legacy subtype brand → subtype variant/component → explicit icon → component default →
	// generic fallback. The narrow brand branch preserves the former service-icon contract.
	function resolveElementIcon(el: { type: string; subtype?: string; icon?: string }): IconEntry {
		const component = resolveComponent(el.type);
		if (el.subtype) {
			const subtypeIcon = resolveSubtypeIcon(component, el.subtype);
			if (subtypeIcon) return subtypeIcon;
		}
		if (el.icon) {
			const icon = getIcon(el.icon);
			if (icon) return icon;
		}
		const componentIcon = getIcon(component.iconId);
		if (componentIcon) return componentIcon;
		return genericIcon();
	}

	function matchesFilter(entry: ComponentEntry, filter?: ComponentFilter): boolean {
		if (!filter?.includeDeprecated && entry.status === "deprecated") return false;
		if (filter?.category && entry.category !== filter.category) return false;
		return true;
	}

	function candidates(filter?: ComponentFilter): readonly ComponentEntry[] {
		if (filter?.provider) return byProvider.get(filter.provider) ?? [];
		if (filter?.category) return byCategory.get(filter.category) ?? [];
		return components;
	}

	function listComponents(filter?: ComponentFilter): readonly ComponentEntry[] {
		return candidates(filter).filter((entry) => matchesFilter(entry, filter));
	}

	function searchComponents(query: string, filter?: ComponentFilter): readonly ComponentEntry[] {
		const q = query.trim().toLowerCase();
		if (!q) return listComponents(filter);
		return candidates(filter).filter(
			(entry) => matchesFilter(entry, filter) && (haystacks.get(entry.id) ?? "").includes(q),
		);
	}

	function listCategories(): readonly { id: ComponentCategory; label: string }[] {
		return categoryOrder.map((id) => ({ id, label: COMPONENT_CATEGORY_LABELS[id] }));
	}

	function listProviders(): readonly { id: ProviderId; label: string }[] {
		return providerOrder.map((id) => ({ id, label: PROVIDER_LABELS[id] }));
	}

	return {
		getComponent,
		getIcon,
		resolveComponent,
		isKnownSubtype,
		resolveElementIcon,
		listComponents,
		searchComponents,
		listCategories,
		listProviders,
	};
}

/** The shipped registry, built once from the committed entry data. */
export const registry: Registry = createRegistry(COMPONENT_ENTRIES, ICON_ENTRIES);

export const getComponent = (id: string): ComponentEntry | undefined => registry.getComponent(id);
export const getIcon = (id: string): IconEntry | undefined => registry.getIcon(id);
export const resolveComponent = (typeValue: string): ComponentEntry =>
	registry.resolveComponent(typeValue);
export const isKnownSubtype = (typeValue: string, subtypeValue: string): boolean =>
	registry.isKnownSubtype(typeValue, subtypeValue);
export const resolveElementIcon = (el: {
	type: string;
	subtype?: string;
	icon?: string;
}): IconEntry => registry.resolveElementIcon(el);
export const listComponents = (filter?: ComponentFilter): readonly ComponentEntry[] =>
	registry.listComponents(filter);
export const searchComponents = (
	query: string,
	filter?: ComponentFilter,
): readonly ComponentEntry[] => registry.searchComponents(query, filter);
export const listCategories = (): readonly { id: ComponentCategory; label: string }[] =>
	registry.listCategories();
export const listProviders = (): readonly { id: ProviderId; label: string }[] =>
	registry.listProviders();
