use std::sync::Mutex;

use tauri::{
    image::Image,
    menu::{Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    tray::{TrayIcon, TrayIconBuilder},
    App, AppHandle, Manager, Runtime,
};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use crate::{
    config_cmd::{load_config, AppConfig},
    window_cmd::{open_home, show_chat_near_pet, show_settings},
};

const OPEN_PET_ID: &str = "open-pet";
const OPEN_HOME_ID: &str = "open-home";
const SETTINGS_ID: &str = "settings";
const CHECK_UPDATE_ID: &str = "check-update";
const QUIT_ID: &str = "quit";

const DEFAULT_OPEN_PET_SHORTCUT: &str = "CmdOrCtrl+Shift+O";
const DEFAULT_OPEN_HOME_SHORTCUT: &str = "CmdOrCtrl+Shift+H";

pub struct AppTray(pub Mutex<TrayIcon>);

fn normalize_global_shortcut(raw: &str) -> String {
    raw.trim()
        .replace("CmdOrCtrl", "CommandOrControl")
        .replace("CommandOrControlOrControl", "CommandOrControl")
}

fn open_pet_shortcut(cfg: &AppConfig) -> String {
    let value = cfg.shortcut_open_pet.trim();
    if value.is_empty() {
        DEFAULT_OPEN_PET_SHORTCUT.to_string()
    } else {
        value.to_string()
    }
}

fn open_home_shortcut(cfg: &AppConfig) -> String {
    let value = cfg.shortcut_open_home.trim();
    if value.is_empty() {
        DEFAULT_OPEN_HOME_SHORTCUT.to_string()
    } else {
        value.to_string()
    }
}

pub fn open_pet(app: &AppHandle) -> Result<(), String> {
    let pet = app
        .get_webview_window("pet")
        .ok_or_else(|| "pet window not found".to_string())?;
    pet.show()
        .map_err(|error| format!("failed to show pet window: {error}"))?;
    crate::window_cmd::ensure_pet_transparent(app);
    show_chat_near_pet(app.clone())
}

fn check_for_updates(app: &AppHandle) {
    let version = env!("CARGO_PKG_VERSION");
    app.dialog()
        .message(format!(
            "当前版本 V{version}\n暂未接入自动更新，请关注发布渠道获取新版本。"
        ))
        .title("检查更新")
        .kind(MessageDialogKind::Info)
        .blocking_show();
}

fn handle_menu_event(app: &AppHandle, id: &str) -> Result<(), String> {
    match id {
        OPEN_PET_ID => open_pet(app),
        OPEN_HOME_ID => {
            let cfg = load_config(app.clone())?;
            open_home(app.clone(), cfg.base_url)
        }
        SETTINGS_ID => show_settings(app.clone()),
        CHECK_UPDATE_ID => {
            check_for_updates(app);
            Ok(())
        }
        QUIT_ID => {
            app.exit(0);
            Ok(())
        }
        _ => Ok(()),
    }
}

fn build_menu<R: Runtime>(app: &AppHandle<R>, cfg: &AppConfig) -> tauri::Result<Menu<R>> {
    let open_pet_item = MenuItemBuilder::with_id(OPEN_PET_ID, "打开桌宠")
        .accelerator(open_pet_shortcut(cfg))
        .build(app)?;
    let open_home_item = MenuItemBuilder::with_id(OPEN_HOME_ID, "打开服务主页")
        .accelerator(open_home_shortcut(cfg))
        .build(app)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let settings = MenuItemBuilder::with_id(SETTINGS_ID, "设置").build(app)?;
    let version = env!("CARGO_PKG_VERSION");
    let check_update = MenuItemBuilder::with_id(
        CHECK_UPDATE_ID,
        format!("检查更新                    V{version}"),
    )
    .build(app)?;
    let quit = MenuItemBuilder::with_id(QUIT_ID, "退出").build(app)?;
    MenuBuilder::new(app)
        .items(&[
            &open_pet_item,
            &open_home_item,
            &separator,
            &settings,
            &check_update,
            &quit,
        ])
        .build()
}

fn register_global_shortcuts(app: &AppHandle, cfg: &AppConfig) -> Result<(), String> {
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();

    let pet_shortcut = normalize_global_shortcut(&open_pet_shortcut(cfg));
    let home_shortcut = normalize_global_shortcut(&open_home_shortcut(cfg));

    gs.on_shortcut(pet_shortcut.as_str(), |app, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            if let Err(error) = open_pet(app) {
                eprintln!("shortcut open pet failed: {error}");
            }
        }
    })
    .map_err(|error| format!("注册「打开桌宠」快捷键失败（{pet_shortcut}）: {error}"))?;

    gs.on_shortcut(home_shortcut.as_str(), |app, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            match load_config(app.clone()) {
                Ok(cfg) => {
                    if let Err(error) = open_home(app.clone(), cfg.base_url) {
                        eprintln!("shortcut open home failed: {error}");
                    }
                }
                Err(error) => eprintln!("shortcut open home failed: {error}"),
            }
        }
    })
    .map_err(|error| format!("注册「打开服务主页」快捷键失败（{home_shortcut}）: {error}"))?;

    Ok(())
}

pub fn apply_hotkeys(app: &AppHandle) -> Result<(), String> {
    let cfg = load_config(app.clone())?;
    let menu = build_menu(app, &cfg).map_err(|error| format!("重建托盘菜单失败: {error}"))?;
    if let Some(tray) = app.try_state::<AppTray>() {
        tray.0
            .lock()
            .map_err(|_| "tray lock is poisoned".to_string())?
            .set_menu(Some(menu))
            .map_err(|error| format!("更新托盘菜单失败: {error}"))?;
    }
    register_global_shortcuts(app, &cfg)
}

#[tauri::command]
pub fn reload_hotkeys(app: AppHandle) -> Result<(), String> {
    apply_hotkeys(&app)
}

pub fn setup(app: &mut App) -> tauri::Result<()> {
    let cfg = load_config(app.handle().clone()).unwrap_or_default();
    let menu = build_menu(app.handle(), &cfg)?;
    // Monochrome template icon so the menu bar matches other system icons.
    let icon = Image::from_bytes(include_bytes!("../icons/tray-template.png"))?;

    let tray = TrayIconBuilder::new()
        .icon(icon)
        .icon_as_template(true)
        .menu(&menu)
        .on_menu_event(|app, event| {
            if let Err(error) = handle_menu_event(app, event.id().as_ref()) {
                eprintln!("tray menu action failed: {error}");
            }
        })
        .build(app)?;

    app.manage(AppTray(Mutex::new(tray)));

    if let Err(error) = register_global_shortcuts(app.handle(), &cfg) {
        eprintln!("{error}");
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::normalize_global_shortcut;

    #[test]
    fn normalize_global_shortcut_replaces_cmd_or_ctrl() {
        assert_eq!(
            normalize_global_shortcut("CmdOrCtrl+Shift+O"),
            "CommandOrControl+Shift+O"
        );
    }

    #[test]
    fn normalize_global_shortcut_trims_whitespace() {
        assert_eq!(normalize_global_shortcut("  Alt+Space  "), "Alt+Space");
    }
}
