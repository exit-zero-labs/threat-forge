/**
 * The `search_component_catalog` read tool.
 *
 * It offers a model a bounded, paginated, deterministic view of the typed
 * component catalog (`#59`) so it can choose an `element.type`, `subtype`, or
 * `icon` before proposing an edit. Matching is delegated to the registry's
 * published `searchComponents` contract; this module only projects each entry to
 * the fields a model can act on and never exposes icon artwork, provenance,
 * license, or any other human-facing attribution metadata.
 *
 * Like the document read tools it is `effect: "read"`, non-destructive, and a
 * pure function of the catalog: it reaches no store and no setting.
 */

import { z } from "zod";
import { defineExecutableTool, type RegisteredTool } from "@/lib/ai/loop/tool-runtime";
import {
	buildReadResult,
	DEFAULT_PAGE_LIMIT,
	describeReadFailure,
	escapeScalar,
	LIST_MAX_ITEMS,
	MAX_PAGE_LIMIT,
	paginate,
	SCALAR_MAX_CODE_POINTS,
} from "@/lib/ai/tools/read-result";
import { searchComponents } from "@/lib/registry/registry";
import type { ComponentCategory, ComponentEntry, ProviderId } from "@/lib/registry/types";

// Exhaustive records over the closed category/provider unions, keyed by the same
// slugs `COMPONENT_CATEGORY_LABELS`/`PROVIDER_LABELS` are keyed by (`registry/types.ts`).
// A new category or provider member fails `tsc --noEmit` here until the tool is
// deliberately updated.
const CATEGORY_SLUGS: Record<ComponentCategory, ComponentCategory> = {
	generic: "generic",
	annotations: "annotations",
	services: "services",
	databases: "databases",
	messaging: "messaging",
	infrastructure: "infrastructure",
	security: "security",
	clients: "clients",
	networking: "networking",
	platform: "platform",
};

const PROVIDER_SLUGS: Record<ProviderId, ProviderId> = {
	generic: "generic",
	aws: "aws",
	azure: "azure",
	gcp: "gcp",
	cloudflare: "cloudflare",
	kubernetes: "kubernetes",
	oss: "oss",
};

/** Cap and escape one catalog scalar. Catalog text is treated as untrusted data. */
function scalar(value: string): string {
	return escapeScalar(value, SCALAR_MAX_CODE_POINTS).text;
}

/** Project a capped list, returning the items and the original length for a `_total`. */
function list(values: readonly string[]): { items: string[]; total: number } {
	const items = values.slice(0, LIST_MAX_ITEMS).map(scalar);
	return { items, total: values.length };
}

/**
 * Project one catalog entry to the allowlisted, model-actionable shape. Icon
 * artwork, provenance, license, copyright, trademark, and source files are never
 * reached; only `icon_id` (a stable `.thf` `element.icon` value) is emitted.
 */
function projectEntry(entry: ComponentEntry): Record<string, unknown> {
	const out: Record<string, unknown> = {
		id: scalar(entry.id),
		label: scalar(entry.label),
		category: entry.category,
		provider: entry.provider,
		icon_id: scalar(entry.iconId),
		shape: entry.shape,
		stride_role: entry.strideRole,
		status: entry.status,
	};

	const aliases = list(entry.aliases);
	out.aliases = aliases.items;
	if (aliases.total > aliases.items.length) out.aliases_total = aliases.total;

	const keywords = list(entry.keywords);
	out.keywords = keywords.items;
	if (keywords.total > keywords.items.length) out.keywords_total = keywords.total;

	const variants = entry.variants.slice(0, LIST_MAX_ITEMS).map((variant) => ({
		id: scalar(variant.id),
		label: scalar(variant.label),
		provider: variant.provider,
		icon_id: scalar(variant.iconId),
	}));
	out.variants = variants;
	if (entry.variants.length > variants.length) out.variants_total = entry.variants.length;

	return out;
}

const catalogInput = {
	query: z.string().min(1).max(SCALAR_MAX_CODE_POINTS).optional(),
	category: z.enum(CATEGORY_SLUGS).optional(),
	provider: z.enum(PROVIDER_SLUGS).optional(),
	include_deprecated: z.boolean().optional(),
	offset: z.int().min(0).optional(),
	limit: z.int().min(1).max(MAX_PAGE_LIMIT).optional(),
};

const searchComponentCatalogTool = defineExecutableTool({
	name: "search_component_catalog",
	description:
		"Return a paginated page of the typed component catalog in registry declaration order, so you " +
		"can choose an element type, subtype, or icon before proposing an edit. Filter by a " +
		"case-insensitive `query`, a `category`, or a `provider`; the `provider` filter also matches " +
		"components whose variants carry that provider. Deprecated entries are excluded unless " +
		"`include_deprecated` is set. Each entry exposes only what an edit can act on — its id, label, " +
		"category, provider, icon_id, shape, stride role, status, aliases, keywords, and variants. " +
		"Pages are bounded by count and by byte size; `next_offset` resumes the rest.",
	input: catalogInput,
	effect: "read",
	destructive: false,
	summarize: (input) =>
		input.query === undefined
			? "Search the component catalog."
			: `Search the component catalog for "${escapeScalar(input.query, SCALAR_MAX_CODE_POINTS).text}".`,
	execute: async (input, _ctx) => {
		const matched = searchComponents(input.query ?? "", {
			category: input.category,
			provider: input.provider,
			includeDeprecated: input.include_deprecated,
		});

		const offset = input.offset ?? 0;
		const limit = input.limit ?? DEFAULT_PAGE_LIMIT;

		if (matched.length > 0 && offset >= matched.length) {
			return {
				status: "error",
				result: describeReadFailure({
					code: "offset_out_of_range",
					kind: "components",
					offset,
					total: matched.length,
				}),
			};
		}

		const { page, results } = paginate(matched, {
			tool: "search_component_catalog",
			offset,
			limit,
			project: projectEntry,
		});
		return {
			status: "ok",
			result: buildReadResult({
				tool: "search_component_catalog",
				payload: { page, results },
			}),
		};
	},
});

/** The single catalog read tool, offered to every tool-capable model. */
export const CATALOG_READ_TOOL: RegisteredTool = searchComponentCatalogTool;
