# Issue 353 — Current catalog and saved-selection behavior

## Issue contract

- **Issue:** https://github.com/exit-zero-labs/threat-forge/issues/353
- **Parent initiative:** https://github.com/exit-zero-labs/threat-forge/issues/348 (native Feature)
- **Type:** Task
- **Effort:** Medium
- **Priority:** Medium
- **Autonomy:** AUTO
- **Dependencies:** #350, #351, #352
- **Architecture and constraints:** [Independent provider plan](348-provider-compatibility.md).
- **Non-goals:** Hosted proxy, configurable provider URLs, schema/persistence changes, silent model substitution and deployment.

## Objective and executable steps

- Depends on 2–4. Own `src/lib/ai-models.ts`, catalog/settings tests, AI settings component tests and affected user-settings defaults.
- Offer exactly the seven current public choices listed above. Update defaults to Sonnet 5.5 and GPT-6.1 Sol. Preserve exact saved selected IDs visibly; retain known saved-model compatibility in the same authoritative catalog with an explicit picker/currentness distinction rather than a duplicated capability table. Unknown text-only models retain current behavior; unknown native tools fail before network.
- Acceptance: selectable models all have sourced limits and correct endpoint/reasoning contracts; stored Luna/Terra/old Claude IDs are not silently replaced; provider switching restores selected/default model correctly; reset uses new defaults; keys remain untouched. Read source to verify old IDs remain accepted before advertising tool compatibility, and show a safe stale-selection state if a provider retires one.
- Targeted check: model/preflight/settings/AI settings suites. Owner validation: existing settings, explicit model selection, provider toggle, and reset.

## Verification and review

Run the targeted checks above, then the shared `npm run ci:local` gate once for the coherent change. Use the parent plan's independent PR, slop and security review lanes. Owner intent validation and paid/native execution are distinct from deterministic local proof.

## Replan log

| Date | Change | Evidence and reason |
|------|--------|---------------------|
| 2026-10-03 | Initial independent plan | Parent planning lane prepared this step against c00e63b4; owner approved plan-only publication. |
