use std::{
    collections::HashMap,
    fs,
    time::{SystemTime, UNIX_EPOCH},
};

use tauri_app_lib::{
    config_cmd::{load_from_path, save_to_path, AppConfig},
    secrets_cmd::{secret_account, validate_secret_key},
    window_cmd::{chat_position, home_url},
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
