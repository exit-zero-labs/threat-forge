use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    App, Wry,
};

/// Build the native application menu bar.
///
/// Menu items emit events to the frontend via the `menu-action` event, except the
/// platform quit affordances, which emit `quit-requested` and reuse the frontend
/// dirty-document guard.
pub fn build_menu(app: &App) -> Result<Menu<Wry>, Box<dyn std::error::Error>> {
    let handle = app.handle();

    // macOS application submenu: rendered first, in the application-menu slot. Built from
    // predefined items so About/Services/Hide/Quit carry their native behavior and the
    // platform-correct Cmd+Q accelerator.
    #[cfg(target_os = "macos")]
    let app_menu = {
        let about = PredefinedMenuItem::about(handle, None, None)?;
        let services = PredefinedMenuItem::services(handle, None)?;
        let hide = PredefinedMenuItem::hide(handle, None)?;
        let hide_others = PredefinedMenuItem::hide_others(handle, None)?;
        let show_all = PredefinedMenuItem::show_all(handle, None)?;
        let app_name = handle.package_info().name.clone();
        // Tauri 2.11.5 does not expose macOS applicationShouldTerminate, so predefined Quit's
        // terminate: action cannot be guarded against unsaved changes.
        let quit = MenuItem::with_id(
            handle,
            "app-quit",
            format!("Quit {app_name}"),
            true,
            Some("CmdOrCtrl+Q"),
        )?;
        Submenu::with_items(
            handle,
            app_name,
            true,
            &[
                &about,
                &PredefinedMenuItem::separator(handle)?,
                &services,
                &PredefinedMenuItem::separator(handle)?,
                &hide,
                &hide_others,
                &show_all,
                &PredefinedMenuItem::separator(handle)?,
                &quit,
            ],
        )?
    };

    // File menu
    let file_new = MenuItem::with_id(handle, "file-new", "New Model", true, Some("CmdOrCtrl+N"))?;
    let file_open =
        MenuItem::with_id(handle, "file-open", "Open Model", true, Some("CmdOrCtrl+O"))?;
    let file_save = MenuItem::with_id(handle, "file-save", "Save", true, Some("CmdOrCtrl+S"))?;
    let file_save_as = MenuItem::with_id(
        handle,
        "file-save-as",
        "Save As…",
        true,
        Some("CmdOrCtrl+Shift+S"),
    )?;
    let file_export_html = MenuItem::with_id(
        handle,
        "file-export-html",
        "Export as HTML…",
        true,
        Some("CmdOrCtrl+Shift+E"),
    )?;
    let file_import =
        MenuItem::with_id(handle, "file-import", "Import\u{2026}", true, None::<&str>)?;
    let file_close = MenuItem::with_id(
        handle,
        "file-close",
        "Close Model",
        true,
        Some("CmdOrCtrl+W"),
    )?;
    // Windows/Linux have no application menu, so the conventional quit lives in File → Exit.
    // A custom item is required on both: predefined Quit is unsupported on Linux, and on Windows
    // it posts WM_QUIT, bypassing Tauri's preventable ExitRequested event.
    #[cfg(any(target_os = "windows", target_os = "linux"))]
    let file_exit = MenuItem::with_id(handle, "file-exit", "Exit", true, None::<&str>)?;

    let file_menu = Submenu::with_items(
        handle,
        "File",
        true,
        &[
            &file_new,
            &file_open,
            &file_import,
            &PredefinedMenuItem::separator(handle)?,
            &file_save,
            &file_save_as,
            &file_export_html,
            &PredefinedMenuItem::separator(handle)?,
            &file_close,
            #[cfg(any(target_os = "windows", target_os = "linux"))]
            &PredefinedMenuItem::separator(handle)?,
            #[cfg(any(target_os = "windows", target_os = "linux"))]
            &file_exit,
        ],
    )?;

    // Edit menu
    let edit_undo = MenuItem::with_id(handle, "edit-undo", "Undo", true, Some("CmdOrCtrl+Z"))?;
    let edit_redo =
        MenuItem::with_id(handle, "edit-redo", "Redo", true, Some("CmdOrCtrl+Shift+Z"))?;
    let edit_cut = MenuItem::with_id(handle, "edit-cut", "Cut", true, Some("CmdOrCtrl+X"))?;
    let edit_copy = MenuItem::with_id(handle, "edit-copy", "Copy", true, Some("CmdOrCtrl+C"))?;
    let edit_paste = MenuItem::with_id(handle, "edit-paste", "Paste", true, Some("CmdOrCtrl+V"))?;
    let edit_select_all = MenuItem::with_id(
        handle,
        "edit-select-all",
        "Select All",
        true,
        Some("CmdOrCtrl+A"),
    )?;
    let edit_delete = MenuItem::with_id(handle, "edit-delete", "Delete", true, Some("Delete"))?;

    let edit_menu = Submenu::with_items(
        handle,
        "Edit",
        true,
        &[
            &edit_undo,
            &edit_redo,
            &PredefinedMenuItem::separator(handle)?,
            &edit_cut,
            &edit_copy,
            &edit_paste,
            &PredefinedMenuItem::separator(handle)?,
            &edit_select_all,
            &edit_delete,
        ],
    )?;

    // View menu
    let view_toggle_palette = MenuItem::with_id(
        handle,
        "view-toggle-palette",
        "Toggle Component Palette",
        true,
        Some("CmdOrCtrl+B"),
    )?;
    let view_toggle_panel = MenuItem::with_id(
        handle,
        "view-toggle-panel",
        "Toggle Properties Panel",
        true,
        Some("CmdOrCtrl+I"),
    )?;
    let view_zoom_in =
        MenuItem::with_id(handle, "view-zoom-in", "Zoom In", true, Some("CmdOrCtrl+="))?;
    let view_zoom_out = MenuItem::with_id(
        handle,
        "view-zoom-out",
        "Zoom Out",
        true,
        Some("CmdOrCtrl+-"),
    )?;
    let view_fit = MenuItem::with_id(handle, "view-fit", "Fit to View", true, Some("CmdOrCtrl+0"))?;
    let view_command_palette = MenuItem::with_id(
        handle,
        "view-command-palette",
        "Command Palette",
        true,
        Some("CmdOrCtrl+K"),
    )?;

    let view_menu = Submenu::with_items(
        handle,
        "View",
        true,
        &[
            &view_toggle_palette,
            &view_toggle_panel,
            &PredefinedMenuItem::separator(handle)?,
            &view_zoom_in,
            &view_zoom_out,
            &view_fit,
            &PredefinedMenuItem::separator(handle)?,
            &view_command_palette,
        ],
    )?;

    // macOS Window submenu: standard Minimize/Zoom/Close, using predefined items.
    #[cfg(target_os = "macos")]
    let window_menu = {
        let minimize = PredefinedMenuItem::minimize(handle, None)?;
        let zoom = PredefinedMenuItem::maximize(handle, None)?;
        let close_window = PredefinedMenuItem::close_window(handle, None)?;
        Submenu::with_items(
            handle,
            "Window",
            true,
            &[
                &minimize,
                &zoom,
                &PredefinedMenuItem::separator(handle)?,
                &close_window,
            ],
        )?
    };

    // Help menu
    let help_keyboard_shortcuts = MenuItem::with_id(
        handle,
        "help-keyboard-shortcuts",
        "Keyboard Shortcuts",
        true,
        None::<&str>,
    )?;
    let help_guides = MenuItem::with_id(handle, "help-guides", "Guided Tours", true, None::<&str>)?;
    // macOS exposes About in the native application menu, so a Help → About there would be a
    // duplicate. Keep the Help entry only where there is no application menu.
    #[cfg(not(target_os = "macos"))]
    let help_about = MenuItem::with_id(
        handle,
        "help-about",
        "About Threat Forge",
        true,
        None::<&str>,
    )?;
    let help_menu = Submenu::with_items(
        handle,
        "Help",
        true,
        &[
            &help_keyboard_shortcuts,
            &PredefinedMenuItem::separator(handle)?,
            &help_guides,
            #[cfg(not(target_os = "macos"))]
            &PredefinedMenuItem::separator(handle)?,
            #[cfg(not(target_os = "macos"))]
            &help_about,
        ],
    )?;

    #[cfg(target_os = "macos")]
    let menu = Menu::with_items(
        handle,
        &[
            &app_menu,
            &file_menu,
            &edit_menu,
            &view_menu,
            &window_menu,
            &help_menu,
        ],
    )?;
    #[cfg(not(target_os = "macos"))]
    let menu = Menu::with_items(handle, &[&file_menu, &edit_menu, &view_menu, &help_menu])?;

    Ok(menu)
}
