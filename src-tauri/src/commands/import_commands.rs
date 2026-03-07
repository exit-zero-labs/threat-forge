use crate::importers::tm7;
use crate::models::ThreatModel;
use std::path::PathBuf;

#[tauri::command]
pub fn import_threat_model(path: String, format: String) -> Result<ThreatModel, String> {
    let path = PathBuf::from(&path);
    let contents =
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {e}"))?;

    match format.as_str() {
        "tm7" => tm7::parse_tm7(&contents).map_err(|e| e.to_string()),
        _ => Err(format!("Unsupported import format: {format}")),
    }
}
