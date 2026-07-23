//! Rust relay transport for AI provider streams (issue #61 step 8).
//!
//! Rust owns the endpoint URL and the auth headers — and therefore the API
//! key — while the frontend builds the provider-shaped request body and
//! decodes the relayed frames. The relay deliberately understands nothing of
//! either provider's event protocol: it splits the response into SSE frames
//! and forwards them verbatim, so the shared TypeScript mappers (issue #61
//! steps 6–7) are the single decoding implementation on both platforms.
//!
//! The SSE framing here must stay behavior-equivalent to
//! `src/lib/ai/providers/sse.ts`: one frame per `data: ` line, a `"message"`
//! default event name that resets after each dispatch, field prefixes that
//! require the space after the colon, and a fail-closed cap on unterminated
//! lines.

use crate::ai::types::{
    AiProvider, StreamClosedPayload, StreamFramePayload, StreamOutcome, TransportFailureReason,
};
use futures::StreamExt;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE, RETRY_AFTER};
use reqwest::{Client, Response, StatusCode};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use tauri::{AppHandle, Emitter};
use thiserror::Error;

pub const ANTHROPIC_API_URL: &str = "https://api.anthropic.com/v1/messages";
pub const OPENAI_API_URL: &str = "https://api.openai.com/v1/chat/completions";

const STREAM_FRAME_EVENT: &str = "ai:stream-frame";
const STREAM_CLOSED_EVENT: &str = "ai:stream-closed";

/// The event name SSE assigns to a frame whose stream named none. Mirrors
/// `DEFAULT_EVENT` in `src/lib/ai/providers/sse.ts`.
const DEFAULT_EVENT_NAME: &str = "message";

/// Upper bound on one serialized request body. Step 4's context budgeting
/// keeps a maximal 200k-token conversation near 1 MiB of JSON, so 10 MiB is
/// roughly an order of magnitude of headroom; the cap exists to stop a buggy
/// or hostile webview from making Rust buffer and POST an arbitrarily large
/// body, not to police legitimate conversations.
const MAX_REQUEST_BODY_BYTES: usize = 10 * 1024 * 1024;

/// Total bytes one stream may relay into the webview before the relay fails
/// closed. A maximal legitimate response — tens of thousands of output tokens
/// wrapped in per-token SSE event overhead — stays under about 10 MiB, so
/// 50 MiB cannot trip on real use while still bounding what a hostile or
/// broken provider can push through the IPC boundary to a fixed cost.
const MAX_STREAM_RESPONSE_BYTES: usize = 50 * 1024 * 1024;

/// Most streams that may be live at once. Each accepted stream costs a
/// provider connection, a relay task, and up to [`MAX_STREAM_RESPONSE_BYTES`]
/// of relayed bytes, so the multiplier is bounded even if the webview
/// misbehaves. Real use is one stream per document conversation; 8 leaves
/// multi-document headroom.
const MAX_LIVE_STREAMS: usize = 8;

/// Longest partial SSE line buffered before failing closed. Mirrors
/// `MAX_BUFFERED_LINE_LENGTH` in `src/lib/ai/providers/sse.ts`, with one
/// deliberate unit difference: this cap counts UTF-8 bytes while the TS
/// decoder counts UTF-16 code units of the decoded string, so on non-ASCII
/// garbage the relay fails closed up to a factor earlier. Both are fail-closed
/// rejections of a stream that is not speaking SSE; real provider data lines
/// are a few KiB.
const MAX_BUFFERED_LINE_BYTES: usize = 1_048_576;

/// How much of a non-success response body is read to build
/// `provider_detail`. The retained detail is capped at 200 UTF-16 units after
/// redaction, so 16 KiB is generous; the bound exists because an error body is
/// still provider-controlled and must not be read without limit.
const MAX_ERROR_BODY_BYTES: usize = 16 * 1024;

/// Longest accepted `stream_id`. Ids are frontend-generated (UUID-sized);
/// the cap only bounds a malfunctioning caller.
const MAX_STREAM_ID_CHARS: usize = 128;

/// Longest provider-supplied detail retained after redaction, counted in
/// UTF-16 code units to match `PROVIDER_DETAIL_MAX_LENGTH` and JS
/// `String.length` in `src/lib/ai/protocol/errors.ts` exactly.
const PROVIDER_DETAIL_MAX_UTF16_UNITS: usize = 200;

/// Literal that replaces every masked key token. Must match the TypeScript
/// redaction in `src/lib/ai/protocol/errors.ts`.
const KEY_MASK: &str = "[redacted-key]";

/// Typed relay failures.
///
/// Every `Display` string is user-safe: authored here, no provider text, no
/// key material, no raw internal error. `to_string()` is therefore the only
/// mapping applied at the Tauri command boundary.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum RelayError {
    #[error("the AI request body must be a JSON object")]
    BodyNotObject,
    #[error("the AI request body must include a non-empty string `model`")]
    InvalidModel,
    #[error("the AI request body must set `stream` to true")]
    NotStreaming,
    #[error("the AI request body exceeds the maximum allowed size")]
    BodyTooLarge,
    #[error("the AI request body could not be serialized")]
    BodyUnserializable,
    #[error("the stored API key contains characters that cannot be sent in an HTTP header")]
    KeyNotHeaderSafe,
    /// The refusal `start_ai_stream` returns when no credential is stored.
    /// `src/lib/adapters/tauri-chat-adapter.ts` matches this exact sentence to
    /// raise the same `no_api_key` protocol code the browser transport raises,
    /// and its test reads this file to catch drift.
    #[error("no API key is configured for this provider — add one in AI Settings")]
    NoApiKey,
    /// Any other key-storage failure. Deliberately says nothing about the
    /// underlying fault: `ThreatForgeError`'s `Display` names internal state
    /// (the storage key, a poisoned lock's payload) and must not reach the UI.
    #[error("the stored API key could not be read")]
    KeyUnavailable,
    #[error("streamId must be a non-empty string of at most 128 characters")]
    InvalidStreamId,
    #[error("a stream with this id is already running")]
    DuplicateStreamId,
    #[error("too many AI streams are running — stop one before starting another")]
    TooManyStreams,
    #[error("the provider stream sent an unterminated line too long to be a real event")]
    UnterminatedLine,
    #[error("the provider response exceeded the streaming size limit")]
    ResponseTooLarge,
}

type StreamMap = HashMap<String, Arc<AtomicBool>>;

/// Live relayed streams keyed by stream id, each with its own cancel flag.
///
/// Replaces the previous process-wide `Arc<AtomicBool>`, under which
/// cancelling an older stream after a newer one had started stopped the newer
/// stream too. Entries are inserted by `register` when a stream is accepted
/// and removed by `remove` when it completes, so the map only ever holds live
/// streams.
#[derive(Clone, Default)]
pub struct AiStreamRegistry {
    streams: Arc<Mutex<StreamMap>>,
}

impl AiStreamRegistry {
    /// Lock the map, recovering from poisoning. Recovery is sound because the
    /// map carries no invariant beyond "entry present means stream live": a
    /// panicking holder cannot leave an entry half-written, and the worst
    /// stale outcome is a flag that cancels an already-dead stream.
    fn lock(&self) -> MutexGuard<'_, StreamMap> {
        match self.streams.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        }
    }

    /// Register a new live stream and return its cancel flag. Fails if the id
    /// is already live so two streams can never share (and clobber) one flag,
    /// and past [`MAX_LIVE_STREAMS`] so a misbehaving webview cannot multiply
    /// the per-stream connection and byte budgets without bound.
    pub fn register(&self, stream_id: &str) -> Result<Arc<AtomicBool>, RelayError> {
        let mut streams = self.lock();
        if streams.contains_key(stream_id) {
            return Err(RelayError::DuplicateStreamId);
        }
        if streams.len() >= MAX_LIVE_STREAMS {
            return Err(RelayError::TooManyStreams);
        }
        let flag = Arc::new(AtomicBool::new(false));
        streams.insert(stream_id.to_string(), flag.clone());
        Ok(flag)
    }

    /// Set the cancel flag of one stream, leaving every other stream running.
    /// Unknown ids are a no-op: the stream may have completed (and been
    /// removed) between the frontend deciding to cancel and this call landing.
    pub fn cancel(&self, stream_id: &str) {
        if let Some(flag) = self.lock().get(stream_id) {
            flag.store(true, Ordering::SeqCst);
        }
    }

    /// Set every live stream's cancel flag. Exists only for the deprecated
    /// `cancel_chat_stream` alias, whose legacy caller runs at most one stream
    /// at a time; deleted with it in issue #61 step 10.
    pub fn cancel_all(&self) {
        for flag in self.lock().values() {
            flag.store(true, Ordering::SeqCst);
        }
    }

    /// Forget a completed stream so its id can be reused and the map cannot
    /// grow without bound.
    pub fn remove(&self, stream_id: &str) {
        self.lock().remove(stream_id);
    }
}

/// The endpoint Rust selects for a provider. The frontend never supplies a
/// URL; these constants are also read by the step 9 endpoint-drift test, which
/// asserts they agree with the TS endpoint table and the CSP allowlist.
pub fn endpoint_for(provider: &AiProvider) -> &'static str {
    match provider {
        AiProvider::Anthropic => ANTHROPIC_API_URL,
        AiProvider::OpenAi => OPENAI_API_URL,
    }
}

/// Build the auth headers for a provider request.
///
/// This is the only place the API key may appear. Header values carrying the
/// key are marked sensitive so `Debug` formatting cannot print them, and the
/// error for an unsendable key names the problem without echoing the value.
pub fn auth_headers(provider: &AiProvider, api_key: &str) -> Result<HeaderMap, RelayError> {
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    match provider {
        AiProvider::Anthropic => {
            let mut key =
                HeaderValue::from_str(api_key).map_err(|_| RelayError::KeyNotHeaderSafe)?;
            key.set_sensitive(true);
            headers.insert("x-api-key", key);
            headers.insert("anthropic-version", HeaderValue::from_static("2023-06-01"));
        }
        AiProvider::OpenAi => {
            let mut key = HeaderValue::from_str(&format!("Bearer {api_key}"))
                .map_err(|_| RelayError::KeyNotHeaderSafe)?;
            key.set_sensitive(true);
            headers.insert(AUTHORIZATION, key);
        }
    }
    Ok(headers)
}

/// Validate a frontend-built request body and return the exact bytes to POST.
///
/// The body is frontend-controlled and crosses the IPC boundary, so it is
/// shape-checked here regardless of what the frontend promised: it must be a
/// JSON object, must name a non-empty `model`, and must serialize to no more
/// than `MAX_REQUEST_BODY_BYTES`.
pub fn validate_body(body: &serde_json::Value) -> Result<Vec<u8>, RelayError> {
    if !body.is_object() {
        return Err(RelayError::BodyNotObject);
    }
    match body.get("model").and_then(serde_json::Value::as_str) {
        Some(model) if !model.trim().is_empty() => {}
        _ => return Err(RelayError::InvalidModel),
    }
    // The relay only makes sense for streams: a non-streaming body would make
    // the provider return one JSON document, which SSE framing discards as an
    // unterminated line and reports as a confusing zero-frame `Done`.
    if body.get("stream") != Some(&serde_json::Value::Bool(true)) {
        return Err(RelayError::NotStreaming);
    }
    let bytes = serde_json::to_vec(body).map_err(|_| RelayError::BodyUnserializable)?;
    if bytes.len() > MAX_REQUEST_BODY_BYTES {
        return Err(RelayError::BodyTooLarge);
    }
    Ok(bytes)
}

/// Validate a frontend-supplied stream id before it keys any state.
pub fn validate_stream_id(stream_id: &str) -> Result<(), RelayError> {
    if stream_id.is_empty() || stream_id.chars().count() > MAX_STREAM_ID_CHARS {
        return Err(RelayError::InvalidStreamId);
    }
    Ok(())
}

/// `\w` in the reference JavaScript pattern (no `u` flag): ASCII letters,
/// digits, and underscore.
fn is_word_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

/// One character of the key-token body, `[A-Za-z0-9_-]` in the reference
/// pattern.
fn is_token_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_' || c == '-'
}

/// Mask every token matching the TypeScript rule `/\bsk-[A-Za-z0-9_-]+/gi`
/// with [`KEY_MASK`]. The word boundary keeps `task-123` and `desk-check`
/// untouched; case-insensitivity catches keys uppercased by a proxy or log
/// formatter in between.
fn mask_key_tokens(input: &str) -> String {
    let chars: Vec<char> = input.chars().collect();
    let mut out = String::with_capacity(input.len());
    let mut i = 0usize;
    while i < chars.len() {
        let at_word_boundary = i == 0 || !is_word_char(chars[i - 1]);
        let starts_key_token = at_word_boundary
            && i + 3 < chars.len()
            && chars[i].eq_ignore_ascii_case(&'s')
            && chars[i + 1].eq_ignore_ascii_case(&'k')
            && chars[i + 2] == '-'
            && is_token_char(chars[i + 3]);
        if starts_key_token {
            let mut end = i + 3;
            while end < chars.len() && is_token_char(chars[end]) {
                end += 1;
            }
            out.push_str(KEY_MASK);
            i = end;
            continue;
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

/// Make provider-supplied text safe to carry as `provider_detail`.
///
/// Mirrors `redactProviderDetail` in `src/lib/ai/protocol/errors.ts` exactly:
/// key-shaped tokens are masked **before** truncation — the order is a
/// security property, because truncating first could cut a key in half and
/// leave a recognizable prefix the mask would no longer match — and the
/// result is then capped at 200 UTF-16 code units plus a trailing `…`.
/// Counting UTF-16 units (not bytes, not scalars) reproduces JS
/// `String.length` including its surrogate-pair guard: a supplementary-plane
/// character that would straddle the cap is dropped whole, never split.
/// Building the truncation from `chars()` also means no byte-index slicing,
/// so a multi-byte character at the cap can never panic.
pub fn redact_provider_detail(detail: &str) -> String {
    let masked = mask_key_tokens(detail);
    let total_units: usize = masked.chars().map(char::len_utf16).sum();
    if total_units <= PROVIDER_DETAIL_MAX_UTF16_UNITS {
        return masked;
    }
    let mut out = String::with_capacity(PROVIDER_DETAIL_MAX_UTF16_UNITS + 4);
    let mut units = 0usize;
    for c in masked.chars() {
        let width = c.len_utf16();
        if units + width > PROVIDER_DETAIL_MAX_UTF16_UNITS {
            break;
        }
        out.push(c);
        units += width;
    }
    out.push('…');
    out
}

/// One complete `{ event, data }` pair split from the byte stream.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SseFrame {
    pub event: String,
    pub data: String,
}

/// Stateful SSE framer holding the partial-line and event-name state of one
/// stream. Byte-oriented so a chunk boundary inside a multi-byte UTF-8
/// sequence is invisible: lines are only converted to text once a `\n` byte —
/// which can never occur inside a multi-byte sequence — completes them.
#[derive(Default)]
struct SseFrameSplitter {
    buffer: Vec<u8>,
    /// The pending `event:` field; `None` means the SSE default, `"message"`.
    event_name: Option<String>,
}

impl SseFrameSplitter {
    /// Feed one network chunk and collect every frame it completed. A trailing
    /// partial line stays buffered until a later chunk finishes it; a partial
    /// line over [`MAX_BUFFERED_LINE_BYTES`] fails closed, because a stream
    /// that never terminates a line is not speaking SSE and would otherwise
    /// grow the buffer forever while emitting nothing.
    fn push(&mut self, chunk: &[u8]) -> Result<Vec<SseFrame>, RelayError> {
        // The retained partial line was already scanned for `\n` by earlier
        // pushes, so the search resumes at the old length: every byte is
        // examined once even when a near-cap line arrives one TCP segment at
        // a time, instead of rescanning the whole buffer per chunk.
        let mut search_from = self.buffer.len();
        self.buffer.extend_from_slice(chunk);
        let mut frames = Vec::new();
        let mut consumed = 0usize;
        while let Some(offset) = self.buffer[search_from..].iter().position(|&b| b == b'\n') {
            let end = search_from + offset;
            let mut line = &self.buffer[consumed..end];
            if line.last() == Some(&b'\r') {
                line = &line[..line.len() - 1];
            }
            // Deliberately lossy: the line is complete, so replacement
            // characters appear only for genuinely invalid provider bytes —
            // the same U+FFFD the browser TextDecoder emits for them.
            if let Some(value) = line.strip_prefix(b"event: ") {
                self.event_name = Some(String::from_utf8_lossy(value).trim().to_string());
            } else if let Some(value) = line.strip_prefix(b"data: ") {
                let event = self
                    .event_name
                    .take()
                    .unwrap_or_else(|| DEFAULT_EVENT_NAME.to_string());
                frames.push(SseFrame {
                    event,
                    data: String::from_utf8_lossy(value).into_owned(),
                });
            }
            // Blank separator lines, `:` comment keep-alives, and other SSE
            // fields (`id:`, `retry:`) carry nothing the mappers consume.
            consumed = end + 1;
            search_from = consumed;
        }
        self.buffer.drain(..consumed);
        if self.buffer.len() > MAX_BUFFERED_LINE_BYTES {
            // Drop the buffer before failing so a caller that survives the
            // error cannot keep growing it (mirrors the TS decoder).
            self.buffer.clear();
            return Err(RelayError::UnterminatedLine);
        }
        Ok(frames)
    }
}

/// Map a provider HTTP failure to a user-safe message.
///
/// Takes only the status code: every string returned here crosses the IPC
/// boundary into the webview as the primary error message, so provider text
/// has no place in it. Redacted provider text travels separately as
/// `provider_detail`.
///
/// The numeric status is rendered with [`StatusCode::as_u16`] rather than the
/// `StatusCode` itself, whose `Display` appends the canonical reason phrase
/// ("401 Unauthorized"). The browser path (`userSafeProviderError` in
/// `src/lib/ai-provider-errors.ts`) only has the number, so formatting the same
/// failure differently per platform is drift the user would see.
fn user_safe_provider_error(provider: &str, status: StatusCode) -> String {
    let reason = match status.as_u16() {
        400 => "the request was rejected as malformed",
        401 => "the API key was rejected — check the key configured for this provider",
        // Not a bad key: OpenAI returns 403 for unsupported country/region, and
        // Anthropic for permission_error. Telling the user to check a key that is
        // fine sends them down the wrong path.
        403 => "the provider refused this request (key permissions or region)",
        404 => "the requested model or endpoint was not found",
        413 => "the request was too large for this model",
        429 => "the rate limit or quota was exceeded — wait and try again",
        500..=599 => "the provider is temporarily unavailable",
        _ => "the request failed",
    };
    format!("{} API error ({}): {reason}", provider, status.as_u16())
}

/// Describe a transport failure without leaking connection detail.
///
/// `reqwest::Error`'s `Display` includes the request URL, and when `HTTPS_PROXY`
/// is set that can be a proxy URL carrying embedded credentials. The failure
/// kind is all the user can act on anyway.
fn user_safe_transport_error(provider: &str, err: &reqwest::Error) -> String {
    let reason = if err.is_timeout() {
        "the request timed out"
    } else if err.is_connect() {
        "could not connect to the provider"
    } else if err.is_decode() || err.is_body() {
        "the provider response could not be read"
    } else {
        "the request could not be completed"
    };
    format!("{provider} request failed: {reason}")
}

/// Longest `retry-after` hint forwarded to the frontend. The header is
/// provider-controlled; clamping here means the step 11 retry policy never
/// has to trust an absurd value that could park retries indefinitely.
const MAX_RETRY_AFTER_MS: u64 = 10 * 60 * 1000;

/// Parse the `retry-after` header's delta-seconds form into milliseconds,
/// clamped to [`MAX_RETRY_AFTER_MS`]. The HTTP-date form is deliberately
/// ignored: both target providers send delta-seconds, and a wrong guess about
/// clock skew is worse than no hint.
fn parse_retry_after(headers: &HeaderMap) -> Option<u64> {
    headers
        .get(RETRY_AFTER)?
        .to_str()
        .ok()?
        .trim()
        .parse::<u64>()
        .ok()
        .map(|seconds| seconds.saturating_mul(1000).min(MAX_RETRY_AFTER_MS))
}

/// Build the typed outcome for a non-success HTTP response. Pure so the
/// redaction and field mapping are unit-testable without a network.
fn http_error_outcome(
    provider_label: &str,
    status: StatusCode,
    retry_after_ms: Option<u64>,
    raw_body: &str,
) -> StreamOutcome {
    let detail = redact_provider_detail(raw_body);
    StreamOutcome::HttpError {
        status: status.as_u16(),
        message: user_safe_provider_error(provider_label, status),
        provider_detail: (!detail.trim().is_empty()).then_some(detail),
        retry_after_ms,
    }
}

/// Track total bytes relayed for one stream, failing closed past
/// [`MAX_STREAM_RESPONSE_BYTES`].
fn add_to_budget(relayed: &mut usize, chunk_len: usize) -> Result<(), RelayError> {
    *relayed = relayed.saturating_add(chunk_len);
    if *relayed > MAX_STREAM_RESPONSE_BYTES {
        return Err(RelayError::ResponseTooLarge);
    }
    Ok(())
}

/// Read at most `cap` bytes of a response body.
///
/// Used only on the non-success path to source `provider_detail`. The body is
/// provider-controlled and can be arbitrarily large, so the read is bounded; a
/// mid-read transport error just truncates the detail, which is still useful.
/// The conversion is deliberately lossy: provider bytes are arbitrary, the cap
/// may land inside a multi-byte sequence, and the result is display-only text
/// that is redacted before it goes anywhere.
async fn read_capped_body(response: Response, cap: usize) -> String {
    let mut stream = response.bytes_stream();
    let mut bytes: Vec<u8> = Vec::new();
    while let Some(chunk) = stream.next().await {
        let Ok(chunk) = chunk else { break };
        let remaining = cap.saturating_sub(bytes.len());
        if remaining == 0 {
            break;
        }
        let take = chunk.len().min(remaining);
        bytes.extend_from_slice(&chunk[..take]);
    }
    String::from_utf8_lossy(&bytes).into_owned()
}

/// Relay one provider stream, emitting `ai:stream-frame` events for each SSE
/// frame and always finishing with exactly one `ai:stream-closed` event
/// carrying the outcome. Infallible by design: every failure becomes a typed
/// outcome, so the caller's registry cleanup cannot be skipped by an early
/// return.
pub async fn run_stream(
    app: &AppHandle,
    provider: &AiProvider,
    headers: HeaderMap,
    body: Vec<u8>,
    stream_id: &str,
    cancel_flag: &AtomicBool,
) {
    let outcome = relay(app, provider, headers, body, stream_id, cancel_flag).await;
    // Emit failures are ignored deliberately: they occur only during webview
    // teardown, when there is no one left to notify.
    let _ = app.emit(
        STREAM_CLOSED_EVENT,
        StreamClosedPayload {
            stream_id: stream_id.to_string(),
            outcome,
        },
    );
}

/// The async network shell: POST, then forward frames until the stream ends,
/// is cancelled, errors, or violates a size bound. All decision logic lives in
/// the pure helpers above.
async fn relay(
    app: &AppHandle,
    provider: &AiProvider,
    headers: HeaderMap,
    body: Vec<u8>,
    stream_id: &str,
    cancel_flag: &AtomicBool,
) -> StreamOutcome {
    let label = provider.label();

    // The cancel flag is only observed when a chunk arrives, so a half-open
    // connection that goes silent must be bounded by the transport itself:
    // without a read timeout, `stream.next()` would pend forever, the
    // terminal `ai:stream-closed` would never fire, and cancellation would
    // set a flag nobody reads. The read timeout is per-gap, not per-request —
    // both providers send keep-alives or frequent chunks well inside it — and
    // a total-request timeout is deliberately absent because a legitimate
    // stream has no bounded duration.
    //
    // Redirects are refused outright: neither streaming endpoint legitimately
    // redirects, and reqwest's default policy re-sends headers cross-host
    // without stripping `x-api-key` (its sensitive-header list covers only
    // `Authorization` and cookies), so a redirecting middlebox or compromised
    // edge could otherwise exfiltrate the Anthropic key. A 3xx now lands in
    // the non-success branch below as a typed `HttpError`.
    let client = match Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .read_timeout(std::time::Duration::from_secs(300))
        .redirect(reqwest::redirect::Policy::none())
        .build()
    {
        Ok(client) => client,
        Err(_) => {
            return StreamOutcome::TransportError {
                message: format!("{label} request failed: the HTTP client could not be created"),
                reason: TransportFailureReason::Network,
            }
        }
    };

    let response = match client
        .post(endpoint_for(provider))
        .headers(headers)
        .body(body)
        .send()
        .await
    {
        Ok(response) => response,
        Err(e) => {
            return StreamOutcome::TransportError {
                message: user_safe_transport_error(label, &e),
                reason: TransportFailureReason::Network,
            }
        }
    };

    if !response.status().is_success() {
        let status = response.status();
        let retry_after_ms = parse_retry_after(response.headers());
        let raw_body = read_capped_body(response, MAX_ERROR_BODY_BYTES).await;
        return http_error_outcome(label, status, retry_after_ms, &raw_body);
    }

    let mut stream = response.bytes_stream();
    let mut splitter = SseFrameSplitter::default();
    let mut relayed_bytes = 0usize;

    while let Some(chunk) = stream.next().await {
        if cancel_flag.load(Ordering::SeqCst) {
            return StreamOutcome::Cancelled;
        }
        let chunk = match chunk {
            Ok(chunk) => chunk,
            Err(e) => {
                return StreamOutcome::TransportError {
                    message: user_safe_transport_error(label, &e),
                    reason: TransportFailureReason::Network,
                }
            }
        };
        if let Err(e) = add_to_budget(&mut relayed_bytes, chunk.len()) {
            return StreamOutcome::TransportError {
                message: e.to_string(),
                reason: TransportFailureReason::ResponseTooLarge,
            };
        }
        let frames = match splitter.push(&chunk) {
            Ok(frames) => frames,
            Err(e) => {
                return StreamOutcome::TransportError {
                    message: e.to_string(),
                    reason: TransportFailureReason::MalformedStream,
                }
            }
        };
        for frame in frames {
            let _ = app.emit(
                STREAM_FRAME_EVENT,
                StreamFramePayload {
                    stream_id: stream_id.to_string(),
                    event: frame.event,
                    data: frame.data,
                },
            );
        }
    }
    // A trailing partial line without its newline is discarded, as the SSE
    // spec requires. Whether the frame sequence was protocol-complete (a
    // missing `message_stop`, a missing `[DONE]`) is the TS mappers' call —
    // the relay cannot know without provider knowledge.

    StreamOutcome::Done
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- redaction ---------------------------------------------------------

    #[test]
    fn masks_key_material_out_of_provider_detail() {
        let redacted = redact_provider_detail("Incorrect API key provided: sk-abc123DEF");
        assert!(
            !redacted.contains("sk-abc"),
            "leaked key prefix: {redacted}"
        );
        assert_eq!(redacted, "Incorrect API key provided: [redacted-key]");
    }

    #[test]
    fn masks_uppercase_key_tokens() {
        assert_eq!(redact_provider_detail("SK-ABC123"), KEY_MASK);
        assert_eq!(
            redact_provider_detail("key Sk-Ant-xyz here"),
            format!("key {KEY_MASK} here")
        );
    }

    #[test]
    fn leaves_hyphenated_words_untouched() {
        let text = "task-123 and desk-check stay as they are";
        assert_eq!(redact_provider_detail(text), text);
    }

    #[test]
    fn masks_sk_ant_tokens_whole() {
        assert_eq!(
            redact_provider_detail("bad key sk-ant-api03-abc_DEF-123."),
            format!("bad key {KEY_MASK}.")
        );
    }

    #[test]
    fn bare_prefix_without_token_body_is_not_masked() {
        // The reference pattern requires at least one token character after
        // `sk-`, so a bare prefix is not key-shaped.
        assert_eq!(redact_provider_detail("sk- alone"), "sk- alone");
    }

    /// Mask-before-truncate is a security property: a key sitting just before
    /// the cap must be masked *before* the cut, or truncation would leave a
    /// recognizable key prefix that the mask no longer matches.
    #[test]
    fn masks_before_truncating_a_key_that_straddles_the_cap() {
        let detail = format!("{} sk-{}", "x".repeat(189), "a".repeat(64));

        // Control: prove the case is discriminating — a truncate-first
        // implementation would keep a visible key prefix.
        let naive: String = detail.chars().take(200).collect();
        assert!(naive.contains("sk-a"), "test input no longer discriminates");

        let redacted = redact_provider_detail(&detail);
        assert!(!redacted.contains("sk-"), "leaked key prefix: {redacted}");
        assert!(!redacted.contains("aaa"), "leaked key body: {redacted}");
        assert!(redacted.ends_with('…'));
    }

    #[test]
    fn truncates_multibyte_input_without_panicking() {
        // Every char is 2 bytes in UTF-8; a byte-index slice at 200 would panic.
        let redacted = redact_provider_detail(&"é".repeat(300));
        assert_eq!(redacted.chars().count(), 201);
        assert!(redacted.ends_with('…'));
        assert!(redacted.starts_with('é'));
    }

    /// Pins UTF-16-unit counting: 150 supplementary-plane chars are 150 Rust
    /// scalars but 300 JS UTF-16 units. A scalar-counting implementation would
    /// not truncate at all; the TS reference keeps exactly 100 (200 units).
    #[test]
    fn truncation_counts_utf16_units_like_the_typescript_reference() {
        let redacted = redact_provider_detail(&"🔑".repeat(150));
        let kept: Vec<char> = redacted.chars().collect();
        assert_eq!(kept.len(), 101);
        assert_eq!(kept[100], '…');
        assert!(kept[..100].iter().all(|&c| c == '🔑'));
    }

    #[test]
    fn short_details_pass_through_unchanged() {
        assert_eq!(redact_provider_detail("harmless detail"), "harmless detail");
        let exactly_cap = "x".repeat(200);
        assert_eq!(redact_provider_detail(&exactly_cap), exactly_cap);
    }

    // --- request body validation -------------------------------------------

    #[test]
    fn rejects_non_object_bodies() {
        assert_eq!(
            validate_body(&serde_json::json!("just a string")),
            Err(RelayError::BodyNotObject)
        );
        assert_eq!(
            validate_body(&serde_json::json!([1, 2, 3])),
            Err(RelayError::BodyNotObject)
        );
    }

    #[test]
    fn rejects_bodies_without_a_usable_model() {
        let missing = serde_json::json!({ "messages": [] });
        let empty = serde_json::json!({ "model": "", "messages": [] });
        let blank = serde_json::json!({ "model": "   ", "messages": [] });
        let wrong_type = serde_json::json!({ "model": 42, "messages": [] });
        for body in [missing, empty, blank, wrong_type] {
            assert_eq!(
                validate_body(&body),
                Err(RelayError::InvalidModel),
                "{body}"
            );
        }
    }

    #[test]
    fn rejects_bodies_over_the_byte_cap() {
        let body = serde_json::json!({
            "model": "claude-sonnet-4-5",
            "stream": true,
            "padding": "a".repeat(MAX_REQUEST_BODY_BYTES),
        });
        assert_eq!(validate_body(&body), Err(RelayError::BodyTooLarge));
    }

    #[test]
    fn rejects_bodies_that_do_not_stream() {
        let missing = serde_json::json!({ "model": "claude-sonnet-4-5" });
        assert_eq!(validate_body(&missing), Err(RelayError::NotStreaming));
        let disabled = serde_json::json!({ "model": "claude-sonnet-4-5", "stream": false });
        assert_eq!(validate_body(&disabled), Err(RelayError::NotStreaming));
    }

    #[test]
    fn accepts_a_valid_body_and_returns_its_exact_bytes() {
        let body = serde_json::json!({
            "model": "claude-sonnet-4-5",
            "max_tokens": 4096,
            "messages": [{ "role": "user", "content": "hello" }],
            "stream": true,
        });
        let bytes = validate_body(&body).expect("valid body must pass");
        let round_trip: serde_json::Value =
            serde_json::from_slice(&bytes).expect("validated bytes must be JSON");
        assert_eq!(round_trip, body);
    }

    // --- stream id ----------------------------------------------------------

    #[test]
    fn stream_ids_must_be_non_empty_and_bounded() {
        assert_eq!(validate_stream_id(""), Err(RelayError::InvalidStreamId));
        assert_eq!(
            validate_stream_id(&"x".repeat(129)),
            Err(RelayError::InvalidStreamId)
        );
        assert_eq!(validate_stream_id(&"x".repeat(128)), Ok(()));
        assert_eq!(validate_stream_id("0198f2f3-uuid-sized"), Ok(()));
    }

    // --- registry -----------------------------------------------------------

    #[test]
    fn cancelling_one_stream_leaves_others_running() {
        let registry = AiStreamRegistry::default();
        let flag_a = registry.register("a").expect("register a");
        let flag_b = registry.register("b").expect("register b");

        registry.cancel("a");

        assert!(flag_a.load(Ordering::SeqCst), "stream a must be cancelled");
        assert!(!flag_b.load(Ordering::SeqCst), "stream b must keep running");
    }

    #[test]
    fn rejects_registrations_past_the_live_stream_cap() {
        let registry = AiStreamRegistry::default();
        for i in 0..MAX_LIVE_STREAMS {
            registry.register(&format!("s{i}")).expect("under the cap");
        }
        assert!(matches!(
            registry.register("one-more"),
            Err(RelayError::TooManyStreams)
        ));
        // Finishing a stream frees a slot.
        registry.remove("s0");
        registry
            .register("one-more")
            .expect("slot freed by removal");
    }

    #[test]
    fn cancelling_an_unknown_id_is_a_noop() {
        let registry = AiStreamRegistry::default();
        registry.cancel("ghost");
        // A later stream reusing the id must not start pre-cancelled.
        let flag = registry.register("ghost").expect("register after cancel");
        assert!(!flag.load(Ordering::SeqCst));
    }

    #[test]
    fn duplicate_ids_are_rejected_while_live_and_free_after_removal() {
        let registry = AiStreamRegistry::default();
        registry.register("a").expect("first register");
        assert!(matches!(
            registry.register("a"),
            Err(RelayError::DuplicateStreamId)
        ));
        registry.remove("a");
        registry.register("a").expect("register after remove");
    }

    #[test]
    fn cancel_all_sets_every_live_flag() {
        let registry = AiStreamRegistry::default();
        let flag_a = registry.register("a").expect("register a");
        let flag_b = registry.register("b").expect("register b");
        registry.cancel_all();
        assert!(flag_a.load(Ordering::SeqCst));
        assert!(flag_b.load(Ordering::SeqCst));
    }

    // --- endpoints and headers ----------------------------------------------

    #[test]
    fn endpoint_for_selects_the_official_endpoints() {
        assert_eq!(
            endpoint_for(&AiProvider::Anthropic),
            "https://api.anthropic.com/v1/messages"
        );
        assert_eq!(
            endpoint_for(&AiProvider::OpenAi),
            "https://api.openai.com/v1/chat/completions"
        );
    }

    #[test]
    fn anthropic_headers_place_the_key_and_version() {
        let headers = auth_headers(&AiProvider::Anthropic, "sk-ant-test-key").expect("headers");
        assert_eq!(
            headers.get("x-api-key").and_then(|v| v.to_str().ok()),
            Some("sk-ant-test-key")
        );
        assert_eq!(
            headers
                .get("anthropic-version")
                .and_then(|v| v.to_str().ok()),
            Some("2023-06-01")
        );
        assert_eq!(
            headers.get(CONTENT_TYPE).and_then(|v| v.to_str().ok()),
            Some("application/json")
        );
        assert!(headers.get(AUTHORIZATION).is_none());
        assert!(
            headers
                .get("x-api-key")
                .is_some_and(HeaderValue::is_sensitive),
            "key header must be marked sensitive so Debug cannot print it"
        );
    }

    #[test]
    fn openai_headers_use_bearer_auth() {
        let headers = auth_headers(&AiProvider::OpenAi, "sk-test-key").expect("headers");
        assert_eq!(
            headers.get(AUTHORIZATION).and_then(|v| v.to_str().ok()),
            Some("Bearer sk-test-key")
        );
        assert!(headers.get("x-api-key").is_none());
        assert!(
            headers
                .get(AUTHORIZATION)
                .is_some_and(HeaderValue::is_sensitive),
            "key header must be marked sensitive so Debug cannot print it"
        );
    }

    #[test]
    fn unsendable_keys_fail_without_echoing_the_key() {
        let err = auth_headers(&AiProvider::OpenAi, "sk-bad\nkey")
            .expect_err("a key with a newline cannot be a header value");
        assert_eq!(err, RelayError::KeyNotHeaderSafe);
        assert!(!err.to_string().contains("sk-bad"));
    }

    /// The key travels only in headers: the serialized request body is built
    /// from the frontend's JSON alone and can never contain key material.
    #[test]
    fn the_request_body_carries_no_key_material() {
        let api_key = "sk-super-secret-key-material";
        let body = serde_json::json!({
            "model": "gpt-5",
            "stream": true,
            "messages": [{ "role": "user", "content": "hello" }],
        });
        let bytes = validate_body(&body).expect("valid body");
        let serialized = String::from_utf8(bytes).expect("test body is UTF-8");
        assert!(!serialized.contains(api_key));
        assert!(!serialized.contains("sk-super"));
    }

    // --- SSE framing ---------------------------------------------------------

    fn frames_of(splitter: &mut SseFrameSplitter, input: &[u8]) -> Vec<SseFrame> {
        splitter.push(input).expect("framing must succeed")
    }

    #[test]
    fn emits_one_frame_per_data_line_with_the_default_event() {
        let mut splitter = SseFrameSplitter::default();
        let frames = frames_of(&mut splitter, b"data: {\"a\":1}\n\ndata: [DONE]\n\n");
        assert_eq!(
            frames,
            vec![
                SseFrame {
                    event: "message".into(),
                    data: "{\"a\":1}".into()
                },
                SseFrame {
                    event: "message".into(),
                    data: "[DONE]".into()
                },
            ]
        );
    }

    #[test]
    fn event_field_names_the_next_frame_then_resets() {
        let mut splitter = SseFrameSplitter::default();
        let frames = frames_of(
            &mut splitter,
            b"event: content_block_delta\ndata: X\n\ndata: Y\n\n",
        );
        assert_eq!(
            frames,
            vec![
                SseFrame {
                    event: "content_block_delta".into(),
                    data: "X".into()
                },
                SseFrame {
                    event: "message".into(),
                    data: "Y".into()
                },
            ]
        );
    }

    #[test]
    fn event_names_are_trimmed() {
        let mut splitter = SseFrameSplitter::default();
        let frames = frames_of(&mut splitter, b"event:  spaced \ndata: x\n\n");
        assert_eq!(frames[0].event, "spaced");
    }

    /// The discriminating framing case: every possible chunk boundary —
    /// including mid-line, mid-JSON, and mid-multi-byte-UTF-8 — must produce
    /// the same frames as the unsplit stream.
    #[test]
    fn reassembles_frames_split_at_every_byte_offset() {
        let transcript: &[u8] =
            "event: delta\r\ndata: {\"text\":\"h\u{e9}llo \u{2014} \u{1f511}\"}\r\n\r\ndata: [DONE]\n\n"
                .as_bytes();
        let mut reference = SseFrameSplitter::default();
        let expected = frames_of(&mut reference, transcript);
        assert_eq!(expected.len(), 2, "transcript must produce two frames");

        for split_at in 1..transcript.len() {
            let mut splitter = SseFrameSplitter::default();
            let mut frames = frames_of(&mut splitter, &transcript[..split_at]);
            frames.extend(frames_of(&mut splitter, &transcript[split_at..]));
            assert_eq!(frames, expected, "split at byte {split_at} diverged");
        }
    }

    #[test]
    fn field_prefixes_require_the_space_after_the_colon() {
        // Mirrors the TS decoder: both official endpoints always emit the
        // space, so `data:x` is not treated as a frame.
        let mut splitter = SseFrameSplitter::default();
        assert!(frames_of(&mut splitter, b"data:no-space\n").is_empty());
    }

    #[test]
    fn comments_blank_lines_and_other_fields_carry_nothing() {
        let mut splitter = SseFrameSplitter::default();
        assert!(frames_of(&mut splitter, b": keep-alive\n\nid: 7\nretry: 100\n").is_empty());
    }

    #[test]
    fn a_trailing_partial_line_stays_buffered() {
        let mut splitter = SseFrameSplitter::default();
        assert!(frames_of(&mut splitter, b"data: par").is_empty());
        let frames = frames_of(&mut splitter, b"tial\n");
        assert_eq!(
            frames,
            vec![SseFrame {
                event: "message".into(),
                data: "partial".into()
            }]
        );
    }

    #[test]
    fn fails_closed_on_an_unterminated_line_over_the_cap() {
        let mut splitter = SseFrameSplitter::default();
        let oversized = vec![b'a'; MAX_BUFFERED_LINE_BYTES + 1];
        assert_eq!(splitter.push(&oversized), Err(RelayError::UnterminatedLine));
        // The buffer was dropped with the error, so a surviving caller cannot
        // keep growing it.
        assert!(splitter.buffer.is_empty());
    }

    // --- HTTP failure mapping ------------------------------------------------

    /// A realistic OpenAI 401 body. The provider echoes the submitted key and
    /// the account URL back to the caller; the key must never survive
    /// redaction.
    const OPENAI_401_BODY: &str = r#"{"error":{"message":"Incorrect API key provided: sk-proj-AbC123XyZ9. You can find your API key at https://platform.openai.com/account/api-keys","type":"invalid_request_error","param":null,"code":"invalid_api_key"}}"#;

    #[test]
    fn http_error_detail_is_redacted_and_the_message_stays_authored() {
        let outcome = http_error_outcome("OpenAI", StatusCode::UNAUTHORIZED, None, OPENAI_401_BODY);
        let StreamOutcome::HttpError {
            status,
            message,
            provider_detail,
            retry_after_ms,
        } = outcome
        else {
            panic!("a 401 must map to HttpError");
        };
        assert_eq!(status, 401);
        // Pin the whole authored message so the format cannot drift unnoticed.
        // This is byte-for-byte what `userSafeProviderError` renders in the
        // browser (`src/lib/ai-provider-errors.test.ts` pins the same string):
        // the two platforms report one provider failure one way, so a
        // `StatusCode` reason phrase must not creep back into the number.
        assert_eq!(
            message,
            "OpenAI API error (401): the API key was rejected \u{2014} \
             check the key configured for this provider"
        );
        let detail = provider_detail.expect("the 401 body carries detail worth keeping");
        assert!(detail.contains(KEY_MASK));
        assert!(!detail.contains("sk-proj"), "leaked key material: {detail}");
        assert!(
            !detail.contains("AbC123XyZ9"),
            "leaked key material: {detail}"
        );
        assert_eq!(retry_after_ms, None);
    }

    #[test]
    fn rate_limit_outcomes_carry_the_retry_hint() {
        let outcome = http_error_outcome(
            "Anthropic",
            StatusCode::TOO_MANY_REQUESTS,
            Some(2000),
            r#"{"error":{"type":"rate_limit_error"}}"#,
        );
        let StreamOutcome::HttpError {
            status,
            retry_after_ms,
            ..
        } = outcome
        else {
            panic!("a 429 must map to HttpError");
        };
        assert_eq!(status, 429);
        assert_eq!(retry_after_ms, Some(2000));
    }

    #[test]
    fn empty_error_bodies_yield_no_detail() {
        let outcome = http_error_outcome("OpenAI", StatusCode::BAD_GATEWAY, None, "  ");
        let StreamOutcome::HttpError {
            provider_detail, ..
        } = outcome
        else {
            panic!("must map to HttpError");
        };
        assert_eq!(provider_detail, None);
    }

    #[test]
    fn forbidden_is_not_reported_as_a_bad_key() {
        // OpenAI returns 403 for unsupported region, Anthropic for
        // permission_error. Neither is fixed by changing the key.
        let message = user_safe_provider_error("OpenAI", StatusCode::FORBIDDEN);
        assert!(message.contains("key permissions or region"));
        assert!(!message.contains("check the key configured"));
    }

    #[test]
    fn provider_error_maps_each_status_to_its_own_reason() {
        let cases = [
            (StatusCode::BAD_REQUEST, "malformed"),
            (StatusCode::UNAUTHORIZED, "API key was rejected"),
            (StatusCode::FORBIDDEN, "key permissions or region"),
            (StatusCode::NOT_FOUND, "model or endpoint was not found"),
            (StatusCode::PAYLOAD_TOO_LARGE, "too large"),
            (StatusCode::TOO_MANY_REQUESTS, "rate limit or quota"),
            (StatusCode::INTERNAL_SERVER_ERROR, "temporarily unavailable"),
            (StatusCode::SERVICE_UNAVAILABLE, "temporarily unavailable"),
        ];

        for (status, expected) in cases {
            let message = user_safe_provider_error("Anthropic", status);
            assert!(
                message.contains(expected),
                "status {status} produced {message:?}, expected it to mention {expected:?}"
            );
        }
    }

    #[test]
    fn provider_error_falls_back_for_unmapped_statuses() {
        let message = user_safe_provider_error("Anthropic", StatusCode::IM_A_TEAPOT);
        assert!(message.contains("the request failed"));
        // The bare number, not `StatusCode`'s "418 I'm a Teapot": the browser
        // path has no reason phrase to print and both must read the same.
        assert!(
            message.contains("(418)"),
            "unexpected status rendering: {message}"
        );
    }

    #[test]
    fn retry_after_parses_only_delta_seconds() {
        let mut headers = HeaderMap::new();
        assert_eq!(parse_retry_after(&headers), None);

        headers.insert(RETRY_AFTER, HeaderValue::from_static("2"));
        assert_eq!(parse_retry_after(&headers), Some(2000));

        headers.insert(RETRY_AFTER, HeaderValue::from_static("soon"));
        assert_eq!(parse_retry_after(&headers), None);

        headers.insert(
            RETRY_AFTER,
            HeaderValue::from_static("Wed, 21 Oct 2026 07:28:00 GMT"),
        );
        assert_eq!(parse_retry_after(&headers), None);
    }

    #[test]
    fn retry_after_is_clamped_so_a_hostile_hint_cannot_park_retries() {
        let mut headers = HeaderMap::new();
        headers.insert(
            RETRY_AFTER,
            HeaderValue::from_static("18446744073709551615"),
        );
        assert_eq!(parse_retry_after(&headers), Some(MAX_RETRY_AFTER_MS));

        headers.insert(RETRY_AFTER, HeaderValue::from_static("600"));
        assert_eq!(parse_retry_after(&headers), Some(MAX_RETRY_AFTER_MS));
    }

    // --- response byte budget ------------------------------------------------

    #[test]
    fn the_response_budget_fails_only_past_the_cap() {
        let mut relayed = 0usize;
        assert_eq!(
            add_to_budget(&mut relayed, MAX_STREAM_RESPONSE_BYTES),
            Ok(())
        );
        assert_eq!(
            add_to_budget(&mut relayed, 1),
            Err(RelayError::ResponseTooLarge)
        );
    }

    #[tokio::test]
    async fn error_body_reads_are_capped() {
        let oversized = "a".repeat(MAX_ERROR_BODY_BYTES + 4096);
        let response = Response::from(
            http::Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(oversized)
                .expect("test response builds"),
        );
        let body = read_capped_body(response, MAX_ERROR_BODY_BYTES).await;
        assert_eq!(body.len(), MAX_ERROR_BODY_BYTES);
    }
}
