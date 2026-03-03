import { Apple, Download, Monitor } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useLatestRelease } from "@/hooks/use-latest-release";
import type { OsType, PlatformAssets, ReleaseAsset } from "@/lib/github-releases";
import { formatBytes } from "@/lib/github-releases";
import { PageShell } from "./shared/page-shell";

const GITHUB_RELEASES_URL = "https://github.com/exit-zero-labs/threat-forge/releases";

const OS_LABELS: Record<OsType, string> = {
	macos: "macOS",
	windows: "Windows",
	linux: "Linux",
	unknown: "your platform",
};

export function DownloadsPage() {
	const { release, detectedOs, isLoading, error } = useLatestRelease();

	return (
		<PageShell title="Download Threat Forge — macOS, Windows, Linux">
			<section className="px-6 py-20">
				<div className="mx-auto max-w-4xl">
					<div className="text-center">
						<h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
							Download Threat Forge
						</h1>
						{release && (
							<p className="mt-3 text-muted-foreground">
								Latest release:{" "}
								<a
									href={release.releaseUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="font-mono text-tf-signal hover:underline"
								>
									{release.version}
								</a>
							</p>
						)}
					</div>

					{isLoading && <LoadingSkeleton />}

					{error && (
						<div className="mt-12 text-center">
							<p className="text-muted-foreground">
								Could not load releases.{" "}
								<a
									href={GITHUB_RELEASES_URL}
									target="_blank"
									rel="noopener noreferrer"
									className="text-tf-signal hover:underline"
								>
									Download from GitHub
								</a>
							</p>
						</div>
					)}

					{release && <AllPlatforms assets={release.assets} detectedOs={detectedOs} />}

					<div className="mt-16 text-center">
						<p className="text-sm text-muted-foreground">
							Or{" "}
							<Link to="/app" className="text-tf-signal hover:underline">
								try the web version
							</Link>{" "}
							— no download required.
						</p>
					</div>
				</div>
			</section>
		</PageShell>
	);
}

function LoadingSkeleton() {
	return (
		<div className="mt-12 grid gap-6 sm:grid-cols-3">
			<div className="h-48 animate-pulse rounded-lg bg-secondary" />
			<div className="h-48 animate-pulse rounded-lg bg-secondary" />
			<div className="h-48 animate-pulse rounded-lg bg-secondary" />
		</div>
	);
}

function AllPlatforms({ assets, detectedOs }: { assets: PlatformAssets; detectedOs: OsType }) {
	return (
		<div className="mt-12">
			<div className="grid gap-6 sm:grid-cols-3">
				<PlatformCard
					os="macos"
					title="macOS"
					icon={<Apple className="h-6 w-6" />}
					assets={assets.macos}
					highlighted={detectedOs === "macos"}
				/>
				<PlatformCard
					os="windows"
					title="Windows"
					icon={<Monitor className="h-6 w-6" />}
					assets={assets.windows}
					highlighted={detectedOs === "windows"}
				/>
				<PlatformCard
					os="linux"
					title="Linux"
					icon={<Monitor className="h-6 w-6" />}
					assets={assets.linux}
					highlighted={detectedOs === "linux"}
				/>
			</div>
		</div>
	);
}

function PlatformCard({
	os,
	title,
	icon,
	assets,
	highlighted,
}: {
	os: Exclude<OsType, "unknown">;
	title: string;
	icon: ReactNode;
	assets: ReleaseAsset[];
	highlighted: boolean;
}) {
	const primary = assets[0];

	return (
		<div
			className={`rounded-lg border p-6 ${
				highlighted ? "border-tf-signal bg-card" : "border-border/50 bg-card"
			}`}
		>
			<div className="flex items-center gap-3 text-foreground">
				{icon}
				<h3 className="font-semibold">{title}</h3>
				{highlighted && (
					<span className="ml-auto rounded-full bg-tf-signal/10 px-2.5 py-0.5 text-[10px] font-medium text-tf-signal">
						Recommended
					</span>
				)}
			</div>

			{assets.length === 0 ? (
				<p className="mt-4 text-sm text-muted-foreground">No builds available yet.</p>
			) : (
				<>
					{highlighted && primary && (
						<a
							href={primary.downloadUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="mt-4 flex items-center justify-center gap-2 rounded-md bg-tf-signal px-4 py-2.5 text-sm font-medium text-tf-zero transition-opacity hover:opacity-90"
						>
							<Download className="h-4 w-4" />
							Download for {OS_LABELS[os]}
						</a>
					)}
					<ul className={`${highlighted ? "mt-3" : "mt-4"} space-y-2`}>
						{assets.map((asset) => (
							<li key={asset.name}>
								<a
									href={asset.downloadUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="flex items-center justify-between text-sm text-muted-foreground transition-colors hover:text-foreground"
								>
									<span className="truncate font-mono text-xs">{asset.name}</span>
									<span className="ml-2 shrink-0 text-xs">{formatBytes(asset.size)}</span>
								</a>
							</li>
						))}
					</ul>
				</>
			)}
		</div>
	);
}
