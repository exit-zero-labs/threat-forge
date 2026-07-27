# Issue 270 — Route planning on `Effort`, not the deleted `Size` field

## Objective

Every governance file that decides *plan or don't plan* and *decompose or don't* routes on
`Effort`, the field the board actually has, using the contract `AGENTS.md` defines. No file
routes on `XS`, `S`, `M`, `L`, or `XL`.

## Issue contract

- **Issue:** `#270`
- **Parent initiative:** `N/A`
- **Type:** `Bug`
- **Effort:** `Medium`
- **Priority:** `High`
- **Autonomy:** `AUTO`
- **Dependencies:** `#268` (the sibling residue, merged as `7b1fd64`)
- **Non-goals:** changing what `Effort` means, changing any issue's `Effort` value, editing
  `.e0l/`, rewriting historical narration about the migration itself, or rewriting committed
  plans for closed issues

## Behavior before this change

`AGENTS.md:106` records the migration: `Effort` replaced `Size` in doctrine v1, and the
`size/XS`–`size/XL` labels were deleted across 92 issues in the #243 sweep. The field and the
labels are gone. The vocabulary is not.

Sixteen files still route on it. `implement-issue` step 3 was titled *Enforce the size
contract* and branched on `XS/S`, `M/L`, `XL`. `issue-planner` rejected `XL` work.
`feature-implementer` refused to execute `XL`. Two runbooks told a triager to set a `Size`
field that no longer exists on the board. The pull request template asked contributors to
write `N/A — XS/S`.

The observable cost is not tidiness. An agent reading `implement-issue` must invent a mapping
before it can act, and the mapping it will invent is the duration reading — the exact
misconception `Effort` was introduced to replace. That produces skipped plans on work that
needed one, and `High` security work executed as though it were small.

## What a committed plan is, and why most of them keep the old words

A sweep turns up `Size` vocabulary in roughly twenty committed plans under `docs/plans/`. Almost
all of it stays.

A plan for a **closed** issue is a record of what was decided and what the board said at the
time. `- **Size:** `M`` in `docs/plans/111-ci-reliability.md` is not an instruction to anyone;
it is what that field held on that date. Rewriting it would make the record assert something
that was never true, and the repository forbids rewriting plan history for exactly that reason.
Seventeen of the nineteen plans carrying the vocabulary are for closed issues.

A plan for an **open** issue is a live instruction, and its granularity sentence tells an
implementer how finely to cut the work. `#58` is the only open issue whose plan states that in
`Size` terms, so it is translated and the translation is recorded in that plan's replan log
rather than applied silently.

`#64` is open and is described as `XL` inside two plans — but both of those plans belong to
closed issues (`#62`, `#203`) and are describing `#64` as it stood then. Its own `Effort` lives
on the board, which is where that fact belongs.

## Implementation record

This plan was written while the change was underway rather than before it, so what follows is a
record of the three pieces of work and the judgment behind each, not a forecast of them. The
replan log says when and why.

### 1. Re-derive the three-tier contract from `AGENTS.md`

- **Behavior:** the routing files state `Low` / `Medium` / `High` as `AGENTS.md:92-110`
  defines them, including that `High` implies decomposition.
- **Files:** `.claude/skills/{implement-issue,issue-triage,issues-clarify,issues-report,fix-issue}/SKILL.md`,
  `.claude/agents/{issue-planner,feature-implementer}.md`, `AGENTS.md`, `CONTRIBUTING.md`,
  `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/roadmap-initiative.yml`,
  `docs/runbooks/{adding-a-feature,responding-to-issues}.md`,
  `docs/knowledge/documentation-architecture.md`, `docs/plans/{README,roadmap,0000-template}.md`,
  and `docs/plans/58-panel-information-architecture.md` — the one open issue whose plan states
  step granularity in `Size` terms, translated with a replan-log row in that plan
- **Implementation:** translate each decision point by re-deriving it, not by substitution.
  See *The mapping is not one-to-one* below.
- **Targeted verification:** a repository sweep for `XS`, `S`, `M`, `L`, `XL`, `M/L` and bare
  `Size`-field vocabulary returns only historical narration.
- **Intent validation:** an agent can execute each routing decision without inventing a mapping.

### 2. Carry the floor rule to the files that decide

- **Behavior:** the "floor, not a ceiling" override reaches the surfaces where `Effort` is
  assigned and where it is acted on.
- **Files:** `.claude/skills/{issue-triage,issues-clarify,implement-issue}/SKILL.md`,
  `docs/runbooks/{adding-a-feature,responding-to-issues}.md`
- **Implementation:** state that cryptography, the IPC boundary, the `.thf` schema, and trust
  boundaries are `High` however small the diff looks.
- **Targeted verification:** each of the five files names the rule.
- **Intent validation:** a triager assigning `Effort` and an implementer acting on it both see
  the override without having to remember `AGENTS.md`.

### 3. Give `High` sub-issue creation an owner

- **Behavior:** exactly one step files the sub-issues a `High` plan names.
- **Files:** `.claude/skills/implement-issue/SKILL.md`, `.claude/agents/issue-planner.md`
- **Implementation:** the planner names the sub-issues in the plan and does not file them — it
  is forbidden from mutating GitHub. `implement-issue` files them and stops.
- **Targeted verification:** no step requires sub-issues that no step creates.
- **Intent validation:** a `High` issue does not stall after planning with nobody owning the
  next move.

## The mapping is not one-to-one

This is the judgment the change turns on, and it is why substitution would have been wrong.

- `XS/S` → `Low`. Close enough; the issue body stays the executable specification.
- `M/L` → `Medium` mostly holds, but the meaning shifted. `Size` said how big; `Effort` says
  what reasoning the work needs. A large mechanical change is `Low`.
- `XL` → **nothing.** Decomposition is not a fourth tier, it is part of what `High` already
  means. So every "reject `XL`" and "never execute `XL` directly" became a statement about
  `High` needing both a plan and sub-issues, rather than a renamed rejection.

## Cross-cutting requirements

- **Security and privacy:** the floor rule is the security-relevant part. Understating `Effort`
  on cryptography, IPC, `.thf`, or a trust boundary routes that work to a weaker reasoning tier
  and skips the plan gate.
- **No runtime surface:** the change is documentation only, so `.thf` compatibility, browser and
  desktop parity, AI safety, and accessibility are untouched.
- **Observability and evidence:** the sweep pattern is recorded here because `git grep -E` does
  not support `\b`, which produced a false clean result during this work. Use POSIX character
  classes: `(^|[^[:alnum:]_])(XS|XL|M/L|XS/S)([^[:alnum:]_]|$)`.

## Verification gate

```bash
npm run ci:local
```

## Owner validation

Deterministic checks cannot decide any of this. What to read:

- Is `XL` → `High`-with-decomposition the right call, or should an undecomposed parent still be
  a distinct thing the board can express?
- Does `implement-issue` step 6 put sub-issue creation in the right place, or does filing
  issues belong to triage rather than to the implementation orchestrator?
- Is repeating the floor rule in five files the right trade against it drifting out of sync?

## Specialist review

- [x] PR reviewer
- [x] Slop auditor
- [ ] Security auditor — not applicable; no code, boundary, or dependency surface changes
- [ ] Threat-model expert — not applicable; no schema, STRIDE, or threat-quality surface

## Replan log

Append changes; do not rewrite prior decisions.

| Date | Change | Evidence and reason |
|------|--------|---------------------|
| 2026-07-27 | Initial plan, written after implementation began | `#270` is `Effort: Medium`, so a committed plan was required before code and there was none. The change read as vocabulary substitution until the `XL`-has-no-successor problem surfaced mid-edit, by which point it was underway; the PR reviewer raised the omission as a must-fix. The plan is committed because the mapping judgment above should be reviewable in one place. The sequencing guarantee it was meant to provide is lost for this issue and cannot be reconstructed. |
| 2026-07-27 | Scope grew from the eight files the issue named to sixteen routing surfaces | The issue's table names eight files; its title says nine and does not enumerate the ninth. My own sweep found thirteen. Both preflight lanes then found three more my exclusions had hidden — I had excluded `docs/plans/` wholesale as historical and searched only `*.md`, which concealed `.github/ISSUE_TEMPLATE/roadmap-initiative.yml`, `docs/plans/0000-template.md` and `docs/plans/README.md` — and the reviewer added `docs/plans/roadmap.md` and the open `#58` plan. Sixteen files route a decision. Two more, `docs/plans/roadmap.md` and `docs/knowledge/documentation-architecture.md`, only name the field in prose and were corrected alongside. With this plan the diff touches nineteen. Recorded because the exclusion, not the pattern, was the defect both times. |
| 2026-07-27 | `implement-issue`'s `High` path made resumable and idempotent | The second review round found the loop I had just written could not complete: planning left the parent `In progress` while step 2 admitted only `Ready`, step 3 demanded sub-issues that step 6 had not yet created, and step 6 would refile ones already linked. Step 2 now admits a continuation, step 3 states prerequisites rather than checking them, step 6 skips already-linked sub-issues, and step 7 says outright that a `High` parent never reaches it. |
| 2026-07-27 | Step 6 restored the requirement that children be executable | The third review round found that adding the already-linked skip had silently dropped "each shaped and linked" from the previous wording, so an existing placeholder child would be skipped rather than shaped and a later run would reject it at step 2. Step 6 now reconciles: shape what exists, file what is missing, and every child must be selectable on its own. |
