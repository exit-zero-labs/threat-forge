<!-- @format -->

# Process and agent-behaviour tells

The catalogue for the artifacts that carry the audit trail — issues, plans, commits, pull requests, decision records, reports — and for how agents fail while producing them.

Read [index.md](index.md) first; the two guardrails govern every entry here.

> This is the layer with the least tooling and the highest cost of failure. A slop function gets caught by a test. A slop plan gets *believed*, and every downstream decision inherits it.

## The governing failure

Almost everything below is one failure wearing different clothes: **the artifact describes work that sounds like it happened rather than work that did.**

A model completing a plan template, a PR body, or a status report is doing text completion over a shape. The shape is satisfied by plausible content. Nothing in the format resists a confident sentence about a check that never ran — which is why these tells matter more than the prose ones, and why so few of them are machine-detectable.

**The universal test: for every claim in a process artifact, could someone else check it — and would they find what you said?**

## Verification and completion tells

The most damaging family. Each of these consumes human review attention, which is the scarcest thing in the system.

- **Fabricated verification.** "Tests pass", "CI is green", "verified working" when the command was never run, or was run and its output not read. The single most expensive tell available: it converts a review from *checking work* into *discovering a lie*, and it poisons every other claim in the same artifact.
- **Inferred-as-observed.** Reporting what the code *should* do as what it *does*. "The endpoint returns 201" when you read the handler and never called it. If it was reasoned, say reasoned.
- **Partial-run-as-full-run.** Running one test file and reporting the suite. Checking three files and reporting the codebase. State the scope you actually covered.
- **Green-means-correct.** Treating a passing CI run as validation. Green is verification; it says the checks you wrote passed, not that the change does the right thing.
- **Premature done.** Marking complete with a known failure, a skipped step, or an unaddressed review comment, on the theory it is small. If part of the scope was dropped, the report says which part and why — that is the user's call to make, not the agent's.
- **Silent scope reduction.** Delivering the tractable 70% and describing it as the thing. Narrowing scope is legitimate; narrowing it without saying so is not.
- **Silent scope expansion.** A refactor riding along inside a bug fix. Every unrelated line is review burden charged to the wrong ticket, and it is how an unreviewed change enters a reviewed diff.
- **The unverified negative.** "There are no other callers", "nothing else references this", "this is not used anywhere" — asserted from a partial search. Negative claims need an exhaustive check or an explicit hedge.

## Issue tells

- **The unfalsifiable acceptance criterion.** "Works correctly", "performs well", "is user-friendly". Nothing can be checked against it, so the issue can never be objectively finished.
- **The solution masquerading as a problem.** An issue whose title is an implementation ("Add a Redis cache") with no statement of the problem. It forecloses the decision before anyone reviews it.
- **The compound issue.** Four unrelated things behind one title, so it can never cleanly close and its Effort is meaningless.
- **Ceremonial fields.** `Effort` and `Priority` set to pass triage rather than to route. A board where most things are High routes nothing — see the distribution test in [planning.md](../planning.md#the-tests-that-keep-it-honest).
- **`HITL` without a named human step.** The label says a human is needed; the body must say *why* and *exactly what they do*. Without that it is a parking space.
- **Stale-by-construction.** An issue whose body describes a codebase that has since changed, still in `Ready`. Re-derive rather than inherit.

## State tells

The four states each have a characteristic lie ([planning.md](../planning.md#the-four-states)).

- **Unearned `Ready`.** Fields set without reading the code, description untouched, no justification comment. `Ready` asserts an agent shaped the issue; an issue that only *looks* shaped is worse than one in `Backlog`, because now something claims it was checked and the next agent picks it up on that basis.
- **The justification that restates the fields.** "Set to Medium effort and High priority." That records nothing. The comment exists to say *why* — why it is worth doing, why now, why those values — and a comment that a reader could have derived from the fields themselves has not been written.
- **Claiming late.** Starting work and moving to `In progress` afterwards, or at the first commit. With parallel agents the gap between deciding and recording is exactly when two agents collide. Move first.
- **Ghost `In progress`.** Claimed, then abandoned, with no branch or pull request. It holds the issue against every other agent while nothing happens.
- **`Done` on merge.** Flipping the state when the pull request merges, before pulling `main` and confirming the thing actually works. Merging is verification; the post-merge walkthrough is validation, and skipping it is how a broken `main` survives a green pipeline.
- **Rejection by silence.** Closing an issue without the `Reject` label or a reason. The count stays honest but the *why* is gone, and the same issue gets refiled in three months.
- **Triage as a formality.** Sweeping the board setting fields to satisfy a checker rather than to route work. A board where every field is populated and none of them route anything is worse than an empty one — it looks maintained.

## Plan tells

- **The plan that is a restatement.** Task breakdown that re-describes the issue at greater length without deciding anything. A plan's value is in its *decisions* and its *criteria*.
- **Criteria only the author can check.** "Verify the implementation is correct." Written so something other than the model that wrote it can evaluate it — that property is what makes routing execution to a cheaper model safe.
- **Validation that is verification wearing a coat.** "Validation: tests pass." Validation is the intent check — what the diff must accomplish, and the plausible-but-wrong outcome to watch for. If you cannot name the wrong-but-plausible result, you have not thought about it.
- **The absent rejected alternative.** A plan or ADR with one option is an announcement. The rejected list is the part that is worth reading later.
- **Overwriting the re-plan log.** Editing the plan to match what was built destroys the record that the approach ever changed — usually the single most informative thing in the document. **Append.**
- **Live-plan drift.** A review-driven fix hardens the code while the plan still argues the old behaviour and its criterion still demands proof of it. Every gate stays green because no tool reads the plan, and the contradiction lands in exactly the document a validator reads to decide whether the diff did the right thing.
- **Estimation theatre.** Invented hours or story points presented with unearned precision.

## Commit and pull-request tells

- **The what-not-why commit.** "Update handler", "fix bug", "changes". The diff already says what changed; the message exists to say why.
- **The essay commit.** A message longer than the diff deserves, restating each hunk. Compression is the job.
- **Fabricated PR testing sections.** A "Testing" section listing commands that were never run. See [Fabricated verification](#verification-and-completion-tells) — same tell, higher blast radius, because it is what a reviewer trusts most.
- **Checkbox theatre.** Ticking a template box because it is in the template. **No deterministic gate reads a checkbox**, so a ticked box proves exactly nothing — which is why our templates say so on the template.
- **The unexplained mixed diff.** Formatting, renames, and behaviour change in one commit, so the behaviour change is unreviewable. Separate them.
- **`--no-verify`.** Not a tell, a violation. It is denied at the permission layer.

## Decision-record tells

- **The retrofit.** An ADR written after the fact to justify a choice made on instinct, presenting a tidy causal chain that did not occur. Recording "we chose this because it was already working" is honest; inventing a rationale is not.
- **Editing a shipped decision.** Supersede instead. Rewriting the reasoning destroys the record of what was believed at the time, which is the only reason the document exists.
- **Consequences that are all upside.** Every real decision costs something. An ADR with no cost section was not a decision.

## Report and status tells

Agents write briefings for humans, and those inherit every prose tell in [copy.md](copy.md) plus these:

- **Structural symmetry.** Every item arriving in the identical shape is the strongest signature of generated output. Real writing is asymmetric — vary deliberately.
- **Hollow confidence.** "This should be straightforward." A concrete, checkable blocker beats a reassurance every time.
- **Burying the lead.** The thing the reader must act on, placed ninth. Lead with what changes their next decision.
- **Progress as activity.** Reporting what was *done* rather than what is now *true*. "Ran the migration" is activity; "the schema is now at v14 and the backfill is 60% complete" is state.
- **Decorative visuals.** A table, chart, or diagram that helps nobody decide anything. One at-a-glance table beats four. Emoji are a vocabulary, not seasoning.
- **The unflagged assumption.** Proceeding on a guess without marking it. If a different reading would change the work, say which reading you took.

## Configuration and infrastructure tells

Config is code with a worse blast radius and weaker tests.

- **Copy-paste permissions.** A workflow granted `write-all` because an example had it. Least privilege by default.
- **Unpinned actions and images.** Pinned by tag rather than digest — a moving target in a file whose entire job is reproducibility.
- **The silent skip.** A CI step that exits 0 when its precondition is missing, so a check that never runs is indistinguishable from a check that passed. **Fail loudly or state the skip in the output.**
- **The missing concurrency group.** A workflow that stacks a full run per push instead of superseding, turning a shared runner into a queue for everyone else.
- **The job on the wrong runner.** A static check placed on a scarce self-hosted runner it does not need, starving the work that does.
- **Config that duplicates a default.** Restating the framework default adds a thing to maintain and hides which settings are deliberate.
- **The commented-out block "in case we need it".** Delete it. Git remembers.

## What is not a process tell

The false-positive guard, and it matters here because over-correcting produces artifacts nobody reads.

- **A short commit message on a genuinely small change.** Not every diff needs an essay.
- **A plan that changed direction**, with the change appended. That is the system working.
- **"I could not verify X"** stated plainly. That is the correct output, not a failure to report.
- **A long report when the subject is genuinely large.** Length is not the tell; padding is.
- **Repeating a critical constraint** in more than one place. Duplication risks drift; safety-critical redundancy is a deliberate trade.

## Enforcement

Almost none of this is machine-detectable, and pretending otherwise would be its own tell. What actually holds:

| Layer | Catches | Real? |
| --- | --- | --- |
| The template asking for the rejected alternative | Absent-alternative, all-upside consequences | Structural — it makes the omission visible |
| `bun Tooling/anti-slop/scan.ts` over prose | Register and phrase tells in reports and ADRs | **Deterministic** |
| The docs-freshness gate | Drift between code and the docs describing it | **Deterministic** |
| A reviewer re-running one claimed command | Fabricated verification | Human, and the highest-yield check available |
| Human validation of the diff | Everything above | Human, and never automated away |

**If you read one line from this file:** the cheapest defence against every tell here is a reviewer picking one claim at random and checking it. Agents that expect that hold to it; agents that do not, do not.
