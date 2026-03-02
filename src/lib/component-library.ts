import type { LucideIcon } from "lucide-react";
import {
	Activity,
	Archive,
	ArrowLeftRight,
	AtSign,
	Box,
	Boxes,
	CloudCog,
	CloudUpload,
	Code2,
	Cog,
	Container,
	Cpu,
	Database,
	FileBadge,
	FolderArchive,
	GitBranch,
	Globe,
	HardDrive,
	KeyRound,
	KeySquare,
	Lock,
	MailOpen,
	MemoryStick,
	Monitor,
	MonitorSmartphone,
	Network,
	PackageCheck,
	Radar,
	Radio,
	Router,
	Scale,
	Search,
	Shield,
	ShieldAlert,
	ShieldCheck,
	Ship,
	Smartphone,
	Terminal,
	UserCheck,
	Waves,
	Waypoints,
	Webhook,
	Zap,
} from "lucide-react";

/** Shape categories determine how a component renders on the canvas. */
export type ShapeCategory = "rounded" | "database" | "rect" | "hexagon";

/** STRIDE categories determine which STRIDE threats apply to a component. */
export type StrideCategory = "service" | "store" | "actor";

export interface SubtypeDefinition {
	/** Subtype value stored in YAML, e.g. "rds" */
	id: string;
	/** Display name, e.g. "AWS RDS" */
	label: string;
	/** Lucide icon name override */
	icon: string;
}

export interface ComponentDefinition {
	/** Component type value stored in YAML, e.g. "api_gateway" */
	id: string;
	/** Display name, e.g. "API Gateway" */
	label: string;
	/** Visual shape on canvas */
	shape: ShapeCategory;
	/** Which STRIDE threats apply */
	strideCategory: StrideCategory;
	/** Lucide icon name */
	icon: string;
	/** Grouping category, e.g. "Services", "Databases" */
	category: string;
	/** Search keywords */
	tags: string[];
	/** Optional provider-specific subtypes */
	subtypes?: SubtypeDefinition[];
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
	shield: Shield,
	waypoints: Waypoints,
	webhook: Webhook,
	network: Network,
	"folder-archive": FolderArchive,
	waves: Waves,
	"cloud-upload": CloudUpload,
	"shield-alert": ShieldAlert,
	radar: Radar,
	"user-check": UserCheck,
	"key-square": KeySquare,
	ship: Ship,
	"cloud-cog": CloudCog,
	"git-branch": GitBranch,
	"package-check": PackageCheck,
	"code-2": Code2,
	terminal: Terminal,
};

export const COMPONENT_LIBRARY: ComponentDefinition[] = [
	// Generic (default drop type)
	{
		id: "generic",
		label: "Generic",
		shape: "rounded",
		strideCategory: "service",
		icon: "box",
		category: "Generic",
		tags: ["generic", "component", "node"],
	},

	// Services
	{
		id: "web_server",
		label: "Web Server",
		shape: "rounded",
		strideCategory: "service",
		icon: "globe",
		category: "Services",
		tags: ["web", "server", "http", "nginx", "apache", "iis"],
	},
	{
		id: "api_gateway",
		label: "API Gateway",
		shape: "rounded",
		strideCategory: "service",
		icon: "router",
		category: "Services",
		tags: ["api", "gateway", "rest", "graphql", "kong", "apigee"],
	},
	{
		id: "microservice",
		label: "Microservice",
		shape: "rounded",
		strideCategory: "service",
		icon: "boxes",
		category: "Services",
		tags: ["microservice", "service", "backend", "container"],
	},
	{
		id: "serverless_function",
		label: "Serverless Function",
		shape: "rounded",
		strideCategory: "service",
		icon: "zap",
		category: "Services",
		tags: ["serverless", "lambda", "function", "cloud", "azure functions", "cloud functions"],
	},
	{
		id: "background_worker",
		label: "Background Worker",
		shape: "rounded",
		strideCategory: "service",
		icon: "cog",
		category: "Services",
		tags: ["worker", "background", "job", "cron", "scheduler", "queue consumer"],
	},

	// Databases
	{
		id: "sql_database",
		label: "SQL Database",
		shape: "database",
		strideCategory: "store",
		icon: "database",
		category: "Databases",
		tags: ["sql", "database", "postgres", "mysql", "sqlite", "mssql", "relational"],
		subtypes: [
			{ id: "rds", label: "AWS RDS", icon: "database" },
			{ id: "azure_sql", label: "Azure SQL", icon: "database" },
			{ id: "cloud_sql", label: "Cloud SQL", icon: "database" },
		],
	},
	{
		id: "nosql_database",
		label: "NoSQL Database",
		shape: "database",
		strideCategory: "store",
		icon: "hard-drive",
		category: "Databases",
		tags: ["nosql", "mongodb", "dynamodb", "cassandra", "couchdb", "document"],
		subtypes: [
			{ id: "dynamodb", label: "DynamoDB", icon: "hard-drive" },
			{ id: "cosmosdb", label: "Cosmos DB", icon: "hard-drive" },
		],
	},
	{
		id: "cache",
		label: "Cache",
		shape: "database",
		strideCategory: "store",
		icon: "memory-stick",
		category: "Databases",
		tags: ["cache", "redis", "memcached", "in-memory", "session"],
		subtypes: [
			{ id: "redis", label: "Redis", icon: "memory-stick" },
			{ id: "memcached", label: "Memcached", icon: "memory-stick" },
		],
	},
	{
		id: "search_index",
		label: "Search Index",
		shape: "database",
		strideCategory: "store",
		icon: "search",
		category: "Databases",
		tags: ["search", "elasticsearch", "solr", "opensearch", "index", "full-text"],
	},
	{
		id: "object_storage",
		label: "Object Storage",
		shape: "database",
		strideCategory: "store",
		icon: "archive",
		category: "Databases",
		tags: ["object", "storage", "s3", "blob", "gcs", "minio", "file"],
		subtypes: [
			{ id: "s3", label: "AWS S3", icon: "archive" },
			{ id: "azure_blob", label: "Azure Blob", icon: "archive" },
			{ id: "gcs", label: "Google Cloud Storage", icon: "archive" },
		],
	},

	// Messaging
	{
		id: "message_queue",
		label: "Message Queue",
		shape: "rounded",
		strideCategory: "service",
		icon: "mail-open",
		category: "Messaging",
		tags: ["queue", "message", "rabbitmq", "sqs", "amqp", "async"],
		subtypes: [
			{ id: "sqs", label: "AWS SQS", icon: "mail-open" },
			{ id: "rabbitmq", label: "RabbitMQ", icon: "mail-open" },
		],
	},
	{
		id: "event_bus",
		label: "Event Bus",
		shape: "rounded",
		strideCategory: "service",
		icon: "radio",
		category: "Messaging",
		tags: ["event", "bus", "kafka", "sns", "pubsub", "eventbridge"],
		subtypes: [
			{ id: "kafka", label: "Kafka", icon: "radio" },
			{ id: "sns", label: "AWS SNS", icon: "radio" },
		],
	},
	{
		id: "stream_processor",
		label: "Stream Processor",
		shape: "rounded",
		strideCategory: "service",
		icon: "activity",
		category: "Messaging",
		tags: ["stream", "processor", "kinesis", "flink", "spark", "realtime"],
	},

	// Infrastructure
	{
		id: "load_balancer",
		label: "Load Balancer",
		shape: "hexagon",
		strideCategory: "service",
		icon: "scale",
		category: "Infrastructure",
		tags: ["load", "balancer", "lb", "alb", "nlb", "haproxy", "traffic"],
	},
	{
		id: "cdn",
		label: "CDN",
		shape: "hexagon",
		strideCategory: "service",
		icon: "globe",
		category: "Infrastructure",
		tags: ["cdn", "cloudfront", "cloudflare", "akamai", "content", "delivery"],
		subtypes: [
			{ id: "cloudfront", label: "CloudFront", icon: "globe" },
			{ id: "cloudflare", label: "Cloudflare", icon: "globe" },
		],
	},
	{
		id: "dns",
		label: "DNS",
		shape: "hexagon",
		strideCategory: "service",
		icon: "at-sign",
		category: "Infrastructure",
		tags: ["dns", "domain", "route53", "nameserver", "resolution"],
	},
	{
		id: "proxy",
		label: "Proxy",
		shape: "hexagon",
		strideCategory: "service",
		icon: "arrow-left-right",
		category: "Infrastructure",
		tags: ["proxy", "reverse", "forward", "envoy", "traefik", "haproxy"],
	},
	{
		id: "container",
		label: "Container",
		shape: "hexagon",
		strideCategory: "service",
		icon: "container",
		category: "Infrastructure",
		tags: ["container", "docker", "kubernetes", "k8s", "pod", "orchestration"],
	},

	// Security
	{
		id: "auth_provider",
		label: "Auth Provider",
		shape: "rounded",
		strideCategory: "service",
		icon: "key-round",
		category: "Security",
		tags: ["auth", "oauth", "oidc", "saml", "identity", "idp", "okta", "auth0"],
	},
	{
		id: "firewall",
		label: "Firewall",
		shape: "rounded",
		strideCategory: "service",
		icon: "shield-check",
		category: "Security",
		tags: ["firewall", "waf", "security", "filter", "network", "acl"],
	},
	{
		id: "secret_manager",
		label: "Secret Manager",
		shape: "database",
		strideCategory: "store",
		icon: "lock",
		category: "Security",
		tags: ["secret", "vault", "hashicorp", "aws secrets", "key management", "kms"],
	},
	{
		id: "certificate_authority",
		label: "Certificate Authority",
		shape: "rounded",
		strideCategory: "service",
		icon: "file-badge",
		category: "Security",
		tags: ["certificate", "ca", "tls", "ssl", "pki", "x509"],
	},

	// Clients
	{
		id: "web_browser",
		label: "Web Browser",
		shape: "rect",
		strideCategory: "actor",
		icon: "monitor-smartphone",
		category: "Clients",
		tags: ["browser", "web", "client", "frontend", "spa", "pwa"],
	},
	{
		id: "mobile_app",
		label: "Mobile App",
		shape: "rect",
		strideCategory: "actor",
		icon: "smartphone",
		category: "Clients",
		tags: ["mobile", "app", "ios", "android", "react native", "flutter"],
	},
	{
		id: "desktop_app",
		label: "Desktop App",
		shape: "rect",
		strideCategory: "actor",
		icon: "monitor",
		category: "Clients",
		tags: ["desktop", "app", "electron", "tauri", "native", "windows", "macos"],
	},
	{
		id: "iot_device",
		label: "IoT Device",
		shape: "rect",
		strideCategory: "actor",
		icon: "cpu",
		category: "Clients",
		tags: ["iot", "device", "sensor", "embedded", "hardware", "edge"],
	},
	{
		id: "api_client",
		label: "API Client",
		shape: "rect",
		strideCategory: "actor",
		icon: "code-2",
		category: "Clients",
		tags: ["api", "client", "sdk", "library", "integration", "consumer"],
	},
	{
		id: "cli_tool",
		label: "CLI Tool",
		shape: "rect",
		strideCategory: "actor",
		icon: "terminal",
		category: "Clients",
		tags: ["cli", "command", "terminal", "shell", "script", "automation"],
	},

	// Networking
	{
		id: "vpn_gateway",
		label: "VPN Gateway",
		shape: "hexagon",
		strideCategory: "service",
		icon: "shield",
		category: "Networking",
		tags: ["vpn", "gateway", "tunnel", "ipsec", "wireguard", "openvpn", "private"],
	},
	{
		id: "api_endpoint",
		label: "API Endpoint",
		shape: "rounded",
		strideCategory: "service",
		icon: "waypoints",
		category: "Networking",
		tags: ["api", "endpoint", "rest", "graphql", "route", "url"],
	},
	{
		id: "webhook",
		label: "Webhook",
		shape: "rounded",
		strideCategory: "service",
		icon: "webhook",
		category: "Networking",
		tags: ["webhook", "callback", "hook", "notification", "event", "http"],
	},
	{
		id: "service_mesh",
		label: "Service Mesh",
		shape: "hexagon",
		strideCategory: "service",
		icon: "network",
		category: "Networking",
		tags: ["mesh", "istio", "linkerd", "envoy", "sidecar", "service mesh"],
	},

	// Storage (extends Databases)
	{
		id: "file_storage",
		label: "File Storage",
		shape: "database",
		strideCategory: "store",
		icon: "folder-archive",
		category: "Databases",
		tags: ["file", "storage", "nas", "nfs", "efs", "shared", "filesystem"],
	},
	{
		id: "data_lake",
		label: "Data Lake",
		shape: "database",
		strideCategory: "store",
		icon: "waves",
		category: "Databases",
		tags: ["data", "lake", "warehouse", "bigquery", "redshift", "snowflake", "analytics"],
	},
	{
		id: "backup_service",
		label: "Backup Service",
		shape: "database",
		strideCategory: "store",
		icon: "cloud-upload",
		category: "Databases",
		tags: ["backup", "recovery", "disaster", "snapshot", "archive", "retention"],
	},

	// Security (extends existing)
	{
		id: "waf",
		label: "WAF",
		shape: "rounded",
		strideCategory: "service",
		icon: "shield-alert",
		category: "Security",
		tags: ["waf", "web", "application", "firewall", "owasp", "rules", "modsecurity"],
	},
	{
		id: "siem",
		label: "SIEM",
		shape: "rounded",
		strideCategory: "service",
		icon: "radar",
		category: "Security",
		tags: ["siem", "log", "aggregator", "splunk", "sentinel", "elk", "monitoring", "detection"],
	},
	{
		id: "identity_provider",
		label: "Identity Provider",
		shape: "rounded",
		strideCategory: "service",
		icon: "user-check",
		category: "Security",
		tags: ["identity", "idp", "sso", "saml", "oidc", "active directory", "entra"],
	},
	{
		id: "key_management",
		label: "Key Management",
		shape: "database",
		strideCategory: "store",
		icon: "key-square",
		category: "Security",
		tags: ["kms", "key", "management", "encryption", "hsm", "aws kms", "azure key vault"],
	},

	// Cloud / Platform
	{
		id: "kubernetes",
		label: "Kubernetes",
		shape: "hexagon",
		strideCategory: "service",
		icon: "ship",
		category: "Cloud / Platform",
		tags: ["kubernetes", "k8s", "cluster", "orchestration", "aks", "eks", "gke"],
	},
	{
		id: "serverless_platform",
		label: "Serverless Platform",
		shape: "hexagon",
		strideCategory: "service",
		icon: "cloud-cog",
		category: "Cloud / Platform",
		tags: ["serverless", "platform", "faas", "cloud run", "app runner", "cloud functions"],
	},
	{
		id: "ci_cd_pipeline",
		label: "CI/CD Pipeline",
		shape: "hexagon",
		strideCategory: "service",
		icon: "git-branch",
		category: "Cloud / Platform",
		tags: ["ci", "cd", "pipeline", "github actions", "jenkins", "gitlab", "build", "deploy"],
	},
	{
		id: "container_registry",
		label: "Container Registry",
		shape: "database",
		strideCategory: "store",
		icon: "package-check",
		category: "Cloud / Platform",
		tags: ["container", "registry", "docker", "ecr", "acr", "gcr", "harbor", "image"],
	},
];

/** Unique sorted category names (excluding "Generic" which is a palette-only concept) */
export const COMPONENT_CATEGORIES: string[] = [
	...new Set(COMPONENT_LIBRARY.filter((c) => c.category !== "Generic").map((c) => c.category)),
];

/** Look up a component definition by its type ID */
export function getComponentByType(type: string): ComponentDefinition | undefined {
	return COMPONENT_LIBRARY.find((c) => c.id === type);
}

/** @deprecated Use getComponentByType instead */
export function getComponentBySubtype(subtype: string): ComponentDefinition | undefined {
	return getComponentByType(subtype);
}

/** Get the shape category for a component type. Defaults to "rounded". */
export function getShapeForType(type: string): ShapeCategory {
	return getComponentByType(type)?.shape ?? "rounded";
}

/** Get the STRIDE category for a component type. Defaults to "service". */
export function getStrideCategoryForType(type: string): StrideCategory {
	return getComponentByType(type)?.strideCategory ?? "service";
}

/** Get sub-type definitions for a component type. Returns empty array if none. */
export function getSubtypesForType(type: string): SubtypeDefinition[] {
	return getComponentByType(type)?.subtypes ?? [];
}

/** Returns true if the component type is a library prefab (not "generic"). */
export function isPrefabType(type: string): boolean {
	const comp = getComponentByType(type);
	return comp !== undefined && comp.id !== "generic";
}

/** Case-insensitive search across label and tags. Excludes the generic type from results. */
export function searchComponents(query: string): ComponentDefinition[] {
	const q = query.toLowerCase().trim();
	if (!q) return COMPONENT_LIBRARY.filter((c) => c.category !== "Generic");
	return COMPONENT_LIBRARY.filter(
		(c) =>
			c.category !== "Generic" &&
			(c.label.toLowerCase().includes(q) || c.tags.some((t) => t.toLowerCase().includes(q))),
	);
}

/** Get all components in a specific category */
export function getComponentsByCategory(category: string): ComponentDefinition[] {
	return COMPONENT_LIBRARY.filter((c) => c.category === category);
}

/** Get all non-generic components (for command palette, search, etc.) */
export function getAllComponents(): ComponentDefinition[] {
	return COMPONENT_LIBRARY.filter((c) => c.id !== "generic");
}

/** Map an icon name string to its lucide-react component */
export function getIconComponent(iconName: string): LucideIcon | undefined {
	return ICON_MAP[iconName];
}
