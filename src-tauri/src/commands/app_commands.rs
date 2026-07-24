use tauri::AppHandle;

/// Exit after the frontend dirty-document guard has approved the quit.
#[tauri::command]
pub fn confirm_quit(app: AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}
