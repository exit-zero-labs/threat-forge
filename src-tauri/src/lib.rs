mod commands;
mod errors;
mod file_io;
mod models;
mod stride;

use commands::{
    analyze_stride, create_new_model, open_layout, open_threat_model, save_layout,
    save_threat_model,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            create_new_model,
            open_threat_model,
            save_threat_model,
            open_layout,
            save_layout,
            analyze_stride,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
