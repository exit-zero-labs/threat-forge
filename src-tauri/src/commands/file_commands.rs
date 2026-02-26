use crate::file_io;
use crate::models::{DiagramLayout, ThreatModel};
use std::path::PathBuf;

#[tauri::command]
pub fn create_new_model(title: String, author: String) -> Result<ThreatModel, String> {
    Ok(ThreatModel::new(&title, &author))
}

#[tauri::command]
pub fn open_threat_model(path: String) -> Result<ThreatModel, String> {
    let path = PathBuf::from(path);
    file_io::read_threat_model(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_threat_model(path: String, model: ThreatModel) -> Result<(), String> {
    let path = PathBuf::from(path);
    file_io::write_threat_model(&path, &model).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_layout(path: String) -> Result<DiagramLayout, String> {
    let path = PathBuf::from(path);
    file_io::read_layout(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_layout(path: String, layout: DiagramLayout) -> Result<(), String> {
    let path = PathBuf::from(path);
    file_io::write_layout(&path, &layout).map_err(|e| e.to_string())
}
