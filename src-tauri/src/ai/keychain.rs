use crate::ai::types::AiProvider;
use crate::errors::ThreatForgeError;

const SERVICE_NAME: &str = "com.exitzerolabs.threatforge";

/// Build the keychain entry key for a given provider
fn entry_key(provider: &AiProvider) -> String {
    format!("api-key-{}", provider.keychain_key())
}

/// Store an API key in the OS keychain
pub fn store_key(provider: &AiProvider, key: &str) -> Result<(), ThreatForgeError> {
    let entry = keyring::Entry::new(SERVICE_NAME, &entry_key(provider)).map_err(|e| {
        ThreatForgeError::Keychain {
            message: format!("Failed to create keychain entry: {e}"),
        }
    })?;
    entry
        .set_password(key)
        .map_err(|e| ThreatForgeError::Keychain {
            message: format!("Failed to store API key: {e}"),
        })
}

/// Check whether an API key exists in the keychain (does NOT return the key itself)
pub fn has_key(provider: &AiProvider) -> Result<bool, ThreatForgeError> {
    let entry = keyring::Entry::new(SERVICE_NAME, &entry_key(provider)).map_err(|e| {
        ThreatForgeError::Keychain {
            message: format!("Failed to create keychain entry: {e}"),
        }
    })?;
    match entry.get_password() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(e) => Err(ThreatForgeError::Keychain {
            message: format!("Failed to check API key: {e}"),
        }),
    }
}

/// Retrieve an API key from the keychain (internal use only — never expose to frontend)
pub fn get_key(provider: &AiProvider) -> Result<String, ThreatForgeError> {
    let entry = keyring::Entry::new(SERVICE_NAME, &entry_key(provider)).map_err(|e| {
        ThreatForgeError::Keychain {
            message: format!("Failed to create keychain entry: {e}"),
        }
    })?;
    entry
        .get_password()
        .map_err(|e| ThreatForgeError::Keychain {
            message: format!("Failed to retrieve API key: {e}"),
        })
}

/// Delete an API key from the keychain
pub fn delete_key(provider: &AiProvider) -> Result<(), ThreatForgeError> {
    let entry = keyring::Entry::new(SERVICE_NAME, &entry_key(provider)).map_err(|e| {
        ThreatForgeError::Keychain {
            message: format!("Failed to create keychain entry: {e}"),
        }
    })?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()), // Already deleted — not an error
        Err(e) => Err(ThreatForgeError::Keychain {
            message: format!("Failed to delete API key: {e}"),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_entry_key_format() {
        assert_eq!(entry_key(&AiProvider::Anthropic), "api-key-anthropic");
        assert_eq!(entry_key(&AiProvider::OpenAi), "api-key-openai");
    }
}
