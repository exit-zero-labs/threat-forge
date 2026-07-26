---
name: research-idea
description: Research a prospective product idea and produce a web-backed assessment of its product fit, market, business case, and technical feasibility. Use when an idea for a new product needs validating before it is commissioned, whether it came from a human or an agent. Produces a dated exploration directory, not a verdict.
---

# Research an idea

Product-role research, not technical design. Output goes to `docs/explorations/{idea-slug}/`. Every idea passes this gate before it becomes work; humans and agents may both propose, neither may commission.

## Guardrails

1. **Never fabricate a source, a number, or a market size.** An acknowledged gap beats an invented figure. This output is exactly where fabricated precision does the most damage — a laundered guess becomes a funding decision.
2. **Produce a recommendation with its evidence, not a verdict.** If the evidence is thin, say so.

## Procedure

1. Restate the problem in one sentence and confirm it before researching. A misread problem wastes the whole pass.
2. Research each area against real sources, recording every URL as you go.
3. Note contradictions between sources rather than smoothing them — a disagreement in the evidence is a finding.
4. Assess feasibility lightly against the Class C stack. Flag hard blockers; this is not a technical design.
5. Write the outputs, then run `bun Tooling/anti-slop/scan.ts docs/explorations/{slug}/*.md` and fix what it reports.

## Outputs

| File | Contents |
| --- | --- |
| `summary.md` | The recommendation, its confidence, what would change it |
| `product.md` | The problem, who has it, how it is solved today |
| `market.md` | Who else serves this, where the gap is |
| `business.md` | How it makes money, what it costs to run |
| `technical-feasibility.md` | Buildable on the standing stack? Hard blockers |
| `references.md` | Every source, and what it was used for |
| `next-steps.md` | What happens if commissioned; the first milestone |

`report.html` is specified in the doctrine but has no template yet. Emit markdown and note it pending rather than generating an unstyled placeholder. See `reference-research-areas.md` for what each area must cover.
