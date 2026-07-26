<!-- @format -->

# Copy, imagery, and design tells

The catalogue for anything a person reads or looks at. Read [index.md](index.md) first — the two guardrails there govern every entry below.

> Sources: Project Postcard `docs/research/anti-slop.md`. Examples drawn from that product are marked *(illustration)* — the tell generalises, the example does not.

## Copy

- **Hollow superlatives.** "Breathtaking", "stunning", "vibrant", "a testament to", "seamless", "revolutionary". Praise carrying no evidence. Replace with a concrete, checkable detail.
- **The "not just X, it's Y" construction.** "It's not just a tool, it's a workflow." Manufactured profundity. Cut it.
- **In-today's-world openers.** "In today's fast-paced world…", "Picture this:", "Imagine…". Grandiose throat-clearing. Start inside the subject.
- **Em-dash and rule-of-three crutches.** Em dashes several times a paragraph; every list arriving in threes; a "First… Second… Third…" cadence bleeding into prose. Vary rhythm deliberately.
- **Robotic transitions.** "Moreover", "Furthermore", "In conclusion", "That being said" at mechanical intervals.
- **Pseudo-depth.** "This begs the question…", "But what does it all mean?" — questions raised and left vague. Answer with substance or delete.
- **Overexplaining the obvious.** "Git, a popular version control system…". Trust the reader.
- **Listicle smell.** Narrative that is secretly a ranked list; "top 5" scaffolding; filler entries padding a set to a round number. Curate, never dump.
- **Symmetry of structure.** Every section the same shape: claim, explanation, tidy summary, transition, repeat. **Real writing is asymmetric.** This is the hardest tell to see in your own output and the most reliable signature of generation.
- **Voicelessness.** No opinion, no tension, no admitted uncertainty, nothing a real person would risk saying. Having a point of view is a requirement, not a liberty.
- **Fabricated specificity.** Inventing a number, a name, or a quote to *sound* grounded. Worse than vagueness, because vagueness is honest. Every concrete claim is sourced or it does not ship.
- **Invented voices and demographic composites.** An unattributed "a typical day for a 20-something", or a composite person standing in for a real one. An acknowledged gap beats an invented filler. *(illustration: caught while calibrating a write-up rubric, where a model produced a stereotyped resident routine no source supported.)*
- **Staging a general fact as a specific scene.** Dramatising a general claim into an invented first-hand moment invents an observation nobody made, even when the underlying fact is true. A subtler cousin of fabricated specificity.
- **Invented vernacular or terminology.** A plausible-sounding technical term, or a precise-sounding statistic, dressed up to sound authoritative. *(illustration: a model invented an architectural term that appeared in no source.)*
- **Research-process leakage.** Output that says "the sources", "the brief", "the research suggests", or narrates what "the evidence available here" supports. It exposes generation scaffolding instead of reading as finished work. Name the person or publication when it matters; otherwise state the grounded fact directly.

## Imagery

- **Generic stock look.** Impersonal, could-be-anywhere scenes; sanitised, weirdly perfect cheerfulness with none of the texture of a real thing.
- **Mismatched imagery.** An image that is attractive but not *this* subject. Match is a hard gate, not a preference.
- **Generator artifacts.** Morphological errors in hands, limbs and faces; warped or melted textures; impossible reflections; cloned background elements; lighting and shadow that disagree.
- **Gibberish text in images.** Faux-lettering, misspelled signage, alphabet-soup labels. Where a surface can composite real typography deterministically, **any** model-rendered lettering is a reject, not just misspelled lettering.
- **Over-symmetry.** Unnaturally mirrored compositions and repeating forms that drain real-world randomness.
- **Confident glossy polish.** The opposite failure from generic stock: screen-printed flat colour, HDR clip-art punch, slick vector sheen. Competent, confident, and hollow in a glossier way.
- **A generated layer overreaching into deterministic territory.** Where a design splits generated background from deterministic foreground, a background that starts drawing its own text, rules, frames, or icons has crossed the line. The deterministic layer owns those elements exclusively.

## Design and typography

- **Uncanny typography.** Off kerning and leading, mismatched families, no hierarchy, text at odd angles or impossible overlaps. Type is set on a scale, with real hierarchy.
- **Interchangeable lockups.** A polished title treatment that could move unchanged to another product is template slop however good it looks. Ornament must map to visible evidence from the subject; shorthand and theme-park exoticism are rejects.
- **Colour noise.** Rainbow gradients, arbitrary colour, decorative flourish. Colour that carries no information is noise. Restraint is the aesthetic — including in the deliberate exceptions, which are calibrated rather than loosened.
- **Default-template smell.** Centered everything, evenly spaced card grids, a stock hero above three feature boxes. Layout is composed for the content, not poured into a template.
- **Motion for its own sake.** Animation is subtle, purposeful, and rare. If it does not aid reading or delight with restraint, cut it.

## Applying this to agent-authored reports

Agents write briefings, reports, and summaries for humans, and those inherit every tell above. Three are worth naming because they dominate that format:

- **Kill structural symmetry.** The worst tell in a per-item report is every entry arriving in the identical shape. That cadence is the smell. Vary the shape deliberately.
- **No hollow confidence.** A concrete checkable blocker beats "this should be straightforward."
- **Visual discipline.** One diagram, one at-a-glance table, sparing use of any icon vocabulary. If a visual does not help someone decide something, cut it. Do not sprinkle decorative emoji through prose.
