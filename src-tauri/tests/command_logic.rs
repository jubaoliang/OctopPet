use std::{
    collections::HashMap,
    fs,
    time::{SystemTime, UNIX_EPOCH},
};

use octop_pet_lib::{
    config_cmd::{load_from_path, patch_at_path, save_to_path, select_mascot, AppConfig},
    secrets_cmd::{
        delete_secret_from_file, get_secret_from_file, secret_account, set_secret_in_file,
        validate_secret_key,
    },
    window_cmd::{
        bottom_anchored_position, bottom_centered_position, centered_position, chat_position,
        home_url, pet_position, should_hide_on_close, should_hide_on_unfocus,
        transparent_chrome_target, PetWorkArea, TransparentChromeTarget, CHAT_BOTTOM_GAP_LOGICAL,
        RESIZE_ANIMATION_DURATION,
    },
};

#[test]
fn app_config_defaults_match_the_frontend() {
    assert_eq!(
        AppConfig::default(),
        AppConfig {
            base_url: String::new(),
            username: String::new(),
            mascot_id: "peek".into(),
            last_agent_id: None,
            thread_id_by_agent: HashMap::new(),
            pet_x: None,
            pet_y: None,
            pet_size: 160.0,
            shortcut_open_pet: "CmdOrCtrl+Shift+O".into(),
            shortcut_open_home: "CmdOrCtrl+Shift+H".into(),
            keep_windows_visible: true,
        }
    );
}

#[test]
fn app_config_serializes_with_frontend_field_names() {
    let value = serde_json::to_value(AppConfig::default()).unwrap();

    assert!(value.get("baseUrl").is_some());
    assert!(value.get("mascotId").is_some());
    assert!(value.get("lastAgentId").is_some());
    assert!(value.get("threadIdByAgent").is_some());
    assert!(value.get("petX").is_some());
    assert!(value.get("petY").is_some());
    assert!(value.get("petSize").is_some());
    assert!(value.get("shortcutOpenPet").is_some());
    assert!(value.get("shortcutOpenHome").is_some());
    assert!(value.get("keepWindowsVisible").is_some());
}

#[test]
fn tray_mascot_selection_updates_only_supported_mascots() {
    let mut cfg = AppConfig::default();

    select_mascot(&mut cfg, "type").unwrap();
    assert_eq!(cfg.mascot_id, "type");

    select_mascot(&mut cfg, "peek").unwrap();
    assert_eq!(cfg.mascot_id, "peek");

    assert!(select_mascot(&mut cfg, "unknown").is_err());
    assert_eq!(cfg.mascot_id, "peek");
}

#[test]
fn config_file_defaults_when_missing_and_round_trips() {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let dir = std::env::temp_dir().join(format!("octop-pet-config-{unique}"));
    let path = dir.join("config.json");

    assert_eq!(load_from_path(&path).unwrap(), AppConfig::default());

    let cfg = AppConfig {
        username: "alice".into(),
        pet_x: Some(42.5),
        ..AppConfig::default()
    };
    save_to_path(&path, &cfg).unwrap();
    assert_eq!(load_from_path(&path).unwrap(), cfg);

    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn config_patch_updates_only_owned_fields() {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let dir = std::env::temp_dir().join(format!("octop-pet-patch-{unique}"));
    let path = dir.join("config.json");
    let original = AppConfig {
        base_url: "https://old.example".into(),
        username: "old-user".into(),
        mascot_id: "type".into(),
        pet_x: Some(10.0),
        pet_y: Some(20.0),
        ..AppConfig::default()
    };
    save_to_path(&path, &original).unwrap();

    patch_at_path(
        &path,
        serde_json::json!({
            "baseUrl": "https://new.example",
            "username": "new-user"
        }),
    )
    .unwrap();

    assert_eq!(
        load_from_path(&path).unwrap(),
        AppConfig {
            base_url: "https://new.example".into(),
            username: "new-user".into(),
            ..original
        }
    );
    patch_at_path(&path, serde_json::json!({ "keepWindowsVisible": false })).unwrap();
    assert!(!load_from_path(&path).unwrap().keep_windows_visible);
    patch_at_path(&path, serde_json::json!({ "petSize": 224.0 })).unwrap();
    assert_eq!(load_from_path(&path).unwrap().pet_size, 224.0);
    assert!(patch_at_path(&path, serde_json::json!({ "petSize": 225.0 })).is_err());
    assert!(patch_at_path(&path, serde_json::json!({ "unknown": true })).is_err());
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn keep_windows_visible_defaults_when_missing_from_file() {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let dir = std::env::temp_dir().join(format!("octop-pet-keep-visible-{unique}"));
    fs::create_dir_all(&dir).unwrap();
    let path = dir.join("config.json");
    fs::write(&path, r#"{"baseUrl":"https://x.example"}"#).unwrap();
    assert!(load_from_path(&path).unwrap().keep_windows_visible);
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn secrets_are_scoped_by_username_and_restricted_to_known_keys() {
    assert_eq!(
        secret_account("alice", "password").unwrap(),
        "alice:password"
    );
    assert!(validate_secret_key("password").is_ok());
    assert!(validate_secret_key("access_token").is_ok());
    assert!(validate_secret_key("other").is_err());
    assert!(secret_account("", "password").is_err());
}

#[test]
fn debug_secrets_file_round_trips_without_keyring() {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let dir = std::env::temp_dir().join(format!("octop-pet-secrets-{unique}"));
    let path = dir.join("dev-secrets.json");

    assert_eq!(get_secret_from_file(&path, "alice:password").unwrap(), None);
    set_secret_in_file(&path, "alice:password", "s3cret").unwrap();
    assert_eq!(
        get_secret_from_file(&path, "alice:password")
            .unwrap()
            .as_deref(),
        Some("s3cret")
    );
    delete_secret_from_file(&path, "alice:password").unwrap();
    assert_eq!(get_secret_from_file(&path, "alice:password").unwrap(), None);
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn chat_and_settings_close_requests_are_hidden() {
    assert!(should_hide_on_close("chat"));
    assert!(should_hide_on_close("settings"));
    assert!(!should_hide_on_close("pet"));
}

#[test]
fn chat_and_settings_hide_on_unfocus_only_when_setting_is_off() {
    assert!(!should_hide_on_unfocus("chat", true));
    assert!(!should_hide_on_unfocus("settings", true));
    assert!(!should_hide_on_unfocus("pet", true));
    assert!(should_hide_on_unfocus("chat", false));
    assert!(should_hide_on_unfocus("settings", false));
    assert!(!should_hide_on_unfocus("pet", false));
}

#[test]
fn home_url_has_exactly_one_trailing_slash() {
    assert_eq!(
        home_url(" https://octop.example/// ").unwrap(),
        "https://octop.example/"
    );
    assert!(home_url("   ").is_err());
}

#[test]
fn chat_position_prefers_right_and_falls_back_to_left() {
    assert_eq!(
        chat_position((100, 80), (160, 160), (420, 560), (0, 0), (1200, 900)),
        (260, 80)
    );
    assert_eq!(
        chat_position((1050, 80), (160, 160), (420, 560), (0, 0), (1200, 900)),
        (630, 80)
    );
}

#[test]
fn chat_position_is_clamped_to_monitor_work_area() {
    assert_eq!(
        chat_position(
            (-1700, -200),
            (160, 160),
            (420, 560),
            (-1440, 25),
            (1440, 875),
        ),
        (-1440, 25)
    );
}

#[test]
fn pet_restores_off_screen_retina_position_inside_the_work_area() {
    let area = PetWorkArea {
        position: (0, 78),
        size: (3600, 2160),
        scale_factor: 2.0,
    };
    assert_eq!(
        pet_position((7278, 3250), 160.0, &[area]),
        Some((3280, 1918))
    );
}

#[test]
fn pet_preserves_visible_positions_on_negative_coordinate_monitors() {
    let areas = [
        PetWorkArea {
            position: (0, 78),
            size: (3600, 2160),
            scale_factor: 2.0,
        },
        PetWorkArea {
            position: (-1920, -400),
            size: (1920, 1080),
            scale_factor: 1.0,
        },
    ];
    assert_eq!(
        pet_position((-1800, -200), 160.0, &areas),
        Some((-1800, -200))
    );
}

#[test]
fn pet_uses_the_nearest_remaining_monitor_after_disconnect() {
    let area = PetWorkArea {
        position: (0, 40),
        size: (1920, 1040),
        scale_factor: 1.0,
    };
    assert_eq!(pet_position((-1800, 300), 160.0, &[area]), Some((0, 300)));
}

#[test]
fn pet_uses_each_monitors_scale_when_clamping_the_whole_window() {
    let areas = [
        PetWorkArea {
            position: (0, 0),
            size: (1920, 1080),
            scale_factor: 1.0,
        },
        PetWorkArea {
            position: (1920, 0),
            size: (3600, 2160),
            scale_factor: 2.0,
        },
    ];
    assert_eq!(
        pet_position((5500, 2140), 160.0, &areas),
        Some((5200, 1840))
    );
}

#[test]
fn pet_clamps_to_the_origin_when_larger_than_the_work_area() {
    let area = PetWorkArea {
        position: (100, 40),
        size: (200, 200),
        scale_factor: 2.0,
    };
    assert_eq!(pet_position((500, -400), 160.0, &[area]), Some((100, 40)));
}

#[test]
fn windows_open_bottom_centered_with_gap() {
    assert_eq!(
        bottom_centered_position((400, 560), (0, 0), (1200, 900), 96),
        (400, 244) // (1200-400)/2=400, 900-560-96=244
    );
    assert_eq!(
        bottom_centered_position((480, 360), (100, 50), (1000, 800), 64),
        (360, 426) // 100+(1000-480)/2=360, 50+800-360-64=426
    );
    // Too tall for work area → clamp to top.
    assert_eq!(
        bottom_centered_position((400, 900), (0, 0), (1200, 800), 96),
        (400, 0)
    );
}

#[test]
fn bottom_centered_position_is_clamped_to_monitor_work_area() {
    assert_eq!(
        bottom_centered_position((420, 560), (-1440, 25), (1440, 875), 96),
        (-930, 244) // -1440+(1440-420)/2=-930, 25+875-560-96=244
    );
}

#[test]
fn resize_animation_is_slower_than_appkit_default() {
    assert!(RESIZE_ANIMATION_DURATION > 0.2);
    assert!(RESIZE_ANIMATION_DURATION <= 0.45);
}

#[test]
fn bottom_anchored_resize_keeps_the_bottom_edge() {
    assert_eq!(
        bottom_anchored_position((400, 300), (400, 560), (400, 160)),
        (400, 700) // grow-shrink: y += 560-160
    );
    assert_eq!(
        bottom_anchored_position((100, 500), (400, 160), (400, 560)),
        (100, 100) // expand upward: y += 160-560
    );
}

#[test]
fn chat_bottom_gap_is_ninety_six_logical_pixels() {
    assert!((CHAT_BOTTOM_GAP_LOGICAL - 96.0).abs() < f64::EPSILON);
}

#[test]
fn windows_open_truly_centered() {
    assert_eq!(
        centered_position((400, 560), (0, 0), (1200, 900)),
        (400, 170) // (1200-400)/2=400, (900-560)/2=170
    );
    assert_eq!(
        centered_position((480, 360), (100, 50), (1000, 800)),
        (360, 270) // 100+(1000-480)/2=360, 50+(800-360)/2=270
    );
}

#[test]
fn transparent_chrome_targets_pet_and_dialogs() {
    assert_eq!(
        transparent_chrome_target("pet"),
        Some(TransparentChromeTarget::Pet)
    );
    assert_eq!(
        transparent_chrome_target("chat"),
        Some(TransparentChromeTarget::Dialog)
    );
    assert_eq!(
        transparent_chrome_target("settings"),
        Some(TransparentChromeTarget::Dialog)
    );
    assert_eq!(transparent_chrome_target("tray"), None);
}
