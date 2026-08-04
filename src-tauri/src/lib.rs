pub mod config_cmd;
pub mod secrets_cmd;
pub mod tray;
pub mod window_cmd;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            tray::setup(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            config_cmd::load_config,
            config_cmd::save_config,
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
