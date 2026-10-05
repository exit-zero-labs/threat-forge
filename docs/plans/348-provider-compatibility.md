# Issue 348 — Current AI provider compatibility

## Issue contract

- **Issue:** https://github.com/exit-zero-labs/threat-forge/issues/348
- **Type:** Feature
- **Effort:** High
- **Priority:** High
- **Autonomy:** AUTO for deterministic implementation; paid validation is HITL in #355.
- **Milestone:** M3 • Release 1
- **Authority:** Owner approved issue publication/claiming and independent plan-only commits on 2026-10-03. Local implementation is authorized; code commits, pushes, PRs, merge, deployment and paid requests remain separate.
- **Independent planning:** Prepared by the issue-planner lane at revision c00e63b4 before implementation.
- **Execution:** #349–#354 are direct native sub-issues; #355 is Ready pending live credentials/spending authority.

## Objective

Make native tools work with the current public Anthropic and OpenAI model lineup on browser and desktop, prevent the observed OpenAI 400, and add request-validating tests that exercise serialization, real HTTP streaming, continuation, and failure behavior instead of accepting any request a fixture receives.

## Issue contract and authority

- Parent #348: native Feature, “Support current Anthropic and OpenAI models with verified tool compatibility.” Effort High because provider networking and Rust IPC touch trust boundaries; model/opus; Priority High subject to live-board triage; AUTO for implementation and deterministic verification.
- Observed-defect #350: native Bug, “OpenAI native tools fail when Chat Completions uses implicit reasoning.” Relate it to the feature without inventing a Feature solely for cleanup. Cost of delay: the released app rejects even a greeting when native tool definitions accompany GPT-5.6 Luna.
- Implementation Tasks #349 and #351–#355: directly parent each one to the native Feature, never to an intermediate Task. Dependencies below express ordering. Refresh issue types, organization Priority/Effort fields, Project Status, issue relationships, milestone scope, labels, and existing work before publication.
- Milestone: M3 • Release 1 unless the owner explicitly pulls this scope into M2. Exactly one AUTO/HITL label per issue. Paid live validation is a separate HITL Task because fresh keys and a spending ceiling are not authorized yet.
- Authority at planning-preview creation was read-only. Owner subsequently approved publication, claiming, plan-only commits and local implementation. No push, PR, merge, deployment or paid requests are authorized.
- Non-goals: hosted proxy/accounts, configurable provider URLs, provider-hosted tools, new reasoning controls, persistent protocol-history storage, `.thf` changes, automatic model replacement, deployment, threat-quality benchmarking, broad transport framework, or unrelated branch changes.

## Observed tree and current behavior

Observed revision: `c00e63b4bdaf441d5184ed9e45ad0abb79446129`, branch `codex/distribution-signing`. The working tree was clean according to the parent and emitted no porcelain entries in the planner read; Git reported an fsmonitor IPC diagnostic, so that diagnostic is not presented as a new source modification. The planner performed no repository writes or tests.

Applicable sources read: root AGENTS.md; CLAUDE.md and declared `.e0l/AI.md`; `.claude/agents/issue-planner.md`; `.github/instructions/{ai,rust,security,tests,e2e}.instructions.md`; plan template; AI protocol and tool-loop docs; current provider builders, model catalog, request/client/budget/message/event contracts, browser endpoint/transport, turn runner/store/reducer, Rust relay/commands, and existing AI E2E fixtures. The repository uses npm and its existing stack; no stack replacement is proposed.

`src/lib/ai/providers/openai.ts` sends Chat Completions function tools and omits a reasoning setting. `src/lib/adapters/provider-endpoints.ts` and `src-tauri/src/ai/providers.rs` fix OpenAI requests to `/v1/chat/completions`. The model catalog treats tools as one Boolean capability. These facts permit a request that a current provider rejects. Existing fixture replay tests do not validate that the advertised model, endpoint, reasoning setting, and tool schema are a legal combination.

The neutral protocol has text, tool-call, and tool-result blocks only. The Anthropic mapper ignores thinking/signature deltas. The turn reducer appends tool calls as completed events arrive, so it does not retain provider-native content ordering or signed replay material. The client budgets independently on every iteration; the store rebuilds its document system prompt for each new user turn. A model-ID-only upgrade therefore misses continuation failures.

## Dated provider facts

The picker should offer the latest public family choices: `gpt-6-astra`, `gpt-6.1-sol`, `gpt-6-luna`; `claude-fable-5-1`, `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-4-5-20251001`. GPT-6 Sol remains an existing-selection compatibility case, not a current picker recommendation. Preserve saved IDs visibly and send their exact IDs; never silently change the model a user selected. New/reset defaults remain balanced/workhorse roles: Sonnet 5.5 and GPT-6.1 Sol. [OpenAI model guide](https://developers.openai.com/api/docs/guides/latest-model), [Anthropic model catalog](https://platform.claude.com/docs/en/models/overview).

Current OpenAI models document 1,050,000 context tokens and 128,000 maximum output tokens. GPT-6.1 Sol requires Responses for tools and supports no `none` effort. Sol/Luna Chat Completions tools require explicit `none`; Responses accepts function calling. Use one fixed Responses endpoint for all OpenAI requests, including known saved GPT-5.6 selections. [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra), [GPT-6 Sol](https://developers.openai.com/api/docs/models/gpt-6-sol), [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna).

For OpenAI, use `store:false`, explicit `reasoning:{effort:"medium"}`, flat function definitions with `strict:false`, `max_output_tokens`, `input`, and streaming. Do not send Chat Completions fields or `previous_response_id`. Stateless responses return encrypted reasoning material; replay complete supported output items, including assistant phase, in their original order. Strict false preserves current optional-field tool schemas. [Reasoning and stateless continuation](https://developers.openai.com/api/docs/guides/reasoning), [Function schema defaults](https://developers.openai.com/api/docs/guides/function-calling).

Anthropic retains Messages. Current Fable/Opus/Sonnet use adaptive thinking; retain signed and redacted thinking content, including empty thinking text with a nonempty signature. Context is 1M for Fable/Opus/Sonnet and 200K for Haiku; output limits are 128K and 64K respectively. [Model catalog](https://platform.claude.com/docs/en/models/overview).

Thinking is bound to the prior system, tools, and messages. Replaying edited/truncated prefixes can invalidate it; model switches can drop unreadable thinking. Preserve complete assistant content unchanged on iterations. At a fresh user turn, remove stale thinking when prefix inputs changed; never remove reasoning required to answer the current turn's tool calls. [Preserved thinking](https://platform.claude.com/docs/en/build-with-claude/preserved-thinking), [Tool continuation](https://platform.claude.com/docs/en/build-with-claude/thinking-tool-workflows).

## Architecture decision

Replace the OpenAI mapper/builders in place with Responses support. Change the browser table and Rust constant together. Keep the existing provider/body/streamId IPC contract and fixed official origins. There is no frontend URL, header, or new endpoint selector. This avoids maintaining both OpenAI APIs or adding another credential-routing choice at IPC.

Keep text/tool blocks authoritative for the application and review loop. Add optional in-memory assistant continuation receipts alongside a message's content, and a neutral stream event for receipt attachment. Receipt provenance is typed: provider, requested model, observed model, current turn identity, and prefix identity. Receipt payload is `unknown` at the neutral boundary; only provider modules parse it into a narrow allowlisted schema and serialize it back. No cast makes unknown content trusted. The schemas admit supported current native output kinds and preserve their complete objects and order; unsupported replayable kinds fail closed rather than being silently discarded. Never serialize an entire HTTP response or arbitrary opaque items without validation.

For OpenAI receipts, retain supported completed output items: reasoning, assistant messages with phase/content, and function calls. Keep provider function item IDs distinct from call IDs. Emit executable tool completion once, after validating final arguments; the final response output array must not duplicate streamed text or calls. When replaying a receipt use its validated native items instead of separately reserializing the neutral assistant blocks. Tool-result messages still serialize from the neutral toolCallId mapping.

For Anthropic receipts, reconstruct complete native assistant content in block-index order, retaining text/tool_use/thinking/redacted_thinking. Reject incomplete signatures or unterminated blocks. Do not alter signature bytes, reorder native blocks, or skip an empty thinking field. Continuation material never renders as answer text, creates approval grants, enters `.thf`, or enters current text-only localStorage persistence.

Compute provenance against the actual prepared request prefix after initial budgeting, including system and tools. On a fresh turn, stale prior receipts are projected to their existing text/tool content without mutating the saved conversation; preserve a valid receipt when its prefix still matches. During a current tool turn, a prefix mismatch or a budget operation that would invalidate active receipts produces an actionable context error before HTTP instead of silently stripping current-turn reasoning. Retain existing tool pairing and group-atomic history caps. Bound receipt bytes within transport/request budgets and include retained receipt material in token estimation; opaque ciphertext length is a conservative estimate, not an exact reasoning-token count.

Do not introduce automatic fallbacks/retries for a compatibility 400. A malformed stream cannot settle completed or authorize a tool from invalid arguments. Refusal, failure, incomplete output, cancellation, and usage remain explicit neutral outcomes.

## Executable implementation decomposition

The steps below have exact behavior and tests so mechanical execution needs no provider research. Organization Effort must still respect the High trust-boundary floor for networking/IPC Tasks; do not label those Low merely because their file changes are short. Tasks that are pure settled test/catalog changes can be sized separately. Child plans/commits required by the effort contract are a publication/authorization concern, not permission to bypass the rule.

### 1. Native continuation receipts and invalidation

- Own `src/lib/ai/protocol/{messages,events,budget,client}.ts`, associated tests, `src/lib/ai/loop/turn-machine.ts`, runner tests, and `src/stores/ai-turn-store.test.ts`; add a narrowly scoped provider receipt module only if it owns the two existing consumers.
- Add receipt attachment without changing text flattening or existing chat persistence. Record actual prepared-prefix provenance, maintain exact current-turn receipt ownership, strip stale prior-turn replay data in an outgoing projection, and refuse current-turn prefix invalidation.
- Acceptance: signed material survives two tool iterations; document prompt changes do not resend stale signed history; budgeting never pairs a tool result with missing call/reasoning; provider/model/session switching never sends incompatible continuation; late callbacks cannot attach to another chat; reload retains readable old text.
- Targeted check: named protocol/message/budget/client/runner/store Vitest files. Owner validation: switch chats/documents, edit the document between turns, Stop, then submit a follow-up.

### 2. OpenAI Responses request/stream implementation

- Depends on 1. Own `src/lib/ai/providers/openai.ts`, its tests and fixtures, and the OpenAI provider setup in `protocol/client.ts`.
- Serialize new/resumed histories with flat functions, strict false, store false, medium reasoning and max_output_tokens. Implement created/output-item/text/function-argument/completed/failed/incomplete/error streaming. Preserve complete replayable output and distinguish call_id from item id. Handle output containing tools even without user-facing text. Usage comes from the response object.
- Acceptance: every current picker model and saved GPT-5.6 model produces the documented Responses body; forbidden Chat fields are absent; optional parameters remain optional; two chained read calls and one approval-gated mutation complete without duplicate calls/text; truncated/failed/refused/invalid output cannot report completed.
- Targeted check: OpenAI request/stream suites plus protocol contract/client and tool runner tests. Intent validation: greeting, read-only question, approved add-element, follow-up using the created entity ID, deny, Stop and Undo.

### 3. Fixed browser/Rust endpoint parity

- Depends on 2. Own `src/lib/adapters/provider-endpoints.ts`, its tests, Rust `src-tauri/src/ai/providers.rs`, and relevant relay tests; touch commands only if validation needs provider-specific constraints.
- Use `/v1/responses` for OpenAI in both platforms; keep Anthropic `/v1/messages`. Keep auth headers Rust-owned on desktop. Preserve redirects refused, cancellation, framing caps, body caps, error redaction, stream-ID filtering and byte limits. Update endpoint-drift checks to assert full paths, not just origins. Add narrow body rejection for contradictory provider fields where contract validation is required without maintaining a second full wire schema in Rust.
- Acceptance: frontend cannot choose URL/headers; full-path parity asserted; invalid/nonstreaming/oversized requests never send; fake credential does not appear in IPC payloads, safe messages, errors, persisted output, or test evidence.
- Targeted check: endpoint/browser/Tauri adapter suites; `cargo test --manifest-path src-tauri/Cargo.toml ai::`; Rust formatting and warning-denying Clippy. Owner validation: desktop greeting and native tool roundtrip after authorized live smoke.

### 4. Anthropic signed-block continuation

- Depends on 1. Own `src/lib/ai/providers/anthropic.ts`, its fixtures/tests and Anthropic contract cases.
- Capture thinking/signature/redacted block starts, deltas and stops in content order; retain empty signed thinking. New model bodies do not force a tool or disable adaptive thinking. Preserve existing version/auth headers and Messages tools.
- Acceptance: text + thinking + multiple tool calls replay byte-equivalent content fields; multiple signature fragments are joined correctly; missing signatures, wrong block indexes, incomplete content and mutation of prior prefix fail before an invalid continuation request; provider errors are safe. New/refreshed Anthropic histories remain useful when incompatible old replay data is removed.
- Targeted check: Anthropic mapper/builders plus protocol contract/client and runner continuation cases. Owner validation: same approve/deny/Stop/Undo flow under Sonnet, plus Fable/Opus paid smoke only after authority.

### 5. Current catalog and saved-selection behavior

- Depends on 2–4. Own `src/lib/ai-models.ts`, catalog/settings tests, AI settings component tests and affected user-settings defaults.
- Offer exactly the seven current public choices listed above. Update defaults to Sonnet 5.5 and GPT-6.1 Sol. Preserve exact saved selected IDs visibly; retain known saved-model compatibility in the same authoritative catalog with an explicit picker/currentness distinction rather than a duplicated capability table. Unknown text-only models retain current behavior; unknown native tools fail before network.
- Acceptance: selectable models all have sourced limits and correct endpoint/reasoning contracts; stored Luna/Terra/old Claude IDs are not silently replaced; provider switching restores selected/default model correctly; reset uses new defaults; keys remain untouched. Read source to verify old IDs remain accepted before advertising tool compatibility, and show a safe stale-selection state if a provider retires one.
- Targeted check: model/preflight/settings/AI settings suites. Owner validation: existing settings, explicit model selection, provider toggle, and reset.

### 6. Request-validating real HTTP and browser regressions

- Depends on 1–5. Own new narrowly scoped AI HTTP tests, provider contract fixtures, Rust relay integration tests, AI E2E specs/helpers, scenario catalog and its runbook entry. Do not add a framework or new hosted dependency.
- Run disposable loopback HTTP servers in tests with fake keys. Browser transport uses real fetch, stream reader and byte framing; a test-only interception forwards the asserted official URL to loopback, never making production endpoints configurable. Rust uses a private test seam around the same relay request/stream logic, guarded from production. Servers close in finally/teardown and no detached process remains.
- Server expectations independently reject illegal model/body combinations before returning SSE. Include the observed Chat-tools + absent/medium-reasoning 400 as a negative request validator case and reject migrated requests with Chat field names, stored remote-state fields, strict-default drift, invalid call pairing, or missing signed continuation. The corrected production builder must pass that validator; a permissive canned responder is insufficient.
- HTTP matrix: streamed text; two requests with a tool result; multiple/interleaved tools; UTF-8/JSON split across chunks; empty thinking with signature; delayed signature fragments; HTTP400/401/403/404/413/429/500/503; malformed/truncated frames; closed/absent response body; pre-first-event transient retry; post-output failure without retry; redirect to a trap server receiving zero credentials; abort before/during stream and while awaiting approval; oversized error/stream bounds. Use counted requests and fake clocks where possible, no synthetic load or machine-speed thresholds.
- Browser UI cases cover both providers with fake keys: greeting with tools advertised, approval, denial, cancellation, Undo, request 2 exact continuation, chat/document switching, stale model selection, and safe errors. Reuse shared fixtures, semantic selectors, evidence manifest, and named agent scenario runner. Browser HTTP integration is local wire evidence; it does not prove provider access or a native Tauri launch.
- Acceptance: negative validator rejects the old request, corrected builder succeeds over actual HTTP, second-request assertions check material continuity, redirects deliver no headers to the trap, tests leave no servers. Tests fail if reasoning receipt replay, strict:false, or fixed endpoint is removed; demonstrate by a bounded isolated mutation-check lane against a clean known revision when permitted, never simultaneous lanes mutating a tree.

### 7. Opt-in paid provider smoke and handoff

- Depends on deterministic implementation and owner authority. Own a focused live-smoke command/runbook and redacted result report. This Task is HITL; real credentials never enter Playwright's instrumented browser because repository E2E guidance explicitly prohibits that.
- Owner supplies fresh credentials through approved environment/secure storage plus an explicit model/request/output-token/spend ceiling. No use of the screenshot key, no scraping browser vaults, no replay of an ambiguous paid POST. Default command does nothing without explicit opt-in. No automatic retries and no automatic model fallback.
- Sequentially test one text response and one two-request function-call continuation for each authorized model using production request builders and decoders, with a harmless pure local test function and synthetic input. Assert requested/returned model, terminal event, parsed tool name/input, result continuity, usage and safe failures; do not assert prose wording or model quality. Record only model IDs, endpoint, status, counts, usage and redacted pass/fail.
- Acceptance: all authorized current models pass actual provider requests or record distinct access/permission/quota gaps. If secrets/spend authority is absent, leave command ready and report live verification unperformed. Desktop owner walkthrough remains a separate observable proof, not inferred from shared mapper tests.

## Final verification, review and owner validation

Run targeted suites while iterating. One orchestrator alone runs `npm run ci:local` once after the coherent diff; Rust endpoint/runtime work also requires the Docker gates `npm run ci:docker` and `npm run ci:docker:build` per repository policy. Run the added named browser scenario with `npm run test:e2e:agent -- provider-compatibility --headless` once that scenario exists. Diagnose any red CI through the required runbook before rerunning. Do not claim pending commands passed.

Required read-only independent preflight lanes: PR reviewer, slop auditor, security auditor. Threat-model specialist applies if graph/tool semantics or `.thf` schema changes escape the non-goals; otherwise record why no domain change occurred. Each lane opens with revision and porcelain state. Mutation-proof tests run alone on a clean known commit if authorized. Resolve must-fix and should-fix findings before handoff.

Inspect the final diff for duplicated contracts, speculative helper layers, swallowed errors, unsourced capability promises, default model changes to saved values, forbidden SDK/network dependencies, broad unknown passthrough, noise fixtures and docs drift. Update `docs/knowledge/ai-protocol.md` and tool-loop docs where their message/event, endpoint, preservation and fixture contracts changed.

Owner validation must inspect actual approved mutations, single-step Undo, denial/cancellation without document change, mixed chats/documents, changed document context, and latest model selection. Report separately deterministic fixture checks, local HTTP integration, browser interactions, native launch, paid provider checks, CI, deployment and owner intent validation. This work remains In progress through PR review; no green gate or scratch plan moves an issue to Done.

## Replan log

| Date | Change | Evidence and reason |
|------|--------|---------------------|
| 2026-10-03 | Initial unpublished preview | Observed OpenAI 400, current provider docs and revision c00e63b4; awaiting issue/claim/plan-commit authority or explicit local gate override. |
| 2026-10-03 | Owner approved issue publication/claiming and plan-only commits | Native Feature #348 and direct children #349–#355 created; implementation issues claimed In progress, live validation #355 Ready. |
| 2026-10-03 | Local implementation decisions | All OpenAI calls use stateless Responses; recognized current and saved model IDs use medium reasoning, unknown plain-chat IDs omit the effort. Native receipts bind to the serialized prefix and current runner identity. Corrupt frames/arguments are terminal; max-token completion is bounded. Loopback HTTP and named browser tests use synthetic keys. An optional E2E port avoids reusing another project server. Live smoke is prepared with explicit opt-in and no paid execution. |
| 2026-10-03 | Independent review corrections | Reject Anthropic content without a valid opener, isolate Node-only tests from browser compiler globals, reject hosted tools and remote references at Rust IPC before key retrieval, check live-smoke returned model identity, exercise two tool iterations and browser context isolation. Stale OpenAI reasoning is stripped while preserving assistant phase. Independent source reviews prompted these bounded corrections. |
| 2026-10-03 | Second review corrections | Rust accepts text-only message and function-result content, preventing Responses from fetching remote files or images through IPC. A regression failed before the correction and passed afterward. The opt-in smoke requires tool_use before continuation; the focused runbook command includes the relocated HTTP tests. |
