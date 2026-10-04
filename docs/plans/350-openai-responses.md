# Issue 350 — Fix OpenAI native tools through stateless Responses

## Issue contract

- **Issue:** https://github.com/exit-zero-labs/threat-forge/issues/350
- **Parent initiative:** https://github.com/exit-zero-labs/threat-forge/issues/348 (native Feature)
- **Type:** Bug
- **Effort:** High
- **Priority:** High
- **Autonomy:** AUTO
- **Dependencies:** #349
- **Architecture and constraints:** [Independent provider plan](348-provider-compatibility.md).
- **Non-goals:** Hosted proxy, configurable provider URLs, schema/persistence changes, silent model substitution and deployment.

## Objective and executable steps

- Depends on 1. Own `src/lib/ai/providers/openai.ts`, its tests and fixtures, and the OpenAI provider setup in `protocol/client.ts`.
- Serialize new/resumed histories with flat functions, strict false, store false, medium reasoning and max_output_tokens. Implement created/output-item/text/function-argument/completed/failed/incomplete/error streaming. Preserve complete replayable output and distinguish call_id from item id. Handle output containing tools even without user-facing text. Usage comes from the response object.
- Acceptance: every current picker model and saved GPT-5.6 model produces the documented Responses body; forbidden Chat fields are absent; optional parameters remain optional; two chained read calls and one approval-gated mutation complete without duplicate calls/text; truncated/failed/refused/invalid output cannot report completed.
- Targeted check: OpenAI request/stream suites plus protocol contract/client and tool runner tests. Intent validation: greeting, read-only question, approved add-element, follow-up using the created entity ID, deny, Stop and Undo.

## Verification and review

Run the targeted checks above, then the shared `npm run ci:local` gate once for the coherent change. Use the parent plan's independent PR, slop and security review lanes. Owner intent validation and paid/native execution are distinct from deterministic local proof.

## Replan log

| Date | Change | Evidence and reason |
|------|--------|---------------------|
| 2026-10-03 | Initial independent plan | Parent planning lane prepared this step against c00e63b4; owner approved plan-only publication. |
