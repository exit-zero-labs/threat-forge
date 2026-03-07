mod ai;
mod commands;
mod errors;
mod file_io;
mod importers;
pub mod mcp;
mod menu;
pub mod models;
mod stride;

use commands::{
    analyze_stride, cancel_chat_stream, check_for_update, create_new_model, delete_api_key,
    get_api_key_status, import_threat_model, install_update, open_layout, open_threat_model,
    save_layout, save_threat_model, send_chat_message, set_api_key, write_text_file,
};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let menu = menu::build_menu(app)?;
            app.set_menu(menu)?;

            // Forward native menu events to the frontend
            app.on_menu_event(move |app_handle, event| {
                let _ = app_handle.emit("menu-action", event.id().0.as_str());
            });

            // Initialize encrypted key storage
            let app_data_dir = app.path().app_data_dir().map_err(|e| {
                Box::new(std::io::Error::other(format!(
                    "Failed to resolve app data directory: {e}"
                )))
            })?;
            let key_storage = ai::keychain::KeyStorage::new(app_data_dir).map_err(|e| {
                Box::new(std::io::Error::other(format!(
                    "Failed to initialize key storage: {e}"
                )))
            })?;
            app.manage(key_storage);

            // Initialize cancel flag for AI streaming
            app.manage(Arc::new(AtomicBool::new(false)));

            // Check if the app was launched with a .thf file argument (file association)
            let args: Vec<String> = std::env::args().collect();
            if args.len() > 1 {
                let path = &args[1];
                if path.ends_with(".thf") {
                    let main_window = app.get_webview_window("main");
                    if let Some(window) = main_window {
                        let path = path.clone();
                        // Emit after a short delay to ensure the frontend is ready
                        std::thread::spawn(move || {
                            std::thread::sleep(std::time::Duration::from_millis(500));
                            let _ = window.emit("open-file", &path);
                        });
                    }
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_new_model,
            open_threat_model,
            save_threat_model,
            open_layout,
            save_layout,
            analyze_stride,
            set_api_key,
            get_api_key_status,
            delete_api_key,
            send_chat_message,
            cancel_chat_stream,
            write_text_file,
            import_threat_model,
            check_for_update,
            install_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
