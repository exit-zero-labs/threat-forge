---
name: anti-slop-review
description: Self-review a code, test, docs, or copy change for AI-slop before marking it done. Use after implementing any change and before completing a task, PR, issue, or checkpoint. Catches over-engineering, redundant defensive code, comment slop, fake or stub implementations, tautological and weakened tests, hallucinated APIs, duplication, scope drift, and confident-but-wrong logic — without weakening functionality.
---

# Anti-slop self-review

Review your own diff against `.e0l/first-principles/anti-slop/` before marking anything done. That catalogue is the source of truth — apply it, do not restate it. This gate is why every task is evaluated, not only pull requests.

## Guardrails

1. **Functionality is sacred.** Never remove needed behaviour, drop edge-case handling, loosen validation, or weaken a real test to look cleaner. If removing "noise" changes what the code does, it was not noise — keep it and raise the concern.
2. **Signal over noise.** Necessary defensive code, real domain complexity, and thorough tests are not slop; see "What is not slop" in `code.md`. Do not over-correct.

## Procedure

1. Get the diff: `git diff`, `git diff --staged`, `git diff main...HEAD`.
2. For prose files run the cheap deterministic pass first: `bun Tooling/anti-slop/scan.ts <files>`.
3. Read the diff against the catalogue — `code.md` for code, tests and docs; `copy.md` for prose; `process.md` for the plan, PR body, commit message and any report you are about to write; `explanatory-register.md` for analytic writing.
   **Review your own report too.** Fabricated verification and silent scope reduction are the highest-cost tells here, and they live in what you are about to say, not in the diff.
4. Per finding, decide **fix now** (clear tell, behaviour-preserving) or **raise** (ambiguous, or the fix risks behaviour).
5. Re-run the repo's verify command. The same tests passing is the proof functionality is intact.
6. Caught a pattern not in the catalogue? Add it in this same change, with the instance and why it survived.

## Output

`path:line · category · why it is slop · the minimal behaviour-preserving fix`

Say plainly what you fixed and what you are raising. If nothing is found, say so briefly — **do not invent findings to look thorough. That is slop too.**
