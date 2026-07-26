<!-- @format -->

# Operations

> Sources: `doctrine.md` §operations (retired); Project Management Directive §3, §4, §8, §9 (retired, see [`docs/archive/`](../archive/2026-07-project-management-directive.md)); [`docs/runbooks/vps-gh-runner-playbook.md`](../runbooks/vps-gh-runner-playbook.md).

## Automate, then govern the automation

Operations at the workspace and in every repo are automated by agents as far as they can go. Each operation has a defined process for execution, monitoring, and maintenance, with consistent logging and error handling across repos.

Governance is strict where it matters and loose everywhere else. The shape: branch protection enforces that a pull request is approved before it merges, while agents are free to create, iterate on, and merge pull requests autonomously within that gate. The rules are machine-enforced so they cannot be talked around; the work inside them is unconstrained.

## `--auto-mode`

When a session includes `--auto-mode`, the agent has full autonomy to execute on the stated goal without pausing for human confirmation.

The boundary matters more than the grant: **`--auto-mode` waives the human gate, never the criteria.** Verification and validation still both have to pass. What changes is who reads the diff and when, not whether the diff is checked. An agent that uses `--auto-mode` to skip a failing check has not gone fast; it has produced work that will be reverted.

## Model routing by capability class

`Effort` names the reasoning class the work requires, not how long it takes. Routing follows from it.

| Effort | Class | Planning | Execution |
| --- | --- | --- | --- |
| High | Frontier reasoning, large context, changes across many surfaces | Required, heavy model | Broken into Low-equivalent steps |
| Medium | Sonnet-class reasoning, clear verification criteria | Required | Sonnet-class, or a cheaper open-weight executor once the plan is locked |
| Low | Deterministically checkable, no research dependency by definition | None — the spec is already in the issue | Local model |

Three rules make this hold:

- **Planning uses a heavy model.** Planning is low-frequency by nature: a few deep sessions, not dozens.
- **Execution routes down.** Once a plan is locked, executing against a written spec does not need frontier judgment.
- **Low cannot need research, by construction.** If a task would require a web search or an unfamiliar library, it is not Low — it is Medium. This removes the failure mode rather than guarding against it, because the tier that runs Low work cannot be trusted to search. Web search is a callable tool, not a model capability, and local models below roughly 70B are unreliable at invoking tools at all.

The gate for Low is **deterministic checkability, not file count.** A one-file change to money or auth logic is not Low.

## Budget discipline

Claude Pro is shared between general chat and Claude Code. They draw on the same limit, which makes it the scarcest resource in the stack.

Heavy models are for planning. Producing a plan document is planning; iterating on it is still planning. Using a heavy model to *start writing the implementation* inside a planning session is execution wearing a planning hat, and that is the line whose crossing silently drains the budget.

When chat demand is high, take only the first draft of a plan from Claude Code and move iterative refinement to a metered frontier model. The plan document is portable across models by design — that is the whole point of writing it down.

## Execution infrastructure

Three tiers in cost-preference order, all speaking an OpenAI-compatible endpoint so the harness points at whichever is reachable.

| Tier | Where | Use when |
| --- | --- | --- |
| Primary | `shrey-linux` over Tailscale | Reachable. Preferred for all execution |
| Local fallback | Ollama on the Mac | Primary unavailable; self-contained Low work only |
| Cloud fallback | Metered pay-as-you-go | Medium execution, or neither local tier available |

Local model weights live on the external Thunderbolt NVMe, never the internal SSD. The sustained-write risk to watch is swap under memory pressure, not the runtime itself — the lever is model size against available RAM.

CI runs on the self-hosted Hostinger runner. Its operations, outages, upgrades, and rollback procedures are documented in [`docs/runbooks/vps-gh-runner-playbook.md`](../runbooks/vps-gh-runner-playbook.md), which is the source of truth for anything runner-related.

## The closed loop

Work is executed against a live testbed, not against a description of one. Agents build in the ability to capture, manipulate, and inspect real state for whatever they are working on, because that is what lets them catch regressions, design flaws, and bad taste before a human does.

Components, flows, and processes are modular enough to be tested independently — locally and in a deployed environment. The loop is expected to evolve with the product; a testbed that is expensive to change stops being used.

## Agents working in parallel

Multiple agents may work at once. What makes that safe is discipline about shared state:

- One agent per issue. Claim by moving the board status, not by intention.
- Issue and pull request fields are updated consistently and in the same way across every repo, so a second agent reading the board sees the truth.
- Long-running work reports progress on the issue, not only in a session that another agent cannot read.
