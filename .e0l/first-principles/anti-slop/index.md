<!-- @format -->

# Anti-slop

What generated output must never look like, and what actually stops it.

> Sources: Project Postcard `docs/research/anti-slop.md` and `docs/research/agentic-slop.md`, extracted to workspace level per `doctrine.md` §"Anti-AI" Protection (retired, see [ADR-0001](../../decisions/0001-doctrine-v1-adoption.md)).

Exit Zero Labs is built by agentic generation. That is the leverage and the liability: the same models that draft the product will, unchecked, produce copy, code, and documentation that is fluent, confident, and hollow. Slop is output that is locally plausible and globally empty — it optimises for sounding right over being specific, true, and felt. It is the default output of a capable model given a lazy prompt and no gate.

**The test for any artifact: could this exact sentence, image, layout, or function appear in a different product?** If yes, it is slop. Specificity is the antidote.

## The two guardrails

Read these before any catalogue. They are what keep the doctrine sharp instead of destructive.

**1. Functionality is sacred.** Anti-slop is never "delete things to look clean." Do not remove needed behaviour, drop edge-case handling, loosen validation, weaken a real test, or trade correctness for brevity. Every fix preserves or improves behaviour, verified by the same tests. **If removing "noise" changes what the code does, it was not noise.** When in doubt, keep the behaviour and raise the concern instead of silently cutting it.

**2. Signal over noise.** Raise only what genuinely matters — a real bug, a real complexity cost, a real maintenance trap. Necessary defensive code, real domain complexity, and thorough tests are not slop. **A reviewer that flags everything is itself slop**, because it trains everyone to ignore reviews.

The test for a fix: *does it make the artifact simpler or more correct while a human can confirm the behaviour is unchanged, or intentionally improved?* If not, it is not a valid anti-slop fix.

## The catalogues

| Document | Applies to |
| --- | --- |
| [copy.md](copy.md) | Prose, marketing, UI text, imagery, design and typography |
| [code.md](code.md) | Code, tests, documentation |
| [process.md](process.md) | Issues, plans, commits, pull requests, ADRs, reports, config — and how agents fail while writing them |
| [explanatory-register.md](explanatory-register.md) | Analytic and explanatory writing, where confident causal prose carries errors furthest |
| [detector.md](detector.md) | Running and extending the deterministic detector |

### Which one applies

Nothing an agent produces is outside this. If you cannot find the artifact below, the closest row governs.

| You are writing | Read |
| --- | --- |
| Application code, a test, a migration | `code.md` |
| A CI workflow, a config file, infrastructure | `code.md` + `process.md` § configuration |
| A repo doc, a runbook, a README | `code.md` § documentation + `copy.md` |
| An ADR, a plan, an issue, a PR body, a commit | `process.md` |
| A status report or briefing for a human | `process.md` § reports + `copy.md` |
| Subscriber-facing or marketing copy | `copy.md` |
| An explanation of why something is the way it is | `explanatory-register.md` |
| A design, a layout, generated imagery | `copy.md` § imagery and design + [design.md](../design.md) |

### Where the first principles carry it

Anti-slop is not a document you consult; it is a clause inside every other rule:

- [coding.md](../coding.md) — anti-slop self-review is condition 2 of the definition of done
- [documentation.md](../documentation.md) — the docs tells, and the freshness gate that makes drift fail CI
- [planning.md](../planning.md) — the plan template's validation criteria, and Priority's distribution test
- [operations.md](../operations.md) — provenance, escalation over improvisation, and "state what was not verified"
- [product.md](../product.md) / [design.md](../design.md) — the generic test applied to copy, marketing, and design

## How this is actually enforced

Five layers, and it matters which ones are real. A governance document that overstates its own enforcement is itself a slop tell, so this table is written honestly:

| Layer | Where | Machine-enforced? |
| --- | --- | --- |
| Author-time self-review | the `anti-slop-review` skill, before any task is marked done | No — instruction only |
| Independent audit | the `slop-auditor` agent, fresh context, in the review loop | No — instruction only |
| Deterministic detection | `Tooling/anti-slop/core.ts`, run in CI over changed prose | **Yes** |
| Pull request gate | the validation checkbox in the PR template | No — human |
| Plan gate | the validation criterion in the plan template | No — human |

**Exactly one layer holds against a lazy or adversarial agent.** The instruction layers work when the agent is cooperative, which is most of the time and is why they are worth having — but they are not gates, and calling them gates would be the fabricated-precision tell. Where a rule matters enough to be non-negotiable, make it deterministic.

Two rules govern the whole ladder:

- **Cheapest check first.** Linters and the deterministic detector run before any model-based judge. Expensive judges only see what survives.
- **Fail closed. The bar is never lowered to pass.** Turning a check green by weakening it is reward hacking, whether the artifact is a test or a rubric.

## How this doctrine grows

When a review catches a pattern not catalogued here, **add it in the same change that caught it**, with the concrete instance and why it survived the existing gates. A tell recorded three months later is a tell nobody writes down.

Sharpening the guardrails is as valuable as adding tells. A pattern that fires on legitimate work is worse than a miss, because a firing pattern feeds corrective text into every subsequent attempt and quietly degrades the output that follows it.

The richest evidence base is Project Postcard's `docs/research/agentic-slop.md` changelog — roughly thirty dated entries, each a real caught defect written as *tell · instance · why it survived green CI · fix · what to watch for*. It is deliberately not duplicated here; it is product-specific evidence, and the generalisable tells it produced are already in [code.md](code.md).
