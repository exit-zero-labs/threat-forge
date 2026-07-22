use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
// `Rng` is rand 0.10's name for the byte-source trait that 0.9 called
// `RngCore`; the old `Rng` extension trait is now `RngExt`. `fill_bytes` keeps
// its 0.9 semantics, including panicking only if the OS entropy source fails
// while reseeding `ThreadRng`, which `TryRng` does not avoid either.
use rand::Rng;

use crate::ai::types::AiProvider;
use crate::errors::ThreatForgeError;

const NONCE_LEN: usize = 12;
const KEY_LEN: usize = 32;

/// AES-256-GCM encrypted file storage for API keys.
///
/// Keys are held in-memory in a `Mutex<HashMap>` and persisted to an encrypted
/// file (`keys.enc`) in the app data directory. A 32-byte random encryption key
/// is stored alongside in `keys.dat` (with 0600 permissions on Unix).
pub struct KeyStorage {
    data_dir: PathBuf,
    keys: Mutex<HashMap<String, String>>,
    enc_key: [u8; KEY_LEN],
}

impl KeyStorage {
    /// Create or load key storage from the given app data directory.
    pub fn new(data_dir: PathBuf) -> Result<Self, ThreatForgeError> {
        fs::create_dir_all(&data_dir).map_err(|e| ThreatForgeError::KeyStorage {
            message: format!("Failed to create data directory: {e}"),
        })?;

        let key_file = data_dir.join("keys.dat");
        let enc_key = if key_file.exists() {
            let raw = fs::read(&key_file).map_err(|e| ThreatForgeError::KeyStorage {
                message: format!("Failed to read encryption key file: {e}"),
            })?;
            if raw.len() != KEY_LEN {
                return Err(ThreatForgeError::KeyStorage {
                    message: format!(
                        "Encryption key file has invalid length: expected {KEY_LEN}, got {}",
                        raw.len()
                    ),
                });
            }
            let mut key = [0u8; KEY_LEN];
            key.copy_from_slice(&raw);
            key
        } else {
            let mut key = [0u8; KEY_LEN];
            rand::rng().fill_bytes(&mut key);
            fs::write(&key_file, key).map_err(|e| ThreatForgeError::KeyStorage {
                message: format!("Failed to write encryption key file: {e}"),
            })?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                fs::set_permissions(&key_file, fs::Permissions::from_mode(0o600)).map_err(|e| {
                    ThreatForgeError::KeyStorage {
                        message: format!("Failed to set key file permissions: {e}"),
                    }
                })?;
            }
            key
        };

        let enc_file = data_dir.join("keys.enc");
        let keys = if enc_file.exists() {
            Self::decrypt_file(&enc_file, &enc_key)?
        } else {
            HashMap::new()
        };

        Ok(Self {
            data_dir,
            keys: Mutex::new(keys),
            enc_key,
        })
    }

    /// Store an API key for a provider.
    pub fn store_key(&self, provider: &AiProvider, key: &str) -> Result<(), ThreatForgeError> {
        let mut map = self.keys.lock().map_err(|e| ThreatForgeError::KeyStorage {
            message: format!("Lock poisoned: {e}"),
        })?;
        map.insert(provider.keychain_key().to_string(), key.to_string());
        self.flush(&map)
    }

    /// Check whether an API key exists for a provider.
    pub fn has_key(&self, provider: &AiProvider) -> Result<bool, ThreatForgeError> {
        let map = self.keys.lock().map_err(|e| ThreatForgeError::KeyStorage {
            message: format!("Lock poisoned: {e}"),
        })?;
        Ok(map.contains_key(provider.keychain_key()))
    }

    /// Retrieve an API key (internal only — never expose via IPC).
    pub fn get_key(&self, provider: &AiProvider) -> Result<String, ThreatForgeError> {
        let map = self.keys.lock().map_err(|e| ThreatForgeError::KeyStorage {
            message: format!("Lock poisoned: {e}"),
        })?;
        map.get(provider.keychain_key())
            .cloned()
            .ok_or_else(|| ThreatForgeError::KeyStorage {
                message: format!(
                    "No API key stored for provider '{}'",
                    provider.keychain_key()
                ),
            })
    }

    /// Delete an API key for a provider.
    pub fn delete_key(&self, provider: &AiProvider) -> Result<(), ThreatForgeError> {
        let mut map = self.keys.lock().map_err(|e| ThreatForgeError::KeyStorage {
            message: format!("Lock poisoned: {e}"),
        })?;
        map.remove(provider.keychain_key());
        self.flush(&map)
    }

    /// Encrypt the key map and write atomically (tmp + rename).
    fn flush(&self, map: &HashMap<String, String>) -> Result<(), ThreatForgeError> {
        let plaintext = serde_json::to_vec(map).map_err(|e| ThreatForgeError::KeyStorage {
            message: format!("Failed to serialize keys: {e}"),
        })?;

        let cipher =
            Aes256Gcm::new_from_slice(&self.enc_key).map_err(|e| ThreatForgeError::KeyStorage {
                message: format!("Failed to create cipher: {e}"),
            })?;

        let mut nonce_bytes = [0u8; NONCE_LEN];
        rand::rng().fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from(nonce_bytes);

        let ciphertext = cipher.encrypt(&nonce, plaintext.as_ref()).map_err(|e| {
            ThreatForgeError::KeyStorage {
                message: format!("Encryption failed: {e}"),
            }
        })?;

        let mut blob = Vec::with_capacity(NONCE_LEN + ciphertext.len());
        blob.extend_from_slice(&nonce_bytes);
        blob.extend_from_slice(&ciphertext);

        let tmp_file = self.data_dir.join("keys.enc.tmp");
        let enc_file = self.data_dir.join("keys.enc");

        fs::write(&tmp_file, &blob).map_err(|e| ThreatForgeError::KeyStorage {
            message: format!("Failed to write temp encrypted file: {e}"),
        })?;
        fs::rename(&tmp_file, &enc_file).map_err(|e| ThreatForgeError::KeyStorage {
            message: format!("Failed to rename encrypted file: {e}"),
        })?;

        Ok(())
    }

    /// Decrypt the encrypted file and return the key map.
    fn decrypt_file(
        path: &PathBuf,
        enc_key: &[u8; KEY_LEN],
    ) -> Result<HashMap<String, String>, ThreatForgeError> {
        let blob = fs::read(path).map_err(|e| ThreatForgeError::KeyStorage {
            message: format!("Failed to read encrypted file: {e}"),
        })?;

        let Some((nonce_bytes, ciphertext)) = blob.split_first_chunk::<NONCE_LEN>() else {
            return Err(ThreatForgeError::KeyStorage {
                message: "Encrypted file is too short".to_string(),
            });
        };
        let nonce = Nonce::from(*nonce_bytes);

        let cipher =
            Aes256Gcm::new_from_slice(enc_key).map_err(|e| ThreatForgeError::KeyStorage {
                message: format!("Failed to create cipher: {e}"),
            })?;

        let plaintext =
            cipher
                .decrypt(&nonce, ciphertext)
                .map_err(|e| ThreatForgeError::KeyStorage {
                    message: format!("Decryption failed (corrupted file or wrong key): {e}"),
                })?;

        serde_json::from_slice(&plaintext).map_err(|e| ThreatForgeError::KeyStorage {
            message: format!("Failed to parse decrypted keys: {e}"),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `keys.dat` from a store written by ThreatForge on aes-gcm 0.10.3 / rand 0.8.5.
    ///
    /// Regenerate by checking out that revision, storing `anthropic` and `openai`
    /// through `KeyStorage`, and hex-dumping `keys.dat` and `keys.enc`. These bytes
    /// exist only to prove the post-upgrade reader still accepts the pre-upgrade
    /// on-disk format; the key never protected a real credential.
    const LEGACY_ENC_KEY_HEX: &str =
        "19093c2872df5144f5d4ec55cb9eeeb3fb41f254b85e216a3a106d3ba2cb907b";

    /// `keys.enc` from the same pre-upgrade store: 12-byte nonce, then the AES-256-GCM
    /// ciphertext of the serialized `anthropic`/`openai` map with its trailing 16-byte tag.
    const LEGACY_ENC_BLOB_HEX: &str = "9323b9c13babecb4018605ac77bc03c9bc9f9dc6ac586b2d41171828e0eb28b19a07a5637ee8cf9cc3d1d1f77db3ec78b0f96bd50348a78b66c968e8d4299a7b8610ce4d4f48b6daaf2e32a5b4bee2743c01e6b10d94d41df857cce3854e08d0ad682a5670";

    fn make_storage(dir: &std::path::Path) -> KeyStorage {
        KeyStorage::new(dir.to_path_buf()).expect("KeyStorage::new should succeed")
    }

    fn decode_hex(hex: &str) -> Vec<u8> {
        assert!(
            hex.len().is_multiple_of(2),
            "fixture hex must have even length"
        );
        (0..hex.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).expect("fixture hex must be valid"))
            .collect()
    }

    #[test]
    fn test_store_and_retrieve() {
        let tmp = tempfile::tempdir().unwrap();
        let storage = make_storage(tmp.path());

        storage
            .store_key(&AiProvider::Anthropic, "sk-ant-test-123")
            .unwrap();
        assert_eq!(
            storage.get_key(&AiProvider::Anthropic).unwrap(),
            "sk-ant-test-123"
        );
        assert!(storage.has_key(&AiProvider::Anthropic).unwrap());
        assert!(!storage.has_key(&AiProvider::OpenAi).unwrap());
    }

    #[test]
    fn test_persistence_across_instances() {
        let tmp = tempfile::tempdir().unwrap();

        {
            let storage = make_storage(tmp.path());
            storage
                .store_key(&AiProvider::Anthropic, "sk-ant-persist")
                .unwrap();
            storage
                .store_key(&AiProvider::OpenAi, "sk-openai-persist")
                .unwrap();
        }

        // Create a new instance from the same directory
        let storage2 = make_storage(tmp.path());
        assert_eq!(
            storage2.get_key(&AiProvider::Anthropic).unwrap(),
            "sk-ant-persist"
        );
        assert_eq!(
            storage2.get_key(&AiProvider::OpenAi).unwrap(),
            "sk-openai-persist"
        );
    }

    #[test]
    fn test_delete_key() {
        let tmp = tempfile::tempdir().unwrap();
        let storage = make_storage(tmp.path());

        storage
            .store_key(&AiProvider::Anthropic, "sk-ant-delete")
            .unwrap();
        assert!(storage.has_key(&AiProvider::Anthropic).unwrap());

        storage.delete_key(&AiProvider::Anthropic).unwrap();
        assert!(!storage.has_key(&AiProvider::Anthropic).unwrap());
        assert!(storage.get_key(&AiProvider::Anthropic).is_err());
    }

    #[test]
    fn test_multiple_providers() {
        let tmp = tempfile::tempdir().unwrap();
        let storage = make_storage(tmp.path());

        storage
            .store_key(&AiProvider::Anthropic, "sk-ant-multi")
            .unwrap();
        storage
            .store_key(&AiProvider::OpenAi, "sk-openai-multi")
            .unwrap();

        assert_eq!(
            storage.get_key(&AiProvider::Anthropic).unwrap(),
            "sk-ant-multi"
        );
        assert_eq!(
            storage.get_key(&AiProvider::OpenAi).unwrap(),
            "sk-openai-multi"
        );

        // Delete one, other should remain
        storage.delete_key(&AiProvider::Anthropic).unwrap();
        assert!(!storage.has_key(&AiProvider::Anthropic).unwrap());
        assert!(storage.has_key(&AiProvider::OpenAi).unwrap());
    }

    #[test]
    fn test_overwrite_key() {
        let tmp = tempfile::tempdir().unwrap();
        let storage = make_storage(tmp.path());

        storage
            .store_key(&AiProvider::Anthropic, "old-key")
            .unwrap();
        storage
            .store_key(&AiProvider::Anthropic, "new-key")
            .unwrap();

        assert_eq!(storage.get_key(&AiProvider::Anthropic).unwrap(), "new-key");
    }

    #[test]
    fn test_corrupted_enc_file() {
        let tmp = tempfile::tempdir().unwrap();

        // Create a valid storage first to generate keys.dat
        {
            let storage = make_storage(tmp.path());
            storage.store_key(&AiProvider::Anthropic, "test").unwrap();
        }

        // Corrupt the encrypted file
        fs::write(tmp.path().join("keys.enc"), b"corrupted data").unwrap();

        // New instance should fail to decrypt
        let result = KeyStorage::new(tmp.path().to_path_buf());
        assert!(result.is_err());
    }

    #[test]
    fn test_missing_key_returns_error() {
        let tmp = tempfile::tempdir().unwrap();
        let storage = make_storage(tmp.path());

        let result = storage.get_key(&AiProvider::Anthropic);
        assert!(result.is_err());
    }

    #[cfg(unix)]
    #[test]
    fn test_key_file_permissions() {
        use std::os::unix::fs::PermissionsExt;

        let tmp = tempfile::tempdir().unwrap();
        let _storage = make_storage(tmp.path());

        let key_file = tmp.path().join("keys.dat");
        let perms = fs::metadata(&key_file).unwrap().permissions();
        assert_eq!(perms.mode() & 0o777, 0o600);
    }

    #[test]
    fn test_empty_storage_no_enc_file() {
        let tmp = tempfile::tempdir().unwrap();
        let _storage = make_storage(tmp.path());

        // No keys stored yet, so keys.enc should not exist
        assert!(!tmp.path().join("keys.enc").exists());
        // But keys.dat should exist
        assert!(tmp.path().join("keys.dat").exists());
    }

    #[test]
    fn test_delete_nonexistent_key_is_ok() {
        let tmp = tempfile::tempdir().unwrap();
        let storage = make_storage(tmp.path());

        // Deleting a key that doesn't exist should succeed
        storage.delete_key(&AiProvider::Anthropic).unwrap();
    }

    /// Nonce reuse under a fixed AES-GCM key is catastrophic, so each write must draw a
    /// fresh nonce. Both writes go through one `KeyStorage` instance and serialize an
    /// identical single-entry map, so a nonce hoisted out of the per-write path or seeded
    /// deterministically would produce byte-identical files here.
    #[test]
    fn test_each_write_uses_a_fresh_nonce() {
        let tmp = tempfile::tempdir().unwrap();
        let storage = make_storage(tmp.path());
        let enc_file = tmp.path().join("keys.enc");

        storage
            .store_key(&AiProvider::Anthropic, "sk-ant-identical")
            .unwrap();
        let first = fs::read(&enc_file).unwrap();

        storage
            .store_key(&AiProvider::Anthropic, "sk-ant-identical")
            .unwrap();
        let second = fs::read(&enc_file).unwrap();

        assert_eq!(
            first.len(),
            second.len(),
            "both writes should encrypt the same plaintext"
        );
        assert_ne!(
            first[..NONCE_LEN],
            second[..NONCE_LEN],
            "nonce must be regenerated for every encryption"
        );
        assert_ne!(
            first[NONCE_LEN..],
            second[NONCE_LEN..],
            "identical plaintext must not produce identical ciphertext"
        );
    }

    /// Every `KeyStorage` must get its own randomly generated AES key rather than a
    /// constant or deterministically derived one.
    #[test]
    fn test_each_storage_generates_a_distinct_encryption_key() {
        let first_dir = tempfile::tempdir().unwrap();
        let second_dir = tempfile::tempdir().unwrap();
        let _first = make_storage(first_dir.path());
        let _second = make_storage(second_dir.path());

        let first_key = fs::read(first_dir.path().join("keys.dat")).unwrap();
        let second_key = fs::read(second_dir.path().join("keys.dat")).unwrap();

        assert_eq!(first_key.len(), KEY_LEN);
        assert_eq!(second_key.len(), KEY_LEN);
        assert_ne!(first_key, second_key);
    }

    /// A store written before the aes-gcm 0.11 / rand 0.9 upgrade must still open, which
    /// requires the `nonce || ciphertext || tag` layout and AES-256-GCM parameters to be
    /// unchanged. If this fails, the upgrade has silently orphaned users' stored keys.
    #[test]
    fn test_pre_upgrade_key_store_still_decrypts() {
        let tmp = tempfile::tempdir().unwrap();
        fs::write(tmp.path().join("keys.dat"), decode_hex(LEGACY_ENC_KEY_HEX)).unwrap();
        fs::write(tmp.path().join("keys.enc"), decode_hex(LEGACY_ENC_BLOB_HEX)).unwrap();

        let storage = KeyStorage::new(tmp.path().to_path_buf())
            .expect("pre-upgrade key store should still decrypt");

        assert_eq!(
            storage.get_key(&AiProvider::Anthropic).unwrap(),
            "sk-ant-legacy-fixture"
        );
        assert_eq!(
            storage.get_key(&AiProvider::OpenAi).unwrap(),
            "sk-openai-legacy-fixture"
        );
    }

    /// The pre-upgrade fixture must only decrypt under its own key; a wrong key has to
    /// fail closed rather than yield attacker-influenced plaintext.
    #[test]
    fn test_pre_upgrade_key_store_rejects_a_different_key() {
        let tmp = tempfile::tempdir().unwrap();
        let mut wrong_key = decode_hex(LEGACY_ENC_KEY_HEX);
        wrong_key[0] ^= 0x01;
        fs::write(tmp.path().join("keys.dat"), &wrong_key).unwrap();
        fs::write(tmp.path().join("keys.enc"), decode_hex(LEGACY_ENC_BLOB_HEX)).unwrap();

        assert!(KeyStorage::new(tmp.path().to_path_buf()).is_err());
    }

    /// A file shorter than the nonce prefix must be rejected rather than panicking.
    #[test]
    fn test_truncated_enc_file_is_rejected() {
        let tmp = tempfile::tempdir().unwrap();
        fs::write(tmp.path().join("keys.dat"), decode_hex(LEGACY_ENC_KEY_HEX)).unwrap();
        fs::write(tmp.path().join("keys.enc"), [0u8; NONCE_LEN - 1]).unwrap();

        assert!(KeyStorage::new(tmp.path().to_path_buf()).is_err());
    }
}
