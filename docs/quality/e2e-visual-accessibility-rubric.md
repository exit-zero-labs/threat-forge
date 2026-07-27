# E2E visual and accessibility quality rubric

This is the honest split, per `docs/plans/roadmap.md`'s Phase 4 "Visual Review" line item
(*"Define a visual quality rubric for hierarchy, clipping, overlap, contrast, alignment, and
responsive states"*), between what this repository's E2E suite actually verifies by itself and what
still requires a human looking at retained evidence. Issue #66 built the mechanisms below; it does
not claim any of them replace human visual review.

## The rubric

| Rubric item | Category | Mechanism |
|---|---|---|
| Contrast | Automated | `assertNoSeriousAccessibilityViolations` (axe `color-contrast` rule, once the known pre-existing exceptions — see "Known accessibility exceptions" below — are retired for a given surface) |
| Empty states | Automated | Existing `empty-states`-family specs plus `e2e/accessibility-audit.spec.ts`'s empty-canvas case |
| Errors | Automated | `e2e/accessibility-audit.spec.ts`'s ephemeral-storage case (`seedEphemeralWorkspace`) exercises the visible "This session won't be saved" degraded/error state; malformed-file alerts are native transient dialogs and cannot be axe-scanned after dismissal |
| Responsive behavior | Partially automated | At 900×700, `e2e/accessibility-audit.spec.ts` requires each key interactive surface to be visible and fully inside the viewport (`toBeInViewport({ ratio: 1 })`) with no body-level horizontal overflow; it does not prove the layout still *looks* good |
| Keyboard operability of scroll regions | Automated | `e2e/accessibility-audit.spec.ts` covers every container measured to scroll and be otherwise unreachable: the component palette, and the `/` and `/terms` marketing scrollers at 320px. Each asserts the region takes focus by Tab, scrolls on an arrow key, and carries an explicit `tabindex` — the last because Chromium focuses overflowing scrollers on its own, so the traversal alone passes without it while WebKit skips such a container entirely |
| Hierarchy | Owner-validated | Evidenced by retained/attached screenshots; no automated heuristic |
| Alignment | Owner-validated | Same |
| Overlap | Owner-validated | Same — deliberately **not** given a new geometry-diffing utility (would be speculative, unproven, and out of proportion to this issue's scope) |
| Clipping | Owner-validated | Same |

## Known accessibility exceptions

`e2e/support/accessibility.ts`'s `KNOWN_ACCESSIBILITY_EXCEPTIONS` allowlists exact,
pre-existing `{ ruleId, target }` node pairs — never a whole rule — each tied to its own tracking
issue (`#220` tablist structure). A new node under an already-allowlisted rule still fails the gate;
only removing the fix from its tracking issue, or genuinely fixing the underlying UI, should ever
shrink this list.

## What "automated" and "partially automated" actually verify

- **Automated** means a Playwright assertion fails the run on regression, gated in CI, with no
  human step required to catch it.
- **Partially automated** (responsive behavior) means an automated check proves the absence of one
  concrete failure mode (key surface outside the viewport, or page overflowing its own viewport) but says
  nothing about whether the resulting layout is well-proportioned, legible, or visually coherent at
  that size.

## Non-goals

- No geometry-diffing or layout-scoring utility for hierarchy/alignment/overlap/clipping is built
  here — an unproven heuristic would create false confidence without reducing the actual review
  burden.
- No LLM-judge for visual quality is built here (see "Relationship to
  `docs/quality/ai-output-quality.md`" below).
- This rubric does not change CI artifact retention, gating, or upload conditions beyond what
  `#66` otherwise implements.

## What "owner-validated" means here

Hierarchy, alignment, overlap, and clipping have no automated check in this suite, by design (see
"Non-goals" above). Evidence for a human reviewer to judge these comes from:

- `e2e/canvas-visual.spec.ts`'s committed macOS baselines, refreshed and reviewed as images per its
  own header doc comment (baseline ownership, update command, and PR-description review process).
- `e2e/screenshot-templates.spec.ts`'s attachment-based, CI-skipped template screenshots — a manual
  local visual-validation aid, not a gate.
- Any retained per-attempt `screenshot`/`video`/`trace` attachment on a non-passing CI run, indexed
  by `scripts/build-artifact-manifest.mjs`'s `test-results/artifact-manifest.json`.

A green CI run does **not** mean a human confirmed hierarchy, alignment, overlap, or clipping look
right — only that nothing here regressed the dimensions this rubric marks "Automated" or "Partially
automated," and that evidence for the rest was retained for someone to look at when it matters (a
PR touching layout, a bug report, a baseline update).

## Relationship to `docs/quality/ai-output-quality.md`

That doctrine's "Visual and accessibility quality" review lens (*"Hierarchy, clipping, overlap,
contrast, focus, and labels"*) scores **AI-generated visual/design-assistance output** through a
future LLM-judge — explicitly out of scope for this rubric. This rubric instead scores **the
product's own rendered UI** through retained E2E evidence. A future judge could consume this
rubric's automated checks and retained screenshots as input evidence, but building that judge is a
separate, later effort.
