<!-- @format -->

# The deterministic detector

The one anti-slop layer that is actually machine-enforced ([index.md](index.md#how-this-is-actually-enforced)). Everything else in this directory is instruction; this is a gate.

> Source: extracted from Project Postcard `packages/evals/src/slop.ts`. That copy is deliberately untouched — it is load-bearing for a content-quality eval suite, and changing its phrase list would change generated output. The two are reconciled as separate tracked work.

## Running it

```bash
bun Tooling/anti-slop/scan.ts <file>...
```

Exits non-zero if any scanned file fails, printing `kind · detail · count` per finding. It has no dependencies and needs no install step, so it runs in any repo's CI.

```bash
bun test Tooling/anti-slop/core.test.ts
```

## How scoring works

Two independent outcomes, and a file must clear both.

**Hard tells disqualify outright**, regardless of score: the "not just X, it's Y" construction, "in today's world" openers, explainer-voice connective filler, and forward promises. These are not a deduction on otherwise good copy — they are the copy admitting it has nothing to advance.

**Everything else deducts** from a score that starts at 1.0:

| Finding | Penalty |
| --- | --- |
| Banned phrase | 0.06 each |
| "Whether you're" framing | 0.08 each |
| Em-dash density above 4 per 1,000 characters | 0.10 |
| Any other tell | 0.18 each |

The bar is **no hard tell, and score at or above 0.85**.

## Extending it for a repo

Domain vocabulary stays in the repo that owns the domain. A travel magazine's "hidden gem" and a security tool's "enterprise-grade" are not company-level tells, and putting them in the shared engine would fire on repos where they are legitimate.

```ts
detectSlop(text, {
  extraPhrases: ["hidden gem", "nestled"],
  extraPatterns: [{ label: "process leak", pattern: /\bresearch brief\b/gi, hard: true }],
});
```

## Write patterns narrower than the tell they name

This is the rule that keeps the detector usable, and it is worth stating plainly: **a false positive is worse than a miss.**

A firing pattern feeds corrective text into every subsequent revision attempt, so a pattern that catches legitimate prose quietly degrades everything written after it. That is why `there's a catch` is caught but a bare `there's a problem` is not — "There's a problem with the drainage" is a real sentence — and why `it turns out` is caught only inside the `the answer, it turns out` framing.

When a pattern misfires, narrow it. Do not add an exception to the text that tripped it.

## What is exempt, and why

Some documents quote the tells they forbid — a catalogue of banned phrases necessarily contains banned phrases. Those paths are listed with a stated reason in `Tooling/anti-slop/scan.ts`.

Two properties of that list are deliberate:

- **It is an explicit path allowlist, not a per-line marker.** A marker comment gets reached for whenever the gate is inconvenient; adding a path to a committed list is a reviewable diff.
- **Every entry carries a reason.** An exemption without a stated reason is indistinguishable from a bug.

The list is short by design. If it grows, that is a signal the detector is scoped wrongly — not a signal to keep adding entries.
