import { Settings } from "lucide-react";
import { Link } from "react-router-dom";

const GITHUB_URL = "https://github.com/exit-zero-labs/threat-forge";

interface PageFooterProps {
	onOpenSettings?: () => void;
}

export function PageFooter({ onOpenSettings }: PageFooterProps) {
	return (
		<footer className="border-t border-border/50 bg-background">
			<div className="mx-auto max-w-6xl px-6 py-12">
				<div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
					{/* Brand */}
					<div>
						<p className="text-sm font-semibold text-foreground">Threat Forge</p>
						<p className="mt-2 text-sm text-muted-foreground">
							Open-source, AI-enhanced threat modeling. Built by{" "}
							<a
								href="https://www.exitzerolabs.com"
								target="_blank"
								rel="noopener noreferrer"
								className="transition-colors hover:text-foreground"
							>
								Exit Zero Labs
							</a>
							.
						</p>
						<p className="mt-1 text-xs text-muted-foreground/60">v{__APP_VERSION__ ?? "dev"}</p>
					</div>

					{/* Product */}
					<div>
						<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
							Product
						</p>
						<ul className="mt-3 space-y-2">
							<li>
								<Link
									to="/downloads"
									className="text-sm text-muted-foreground transition-colors hover:text-foreground"
								>
									Downloads
								</Link>
							</li>
							<li>
								<Link
									to="/app"
									className="text-sm text-muted-foreground transition-colors hover:text-foreground"
								>
									Web App
								</Link>
							</li>
							<li>
								<a
									href={GITHUB_URL}
									target="_blank"
									rel="noopener noreferrer"
									className="text-sm text-muted-foreground transition-colors hover:text-foreground"
								>
									GitHub
								</a>
							</li>
						</ul>
					</div>

					{/* Company */}
					<div>
						<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
							Company
						</p>
						<ul className="mt-3 space-y-2">
							<li>
								<Link
									to="/about"
									className="text-sm text-muted-foreground transition-colors hover:text-foreground"
								>
									About
								</Link>
							</li>
							<li>
								<Link
									to="/support"
									className="text-sm text-muted-foreground transition-colors hover:text-foreground"
								>
									Support
								</Link>
							</li>
						</ul>
					</div>

					{/* Legal */}
					<div>
						<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
							Legal
						</p>
						<ul className="mt-3 space-y-2">
							<li>
								<Link
									to="/privacy"
									className="text-sm text-muted-foreground transition-colors hover:text-foreground"
								>
									Privacy Policy
								</Link>
							</li>
							<li>
								<Link
									to="/terms"
									className="text-sm text-muted-foreground transition-colors hover:text-foreground"
								>
									Terms of Service
								</Link>
							</li>
							<li>
								<a
									href={`${GITHUB_URL}/blob/main/LICENSE`}
									target="_blank"
									rel="noopener noreferrer"
									className="text-sm text-muted-foreground transition-colors hover:text-foreground"
								>
									Apache 2.0 License
								</a>
							</li>
						</ul>
					</div>
				</div>

				<div className="mt-10 flex items-center justify-center gap-4 border-t border-border/50 pt-6 text-xs text-muted-foreground/60">
					<span>
						&copy; {new Date().getFullYear()}{" "}
						<a
							href="https://www.exitzerolabs.com"
							target="_blank"
							rel="noopener noreferrer"
							className="transition-colors hover:text-muted-foreground"
						>
							Exit Zero Labs LLC
						</a>
						. All rights reserved.
					</span>
					{onOpenSettings && (
						<button
							type="button"
							onClick={onOpenSettings}
							className="inline-flex items-center gap-1.5 rounded-md border border-border/50 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground"
						>
							<Settings className="h-3 w-3" />
							Appearance
						</button>
					)}
				</div>
			</div>
		</footer>
	);
}
