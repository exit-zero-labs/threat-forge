import type { ReactNode } from "react";
import { PageShell } from "./shared/page-shell";

const LAST_UPDATED = "July 27, 2026";

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
							your machine to your chosen provider (OpenAI or Anthropic). On the desktop app, your
							API keys are encrypted at rest using AES-256-GCM; in the web app, they are encrypted
							in your browser&apos;s storage under a key the browser will not export, though
							anything running on the page can still use that key. In both cases, your keys are
							never transmitted to Exit Zero Labs.
						</p>
						<p>
							AI features are entirely optional. The application is fully functional without them.
						</p>
					</Section>

					<Section title="Web Application">
						<p>
							The web version at threatforge.dev runs on Cloudflare Workers. Standard hosting logs —
							IP addresses, request timestamps — may be collected as the infrastructure operates,
							and Cloudflare asks your browser to report network errors it runs into while loading
							the site. Threat Forge itself adds nothing on top of that: no analytics, no telemetry,
							no cookies. The content security policy admits no third-party script at all, so
							nothing executes on this page that we did not ship — not even something inserted at
							the edge after the fact.
						</p>
						<p>
							The browser does keep a fair amount on your behalf. Your threat models and your
							encrypted API keys live in IndexedDB; your settings, theme, panel layout and AI chat
							history live in <code>localStorage</code>; the downloads page caches its release
							lookup in <code>sessionStorage</code> for five minutes. None of it is sent to Exit
							Zero Labs. The only thing that leaves your browser is an AI request you initiate, and
							that goes to your provider, as described above.
						</p>
						<p>
							Clearing your browser data for this site deletes all of it, including your threat
							models.
						</p>
					</Section>

					<Section title="Auto-Updater">
						<p>
							The desktop app asks GitHub whether a newer release exists when you open it, at most
							once a day, and whenever you press Check for updates. Left running, it does not ask
							again. The address it requests is fixed, so the request carries no version number and
							nothing about your machine. GitHub does see your IP address and that the request came
							from a Tauri updater, the same as it would for any other download from them.
						</p>
						<p>
							Automatic updates are not switched on yet. Installing one requires a signed release,
							and Threat Forge is not signing its binaries yet, so the check has nothing valid to
							find and reports that it failed. Until that changes, moving to a new version means
							downloading it from threatforge.dev yourself.
						</p>
					</Section>

					<Section title="Third-Party Services">
						<ul className="list-inside list-disc space-y-1">
							<li>
								<strong>GitHub</strong> — source code hosting, releases, issue tracking
							</li>
							<li>
								<strong>Cloudflare</strong> — web application hosting, and the operational logging
								and network-error reporting that comes with it
							</li>
						</ul>
						<p>We do not use advertising networks, tracking pixels, or product analytics.</p>
					</Section>

					<Section title="Contact">
						<p>
							For privacy concerns, contact us at{" "}
							<a href="mailto:privacy@exitzerolabs.com" className="text-tf-signal-ink underline">
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
