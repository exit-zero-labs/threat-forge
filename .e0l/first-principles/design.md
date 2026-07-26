<!-- @format -->

# Design

> Sources: `doctrine.md` §design (retired); Brand Directive design principles (retired, see [`docs/archive/`](../archive/2026-07-brand-directive.md)).

## Function decides form

The first question is not how it looks. It is whether a person can use it — accessibility, then usability, then intuitiveness. Functionality drives design; design does not drive functionality.

Minimal, tasteful, intuitive. Highly functional rather than merely good-looking. Three principles carry over from the Brand Directive:

- **Less is more.** Essential elements only. Clutter is a decision to make the user work harder.
- **Clarity and readability.** Legible, unambiguous, comprehensible without a legend.
- **User-centric design.** Every decision resolves toward what the user needs to do next.

## The design language contract

Typography, colour, motion, and shape are consistent within a product. Each product may invent its own design language, but every language inherits the principles above.

A design language is a set of constraints written down, not a mood. At minimum a product defines:

- A type scale and the fonts that carry it, each with a fallback chain that degrades to something readable.
- A neutral palette, plus a rule for how accent colour enters. Colour that carries no information is noise.
- A spacing scale.
- Motion durations and easing, with a stated position on when animation is warranted. Motion for its own sake is a tell.

Where these are expressed as code, they belong in tokens that surfaces consume — not in per-component literals. A design system that exists but is not adopted is worse than none, because it implies a consistency that is not there. Prove adoption with a check that fails when a surface bypasses the tokens.

## Generated design is held to the same bar

Design output produced by agents, and imagery produced by generative tools, are subject to the tell catalogue in [anti-slop/copy.md](anti-slop/copy.md) — specifically the imagery, typography, and layout sections. The recurring failures are uncanny typography, interchangeable lockups, colour noise, default-template composition (centered everything, evenly spaced card grids, a stock hero above three feature boxes), and generator artifacts.

The test is the same one that applies to copy: **could this exact layout, image, or lockup appear in a different product?** If yes, it is slop.

## Research backlog

`doctrine.md` calls for design instruction sets that are "extremely and in-depth web-researched from renowned sources … with plenty of examples, references, and links."

That research has not been done. Writing it in a single pass would mean fabricating citations, which is the highest-severity tell in the anti-slop doctrine — a governance document that violates its own rules on the page where it states them teaches agents that the rules are decorative.

So this document ships the principles and names the gap. The sourced pass is commissioned as its own issue, `HITL`, `Effort: High`, and must produce:

- A referenced position on type, colour, spacing, and motion, with each claim traceable to a named source.
- The Exit Zero Labs baseline visual identity the Brand Directive never defined: palette, typography, and logo usage.
- Worked examples of the anti-generic instruction set, with before-and-after pairs.

Until that lands, **do not add references to this document.** An unsourced principle is honest; a fabricated citation is not.
