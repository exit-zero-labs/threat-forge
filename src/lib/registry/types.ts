/**
 * Typed vocabulary for ThreatForge's component taxonomy and icon catalogue.
 *
 * Two ID namespaces are document-visible and permanent — `ComponentEntry.id`
 * (`.thf` `element.type`), `ComponentVariant.id` (`.thf` `element.subtype`), and
 * `IconEntry.id` (`.thf` `element.icon`). Everything else here (labels, categories,
 * providers, keywords, shapes, ordering) is presentation metadata that may change
 * freely. See `docs/knowledge/component-registry.md` for the stability contract.
 */

/** Whether an entry is shown in the palette by default. Deprecated entries still resolve. */
export type EntryStatus = "active" | "deprecated";

/** Closed set of component grouping slugs; display labels are resolved separately. */
export type ComponentCategory =
	| "generic"
	| "annotations"
	| "services"
	| "databases"
	| "messaging"
	| "infrastructure"
	| "security"
	| "clients"
	| "networking"
	| "platform";

/** Closed set of provider slugs. `generic` means no specific vendor. */
export type ProviderId = "generic" | "aws" | "azure" | "gcp" | "cloudflare" | "kubernetes" | "oss";

/** Canvas render shape. Mirrors the legacy `ShapeCategory`. */
export type ShapeKind = "rounded" | "database" | "rect" | "hexagon" | "text";

/** STRIDE role driving threat generation. Mirrors the legacy `StrideCategory`. */
export type StrideRole = "service" | "store" | "actor" | "none";

/** A provider-specific variant of a component, stored as `.thf` `element.subtype`. */
export interface ComponentVariant {
	/** `.thf` `element.subtype` — permanent once released. */
	readonly id: string;
	readonly label: string;
	/** Legacy IDs that resolve to this variant; never rewritten into the document. */
	readonly aliases: readonly string[];
	readonly provider: ProviderId;
	/** Explicit link to an `IconEntry.id`; never inferred from the subtype string. */
	readonly iconId: string;
	readonly status: EntryStatus;
}

/** A component type, stored as `.thf` `element.type`. */
export interface ComponentEntry {
	/** `.thf` `element.type` — permanent once released. */
	readonly id: string;
	readonly label: string;
	/** Legacy IDs that resolve to this entry; never rewritten into the document. */
	readonly aliases: readonly string[];
	readonly category: ComponentCategory;
	readonly provider: ProviderId;
	/** Default `IconEntry.id` for elements of this type with no explicit icon. */
	readonly iconId: string;
	readonly shape: ShapeKind;
	readonly strideRole: StrideRole;
	/** Search synonyms. Distinct from `.thf` `element.tags` (free-form user labels). */
	readonly keywords: readonly string[];
	readonly variants: readonly ComponentVariant[];
	readonly status: EntryStatus;
}

/** A single SVG path reduced from a validated source document. */
export interface IconPath {
	readonly d: string;
	readonly fillRule?: "evenodd" | "nonzero";
}

/**
 * Icon artwork.
 *
 * - `lucide`: renders a bundled `lucide-react` component named by `name`.
 * - `paths`: renders constrained path data derived from a committed upstream source.
 *   `sourceFile` lives inside this variant so a `paths` entry cannot exist without
 *   naming its committed provenance source.
 * - `withdrawn`: ships no artwork; renders `fallbackIconId` instead. The entry's ID
 *   still resolves forever so no `.thf` file that references it breaks.
 */
export interface LucideIconArtwork {
	readonly kind: "lucide";
	readonly name: string;
}

export interface PathIconArtwork {
	readonly kind: "paths";
	readonly viewBox: "0 0 24 24";
	readonly sourceFile: string;
	readonly paths: readonly IconPath[];
}

export interface WithdrawnIconArtwork {
	readonly kind: "withdrawn";
	readonly reason: string;
	readonly fallbackIconId: string;
}

export type IconArtwork = LucideIconArtwork | PathIconArtwork | WithdrawnIconArtwork;

/**
 * Permitted license classes: public-domain and permissive-with-attribution only.
 * Every one is satisfiable by a single static `NOTICE` section and none imposes
 * share-alike on the application. `CC-BY-*`, copyleft, and non-commercial licenses
 * are excluded by design — see `docs/knowledge/component-registry.md`.
 */
export type IconLicense = "CC0-1.0" | "Unlicense" | "MIT" | "ISC" | "BSD-3-Clause" | "Apache-2.0";

/** The permitted license classes as a runtime array, so an `as` cast cannot smuggle a value past `tsc`. */
export const ICON_LICENSES: readonly IconLicense[] = [
	"CC0-1.0",
	"Unlicense",
	"MIT",
	"ISC",
	"BSD-3-Clause",
	"Apache-2.0",
];

/** Machine-audited provenance for an icon's upstream source. */
export interface IconProvenance {
	/** The `NOTICE` attribution key, e.g. "Lucide", "Simple Icons". */
	readonly project: string;
	/** Absolute `https:` URL of the upstream project. */
	readonly sourceUrl: string;
	/** Pinned package version or commit SHA; never "main"/"master"/"HEAD"/"latest". */
	readonly sourceRef: string;
	readonly license: IconLicense;
	/** Required for MIT/ISC/BSD-3-Clause/Apache-2.0; "" for CC0-1.0/Unlicense. */
	readonly copyright: string;
}

/**
 * Trademark metadata. `unmodified: true` records the required policy; the source byte-identity
 * audit proves the geometry actually matches upstream. Third-party marks are used nominatively
 * only and never as a component type's default glyph — see
 * `docs/knowledge/component-registry.md`.
 */
export type IconTrademark =
	| { readonly kind: "none" }
	| {
			readonly kind: "third-party";
			readonly owner: string;
			readonly policyUrl: string;
			readonly unmodified: true;
	  };

interface IconEntryFields {
	/** `.thf` `element.icon` — permanent once released. */
	readonly id: string;
	readonly label: string;
	/** Legacy IDs that resolve to this icon; never rewritten into the document. */
	readonly aliases: readonly string[];
	readonly trademark: IconTrademark;
	readonly status: EntryStatus;
}

/** An icon that ships artwork and therefore must carry provenance. */
export interface ShippedIconEntry extends IconEntryFields {
	readonly artwork: LucideIconArtwork | PathIconArtwork;
	readonly provenance: IconProvenance;
}

/** A permanent icon ID whose artwork is unavailable and therefore carries no provenance. */
export interface WithdrawnIconEntry extends IconEntryFields {
	readonly artwork: WithdrawnIconArtwork;
	readonly provenance: null;
}

/** An icon entry, stored as `.thf` `element.icon`. */
export type IconEntry = ShippedIconEntry | WithdrawnIconEntry;

/** Human-readable display labels for the closed category slug union. */
export const COMPONENT_CATEGORY_LABELS: Readonly<Record<ComponentCategory, string>> = {
	generic: "Generic",
	annotations: "Annotations",
	services: "Services",
	databases: "Databases",
	messaging: "Messaging",
	infrastructure: "Infrastructure",
	security: "Security",
	clients: "Clients",
	networking: "Networking",
	platform: "Cloud / Platform",
};

/** Human-readable display labels for the closed provider slug union. */
export const PROVIDER_LABELS: Readonly<Record<ProviderId, string>> = {
	generic: "Generic",
	aws: "Amazon Web Services",
	azure: "Microsoft Azure",
	gcp: "Google Cloud",
	cloudflare: "Cloudflare",
	kubernetes: "Kubernetes",
	oss: "Open Source",
};
