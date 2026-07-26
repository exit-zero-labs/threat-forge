<!-- @format -->

# Operations

How Exit Zero Labs runs as an AI-agent-first studio without losing the ability to say who did what, why, and whether it was checked.

> Sources: `doctrine.md` §operations (retired); Project Management Directive §5, §7 (retired — its execution-tier content is deliberately **not** carried, see [What this document does not claim](#what-this-document-does-not-claim)); [`docs/runbooks/vps-gh-runner-playbook.md`](../runbooks/vps-gh-runner-playbook.md).

## The premise

Agents do the work. A human sets goals and validates outcomes. Everything below exists to make that safe rather than merely fast.

The constraint that shapes all of it: **generation is cheap and getting cheaper; judgement is not.** The expensive resource is no longer producing a change, it is knowing whether the change is right. So the framework spends its budget on evidence — what was decided, on what basis, checked by what, and readable by someone six months later.

## What this document does not claim

Written down because the previous version of this file failed it.

The retired Project Management Directive described a three-tier execution stack: a Linux box reached over Tailscale, Ollama on the Mac, GGUF weights on an external NVMe. **None of that exists.** It was carried into the first draft of this document verbatim because it was in the source, not because it was checked.

An operations document that describes infrastructure you do not have is worse than one that says nothing, because agents route work to tiers that cannot receive it and then improvise. **Nothing appears in this file that has not been confirmed to exist.** When a tier becomes real, it is added here with the date it did.

## Harnesses

Three, all frontier-model, all remote. No local inference.

| Harness | Used for | The constraint that matters |
| --- | --- | --- |
| **Claude Code** (Claude Pro) | Planning, implementation, review | Shares one rate limit with general Claude chat — the scarcest resource in the stack |
| **Codex / ChatGPT** | Planning, implementation | A separate budget, which is exactly why it is worth keeping: it is the fallback when Claude's limit is spent |
| **GitHub Copilot coding agent** | Issue-assigned execution, in-editor work | Runs against the repo contract; every repo ships `copilot-instructions.md` |

All three read the same contract. `AGENTS.md` is canonical and the vendor files are pointers ([ADR-0005](../decisions/0005-agents-md-canonical.md)), so a rule change reaches all three at once and none of them can hold a rule the others cannot see.

**Budget discipline.** Claude Pro is shared between chat and Claude Code. Heavy reasoning belongs to planning; using it to *start writing the implementation* inside a planning session is execution wearing a planning hat, and that is what silently drains the limit. When Claude's budget is tight, take the first draft of a plan there and move refinement to Codex. The plan is the handoff artifact and is portable across harnesses by design — that is the whole reason it is written down.

## Effort routes work. It does not bind a model.

`Effort` names the reasoning class a task needs. It is **guidance for routing, not a rule** — no gate checks which model produced a diff, and none should. A capable model on a Low task wastes budget; a weak model on a High task wastes a day. Both are recoverable. What is not recoverable is a plausible-looking change nobody checked.

| Effort | Typically | Planning artifact |
| --- | --- | --- |
| **High** | Frontier reasoning: architecture, schema, security, cross-cutting judgement | Committed plan required; decomposed into sub-issues |
| **Medium** | Standard implementation against settled criteria | Committed plan required |
| **Low** | Deterministically checkable, self-contained | None — the issue body is the specification |

Two rules do bind:

- **Planning uses the strongest model available.** Planning is low-frequency by nature — a few deep sessions, not dozens — which is what makes this affordable.
- **Low cannot require research, by construction.** If a task would need a web search or an unfamiliar library, it is not Low, it is Medium. This removes the failure mode rather than guarding against it.

The gate for Low is **deterministic checkability, not file count.** A one-file change to money, auth, or crypto is not Low.

## Auditability

An agent-written codebase is only trustworthy if you can reconstruct why it looks the way it does. Four artifacts carry that, each required at a different point.

| Artifact | Records | When |
| --- | --- | --- |
| **Issue** | What was wanted, and its acceptance criteria | Before work starts |
| **Plan** (`docs/plans/{issue}-{slug}.md`) | Why this approach, what was rejected, how it will be checked | High/Medium, before code |
| **Pull request** | What changed, and the evidence it was checked | Always |
| **ADR** (`docs/adr/`) | A decision that outlives the change that prompted it | When a choice constrains future work |

Three properties make them an audit trail rather than a description of the present:

**Append, never overwrite.** A plan's re-plan log is appended to when the approach changes. Rewriting it to match the outcome destroys the only record that the approach ever changed — and that it changed is usually the most informative thing in the document.

**Record the rejected alternative.** A decision without its discarded options is an announcement. In six months the question is never "what did we do", it is "did we consider X" — and only the rejected list answers it.

**State what was not verified.** An agent that reports "verified" for something it inferred corrupts the trail worse than one that reports nothing. Label unverified claims as unverified.

The ways these artifacts rot are catalogued in [anti-slop/process.md](anti-slop/process.md) — fabricated verification, inferred-as-observed, silent scope reduction, checkbox theatre, and the retrofitted decision record. That file is required reading before writing a plan, a pull request body, or a status report, because **an unreliable audit trail is worse than none**: it is trusted.

### Provenance

Work is attributable. Agent-authored commits carry a `Co-Authored-By` trailer naming the model; the pull request names the harness. This is not ceremony — when a defect class recurs, the first useful question is whether it correlates with a harness, a model tier, or a prompt, and that is unanswerable without the trail.

`--auto-mode` does not suppress attribution. It changes who is in the loop, never whether the loop is recorded.

## Ownership

**Every issue has exactly one owner, and the owner is a human.** Agents execute; they do not own. An agent may hold an issue for the duration of a task, but accountability for the outcome does not transfer.

**Claim by moving `Status` to `In progress` the moment you decide to work on an issue — before doing anything else.** Parallel agents work across the workspace simultaneously, and the board is the only thing stopping two of them starting the same issue. A claim you have not recorded is not a claim, and the window between deciding and recording is exactly when the collision happens.

`In progress` with no linked branch is not a claim either, it is a leak — the `issues-refresh` sweep returns those to `Ready`.

Agents pick up work from `Ready` only. An issue in `Backlog` has not been triaged, so nothing has established that it is worth doing, correctly scoped, or still relevant ([planning.md](planning.md#the-four-states)).

**One agent per issue.** Two agents on one issue produce two plausible diffs and no principled way to choose between them without redoing the work.

For parallel agents to be safe, shared state has to be honest:

- Board fields are updated the same way in every repo, so a second agent reading the board sees the truth rather than a stale local belief.
- Long-running work reports progress on the issue, not only in a session another agent cannot read.
- A branch is claimed by existing. Two branches targeting one issue means one is abandoned work that should be closed rather than merged.

## Verification and validation

The distinction the whole framework rests on.

- **Verification — did it do the thing right.** Tests pass, CI is green, deterministic criteria met. Automatable, and should be automated as far as it goes.
- **Validation — did it do the right thing.** The diff matches intent; no plausible-but-wrong outcome slipped past green tests. **A human reads the diff.** Not automatable, however good the plan or however green the CI.

**Green CI is verification. It is not validation.** An issue reaches `Done` only when both pass. Written down rather than assumed, because under time pressure validation is the one that quietly gets dropped — and it is the one that catches confident-but-wrong work, the characteristic failure of generated code.

### What agents may and may not decide

| Agents decide | Humans decide |
| --- | --- |
| Implementation approach within a plan | Whether the work is worth doing |
| Refactors that preserve behaviour | Product, taste, and design direction |
| Test strategy and coverage | Accepting a diff (validation) |
| Whether a finding is real | Loosening any gate |
| Pushing back on an underspecified issue | Anything touching money, auth, secrets, or subscriber data |

**No agent lowers a bar to pass it.** Not a coverage floor, not a threshold, not an assertion, not a rubric. If a gate is wrong, say so and why — changing it is a human decision with its own ticket.

## `--auto-mode`

When a session includes `--auto-mode`, the agent proceeds without pausing for confirmation.

**It waives the human gate, never the criteria.** Verification and validation both still have to pass; what changes is *when* the human reads the diff, not whether. An agent that uses `--auto-mode` to skip a failing check has not gone fast, it has produced work that will be reverted.

It does not extend to: merging without the required review, anything in the humans-decide column, publishing or sending anything outward-facing, or deleting data. Those refuse regardless of mode.

**Escalate rather than improvise.** An agent that hits a missing secret, an unmade product decision, an ambiguous requirement, or a gate it cannot legitimately fix should stop and say so on the issue. Guessing past a blocker produces work that looks finished and is not — the most expensive failure available, because it consumes review attention before it is caught.

## The closed loop

Work is executed against a live testbed, not a description of one. Agents build in the ability to capture, manipulate, and inspect real state for what they are working on, because that is what lets them catch regressions and bad taste before a human does.

Components are modular enough to be tested independently, locally and deployed. The loop is expected to change as the product does; a testbed that is expensive to change stops being used, and then the gates it fed become decorative.

Where output quality is a judgement call rather than a boolean — generated prose, design, ranking — the loop needs an evaluation harness with versioned rubrics, fixtures pinning known cases, and calibration against real human decisions. **Fail closed, and never lower the bar to pass.**

## Continuous integration

CI runs on GitHub Actions. Two runner classes, and choosing wrongly between them has a real cost:

- **GitHub-hosted (`ubuntu-latest`)** — the default. Anything that is a static check: linting, type checks, unit tests, link and hash verification.
- **Self-hosted (`[self-hosted, Linux, X64, hostinger]`)** — a **single-concurrency resource shared across the whole organization.** One job at a time. Use it only for work that genuinely needs that host.

Two rules follow, both learned by breaking them:

- **Every workflow declares a `concurrency` group with `cancel-in-progress`.** Without it each push stacks another full run behind a serial runner instead of superseding the run it obsoletes. Two pushes become four queued jobs, and the queue becomes someone else's problem.
- **A job goes on the self-hosted runner only if it needs that host.** A static check placed there costs nothing to move and starves work that cannot move.

Runner operations, outages, upgrades, and rollback live in [`docs/runbooks/vps-gh-runner-playbook.md`](../runbooks/vps-gh-runner-playbook.md), the source of truth for anything runner-related. **Diagnose from the job queue before concluding the runner is down:** a job in `in_progress` means it is alive and serial, which looks identical to "offline" from outside and has a completely different fix.

## Governance is enforced where it matters and loose everywhere else

Branch protection requires an approving review before merge. Inside that gate agents create, iterate, and merge freely. The rules are machine-enforced so they cannot be talked around; the work inside them is unconstrained.

Conformance is tiered ([ADR-0006](../decisions/0006-conformance-classes.md)) so the strict rules stay enforceable. Known debt lives in `Tooling/conformance.yml` — a check that is permanently red is a check nobody reads, so the ledger is what keeps the green meaningful.

**The honest test for any control here: if an agent ignored it, would anything fail?** If not, it is advice, and it should be labelled as advice rather than presented as a gate.
