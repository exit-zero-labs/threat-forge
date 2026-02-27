use serde::{Deserialize, Serialize};

/// Supported AI providers
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AiProvider {
    Anthropic,
    #[serde(rename = "openai")]
    OpenAi,
}

impl AiProvider {
    /// Keychain service suffix for this provider
    pub fn keychain_key(&self) -> &str {
        match self {
            Self::Anthropic => "anthropic",
            Self::OpenAi => "openai",
        }
    }
}

/// A single message in the chat conversation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: ChatRole,
    pub content: String,
}

/// Message roles
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ChatRole {
    User,
    Assistant,
    System,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_provider_keychain_key() {
        assert_eq!(AiProvider::Anthropic.keychain_key(), "anthropic");
        assert_eq!(AiProvider::OpenAi.keychain_key(), "openai");
    }

    #[test]
    fn test_provider_serialization() {
        let json = serde_json::to_string(&AiProvider::Anthropic).unwrap();
        assert_eq!(json, r#""anthropic""#);

        let json = serde_json::to_string(&AiProvider::OpenAi).unwrap();
        assert_eq!(json, r#""openai""#);
    }

    #[test]
    fn test_provider_deserialization() {
        let provider: AiProvider = serde_json::from_str(r#""anthropic""#).unwrap();
        assert_eq!(provider, AiProvider::Anthropic);

        let provider: AiProvider = serde_json::from_str(r#""openai""#).unwrap();
        assert_eq!(provider, AiProvider::OpenAi);
    }

    #[test]
    fn test_chat_message_serialization() {
        let msg = ChatMessage {
            role: ChatRole::User,
            content: "Hello".to_string(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains(r#""role":"user""#));
        assert!(json.contains(r#""content":"Hello""#));
    }
}
