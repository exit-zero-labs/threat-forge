import { describe, expect, it } from "vitest";
import { COMPONENT_ENTRIES } from "@/lib/registry/component-entries";
import { getComponent, resolveElementIcon } from "@/lib/registry/registry";

/**
 * Characterization of the registry's component taxonomy and icon resolution — retargeted from
 * the deleted legacy modules (`component-library`, `service-icons`) onto the registry that now
 * backs every consumer (`#59` Step 8). The tables below are written out literally rather than
 * derived from the module under test, so a single edit to a component's shape, STRIDE role, or
 * default icon fails the matching row here.
 *
 * Deliberate, separately authorized deviations from the legacy resolver, each stated at its
 * assertion: (a) an explicit `element.icon` now beats the component default even when it is not
 * a brand icon; (b) an unknown `type`/`subtype`/`icon` resolves to the inert generic glyph
 * instead of nothing; (c) `data_store` and `external_entity` now carry their Rust-parity STRIDE
 * roles (`#59` Step 9), closing the desktop/browser divergence the legacy browser engine had.
 */

const COMPONENT_TABLE: { id: string; shape: string; strideRole: string; iconId: string }[] = [
	{ id: "generic", shape: "rounded", strideRole: "service", iconId: "box" },
	{ id: "text", shape: "text", strideRole: "none", iconId: "type" },
	{ id: "web_server", shape: "rounded", strideRole: "service", iconId: "globe" },
	{ id: "api_gateway", shape: "rounded", strideRole: "service", iconId: "router" },
	{ id: "microservice", shape: "rounded", strideRole: "service", iconId: "boxes" },
	{ id: "serverless_function", shape: "rounded", strideRole: "service", iconId: "zap" },
	{ id: "background_worker", shape: "rounded", strideRole: "service", iconId: "cog" },
	{ id: "sql_database", shape: "database", strideRole: "store", iconId: "database" },
	{ id: "nosql_database", shape: "database", strideRole: "store", iconId: "hard-drive" },
	{ id: "cache", shape: "database", strideRole: "store", iconId: "memory-stick" },
	{ id: "search_index", shape: "database", strideRole: "store", iconId: "search" },
	{ id: "object_storage", shape: "database", strideRole: "store", iconId: "archive" },
	{ id: "message_queue", shape: "rounded", strideRole: "service", iconId: "mail-open" },
	{ id: "event_bus", shape: "rounded", strideRole: "service", iconId: "radio" },
	{ id: "stream_processor", shape: "rounded", strideRole: "service", iconId: "activity" },
	{ id: "load_balancer", shape: "hexagon", strideRole: "service", iconId: "scale" },
	{ id: "cdn", shape: "hexagon", strideRole: "service", iconId: "globe" },
	{ id: "dns", shape: "hexagon", strideRole: "service", iconId: "at-sign" },
	{ id: "proxy", shape: "hexagon", strideRole: "service", iconId: "arrow-left-right" },
	{ id: "container", shape: "hexagon", strideRole: "service", iconId: "container" },
	{ id: "auth_provider", shape: "rounded", strideRole: "service", iconId: "key-round" },
	{ id: "firewall", shape: "rounded", strideRole: "service", iconId: "shield-check" },
	{ id: "secret_manager", shape: "database", strideRole: "store", iconId: "lock" },
	{ id: "certificate_authority", shape: "rounded", strideRole: "service", iconId: "file-badge" },
	{ id: "web_browser", shape: "rect", strideRole: "actor", iconId: "monitor-smartphone" },
	{ id: "mobile_app", shape: "rect", strideRole: "actor", iconId: "smartphone" },
	{ id: "desktop_app", shape: "rect", strideRole: "actor", iconId: "monitor" },
	{ id: "iot_device", shape: "rect", strideRole: "actor", iconId: "cpu" },
	{ id: "api_client", shape: "rect", strideRole: "actor", iconId: "code-2" },
	{ id: "cli_tool", shape: "rect", strideRole: "actor", iconId: "terminal" },
	{ id: "vpn_gateway", shape: "hexagon", strideRole: "service", iconId: "shield" },
	{ id: "api_endpoint", shape: "rounded", strideRole: "service", iconId: "waypoints" },
	{ id: "webhook", shape: "rounded", strideRole: "service", iconId: "webhook" },
	{ id: "service_mesh", shape: "hexagon", strideRole: "service", iconId: "network" },
	{ id: "file_storage", shape: "database", strideRole: "store", iconId: "folder-archive" },
	{ id: "data_lake", shape: "database", strideRole: "store", iconId: "waves" },
	{ id: "backup_service", shape: "database", strideRole: "store", iconId: "cloud-upload" },
	{ id: "waf", shape: "rounded", strideRole: "service", iconId: "shield-alert" },
	{ id: "siem", shape: "rounded", strideRole: "service", iconId: "radar" },
	{ id: "identity_provider", shape: "rounded", strideRole: "service", iconId: "user-check" },
	{ id: "key_management", shape: "database", strideRole: "store", iconId: "key-square" },
	{ id: "kubernetes", shape: "hexagon", strideRole: "service", iconId: "ship" },
	{ id: "serverless_platform", shape: "hexagon", strideRole: "service", iconId: "cloud-cog" },
	{ id: "ci_cd_pipeline", shape: "hexagon", strideRole: "service", iconId: "git-branch" },
	{ id: "container_registry", shape: "database", strideRole: "store", iconId: "package-check" },
];

const VARIANT_TABLE: { component: string; variant: string; iconId: string }[] = [
	{ component: "sql_database", variant: "rds", iconId: "database" },
	{ component: "sql_database", variant: "azure_sql", iconId: "database" },
	{ component: "sql_database", variant: "cloud_sql", iconId: "database" },
	{ component: "nosql_database", variant: "dynamodb", iconId: "hard-drive" },
	{ component: "nosql_database", variant: "cosmosdb", iconId: "hard-drive" },
	{ component: "cache", variant: "redis", iconId: "redis" },
	{ component: "cache", variant: "memcached", iconId: "memory-stick" },
	{ component: "object_storage", variant: "s3", iconId: "archive" },
	{ component: "object_storage", variant: "azure_blob", iconId: "archive" },
	{ component: "object_storage", variant: "gcs", iconId: "archive" },
	{ component: "message_queue", variant: "sqs", iconId: "mail-open" },
	{ component: "message_queue", variant: "rabbitmq", iconId: "mail-open" },
	{ component: "event_bus", variant: "kafka", iconId: "kafka" },
	{ component: "event_bus", variant: "sns", iconId: "radio" },
	{ component: "cdn", variant: "cloudfront", iconId: "globe" },
	{ component: "cdn", variant: "cloudflare", iconId: "globe" },
];

const ACTIVE_IDS = COMPONENT_ENTRIES.filter((c) => c.status === "active").map((c) => c.id);

describe("taxonomy characterization: shape, STRIDE role, and default icon", () => {
	it("covers exactly the 45 shipped active components", () => {
		expect([...ACTIVE_IDS].sort()).toEqual(COMPONENT_TABLE.map((r) => r.id).sort());
	});

	for (const row of COMPONENT_TABLE) {
		it(`${row.id} has shape ${row.shape} / STRIDE ${row.strideRole} / icon ${row.iconId}`, () => {
			const comp = getComponent(row.id);
			expect(comp?.shape, row.id).toBe(row.shape);
			expect(comp?.strideRole, row.id).toBe(row.strideRole);
			expect(comp?.iconId, row.id).toBe(row.iconId);
		});
	}
});

describe("taxonomy characterization: variant default icons", () => {
	it("covers exactly the shipped variants", () => {
		const registryVariants = COMPONENT_ENTRIES.flatMap((c) =>
			c.variants.map((v) => `${c.id}:${v.id}`),
		);
		expect(registryVariants.sort()).toEqual(
			VARIANT_TABLE.map((r) => `${r.component}:${r.variant}`).sort(),
		);
	});

	for (const row of VARIANT_TABLE) {
		it(`${row.component}/${row.variant} resolves to icon ${row.iconId}`, () => {
			const variant = getComponent(row.component)?.variants.find((v) => v.id === row.variant);
			expect(variant?.iconId, `${row.component}/${row.variant}`).toBe(row.iconId);
		});
	}
});

describe("taxonomy characterization: icon resolution identity", () => {
	// Real (type, subtype) pairs: a brand subtype resolves to its brand icon id. `redis` and
	// `kafka` are the two brand marks reachable through a variant.
	it("cache/redis resolves to the redis brand icon", () => {
		expect(resolveElementIcon({ type: "cache", subtype: "redis" }).id).toBe("redis");
	});
	it("event_bus/kafka resolves to the kafka brand icon", () => {
		expect(resolveElementIcon({ type: "event_bus", subtype: "kafka" }).id).toBe("kafka");
	});

	// Legacy documents could select each service icon through either `subtype` or `icon`.
	const brandIcons = [
		"aws",
		"docker",
		"postgresql",
		"redis",
		"mongodb",
		"nginx",
		"graphql",
		"kafka",
	];
	for (const brand of brandIcons) {
		it(`subtype "${brand}" resolves to the ${brand} icon entry`, () => {
			expect(resolveElementIcon({ type: "generic", subtype: brand }).id).toBe(brand);
		});
		it(`icon "${brand}" resolves to the ${brand} icon entry`, () => {
			expect(resolveElementIcon({ type: "generic", icon: brand }).id).toBe(brand);
		});
	}

	// Real `.thf` fixture triples resolve to their component/variant/icon default.
	const fixtureCases: {
		input: { type: string; subtype?: string; icon?: string };
		expected: string;
	}[] = [
		{ input: { type: "process", subtype: "api_gateway", icon: "router" }, expected: "router" },
		{
			input: { type: "data_store", subtype: "sql_database", icon: "database" },
			expected: "database",
		},
		{ input: { type: "external_entity" }, expected: "box" },
		{ input: { type: "text" }, expected: "type" },
		{ input: { type: "web_server" }, expected: "globe" },
		{ input: { type: "sql_database" }, expected: "database" },
		{ input: { type: "cache" }, expected: "memory-stick" },
	];
	for (const { input, expected } of fixtureCases) {
		it(`resolves ${JSON.stringify(input)} to ${expected}`, () => {
			expect(resolveElementIcon(input).id).toBe(expected);
		});
	}

	// Deviation (a): an explicit non-brand icon now beats the component default.
	it("an explicit non-brand icon wins over the component default", () => {
		// Legacy resolved web_server to its component icon `globe`; the registry honors `icon`.
		expect(resolveElementIcon({ type: "web_server", icon: "database" }).id).toBe("database");
	});

	// Deviation (b): unknown keys resolve to the inert generic glyph, never nothing/markup.
	it("unknown type resolves to the generic glyph", () => {
		expect(resolveElementIcon({ type: "does_not_exist" }).id).toBe("box");
	});
	it("unknown icon falls through to a known component default", () => {
		expect(resolveElementIcon({ type: "web_server", icon: "nope" }).id).toBe("globe");
	});
	it("unknown subtype falls through to a known component default", () => {
		expect(resolveElementIcon({ type: "web_server", subtype: "nope" }).id).toBe("globe");
	});
	it("all three unknown resolve to the generic glyph", () => {
		expect(resolveElementIcon({ type: "n1", subtype: "n2", icon: "n3" }).id).toBe("box");
	});
});

describe("taxonomy characterization: closed desktop/browser STRIDE divergence", () => {
	// The legacy browser engine fell through to `service` for these two because neither ID
	// existed in the component table, disagreeing with the Rust engine. `#59` Step 9 admitted
	// them with their Rust-parity roles, so the registry-backed browser engine now agrees.
	it("data_store resolves to store (matching the Rust engine)", () => {
		expect(getComponent("data_store")?.strideRole).toBe("store");
	});
	it("external_entity resolves to actor (matching the Rust engine)", () => {
		expect(getComponent("external_entity")?.strideRole).toBe("actor");
	});
});
