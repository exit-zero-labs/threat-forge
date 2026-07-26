/**
 * The deterministic anti-slop engine, shared across Exit Zero Labs repos.
 *
 * Before any model-based judge runs, this cheap repeatable pass flags the copy tells catalogued in
 * `docs/first-principles/anti-slop/copy.md` and `explanatory-register.md`. Cheap signal first;
 * expensive judges only on what survives. Given the same text it always returns the same report,
 * which is what makes a harness built on it deterministic.
 *
 * Extracted from Project Postcard's `packages/evals/src/slop.ts`. Only domain-neutral tells live
 * here; a consuming repo passes its own vocabulary through `SlopOptions` rather than forking the
 * engine — that is why the options parameter exists despite the engine having one caller today.
 *
 * Dependency-free on purpose: it must run in CI in any repo without an install step.
 */

/**
 * Phrases that read as filler in any register. Domain vocabulary (a travel magazine's "hidden gem",
 * a security tool's "enterprise-grade") belongs in the consuming repo, not here.
 */
export const CORE_BANNED_PHRASES: readonly string[] = [
	// Hollow superlatives — praise carrying no evidence.
	"breathtaking",
	"stunning",
	"vibrant",
	"cutting-edge",
	"game-changer",
	"game changer",
	"revolutionize",
	"a testament to",
	// Throat-clearing and filler transitions.
	"picture this",
	"in today's world",
	"in conclusion",
	"needless to say",
	"that being said",
	"at the end of the day",
	"when it comes to",
	"begs the question",
	"moreover",
	"furthermore",
	"first and foremost",
	"last but not least",
	// Pseudo-emphasis that adds nothing a reader could not infer.
	"it's worth noting",
	"it is worth noting",
	"it's important to note",
	"it is important to note",
	// Corporate-register filler that survives into generated docs.
	"delve into",
	"a wide range of",
	"plays a crucial role",
	"plays a vital role",
	"in the realm of",
	"leverage the power",
	"unlock the potential",
	"seamlessly integrate",
];

/** A "not just X, it's Y" manufactured-profundity construction. */
const NOT_JUST_PATTERN = /\bnot just\b[^.!?;]{1,60}?,?\s+(it['’]s|it is|but|rather)\b/gi;

/** Grandiose "in today's ... world/landscape" throat-clearing. */
const IN_TODAYS_PATTERN = /\bin today['’]s\b[^.!?;]{0,40}?\b(world|landscape|age|era|society)\b/gi;

/** "Whether you're X or Y" listicle framing. */
const WHETHER_YOURE_PATTERN = /\bwhether you['’]re\b/gi;

/**
 * Explainer-voice connective filler — the analytic register's own slop vocabulary, which the
 * phrase list above does not catch at all. These simulate the *feeling* of an argument advancing
 * while advancing nothing.
 *
 * Each pattern is deliberately narrower than the tell it names, because a false positive here is
 * worse than a miss: a firing pattern feeds corrective text into every subsequent revision attempt,
 * so a pattern that catches legitimate prose quietly degrades the drafts that follow it. That is why
 * `there's a catch` is here but a bare `there's a problem` is not ("There's a problem with the
 * drainage" is a real sentence), and why `it turns out` is caught only inside the explainer's
 * `the answer, it turns out` framing rather than on its own.
 */
const EXPLAINER_VOICE_PATTERNS: readonly RegExp[] = [
	/\bhere['’]s the (?:thing|kicker|catch|twist)\b/gi,
	/\b(?:that|this|here)['’]s where it gets (?:interesting|complicated|weird|strange|tricky)\b/gi,
	/\bthe answer[,:]?\s+it turns out\b/gi,
	/\b(?:simple|easy|straightforward)[,]?\s+right\?/gi,
	/\blet['’]s (?:back up|rewind|take a step back|start (?:at the beginning|with the basics))\b/gi,
	/\bso,?\s+what['’]s (?:going on|happening) here\b/gi,
	/\bthere['’]s (?:a|one) (?:catch|wrinkle)\b/gi,
	/\bit all comes down to\b/gi,
	/\b(?:this|that|here) is where\b[^.!?]{0,60}?\bcomes? in\b/gi,
	/\bthe story (?:starts|begins) in \d{4}\b/gi,
];

/**
 * Retention scaffolding borrowed from video, which does not survive the move to text. A reader can
 * look down the page, so a promise to explain later reads as stalling rather than as a hook.
 */
const FORWARD_PROMISE_PATTERNS: readonly RegExp[] = [
	/\b(?:we|I)(?:['’]ll| will) (?:come back to|return to|get to) (?:that|this)\b/gi,
	/\bmore on (?:that|this) (?:shortly|later|in a moment|in a second)\b/gi,
	/\bfirst,?\s+(?:some|a little|a bit of) (?:context|background|history)\b/gi,
	/\bin this (?:piece|article|issue|story|document),?\s+(?:we|I)(?:['’]ll| will)\b/gi,
];

/**
 * Stacked hedges — two uncertainty markers doing one marker's work. "May potentially" says nothing
 * "may" does not, and the doubling is a reliable signature of prose padding out a claim it cannot
 * support. A single hedge is legitimate and is deliberately not matched.
 */
const HEDGE_STACK_PATTERN = /\b(?:may|might|could)\s+(?:potentially|possibly|perhaps|conceivably)\b/gi;

/**
 * Hollow confidence in process artifacts — a reassurance standing in for a checkable claim
 * (`anti-slop/process.md` § reports). Narrow on purpose: "should work as expected" is caught,
 * a bare "should work with the new schema" is not, because that one carries information.
 */
const HOLLOW_CONFIDENCE_PATTERN =
	/\bshould\s+(?:just\s+work|work\s+(?:fine|as\s+expected)|be\s+(?:fine|straightforward|trivial|simple))\b/gi;

/** Em dashes above this many per 1,000 characters read as a rhythm crutch. */
const EM_DASH_PER_1K_LIMIT = 4;

/** Cleanliness threshold: below this, copy does not ship. */
export const DEFAULT_MIN_SCORE = 0.85;

export type SlopPatternKind =
	| "banned_phrase"
	| "not_just_construction"
	| "in_todays_world"
	| "whether_youre"
	| "em_dash_density"
	| "explainer_voice"
	| "forward_promise"
	| "hedge_stack"
	| "hollow_confidence"
	| "custom";

/** A single detected tell, with how many times it occurred and a sample. */
export interface SlopFinding {
	kind: SlopPatternKind;
	detail: string;
	count: number;
}

export interface SlopReport {
	findings: SlopFinding[];
	/** Cleanliness score in 0..1; 1 is clean. Derived deterministically from the findings. */
	score: number;
	/** True when a disqualifying pattern was found — an automatic fail regardless of score. */
	hasHardTell: boolean;
}

/** Domain vocabulary a consuming repo layers on top of the core engine. */
export interface SlopOptions {
	/** Extra lowercase substrings scored as banned phrases. */
	extraPhrases?: readonly string[];
	/** Extra regexes, each reported as `custom` under the supplied label. */
	extraPatterns?: readonly { label: string; pattern: RegExp; hard?: boolean }[];
}

/**
 * Kinds that disqualify outright rather than deducting. Connective filler and retention scaffolding
 * are disqualifying in the same way the "not just X" construction is: they are not a deduction on
 * otherwise good copy, they are the copy admitting it has nothing to advance.
 */
const HARD_KINDS: ReadonlySet<SlopPatternKind> = new Set<SlopPatternKind>([
	"not_just_construction",
	"in_todays_world",
	"explainer_voice",
	"forward_promise",
]);

const PENALTY_BY_KIND: Readonly<Partial<Record<SlopPatternKind, number>>> = {
	banned_phrase: 0.06,
	whether_youre: 0.08,
	hedge_stack: 0.08,
	// Weighted heavier than a phrase tell: in a process artifact this is a reassurance standing in
	// for a checkable claim, which is the failure the review layer is least able to catch.
	hollow_confidence: 0.12,
};
const DEFAULT_PENALTY = 0.18;

const countMatches = (text: string, pattern: RegExp): { count: number; sample?: string } => {
	// Reset lastIndex: these are module-level /g regexes reused across calls, and a stale lastIndex
	// would make results depend on call order — which would break determinism.
	pattern.lastIndex = 0;
	const matches = [...text.matchAll(pattern)];
	const first = matches[0]?.[0];
	return first ? { count: matches.length, sample: first } : { count: 0 };
};

const countPhrase = (lowerText: string, phrase: string): number => {
	let count = 0;
	let index = lowerText.indexOf(phrase);
	while (index !== -1) {
		count += 1;
		index = lowerText.indexOf(phrase, index + phrase.length);
	}
	return count;
};

/** Count em dashes per 1,000 characters — a density crutch when high. */
export const emDashDensity = (text: string): number =>
	text.length === 0 ? 0 : ((text.match(/—/g) ?? []).length / text.length) * 1000;

/** Run every deterministic detector over a block of copy. */
export const detectSlop = (text: string, options: SlopOptions = {}): SlopReport => {
	const findings: SlopFinding[] = [];
	const lower = text.toLowerCase();

	for (const phrase of [...CORE_BANNED_PHRASES, ...(options.extraPhrases ?? [])]) {
		const count = countPhrase(lower, phrase);
		if (count > 0) findings.push({ kind: "banned_phrase", detail: phrase, count });
	}

	const single: readonly { kind: SlopPatternKind; pattern: RegExp }[] = [
		{ kind: "not_just_construction", pattern: NOT_JUST_PATTERN },
		{ kind: "in_todays_world", pattern: IN_TODAYS_PATTERN },
		{ kind: "whether_youre", pattern: WHETHER_YOURE_PATTERN },
		{ kind: "hedge_stack", pattern: HEDGE_STACK_PATTERN },
		{ kind: "hollow_confidence", pattern: HOLLOW_CONFIDENCE_PATTERN },
	];
	for (const { kind, pattern } of single) {
		const hit = countMatches(text, pattern);
		if (hit.count > 0) findings.push({ kind, detail: hit.sample ?? "", count: hit.count });
	}

	const grouped: readonly { kind: SlopPatternKind; patterns: readonly RegExp[] }[] = [
		{ kind: "explainer_voice", patterns: EXPLAINER_VOICE_PATTERNS },
		{ kind: "forward_promise", patterns: FORWARD_PROMISE_PATTERNS },
	];
	for (const { kind, patterns } of grouped) {
		for (const pattern of patterns) {
			const hit = countMatches(text, pattern);
			if (hit.count > 0) findings.push({ kind, detail: hit.sample ?? "", count: hit.count });
		}
	}

	let customHardTell = false;
	for (const { label, pattern, hard } of options.extraPatterns ?? []) {
		const hit = countMatches(text, pattern);
		if (hit.count > 0) {
			findings.push({ kind: "custom", detail: `${label}: ${hit.sample ?? ""}`, count: hit.count });
			if (hard) customHardTell = true;
		}
	}

	const density = emDashDensity(text);
	if (density > EM_DASH_PER_1K_LIMIT) {
		findings.push({
			kind: "em_dash_density",
			detail: `${density.toFixed(1)} per 1k chars`,
			count: 1,
		});
	}

	const penalty = findings.reduce(
		(total, finding) => total + (PENALTY_BY_KIND[finding.kind] ?? DEFAULT_PENALTY) * finding.count,
		0,
	);

	return {
		findings,
		score: Math.max(0, Math.min(1, 1 - penalty)),
		hasHardTell: customHardTell || findings.some((f) => HARD_KINDS.has(f.kind)),
	};
};

/** Whether copy clears the bar: no hard tell, and score at or above `minScore`. */
export const isSlopClean = (report: SlopReport, minScore = DEFAULT_MIN_SCORE): boolean =>
	!report.hasHardTell && report.score >= minScore;

/** Render a report as one `kind · detail · count` line per finding, for CI output. */
export const formatReport = (report: SlopReport): string =>
	report.findings
		.map((f) => `${f.kind} · ${f.detail} · ${f.count}`)
		.sort()
		.join("\n");
