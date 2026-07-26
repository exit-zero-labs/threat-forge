<!-- @format -->

# Product

> Sources: `doctrine.md` §product (retired); Brand Directive core values (retired, see [`docs/archive/`](../archive/2026-07-brand-directive.md)); [ADR-0001](../decisions/0001-doctrine-v1-adoption.md).

## The method is problem-obsession

Study a space until the gap is obvious, then build the thing that plugs it. Not the thing that is fun to build, not the thing the stack makes easy. A solution qualifies when it is tasteful, intuitive, highly functional, feasible to implement, and has a credible path to revenue.

Three values carry over from the Brand Directive and constrain what gets built:

- **User-focused products.** Intuitive interfaces, seamless interactions, flows that raise usability rather than feature count.
- **Innovation and creativity.** New technology is worth reaching for when it changes what the product can be, not when it changes what the README can claim.
- **Scalable solutions.** Products should sit near zero upkeep cost when idle and scale up when they need to. A product with a fixed monthly floor is a product that must be shut down rather than left running.

## Build in stages, and let metrics open the gate

Iterative development is the core. Every product starts as a proof of concept and only advances when the previous milestone's exit criteria are met. The ladder is defined in [planning.md](planning.md).

Descoping early is a first-class activity, not a failure. The default answer to a requirement that is not load-bearing for the current milestone is *not yet*. Growth in scope should follow observed usage, not anticipated usage.

## Every idea goes through the gate

Humans and agents are both authorised to propose ideas — for products, features, or tasks. Neither is authorised to commission one.

An idea becomes work only after research-backed validation covering product fit, market, business case, and a lightweight technical feasibility read. The `research-idea` skill produces that assessment into `docs/explorations/{idea}/`. The output is a recommendation with its evidence, not a verdict; commissioning is a human decision.

An agent that cannot find evidence says so. A confident assessment built on nothing is worse than no assessment, because it launders a guess into a decision.

## Agent-first design

Whatever a user can do through the UI, an agent must be able to do too. This is a build constraint, not an aspiration, and it is stated here as something testable:

- Every state mutation reachable from the UI has an equivalent agent-callable surface.
- Both surfaces are covered by the same tests, not by parallel suites that can drift.
- The agent's view of state is the same view the UI renders. An agent that reports stale state is a defect, not a limitation.
- The agentic surface is designed, tested, deployed, and monitored as a first-class citizen — not bolted on after launch.

## Marketing is owned by product

Marketing work is planned and tracked alongside the development it accompanies, on the same board, in the same milestones. It is not a separate function that arrives after the build.

Three channels, and only these three:

| Channel | Handle |
| --- | --- |
| Threads | `@itshreyas` |
| LinkedIn | `in/shreyassane` |
| Instagram | `@exitzerolabs` |

Announcements are tame, short, and specific. They are backed by a story and written bespoke. The failure mode to avoid is copy that could describe any product — the tell catalogue and the deterministic detector are in [anti-slop/copy.md](anti-slop/copy.md), and they apply to marketing output exactly as they apply to product prose.

Where agents generate prompts for downstream media tools, the prompt is an artifact: versioned, reviewed, and held to the same bar as the copy it produces.

## Open

The doctrine calls for deeply researched, source-backed marketing playbooks built from battle-proven references. That research has not been done, and inventing citations to fill the gap would be the top-severity tell in [anti-slop/copy.md](anti-slop/copy.md). It is tracked in the research backlog in [design.md](design.md#research-backlog) alongside the equivalent gap in design.
