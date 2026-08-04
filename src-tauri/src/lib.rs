pub mod config_cmd;
pub mod secrets_cmd;
pub mod tray;
pub mod window_cmd;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window_cmd::should_hide_on_close(window.label()) {
                    api.prevent_close();
                    if let Err(error) = window.hide() {
                        eprintln!("failed to hide {} window: {error}", window.label());
                    }
                }
            }
        })
        .setup(|app| {
            tray::setup(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            config_cmd::load_config,
            config_cmd::save_config,
            config_cmd::patch_config,
            secrets_cmd::get_secret,
            secrets_cmd::set_secret,
            secrets_cmd::delete_secret,
            window_cmd::open_home,
            window_cmd::show_chat_near_pet,
            window_cmd::hide_chat,
            window_cmd::show_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
