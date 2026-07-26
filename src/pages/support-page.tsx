import { type ReactNode, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useSettingsStore } from "@/stores/settings-store";
import { FIRST_RUN_HELP_ANCHOR } from "./shared/first-run-help";
import { PageShell } from "./shared/page-shell";

const GITHUB_URL = "https://github.com/exit-zero-labs/threat-forge";

const FAQ_ITEMS = [
	{
		question: "Is Threat Forge free?",
		answer:
			"Yes. Threat Forge is free and open source, licensed under Apache 2.0. No account required, no usage limits.",
	},
	{
		question: "Do I need an API key for AI features?",
		answer:
			"Yes — AI features use a Bring Your Own Key (BYOK) model. You provide your own OpenAI or Anthropic API key. AI features are entirely optional; the app is fully functional without them.",
	},
	{
		question: "What file format does Threat Forge use?",
		answer:
			"Threat models are saved as .thf files — a YAML-based format designed to be human-readable, git-friendly, and schema-validated. You can open them in any text editor.",
	},
	{
		question: "What platforms are supported?",
		answer:
			"Threat Forge runs on macOS, Windows, and Linux as a native desktop app. A web version is also available at threatforge.dev/app.",
	},
	{
		question: "How do I report a security vulnerability?",
		answer: "security",
	},
	{
		question: "Can I contribute?",
		answer: "contribute",
	},
] as const;

export function SupportPage() {
	useHashScroll();

	return (
		<PageShell title="Support — Threat Forge">
			<div className="mx-auto max-w-3xl px-6 py-20">
				<h1 className="text-3xl font-bold tracking-tight text-foreground">Support</h1>
				<p className="mt-3 text-muted-foreground">
					Threat Forge is an open-source project. Here&apos;s how to get help.
				</p>

				<div className="mt-10 space-y-10">
					<FirstRunSection />

					{/* Contact channels */}
					<section>
						<h2 className="text-xl font-semibold text-foreground">Contact</h2>
						<div className="mt-4 space-y-4">
							<div className="rounded-lg border border-border/50 bg-card p-5">
								<h3 className="font-medium text-foreground">GitHub Issues</h3>
								<p className="mt-1 text-sm text-muted-foreground">
									The primary support channel. Report bugs, request features, or ask questions.
								</p>
								<a
									href={`${GITHUB_URL}/issues`}
									target="_blank"
									rel="noopener noreferrer"
									className="mt-3 inline-block text-sm text-tf-signal hover:underline"
								>
									Open an issue on GitHub
								</a>
							</div>
							<div className="rounded-lg border border-border/50 bg-card p-5">
								<h3 className="font-medium text-foreground">Email</h3>
								<p className="mt-1 text-sm text-muted-foreground">
									For private inquiries or security concerns.
								</p>
								<a
									href="mailto:admin@exitzerolabs.com"
									className="mt-3 inline-block text-sm text-tf-signal hover:underline"
								>
									admin@exitzerolabs.com
								</a>
							</div>
						</div>
					</section>

					{/* FAQ */}
					<section>
						<h2 className="text-xl font-semibold text-foreground">Frequently Asked Questions</h2>
						<div className="mt-4 space-y-4">
							{FAQ_ITEMS.map((item) => (
								<div key={item.question}>
									<h3 className="font-medium text-foreground">{item.question}</h3>
									<div className="mt-1 text-sm leading-relaxed text-muted-foreground">
										{renderAnswer(item.answer)}
									</div>
								</div>
							))}
						</div>
					</section>
				</div>
			</div>
		</PageShell>
	);
}

/**
 * React Router does not scroll to the fragment of a URL it navigates to, so an
 * incoming `/support#opening-for-the-first-time` link would otherwise land silently
 * at the top of the page and leave the reader to hunt for the section.
 */
function useHashScroll(): void {
	const { hash } = useLocation();

	useEffect(() => {
		if (!hash) {
			return;
		}
		// A hash is arbitrary user-controlled input; querying by id avoids handing it
		// to a selector parser and simply finds nothing when it names no section.
		const target = document.getElementById(hash.slice(1));
		const behavior = useSettingsStore.getState().settings.reduceMotion ? "auto" : "smooth";
		target?.scrollIntoView?.({ behavior, block: "start" });
	}, [hash]);
}

function Command({ children }: { children: string }) {
	return (
		// The command is wrapped in a named region so the horizontally scrollable box is
		// reachable by Tab (WCAG 2.1.1) — these commands overflow at narrow widths, and a
		// keyboard user has to be able to read the whole of one before running it. Same
		// shape as the palette fix in 95aa1bb: a named <section>, not a tabbable <code>,
		// because <code> has no role to hang an accessible name on.
		<section
			aria-label={`Command: ${children}`}
			// biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be focusable for keyboard access
			tabIndex={0}
			className="mt-2 block overflow-x-auto rounded-md border border-border/50 bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tf-signal"
		>
			<code className="block px-3 py-2 font-mono text-xs text-foreground">{children}</code>
		</section>
	);
}

/**
 * First-run guidance for the desktop builds.
 *
 * The macOS and Windows subsections describe what an unsigned or low-reputation build does;
 * once notarization (#51) and Windows signing verification (#50) are complete they become
 * wrong rather than merely unnecessary, and they go — along with the downloads-page line that
 * points here, if nothing else is left worth pointing at. The Linux subsection is about an
 * execute bit rather than signing and stays correct regardless.
 */
function FirstRunSection() {
	return (
		<section id={FIRST_RUN_HELP_ANCHOR} className="scroll-mt-24">
			<h2 className="text-xl font-semibold text-foreground">
				Opening Threat Forge for the first time
			</h2>
			<p className="mt-3 text-sm leading-relaxed text-muted-foreground">
				A freshly published desktop build can be blocked or flagged the first time you open it.
				Nothing is wrong with your download. Here is what each platform does and how to get past it.
			</p>

			<div className="mt-6 space-y-6">
				<div>
					<h3 className="font-medium text-foreground">macOS</h3>
					<p className="mt-1 text-sm leading-relaxed text-muted-foreground">
						The macOS builds are not signed with an Apple Developer ID or notarized yet, so macOS
						may report that Threat Forge <em>&ldquo;is damaged and can&apos;t be opened&rdquo;</em>.
						It is not damaged — macOS quarantines everything downloaded from the internet, and with
						no signature to evaluate, Gatekeeper refuses the app outright. Move Threat Forge to your
						Applications folder, then run this once in Terminal to clear the quarantine flag:
					</p>
					<Command>
						xattr -dr com.apple.quarantine &quot;/Applications/Threat Forge.app&quot;
					</Command>
					<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
						If macOS instead shows the milder &ldquo;unidentified developer&rdquo; prompt, open
						System Settings &rarr; Privacy &amp; Security, scroll to the Security section, and
						choose <strong className="font-medium text-foreground">Open Anyway</strong>. That option
						is not offered for the &ldquo;damaged&rdquo; message above, which is why the command
						exists.
					</p>
				</div>

				<div>
					<h3 className="font-medium text-foreground">Windows</h3>
					<p className="mt-1 text-sm leading-relaxed text-muted-foreground">
						SmartScreen may show <em>&ldquo;Windows protected your PC&rdquo;</em> because the
						installer&apos;s publisher reputation is still being established. Choose{" "}
						<strong className="font-medium text-foreground">More info</strong>, then{" "}
						<strong className="font-medium text-foreground">Run anyway</strong>.
					</p>
				</div>

				<div>
					<h3 className="font-medium text-foreground">Linux</h3>
					<p className="mt-1 text-sm leading-relaxed text-muted-foreground">
						Linux does not block unsigned applications, but the AppImage needs the execute bit set
						before it will run:
					</p>
					<Command>chmod +x ./Threat.Forge_*.AppImage</Command>
					<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
						The Debian and RPM packages install normally:
					</p>
					<Command>sudo apt install ./Threat.Forge_*.deb</Command>
					<Command>sudo dnf install ./Threat.Forge-*.rpm</Command>
				</div>
			</div>

			<p className="mt-6 text-sm leading-relaxed text-muted-foreground">
				Every release is built by GitHub Actions from a public tagged commit, so you can read the
				source and the build workflow before you run anything.{" "}
				<a
					href={`${GITHUB_URL}/releases`}
					target="_blank"
					rel="noopener noreferrer"
					className="text-tf-signal hover:underline"
				>
					View releases on GitHub
				</a>
			</p>
		</section>
	);
}

function renderAnswer(answer: string): ReactNode {
	if (answer === "security") {
		return (
			<p>
				Please review our{" "}
				<a
					href={`${GITHUB_URL}/blob/main/SECURITY.md`}
					target="_blank"
					rel="noopener noreferrer"
					className="text-tf-signal hover:underline"
				>
					Security Policy
				</a>{" "}
				for responsible disclosure instructions.
			</p>
		);
	}
	if (answer === "contribute") {
		return (
			<p>
				We welcome contributions. Check out the{" "}
				<a
					href={GITHUB_URL}
					target="_blank"
					rel="noopener noreferrer"
					className="text-tf-signal hover:underline"
				>
					GitHub repository
				</a>{" "}
				to get started.
			</p>
		);
	}
	return <p>{answer}</p>;
}
