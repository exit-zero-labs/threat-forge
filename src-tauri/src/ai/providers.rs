use crate::ai::types::{AiProvider, ChatMessage, ChatRole};
use crate::errors::ThreatForgeError;
use futures::StreamExt;
use reqwest::{Client, Response};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};

const ANTHROPIC_API_URL: &str = "https://api.anthropic.com/v1/messages";
const OPENAI_API_URL: &str = "https://api.openai.com/v1/chat/completions";

/// Map a provider HTTP failure to a user-safe message.
///
/// Takes only the status code. An OpenAI 401 body echoes the submitted API key
/// back in its `message` field, and every string returned here crosses the IPC
/// boundary into the webview, so the body has no safe place in it.
///
/// The body is not logged either: `AGENTS.md` requires that key material never
/// reach logs, and a partially masked key is still key material.
fn user_safe_provider_error(provider: &str, status: reqwest::StatusCode) -> String {
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
    format!("{provider} API error ({status}): {reason}")
}

/// Convert a non-success response into a user-safe error, consuming the response.
///
/// Taking the `Response` by value is the point: on the error path the body is
/// dropped without ever being readable, so a future edit cannot reintroduce the
/// disclosure by reading it "just for logging" at the call site. Returning the
/// response on success keeps the happy path a single `?` away.
fn ensure_success(provider: &str, response: Response) -> Result<Response, ThreatForgeError> {
    if response.status().is_success() {
        return Ok(response);
    }
    Err(ThreatForgeError::AiRequest {
        message: user_safe_provider_error(provider, response.status()),
    })
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

/// Stream a chat response from the configured provider, emitting Tauri events
/// for each text chunk.
///
/// Events emitted:
/// - `ai:stream-chunk` — `{ "text": "..." }` for each text delta
/// - `ai:stream-done` — `{}` when the stream completes
/// - `ai:stream-error` — `{ "error": "..." }` on failure
pub async fn stream_chat(
    app: &AppHandle,
    provider: &AiProvider,
    api_key: &str,
    system_prompt: &str,
    messages: &[ChatMessage],
    model_id: &str,
    cancel_flag: &AtomicBool,
) -> Result<(), ThreatForgeError> {
    let client = Client::new();

    let result = match provider {
        AiProvider::Anthropic => {
            stream_anthropic(
                &client,
                app,
                api_key,
                system_prompt,
                messages,
                model_id,
                cancel_flag,
            )
            .await
        }
        AiProvider::OpenAi => {
            stream_openai(
                &client,
                app,
                api_key,
                system_prompt,
                messages,
                model_id,
                cancel_flag,
            )
            .await
        }
    };

    match result {
        Ok(()) => {
            let _ = app.emit("ai:stream-done", serde_json::json!({}));
            Ok(())
        }
        Err(e) => {
            let _ = app.emit(
                "ai:stream-error",
                serde_json::json!({ "error": e.to_string() }),
            );
            Err(e)
        }
    }
}

/// Stream from Anthropic Messages API
async fn stream_anthropic(
    client: &Client,
    app: &AppHandle,
    api_key: &str,
    system_prompt: &str,
    messages: &[ChatMessage],
    model_id: &str,
    cancel_flag: &AtomicBool,
) -> Result<(), ThreatForgeError> {
    let api_messages: Vec<serde_json::Value> = messages
        .iter()
        .filter(|m| m.role != ChatRole::System)
        .map(|m| {
            serde_json::json!({
                "role": match m.role {
                    ChatRole::User => "user",
                    ChatRole::Assistant => "assistant",
                    ChatRole::System => "user", // filtered above, but needed for exhaustive match
                },
                "content": m.content,
            })
        })
        .collect();

    let body = serde_json::json!({
        "model": model_id,
        "max_tokens": 4096,
        "system": system_prompt,
        "messages": api_messages,
        "stream": true,
    });

    let response = client
        .post(ANTHROPIC_API_URL)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| ThreatForgeError::AiRequest {
            message: user_safe_transport_error("Anthropic", &e),
        })?;

    let response = ensure_success("Anthropic", response)?;

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk) = stream.next().await {
        if cancel_flag.load(Ordering::SeqCst) {
            return Ok(());
        }

        let chunk = chunk.map_err(|e| ThreatForgeError::AiRequest {
            message: user_safe_transport_error("Provider", &e),
        })?;

        buffer.push_str(&String::from_utf8_lossy(&chunk));

        // Process complete SSE lines
        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim().to_string();
            buffer = buffer[line_end + 1..].to_string();

            if let Some(data) = line.strip_prefix("data: ") {
                if data == "[DONE]" {
                    return Ok(());
                }
                if let Ok(event) = serde_json::from_str::<serde_json::Value>(data) {
                    // Anthropic SSE: look for content_block_delta events
                    if event.get("type").and_then(|t| t.as_str()) == Some("content_block_delta") {
                        if let Some(text) = event
                            .get("delta")
                            .and_then(|d| d.get("text"))
                            .and_then(|t| t.as_str())
                        {
                            let _ =
                                app.emit("ai:stream-chunk", serde_json::json!({ "text": text }));
                        }
                    }
                }
            }
        }
    }

    Ok(())
}

/// Stream from OpenAI Chat Completions API
async fn stream_openai(
    client: &Client,
    app: &AppHandle,
    api_key: &str,
    system_prompt: &str,
    messages: &[ChatMessage],
    model_id: &str,
    cancel_flag: &AtomicBool,
) -> Result<(), ThreatForgeError> {
    let mut api_messages: Vec<serde_json::Value> = vec![serde_json::json!({
        "role": "system",
        "content": system_prompt,
    })];

    for m in messages {
        if m.role == ChatRole::System {
            continue;
        }
        api_messages.push(serde_json::json!({
            "role": match m.role {
                ChatRole::User => "user",
                ChatRole::Assistant => "assistant",
                ChatRole::System => "user",
            },
            "content": m.content,
        }));
    }

    let body = serde_json::json!({
        "model": model_id,
        "max_tokens": 4096,
        "messages": api_messages,
        "stream": true,
    });

    let response = client
        .post(OPENAI_API_URL)
        .header("Authorization", format!("Bearer {api_key}"))
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| ThreatForgeError::AiRequest {
            message: user_safe_transport_error("OpenAI", &e),
        })?;

    let response = ensure_success("OpenAI", response)?;

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk) = stream.next().await {
        if cancel_flag.load(Ordering::SeqCst) {
            return Ok(());
        }

        let chunk = chunk.map_err(|e| ThreatForgeError::AiRequest {
            message: user_safe_transport_error("Provider", &e),
        })?;

        buffer.push_str(&String::from_utf8_lossy(&chunk));

        // Process complete SSE lines
        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim().to_string();
            buffer = buffer[line_end + 1..].to_string();

            if let Some(data) = line.strip_prefix("data: ") {
                if data == "[DONE]" {
                    return Ok(());
                }
                if let Ok(event) = serde_json::from_str::<serde_json::Value>(data) {
                    // OpenAI SSE: look for choices[0].delta.content
                    if let Some(text) = event
                        .get("choices")
                        .and_then(|c| c.get(0))
                        .and_then(|c| c.get("delta"))
                        .and_then(|d| d.get("content"))
                        .and_then(|t| t.as_str())
                    {
                        let _ = app.emit("ai:stream-chunk", serde_json::json!({ "text": text }));
                    }
                }
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{ensure_success, user_safe_provider_error};
    use reqwest::{Response, StatusCode};

    /// A realistic OpenAI 401 body. The provider echoes the submitted key and the
    /// account URL back to the caller; none of it may reach the UI.
    const OPENAI_401_BODY: &str = r#"{"error":{"message":"Incorrect API key provided: sk-proj-AbC123XyZ9. You can find your API key at https://platform.openai.com/account/api-keys","type":"invalid_request_error","param":null,"code":"invalid_api_key"}}"#;

    fn response_with_body(status: StatusCode, body: &'static str) -> Response {
        Response::from(
            http::Response::builder()
                .status(status)
                .body(body)
                .expect("test response builds"),
        )
    }

    /// The regression that matters lives at the call site, not in the mapper.
    /// This fails if anyone reintroduces `response.text()` on the error path.
    #[test]
    fn error_path_never_surfaces_the_response_body() {
        let response = response_with_body(StatusCode::UNAUTHORIZED, OPENAI_401_BODY);

        let message = ensure_success("OpenAI", response)
            .expect_err("401 must be an error")
            .to_string();

        assert!(
            !message.contains("sk-proj"),
            "leaked key material: {message}"
        );
        assert!(!message.contains("platform.openai.com"));
        assert!(!message.contains("invalid_api_key"));
        assert!(!message.contains("Incorrect API key provided"));

        // Pin the whole string so the format cannot drift unnoticed.
        assert_eq!(
            message,
            "AI request error: OpenAI API error (401 Unauthorized): \
             the API key was rejected \u{2014} check the key configured for this provider"
        );
    }

    #[test]
    fn success_responses_pass_through_untouched() {
        let response = response_with_body(StatusCode::OK, "data: hello");
        let passed = ensure_success("Anthropic", response).expect("2xx must pass through");
        assert_eq!(passed.status(), StatusCode::OK);
    }

    #[test]
    fn forbidden_is_not_reported_as_a_bad_key() {
        // OpenAI returns 403 for unsupported region, Anthropic for permission_error.
        // Neither is fixed by changing the key.
        let response = response_with_body(StatusCode::FORBIDDEN, "{}");
        let message = ensure_success("OpenAI", response)
            .expect_err("403 must be an error")
            .to_string();

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
        assert!(message.contains("418"));
    }

    #[test]
    fn test_anthropic_sse_parsing() {
        // Simulate an Anthropic SSE data line
        let data = r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}"#;
        let event: serde_json::Value = serde_json::from_str(data).unwrap();

        assert_eq!(
            event.get("type").and_then(|t| t.as_str()),
            Some("content_block_delta")
        );
        let text = event
            .get("delta")
            .and_then(|d| d.get("text"))
            .and_then(|t| t.as_str());
        assert_eq!(text, Some("Hello"));
    }

    #[test]
    fn test_openai_sse_parsing() {
        // Simulate an OpenAI SSE data line
        let data = r#"{"id":"chatcmpl-123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"World"},"finish_reason":null}]}"#;
        let event: serde_json::Value = serde_json::from_str(data).unwrap();

        let text = event
            .get("choices")
            .and_then(|c| c.get(0))
            .and_then(|c| c.get("delta"))
            .and_then(|d| d.get("content"))
            .and_then(|t| t.as_str());
        assert_eq!(text, Some("World"));
    }

    #[test]
    fn test_anthropic_non_content_event_ignored() {
        let data = r#"{"type":"message_start","message":{"id":"msg_123"}}"#;
        let event: serde_json::Value = serde_json::from_str(data).unwrap();

        // Should not match content_block_delta
        assert_ne!(
            event.get("type").and_then(|t| t.as_str()),
            Some("content_block_delta")
        );
    }
}
