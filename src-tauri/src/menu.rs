use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    App, Wry,
};

/// Build the native application menu bar.
/// Menu items emit events to the frontend via `menu-action` event.
pub fn build_menu(app: &App) -> Result<Menu<Wry>, Box<dyn std::error::Error>> {
    let handle = app.handle();

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

    // Help menu
    let help_keyboard_shortcuts = MenuItem::with_id(
        handle,
        "help-keyboard-shortcuts",
        "Keyboard Shortcuts",
        true,
        None::<&str>,
    )?;
    let help_guides = MenuItem::with_id(handle, "help-guides", "Guided Tours", true, None::<&str>)?;
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
            &PredefinedMenuItem::separator(handle)?,
            &help_about,
        ],
    )?;

    let menu = Menu::with_items(handle, &[&file_menu, &edit_menu, &view_menu, &help_menu])?;

    Ok(menu)
}
