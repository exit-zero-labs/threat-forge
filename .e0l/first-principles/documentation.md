<!-- @format -->

# Documentation

> Sources: `doctrine.md` §documentation (retired); Project Postcard `packages/docs-freshness/` and `CONTRIBUTING.md` §Documentation freshness; `.github/instructions/docs.instructions.md`.

## Where it lives

`docs/` at the repo root is canonical for everything about that repo.

- **Private repos** keep everything in `docs/`.
- **Public repos** keep internal and high-level material in `docs/`, and user-facing material in the GitHub Wiki.

`docs/` holds strategy, decisions, retrospectives, and the plans produced when work is scoped. It does **not** hold scheduling — that lives on the board ([planning.md](planning.md)).

Inherited company-level material mounts at `.e0l/` and never overlays repo-owned files ([ADR-0008](../decisions/0008-e0l-mount.md)). A repo document that has a company-level counterpart links to it rather than restating it.

## House voice

Direct, crafted, grounded, human. No filler, no preamble, no "in this document we will discuss".

- Every document opens with a one-line statement of purpose, before any heading.
- Sentence-case headings. "Getting started", not "Getting Started".
- Never hard-wrap prose. One line per paragraph, list item, or blockquote — it keeps diffs readable.
- Tables for structured data, bullets for unstructured. Neither for a single fact.
- ISO dates, `YYYY-MM-DD`. Never "last Thursday".
- Link rather than copy. A duplicated paragraph is a paragraph that will drift.
- Fenced code with a language hint. Never a screenshot of code.
- Markdown, not HTML, unless there is no alternative.

Docs get the same anti-slop scrutiny as code. The docs tells — restating the code in prose, fabricated rationale or precision, drift, and marketing tone in engineering documentation — are catalogued in [anti-slop/code.md](anti-slop/code.md). The one worth repeating here: **a document that has drifted is worse than no document**, because it is trusted.

## Freshness is enforced, not requested

Documentation is the canonical reference for a repo and must track its actual state. An instruction to "keep docs updated" does not survive contact with a deadline, so it is a gate.

Four rules, run in CI:

- **R1 — Surface registration.** Every app and package is registered in each contract file that lists surfaces. A workspace with no documentation impact is an explicit allowlist entry with a stated reason, not a silent omission.
- **R2 — Reference-registry integrity.** Every instructions file, ADR, guide, and narrative document appears in its index. A document nothing links to is a document nobody reads.
- **R3 — Link integrity.** Every relative markdown link resolves. Append-only trees — committed plans, evaluation records, generated artifacts — are not rescanned, so a later code move never forces a retroactive edit to a committed plan.
- **R4 — Diff-aware coupling.** A small, typed set of couplings between authority surfaces and the documents that describe them. Changing a surface without touching its document fails.

The escape hatch is a `Docs-Impact: none (<reason>)` commit trailer. It is auditable, it requires a reason, and an empty or prose-only trailer does not exempt anything.

Two properties of the gate are deliberate and worth stating, because they are what stop it decaying:

- **The coupling set is sparse on purpose.** A broad "any change implies a documentation edit" rule would train token edits and blanket exemptions, which is worse than no rule.
- **The gate never reads a checkbox.** Template checkboxes for documentation freshness are validation aids for a human. They cannot satisfy the machine gate, so ticking one proves nothing.

The runnable implementation currently lives in Project Postcard. Extracting it to the workspace so every repo can run the same gate is tracked work, not something this document should claim is already true.
