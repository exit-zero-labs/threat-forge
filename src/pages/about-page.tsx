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
						Threat modeling works. Sitting down and asking what could go wrong catches things no
						scanner will, and it catches them before anyone has written the code. The practice is
						fine. The tooling is where it falls apart.
					</p>
					<p className="mt-3 leading-relaxed text-muted-foreground">
						The free tools are genuinely useful, right up until you need one on a Mac — or you open
						the file it wrote and find a format only that app understands. The ones built for teams
						solved both, and charge five figures a year for it: fine for a bank, absurd for four
						engineers and a side project. So most teams do it once, before an audit, and never
						again.
					</p>
					<p className="mt-3 leading-relaxed text-muted-foreground">
						Threat Forge is the boring middle. Free, open source, runs on all three desktop
						platforms and in a browser, and saves a YAML file you can read without it.
					</p>
				</section>

				<section className="mt-10">
					<h2 className="text-xl font-semibold text-foreground">Open source</h2>
					<p className="mt-3 leading-relaxed text-muted-foreground">
						Apache 2.0. The{" "}
						<code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-sm text-foreground">
							.thf
						</code>{" "}
						format is the actual product — a YAML schema designed to be read by a person first and
						parsed second. The app is how you edit one conveniently, and it is deliberately not the
						only way.
					</p>
					<p className="mt-3 leading-relaxed text-muted-foreground">
						That matters for an unglamorous reason: a security tool you cannot audit is a security
						tool you are taking on faith. The source is there. So is the schema. If Threat Forge
						disappears tomorrow, your models are still plain text and still yours.
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
						— one person, no investors, no growth targets. Named after{" "}
						<code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-sm text-foreground">
							exit 0
						</code>
						, which is the most anyone can reasonably ask of a program.
					</p>
				</section>

				<section className="mt-10">
					<h2 className="text-xl font-semibold text-foreground">Get involved</h2>
					<p className="mt-3 leading-relaxed text-muted-foreground">
						A bug report from someone who actually threat models is worth more than a star, but both
						are welcome:
					</p>
					<ul className="mt-4 space-y-2">
						{[
							{
								text: "Star it, if you're into that",
								href: GITHUB_URL,
							},
							{
								text: "Tell me what broke, or what's missing",
								href: `${GITHUB_URL}/issues`,
							},
							{
								text: "Send a patch, or fix a sentence in the docs",
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
