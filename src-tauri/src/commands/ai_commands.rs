use crate::ai::keychain;
use crate::ai::prompt;
use crate::ai::providers;
use crate::ai::types::{AiProvider, ChatMessage};
use crate::models::ThreatModel;
use tauri::AppHandle;

/// Store an API key in the OS keychain for a given provider
#[tauri::command]
pub fn set_api_key(provider: AiProvider, key: String) -> Result<(), String> {
    keychain::store_key(&provider, &key).map_err(|e| e.to_string())
}

/// Check whether an API key exists for a given provider (returns bool, NOT the key)
#[tauri::command]
pub fn get_api_key_status(provider: AiProvider) -> Result<bool, String> {
    keychain::has_key(&provider).map_err(|e| e.to_string())
}

/// Delete an API key from the OS keychain for a given provider
#[tauri::command]
pub fn delete_api_key(provider: AiProvider) -> Result<(), String> {
    keychain::delete_key(&provider).map_err(|e| e.to_string())
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
    provider: AiProvider,
    messages: Vec<ChatMessage>,
    model: ThreatModel,
) -> Result<(), String> {
    let api_key = keychain::get_key(&provider).map_err(|e| e.to_string())?;
    let system_prompt = prompt::build_system_prompt(&model);

    providers::stream_chat(&app, &provider, &api_key, &system_prompt, &messages)
        .await
        .map_err(|e| e.to_string())
}
