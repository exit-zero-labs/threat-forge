use crate::ai::types::{AiProvider, ChatMessage, ChatRole};
use crate::errors::ThreatForgeError;
use futures::StreamExt;
use reqwest::Client;
use tauri::{AppHandle, Emitter};

const ANTHROPIC_API_URL: &str = "https://api.anthropic.com/v1/messages";
const OPENAI_API_URL: &str = "https://api.openai.com/v1/chat/completions";
const ANTHROPIC_MODEL: &str = "claude-sonnet-4-20250514";
const OPENAI_MODEL: &str = "gpt-4o";

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
) -> Result<(), ThreatForgeError> {
    let client = Client::new();

    let result = match provider {
        AiProvider::Anthropic => {
            stream_anthropic(&client, app, api_key, system_prompt, messages).await
        }
        AiProvider::OpenAi => stream_openai(&client, app, api_key, system_prompt, messages).await,
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
        "model": ANTHROPIC_MODEL,
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
            message: format!("Anthropic request failed: {e}"),
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(ThreatForgeError::AiRequest {
            message: format!("Anthropic API error ({status}): {body}"),
        });
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| ThreatForgeError::AiRequest {
            message: format!("Stream read error: {e}"),
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
        "model": OPENAI_MODEL,
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
            message: format!("OpenAI request failed: {e}"),
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(ThreatForgeError::AiRequest {
            message: format!("OpenAI API error ({status}): {body}"),
        });
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| ThreatForgeError::AiRequest {
            message: format!("Stream read error: {e}"),
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
