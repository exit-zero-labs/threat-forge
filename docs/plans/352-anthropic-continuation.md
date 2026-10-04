# Issue 352 — Anthropic signed-block continuation

## Issue contract

- **Issue:** https://github.com/exit-zero-labs/threat-forge/issues/352
- **Parent initiative:** https://github.com/exit-zero-labs/threat-forge/issues/348 (native Feature)
- **Type:** Task
- **Effort:** High
- **Priority:** High
- **Autonomy:** AUTO
- **Dependencies:** #349
- **Architecture and constraints:** [Independent provider plan](348-provider-compatibility.md).
- **Non-goals:** Hosted proxy, configurable provider URLs, schema/persistence changes, silent model substitution and deployment.

## Objective and executable steps

- Depends on 1. Own `src/lib/ai/providers/anthropic.ts`, its fixtures/tests and Anthropic contract cases.
- Capture thinking/signature/redacted block starts, deltas and stops in content order; retain empty signed thinking. New model bodies do not force a tool or disable adaptive thinking. Preserve existing version/auth headers and Messages tools.
- Acceptance: text + thinking + multiple tool calls replay byte-equivalent content fields; multiple signature fragments are joined correctly; missing signatures, wrong block indexes, incomplete content and mutation of prior prefix fail before an invalid continuation request; provider errors are safe. New/refreshed Anthropic histories remain useful when incompatible old replay data is removed.
- Targeted check: Anthropic mapper/builders plus protocol contract/client and runner continuation cases. Owner validation: same approve/deny/Stop/Undo flow under Sonnet, plus Fable/Opus paid smoke only after authority.

## Verification and review

Run the targeted checks above, then the shared `npm run ci:local` gate once for the coherent change. Use the parent plan's independent PR, slop and security review lanes. Owner intent validation and paid/native execution are distinct from deterministic local proof.

## Replan log

| Date | Change | Evidence and reason |
|------|--------|---------------------|
| 2026-10-03 | Initial independent plan | Parent planning lane prepared this step against c00e63b4; owner approved plan-only publication. |
