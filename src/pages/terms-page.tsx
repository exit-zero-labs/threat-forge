import type { ReactNode } from "react";
import { PageShell } from "./shared/page-shell";

const LAST_UPDATED = "March 3, 2026";

export function TermsPage() {
	return (
		<PageShell title="Terms of Service — Threat Forge">
			<div className="mx-auto max-w-3xl px-6 py-20">
				<h1 className="text-3xl font-bold tracking-tight text-foreground">Terms of Service</h1>
				<p className="mt-2 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>

				<div className="mt-10 space-y-10">
					<Section title="License">
						<p>
							Threat Forge is open-source software licensed under the{" "}
							<a
								href="https://opensource.org/licenses/Apache-2.0"
								target="_blank"
								rel="noopener noreferrer"
								className="text-tf-signal hover:underline"
							>
								Apache License 2.0
							</a>
							. You are free to use, modify, and distribute the software in accordance with the
							license terms.
						</p>
					</Section>

					<Section title="Use at Your Own Risk">
						<p>
							Threat models produced by Threat Forge are advisory in nature. They are tools to help
							identify potential security risks but do not guarantee the security of any system. You
							are responsible for validating and acting on threat model findings.
						</p>
					</Section>

					<Section title="AI Disclaimer">
						<p>
							AI-generated threat suggestions, mitigations, and analysis are produced by third-party
							language models (OpenAI, Anthropic, Ollama) using your own API key. These outputs are
							not professional security advice and should be reviewed by qualified security
							professionals before being relied upon.
						</p>
					</Section>

					<Section title="No Warranty">
						<p>
							THE SOFTWARE IS PROVIDED &ldquo;AS IS&rdquo;, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
							IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
							PARTICULAR PURPOSE, AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
							HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY, WHETHER IN AN ACTION OF
							CONTRACT, TORT, OR OTHERWISE, ARISING FROM, OUT OF, OR IN CONNECTION WITH THE SOFTWARE
							OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
						</p>
					</Section>

					<Section title="Modifications">
						<p>
							Exit Zero Labs reserves the right to update these terms at any time. Changes will be
							posted on this page with an updated date. Continued use of Threat Forge after changes
							constitutes acceptance of the revised terms.
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
			<div className="mt-3 space-y-3 leading-relaxed text-muted-foreground">{children}</div>
		</section>
	);
}
