use std::{
    collections::HashMap,
    fs,
    time::{SystemTime, UNIX_EPOCH},
};

use octop_pet_lib::{
    config_cmd::{load_from_path, patch_at_path, save_to_path, select_mascot, AppConfig},
    secrets_cmd::{secret_account, validate_secret_key},
    window_cmd::{
        bottom_centered_position, centered_position, home_url, should_hide_on_close,
        CHAT_BOTTOM_GAP_LOGICAL,
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
            shortcut_open_pet: "CmdOrCtrl+Shift+O".into(),
            shortcut_open_home: "CmdOrCtrl+Shift+H".into(),
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
    assert!(value.get("shortcutOpenPet").is_some());
    assert!(value.get("shortcutOpenHome").is_some());
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
    assert!(patch_at_path(&path, serde_json::json!({ "unknown": true })).is_err());
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
fn chat_and_settings_close_requests_are_hidden() {
    assert!(should_hide_on_close("chat"));
    assert!(should_hide_on_close("settings"));
    assert!(!should_hide_on_close("pet"));
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
