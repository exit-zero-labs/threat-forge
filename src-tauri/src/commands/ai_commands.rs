use crate::ai::keychain::KeyStorage;
use crate::ai::providers::{self, AiStreamRegistry, RelayError};
use crate::ai::types::AiProvider;
use crate::errors::ThreatForgeError;
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

/// Map a key-storage failure to the refusal `start_ai_stream` returns.
///
/// `ThreatForgeError`'s `Display` is internal: it names the provider's storage
/// key, a poisoned lock's payload, or a filesystem path, none of which may
/// reach the webview. Only two things are worth telling a user apart here —
/// "you have not added a key" and "the key could not be read" — and the first
/// is what the frontend turns into the `no_api_key` protocol code.
fn key_refusal(error: &ThreatForgeError) -> RelayError {
    match error {
        ThreatForgeError::NoApiKey { .. } => RelayError::NoApiKey,
        _ => RelayError::KeyUnavailable,
    }
}

/// Start relaying one provider stream (issue #61 step 8).
///
/// The frontend supplies the provider, a provider-shaped JSON body, and a
/// stream id — never a URL and never a header. Rust selects the endpoint,
/// attaches the auth headers with the locally stored key, and relays the SSE
/// response as events:
/// - `ai:stream-frame` — `{ streamId, event, data }` for each SSE frame
/// - `ai:stream-closed` — `{ streamId, outcome }` exactly once, terminally
///
/// The command resolves `Err` only for requests it rejects up front (invalid
/// stream id or body, no stored key, unsendable key, duplicate stream id, too
/// many live streams); no events are emitted for those. Every one of those
/// strings is a [`RelayError`] sentence authored here, never a raw internal
/// error. Once accepted, every failure — HTTP status,
/// transport, size violation — arrives as the typed `ai:stream-closed`
/// outcome with any provider detail redacted and truncated before it leaves
/// Rust.
#[tauri::command]
pub async fn start_ai_stream(
    app: AppHandle,
    storage: State<'_, KeyStorage>,
    registry: State<'_, AiStreamRegistry>,
    provider: AiProvider,
    body: serde_json::Value,
    stream_id: String,
) -> Result<(), String> {
    providers::validate_stream_id(&stream_id).map_err(|e| e.to_string())?;
    let body_bytes = providers::validate_body(&body).map_err(|e| e.to_string())?;

    // Extract the key and build headers before any .await, then drop the key:
    // the headers are the only place it may live from here on.
    let api_key = storage
        .get_key(&provider)
        .map_err(|e| key_refusal(&e).to_string())?;
    let headers = providers::auth_headers(&provider, &api_key).map_err(|e| e.to_string())?;
    drop(api_key);

    let registry = registry.inner().clone();
    let cancel_flag = registry.register(&stream_id).map_err(|e| e.to_string())?;

    // `run_stream` is infallible — every failure becomes the terminal
    // `ai:stream-closed` outcome — so this removal cannot be skipped.
    providers::run_stream(
        &app,
        &provider,
        headers,
        body_bytes,
        &stream_id,
        &cancel_flag,
    )
    .await;
    registry.remove(&stream_id);
    Ok(())
}

/// Cancel one in-progress relayed stream, leaving every other stream running.
///
/// Unknown ids are a no-op: the stream may have completed (and been removed
/// from the registry) between the frontend deciding to cancel and this call
/// arriving.
#[tauri::command]
pub fn cancel_ai_stream(
    registry: State<'_, AiStreamRegistry>,
    stream_id: String,
) -> Result<(), String> {
    registry.cancel(&stream_id);
    Ok(())
}

/// Deprecated single-stream cancel kept only for the legacy frontend adapter.
///
/// `src/lib/adapters/tauri-chat-adapter.ts` still invokes this command; issue
/// #61 step 9 deletes that caller and this command together. The legacy UI
/// runs at most one stream at a time, so cancelling every live stream
/// preserves its observable behavior. New code must use `cancel_ai_stream`.
#[tauri::command]
pub fn cancel_chat_stream(registry: State<'_, AiStreamRegistry>) -> Result<(), String> {
    registry.cancel_all();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_missing_key_is_refused_with_the_sentence_the_frontend_matches() {
        let error = ThreatForgeError::NoApiKey {
            provider: "anthropic".to_string(),
        };

        let refusal = key_refusal(&error).to_string();

        // `src/lib/adapters/tauri-chat-adapter.ts` compares against exactly this
        // sentence to raise `no_api_key`; its drift test reads `providers.rs`.
        assert_eq!(
            refusal,
            "no API key is configured for this provider \u{2014} add one in AI Settings"
        );
        // The internal text names the storage key for the provider.
        assert!(
            !refusal.contains("anthropic"),
            "internal detail reached the boundary: {refusal}"
        );
    }

    #[test]
    fn a_storage_fault_is_refused_without_echoing_the_internal_error() {
        let error = ThreatForgeError::KeyStorage {
            message: "Lock poisoned: PoisonError { .. } at /Users/someone/keys.enc".to_string(),
        };

        let refusal = key_refusal(&error).to_string();

        assert_eq!(refusal, "the stored API key could not be read");
        for leaked in ["Lock poisoned", "PoisonError", "/Users/someone"] {
            assert!(
                !refusal.contains(leaked),
                "internal detail {leaked:?} reached the boundary: {refusal}"
            );
        }
    }

    #[test]
    fn a_storage_fault_is_not_reported_as_a_missing_key() {
        // The frontend turns only the missing-key refusal into `no_api_key`, so
        // telling a user to add a key they already added would be a dead end.
        let fault = ThreatForgeError::KeyStorage {
            message: "Failed to read encrypted file".to_string(),
        };
        assert_ne!(key_refusal(&fault), RelayError::NoApiKey);
    }
}
