use tauri::{AppHandle, Manager, PhysicalPosition};
use tauri_plugin_opener::OpenerExt;

pub fn home_url(base_url: &str) -> Result<String, String> {
    let base_url = base_url.trim().trim_end_matches('/');
    if base_url.is_empty() {
        return Err("base URL cannot be empty".into());
    }
    Ok(format!("{base_url}/"))
}

pub fn chat_position(
    pet_position: (i32, i32),
    pet_size: (u32, u32),
    chat_size: (u32, u32),
    work_position: (i32, i32),
    work_size: (u32, u32),
) -> (i32, i32) {
    let pet_width = pet_size.0 as i64;
    let chat_width = chat_size.0 as i64;
    let chat_height = chat_size.1 as i64;
    let work_left = work_position.0 as i64;
    let work_top = work_position.1 as i64;
    let work_right = work_left + work_size.0 as i64;
    let work_bottom = work_top + work_size.1 as i64;
    let pet_x = pet_position.0 as i64;
    let pet_y = pet_position.1 as i64;

    let right_x = pet_x + pet_width;
    let desired_x = if right_x + chat_width <= work_right {
        right_x
    } else {
        pet_x - chat_width
    };
    let max_x = (work_right - chat_width).max(work_left);
    let max_y = (work_bottom - chat_height).max(work_top);

    (
        desired_x.clamp(work_left, max_x) as i32,
        pet_y.clamp(work_top, max_y) as i32,
    )
}

#[tauri::command]
pub fn open_home(app: AppHandle, base_url: String) -> Result<(), String> {
    app.opener()
        .open_url(home_url(&base_url)?, None::<String>)
        .map_err(|error| format!("failed to open home URL: {error}"))
}

#[tauri::command]
pub fn show_chat_near_pet(app: AppHandle) -> Result<(), String> {
    let pet = app
        .get_webview_window("pet")
        .ok_or_else(|| "pet window not found".to_string())?;
    let chat = app
        .get_webview_window("chat")
        .ok_or_else(|| "chat window not found".to_string())?;

    let pet_position = pet
        .outer_position()
        .map_err(|error| format!("failed to read pet position: {error}"))?;
    let pet_size = pet
        .outer_size()
        .map_err(|error| format!("failed to read pet size: {error}"))?;
    let chat_size = chat
        .outer_size()
        .map_err(|error| format!("failed to read chat size: {error}"))?;
    let monitor = pet
        .current_monitor()
        .map_err(|error| format!("failed to find pet monitor: {error}"))?
        .ok_or_else(|| "pet window is not on an available monitor".to_string())?;
    let work_area = monitor.work_area();
    let (x, y) = chat_position(
        (pet_position.x, pet_position.y),
        (pet_size.width, pet_size.height),
        (chat_size.width, chat_size.height),
        (work_area.position.x, work_area.position.y),
        (work_area.size.width, work_area.size.height),
    );

    chat.set_position(PhysicalPosition::new(x, y))
        .map_err(|error| format!("failed to position chat window: {error}"))?;
    chat.show()
        .map_err(|error| format!("failed to show chat window: {error}"))?;
    chat.set_focus()
        .map_err(|error| format!("failed to focus chat window: {error}"))
}

#[tauri::command]
pub fn hide_chat(app: AppHandle) -> Result<(), String> {
    app.get_webview_window("chat")
        .ok_or_else(|| "chat window not found".to_string())?
        .hide()
        .map_err(|error| format!("failed to hide chat window: {error}"))
}

#[tauri::command]
pub fn show_settings(app: AppHandle) -> Result<(), String> {
    let settings = app
        .get_webview_window("settings")
        .ok_or_else(|| "settings window not found".to_string())?;
    settings
        .center()
        .map_err(|error| format!("failed to center settings window: {error}"))?;
    settings
        .show()
        .map_err(|error| format!("failed to show settings window: {error}"))?;
    settings
        .set_focus()
        .map_err(|error| format!("failed to focus settings window: {error}"))
}
