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

Marketing work is planned and tracked alongside the development it accompanies — same board, same milestones, same definition of done. It is not a separate function that arrives after the build, and a feature is not finished because it shipped.

### The three channels

Only these three, and they do different jobs. A plan that treats them as one plan is a plan for none of them.

| Channel | Handle | What it is for |
| --- | --- | --- |
| Threads | `@itshreyas` | In-progress thinking, small observations, the build in public |
| LinkedIn | `in/shreyassane` | Milestones and the reasoning behind them, written for people who will not try the product |
| Instagram | `@exitzerolabs` | The product as an object — visual, made, tangible |

### The bar

Announcements are **tame, short, specific, and bespoke.** Backed by a story, written for one occasion.

The failure mode is copy that could describe any product. The tell catalogue and the deterministic detector are in [anti-slop/copy.md](anti-slop/copy.md), and marketing output is held to them exactly as product prose is — a launch post scores no differently from a subscriber email.

Three rules that do most of the work:

- **Say the specific thing.** "Now supports offline drafts" beats "a smoother, more powerful experience."
- **Never announce what a user cannot yet do.** Marketing follows shipping.
- **No engagement bait.** No "thoughts?", no manufactured contrarianism, no numbered-list bait. A post nobody would have written without a growth target is slop with a schedule.

### Generated media is an artifact, not an output

Where an agent produces prompts for image, video, or audio generation, **the prompt is the reviewable artifact** — versioned, committed, and held to the same bar as the copy it produces. A regenerated asset should be reproducible from the prompt; if it is not, the prompt was underspecified.

A media-generation prompt must state, explicitly:

- **Subject and composition** — what is in frame, where, and what the focal point is.
- **Medium and treatment** — the actual visual language, not an adjective. "Hand-painted, visible pigment texture, soft edges" is a specification; "beautiful" is not.
- **Palette**, in terms that map to the product's own tokens rather than mood words.
- **What must not appear** — the reject list. For our work this always includes **generated text of any kind**: typography is composited deterministically afterwards, never model-rendered ([design.md](design.md#per-surface-directives)).
- **Aspect ratio and safe areas** for the channel it is destined for.
- **Provenance**: which model and version produced the asset, recorded with it.

The imagery tells in [anti-slop/copy.md](anti-slop/copy.md#imagery) are the reject criteria — generic stock look, generator artifacts, over-symmetry, gibberish lettering, glossy AI-poster polish. **An asset that fails them is regenerated, not shipped with an apology.**

### What is deliberately not decided here

No specific generation vendor or scheduling pipeline is named. The doctrine mentions candidates; none has been chosen, and writing an integration contract for a tool we have not evaluated would be fabricated precision.

What the doctrine *does* require and this document now supplies is the part that survives any vendor choice: the channel model, the bar, and the prompt contract. **A campaign-execution skill — researched against real marketing sources, producing channel-ready copy plus structured media prompts — is tracked work, not something to invent here.** Until it exists, marketing copy is written under these rules by hand or by an agent reading them.
