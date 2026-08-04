use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    tray::TrayIconBuilder,
    App, AppHandle, Emitter, Manager,
};

use crate::{
    config_cmd::{load_config, patch_config, AppConfig},
    window_cmd::{open_home, show_settings},
};

const TOGGLE_PET_ID: &str = "toggle-pet";
const MASCOT_PEEK_ID: &str = "mascot-peek";
const MASCOT_TYPE_ID: &str = "mascot-type";
const OPEN_HOME_ID: &str = "open-home";
const SETTINGS_ID: &str = "settings";
const QUIT_ID: &str = "quit";

pub fn select_mascot(cfg: &mut AppConfig, mascot_id: &str) -> Result<(), String> {
    match mascot_id {
        "peek" | "type" => {
            cfg.mascot_id = mascot_id.to_string();
            Ok(())
        }
        _ => Err(format!("unsupported mascot: {mascot_id}")),
    }
}

fn toggle_pet(app: &AppHandle) -> Result<(), String> {
    let pet = app
        .get_webview_window("pet")
        .ok_or_else(|| "pet window not found".to_string())?;
    let is_visible = pet
        .is_visible()
        .map_err(|error| format!("failed to read pet visibility: {error}"))?;

    if is_visible {
        pet.hide()
            .map_err(|error| format!("failed to hide pet window: {error}"))
    } else {
        pet.show()
            .map_err(|error| format!("failed to show pet window: {error}"))
    }
}

fn choose_mascot(app: &AppHandle, mascot_id: &str) -> Result<(), String> {
    let mut cfg = load_config(app.clone())?;
    select_mascot(&mut cfg, mascot_id)?;
    patch_config(
        app.clone(),
        serde_json::json!({ "mascotId": cfg.mascot_id }),
    )?;
    app.emit("mascot-changed", mascot_id)
        .map_err(|error| format!("failed to emit mascot change: {error}"))
}

fn handle_menu_event(app: &AppHandle, id: &str) -> Result<(), String> {
    match id {
        TOGGLE_PET_ID => toggle_pet(app),
        MASCOT_PEEK_ID => choose_mascot(app, "peek"),
        MASCOT_TYPE_ID => choose_mascot(app, "type"),
        OPEN_HOME_ID => {
            let cfg = load_config(app.clone())?;
            open_home(app.clone(), cfg.base_url)
        }
        SETTINGS_ID => show_settings(app.clone()),
        QUIT_ID => {
            app.exit(0);
            Ok(())
        }
        _ => Ok(()),
    }
}

pub fn setup(app: &mut App) -> tauri::Result<()> {
    let toggle_pet = MenuItemBuilder::with_id(TOGGLE_PET_ID, "显示/隐藏宠物").build(app)?;
    let mascot_peek = MenuItemBuilder::with_id(MASCOT_PEEK_ID, "peek").build(app)?;
    let mascot_type = MenuItemBuilder::with_id(MASCOT_TYPE_ID, "type").build(app)?;
    let mascot_menu = SubmenuBuilder::new(app, "选择形象")
        .items(&[&mascot_peek, &mascot_type])
        .build()?;
    let open_home = MenuItemBuilder::with_id(OPEN_HOME_ID, "打开主页").build(app)?;
    let settings = MenuItemBuilder::with_id(SETTINGS_ID, "设置…").build(app)?;
    let quit = MenuItemBuilder::with_id(QUIT_ID, "退出").build(app)?;
    let menu = MenuBuilder::new(app)
        .items(&[&toggle_pet, &mascot_menu, &open_home, &settings, &quit])
        .build()?;
    let icon = app
        .default_window_icon()
        .ok_or_else(|| tauri::Error::AssetNotFound("default window icon".into()))?
        .clone();

    TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .on_menu_event(|app, event| {
            if let Err(error) = handle_menu_event(app, event.id().as_ref()) {
                eprintln!("tray menu action failed: {error}");
            }
        })
        .build(app)?;

    Ok(())
}
