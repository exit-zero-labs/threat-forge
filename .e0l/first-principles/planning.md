<!-- @format -->

# Planning

> Sources: `doctrine.md` §planning and §GitHub Organization (retired); Project Management Directive §2, §5, §6, §7 (retired, see [`docs/archive/`](../archive/2026-07-project-management-directive.md)); [ADR-0003](../decisions/0003-effort-field.md); Project Postcard `docs/plans/0000-template.md`.

Documentation holds strategy. **Scheduling and tracking happen only in GitHub Projects.** Every repo, including the workspace, has a Project that is the single source of truth for what is planned, in progress, or done.

## Who does what

Humans act as product managers: they supply goals and requirements through documents and issues. Agents act as engineers: they break the work down, triage it, and turn it into actionable plans — or **push back until the requirements are agreed**. An agent that executes a requirement it knows to be underspecified has chosen to produce rework.

Agents are accountable for the quality of what they produce and for iterating on feedback. `--auto-mode` bypasses the human step, not the standard ([operations.md](operations.md#--auto-mode)).

## The taxonomy

One normative table. Nothing exists here that does not change a routing or gating decision.

| Dimension | Kind | Values |
| --- | --- | --- |
| **Milestone** | Native repo milestone | `M0 • POC`, `M1 • Alpha`, `M2 • Beta`, `M3 • Release 1`, `M{x} • Release {n}` |
| **Type** | Native issue type | `Feature`, `Bug`, `Task` |
| **Effort** | Native org issue field | `High`, `Medium`, `Low` |
| **Priority** | Native org issue field | `High`, `Medium`, `Low` |
| **Status** | Project single-select | `Backlog`, `Ready`, `In progress`, `Done` |
| **Autonomy** | Label | `AUTO`, `HITL` |
| **Rejection** | Label | `Reject` (on a `Done` issue) |

Everything except `Status` and the autonomy label is native. `Effort` and `Priority` are **organization-level issue fields**, not project fields — see [ADR-0009](../decisions/0009-native-effort-issue-field.md), which corrects [ADR-0003](../decisions/0003-effort-field.md).

That distinction has a practical trap worth stating once: **an org issue field is invisible to `gh project item-list`.** The item JSON has no key for it. Tooling that reads effort or priority from the project API sees nothing and reports no error, so read and write them through the issue-field endpoints:

```bash
gh api /repos/{owner}/{repo}/issues/{n}/issue-field-values \
  -H "X-GitHub-Api-Version: 2026-03-10"
```

Labels are reserved for signals no field can express; a new label needs the same justification as a new field.

## The four states

Exactly four, on every board ([ADR-0010](../decisions/0010-four-state-status.md)). The transition that matters is `Backlog → Ready`, because that is the AI triage gate — and it is what makes the board safe for an agent to pick from unattended.

### `Backlog` — the default. Everything lands here.

Filed, and **nobody has looked at it properly**. Descriptions can be one line. Fields are not enforced. An issue here is an ask or a note, nothing more.

**No agent has read it.** That is the whole meaning of the state, and it is why nothing should ever be picked up from here directly — an issue in `Backlog` has not been shown to be worth doing, correctly scoped, or even still relevant.

Anyone may file into `Backlog` at any time, at any quality. Lowering the cost of capture is the point; triage is where the cost gets paid.

### `Ready` — an agent has triaged it

Promoting an issue to `Ready` asserts that an agent has done **all** of the following:

1. **Read it** against the current codebase and docs — not the title, the issue.
2. **Set every field**: `Type`, `Effort`, `Priority`, `Milestone`, and exactly one of `AUTO` / `HITL`.
3. **Rewritten the description** so it states the problem, the acceptance criteria, and — for `Low` effort — its full verification and validation criteria inline.
4. **Linked relationships**: parent and sub-issues, dependencies, and any issue it duplicates or supersedes.
5. **Justified that the issue should exist at all**, in a short comment of a few sentences: why this is worth doing, why now, and why the fields are what they are.

That comment is not ceremony. It is the audit trail for a decision an agent made autonomously, and it is what a human reads to decide whether to trust the rest of the triage.

**`Ready` means any human or agent can pick this up.** It is a promise, so an issue that cannot honestly carry it stays in `Backlog`.

Sub-issues an agent creates during triage or planning may be filed **directly into `Ready` or `In progress`** — the agent creating them is triaging them as it goes, so routing them through `Backlog` would be a fiction.

### `In progress` — someone has picked it up

**Move the issue here the moment you decide to work on it, before doing anything else.** Parallel agents work across the workspace simultaneously; the board is the only thing preventing two of them from starting the same issue. A claim you have not recorded is not a claim.

The immediate next step after claiming is the planning artifact, chosen by the issue's fields:

- **`Effort: High` or `Medium`** — a plan committed to `docs/plans/{issue-id}-{slug}.md` on a branch with a linked pull request.
- **`Effort: Low`** — the criteria inline in the issue description, written at triage.

An issue stays `In progress` through the **entire** pull request cycle: opening, review, revision, and merge. **There is no `In review` state.** For a solo studio there is nobody to hand work to, so a separate state would only ever describe the author's own queue.

### `Done` — merged and verified, or rejected

`Done` is stricter than "the pull request merged."

An issue moves to `Done` only after:

1. The pull request is **merged to `main`**.
2. The **local workspace is on `main`** with the merge pulled down.
3. The merged result has been **verified functional** — a real walkthrough of the behaviour the issue claimed to deliver, not a green check.

**Merging is verification. The post-merge walkthrough is validation.** Flipping the state before that walkthrough is the premature-done tell in [anti-slop/process.md](anti-slop/process.md#verification-and-completion-tells), and it is how a broken `main` survives a green pipeline.

A rejected issue also lands in `Done`, carrying the **`Reject`** label and a comment saying why. There is no `Rejected` state: a terminal state that is not `Done` accumulates items nobody sweeps, and every board query then has to remember to exclude one more value.

### What the states are not

- Not a queue. `Ready` is unordered; `Priority` and `Milestone` decide what gets picked.
- Not a hand-off protocol. There is no reviewer to hand to.
- Not a progress percentage. An issue is `In progress` on its first commit and on its last.

## Triage

Triage is the highest-leverage thing an agent does on the board, and the most frequently done badly. It is **a considered act of judgement, not a form-filling pass.** An agent that sets five fields without reading the code has produced a `Ready` issue that is worse than a `Backlog` one, because now something claims it was checked.

| Skill | Scope |
| --- | --- |
| `/issue-triage` | One issue: read it, shape it, justify it, promote it |
| `/issues-refresh` | The whole board: re-derive every non-`Done` issue, correct drift, split what has outgrown itself |

### Re-triage is expected, not exceptional

**Any agent may re-triage any issue whenever it judges the shaping to be stale.** Scope changes, dependencies merge, milestones ship, and an issue triaged against a codebase from two months ago is describing a repository that no longer exists.

Triage is therefore **re-derived, never inherited**. An agent revisiting an issue decides its fields from scratch as if seeing it for the first time, rather than rubber-stamping what is already there. When it changes something, it says so in a comment with the reason — the trail of *why the shaping changed* is often more useful than the shaping.

Signals that an issue needs re-triage:

- Its milestone has shipped, or its dependencies have merged.
- The described surface has been refactored, renamed, or deleted.
- It has been split, superseded, or partly done by another issue.
- Its `Effort` no longer matches what the work now involves.
- It is `HITL` but the blocking human step has since been resolved.
- It has sat in `Ready` long enough that nobody remembers why.

### The bar for promoting to `Ready`

An agent promotes an issue only when it can answer all of these. If it cannot, the issue stays in `Backlog` and the agent says what is missing.

- **Should this exist?** An issue that duplicates another, or that the product no longer wants, is closed as `Done` + `Reject` — not promoted.
- **Is it one thing?** A compound issue is split into sub-issues, which land directly in `Ready`.
- **Can someone else check it?** Acceptance criteria that only their author can evaluate are not criteria.
- **Is it `Low` by construction?** `Low` cannot need research. If it might, it is `Medium`.
- **Does `HITL` name the human step?** The label without a named step is a parking space.

**Never invent a criterion to make an issue look shaped.** An honest "this needs a product decision before it can be scoped" is a successful triage; a fabricated acceptance criterion is a trap set for whoever picks it up.

### Milestones

- **`M0 • POC`** — prove the concept end to end, including the product, business, and engineering questions, at very low spend and in a very short time. Exit: a working prototype that demonstrates feasibility.
- **`M1 • Alpha`** — the first real version. Functionality, usability, and design direction validated by friends-and-family testers. Not end-to-end polished. Exit: a working product plus tester feedback that informs the next phase.
- **`M2 • Beta`** — launch ready. Frontend, backend, telemetry, analytics, design, documentation, and marketing material complete. Beta is an early *public* release and is treated as public. Exit is by agreed criteria, not by date. Spend may scale moderately.
- **`M3 • Release 1`** — bugs found in Beta plus explicitly requested features. Business, operational, health, and performance monitoring all live. The product runs in cruise mode.
- **`M{x} • Release {n}`** — every subsequent release follows the M3 pattern. Breaking or critical bugs are the exception that skips the queue.

Repos that are not products — the workspace itself — use an operations ladder instead: `Doctrine v1`, `Doctrine v2`, and so on. The product ladder is meaningless for them, and forcing it produces milestones nobody can close.

### Priority — what actually qualifies

Priority answers **"how soon"**, weighed independently of `Effort` and *within* the current milestone. It never means "how big" and it never overrides the milestone: a `High` item in `M3` does not jump ahead of `Medium` work in `M2`.

Triage assigns it. Unset reads as `Medium`.

**`High` — it blocks, bleeds, or breaks trust.** Qualify it against these; **any one is sufficient**:

- It blocks other issues, or the current milestone cannot close without it.
- It is a correctness, security, privacy, payment, or data-integrity defect — in production or on the path to it.
- It is user-visible breakage: something advertised does not work, or a paying user cannot do what they paid for.
- It is actively costing money or eroding trust with every day it stays open.
- It is a dependency for work already scheduled and staffed.

**`Medium` — normal roadmap work.** The default, and it should be the largest bucket by a wide margin. It moves the product forward, has a real reason to exist, and nothing breaks while it waits. If you cannot argue a specific `High` criterion, it is `Medium`.

**`Low` — genuinely deferrable.** Polish, nice-to-haves, speculative work, tidy-ups with no downstream dependency. The honest test: **would you be comfortable if this were never done?** If yes, `Low`. If that makes you uneasy, it was `Medium` all along.

The field also exposes an `Urgent` option inherited from GitHub's defaults. **It is never assigned.** `High` is the ceiling, which keeps the scale usable — a fourth level only ever becomes the new `High`.

#### The tests that keep it honest

- **The distribution test.** If more than roughly a fifth of open issues are `High`, the field has stopped routing anything. Priority is a ranking, and a ranking where most items are top is a list.
- **The cost-of-delay test.** Ask what specifically goes wrong if this waits a month. A concrete answer argues `High`. "We'd be further behind" argues `Medium`. No answer argues `Low`.
- **`High` needs a reason in the issue.** One line naming which criterion it met. Priority set without a stated reason is indistinguishable from priority set by whoever filed it most recently.
- **Priority and Effort are orthogonal.** A `High`/`Low` issue is the best work available — urgent and cheap. A `High`/`High` issue is the one to decompose, because a large urgent thing is a large thing that will not land urgently.
- **Re-derive rather than inherit.** The `issues-clarify` sweep re-decides priority from scratch. Priority set six months ago against a milestone that has since shipped is noise wearing a field's name.

### Types

`Feature` is the default for anything that is not a defect. `Bug` is a defect, filed with reproduction steps. `Task` is a sub-issue that breaks down a `Feature`, a `Bug`, or another `Task`.

**A `Task` must have a parent.** GitHub cannot enforce this, so it is a triage rule plus a monthly audit sweep that lists parentless tasks.

### Effort and what it obliges

`Effort` is the reasoning class the work needs, and routing follows from it ([operations.md](operations.md#model-routing-by-capability-class)).

| Effort | Plan document | Breakdown |
| --- | --- | --- |
| High | Required, committed and linked | Broken heavily into `Task` sub-issues |
| Medium | Required, committed and linked | Broken down where it helps; may ship as one issue |
| Low | Not required | None. Verification and validation live in the issue body |

### Autonomy

`AUTO` means an agent can take the issue to a verification-complete pull request unattended. `HITL` means a human is required at some step.

**`HITL` is used as rarely as possible.** An issue that needs one human step is usually two issues: the human step, and the autonomous remainder. Every `HITL` issue states in its body *why* it needs a human and *exactly* what that person does.

## The plan artifact

High and Medium issues produce a plan before any code is written.

- **Filename:** `docs/plans/{issue-id}-{short-description}.md`, committed into the pull request. It does not live in terminal scrollback. It is the audit trail for why the code looks the way it does — the thing a solo developer otherwise loses in six months.
- **Produced by a heavy model** in a read-only planning pass.

It contains:

1. **Objective** — what done looks like, in a sentence or two.
2. **Task breakdown** — an ordered checklist. For a High issue each step should be Low-equivalent, so it can be handed to a cheap or local executor.
3. **Verification criteria** — deterministic and checkable per task. Written so they can be checked by something *other than* the model that wrote them.
4. **Validation criteria** — what the diff must actually accomplish, and the plausible-but-wrong outcomes to watch for.
5. **Re-plan log** — appended to when the plan changes, never overwritten. The append-only rule is what makes it an audit trail rather than a description of the present.

Because the criteria are written before execution, a cheap executor is checked against a spec it did not author. That is what makes routing down safe.

Plans and issues fail in known ways — unfalsifiable acceptance criteria, validation that is verification wearing a coat, criteria only their author can check, and overwriting the re-plan log. The catalogue is in [anti-slop/process.md](anti-slop/process.md), and it applies to every artifact on this page.

## Low issues carry their own criteria

A Low issue is executed by a model that should never have to invent its own success criteria. They are written at creation time, in the body:

```markdown
## Objective
<one sentence>

## Files in scope
<1–3 files>

## Task
<the exact, unambiguous change>

## Verification (deterministic — did it do the thing right)
- [ ] <exact checkable condition>

## Validation (did it do the right thing)
- [ ] <what the diff must accomplish; the wrong-but-plausible outcome to avoid>

## Constraints
- No web search or research required. If it turns out to need either, retriage as Medium.
```

## Verification and validation are the exit condition

There is no review status, because for a team of one a review column exists only to hand work between people. The review it represented is not deleted — it becomes an explicit condition on reaching `Done`.

- **Verification — did it do the thing right.** Tests pass, CI is green, the deterministic criteria are met. Automatable.
- **Validation — did it do the right thing.** The diff matches intent; no plausible-but-wrong outcome slipped past green tests. This is a human read of the diff. It **cannot** be automated away, however good the plan or however green the CI.

**An issue reaches `Done` only when (a) its verification criteria pass and (b) the diff has been read and validated.** Both, explicitly. Left implicit, `In progress` degrades into a fuzzy state where validation quietly gets dropped under time pressure — which is the one place minimalism costs correctness, so it is written down rather than assumed.
