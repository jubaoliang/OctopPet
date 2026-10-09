pub mod config_cmd;
pub mod secrets_cmd;
pub mod tray;
pub mod window_cmd;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                if window_cmd::should_hide_on_close(window.label()) {
                    api.prevent_close();
                    if let Err(error) = window.hide() {
                        eprintln!("failed to hide {} window: {error}", window.label());
                    }
                }
            }
            tauri::WindowEvent::Focused(focused) => {
                window_cmd::handle_window_focus_change(window, *focused);
            }
            tauri::WindowEvent::ThemeChanged(_) | tauri::WindowEvent::ScaleFactorChanged { .. } => {
                window_cmd::ensure_window_surface_transparent(window);
            }
            _ => {}
        })
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                // Desktop-pet style: stay out of Dock/Stage Manager focus fights
                // that corrupt transparent window chrome after click.
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }
            tray::setup(app)?;
            window_cmd::ensure_pet_transparent(app.handle());
            window_cmd::ensure_dialog_windows_transparent(app.handle());
            window_cmd::apply_window_deactivate_policy(app.handle().clone())?;
            window_cmd::spawn_pet_transparency_watchdog(app.handle());
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
            window_cmd::hide_pet,
            window_cmd::restore_pet_position,
            window_cmd::show_settings,
            window_cmd::place_window_bottom_center,
            window_cmd::place_window_centered,
            window_cmd::apply_bottom_anchored_size,
            window_cmd::apply_window_deactivate_policy,
            tray::reload_hotkeys,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
