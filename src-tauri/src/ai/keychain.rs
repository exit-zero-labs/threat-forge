use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use rand::RngCore;

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
            rand::thread_rng().fill_bytes(&mut key);
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
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = cipher.encrypt(nonce, plaintext.as_ref()).map_err(|e| {
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

        if blob.len() < NONCE_LEN {
            return Err(ThreatForgeError::KeyStorage {
                message: "Encrypted file is too short".to_string(),
            });
        }

        let (nonce_bytes, ciphertext) = blob.split_at(NONCE_LEN);
        let nonce = Nonce::from_slice(nonce_bytes);

        let cipher =
            Aes256Gcm::new_from_slice(enc_key).map_err(|e| ThreatForgeError::KeyStorage {
                message: format!("Failed to create cipher: {e}"),
            })?;

        let plaintext =
            cipher
                .decrypt(nonce, ciphertext)
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

    fn make_storage(dir: &std::path::Path) -> KeyStorage {
        KeyStorage::new(dir.to_path_buf()).expect("KeyStorage::new should succeed")
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
}
