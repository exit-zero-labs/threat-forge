use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

/// Information about an available update.
#[derive(Serialize, Clone, Debug)]
pub struct UpdateInfo {
    pub version: String,
    pub date: Option<String>,
    pub body: Option<String>,
}

/// Check if a newer version is available.
#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    let update = updater.check().await.map_err(|e| e.to_string())?;

    match update {
        Some(ref u) => Ok(Some(UpdateInfo {
            version: u.version.clone(),
            date: u.date.map(|d| d.to_string()),
            body: u.body.clone(),
        })),
        None => Ok(None),
    }
}

/// Download and install the available update. The app will need to restart.
#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    let update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No update available".to_string())?;

    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}
