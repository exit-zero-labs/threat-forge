use serde::{Deserialize, Serialize};

/// Supported AI providers
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AiProvider {
    Anthropic,
    #[serde(rename = "openai")]
    OpenAi,
}

impl AiProvider {
    /// Keychain service suffix for this provider
    pub fn keychain_key(&self) -> &str {
        match self {
            Self::Anthropic => "anthropic",
            Self::OpenAi => "openai",
        }
    }

    /// Human-readable provider name used in user-safe error messages.
    pub fn label(&self) -> &'static str {
        match self {
            Self::Anthropic => "Anthropic",
            Self::OpenAi => "OpenAI",
        }
    }
}

/// Payload of the `ai:stream-frame` event: one SSE frame relayed verbatim.
///
/// The relay forwards frames without interpreting them — decoding provider
/// events is the shared TypeScript decoder's job (issue #61 steps 6–7) — so
/// this payload carries provider text untouched. It never carries the API
/// key: the key exists only inside `auth_headers` in `providers.rs`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StreamFramePayload {
    pub stream_id: String,
    /// The SSE `event:` field, or `"message"` when the provider named none.
    pub event: String,
    /// The SSE `data:` payload, untouched — JSON parsing is the frontend's job.
    pub data: String,
}

/// Payload of the terminal `ai:stream-closed` event.
///
/// Every accepted `start_ai_stream` call emits exactly one of these for its
/// `stream_id`, whatever the outcome, so the frontend transport can key its
/// teardown on a single event.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StreamClosedPayload {
    pub stream_id: String,
    pub outcome: StreamOutcome,
}

/// Terminal outcome of one relayed stream.
///
/// The variants mirror the frontend transport callbacks planned in issue #61
/// step 9 (`onClose`, `onHttpError`, `onTransportError`) rather than the
/// protocol error taxonomy: the relay is transport-level and must not
/// duplicate protocol knowledge. Every `message` is authored in Rust and is
/// safe to render; provider text appears only as `provider_detail`, already
/// redacted and truncated by `redact_provider_detail`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum StreamOutcome {
    /// The provider closed the response stream normally.
    Done,
    /// `cancel_ai_stream` stopped this stream.
    Cancelled,
    /// The provider answered with a non-success HTTP status.
    #[serde(rename_all = "camelCase")]
    HttpError {
        status: u16,
        /// User-safe sentence authored in Rust; never provider text.
        message: String,
        /// Provider body after redaction and truncation; absent when the
        /// provider said nothing worth keeping.
        #[serde(skip_serializing_if = "Option::is_none")]
        provider_detail: Option<String>,
        /// Parsed `retry-after` header (delta-seconds form only), present so
        /// the frontend retry policy can honor it without seeing headers.
        #[serde(skip_serializing_if = "Option::is_none")]
        retry_after_ms: Option<u64>,
    },
    /// The request or stream failed below HTTP: connect/timeout/read errors,
    /// or the relay failing closed on a size or framing violation.
    #[serde(rename_all = "camelCase")]
    TransportError {
        /// User-safe sentence authored in Rust; never provider text.
        message: String,
        /// Machine-readable failure class. The step 11 retry policy retries
        /// `network` failures that occur before the first event but must never
        /// retry a framing or size violation — the browser decoder classifies
        /// the identical failures as `malformed_stream` — and the frontend
        /// must not have to string-match `message` to tell them apart.
        reason: TransportFailureReason,
    },
}

/// Why a `TransportError` outcome happened, as a stable wire discriminator.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TransportFailureReason {
    /// Connect, timeout, or read failure below HTTP. Retriable by policy.
    Network,
    /// The response violated SSE framing (unterminated-line cap). The stream
    /// endpoint is not speaking the protocol; never retried.
    MalformedStream,
    /// The response exceeded the per-stream byte budget. Never retried.
    ResponseTooLarge,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_provider_keychain_key() {
        assert_eq!(AiProvider::Anthropic.keychain_key(), "anthropic");
        assert_eq!(AiProvider::OpenAi.keychain_key(), "openai");
    }

    #[test]
    fn test_provider_label() {
        assert_eq!(AiProvider::Anthropic.label(), "Anthropic");
        assert_eq!(AiProvider::OpenAi.label(), "OpenAI");
    }

    #[test]
    fn test_provider_serialization() {
        let json = serde_json::to_string(&AiProvider::Anthropic).unwrap();
        assert_eq!(json, r#""anthropic""#);

        let json = serde_json::to_string(&AiProvider::OpenAi).unwrap();
        assert_eq!(json, r#""openai""#);
    }

    #[test]
    fn test_provider_deserialization() {
        let provider: AiProvider = serde_json::from_str(r#""anthropic""#).unwrap();
        assert_eq!(provider, AiProvider::Anthropic);

        let provider: AiProvider = serde_json::from_str(r#""openai""#).unwrap();
        assert_eq!(provider, AiProvider::OpenAi);
    }

    /// The frontend transport (issue #61 step 9) matches on these exact wire
    /// shapes; a serde attribute drift here breaks desktop streaming silently.
    #[test]
    fn frame_payload_serializes_with_camel_case_stream_id() {
        let payload = StreamFramePayload {
            stream_id: "s-1".to_string(),
            event: "message".to_string(),
            data: "{}".to_string(),
        };
        let json = serde_json::to_value(&payload).unwrap();
        assert_eq!(
            json,
            serde_json::json!({ "streamId": "s-1", "event": "message", "data": "{}" })
        );
    }

    #[test]
    fn done_and_cancelled_outcomes_serialize_as_bare_kinds() {
        let done = StreamClosedPayload {
            stream_id: "s-1".to_string(),
            outcome: StreamOutcome::Done,
        };
        assert_eq!(
            serde_json::to_value(&done).unwrap(),
            serde_json::json!({ "streamId": "s-1", "outcome": { "kind": "done" } })
        );

        assert_eq!(
            serde_json::to_value(StreamOutcome::Cancelled).unwrap(),
            serde_json::json!({ "kind": "cancelled" })
        );
    }

    #[test]
    fn http_error_outcome_omits_absent_optionals() {
        let outcome = StreamOutcome::HttpError {
            status: 500,
            message: "the provider is temporarily unavailable".to_string(),
            provider_detail: None,
            retry_after_ms: None,
        };
        assert_eq!(
            serde_json::to_value(&outcome).unwrap(),
            serde_json::json!({
                "kind": "httpError",
                "status": 500,
                "message": "the provider is temporarily unavailable",
            })
        );
    }

    #[test]
    fn http_error_outcome_round_trips_with_camel_case_fields() {
        let outcome = StreamOutcome::HttpError {
            status: 429,
            message: "rate limited".to_string(),
            provider_detail: Some("[redacted-key]".to_string()),
            retry_after_ms: Some(2000),
        };
        let json = serde_json::to_value(&outcome).unwrap();
        assert_eq!(json["kind"], "httpError");
        assert_eq!(json["providerDetail"], "[redacted-key]");
        assert_eq!(json["retryAfterMs"], 2000);

        let back: StreamOutcome = serde_json::from_value(json).unwrap();
        assert_eq!(back, outcome);
    }

    #[test]
    fn transport_error_outcome_serializes_its_kind_and_reason() {
        let outcome = StreamOutcome::TransportError {
            message: "could not connect to the provider".to_string(),
            reason: TransportFailureReason::Network,
        };
        let json = serde_json::to_value(&outcome).unwrap();
        assert_eq!(json["kind"], "transportError");
        assert_eq!(json["message"], "could not connect to the provider");
        assert_eq!(json["reason"], "network");
    }

    /// The step 11 retry policy branches on these exact strings: `network` may
    /// be retried before the first event, the other two never are.
    #[test]
    fn transport_failure_reasons_serialize_as_stable_camel_case() {
        assert_eq!(
            serde_json::to_value(TransportFailureReason::MalformedStream).unwrap(),
            serde_json::json!("malformedStream")
        );
        assert_eq!(
            serde_json::to_value(TransportFailureReason::ResponseTooLarge).unwrap(),
            serde_json::json!("responseTooLarge")
        );
    }
}
