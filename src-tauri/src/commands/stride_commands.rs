use crate::models::{Threat, ThreatModel};
use crate::stride;

#[tauri::command]
pub fn analyze_stride(model: ThreatModel) -> Result<Vec<Threat>, String> {
    Ok(stride::analyze(&model))
}
