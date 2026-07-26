/**
 * What the app tells users changed between releases, and who has seen it.
 *
 * This lives in `lib` rather than beside the overlay component because
 * `useOnboardingTriggers` has to ask the same question — whether the What's New modal is
 * about to open — before it starts a guide. Keeping the logic here means the hook does not
 * import a component module to answer it, and neither side re-derives the answer.
 */

/**
 * Where the last acknowledged version is recorded.
 *
 * `e2e/fixtures.ts` and `e2e/onboarding-auto-start.spec.ts` repeat this literal rather than
 * importing it: they run inside `addInitScript` in page context, where this module's
 * build-time `__APP_VERSION__` define does not exist. Renaming this constant means editing
 * those two call sites too, or every browser spec silently starts fighting the overlay.
 */
export const WHATS_NEW_STORAGE_KEY = "threatforge-last-seen-version";

/**
 * The build's own version, the same define the settings dialog, canvas badge, and site
 * footer read. Hard-coding it separately let the overlay announce a version the rest of
 * the app disagreed with (#246), so there is deliberately no second literal.
 */
const CURRENT_VERSION = __APP_VERSION__;

/** localStorage is user-writable; only an exact `major.minor.patch` value is comparable. */
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

/** Proper semver greater-than comparison (avoids lexicographic "1.9.0" > "1.10.0" bug) */
function semverGt(a: string, b: string): boolean {
	const pa = a.split(".").map(Number);
	const pb = b.split(".").map(Number);
	for (let i = 0; i < 3; i++) {
		if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
		if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
	}
	return false;
}

export interface ChangelogEntry {
	version: string;
	date: string;
	changes: string[];
}

/**
 * Newest first. Every version here corresponds to a `v*` tag.
 *
 * This list is hand-maintained and does not follow the version bump — releasing without
 * adding an entry means upgrading users are told nothing. The release runbook carries the
 * step.
 */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: "0.3.0",
		date: "2026-07-26",
		changes: [
			"AI edits the model through native tool calls, so a suggestion arrives as a real change to elements, flows, and threats rather than an action block the app has to re-parse",
			"A proposed change is re-checked against the file format before it lands, and refused if the result would not reopen or if the document moved underneath it",
			"AI can read your current document and the component catalog before it suggests anything",
			"Refreshed OpenAI and Anthropic model catalog",
			"Import existing models from Microsoft Threat Modeling Tool .tm7 files",
			"Open several models at once in a tabbed workspace",
			"Browser documents survive a refresh — work is saved locally as you go",
			"Browser API keys are stored as ciphertext instead of clear text, and the web app now ships a strict Content-Security-Policy",
			"Document content sent to the AI is fenced as untrusted context",
			"Copy an individual threat as YAML, and see a summary badge for the whole model",
			"Keyboard and contrast fixes across the palette, welcome screen, and empty canvas",
		],
	},
	{
		version: "0.2.0",
		date: "2026-03-04",
		changes: [
			"AI chat: model selector, saved chat sessions, markdown rendering, and stop generating",
			"Text annotations on the canvas",
			"Rebuilt starter templates",
			"threatforge.dev — landing, downloads, and legal pages",
		],
	},
	{
		version: "0.1.1",
		date: "2026-03-03",
		changes: [
			"Eight-handle edge routing and canvas interaction polish",
			"AI chat response quality improvements",
		],
	},
	{
		version: "0.1.0",
		date: "2026-03-02",
		changes: [
			"Component library with 44 pre-built technology components + text annotations",
			"STRIDE threat analysis engine with auto-generated threats",
			"AI chat pane with BYOK support (OpenAI, Anthropic)",
			"Human-readable YAML file format — git-diffable",
			"Undo/redo with 20-action history",
			"Copy, cut, paste, and multi-select on canvas",
			"Command palette (Cmd+K) with 16 commands",
			"Onboarding guides for new users",
			"Dark mode with 6 theme presets",
			"Native menus on macOS/Windows/Linux",
		],
	},
];

/**
 * Chooses which entries to announce, given what the user last acknowledged.
 *
 * Split out from the storage read so the version-comparison rules can be tested against
 * versions this build does not have — `__APP_VERSION__` is substituted at build time, so
 * neither a test nor `vi.stubGlobal` can vary it.
 *
 * @param lastSeen the raw stored value, exactly as it came out of localStorage
 * @param currentVersion the running build's version
 * @param changelog entries, newest first
 */
export function selectUnseenEntries(
	lastSeen: string | null,
	currentVersion: string,
	changelog: ChangelogEntry[],
): ChangelogEntry[] {
	if (lastSeen === currentVersion) {
		return [];
	}

	// A stored version above the newest entry cannot have come from the app's own history,
	// because a build never announces a version it has no entry for — `whats-new.test.ts`
	// fails the build when the newest entry and the running version disagree. Builds up to
	// 0.2.0 wrote a hard-coded "1.0.0" here (#246), so treating that value as "already
	// seen" would suppress the overlay until the app genuinely reached 1.0.0. Fall back to
	// first-launch behavior, which self-heals as soon as the user dismisses.
	const newestKnown = changelog[0]?.version ?? currentVersion;
	const usable =
		lastSeen !== null && SEMVER_PATTERN.test(lastSeen) && !semverGt(lastSeen, newestKnown)
			? lastSeen
			: null;

	return usable !== null
		? changelog.filter((entry) => semverGt(entry.version, usable))
		: changelog.slice(0, 1);
}

/**
 * Changelog entries the user has not acknowledged yet, newest first, or an empty array
 * when there is nothing to announce.
 */
export function unseenChangelogEntries(): ChangelogEntry[] {
	return selectUnseenEntries(
		localStorage.getItem(WHATS_NEW_STORAGE_KEY),
		CURRENT_VERSION,
		CHANGELOG,
	);
}

/** Records the running version as acknowledged, so the overlay stays closed until the next one. */
export function markChangelogSeen(): void {
	localStorage.setItem(WHATS_NEW_STORAGE_KEY, CURRENT_VERSION);
}
