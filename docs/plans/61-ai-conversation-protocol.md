# Issue 61 — Define a provider-neutral AI conversation and tool protocol

## Objective

Replace the string-only chat callback contract with one typed, provider-neutral protocol that
represents text, tool calls, tool results, usage, cancellation, and provider errors, so that the
bounded tool loop (`#62`) and the native graph tool registry (`#64`) can be built on a single
shared implementation instead of two per-platform ones.

## Issue contract

- **Issue:** `#61`
- **Parent initiative:** `#46`
- **Type:** `Task`
- **Size:** `L`
- **Priority:** `P1`
- **Autonomy:** `Automatable`
- **Dependencies:** none blocking. Coordinates with `#53` (document registry) on
  `src/stores/chat-store.ts`. Unblocks `#62` and `#64`. `#63` depends on the message shape
  defined here.
- **Non-goals:**
  - the tool-execution loop, approval modes, transactions, and undo boundaries (`#62`)
  - graph tool definitions, validators, and executors (`#64`)
  - IndexedDB conversation persistence and document-scoped sessions (`#63`, `#53`)
  - removing the fenced ` ```actions ` path — it is bounded here and deleted in `#64`
  - user-configurable or self-hosted base URLs (Ollama, Azure, OpenRouter, proxies)
  - image/document content blocks, prompt caching, and OpenAI `strict` function calling
  - exact tokenizer-based accounting; budgeting uses a documented estimator
  - any change to the `.thf` schema, `KeyStorage` encryption, or the updater

## Current behavior and evidence

**The chat contract is string-only.** `src/lib/adapters/chat-adapter.ts:7-11` defines
`ChatStreamCallbacks` as `onChunk(text: string)`, `onDone()`, `onError(error: string)`. There is
no representation of tool calls, tool results, usage, stop reason, or a distinction between
cancellation and failure. `src/stores/chat-store.ts:269-279` appends every chunk onto the last
assistant message's `content` string.

**Mutations are recovered by parsing model prose after generation.**
`src/lib/ai-actions.ts:268-288` scans the finished assistant text for ` ```actions ` fences and
JSON-parses them; `src/lib/ai-utils.ts:26-39` does the same for ` ```threats `.
`src/components/panels/ai-chat-tab.tsx:340-341` runs both only when `isLast && !isStreaming`, and
`:299-326` strips the fences back out of the text for display. Execution is
`src/lib/ai-action-executor.ts`.

**The system prompt exists twice, in two languages.** `src/lib/ai-prompt.ts:1-6` says in its own
header that it is a "TypeScript port of the Rust system prompt builder,
src-tauri/src/ai/prompt.rs". The two files carry byte-comparable STRIDE text, threat-block format,
action protocol, canvas positioning guidance, and `<response>` framing, and they are kept in sync
by convention only. Their tests (`src/lib/ai-prompt.test.ts`,
`src-tauri/src/ai/prompt.rs:200-288`) assert the same strings independently, so drift in one is
invisible to the other.

**Provider mapping also exists twice.** The browser path fetches providers directly
(`src/lib/adapters/browser-chat-adapter.ts:46-132`) and parses SSE in TypeScript
(`:134-175`). The desktop path builds the prompt in Rust
(`src-tauri/src/commands/ai_commands.rs:44-72`), streams in Rust
(`src-tauri/src/ai/providers.rs:72-262`), and emits `ai:stream-chunk` / `ai:stream-done` /
`ai:stream-error`. Both implementations extract only `content_block_delta.delta.text` (Anthropic)
and `choices[0].delta.content` (OpenAI) and discard `message_start`, `content_block_start`,
`tool_use`, `input_json_delta`, `usage`, and `stop_reason`. `providers.rs:144` even checks for
`data: [DONE]` on the Anthropic branch, which that API does not send.

**BYOK is real on desktop and must stay that way.** `src-tauri/src/commands/ai_commands.rs`
registers `set_api_key`, `get_api_key_status`, and `delete_api_key`; there is no `get_api_key`
command in `tauri::generate_handler![...]` (`src-tauri/src/lib.rs:71-86`). Yet
`src/lib/adapters/tauri-keychain-adapter.ts:14-20` invokes `get_api_key` and swallows the
resulting error into `null`. The invariant "the desktop key never enters the webview" therefore
holds today by accident — a missing command plus a swallowed error — and is not expressed in the
type system. `src/lib/adapters/browser-chat-adapter.ts:22-26` is the only real caller of
`getKey`, and only in the browser, where `BrowserKeychainAdapter` uses `localStorage`.

**Provider error bodies are forwarded verbatim.** `src-tauri/src/ai/providers.rs:116-122` and
`:214-220` interpolate the raw response body into the error string that reaches the UI;
`browser-chat-adapter.ts:64-67` and `:109-112` do the same. OpenAI 401 bodies include a partially
masked key fragment, so this is the one place where provider text needs redaction before it is
shown or stored.

**Cancellation is ambiguous across overlapping requests.** `src/stores/chat-store.ts:21` keeps a
single module-level `AbortController`, and `src-tauri/src/commands/ai_commands.rs:53-54` resets a
single process-wide `Arc<AtomicBool>` at the start of every request. Cancelling an older stream
after a newer one starts sets the same flag and stops the newer stream. `#62` issues several
provider requests per user turn, so stream identity has to exist before that loop does.

**Truncation is a naive tail slice.** `src/stores/chat-store.ts:319-322` keeps
`finalMessages.slice(-MAX_MESSAGES_PER_SESSION)` (`src/types/chat-session.ts`). With
string-only messages that is harmless. With tool calls and tool results it will split a tool
group and produce provider-rejected histories.

**Untrusted input is narrowed with type escapes today.** `src/lib/ai-actions.ts` validates model
JSON with hand-written checks and then `as unknown as` double casts (`:211`, `:216`, `:223`,
`:229`, `:234`, `:239`, `:244`, `:251`, `:260`). For `update_*` it only checks that `updates` is
an object, and `src/lib/ai-action-executor.ts:62`, `:105`, `:138`, `:171` spread that object over
the stored record — so model output can currently set `id` or any other field on an existing
element, flow, boundary, or threat.

**Existing infrastructure worth reusing.** `src-tauri/Cargo.toml` already carries `schemars = "1"`,
but it is used only by the stdio MCP server (`src-tauri/src/mcp/server.rs:138-205`), which is a
separate external-assistant surface, not the in-app chat path. The Tauri CSP already allows
`connect-src` to `https://api.anthropic.com` and `https://api.openai.com`
(`src-tauri/tauri.conf.json:25`). Model selection is a curated dropdown
(`src/lib/ai-models.ts:18-49`, `src/components/panels/ai-settings-content.tsx:36-38`) whose value
is persisted as a free string in settings (`src/types/settings.ts:36-38`), so a stale or unknown
model id is reachable. There are no tests under `src/lib/adapters/`.

### Design decisions this plan commits to

1. **One TypeScript protocol implementation; Rust becomes a credential-holding transport.**
   The only reason the desktop path parses provider payloads in Rust is that the API key lives
   there. Splitting *where the key is* from *how the protocol is decoded* removes the duplication
   at its root: Rust keeps the key, owns the endpoint URL and auth headers, and relays raw SSE
   frames to the webview; the same TypeScript decoder then maps frames to protocol events on both
   platforms. This is shared code, not two implementations kept in agreement. Desktop already
   receives raw provider text (including raw error bodies) through `ai:stream-error`, so this
   moves no secret across the boundary that does not already cross it — but it does make
   redaction mandatory (step 8).
2. **Zod is the single schema source; JSON Schema is generated from it.** One `z.strictObject`
   per tool input yields the runtime validator, the static TypeScript input type, and — via
   `z.toJSONSchema()` — the JSON Schema handed to the provider. Handwritten maps cannot satisfy
   the acceptance criterion, Rust `schemars` cannot serve a browser build whose executors are
   Zustand-side, and JSON-Schema-first would require both a TS codegen step and a runtime
   validator dependency. Zod is frontend-only and replaces existing hand-rolled validation rather
   than adding a layer.
3. **The first generated schemas are the twelve legacy actions.** They give the generation
   machinery a real production consumer inside this issue, delete the double casts, close the
   `updates`-spread hole, and become the direct inputs for `#64`'s tool definitions.

## Implementation steps

### 1. Protocol message and event types

- **Behavior:** a content-block message model and a discriminated stream-event union exist and are
  the only vocabulary the rest of the AI stack speaks. `ProtocolMessage` is
  `{ role: "user" | "assistant", content: ContentBlock[] }` where `ContentBlock` is
  `TextBlock | ToolCallBlock | ToolResultBlock`; the system prompt is a separate request field
  because Anthropic and OpenAI place it differently. `StreamEvent` covers `message_start`,
  `text_delta`, `tool_call_start`, `tool_call_input_delta`, `tool_call_complete`, `usage`,
  `message_stop` (with `stopReason`), `error`, and `aborted`. `ToolCallBlock.input` and
  `tool_call_complete.input` are typed `unknown` — never a tool-specific type — so no caller can
  read model output without going through step 2's parser. `ProtocolError` is a closed union
  (`unsupported_capability`, `no_api_key`, `http_status`, `rate_limited`, `transport`,
  `malformed_stream`, `context_overflow`, `cancelled`) carrying a user-safe `message` and an
  optional truncated `providerDetail`.
- **Files:** `src/lib/ai/protocol/messages.ts`, `src/lib/ai/protocol/events.ts`,
  `src/lib/ai/protocol/errors.ts`, `src/lib/ai/protocol/messages.test.ts`,
  `src/stores/chat-store.ts` (re-export only)
- **Implementation:**
  1. Define the types. `AiProvider` moves to `messages.ts`; `chat-store.ts` keeps
     `export type { AiProvider }` so the eight other files importing it do not churn and the diff
     against `#53` stays one line.
  2. Add `upgradeLegacyMessage()` mapping persisted `{ role, content: string }` sessions
     (`src/types/chat-session.ts`) to `{ role, content: [{ type: "text", text }] }`, and
     `flattenText(message)` for surfaces that still need a plain string.
  3. Add `assertToolPairing(messages)` returning structured violations; it is used by step 4 and
     by tests, not as a runtime guard on the happy path.
- **Targeted verification:** `npx vitest --run src/lib/ai/protocol/messages.test.ts`. A legacy
  session payload copied from the current `localStorage` shape round-trips to blocks and back to
  the same display string; `assertToolPairing` reports the orphan id for a message list whose
  `tool_result` has no preceding `tool_call`.
- **Intent validation:** owner confirms the event union is the vocabulary `#62`'s state machine
  and `#64`'s executors should consume, and that no event exposes a provider-specific shape.

### 2. Generated tool schemas and the legacy action registry

- **Behavior:** tool input contracts are declared once in Zod and generated into JSON Schema.
  `defineTool({ name, description, input })` returns a `ToolDefinition` exposing
  `jsonSchema()` and `parseInput(raw: unknown)`. `parseInput` returns
  `{ ok: true, value } | { ok: false, issues: string[] }` where `issues` are phrased for
  model-corrective feedback in `#62`. The twelve legacy actions become the first registry
  entries, and `extractActions` validates through them instead of hand-written checks.
- **Files:** `package.json`, `package-lock.json`, `src/lib/ai/protocol/tools.ts`,
  `src/lib/ai/schemas/actions.ts`, `src/lib/ai/protocol/tools.test.ts`,
  `src/lib/ai/schemas/actions.test.ts`, `src/lib/ai-actions.ts`, `src/lib/ai-actions.test.ts`
- **Implementation:**
  1. Add `zod` (v4, which provides `z.toJSONSchema`) as a runtime dependency; regenerate the
     lockfile with `npm install` so `npm run check:lockfile` still passes.
  2. Build `defineTool`. Tool inputs must be `z.strictObject` so unknown model-supplied keys are
     rejected. If the emitted schema omits `additionalProperties`, the emitter sets it explicitly
     rather than relying on library defaults — assert the emitted shape, do not assume it.
  3. Port the twelve payload interfaces from `src/lib/ai-actions.ts:26-170` to Zod, preserving
     current acceptance: `add_element` requires `type` and `name`; `add_data_flow` requires `from`
     and `to`; `add_trust_boundary` requires `name`; `add_threat` requires title, category,
     severity, description with the existing enums; deletes require `id`. Keep the existing
     case-insensitive severity acceptance and keep storing the value as written.
  4. Rewrite `validateAction` to `discriminatedUnion("action", ...).safeParse`, deleting every
     `as unknown as` cast. Keep `extractActions` skipping malformed blocks and invalid entries so
     the current fenced behavior is unchanged apart from item 5.
  5. Deliberate behavior change: `update_*` payloads now accept only their declared updatable
     fields. Model output can no longer inject `id` or arbitrary keys into the spread at
     `src/lib/ai-action-executor.ts:62`, `:105`, `:138`, `:171`.
- **Targeted verification:** `npx vitest --run src/lib/ai-actions.test.ts src/lib/ai/schemas`.
  The existing suite stays green unmodified except for the added case; the new discriminating test
  asserts `extractActions` rejects
  `{"action":"update_element","id":"api-gw","updates":{"id":"attacker-owned"}}` and that a valid
  `{"description":"..."}` update still parses. A schema test asserts the generated JSON Schema for
  `add_element` has `type: "object"`, `additionalProperties: false`, `required: ["type","name"]`,
  and carries the descriptions.
- **Intent validation:** owner accepts `zod` as a runtime dependency and confirms that silently
  applying unknown model-supplied update keys was a defect, not a feature.

### 3. Model capability table and request preflight

- **Behavior:** an unsupported or unknown capability fails before any network call. Capabilities
  live on the existing curated model list rather than in a parallel table.
  `resolveCapabilities(provider, modelId)` returns `{ known: true, capabilities }` or
  `{ known: false }`. `preflightRequest(request)` throws `unsupported_capability` when tools are
  requested and the model does not support tool calling, and when the configured model id is
  unknown and tools are requested. A text-only request against an unknown model id is still
  allowed — that is today's behavior — and yields a `capabilityUnknown` note on `message_start`.
- **Files:** `src/lib/ai-models.ts`, `src/lib/ai/protocol/request.ts`,
  `src/lib/ai/protocol/request.test.ts`
- **Implementation:**
  1. Extend `AiModelOption` with `capabilities: { toolCalling, parallelToolCalls, streaming,
     maxInputTokens }` and populate the five existing entries.
  2. Add `preflightRequest`, called by the client (step 10) before any transport work.
- **Targeted verification:** `npx vitest --run src/lib/ai/protocol/request.test.ts`. A request
  with a non-empty tool list against a tool-incapable model rejects with
  `unsupported_capability`, and the test asserts the stubbed `fetch` and the stubbed transport
  were never invoked — not merely that an error was thrown.
- **Intent validation:** owner confirms the split policy (refuse tools on unknown models, allow
  plain text) rather than blocking chat outright on a stale settings value.

### 4. Context budgeting that cannot split a tool group

- **Behavior:** `budgetMessages(messages, { maxInputTokens, reserveOutputTokens })` drops history
  oldest-first at **turn-group granularity**. A turn group is an assistant message containing one
  or more `tool_call` blocks together with every `tool_result` block answering those ids. Groups
  are indivisible. The retained window may never begin with an orphan `tool_result` and may never
  retain a `tool_call` whose result was dropped. If the newest group alone exceeds the budget the
  function returns a `context_overflow` error rather than emitting an unpaired history.
- **Files:** `src/lib/ai/protocol/budget.ts`, `src/lib/ai/protocol/budget.test.ts`,
  `src/stores/chat-store.ts`
- **Implementation:**
  1. Implement a documented deterministic estimator (character count divided by four, plus a
     fixed per-message overhead). State in the module doc that it is an estimate and that
     provider-side overflow still surfaces as a typed `context_overflow` error; do not add a
     tokenizer dependency.
  2. Implement group detection over `ContentBlock[]`, then drop whole groups from the front.
  3. Replace the naive persistence slice at `src/stores/chat-store.ts:319-322` with the same
     group-atomic truncation so the stored session cannot be saved in an unpairable state either.
- **Targeted verification:** `npx vitest --run src/lib/ai/protocol/budget.test.ts`. The
  discriminating case constructs a history where the budget boundary falls *inside* a tool group,
  such that a tail slice would keep the `tool_result` and drop its `tool_call`. Assertions:
  (a) `assertToolPairing(result)` reports no violations; (b) the whole group is absent, so
  neither the call id nor the result id appears; (c) an explicit control asserting that the naive
  `slice(-n)` of the same input *does* violate pairing, so the test fails if the implementation
  regresses to slicing. A second test asserts the single-oversized-group case returns
  `context_overflow` instead of an unpaired window.
- **Intent validation:** owner confirms dropping a whole tool group is preferable to summarizing
  or to failing the turn, and that the estimator's conservatism is acceptable.

### 5. One system prompt, composed and tool-aware

- **Behavior:** exactly one system prompt implementation exists in the repository.
  `buildSystemPrompt(model, { tools })` composes named sections. The fenced ` ```actions `
  instruction section is emitted only when the tool list is empty, and its action catalogue is
  generated from the step 2 registry instead of being restated in prose. The Rust prompt builder
  is deleted and the `ThreatModel` argument leaves the IPC command.
- **Files:** `src/lib/ai-prompt.ts`, `src/lib/ai-prompt.test.ts`,
  `src-tauri/src/ai/prompt.rs` (deleted), `src-tauri/src/ai/mod.rs`,
  `src-tauri/src/commands/ai_commands.rs`
- **Implementation:**
  1. Refactor `buildSystemPrompt` into ordered section builders (identity/STRIDE, threat block
     format, action protocol, canvas positioning, response format, model context) and accept the
     tool list.
  2. Generate the action catalogue lines from the registry so the prompt cannot describe an
     action the validator rejects.
  3. Delete `src-tauri/src/ai/prompt.rs` and its `mod` declaration, and drop `model: ThreatModel`
     from `send_chat_message`. This also removes a full model serialization from every IPC call.
- **Targeted verification:** `npx vitest --run src/lib/ai-prompt.test.ts` plus
  `cargo test --manifest-path src-tauri/Cargo.toml`. Discriminating assertions: the prompt
  **contains** ` ```actions ` when `tools` is empty and **does not contain** it when a non-empty
  tool list is passed — that single test is what makes the `#64` removal mechanical. A repository
  guard test asserts `rg '```actions' src-tauri/` finds nothing and that no second
  `build_system_prompt` exists.
- **Intent validation:** owner confirms the prompt text is unchanged for today's behavior and
  that prompt ownership moving wholly to TypeScript is acceptable given Rust no longer needs the
  model.

### 6. Shared SSE decoder and the Anthropic mapper

- **Behavior:** one byte-level SSE decoder and one Anthropic event mapper serve both platforms.
  The decoder accepts arbitrary chunk boundaries (including splits mid-line and mid-JSON) and
  emits complete `{ event, data }` frames. The Anthropic mapper builds the request body and maps
  `message_start`, `content_block_start` (`text` and `tool_use`), `content_block_delta`
  (`text_delta` and `input_json_delta`), `content_block_stop`, `message_delta` (stop reason,
  usage), `message_stop`, and `error` onto `StreamEvent`. Accumulated `input_json_delta`
  fragments are JSON-parsed once at `content_block_stop`; a fragment set that never parses emits
  `malformed_stream` for that tool call and does not abort the turn.
- **Files:** `src/lib/ai/providers/sse.ts`, `src/lib/ai/providers/anthropic.ts`,
  `src/lib/ai/providers/sse.test.ts`, `src/lib/ai/providers/anthropic.test.ts`
- **Implementation:** port the framing logic from `browser-chat-adapter.ts:134-175`, keeping its
  handling of a trailing partial line, then add the mapper. Tool results serialize as
  `tool_result` blocks inside a `user` message, which is Anthropic's shape.
- **Targeted verification:** `npx vitest --run src/lib/ai/providers`. Feed one recorded transcript
  through the decoder twice — once as a single chunk, once split at every byte offset that lands
  inside a JSON string — and assert both produce an identical event sequence.
- **Intent validation:** owner spot-checks the mapped event sequence against Anthropic's
  documented streaming shape.

### 7. OpenAI-compatible mapper

- **Behavior:** the OpenAI mapper produces the same `StreamEvent` sequence from
  `choices[0].delta` — `content` for text, `tool_calls[].function.{name,arguments}` accumulated by
  index, `finish_reason` for stop reason, terminal `data: [DONE]`, and `usage` when the stream
  requests it. Tool results serialize as `role: "tool"` messages keyed by `tool_call_id`. The
  divergence between OpenAI's `role: "tool"` messages and Anthropic's `tool_result` blocks is
  confined to these two mapper modules.
- **Files:** `src/lib/ai/providers/openai.ts`, `src/lib/ai/providers/openai.test.ts`
- **Implementation:** map by `tool_calls[].index`, since OpenAI streams the id and name on the
  first fragment only. Emit tool definitions as `{ type: "function", function: { name,
  description, parameters } }` with `parameters` taken from `jsonSchema()`. Leave `strict` unset;
  record in the module doc that strict mode additionally constrains optional fields and is
  deferred to `#64`.
- **Targeted verification:** `npx vitest --run src/lib/ai/providers/openai.test.ts`. A
  cross-provider test feeds the Anthropic and OpenAI transcripts for the *same logical response*
  through their mappers and asserts an identical `StreamEvent` sequence — that equality is the
  provider-neutrality proof.
- **Intent validation:** owner confirms the "OpenAI-compatible" surface is limited to the official
  endpoint for now and that custom base URLs remain out of scope.

### 8. Rust relay transport with stream identity and redaction

- **Behavior:** `start_ai_stream({ provider, body, streamId })` posts a frontend-built,
  provider-shaped body to the endpoint Rust selects from the provider enum, with auth headers Rust
  constructs, and emits `ai:stream-frame { streamId, event, data }` for each SSE frame plus a
  terminal `ai:stream-closed { streamId, outcome }`. `cancel_ai_stream(streamId)` cancels only
  that stream. The frontend never supplies a URL or a header. HTTP failures map to a typed error
  whose provider detail is redacted and truncated before it leaves Rust.
- **Files:** `src-tauri/src/commands/ai_commands.rs`, `src-tauri/src/ai/providers.rs`,
  `src-tauri/src/ai/types.rs`, `src-tauri/src/lib.rs`
- **Implementation:**
  1. Replace the process-wide `Arc<AtomicBool>` with a `Mutex<HashMap<String, Arc<AtomicBool>>>`
     of live streams keyed by `streamId`; remove the entry on completion. Keep
     `cancel_chat_stream` registered as a deprecated alias only if the UI still calls it;
     otherwise delete it with its frontend caller in step 9.
  2. Factor the parts worth testing into pure functions: `endpoint_for(provider) -> &'static str`,
     `auth_headers(provider, api_key) -> HeaderMap`, `validate_body(&Value) -> Result<Vec<u8>>`
     (object-shaped, non-empty string `model`, byte length under an explicit cap), and
     `redact_provider_detail(&str) -> String` (truncate to a fixed length; mask
     `sk-`/`sk-ant-`-prefixed tokens). The async network shell stays thin.
  3. Emit frames instead of extracted text; delete the Anthropic-only `[DONE]` branch at
     `providers.rs:144` and the duplicated per-provider SSE parsing.
  4. Keep the API key confined to `auth_headers`; it must not appear in the emitted payload, in
     any error string, or in any log.
- **Targeted verification:** `cargo test --manifest-path src-tauri/Cargo.toml ai::` and
  `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings`. Unit tests assert:
  `redact_provider_detail("Incorrect API key provided: sk-abc123DEF")` contains no `sk-abc`
  substring; a body over the cap is rejected; a body missing `model` is rejected; cancelling
  stream `a` leaves stream `b`'s flag unset; `auth_headers` places the key in the header and the
  serialized body contains no key material.
- **Intent validation:** owner confirms the tradeoff — raw provider frames now reach the webview
  on desktop so that decoding is shared — is preferable to maintaining a second Rust decoder, and
  confirms Rust remains the sole holder of the desktop key.

### 9. Typed transports and a key boundary the type system enforces

- **Behavior:** `ChatTransport.open(providerRequest, { onFrame, onHttpError, onTransportError,
  onClose }, signal)` is the only platform-specific interface left; both implementations are
  transport-only and contain no provider knowledge. `KeychainAdapter` no longer declares `getKey`;
  key retrieval exists only on `BrowserKeychainAdapter`, so it is a type error for desktop code to
  ask for a key.
- **Files:** `src/lib/adapters/chat-adapter.ts`, `src/lib/adapters/browser-chat-adapter.ts`,
  `src/lib/adapters/tauri-chat-adapter.ts`, `src/lib/adapters/keychain-adapter.ts`,
  `src/lib/adapters/tauri-keychain-adapter.ts`, `src/lib/adapters/browser-keychain-adapter.ts`,
  `src/lib/adapters/browser-chat-adapter.test.ts`,
  `src/lib/adapters/tauri-chat-adapter.test.ts`
- **Implementation:**
  1. Browser transport: resolve the key from `BrowserKeychainAdapter`, `fetch` the endpoint from
     the TS endpoint table with the mapper's headers, stream the body through the shared decoder,
     and honor `signal` by cancelling the reader.
  2. Tauri transport: `invoke("start_ai_stream", { provider, body, streamId })`, subscribe to
     `ai:stream-frame`/`ai:stream-closed`, **filter every event by `streamId`**, always unlisten
     in `finally`, and route `signal` to `cancel_ai_stream(streamId)`.
  3. Delete the dead `getKey` from `TauriKeychainAdapter` and the swallowing `catch`; narrow the
     shared interface.
  4. Add an endpoint-drift test that reads `src-tauri/src/ai/providers.rs` and
     `src-tauri/tauri.conf.json` from disk and asserts the TS endpoint table, the Rust constants,
     and the CSP `connect-src` allowlist name the same origins.
- **Targeted verification:** `npx vitest --run src/lib/adapters` and `npx tsc --noEmit`. The
  desktop key test asserts that no desktop code path can call `getKey` (a `@ts-expect-error`
  compile assertion) and that the Tauri transport ignores frames carrying a foreign `streamId`.
- **Intent validation:** owner confirms browser key storage remains `localStorage` with its
  existing UI warning and that no new key surface was introduced.

### 10. Protocol client, chat store rewire, and the fenced compatibility boundary

- **Behavior:** `streamConversation(request, transport, handlers, signal)` runs preflight,
  budgeting, provider mapping, transport, and decoding, and emits `StreamEvent`s. The chat store
  consumes events instead of strings. The fenced ` ```actions ` path survives behind exactly one
  named boundary.
- **Files:** `src/lib/ai/protocol/client.ts`, `src/lib/ai/legacy/fenced-actions.ts`,
  `src/stores/chat-store.ts`, `src/components/panels/ai-chat-tab.tsx`,
  `src/lib/ai/protocol/client.test.ts`, `src/stores/chat-store.test.ts`
- **Implementation:**
  1. Implement the client. Cancellation resolves with a terminal `aborted` event, never an error,
     and the partial assistant message is retained, matching current behavior at
     `src/stores/chat-store.ts:292-296`.
  2. Rewire the store: `text_delta` appends to the last assistant message's text block;
     `tool_call_complete` appends a `ToolCallBlock`; `usage` and `stopReason` are recorded on the
     message; `error` maps to the existing `error` state through a user-safe message table.
     **Do not rename any store action, exported symbol, or state field, and do not touch
     `getStorageKey` or the session lifecycle** — those are `#53` and `#63` surfaces.
  3. Create `src/lib/ai/legacy/fenced-actions.ts` exporting
     `LEGACY_FENCED_ACTIONS_ENABLED = true` with a doc comment naming `#64` as the removal issue.
     Route `extractActions`/`extractThreats` in `ai-chat-tab.tsx` through it. The boundary's
     contract: it consumes only accumulated `text_delta` output, never a raw provider payload,
     and it is the only place fenced parsing may be invoked.
  4. Assert the removal path in a test: with the flag off and a non-empty tool list, the prompt
     contains no fenced-action instructions and no fenced parsing runs. `#64` deletes this module
     and the `tools.length === 0` prompt branch together.
- **Targeted verification:** `npx vitest --run src/lib/ai/protocol/client.test.ts
  src/stores/chat-store.test.ts` and `npx playwright test e2e/ai-chat.spec.ts`. Discriminating
  assertions: a scripted event sequence containing text, a tool call, usage, and stop produces the
  expected message blocks; an `abort` mid-stream keeps partial text, sets `isStreaming: false`,
  and leaves `error` null; a legacy fenced response still renders an action preview while the flag
  is on.
- **Intent validation:** owner exercises a real BYOK conversation in browser and desktop and
  confirms streaming, stop, error text, and action previews look identical to today.

### 11. Provider contract fixtures, failure modes, and retry policy

- **Behavior:** a deterministic fixture corpus, requiring no key and no network, covers partial
  streams, malformed events, cancellation, rate limits, and retries for both providers and both
  transports. Retries are bounded, apply only to `429`, `5xx`, and transport failures, and only
  before the first protocol event of a turn has been emitted — never mid-stream, because replaying
  after partial text would duplicate output.
- **Files:** `src/lib/ai/providers/test-fixtures/anthropic-*.ts`,
  `src/lib/ai/providers/test-fixtures/openai-*.ts`,
  `src/lib/ai/providers/test-fixtures/fake-stream.ts`,
  `src/lib/ai/protocol/retry.ts`, `src/lib/ai/protocol/contract.test.ts`
- **Implementation:**
  1. Fixtures are hand-authored SSE transcripts matching each provider's documented event shapes,
     stored as frame arrays. They are imported only by tests, so nothing ships in the bundle.
  2. `fakeStream(frames, { splitAt })` builds a `Response` whose `ReadableStream` enqueues bytes
     at caller-chosen offsets with no timers, and `fakeTauriTransport(frames)` replays the same
     frames through the `ai:stream-frame` shape. Stub `fetch` with `vi.stubGlobal`, matching the
     existing convention in `src/stores/model-store.test.ts`.
  3. Corpus, run against both providers and both transports:
     - **partial stream** — split mid-line, mid-JSON, and mid-multi-byte UTF-8; stream ends
       without a terminal event.
     - **malformed events** — invalid JSON in `data:`, unknown event type, `tool_use` with
       unparseable accumulated arguments, a `tool_result` id with no matching call.
     - **cancellation** — abort mid-stream; assert a terminal `aborted`, zero events afterwards,
       and that the reader was cancelled / `cancel_ai_stream` was invoked with the right id.
     - **rate limits** — HTTP 429 with `retry-after`; assert a `rate_limited` error carrying
       `retryAfterMs` and a redacted, truncated detail.
     - **retries** — inject `delay` and a deterministic clock; assert the attempt count, that a
       `400` is not retried, and that a `429` arriving *after* the first `text_delta` is surfaced
       rather than retried.
  4. Every fixture asserts that no assertion is vacuous: each case checks the emitted event
     sequence, not merely that no exception was thrown.
- **Targeted verification:** `npx vitest --run src/lib/ai`. The unterminated-stream case must
  produce `malformed_stream`, not a silent `message_stop` — a success-shaped fallback there would
  be indistinguishable from a truncated model answer.
- **Intent validation:** owner confirms the retry policy matches expected BYOK cost behavior and
  that no fixture was recorded from a live account.

### 12. Protocol knowledge document

- **Behavior:** `#62` and `#64` can be implemented from a written contract rather than by reading
  the implementation.
- **Files:** `docs/knowledge/ai-protocol.md`, `docs/knowledge/architecture.md`
- **Implementation:** document the message and event model, the transport split and why the key
  stays in Rust, the tool-definition and schema-generation contract, the budgeting invariant, the
  error taxonomy and redaction rule, the fixture corpus, and the exact removal steps for the
  fenced compatibility boundary. Link it from the AI section of `architecture.md`. Describe
  behavior; do not restate code.
- **Targeted verification:** every referenced path and issue number resolves.
- **Intent validation:** owner confirms an implementer picking up `#62` needs no rediscovery.

## Cross-cutting requirements

- **Security and privacy:** BYOK is unchanged. Keys stay in `KeyStorage` on desktop and in
  `localStorage` in the browser, requests go directly to the provider, and no ThreatForge account,
  proxy, or telemetry is introduced. Step 9 makes the desktop key boundary a compile-time
  property by deleting `getKey` from the shared adapter. Rust owns the endpoint and auth headers;
  the frontend cannot supply either. Request bodies are size-capped and shape-checked before
  transmission. Provider error detail is redacted and truncated before it reaches the UI or
  storage. Model output is `unknown` until it passes a generated schema, and step 2 closes the
  existing `updates`-spread injection. The CSP and the least-privilege capability set are
  unchanged; step 9 adds a drift test over the endpoint allowlist. No new Rust dependency, so
  `cargo ... --frozen` stays valid; one new frontend dependency (`zod`) with a regenerated
  lockfile.
- **`.thf` compatibility:** none. No schema field, version, serializer, or migration changes.
  Persisted chat sessions are not `.thf` content; step 1 keeps existing `localStorage` sessions
  readable via `upgradeLegacyMessage`, and `#63` owns the eventual storage move.
- **Browser and desktop:** parity is achieved by one client, one decoder, one mapper pair, and one
  prompt, with two transports. The only intentional difference is where the key lives and who
  performs the HTTPS request. Step 5's guard test and step 9's drift test make regression to
  duplicated logic a failing check rather than a review observation.
- **AI safety:** tool inputs are validated against generated schemas before any consumer sees
  them; validation failures produce structured issues intended for model correction in `#62`. No
  execution, approval, or undo behavior changes here — the fenced path keeps its existing
  per-action and batch application with its existing undo snapshots. Cancellation is a first-class
  terminal event rather than an error. Prompt-injected text cannot introduce a tool, because the
  advertised tool list is constructed locally from the registry.
- **Accessibility and UX:** no new UI surfaces. Preserve the existing streaming spinner, empty
  state, no-API-key state, error banner, and stop control in
  `src/components/panels/ai-chat-tab.tsx`. New error taxonomy entries must render as actionable
  user-safe sentences (missing key, unsupported model capability, rate limited, network failure)
  rather than raw provider text.
- **Observability and evidence:** never log request bodies, message content, or key material.
  Capture the cross-provider event-equality test output and the before/after chat screenshots for
  browser and desktop in the PR. Record fixture provenance (documented provider event shapes,
  hand-authored, no live recording).

## Verification gate

Targeted, while iterating:

```bash
npx vitest --run src/lib/ai
npx vitest --run src/lib/ai-actions.test.ts src/lib/ai-prompt.test.ts
npx vitest --run src/lib/adapters src/stores/chat-store.test.ts
npx tsc --noEmit
cargo test --manifest-path src-tauri/Cargo.toml ai::
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
npm run check:lockfile
```

Before handoff:

```bash
npm run ci:local
npx playwright test e2e/ai-chat.spec.ts
```

Run `npm run ci:docker` before handoff as well, because this change touches the Rust IPC surface
and adds a frontend dependency.

## Owner validation

Green CI cannot decide any of the following.

- **Live BYOK still works.** Run a real conversation on desktop and in the browser with a real key
  for both providers. CI proves the protocol against fixtures only; it cannot prove the request
  bodies are accepted by the live APIs.
- **The relay tradeoff.** Desktop now receives raw provider frames in the webview so that decoding
  is shared. Confirm this is the right call versus keeping a second Rust decoder.
- **Stricter update payloads.** Model output that previously set arbitrary fields (including `id`)
  through `update_*` is now rejected. Confirm nothing you relied on regressed, and that rejected
  actions surface visibly instead of silently disappearing.
- **Unknown-model policy.** A stale model id still allows plain chat but refuses tool use.
  Confirm that is the desired failure mode rather than blocking chat entirely.
- **Prompt fidelity.** The prompt text is intended to be unchanged for today's fenced behavior.
  Compare a real assistant response before and after; a plausible-but-wrong outcome is a
  subtly reworded prompt that quietly degrades threat quality.
- **The compatibility boundary is genuinely bounded.** Confirm `#64` can delete
  `src/lib/ai/legacy/fenced-actions.ts` and one prompt branch, and that nothing else in the tree
  parses assistant prose.
- **Dependency acceptance.** `zod` becomes a runtime frontend dependency.

## Specialist review

- [ ] PR reviewer
- [ ] Slop auditor — pay particular attention to whether `defineTool` has a real consumer at
      merge time (it does: the twelve legacy action schemas and `extractActions`), and whether any
      failure path is success-shaped
- [ ] Security auditor — IPC contract change, key boundary narrowing, endpoint/header ownership,
      body validation, provider-error redaction, stream identity
- [ ] Threat-model expert — the STRIDE category/severity enums and the tightened `update_*`
      mutation semantics move into generated schemas

## Coordination and contention

`#53` (document registry) is being planned concurrently and will hold per-document AI **session
references**. Expected contention:

| File | `#61` change | `#53` change | Rule |
|------|--------------|--------------|------|
| `src/stores/chat-store.ts` | `sendMessage` internals, event consumption, group-atomic cap, one-line `AiProvider` re-export | session ownership moves to the document registry | `#61` must not rename actions/exports and must not touch `getStorageKey`, `loadSessionsForFile`, `newSession`, `switchSession`, `deleteSession`, or `migrateSessionKey` |
| `src/types/chat-session.ts` | none (message shape changes live in the protocol module) | document-id keying | `#61` leaves this file alone |
| `src/components/panels/ai-chat-tab.tsx` | route fenced parsing through the legacy boundary | possible document scoping | small, separable diffs; second to merge rebases |

Whichever issue merges second rebases. `#63` depends on the message shape from step 1 and must not
be started before it lands.

## Replan log

| Date | Change | Evidence and reason |
|------|--------|---------------------|
| 2026-07-21 | Initial plan | Issue `#61`, parent `#46`, roadmap Phase 3, and direct reading of `src/lib/adapters/{chat-adapter,browser-chat-adapter,tauri-chat-adapter}.ts`, `src/lib/{ai-actions,ai-action-executor,ai-prompt,ai-models,ai-utils}.ts`, `src/stores/chat-store.ts`, `src-tauri/src/ai/{types,providers,prompt}.rs`, `src-tauri/src/commands/ai_commands.rs`, `src-tauri/src/lib.rs`, `src-tauri/tauri.conf.json`, and `src-tauri/src/mcp/server.rs` |
| 2026-07-21 | Autonomy recorded as `Automatable` | PR `#96` renames `agent-ready`/`human-blocked` to `Automatable`/`HITL`; the issue already carries the `Automatable` label. `docs/plans/0000-template.md` still shows the old vocabulary and is expected to follow. |
