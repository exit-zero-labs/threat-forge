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
    store_api_key(&storage, &provider, &key)
}

/// Check whether an API key exists for a given provider (returns bool, NOT the key)
#[tauri::command]
pub fn get_api_key_status(
    storage: State<'_, KeyStorage>,
    provider: AiProvider,
) -> Result<bool, String> {
    api_key_status(&storage, &provider)
}

/// Delete an API key for a given provider
#[tauri::command]
pub fn delete_api_key(storage: State<'_, KeyStorage>, provider: AiProvider) -> Result<(), String> {
    remove_api_key(&storage, &provider)
}

// The three command bodies are split into these `&KeyStorage` seams so the
// sanitized boundary mapping can be exercised against a real `KeyStorage`
// fault in tests — `State` has no public constructor to build the command
// directly. Each mirrors the `get_key` path in `start_ai_stream`: the only
// thing crossing the IPC boundary is a `key_refusal` sentence, never the
// storage error's internal `Display`.

/// Boundary body of [`set_api_key`].
fn store_api_key(storage: &KeyStorage, provider: &AiProvider, key: &str) -> Result<(), String> {
    storage
        .store_key(provider, key)
        .map_err(|e| key_refusal(&e).to_string())
}

/// Boundary body of [`get_api_key_status`].
fn api_key_status(storage: &KeyStorage, provider: &AiProvider) -> Result<bool, String> {
    storage
        .has_key(provider)
        .map_err(|e| key_refusal(&e).to_string())
}

/// Boundary body of [`delete_api_key`].
fn remove_api_key(storage: &KeyStorage, provider: &AiProvider) -> Result<(), String> {
    storage
        .delete_key(provider)
        .map_err(|e| key_refusal(&e).to_string())
}

/// Map a key-storage failure to the authored refusal every AI key IPC command returns.
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

    /// Build a `KeyStorage` whose data directory has been removed, so any write
    /// path (`store_key`/`delete_key` → `flush`) fails with a real filesystem
    /// error carrying internal implementation detail.
    fn storage_with_broken_writes() -> (tempfile::TempDir, KeyStorage) {
        let tmp = tempfile::tempdir().expect("tempdir");
        let storage =
            KeyStorage::new(tmp.path().to_path_buf()).expect("KeyStorage::new should succeed");
        std::fs::remove_dir_all(tmp.path()).expect("remove data dir to break future writes");
        (tmp, storage)
    }

    #[test]
    fn set_api_key_maps_a_real_write_fault_to_the_safe_sentence_and_hides_the_key() {
        let (tmp, storage) = storage_with_broken_writes();
        let dir = tmp.path().to_string_lossy().into_owned();

        // Precondition: the underlying storage error really does carry internal
        // detail, so the assertions below are pinning sanitization, not a no-op.
        let raw = storage
            .store_key(&AiProvider::Anthropic, "sk-ant-secret-value")
            .expect_err("writing into a removed data dir must fail")
            .to_string();
        assert!(
            raw.contains("Failed to write"),
            "precondition: raw storage error should carry internal detail: {raw}"
        );

        let refused = store_api_key(&storage, &AiProvider::Anthropic, "sk-ant-secret-value")
            .expect_err("the command must surface the storage fault");

        assert_eq!(refused, "the stored API key could not be read");
        for leaked in [
            dir.as_str(),
            "Failed to write",
            "keys.enc",
            "sk-ant-secret-value",
        ] {
            assert!(
                !refused.contains(leaked),
                "internal detail {leaked:?} reached the boundary: {refused}"
            );
        }
    }

    #[test]
    fn delete_api_key_maps_a_real_write_fault_to_the_safe_sentence() {
        let (tmp, storage) = storage_with_broken_writes();
        let dir = tmp.path().to_string_lossy().into_owned();

        let raw = storage
            .delete_key(&AiProvider::Anthropic)
            .expect_err("flushing into a removed data dir must fail")
            .to_string();
        assert!(
            raw.contains("Failed to"),
            "precondition: raw storage error should carry internal detail: {raw}"
        );

        let refused = remove_api_key(&storage, &AiProvider::Anthropic)
            .expect_err("the command must surface the storage fault");

        assert_eq!(refused, "the stored API key could not be read");
        for leaked in [dir.as_str(), "Failed to", "keys.enc"] {
            assert!(
                !refused.contains(leaked),
                "internal detail {leaked:?} reached the boundary: {refused}"
            );
        }
    }

    #[test]
    fn get_api_key_status_maps_a_poisoned_lock_without_echoing_its_payload() {
        // `has_key` never touches the filesystem, so a poisoned lock is its only
        // reachable failure — and the poison payload is exactly the internal
        // detail that must not cross the boundary.
        let tmp = tempfile::tempdir().expect("tempdir");
        let storage =
            KeyStorage::new(tmp.path().to_path_buf()).expect("KeyStorage::new should succeed");
        storage.poison_keys_lock_for_test();

        let raw = storage
            .has_key(&AiProvider::Anthropic)
            .expect_err("a poisoned lock must fail")
            .to_string();
        assert!(
            raw.contains("Lock poisoned"),
            "precondition: raw storage error should carry the poison payload: {raw}"
        );

        let refused = api_key_status(&storage, &AiProvider::Anthropic)
            .expect_err("the command must surface the poisoned lock");

        assert_eq!(refused, "the stored API key could not be read");
        for leaked in ["Lock poisoned", "PoisonError", "poison"] {
            assert!(
                !refused.contains(leaked),
                "internal detail {leaked:?} reached the boundary: {refused}"
            );
        }
    }
}
