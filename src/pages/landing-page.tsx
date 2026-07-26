import { Download, FileCode, Globe, Monitor, Shield, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { PageShell } from "./shared/page-shell";

const FEATURES = [
	{
		icon: Shield,
		title: "STRIDE, minus the workshop",
		description:
			"All six categories, run against every element and flow where they apply. It won't find the clever bug in your auth logic. It will find the twelve boring ones you were going to skip.",
	},
	{
		icon: FileCode,
		title: "It's a file. That's the whole trick.",
		description:
			"A .thf is YAML. Open it in vim, diff it on GitHub, grep it. There's no export step to get something reviewable — the file already is one.",
	},
	{
		icon: Sparkles,
		title: "AI that edits, not advises",
		description:
			"Bring your own key. The model edits elements, flows, and threats directly instead of describing what you should type. Every edit is schema-checked and waits for your approval before it lands.",
	},
	{
		icon: Monitor,
		title: "Runs anywhere, weighs nothing",
		description: "About ten megabytes, in Rust. macOS, Windows, Linux, or no install at all.",
	},
] as const;

const YAML_SAMPLE = `# ThreatForge Threat Model
version: "1.0"
metadata:
  title: "Payment Processing Service"
  author: "Alex Chen"

elements:
  - id: web-app
    type: process
    name: "Web Application"
    trust_zone: internal

  - id: api-gateway
    type: process
    name: "API Gateway"
    trust_zone: dmz

data_flows:
  - id: flow-1
    from: web-app
    to: api-gateway
    protocol: HTTPS/TLS-1.3
    authenticated: true

threats:
  - id: threat-1
    title: "SQL Injection on payment queries"
    category: Tampering
    element: api-gateway
    severity: High
    mitigation:
      status: mitigated
      description: "Parameterized queries via ORM"`;

export function LandingPage() {
	return (
		<PageShell title="Threat Forge — Open-Source AI Threat Modeling">
			<HeroSection />
			<FeaturesSection />
			<YamlShowcaseSection />
			<CtaSection />
		</PageShell>
	);
}

function HeroSection() {
	return (
		<section className="px-6 py-24 text-center" data-testid="hero">
			<div className="mx-auto max-w-4xl">
				<div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/50 bg-secondary/50 px-4 py-1.5 text-xs text-muted-foreground">
					<span className="inline-block h-1.5 w-1.5 rounded-full bg-tf-signal" />
					Open source &middot; Apache 2.0
				</div>
				<h1 className="text-3xl font-bold tracking-tight text-balance text-foreground sm:text-4xl lg:text-5xl">
					Threat modeling for people who <br className="hidden sm:inline" />
					<span className="text-tf-signal">hate threat modeling tools</span>
				</h1>
				<p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
					You know the drill. Install something Windows-only, drag boxes around for an afternoon,
					export a report, never open it again. This is boxes and arrows too — it just saves to
					YAML, opens in your editor, and turns up in code review like everything else you own.
				</p>
				<div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
					<Link
						to="/app"
						className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-tf-signal px-6 py-3 text-sm font-medium text-tf-zero transition-opacity hover:opacity-90 sm:w-auto"
					>
						<Globe className="h-4 w-4" />
						Try it in the browser
					</Link>
					<Link
						to="/downloads"
						className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-border px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary sm:w-auto"
					>
						<Download className="h-4 w-4" />
						Download
					</Link>
				</div>
			</div>
		</section>
	);
}

function FeaturesSection() {
	return (
		<section className="border-t border-border/50 px-6 py-20">
			<div className="mx-auto max-w-6xl">
				<h2 className="text-center text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
					What it actually does
				</h2>
				<p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
					Microsoft&apos;s Threat Modeling Tool is free, Windows-only, and saves a .NET object graph
					with some XML wrapped around it. IriusRisk and ThreatModeler are the grown-up alternative,
					at around $20,000 a year. This is the third option.
				</p>
				<div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
					{FEATURES.map((feature) => (
						<div key={feature.title} className="rounded-lg border border-border/50 bg-card p-6">
							<feature.icon className="h-8 w-8 text-tf-signal" />
							<h3 className="mt-4 text-sm font-semibold text-foreground">{feature.title}</h3>
							<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
								{feature.description}
							</p>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}

function YamlShowcaseSection() {
	return (
		<section className="border-t border-border/50 px-6 py-20">
			<div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-2 lg:items-center">
				<div>
					<h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
						Yes, it&apos;s just a file
					</h2>
					<p className="mt-4 text-muted-foreground leading-relaxed">
						Everything lives in one{" "}
						<code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-sm text-foreground">
							.thf
						</code>{" "}
						file. Someone widens a trust boundary, and the diff is one line — reviewable by a
						teammate who has never opened Threat Forge and has no intention of starting.
					</p>
					<ul className="mt-6 space-y-3">
						{[
							"Readable in any editor, including the one you're already in",
							"One file — no sidecars, no lockfile, no project folder",
							"Diffs a person can actually review",
							"Schema-validated, so other tools can read it too",
						].map((item) => (
							<li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
								<span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-tf-signal" />
								{item}
							</li>
						))}
					</ul>
				</div>
				<div className="overflow-hidden rounded-lg border border-border/50 bg-card">
					<div className="flex items-center gap-2 border-b border-border/50 bg-secondary/30 px-4 py-2.5">
						<FileCode className="h-4 w-4 text-muted-foreground" />
						<span className="font-mono text-xs text-muted-foreground">payment-service.thf</span>
					</div>
					<pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-muted-foreground">
						<code>{YAML_SAMPLE}</code>
					</pre>
				</div>
			</div>
		</section>
	);
}

function CtaSection() {
	return (
		<section className="border-t border-border/50 px-6 py-24 text-center">
			<div className="mx-auto max-w-2xl">
				<h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
					That&apos;s the pitch
				</h2>
				<p className="mt-4 text-muted-foreground">
					Free, open source, no account. Your models stay on your machine unless you point it at an
					AI provider yourself. If you hate it, you&apos;re out ten minutes.
				</p>
				<div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
					<Link
						to="/app"
						className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-tf-signal px-6 py-3 text-sm font-medium text-tf-zero transition-opacity hover:opacity-90 sm:w-auto"
					>
						<Globe className="h-4 w-4" />
						Try it in the browser
					</Link>
					<Link
						to="/downloads"
						className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-border px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary sm:w-auto"
					>
						<Download className="h-4 w-4" />
						Download
					</Link>
				</div>
			</div>
		</section>
	);
}
