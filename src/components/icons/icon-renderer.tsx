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
	type LucideIcon,
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
	Type,
	UserCheck,
	Waves,
	Waypoints,
	Webhook,
	Zap,
} from "lucide-react";
import { getIcon } from "@/lib/registry/registry";
import type { IconArtwork, IconEntry } from "@/lib/registry/types";

/**
 * The single `lucide-react` name→component map. This is the only place in the app that maps
 * an `IconEntry` `kind: "lucide"` name to a React component, and the only place SVG path
 * geometry is turned into DOM. Registry data modules import nothing from `lucide-react`, so
 * the STRIDE and taxonomy paths no longer transitively pull in the icon component graph.
 *
 * No `className`, `style`, or `fill` is ever read from registry data — geometry ships as a
 * `d`/`fill-rule` attribute React sets on an element it constructs, which forecloses CSS
 * `url()` and markup injection by construction.
 */
export const LUCIDE_ICONS: Readonly<Record<string, LucideIcon>> = {
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
	type: Type,
};

/** True if a lucide name resolves to a bundled component. */
export function hasLucideIcon(name: string): boolean {
	return Object.hasOwn(LUCIDE_ICONS, name);
}

/** Artwork that can actually be drawn — a `withdrawn` entry never reaches the DOM. */
type RenderableArtwork = Exclude<IconArtwork, { kind: "withdrawn" }>;

/**
 * Resolve an entry to drawable artwork, following a `withdrawn` entry to its fallback exactly
 * once per hop with a cycle guard. Withdrawal is a data change, so the fallback chain must
 * terminate; if it somehow does not, we render nothing rather than loop.
 */
function resolveRenderableArtwork(entry: IconEntry): RenderableArtwork | null {
	let current: IconEntry | undefined = entry;
	const seen = new Set<string>();
	while (current && current.artwork.kind === "withdrawn") {
		if (seen.has(current.id)) return null;
		seen.add(current.id);
		current = getIcon(current.artwork.fallbackIconId);
	}
	if (!current || current.artwork.kind === "withdrawn") return null;
	return current.artwork;
}

/**
 * Render an `IconEntry` as an inline icon. `kind: "lucide"` renders the mapped component;
 * `kind: "paths"` renders one `<path>` per entry carrying only `d`/`fill-rule`;
 * `kind: "withdrawn"` renders its resolved fallback glyph.
 */
export function IconRenderer({ icon, className }: { icon: IconEntry; className?: string }) {
	const artwork = resolveRenderableArtwork(icon);
	if (!artwork) return null;

	if (artwork.kind === "lucide") {
		const LucideComponent = LUCIDE_ICONS[artwork.name];
		if (!LucideComponent) return null;
		return <LucideComponent className={className} aria-hidden="true" />;
	}

	return (
		<svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			{artwork.paths.map((path, index) => (
				<path
					// biome-ignore lint/suspicious/noArrayIndexKey: paths are static, ordered geometry
					key={index}
					d={path.d}
					fillRule={path.fillRule ?? "nonzero"}
				/>
			))}
		</svg>
	);
}
