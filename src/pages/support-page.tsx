import type { ReactNode } from "react";
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
			"Yes — AI features use a Bring Your Own Key (BYOK) model. You provide your own OpenAI, Anthropic, or Ollama API key. AI features are entirely optional; the app is fully functional without them.",
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
	return (
		<PageShell title="Support — Threat Forge">
			<div className="mx-auto max-w-3xl px-6 py-20">
				<h1 className="text-3xl font-bold tracking-tight text-foreground">Support</h1>
				<p className="mt-3 text-muted-foreground">
					Threat Forge is an open-source project. Here&apos;s how to get help.
				</p>

				<div className="mt-10 space-y-10">
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
