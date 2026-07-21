---
name: pr-preflight
description: Run convergent independent review lanes before ThreatForge owner validation
---

# PR preflight

Run on a complete local diff or, after explicit PR-creation authorization, a draft PR before
moving its issue to `In review`.

1. Confirm issue linkage, acceptance criteria, required plan, and verification evidence.
2. Run in independent contexts:
   - always: `pr-reviewer`
   - always: `slop-auditor`
   - conditional: `security-auditor` for security/trust-boundary lanes
   - conditional: `threat-model-expert` for `.thf`, STRIDE, or threat-quality lanes
3. Keep reviewer ownership separate; do not collapse all checklists into one pass.
4. Fix must-fix and should-fix findings or record the explicit owner decision.
5. Re-run the same reviewer lanes after revisions until they converge.
6. Re-run affected verification.
7. Post or preserve a preflight record with each lane, findings, revisions, and final state.

Only then mark the issue `In review`. Preflight is not owner validation and cannot approve or
merge the PR.
