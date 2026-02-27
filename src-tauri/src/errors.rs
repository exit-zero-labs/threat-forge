use thiserror::Error;

/// Application-level errors for ThreatForge
#[derive(Debug, Error)]
pub enum ThreatForgeError {
    #[error("Failed to read file '{path}': {source}")]
    FileRead {
        path: String,
        source: std::io::Error,
    },

    #[error("Failed to write file '{path}': {source}")]
    FileWrite {
        path: String,
        source: std::io::Error,
    },

    #[error("Failed to parse YAML in '{path}': {source}")]
    YamlParse {
        path: String,
        source: serde_yaml::Error,
    },

    #[error("Failed to serialize YAML: {source}")]
    YamlSerialize { source: serde_yaml::Error },

    #[error("Failed to parse JSON in '{path}': {source}")]
    JsonParse {
        path: String,
        source: serde_json::Error,
    },

    #[error("Failed to serialize JSON: {source}")]
    JsonSerialize { source: serde_json::Error },

    #[error("Unsupported schema version '{version}'. Supported versions: {supported:?}")]
    UnsupportedVersion {
        version: String,
        supported: Vec<String>,
    },

    #[error("Duplicate ID '{id}' in section '{section}'")]
    DuplicateId { id: String, section: String },

    #[error("Invalid reference in '{field}': '{reference}' not found. Valid IDs: {valid:?}")]
    InvalidReference {
        field: String,
        reference: String,
        valid: Vec<String>,
    },

    #[error("Keychain error: {message}")]
    Keychain { message: String },

    #[error("AI request error: {message}")]
    AiRequest { message: String },
}
