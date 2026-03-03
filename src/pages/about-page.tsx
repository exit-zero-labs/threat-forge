import { PageShell } from "./shared/page-shell";

const GITHUB_URL = "https://github.com/exit-zero-labs/threat-forge";

export function AboutPage() {
	return (
		<PageShell title="About — Threat Forge">
			<div className="mx-auto max-w-3xl px-6 py-20">
				<h1 className="text-3xl font-bold tracking-tight text-foreground">About Threat Forge</h1>

				<section className="mt-10">
					<h2 className="text-xl font-semibold text-foreground">Why Threat Forge exists</h2>
					<p className="mt-3 leading-relaxed text-muted-foreground">
						Threat modeling is one of the most effective ways to find security issues early — before
						code is written, before systems go live. But the tooling landscape has a gap:
						Microsoft&apos;s Threat Modeling Tool is free but Windows-only with opaque binary files,
						while enterprise platforms like ThreatModeler and IriusRisk cost $20,000+ per year.
					</p>
					<p className="mt-3 leading-relaxed text-muted-foreground">
						Threat Forge fills that gap. It&apos;s a free, open-source, cross-platform desktop app
						that produces human-readable, git-friendly YAML threat models. Built with Tauri and Rust
						for a lightweight ~10MB binary that runs on macOS, Windows, and Linux.
					</p>
				</section>

				<section className="mt-10">
					<h2 className="text-xl font-semibold text-foreground">Open source</h2>
					<p className="mt-3 leading-relaxed text-muted-foreground">
						Threat Forge is licensed under Apache 2.0. The{" "}
						<code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-sm text-foreground">
							.thf
						</code>{" "}
						file format is the product&apos;s core — a YAML-based schema designed for humans first.
						Your threat models are plain text files you can open in any editor, diff in any tool,
						and review in any pull request.
					</p>
					<p className="mt-3 leading-relaxed text-muted-foreground">
						Security tools should be accessible to everyone, not locked behind enterprise contracts.
						Open source means you can audit the code, contribute improvements, and trust that your
						data stays yours.
					</p>
				</section>

				<section className="mt-10">
					<h2 className="text-xl font-semibold text-foreground">Exit Zero Labs</h2>
					<p className="mt-3 leading-relaxed text-muted-foreground">
						Threat Forge is built by{" "}
						<a
							href="https://www.exitzerolabs.com"
							target="_blank"
							rel="noopener noreferrer"
							className="text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
						>
							Exit Zero Labs LLC
						</a>{" "}
						— an indie software company, bootstrapped by design. Named after{" "}
						<code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-sm text-foreground">
							exit 0
						</code>{" "}
						— the Unix exit code for success. We build tools for developers and security
						practitioners that are direct, crafted, and grounded.
					</p>
				</section>

				<section className="mt-10">
					<h2 className="text-xl font-semibold text-foreground">Get involved</h2>
					<p className="mt-3 leading-relaxed text-muted-foreground">
						Threat Forge is community-driven. Here&apos;s how you can help:
					</p>
					<ul className="mt-4 space-y-2">
						{[
							{
								text: "Star the repo on GitHub",
								href: GITHUB_URL,
							},
							{
								text: "Report bugs or request features",
								href: `${GITHUB_URL}/issues`,
							},
							{
								text: "Contribute code or documentation",
								href: `${GITHUB_URL}/blob/main/CONTRIBUTING.md`,
							},
						].map((item) => (
							<li key={item.text} className="flex items-start gap-2 text-sm text-muted-foreground">
								<span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-tf-signal" />
								<a
									href={item.href}
									target="_blank"
									rel="noopener noreferrer"
									className="transition-colors hover:text-foreground"
								>
									{item.text}
								</a>
							</li>
						))}
					</ul>
				</section>
			</div>
		</PageShell>
	);
}
