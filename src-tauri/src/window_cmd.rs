use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{window::Color, AppHandle, Emitter, Manager, PhysicalPosition};
use tauri_plugin_opener::OpenerExt;

/// Logical pixels between the chat window bottom edge and the work-area bottom.
pub const CHAT_BOTTOM_GAP_LOGICAL: f64 = 96.0;

/// Back-compat alias used by older call sites / docs.
pub const BOTTOM_GAP_LOGICAL: f64 = CHAT_BOTTOM_GAP_LOGICAL;

static CHAT_HAS_BEEN_SHOWN: AtomicBool = AtomicBool::new(false);
static SETTINGS_HAS_BEEN_SHOWN: AtomicBool = AtomicBool::new(false);

pub fn should_hide_on_close(label: &str) -> bool {
    matches!(label, "chat" | "settings")
}

/// macOS often paints an opaque gray canvas / OS shadow on the pet window
/// when it enters drag mode or resigns key (e.g. chat takes focus).
/// Re-assert clear background / no OS shadow on the main thread.
pub fn ensure_pet_transparent(app: &AppHandle) {
    let Some(pet) = app.get_webview_window("pet") else {
        return;
    };
    let _ = pet.set_focusable(false);
    if let Err(error) = pet.set_shadow(false) {
        eprintln!("failed to disable pet shadow: {error}");
    }
    // Clears NSWindow + WKWebView (drawsBackground / underPageBackgroundColor).
    if let Err(error) = pet.set_background_color(Some(Color(0, 0, 0, 0))) {
        eprintln!("failed to clear pet background: {error}");
    }

    #[cfg(target_os = "macos")]
    {
        // Tauri set_shadow can race with AppKit drag/focus; force NSWindow flags.
        let _ = pet.with_webview(|webview| {
            use objc2_app_kit::{NSColor, NSWindow};
            unsafe {
                let ns_window: &NSWindow = &*webview.ns_window().cast();
                ns_window.setHasShadow(false);
                ns_window.setOpaque(false);
                ns_window.setBackgroundColor(Some(&NSColor::clearColor()));
                ns_window.invalidateShadow();
            }
        });
    }

    // Force the page canvas clear in case CSS left a gray layer.
    let _ = pet.eval(
        r#"(function(){
  var root=document.documentElement;
  root.style.setProperty('background','transparent','important');
  root.style.setProperty('background-color','transparent','important');
  root.style.colorScheme='normal';
  if(document.body){
    document.body.style.setProperty('background','transparent','important');
    document.body.style.setProperty('background-color','transparent','important');
  }
  var el=document.getElementById('root');
  if(el){
    el.style.setProperty('background','transparent','important');
    el.style.setProperty('background-color','transparent','important');
  }
})()"#,
    );
}

/// Re-clear pet chrome after focus/drag races settle (chat becoming key, etc.).
pub fn ensure_pet_transparent_after_focus_race(app: &AppHandle) {
    ensure_pet_transparent(app);
    let handle = app.clone();
    std::thread::spawn(move || {
        for delay_ms in [16_u64, 50, 150, 400] {
            std::thread::sleep(std::time::Duration::from_millis(delay_ms));
            let app = handle.clone();
            let _ = handle.run_on_main_thread(move || {
                ensure_pet_transparent(&app);
            });
        }
    });
}

/// Periodically re-assert pet transparency on the **main thread**.
/// Calling AppKit/WebView chrome APIs from a worker thread can itself
/// corrupt the transparent layer into a gray rectangle.
pub fn spawn_pet_transparency_watchdog(app: &AppHandle) {
    let handle = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(2));
        let app = handle.clone();
        let _ = handle.run_on_main_thread(move || {
            ensure_pet_transparent(&app);
        });
    });
}

pub fn home_url(base_url: &str) -> Result<String, String> {
    let base_url = base_url.trim().trim_end_matches('/');
    if base_url.is_empty() {
        return Err("base URL cannot be empty".into());
    }
    Ok(format!("{base_url}/"))
}

/// Horizontally center a window and pin it near the bottom of the work area.
pub fn bottom_centered_position(
    window_size: (u32, u32),
    work_position: (i32, i32),
    work_size: (u32, u32),
    bottom_gap: i32,
) -> (i32, i32) {
    let win_w = window_size.0 as i64;
    let win_h = window_size.1 as i64;
    let work_left = work_position.0 as i64;
    let work_top = work_position.1 as i64;
    let work_w = work_size.0 as i64;
    let work_h = work_size.1 as i64;
    let gap = i64::from(bottom_gap.max(0));

    let desired_x = work_left + (work_w - win_w) / 2;
    let desired_y = work_top + work_h - win_h - gap;
    let max_x = (work_left + work_w - win_w).max(work_left);
    let max_y = (work_top + work_h - win_h).max(work_top);

    (
        desired_x.clamp(work_left, max_x) as i32,
        desired_y.clamp(work_top, max_y) as i32,
    )
}

/// Horizontally and vertically center a window in the monitor work area.
pub fn centered_position(
    window_size: (u32, u32),
    work_position: (i32, i32),
    work_size: (u32, u32),
) -> (i32, i32) {
    let win_w = window_size.0 as i64;
    let win_h = window_size.1 as i64;
    let work_left = work_position.0 as i64;
    let work_top = work_position.1 as i64;
    let work_w = work_size.0 as i64;
    let work_h = work_size.1 as i64;

    let desired_x = work_left + (work_w - win_w) / 2;
    let desired_y = work_top + (work_h - win_h) / 2;
    let max_x = (work_left + work_w - win_w).max(work_left);
    let max_y = (work_top + work_h - win_h).max(work_top);

    (
        desired_x.clamp(work_left, max_x) as i32,
        desired_y.clamp(work_top, max_y) as i32,
    )
}

fn place_bottom_centered(
    win: &tauri::WebviewWindow,
    bottom_gap_logical: f64,
) -> Result<(), String> {
    let size = win
        .outer_size()
        .map_err(|error| format!("failed to read window size: {error}"))?;
    let monitor = win
        .current_monitor()
        .map_err(|error| format!("failed to find window monitor: {error}"))?
        .ok_or_else(|| "window is not on an available monitor".to_string())?;
    let work = monitor.work_area();
    let gap = (bottom_gap_logical * monitor.scale_factor()).round() as i32;
    let (x, y) = bottom_centered_position(
        (size.width, size.height),
        (work.position.x, work.position.y),
        (work.size.width, work.size.height),
        gap,
    );
    win.set_position(PhysicalPosition::new(x, y))
        .map_err(|error| format!("failed to position window: {error}"))
}

fn place_centered(win: &tauri::WebviewWindow) -> Result<(), String> {
    let size = win
        .outer_size()
        .map_err(|error| format!("failed to read window size: {error}"))?;
    let monitor = win
        .current_monitor()
        .map_err(|error| format!("failed to find window monitor: {error}"))?
        .ok_or_else(|| "window is not on an available monitor".to_string())?;
    let work = monitor.work_area();
    let (x, y) = centered_position(
        (size.width, size.height),
        (work.position.x, work.position.y),
        (work.size.width, work.size.height),
    );
    win.set_position(PhysicalPosition::new(x, y))
        .map_err(|error| format!("failed to position window: {error}"))
}

#[tauri::command]
pub fn place_window_bottom_center(app: AppHandle, label: String) -> Result<(), String> {
    let win = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("{label} window not found"))?;
    place_bottom_centered(&win, CHAT_BOTTOM_GAP_LOGICAL)
}

#[tauri::command]
pub fn place_window_centered(app: AppHandle, label: String) -> Result<(), String> {
    let win = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("{label} window not found"))?;
    place_centered(&win)
}

#[tauri::command]
pub fn open_home(app: AppHandle, base_url: String) -> Result<(), String> {
    app.opener()
        .open_url(home_url(&base_url)?, None::<String>)
        .map_err(|error| format!("failed to open home URL: {error}"))
}

#[tauri::command]
pub fn show_chat_near_pet(app: AppHandle) -> Result<(), String> {
    let chat = app
        .get_webview_window("chat")
        .ok_or_else(|| "chat window not found".to_string())?;

    chat.show()
        .map_err(|error| format!("failed to show chat window: {error}"))?;
    // First open only: place bottom-center. Later opens keep the last position
    // (including after hide), so double-clicks / re-opens do not jump.
    if !CHAT_HAS_BEEN_SHOWN.swap(true, Ordering::SeqCst) {
        place_bottom_centered(&chat, CHAT_BOTTOM_GAP_LOGICAL)?;
    }
    chat.set_focus()
        .map_err(|error| format!("failed to focus chat window: {error}"))?;
    let _ = chat.emit("chat-shown", ());
    // Chat becoming key resigns the pet — clear chrome after the race settles.
    ensure_pet_transparent_after_focus_race(&app);
    Ok(())
}

#[tauri::command]
pub fn hide_chat(app: AppHandle) -> Result<(), String> {
    app.get_webview_window("chat")
        .ok_or_else(|| "chat window not found".to_string())?
        .hide()
        .map_err(|error| format!("failed to hide chat window: {error}"))
}

#[tauri::command]
pub fn hide_pet(app: AppHandle) -> Result<(), String> {
    ensure_pet_transparent(&app);
    app.get_webview_window("pet")
        .ok_or_else(|| "pet window not found".to_string())?
        .hide()
        .map_err(|error| format!("failed to hide pet window: {error}"))
}

#[tauri::command]
pub fn show_settings(app: AppHandle) -> Result<(), String> {
    let settings = app
        .get_webview_window("settings")
        .ok_or_else(|| "settings window not found".to_string())?;
    settings
        .show()
        .map_err(|error| format!("failed to show settings window: {error}"))?;
    // First open only: true center. Later opens (and tab refits) keep position.
    if !SETTINGS_HAS_BEEN_SHOWN.swap(true, Ordering::SeqCst) {
        place_centered(&settings)?;
    }
    settings
        .set_focus()
        .map_err(|error| format!("failed to focus settings window: {error}"))?;
    let _ = settings.emit("settings-shown", ());
    Ok(())
}
