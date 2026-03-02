use crate::ai::keychain::KeyStorage;
use crate::ai::prompt;
use crate::ai::providers;
use crate::ai::types::{AiProvider, ChatMessage};
use crate::models::ThreatModel;
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
/// The response is streamed back via Tauri events:
/// - `ai:stream-chunk` — `{ "text": "..." }` for each text delta
/// - `ai:stream-done` — `{}` when the stream completes
/// - `ai:stream-error` — `{ "error": "..." }` on failure
#[tauri::command]
pub async fn send_chat_message(
    app: AppHandle,
    storage: State<'_, KeyStorage>,
    provider: AiProvider,
    messages: Vec<ChatMessage>,
    model: ThreatModel,
) -> Result<(), String> {
    // Extract key before any .await — State is not Send
    let api_key = storage.get_key(&provider).map_err(|e| e.to_string())?;
    let system_prompt = prompt::build_system_prompt(&model);

    providers::stream_chat(&app, &provider, &api_key, &system_prompt, &messages)
        .await
        .map_err(|e| e.to_string())
}
