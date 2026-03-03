import type { ReactNode } from "react";
import { PageShell } from "./shared/page-shell";

const LAST_UPDATED = "March 3, 2026";

export function PrivacyPage() {
	return (
		<PageShell title="Privacy Policy — Threat Forge">
			<div className="mx-auto max-w-3xl px-6 py-20">
				<h1 className="text-3xl font-bold tracking-tight text-foreground">Privacy Policy</h1>
				<p className="mt-2 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>

				<div className="mt-10 space-y-10">
					<Section title="Data Collection">
						<p>
							Threat Forge is a local-first desktop application. Your threat models are stored as
							files on your computer. We do not require accounts, do not collect personal
							information, and do not transmit your threat model data to any server.
						</p>
					</Section>

					<Section title="AI Features">
						<p>
							Threat Forge uses a Bring Your Own Key (BYOK) model for AI features. When you use
							AI-powered threat analysis or chat, your API key and prompts are sent directly from
							your machine to your chosen provider (OpenAI, Anthropic, or Ollama). Your API keys are
							encrypted at rest using AES-256-GCM and are never transmitted to Exit Zero Labs.
						</p>
						<p>
							AI features are entirely optional. The application is fully functional without them.
						</p>
					</Section>

					<Section title="Web Application">
						<p>
							The web version at threatforge.dev is hosted on Vercel. Standard Vercel hosting logs
							(IP addresses, request timestamps) may be collected as part of infrastructure
							operation. No cookies are used beyond <code>sessionStorage</code> for caching GitHub
							API responses on the downloads page.
						</p>
					</Section>

					<Section title="Auto-Updater">
						<p>
							The desktop application checks GitHub Releases for new versions. This request includes
							only the current app version and operating system — no personally identifiable
							information is transmitted.
						</p>
					</Section>

					<Section title="Third-Party Services">
						<ul className="list-inside list-disc space-y-1">
							<li>
								<strong>GitHub</strong> — source code hosting, releases, issue tracking
							</li>
							<li>
								<strong>Vercel</strong> — web application hosting
							</li>
						</ul>
						<p>
							We do not use advertising networks, tracking pixels, or analytics services that
							profile users.
						</p>
					</Section>

					<Section title="Contact">
						<p>
							For privacy concerns, contact us at{" "}
							<a href="mailto:privacy@exitzerolabs.com" className="text-tf-signal hover:underline">
								privacy@exitzerolabs.com
							</a>
							.
						</p>
					</Section>
				</div>
			</div>
		</PageShell>
	);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section>
			<h2 className="text-xl font-semibold text-foreground">{title}</h2>
			<div className="mt-3 space-y-3 leading-relaxed text-muted-foreground [&_code]:rounded [&_code]:bg-secondary [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-sm [&_code]:text-foreground">
				{children}
			</div>
		</section>
	);
}
