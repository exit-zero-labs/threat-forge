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
| **Milestone** | Native | `M0 • POC`, `M1 • Alpha`, `M2 • Beta`, `M3 • Release 1`, `M{x} • Release {n}` |
| **Type** | Native issue type | `Feature`, `Bug`, `Task` |
| **Effort** | Custom single-select | `High`, `Medium`, `Low` |
| **Priority** | Custom single-select | `P0`, `P1`, `P2` |
| **Status** | Custom single-select | `Triage`, `Backlog`, `Ready`, `In progress`, `In review`, `Done` |
| **Autonomy** | Label | `AUTO`, `HITL` |

`Effort` is a custom field. There is no native effort property in GitHub Projects — see [ADR-0003](../decisions/0003-effort-field.md). Labels are reserved for signals no field can express; a new label needs the same justification as a new field.

Work that is not accepted is **closed as not planned**. There is no `Rejected` status, because a terminal state that is not `Done` accumulates and rots the board.

### Milestones

- **`M0 • POC`** — prove the concept end to end, including the product, business, and engineering questions, at very low spend and in a very short time. Exit: a working prototype that demonstrates feasibility.
- **`M1 • Alpha`** — the first real version. Functionality, usability, and design direction validated by friends-and-family testers. Not end-to-end polished. Exit: a working product plus tester feedback that informs the next phase.
- **`M2 • Beta`** — launch ready. Frontend, backend, telemetry, analytics, design, documentation, and marketing material complete. Beta is an early *public* release and is treated as public. Exit is by agreed criteria, not by date. Spend may scale moderately.
- **`M3 • Release 1`** — bugs found in Beta plus explicitly requested features. Business, operational, health, and performance monitoring all live. The product runs in cruise mode.
- **`M{x} • Release {n}`** — every subsequent release follows the M3 pattern. Breaking or critical bugs are the exception that skips the queue.

Repos that are not products — the workspace itself — use an operations ladder instead: `Doctrine v1`, `Doctrine v2`, and so on. The product ladder is meaningless for them, and forcing it produces milestones nobody can close.

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
