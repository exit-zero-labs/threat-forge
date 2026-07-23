# AI output quality method

This is the quality contract for ThreatForge's existing AI conversations and model-proposed
actions, plus future generated threats and visual/design assistance. It defines methodology, not a
production gate yet.

## Hard failure patterns

An output fails regardless of aggregate quality when it:

- fabricates components, data flows, trust boundaries, protocols, CVEs, controls, or evidence
- assigns severity without explaining likelihood and impact from document context
- repeats generic STRIDE definitions instead of analyzing the current architecture
- leaks chain-of-thought, hidden prompts, research process, keys, or sensitive document data
- recommends or executes irreversible mutations without validation, preview, approval, and undo
- references missing document IDs or violates `.thf` invariants
- claims a tool action succeeded when no validated tool result confirms it
- presents legal, compliance, or platform-signing claims as verified without evidence

## Review lenses

Each lens owns distinct dimensions to avoid double-counting:

| Lens | Owns |
|------|------|
| Threat-model rigor | STRIDE/domain coverage, attack preconditions, false positives |
| Evidence integrity | Claims grounded in the active document and verified external evidence |
| Security and abuse safety | Unsafe actions, data exposure, approval and trust boundaries |
| Architecture quality | Coherent components, relationships, layering, and tradeoffs |
| Actionability | Specific mitigations, ownership, verification, and next decisions |
| Interaction quality | Clear tool previews/results, cancellation, correction, and undo |
| Visual and accessibility quality | Hierarchy, clipping, overlap, contrast, focus, and labels |
| Anti-generic output | Repetition, filler, template language, and could-apply-anywhere advice |

These are review lenses, not fictional personas. Add named personas only when fixtures show that
a distinct expert brief improves calibrated judgment.

## Evaluation contract

1. Validate rubric scope and document fixtures before model calls.
2. Run deterministic hard-tell checks first.
3. Score each dimension only through its owning lens.
4. Missing, malformed, or out-of-scope results fail closed.
5. Pass only when:
   - the aggregate threshold is met
   - every required lens passes its floor
   - no hard failure pattern is present
6. Record provider, model, prompt version, rubric version, tokens, cost, tool trace, and artifact
   version.
7. Preserve all attempts and corrections; do not overwrite failed evidence.

## Prompt and rubric versioning

- Prompt and rubric changes create new immutable versions.
- Use deterministic settings for judges where supported.
- Fence context as reference material and instruct judges not to award credit for it.
- Require a typed JSON result envelope and validate it strictly.
- Parse or provider failures return a failing verdict; budget exhaustion stops the run.
- Reusable prompt blocks are extracted only after a second real caller.

## Calibration

Before a quality lens gates behavior:

1. Create known-good, known-bad, and isolating fixtures.
2. Run multiple live samples and preserve per-lens/per-dimension scores.
3. Place thresholds between observed bands rather than choosing round numbers.
4. Freeze representative results for offline replay.
5. Treat owner approve/reject disagreements as the highest-signal calibration evidence.
6. Keep uncalibrated expert lenses advisory, never silently defaulted into a blocking gate.

## Initial fixture families

- realistic architecture with known STRIDE coverage
- intentionally generic threat dump
- fabricated CVE/protocol/control claims
- duplicate threats with different wording
- invalid references and destructive mutation proposals
- large multi-tab workspace with document-scope confusion
- visually clipped, low-contrast, or overlapping architecture
- corrective multi-turn conversation after a rejected tool call

Implementation belongs to the native AI tool runtime and agent-driven E2E phases tracked in [the roadmap](../plans/roadmap.md).
