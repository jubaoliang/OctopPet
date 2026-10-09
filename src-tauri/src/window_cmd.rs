use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{
    window::Color, AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, WebviewWindow,
};
use tauri_plugin_opener::OpenerExt;

/// Logical pixels between the chat window bottom edge and the work-area bottom.
pub const CHAT_BOTTOM_GAP_LOGICAL: f64 = 96.0;

/// Back-compat alias used by older call sites / docs.
pub const BOTTOM_GAP_LOGICAL: f64 = CHAT_BOTTOM_GAP_LOGICAL;

static SETTINGS_HAS_BEEN_SHOWN: AtomicBool = AtomicBool::new(false);
static KEEP_WINDOWS_VISIBLE: AtomicBool = AtomicBool::new(true);

pub fn should_hide_on_close(label: &str) -> bool {
    matches!(label, "chat" | "settings")
}

pub struct PetWorkArea {
    pub position: (i32, i32),
    pub size: (u32, u32),
    pub scale_factor: f64,
}

/// Keep the whole pet inside the closest available work area, in physical pixels.
pub fn pet_position(
    position: (i32, i32),
    logical_size: f64,
    work_areas: &[PetWorkArea],
) -> Option<(i32, i32)> {
    work_areas
        .iter()
        .map(|area| {
            let left = i64::from(area.position.0);
            let top = i64::from(area.position.1);
            let size = (logical_size * area.scale_factor).round() as i64;
            let max_x = (left + i64::from(area.size.0) - size).max(left);
            let max_y = (top + i64::from(area.size.1) - size).max(top);
            (
                i64::from(position.0).clamp(left, max_x) as i32,
                i64::from(position.1).clamp(top, max_y) as i32,
            )
        })
        .min_by_key(|&(x, y)| {
            let dx = i128::from(x) - i128::from(position.0);
            let dy = i128::from(y) - i128::from(position.1);
            dx * dx + dy * dy
        })
}

fn position_pet_on_screen(
    app: &AppHandle,
    requested: Option<PhysicalPosition<i32>>,
) -> Result<PhysicalPosition<i32>, String> {
    let pet = app
        .get_webview_window("pet")
        .ok_or_else(|| "pet window not found".to_string())?;
    let current = pet
        .outer_position()
        .map_err(|error| format!("failed to read pet position: {error}"))?;
    let position = requested.unwrap_or(current);
    let size = pet
        .inner_size()
        .map_err(|error| format!("failed to read pet size: {error}"))?;
    let scale = pet
        .scale_factor()
        .map_err(|error| format!("failed to read pet scale factor: {error}"))?;
    let work_areas = pet
        .available_monitors()
        .map_err(|error| format!("failed to find pet monitors: {error}"))?
        .iter()
        .map(|monitor| {
            let area = monitor.work_area();
            PetWorkArea {
                position: (area.position.x, area.position.y),
                size: (area.size.width, area.size.height),
                scale_factor: monitor.scale_factor(),
            }
        })
        .collect::<Vec<_>>();
    let (x, y) = pet_position(
        (position.x, position.y),
        f64::from(size.width) / scale,
        &work_areas,
    )
    .ok_or_else(|| "no available monitor for pet window".to_string())?;
    let corrected = PhysicalPosition::new(x, y);
    if current != corrected {
        pet.set_position(corrected)
            .map_err(|error| format!("failed to position pet window: {error}"))?;
    }
    crate::config_cmd::patch_config(app.clone(), serde_json::json!({ "petX": x, "petY": y }))?;
    Ok(corrected)
}

pub fn ensure_pet_on_screen(app: &AppHandle) -> Result<(), String> {
    position_pet_on_screen(app, None).map(|_| ())
}

#[tauri::command]
pub fn restore_pet_position(app: AppHandle) -> Result<PhysicalPosition<i32>, String> {
    let cfg = crate::config_cmd::load_config(app.clone())?;
    let requested = cfg
        .pet_x
        .zip(cfg.pet_y)
        .map(|(x, y)| PhysicalPosition::new(x.round() as i32, y.round() as i32));
    position_pet_on_screen(&app, requested)
}

/// Chat and settings hide on click-away only when the setting is off.
/// The pet never hides this way.
pub fn should_hide_on_unfocus(label: &str, keep_windows_visible: bool) -> bool {
    !keep_windows_visible && matches!(label, "chat" | "settings")
}

fn keep_windows_visible() -> bool {
    KEEP_WINDOWS_VISIBLE.load(Ordering::SeqCst)
}

/// Apply macOS hide-on-deactivate / Transient vs Stationary.
fn apply_macos_deactivate_behavior(window: &WebviewWindow, keep_visible: bool) {
    #[cfg(target_os = "macos")]
    {
        let _ = window.with_webview(move |webview| {
            use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior};
            unsafe {
                let ns_window: &NSWindow = &*webview.ns_window().cast();
                ns_window.setHidesOnDeactivate(!keep_visible);
                let mut behavior = ns_window.collectionBehavior();
                if keep_visible {
                    behavior.remove(NSWindowCollectionBehavior::Transient);
                    behavior.insert(NSWindowCollectionBehavior::Stationary);
                } else {
                    behavior.remove(NSWindowCollectionBehavior::Stationary);
                    behavior.insert(NSWindowCollectionBehavior::Transient);
                }
                ns_window.setCollectionBehavior(behavior);
            }
        });
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = window;
        let _ = keep_visible;
    }
}

/// Keep a window on screen after the user clicks another app.
pub fn keep_visible_on_app_deactivate(window: &WebviewWindow) {
    apply_macos_deactivate_behavior(window, true);
}

/// Load the setting and apply it to chat/settings. Pet always stays visible.
#[tauri::command]
pub fn apply_window_deactivate_policy(app: AppHandle) -> Result<(), String> {
    let keep = crate::config_cmd::load_config(app.clone())
        .map(|cfg| cfg.keep_windows_visible)
        .unwrap_or(true);
    KEEP_WINDOWS_VISIBLE.store(keep, Ordering::SeqCst);

    if let Some(pet) = app.get_webview_window("pet") {
        keep_visible_on_app_deactivate(&pet);
    }
    if let Some(chat) = app.get_webview_window("chat") {
        let _ = chat.set_always_on_top(keep);
        apply_macos_deactivate_behavior(&chat, keep);
    }
    if let Some(settings) = app.get_webview_window("settings") {
        apply_macos_deactivate_behavior(&settings, keep);
    }
    Ok(())
}

pub fn handle_window_focus_change(window: &tauri::Window, focused: bool) {
    let label = window.label();
    if label == "pet" {
        ensure_pet_transparent(window.app_handle());
        return;
    }

    // Windows: click/focus can GDI-fill the HWND; re-clear dialog chrome so
    // CSS border-radius corners stay transparent.
    if focused && matches!(label, "chat" | "settings") {
        if let Some(win) = window.app_handle().get_webview_window(label) {
            ensure_dialog_window_transparent(&win);
        }
    }

    if keep_windows_visible() {
        if let Some(win) = window.app_handle().get_webview_window(label) {
            apply_macos_deactivate_behavior(&win, true);
            if label == "chat" {
                let _ = win.set_always_on_top(true);
            }
        }
        return;
    }

    if !focused && should_hide_on_unfocus(label, false) {
        let _ = window.hide();
    }
}

#[cfg(windows)]
mod windows_dwm {
    use std::ffi::{c_char, c_void};

    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    use tauri::WebviewWindow;

    /// Windows 11 DWMWA_COLOR_NONE — hide the 1px HWND border.
    const COLOR_NONE: u32 = 0xFFFF_FFFE;
    const DWMWA_BORDER_COLOR: u32 = 34;
    const DWMWA_WINDOW_CORNER_PREFERENCE: u32 = 33;
    const DWMWCP_DONOTROUND: i32 = 1;
    /// Win11 22H2+ — disable Mica/Acrylic so DWM does not paint an opaque sheet.
    const DWMWA_SYSTEMBACKDROP_TYPE: u32 = 38;
    const DWMSBT_NONE: i32 = 1;
    /// Skip DWM move/restore animations; those snapshots show a white HWND.
    const DWMWA_TRANSITIONS_FORCEDISABLED: u32 = 3;

    const DWM_BB_ENABLE: u32 = 0x1;
    const DWM_BB_BLURREGION: u32 = 0x2;

    const ACCENT_ENABLE_TRANSPARENTGRADIENT: u32 = 2;
    const WCA_ACCENT_POLICY: u32 = 0x13;

    const GCLP_HBRBACKGROUND: i32 = -10;
    const GWL_STYLE: i32 = -16;
    const GWL_EXSTYLE: i32 = -20;
    const NULL_BRUSH: i32 = 5;
    const WM_ERASEBKGND: u32 = 0x0014;
    const WM_NCCALCSIZE: u32 = 0x0083;
    const WM_NCPAINT: u32 = 0x0085;
    const WM_NCACTIVATE: u32 = 0x0086;
    const WM_WINDOWPOSCHANGING: u32 = 0x0046;
    const SWP_NOCOPYBITS: u32 = 0x0100;
    const SWP_NOSIZE: u32 = 0x0001;
    const SWP_NOMOVE: u32 = 0x0002;
    const SWP_NOZORDER: u32 = 0x0004;
    const SWP_NOACTIVATE: u32 = 0x0010;
    const SWP_FRAMECHANGED: u32 = 0x0020;
    const WS_CAPTION: u32 = 0x00C0_0000;
    const WS_SYSMENU: u32 = 0x0008_0000;
    const WS_THICKFRAME: u32 = 0x0004_0000;
    const WS_MINIMIZEBOX: u32 = 0x0002_0000;
    const WS_MAXIMIZEBOX: u32 = 0x0001_0000;
    const WS_POPUP: u32 = 0x8000_0000;
    const WS_EX_DLGMODALFRAME: u32 = 0x0000_0001;
    const WS_EX_WINDOWEDGE: u32 = 0x0000_0100;
    const WS_EX_CLIENTEDGE: u32 = 0x0000_0200;
    const WS_EX_STATICEDGE: u32 = 0x0002_0000;
    /// Win11 — hide caption fill when a residual NC strip remains.
    const DWMWA_CAPTION_COLOR: u32 = 35;
    const PET_SUBCLASS_ID: usize = 0x0C70_B7E7;

    #[repr(C)]
    struct BlurBehind {
        dw_flags: u32,
        f_enable: i32,
        h_rgn_blur: *mut c_void,
        f_transition_on_maximized: i32,
    }

    #[repr(C)]
    struct AccentPolicy {
        accent_state: u32,
        accent_flags: u32,
        gradient_color: u32,
        animation_id: u32,
    }

    #[repr(C)]
    struct WindowCompositionAttribData {
        attrib: u32,
        pv_data: *mut c_void,
        cb_data: usize,
    }

    #[repr(C)]
    struct WindowPos {
        hwnd: isize,
        hwnd_insert_after: isize,
        x: i32,
        y: i32,
        cx: i32,
        cy: i32,
        flags: u32,
    }

    #[link(name = "dwmapi")]
    extern "system" {
        fn DwmSetWindowAttribute(
            hwnd: isize,
            dw_attribute: u32,
            pv_attribute: *const c_void,
            cb_attribute: u32,
        ) -> i32;
        fn DwmEnableBlurBehindWindow(hwnd: isize, blur: *const BlurBehind) -> i32;
    }

    #[link(name = "gdi32")]
    extern "system" {
        fn CreateRectRgn(x1: i32, y1: i32, x2: i32, y2: i32) -> *mut c_void;
        fn DeleteObject(ho: *mut c_void) -> i32;
        fn GetStockObject(index: i32) -> *mut c_void;
    }

    #[link(name = "user32")]
    extern "system" {
        fn SetClassLongPtrW(hwnd: isize, n_index: i32, dw_new_long: isize) -> isize;
        fn GetWindowLongPtrW(hwnd: isize, n_index: i32) -> isize;
        fn SetWindowLongPtrW(hwnd: isize, n_index: i32, dw_new_long: isize) -> isize;
        fn SetWindowPos(
            hwnd: isize,
            insert_after: isize,
            x: i32,
            y: i32,
            cx: i32,
            cy: i32,
            flags: u32,
        ) -> i32;
        fn EnumChildWindows(
            hwnd: isize,
            callback: Option<unsafe extern "system" fn(isize, isize) -> i32>,
            lparam: isize,
        ) -> i32;
    }

    #[link(name = "comctl32")]
    extern "system" {
        fn SetWindowSubclass(
            hwnd: isize,
            pfn: unsafe extern "system" fn(isize, u32, usize, isize, usize, usize) -> isize,
            uid: usize,
            dw_ref: usize,
        ) -> i32;
        fn DefSubclassProc(hwnd: isize, msg: u32, wparam: usize, lparam: isize) -> isize;
        fn InitCommonControlsEx(picce: *const InitCtrls) -> i32;
    }

    #[repr(C)]
    struct InitCtrls {
        size: u32,
        icc: u32,
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GetModuleHandleA(name: *const c_char) -> isize;
        fn GetProcAddress(module: isize, name: *const c_char) -> *const c_void;
    }

    fn strip_caption(hwnd: isize) {
        unsafe {
            let style = GetWindowLongPtrW(hwnd, GWL_STYLE) as u32;
            let stripped = (style | WS_POPUP)
                & !(WS_CAPTION | WS_THICKFRAME | WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX);
            let _ = SetWindowLongPtrW(hwnd, GWL_STYLE, stripped as isize);

            let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
            let ex_stripped = ex
                & !(WS_EX_DLGMODALFRAME | WS_EX_WINDOWEDGE | WS_EX_CLIENTEDGE | WS_EX_STATICEDGE);
            let _ = SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex_stripped as isize);

            // Always FRAMECHANGED so WM_NCCALCSIZE runs even when styles look unchanged.
            let _ = SetWindowPos(
                hwnd,
                0,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
            );
        }
    }

    fn set_hollow_background_brush(hwnd: isize) {
        unsafe {
            let brush = GetStockObject(NULL_BRUSH);
            let _ = SetClassLongPtrW(hwnd, GCLP_HBRBACKGROUND, brush as isize);
        }
    }

    unsafe extern "system" fn clear_child_brush(hwnd: isize, _lparam: isize) -> i32 {
        set_hollow_background_brush(hwnd);
        1
    }

    /// Pet HWND: never GDI-fill the client (that is the white square), force
    /// zero non-client area (the white title strip), and do not blit stale
    /// bits while the window moves.
    ///
    /// Codex's Electron pet never hits this path: Chromium owns a layered
    /// window with per-pixel alpha and moves via `setBounds`. tao instead
    /// `FillRect`s `background_color` on WM_ERASEBKGND and ignores alpha.
    unsafe extern "system" fn pet_subclass_proc(
        hwnd: isize,
        msg: u32,
        wparam: usize,
        lparam: isize,
        _uid: usize,
        _data: usize,
    ) -> isize {
        // SAFETY: HWND/LPARAM come from the window procedure; DefSubclassProc
        // is the matching comctl32 pair for SetWindowSubclass.
        unsafe {
            match msg {
                WM_ERASEBKGND => 1,
                // wparam TRUE: client rect == window rect → no title-bar strip.
                WM_NCCALCSIZE if wparam != 0 => 0,
                WM_NCPAINT => 0,
                WM_NCACTIVATE => 1,
                WM_WINDOWPOSCHANGING => {
                    if lparam != 0 {
                        let pos = lparam as *mut WindowPos;
                        (*pos).flags |= SWP_NOCOPYBITS;
                    }
                    DefSubclassProc(hwnd, msg, wparam, lparam)
                }
                _ => DefSubclassProc(hwnd, msg, wparam, lparam),
            }
        }
    }

    fn install_pet_subclass(hwnd: isize) {
        set_hollow_background_brush(hwnd);
        unsafe {
            let init = InitCtrls {
                size: std::mem::size_of::<InitCtrls>() as u32,
                icc: 0x0000_00FF,
            };
            let _ = InitCommonControlsEx(&init);
            let _ = EnumChildWindows(hwnd, Some(clear_child_brush), 0);
            // Same subclass id on different HWNDs is fine; repeat calls for the
            // same hwnd+id are ignored by comctl32.
            let _ = SetWindowSubclass(hwnd, pet_subclass_proc, PET_SUBCLASS_ID, 0);
        }
        strip_caption(hwnd);
    }

    fn set_window_attribute(hwnd: isize, attribute: u32, value: *const c_void, size: u32) {
        unsafe {
            let _ = DwmSetWindowAttribute(hwnd, attribute, value, size);
        }
    }

    /// Empty blur region = fully transparent client (same path tao uses at create).
    fn enable_empty_blur_behind(hwnd: isize) {
        unsafe {
            let region = CreateRectRgn(0, 0, -1, -1);
            let blur = BlurBehind {
                dw_flags: DWM_BB_ENABLE | DWM_BB_BLURREGION,
                f_enable: 1,
                h_rgn_blur: region,
                f_transition_on_maximized: 0,
            };
            let _ = DwmEnableBlurBehindWindow(hwnd, &blur);
            if !region.is_null() {
                let _ = DeleteObject(region);
            }
        }
    }

    /// Win10+ overlay path: transparent HWND backdrop so WebView2 alpha shows the desktop.
    fn enable_transparent_accent(hwnd: isize) {
        type SetWindowCompositionAttribute =
            unsafe extern "system" fn(isize, *mut WindowCompositionAttribData) -> i32;
        unsafe {
            let user32 = GetModuleHandleA(c"user32.dll".as_ptr());
            if user32 == 0 {
                return;
            }
            let proc = GetProcAddress(user32, c"SetWindowCompositionAttribute".as_ptr());
            if proc.is_null() {
                return;
            }
            // SAFETY: GetProcAddress returned a user32 export with this signature.
            let set: SetWindowCompositionAttribute =
                std::mem::transmute::<*const c_void, SetWindowCompositionAttribute>(proc);
            let mut policy = AccentPolicy {
                accent_state: ACCENT_ENABLE_TRANSPARENTGRADIENT,
                accent_flags: 2,
                gradient_color: 0,
                animation_id: 0,
            };
            let mut data = WindowCompositionAttribData {
                attrib: WCA_ACCENT_POLICY,
                pv_data: (&mut policy as *mut AccentPolicy).cast(),
                cb_data: std::mem::size_of::<AccentPolicy>(),
            };
            let _ = set(hwnd, &mut data);
        }
    }

    fn apply_transparent_chrome_hwnd(hwnd: isize) {
        let color = COLOR_NONE;
        set_window_attribute(
            hwnd,
            DWMWA_BORDER_COLOR,
            (&color as *const u32).cast(),
            std::mem::size_of_val(&color) as u32,
        );
        set_window_attribute(
            hwnd,
            DWMWA_CAPTION_COLOR,
            (&color as *const u32).cast(),
            std::mem::size_of_val(&color) as u32,
        );
        let preference = DWMWCP_DONOTROUND;
        set_window_attribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            (&preference as *const i32).cast(),
            std::mem::size_of_val(&preference) as u32,
        );
        let backdrop = DWMSBT_NONE;
        set_window_attribute(
            hwnd,
            DWMWA_SYSTEMBACKDROP_TYPE,
            (&backdrop as *const i32).cast(),
            std::mem::size_of_val(&backdrop) as u32,
        );
        let disable_transitions: i32 = 1;
        set_window_attribute(
            hwnd,
            DWMWA_TRANSITIONS_FORCEDISABLED,
            (&disable_transitions as *const i32).cast(),
            std::mem::size_of_val(&disable_transitions) as u32,
        );
        // Do not call DwmExtendFrameIntoClientArea: margins of -1 paint a white
        // glass sheet + caption buttons; margins of 0 undo tao's blur-behind.
        enable_empty_blur_behind(hwnd);
        enable_transparent_accent(hwnd);
        strip_caption(hwnd);
        set_hollow_background_brush(hwnd);
        unsafe {
            let _ = EnumChildWindows(hwnd, Some(clear_child_brush), 0);
        }
    }

    pub fn apply_transparent_chrome(window: &WebviewWindow) {
        let hwnd = match window.window_handle().ok().map(|h| h.as_raw()) {
            Some(RawWindowHandle::Win32(handle)) => handle.hwnd.get(),
            _ => return,
        };
        apply_transparent_chrome_hwnd(hwnd);
        // Pet + chat/settings all need hollow erase; otherwise CSS border-radius
        // corners show the HWND white fill (especially on focus/click).
        install_pet_subclass(hwnd);
    }
}

#[cfg(not(windows))]
fn apply_windows_dwm_transparent_chrome(_window: &WebviewWindow) {}

#[cfg(windows)]
fn apply_windows_dwm_transparent_chrome(window: &WebviewWindow) {
    windows_dwm::apply_transparent_chrome(window);
}

/// Chat/settings: on Windows, OS `shadow` is a rectangular NC inset that
/// reads as an outer frame around the CSS-rounded card.
pub fn ensure_dialog_window_transparent(window: &WebviewWindow) {
    #[cfg(windows)]
    {
        // Avoid Tauri set_decorations/set_shadow — they rewrite GWL_STYLE and
        // can restore a caption. Strip styles in DWM chrome instead.
        if let Err(error) = window
            .as_ref()
            .set_background_color(Some(Color(0, 0, 0, 0)))
        {
            eprintln!(
                "failed to clear {} webview background: {error}",
                window.label()
            );
        }
        apply_windows_dwm_transparent_chrome(window);
    }
    #[cfg(not(windows))]
    {
        let _ = window;
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransparentChromeTarget {
    Pet,
    Dialog,
}

pub fn transparent_chrome_target(label: &str) -> Option<TransparentChromeTarget> {
    match label {
        "pet" => Some(TransparentChromeTarget::Pet),
        "chat" | "settings" => Some(TransparentChromeTarget::Dialog),
        _ => None,
    }
}

pub fn ensure_window_surface_transparent(window: &tauri::Window) {
    match transparent_chrome_target(window.label()) {
        Some(TransparentChromeTarget::Pet) => ensure_pet_transparent(window.app_handle()),
        Some(TransparentChromeTarget::Dialog) => {
            if let Some(win) = window.app_handle().get_webview_window(window.label()) {
                ensure_dialog_window_transparent(&win);
            }
        }
        None => {}
    }
}

/// Apply Windows transparent chrome to chat/settings (pet is handled separately).
pub fn ensure_dialog_windows_transparent(app: &AppHandle) {
    for label in ["chat", "settings"] {
        if let Some(win) = app.get_webview_window(label) {
            ensure_dialog_window_transparent(&win);
        }
    }
}

/// macOS often paints an opaque gray canvas / OS shadow on the pet window
/// when it enters drag mode or resigns key (e.g. chat takes focus).
/// Windows 11 also draws a 1px HWND border and an opaque client canvas.
/// Re-assert clear background / no OS shadow on the main thread.
pub fn ensure_pet_transparent(app: &AppHandle) {
    let Some(pet) = app.get_webview_window("pet") else {
        return;
    };
    let _ = pet.set_focusable(false);
    // Empty title so a residual Windows caption bar does not show "OctopPet".
    let _ = pet.set_title("");
    // Windows: Tauri set_decorations/set_shadow rewrites GWL_STYLE and can
    // restore WS_CAPTION (the title-bar window after clicking the pet).
    // Strip the caption in DWM chrome instead.
    #[cfg(not(windows))]
    {
        if let Err(error) = pet.set_decorations(false) {
            eprintln!("failed to disable pet decorations: {error}");
        }
        if let Err(error) = pet.set_shadow(false) {
            eprintln!("failed to disable pet shadow: {error}");
        }
    }
    // Windows: `WebviewWindow::set_background_color` also sets the HWND layer.
    // tao's WM_ERASEBKGND does FillRect(RGB) and **ignores alpha**, so
    // Color(0,0,0,0) becomes an opaque square while dragging. Codex's Electron
    // pet avoids this because Chromium owns per-pixel alpha (no GDI fill).
    // Keep DefaultBackgroundColor on the WebView2 controller only.
    #[cfg(windows)]
    if let Err(error) = pet.as_ref().set_background_color(Some(Color(0, 0, 0, 0))) {
        eprintln!("failed to clear pet webview background: {error}");
    }
    #[cfg(not(windows))]
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
    apply_windows_dwm_transparent_chrome(&pet);
    keep_visible_on_app_deactivate(&pet);

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
            reassert_pet_surface(&app);
        });
    });
}

/// Windows: DWM + clear canvas only. `set_shadow` / decorations every 2s
/// re-introduces the white HWND during drag.
fn reassert_pet_surface(app: &AppHandle) {
    #[cfg(windows)]
    {
        let Some(pet) = app.get_webview_window("pet") else {
            return;
        };
        apply_windows_dwm_transparent_chrome(&pet);
        let _ = pet.as_ref().set_background_color(Some(Color(0, 0, 0, 0)));
    }
    #[cfg(not(windows))]
    {
        ensure_pet_transparent(app);
    }
}

pub fn home_url(base_url: &str) -> Result<String, String> {
    let base_url = base_url.trim().trim_end_matches('/');
    if base_url.is_empty() {
        return Err("base URL cannot be empty".into());
    }
    Ok(format!("{base_url}/"))
}

/// macOS window resize animation. AppKit's default `setFrame:animate:` is ~0.2s
/// and reads as a snap for compact ↔ expanded chat.
pub const RESIZE_ANIMATION_DURATION: f64 = 0.36;

/// Keep the top-left origin's x, and shift y so the bottom edge stays put.
pub fn bottom_anchored_position(
    old_position: (i32, i32),
    old_outer: (u32, u32),
    new_outer: (u32, u32),
) -> (i32, i32) {
    let dy = old_outer.1 as i32 - new_outer.1 as i32;
    (old_position.0, old_position.1 + dy)
}

fn apply_bottom_anchored_size_fallback(
    window: &WebviewWindow,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let old_outer = window
        .outer_size()
        .map_err(|error| format!("failed to read window size: {error}"))?;
    let old_pos = window
        .outer_position()
        .map_err(|error| format!("failed to read window position: {error}"))?;
    window
        .set_size(LogicalSize::new(width, height))
        .map_err(|error| format!("failed to resize window: {error}"))?;
    let new_outer = window
        .outer_size()
        .map_err(|error| format!("failed to read window size: {error}"))?;
    let (x, y) = bottom_anchored_position(
        (old_pos.x, old_pos.y),
        (old_outer.width, old_outer.height),
        (new_outer.width, new_outer.height),
    );
    if x != old_pos.x || y != old_pos.y {
        window
            .set_position(PhysicalPosition::new(x, y))
            .map_err(|error| format!("failed to position window: {error}"))?;
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn apply_bottom_anchored_size_macos(
    window: &WebviewWindow,
    width: f64,
    height: f64,
    animate: bool,
) -> Result<(), String> {
    let scale = window
        .scale_factor()
        .map_err(|error| format!("failed to read scale factor: {error}"))?;
    let inner = window
        .inner_size()
        .map_err(|error| format!("failed to read inner size: {error}"))?;
    let outer = window
        .outer_size()
        .map_err(|error| format!("failed to read window size: {error}"))?;
    let extra_w = (outer.width as f64 - inner.width as f64) / scale;
    let extra_h = (outer.height as f64 - inner.height as f64) / scale;
    let frame_w = width + extra_w;
    let frame_h = height + extra_h;
    window
        .with_webview(move |webview| {
            use objc2_app_kit::{NSAnimatablePropertyContainer, NSAnimationContext, NSWindow};
            use objc2_quartz_core::{kCAMediaTimingFunctionEaseInEaseOut, CAMediaTimingFunction};
            unsafe {
                let ns_window: &NSWindow = &*webview.ns_window().cast();
                let mut frame = ns_window.frame();
                // AppKit origin is bottom-left, so keeping origin.y pins the bottom edge.
                frame.size.width = frame_w;
                frame.size.height = frame_h;
                if !animate {
                    ns_window.setFrame_display(frame, true);
                    return;
                }
                NSAnimationContext::beginGrouping();
                let ctx = NSAnimationContext::currentContext();
                ctx.setDuration(RESIZE_ANIMATION_DURATION);
                ctx.setTimingFunction(Some(&CAMediaTimingFunction::functionWithName(
                    kCAMediaTimingFunctionEaseInEaseOut,
                )));
                ns_window.animator().setFrame_display(frame, true);
                NSAnimationContext::endGrouping();
            }
        })
        .map_err(|error| format!("failed to resize window: {error}"))
}

/// Resize the calling window while keeping its bottom edge in place.
/// On macOS this uses a single `NSWindow` frame change (optionally animated).
#[tauri::command]
pub fn apply_bottom_anchored_size(
    window: WebviewWindow,
    width: f64,
    height: f64,
    animate: Option<bool>,
) -> Result<(), String> {
    if width < 1.0 || height < 1.0 {
        return Err("window size must be positive".into());
    }
    let animate = animate.unwrap_or(false);
    #[cfg(target_os = "macos")]
    {
        match apply_bottom_anchored_size_macos(&window, width, height, animate) {
            Ok(()) => return Ok(()),
            Err(error) => eprintln!("macos bottom-anchored resize failed: {error}"),
        }
    }
    #[cfg(not(target_os = "macos"))]
    let _ = animate;
    apply_bottom_anchored_size_fallback(&window, width, height)
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

/// Place the chat window beside the pet: prefer the pet's right side, else left.
/// Clamp into the monitor work area so the chat stays on-screen.
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

fn place_chat_near_pet(app: &AppHandle, chat: &WebviewWindow) -> Result<(), String> {
    let pet = app
        .get_webview_window("pet")
        .ok_or_else(|| "pet window not found".to_string())?;
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
        .map_err(|error| format!("failed to position chat window: {error}"))
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

    // Always dock beside the pet: hide/re-open and pet moves should follow the icon.
    place_chat_near_pet(&app, &chat)?;
    // Apply chrome before the first paint so show() does not flash a white HWND.
    ensure_dialog_window_transparent(&chat);
    ensure_pet_transparent(&app);
    chat.show()
        .map_err(|error| format!("failed to show chat window: {error}"))?;
    apply_window_deactivate_policy(app.clone())?;
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
    ensure_dialog_window_transparent(&settings);
    settings
        .show()
        .map_err(|error| format!("failed to show settings window: {error}"))?;
    apply_window_deactivate_policy(app.clone())?;
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
