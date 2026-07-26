import { type ReactNode, useEffect } from "react";
import { useLocation } from "react-router-dom";
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
		target?.scrollIntoView({ behavior: "smooth", block: "start" });
	}, [hash]);
}

function Command({ children }: { children: string }) {
	return (
		<code className="mt-2 block overflow-x-auto rounded-md border border-border/50 bg-secondary px-3 py-2 font-mono text-xs text-foreground">
			{children}
		</code>
	);
}

/**
 * First-run guidance for the unsigned desktop builds. Remove this section, its anchor
 * module, and the downloads-page line that points here once macOS notarization (#51)
 * and Windows signing (#50) ship — at that point the operating systems stop objecting
 * and this advice becomes wrong rather than merely unnecessary.
 */
function FirstRunSection() {
	return (
		<section id={FIRST_RUN_HELP_ANCHOR} className="scroll-mt-24">
			<h2 className="text-xl font-semibold text-foreground">
				Opening Threat Forge for the first time
			</h2>
			<p className="mt-3 text-sm leading-relaxed text-muted-foreground">
				Threat Forge desktop builds are not yet code-signed. Your operating system cannot confirm
				who produced them, so it blocks the first launch. Nothing is wrong with your download —
				these steps are how you open an unsigned application on each platform.
			</p>

			<div className="mt-6 space-y-6">
				<div>
					<h3 className="font-medium text-foreground">macOS</h3>
					<p className="mt-1 text-sm leading-relaxed text-muted-foreground">
						macOS may say Threat Forge <em>&ldquo;is damaged and can&apos;t be opened&rdquo;</em>.
						It is not damaged. macOS quarantines everything downloaded from the internet, and with
						no Apple Developer ID signature to check, Gatekeeper refuses the app instead of offering
						the usual override. Move Threat Forge to your Applications folder, then run this once in
						Terminal to clear the quarantine flag:
					</p>
					<Command>
						xattr -dr com.apple.quarantine &quot;/Applications/Threat Forge.app&quot;
					</Command>
					<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
						To avoid Terminal, try to open the app first, then go to System Settings &rarr; Privacy
						&amp; Security, scroll to the Security section, and choose{" "}
						<strong className="font-medium text-foreground">Open Anyway</strong> next to Threat
						Forge.
					</p>
				</div>

				<div>
					<h3 className="font-medium text-foreground">Windows</h3>
					<p className="mt-1 text-sm leading-relaxed text-muted-foreground">
						SmartScreen shows <em>&ldquo;Windows protected your PC&rdquo;</em> because the
						installer&apos;s publisher reputation is not yet established. Choose{" "}
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
				Every release is built in the open by GitHub Actions from a public tagged commit, so you can
				read the source and the build workflow before you run anything. Signed and notarized builds
				are planned; until then this page stays honest about what your operating system is telling
				you.{" "}
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
