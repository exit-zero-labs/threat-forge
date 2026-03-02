import type { LucideIcon } from "lucide-react";
import {
	Activity,
	Archive,
	ArrowLeftRight,
	AtSign,
	Box,
	Boxes,
	Cog,
	Container,
	Cpu,
	Database,
	FileBadge,
	Globe,
	HardDrive,
	KeyRound,
	Lock,
	MailOpen,
	MemoryStick,
	Monitor,
	MonitorSmartphone,
	Radio,
	Router,
	Scale,
	Search,
	ShieldCheck,
	Smartphone,
	Zap,
} from "lucide-react";
import type { ElementType } from "@/types/threat-model";

export interface ComponentDefinition {
	/** Subtype value stored in YAML, e.g. "api_gateway". For base types, matches the ElementType. */
	id: string;
	/** Display name, e.g. "API Gateway" */
	label: string;
	/** Base DFD element type */
	type: ElementType;
	/** Lucide icon name */
	icon: string;
	/** Grouping category, e.g. "Services", "Databases" */
	category: string;
	/** Search keywords */
	tags: string[];
	/** Whether this is a base DFD type (process, data_store, external_entity) */
	isBaseType?: boolean;
}

const ICON_MAP: Record<string, LucideIcon> = {
	box: Box,
	database: Database,
	globe: Globe,
	router: Router,
	boxes: Boxes,
	zap: Zap,
	cog: Cog,
	"hard-drive": HardDrive,
	"memory-stick": MemoryStick,
	search: Search,
	archive: Archive,
	"mail-open": MailOpen,
	radio: Radio,
	activity: Activity,
	scale: Scale,
	"at-sign": AtSign,
	"arrow-left-right": ArrowLeftRight,
	container: Container,
	"key-round": KeyRound,
	"shield-check": ShieldCheck,
	lock: Lock,
	"file-badge": FileBadge,
	"monitor-smartphone": MonitorSmartphone,
	smartphone: Smartphone,
	monitor: Monitor,
	cpu: Cpu,
};

export const COMPONENT_LIBRARY: ComponentDefinition[] = [
	// Basics — the 3 standard DFD element types
	{
		id: "process",
		label: "Process",
		type: "process",
		icon: "box",
		category: "Basics",
		tags: ["process", "function", "service", "step"],
		isBaseType: true,
	},
	{
		id: "data_store",
		label: "Data Store",
		type: "data_store",
		icon: "database",
		category: "Basics",
		tags: ["data", "store", "storage", "database", "repository"],
		isBaseType: true,
	},
	{
		id: "external_entity",
		label: "External Entity",
		type: "external_entity",
		icon: "globe",
		category: "Basics",
		tags: ["external", "entity", "actor", "user", "third party"],
		isBaseType: true,
	},

	// Services
	{
		id: "web_server",
		label: "Web Server",
		type: "process",
		icon: "globe",
		category: "Services",
		tags: ["web", "server", "http", "nginx", "apache", "iis"],
	},
	{
		id: "api_gateway",
		label: "API Gateway",
		type: "process",
		icon: "router",
		category: "Services",
		tags: ["api", "gateway", "rest", "graphql", "kong", "apigee"],
	},
	{
		id: "microservice",
		label: "Microservice",
		type: "process",
		icon: "boxes",
		category: "Services",
		tags: ["microservice", "service", "backend", "container"],
	},
	{
		id: "serverless_function",
		label: "Serverless Function",
		type: "process",
		icon: "zap",
		category: "Services",
		tags: ["serverless", "lambda", "function", "cloud", "azure functions", "cloud functions"],
	},
	{
		id: "background_worker",
		label: "Background Worker",
		type: "process",
		icon: "cog",
		category: "Services",
		tags: ["worker", "background", "job", "cron", "scheduler", "queue consumer"],
	},

	// Databases
	{
		id: "sql_database",
		label: "SQL Database",
		type: "data_store",
		icon: "database",
		category: "Databases",
		tags: ["sql", "database", "postgres", "mysql", "sqlite", "mssql", "relational"],
	},
	{
		id: "nosql_database",
		label: "NoSQL Database",
		type: "data_store",
		icon: "hard-drive",
		category: "Databases",
		tags: ["nosql", "mongodb", "dynamodb", "cassandra", "couchdb", "document"],
	},
	{
		id: "cache",
		label: "Cache",
		type: "data_store",
		icon: "memory-stick",
		category: "Databases",
		tags: ["cache", "redis", "memcached", "in-memory", "session"],
	},
	{
		id: "search_index",
		label: "Search Index",
		type: "data_store",
		icon: "search",
		category: "Databases",
		tags: ["search", "elasticsearch", "solr", "opensearch", "index", "full-text"],
	},
	{
		id: "object_storage",
		label: "Object Storage",
		type: "data_store",
		icon: "archive",
		category: "Databases",
		tags: ["object", "storage", "s3", "blob", "gcs", "minio", "file"],
	},

	// Messaging
	{
		id: "message_queue",
		label: "Message Queue",
		type: "process",
		icon: "mail-open",
		category: "Messaging",
		tags: ["queue", "message", "rabbitmq", "sqs", "amqp", "async"],
	},
	{
		id: "event_bus",
		label: "Event Bus",
		type: "process",
		icon: "radio",
		category: "Messaging",
		tags: ["event", "bus", "kafka", "sns", "pubsub", "eventbridge"],
	},
	{
		id: "stream_processor",
		label: "Stream Processor",
		type: "process",
		icon: "activity",
		category: "Messaging",
		tags: ["stream", "processor", "kinesis", "flink", "spark", "realtime"],
	},

	// Infrastructure
	{
		id: "load_balancer",
		label: "Load Balancer",
		type: "process",
		icon: "scale",
		category: "Infrastructure",
		tags: ["load", "balancer", "lb", "alb", "nlb", "haproxy", "traffic"],
	},
	{
		id: "cdn",
		label: "CDN",
		type: "external_entity",
		icon: "globe",
		category: "Infrastructure",
		tags: ["cdn", "cloudfront", "cloudflare", "akamai", "content", "delivery"],
	},
	{
		id: "dns",
		label: "DNS",
		type: "external_entity",
		icon: "at-sign",
		category: "Infrastructure",
		tags: ["dns", "domain", "route53", "nameserver", "resolution"],
	},
	{
		id: "proxy",
		label: "Proxy",
		type: "process",
		icon: "arrow-left-right",
		category: "Infrastructure",
		tags: ["proxy", "reverse", "forward", "envoy", "traefik", "haproxy"],
	},
	{
		id: "container",
		label: "Container",
		type: "process",
		icon: "container",
		category: "Infrastructure",
		tags: ["container", "docker", "kubernetes", "k8s", "pod", "orchestration"],
	},

	// Security
	{
		id: "auth_provider",
		label: "Auth Provider",
		type: "external_entity",
		icon: "key-round",
		category: "Security",
		tags: ["auth", "oauth", "oidc", "saml", "identity", "idp", "okta", "auth0"],
	},
	{
		id: "firewall",
		label: "Firewall",
		type: "process",
		icon: "shield-check",
		category: "Security",
		tags: ["firewall", "waf", "security", "filter", "network", "acl"],
	},
	{
		id: "secret_manager",
		label: "Secret Manager",
		type: "data_store",
		icon: "lock",
		category: "Security",
		tags: ["secret", "vault", "hashicorp", "aws secrets", "key management", "kms"],
	},
	{
		id: "certificate_authority",
		label: "Certificate Authority",
		type: "external_entity",
		icon: "file-badge",
		category: "Security",
		tags: ["certificate", "ca", "tls", "ssl", "pki", "x509"],
	},

	// Clients
	{
		id: "web_browser",
		label: "Web Browser",
		type: "external_entity",
		icon: "monitor-smartphone",
		category: "Clients",
		tags: ["browser", "web", "client", "frontend", "spa", "pwa"],
	},
	{
		id: "mobile_app",
		label: "Mobile App",
		type: "external_entity",
		icon: "smartphone",
		category: "Clients",
		tags: ["mobile", "app", "ios", "android", "react native", "flutter"],
	},
	{
		id: "desktop_app",
		label: "Desktop App",
		type: "external_entity",
		icon: "monitor",
		category: "Clients",
		tags: ["desktop", "app", "electron", "tauri", "native", "windows", "macos"],
	},
	{
		id: "iot_device",
		label: "IoT Device",
		type: "external_entity",
		icon: "cpu",
		category: "Clients",
		tags: ["iot", "device", "sensor", "embedded", "hardware", "edge"],
	},
];

/** Unique sorted category names */
export const COMPONENT_CATEGORIES: string[] = [
	...new Set(COMPONENT_LIBRARY.map((c) => c.category)),
];

/** Look up a component definition by its subtype ID */
export function getComponentBySubtype(subtype: string): ComponentDefinition | undefined {
	return COMPONENT_LIBRARY.find((c) => c.id === subtype);
}

/** Case-insensitive search across label and tags */
export function searchComponents(query: string): ComponentDefinition[] {
	const q = query.toLowerCase().trim();
	if (!q) return COMPONENT_LIBRARY;
	return COMPONENT_LIBRARY.filter(
		(c) => c.label.toLowerCase().includes(q) || c.tags.some((t) => t.toLowerCase().includes(q)),
	);
}

/** Get all components in a specific category */
export function getComponentsByCategory(category: string): ComponentDefinition[] {
	return COMPONENT_LIBRARY.filter((c) => c.category === category);
}

/** Map an icon name string to its lucide-react component */
export function getIconComponent(iconName: string): LucideIcon | undefined {
	return ICON_MAP[iconName];
}
