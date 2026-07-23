# ThreatForge — AI conversation protocol

The AI stack speaks one provider-neutral, platform-neutral protocol. A single
TypeScript implementation maps every Anthropic and OpenAI response onto the same
typed event stream, budgets and validates every request before it leaves the
machine, and keeps the desktop API key inside Rust. This document describes that
contract so that the bounded tool loop ([`#62`](https://github.com/exit-zero-labs/threat-forge/issues/62))
and the native graph tool registry ([`#64`](https://github.com/exit-zero-labs/threat-forge/issues/64))
can be built from a written spec rather than by reading the implementation.

It describes behavior and the reasons behind it. The types and functions named
here are the source of truth for their own signatures; the plan that introduced
the protocol is [`docs/plans/61-ai-conversation-protocol.md`](../plans/61-ai-conversation-protocol.md).

## Scope and invariants

- **BYOK, direct-to-provider, no ThreatForge backend.** Requests go straight to
  `api.anthropic.com` or `api.openai.com` over HTTPS with the user's own key. No
  proxy, account, or telemetry is introduced.
- **One implementation, two transports.** Provider decoding, request shaping,
  budgeting, the system prompt, and the error taxonomy are shared code. The only
  platform-specific piece is the transport — who holds the key and who performs
  the HTTPS request.
- **Model output is untrusted until it passes a generated schema.** A tool call's
  arguments are `unknown` everywhere except the one parser that validates them.
- **Failures fail closed and never leak secrets.** A provider error body is
  redacted and length-capped before it can reach the UI, logs, or storage.

Out of scope here, and owned elsewhere: the tool-execution loop, approval modes,
and undo (`#62`); native graph tool definitions (`#64`); IndexedDB conversation
persistence (`#63`); and user-configurable or self-hosted base URLs.

## The message model

`src/lib/ai/protocol/messages.ts` defines a turn as a list of content blocks
rather than a string, so text, tool calls, and tool results can share one message
without being encoded into prose:

- A `ProtocolMessage` is `{ role: "user" | "assistant"; content: ContentBlock[] }`.
- A `ContentBlock` is a `TextBlock`, a `ToolCallBlock`, or a `ToolResultBlock`.
- `ToolCallBlock.input` is deliberately `unknown`. Reading it as a validated
  value is only possible through `ToolDefinition.parseInput` (see below).
- The **system prompt is not a message**. Anthropic carries it as a top-level
  field and OpenAI as a leading message, so keeping it out of `ProtocolMessage`
  stops that divergence from leaking into every consumer.

`upgradeLegacyMessage` reads a pre-protocol `{ role, content: string }` session
into block form, and `flattenText` collapses a message back to a display string
byte-for-byte, so `localStorage` chat sessions written by earlier builds stay
readable. `assertToolPairing` reports every tool-call/tool-result pairing
violation in a complete history; it is the invariant truncation must preserve,
not a happy-path guard.

## The event vocabulary

`src/lib/ai/protocol/events.ts` defines the `StreamEvent` discriminated union —
the only vocabulary a consumer ever sees:

`message_start`, `text_delta`, `tool_call_start`, `tool_call_input_delta`,
`tool_call_complete`, `usage`, `message_stop` (carrying a `stopReason`), `error`,
and `aborted`.

Two logically identical responses from the two providers must produce an
identical `StreamEvent` sequence. That equality is asserted directly in the
provider tests and in the fixture corpus.

Terminality rules that matter to a consumer:

- **Cancellation is `aborted`, never `error`.** A user stop keeps whatever text
  arrived and must not render as a failure banner.
- **A mapper-emitted `malformed_stream` `error` is a non-terminal notice** scoped
  to the one undecodable frame, orphan fragment, or dropped tool call it reports;
  the mapper keeps going. An `error` with any other code is terminal, because the
  provider closes the stream after it.
- **A truncated stream is a failure, not a short success.** If the provider closes
  the body without the mapper ever emitting a terminal event, the client emits a
  `malformed_stream` error rather than letting a cut-off answer look finished.

## Request preflight and model capabilities

Model capabilities live on the curated model list in `src/lib/ai-models.ts`
(`toolCalling`, `parallelToolCalls`, `streaming`, `maxInputTokens`) so a
capability and the model it describes cannot drift apart. `resolveCapabilities`
returns `{ known: true, capabilities } | { known: false }`.

`preflightRequest` (`src/lib/ai/protocol/request.ts`) runs before any network
call and throws `unsupported_capability` when tools are requested against a model
that cannot call them, or against an unknown model id. A **text-only** request
against an unknown model id is still allowed — a stale settings value should not
block plain chat — which is today's behavior.

## Context budgeting

`budgetMessages` (`src/lib/ai/protocol/budget.ts`) drops history oldest-first at
**turn-group granularity**. A turn group is an assistant message that opens one or
more tool calls together with every later message whose `tool_result` blocks
answer them; groups are indivisible. This is the invariant a naive tail slice
breaks: cutting through a group produces a history where a `tool_result` has no
matching `tool_call`, which both providers reject. If the newest group alone
exceeds the window, budgeting returns a typed `context_overflow` error rather than
an unpairable history. `capMessageHistory` applies the same group-atomic rule when
the chat store persists a session, so a saved session can never be unpairable.

Tokens are **estimated** (characters ÷ 4 plus a fixed per-message overhead), not
counted. The estimate is deliberately dependency-free and conservative; a request
that fits locally can still overflow at the provider, which surfaces as a
`context_overflow` error from the stream rather than silent truncation.

## Provider mappers and the shared decoder

`src/lib/ai/providers/sse.ts` is the one byte-level SSE decoder. It accepts
arbitrary chunk boundaries — mid-line, mid-JSON, mid-multi-byte-UTF-8 — and emits
complete `{ event, data }` frames, holding a trailing partial line until a later
chunk finishes it. It fails closed (`malformed_stream`) on an unterminated line
that exceeds a fixed buffer cap, the one failure shape no downstream guard could
otherwise observe.

`src/lib/ai/providers/anthropic.ts` and `src/lib/ai/providers/openai.ts` are the
only modules that may mention a provider's wire shapes. Each builds its request
body from the neutral `ProviderChatRequest` and maps its stream onto
`StreamEvent`s. The divergence between Anthropic's `tool_result` blocks and
OpenAI's `role: "tool"` messages is confined to these two files. Shared finishing
logic lives in `src/lib/ai/providers/mapper-events.ts`: a tool call's streamed
JSON fragments are concatenated and parsed exactly once, and a fragment set that
never parses drops that one call with a `malformed_stream` notice without aborting
the turn. Tool definitions are advertised without OpenAI `strict` mode, which is
deferred to `#64`.

## The transport split, and why the key stays in Rust

`ChatTransport.open(request, callbacks, signal)` in
`src/lib/adapters/chat-adapter.ts` is the only platform-specific interface left.
Both implementations are transport-only: they carry a provider-shaped body to the
provider and relay SSE frames back, and neither knows a provider's event protocol.

- **Browser** (`src/lib/adapters/browser-chat-adapter.ts`): reads the key from
  `localStorage`, fetches the endpoint from the frozen table in
  `src/lib/adapters/provider-endpoints.ts` with the mapper's headers, refuses
  redirects (so a 3xx cannot re-send the key to another origin), enforces a
  per-gap read timeout and a total-bytes budget, and streams the body through the
  shared decoder.
- **Desktop** (`src/lib/adapters/tauri-chat-adapter.ts`): calls
  `start_ai_stream({ provider, body, streamId })`, subscribes to
  `ai:stream-frame`/`ai:stream-closed`, **filters every event by `streamId`**, and
  routes a stop to `cancel_ai_stream(streamId)`. The frontend supplies no URL and
  no header.

The reason the key stays in Rust is separation of concerns, not decoding: the only
thing Rust must own is the credential and the endpoint/auth headers built from it
(`endpoint_for`, `auth_headers`, `validate_body`, and `redact_provider_detail` in
`src-tauri/src/ai/providers.rs`). Rust relays raw SSE frames to the webview and the
same TypeScript decoder maps them, so there is one decoder rather than two kept in
agreement. Desktop already received raw provider error text before this design, so
no secret crosses a boundary it did not already cross — but it makes redaction
mandatory, in Rust, before frames leave the process. The desktop key boundary is a
compile-time property: the shared `KeychainAdapter` interface does not declare
`getKey`, so desktop code cannot ask for a key.

Three places must name the same origins — the TypeScript endpoint table, the Rust
constants, and the Tauri CSP `connect-src` allowlist — and
`src/lib/adapters/provider-endpoints.test.ts` reads the other two from disk and
fails on drift.

`TransportFailureReason` (`network`, `malformedStream`, `responseTooLarge`) is the
discriminator the retry policy and the client branch on; nothing branches by
matching an error message.

## Retry policy

`src/lib/ai/protocol/retry.ts` wraps a transport with bounded retry.
`createRetryingTransport(inner, policy, options)` returns a `ChatTransport`, and
`src/lib/adapters/get-chat-transport.ts` wraps both platform transports with it so
retry behaves identically on both. Retry is a transport concern, deliberately not
a store one: it must never run after the store has begun rendering a partial turn.

Two constraints bound it:

- **Only before the first protocol event of the turn has reached the consumer.**
  The decorator commits on the first frame it forwards to the client — which is at
  or before the first protocol event the client maps from it — and never retries
  after that. Replaying after any output would duplicate it. This is why the retry
  lives below the client and not in a store loop.
- **Only for transient failures.** A `429`, any `5xx`, and a below-HTTP `network`
  failure are retried (`isRetriableHttpStatus`, `isRetriableTransportReason`).
  A `4xx` other than `429`, a `malformedStream`, a `responseTooLarge`, and every
  up-front refusal (`ChatTransport.open` rejecting for a missing key or a relay
  refusal) are surfaced on the first attempt.

The default policy (`DEFAULT_RETRY_POLICY`) is three attempts with exponential
backoff capped at ten seconds. A provider `retry-after` hint is honored when
present and is never shortened below the computed backoff. The backoff has no
jitter, so the schedule is deterministic and testable; the sleep is injectable so
tests advance without real time.

## Error taxonomy and redaction

`src/lib/ai/protocol/errors.ts` defines a **closed** `ProtocolErrorCode` union —
`unsupported_capability`, `no_api_key`, `http_status`, `rate_limited`,
`transport`, `malformed_stream`, `context_overflow`, `cancelled` — so every
surface has to decide what each failure means to a user. A `ProtocolError`
carries a one-sentence `message` authored by ThreatForge (safe to render, log,
and persist) and an optional `providerDetail`.

`redactProviderDetail` masks key-shaped tokens (`sk-…`, case-insensitive) and then
caps the result at 200 characters, mask-before-truncate so a cut cannot leave a
recognizable key prefix. Provider text is assumed to contain key material until
proven otherwise — an OpenAI 401 body echoes the submitted key. The desktop relay
applies the same rule in Rust before frames cross the IPC boundary.

## The protocol client

`streamConversation(request, transport, handlers, signal)` in
`src/lib/ai/protocol/client.ts` runs one turn to a terminal event: preflight,
budgeting, provider mapping, the transport, and decoding, emitting nothing but
`StreamEvent`s. It resolves — never rejects — for every expected protocol
outcome: preflight, budgeting, HTTP, transport, and up-front refusals all arrive
as `error` events, and a stop arrives as `aborted`. It isolates the consumer
callback so a throw from `onEvent` cannot tear down the stream on either platform,
and it is where a `done` close with no terminal mapper event becomes a
`malformed_stream` error.

The chat store (`src/stores/chat-store.ts`) consumes those events: `text_delta`
appends to the last assistant message's text block, `tool_call_complete` appends a
tool-call block, `usage` and `stopReason` are recorded on the message, and `error`
maps to the existing error banner through the authored `message`.

## The fenced compatibility boundary

Until native tool calling exists, the model still expresses edits and threats as
fenced ` ```actions ` / ` ```threats ` blocks inside its answer text.
`src/lib/ai/legacy/fenced-actions.ts` is the **only** place that fenced text may
be parsed, and it consumes only accumulated `text_delta` output — never a raw
provider payload or a tool-call block. `buildSystemPrompt`
(`src/lib/ai-prompt.ts`) emits the fenced-action instructions only when the tool
list is empty.

`#64` removes the whole path in one move: flip `LEGACY_FENCED_ACTIONS_ENABLED` to
`false`, delete `src/lib/ai/legacy/fenced-actions.ts`, and drop the
`tools.length === 0` branch of `buildSystemPrompt`. Nothing else in the tree
parses assistant prose, so those are the complete removal steps.

## The fixture corpus

`src/lib/ai/providers/test-fixtures/` holds hand-authored SSE transcripts written
from each provider's documented event shapes — no fixture is recorded from a live
account — stored as frame arrays and imported only by tests, so nothing ships in
the bundle. `src/lib/ai/providers/test-fixtures/fake-stream.ts` turns a fixture
into a byte-split `fetch` `Response` for the browser path (`fakeStream`) and
replays the same frames through the desktop relay event shape (`replayTauriFrames`),
so one corpus drives both transports.

`src/lib/ai/protocol/contract.test.ts` runs the corpus against both providers and
both transports and asserts the whole emitted event sequence for each case: a
complete text and tool-call response, byte-split partial streams, a truncated
stream that must report `malformed_stream`, malformed events (invalid JSON, an
unknown event type, unparseable tool arguments, an orphan tool-input fragment), an
in-stream rate limit with redacted detail, cancellation, an HTTP 429 with a
`retry-after` hint, and the retry cases — a transient failure before the first
event retries and then succeeds, a failure after the first `text_delta` is
surfaced rather than retried, a non-retriable `4xx` is not retried, and the retry
bound is respected.

## Where each concern is verified

Every test file colocates with the implementation it exercises.

| Concern | Implementation | Tests |
|---------|----------------|-------|
| Message model, pairing, legacy upgrade | `src/lib/ai/protocol/messages.ts` | `src/lib/ai/protocol/messages.test.ts` |
| Tool schema generation and validation | `src/lib/ai/protocol/tools.ts`, `src/lib/ai/schemas/actions.ts` | `src/lib/ai/protocol/tools.test.ts`, `src/lib/ai/schemas/actions.test.ts`, `src/lib/ai-actions.test.ts` |
| Preflight and capabilities | `src/lib/ai/protocol/request.ts`, `src/lib/ai-models.ts` | `src/lib/ai/protocol/request.test.ts` |
| Budgeting | `src/lib/ai/protocol/budget.ts` | `src/lib/ai/protocol/budget.test.ts` |
| SSE decoder and mappers | `src/lib/ai/providers/sse.ts`, `src/lib/ai/providers/anthropic.ts`, `src/lib/ai/providers/openai.ts`, `src/lib/ai/providers/mapper-events.ts` | `src/lib/ai/providers/sse.test.ts`, `src/lib/ai/providers/anthropic.test.ts`, `src/lib/ai/providers/openai.test.ts` |
| Transports and the key boundary | `src/lib/adapters/browser-chat-adapter.ts`, `src/lib/adapters/tauri-chat-adapter.ts`, `src/lib/adapters/chat-adapter.ts` | `src/lib/adapters/browser-chat-adapter.test.ts`, `src/lib/adapters/tauri-chat-adapter.test.ts`, `src/lib/adapters/provider-endpoints.test.ts` |
| Rust relay and redaction | `src-tauri/src/ai/providers.rs`, `src-tauri/src/commands/ai_commands.rs` | `cargo test --manifest-path src-tauri/Cargo.toml ai::` |
| Retry policy | `src/lib/ai/protocol/retry.ts` | `src/lib/ai/protocol/contract.test.ts` |
| Error taxonomy and redaction | `src/lib/ai/protocol/errors.ts` | `src/lib/ai/protocol/errors.test.ts` |
| Client orchestration and truncation | `src/lib/ai/protocol/client.ts` | `src/lib/ai/protocol/client.test.ts` |
| Fixture corpus, failure modes | `src/lib/ai/providers/test-fixtures/` | `src/lib/ai/protocol/contract.test.ts` |
| Store event consumption | `src/stores/chat-store.ts` | `src/stores/chat-store.test.ts` |
