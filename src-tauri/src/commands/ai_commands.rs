use crate::ai::keychain::KeyStorage;
use crate::ai::providers;
use crate::ai::types::{AiProvider, ChatMessage};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, State};

/// Store an API key securely for a given provider
#[tauri::command]
pub fn set_api_key(
    storage: State<'_, KeyStorage>,
    provider: AiProvider,
    key: String,
) -> Result<(), String> {
    storage
        .store_key(&provider, &key)
        .map_err(|e| e.to_string())
}

/// Check whether an API key exists for a given provider (returns bool, NOT the key)
#[tauri::command]
pub fn get_api_key_status(
    storage: State<'_, KeyStorage>,
    provider: AiProvider,
) -> Result<bool, String> {
    storage.has_key(&provider).map_err(|e| e.to_string())
}

/// Delete an API key for a given provider
#[tauri::command]
pub fn delete_api_key(storage: State<'_, KeyStorage>, provider: AiProvider) -> Result<(), String> {
    storage.delete_key(&provider).map_err(|e| e.to_string())
}

/// Send a chat message to an LLM provider with streaming response.
///
/// The system prompt is built by the frontend (the sole prompt owner since issue
/// #61 step 5) and passed as a string, so the full `ThreatModel` is no longer
/// serialized across the IPC boundary on every turn. Rust still holds the API key
/// and performs the request; the prompt carries no secret.
///
/// The response is streamed back via Tauri events:
/// - `ai:stream-chunk` — `{ "text": "..." }` for each text delta
/// - `ai:stream-done` — `{}` when the stream completes
/// - `ai:stream-error` — `{ "error": "..." }` on failure
#[tauri::command]
pub async fn send_chat_message(
    app: AppHandle,
    storage: State<'_, KeyStorage>,
    cancel_flag: State<'_, Arc<AtomicBool>>,
    provider: AiProvider,
    messages: Vec<ChatMessage>,
    system_prompt: String,
    model_id: String,
) -> Result<(), String> {
    // Reset cancel flag at the start of a new request
    cancel_flag.store(false, Ordering::SeqCst);

    // Extract key before any .await — State is not Send
    let api_key = storage.get_key(&provider).map_err(|e| e.to_string())?;
    let flag = cancel_flag.inner().clone();

    providers::stream_chat(
        &app,
        &provider,
        &api_key,
        &system_prompt,
        &messages,
        &model_id,
        &flag,
    )
    .await
    .map_err(|e| e.to_string())
}

/// Cancel an in-progress chat stream.
#[tauri::command]
pub fn cancel_chat_stream(cancel_flag: State<'_, Arc<AtomicBool>>) -> Result<(), String> {
    cancel_flag.store(true, Ordering::SeqCst);
    Ok(())
}
