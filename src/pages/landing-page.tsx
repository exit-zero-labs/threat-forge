import { Download, FileCode, Globe, Monitor, Shield, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { PageShell } from "./shared/page-shell";

const FEATURES = [
	{
		icon: Shield,
		title: "STRIDE Analysis",
		description:
			"Built-in threat engine identifies Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, and Elevation of Privilege risks across your architecture.",
	},
	{
		icon: FileCode,
		title: "Git-Friendly YAML",
		description:
			"Threat models are stored as human-readable .thf YAML files. Track changes, review diffs, and version your security models alongside your code.",
	},
	{
		icon: Sparkles,
		title: "AI-Enhanced",
		description:
			"Optional AI assistant helps identify threats, suggest mitigations, and build DFD diagrams. Bring your own API key — your data stays on your machine.",
	},
	{
		icon: Monitor,
		title: "Cross-Platform",
		description:
			"Native desktop app for macOS, Windows, and Linux. Lightweight ~10MB binary built with Tauri and Rust. Also available as a web app.",
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
		<section className="px-6 py-24 text-center">
			<div className="mx-auto max-w-3xl">
				<div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/50 bg-secondary/50 px-4 py-1.5 text-xs text-muted-foreground">
					<span className="inline-block h-1.5 w-1.5 rounded-full bg-tf-signal" />
					Open source &middot; Apache 2.0
				</div>
				<h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
					Threat modeling
					<br />
					<span className="text-tf-signal">for a modern age</span>
				</h1>
				<p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
					Build data flow diagrams, run STRIDE analysis, and produce human-readable, git-friendly
					threat models — all in a free, cross-platform desktop app.
				</p>
				<div className="mt-10 flex items-center justify-center gap-4">
					<Link
						to="/app"
						className="inline-flex items-center gap-2 rounded-md bg-tf-signal px-6 py-3 text-sm font-medium text-tf-zero transition-opacity hover:opacity-90"
					>
						<Globe className="h-4 w-4" />
						Try in Browser
					</Link>
					<Link
						to="/downloads"
						className="inline-flex items-center gap-2 rounded-md border border-border px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
					>
						<Download className="h-4 w-4" />
						Download for Free
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
					Everything you need for threat modeling
				</h2>
				<p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
					Bridges the gap between Microsoft&apos;s legacy TMT and $20K/year enterprise platforms.
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
						Your threat models belong in git
					</h2>
					<p className="mt-4 text-muted-foreground leading-relaxed">
						ThreatForge saves everything as{" "}
						<code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-sm text-foreground">
							.thf
						</code>{" "}
						YAML files. Open them in any text editor, track them in version control, and review
						diffs in pull requests — just like code.
					</p>
					<ul className="mt-6 space-y-3">
						{[
							"Human-readable in any text editor",
							"Minimal, clean diffs when tracked in git",
							"Single file — all data inline, no sidecars",
							"Schema-validated for tooling interop",
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
					Start threat modeling today
				</h2>
				<p className="mt-4 text-muted-foreground">
					Free and open source. No account required. No data leaves your machine.
				</p>
				<div className="mt-8 flex items-center justify-center gap-4">
					<Link
						to="/app"
						className="inline-flex items-center gap-2 rounded-md bg-tf-signal px-6 py-3 text-sm font-medium text-tf-zero transition-opacity hover:opacity-90"
					>
						<Globe className="h-4 w-4" />
						Try in Browser
					</Link>
					<Link
						to="/downloads"
						className="inline-flex items-center gap-2 rounded-md border border-border px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
					>
						<Download className="h-4 w-4" />
						Download for Free
					</Link>
				</div>
			</div>
		</section>
	);
}
