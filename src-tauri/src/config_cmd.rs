use std::{collections::HashMap, fs, path::Path, sync::Mutex};

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager};

const CONFIG_FILE_NAME: &str = "config.json";
static CONFIG_WRITE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AppConfig {
    pub base_url: String,
    pub username: String,
    pub mascot_id: String,
    pub last_agent_id: Option<String>,
    pub thread_id_by_agent: HashMap<String, String>,
    pub pet_x: Option<f64>,
    pub pet_y: Option<f64>,
    pub shortcut_open_pet: String,
    pub shortcut_open_home: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
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
    }
}

pub fn select_mascot(cfg: &mut AppConfig, mascot_id: &str) -> Result<(), String> {
    match mascot_id {
        "peek" | "type" => {
            cfg.mascot_id = mascot_id.to_string();
            Ok(())
        }
        _ => Err(format!("unsupported mascot: {mascot_id}")),
    }
}

pub fn load_from_path(path: &Path) -> Result<AppConfig, String> {
    if !path.exists() {
        return Ok(AppConfig::default());
    }

    let json = fs::read_to_string(path)
        .map_err(|error| format!("failed to read config {}: {error}", path.display()))?;
    serde_json::from_str(&json)
        .map_err(|error| format!("failed to parse config {}: {error}", path.display()))
}

pub fn save_to_path(path: &Path, cfg: &AppConfig) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "failed to create config directory {}: {error}",
                parent.display()
            )
        })?;
    }

    let json = serde_json::to_string_pretty(cfg)
        .map_err(|error| format!("failed to serialize config: {error}"))?;
    fs::write(path, json)
        .map_err(|error| format!("failed to write config {}: {error}", path.display()))
}

fn patch_field<T: DeserializeOwned>(key: &str, value: Value) -> Result<T, String> {
    serde_json::from_value(value).map_err(|error| format!("invalid config field {key}: {error}"))
}

fn merge_patch(cfg: &mut AppConfig, patch: Value) -> Result<(), String> {
    let fields = patch
        .as_object()
        .ok_or_else(|| "config patch must be an object".to_string())?;

    for (key, value) in fields {
        match key.as_str() {
            "baseUrl" => cfg.base_url = patch_field(key, value.clone())?,
            "username" => cfg.username = patch_field(key, value.clone())?,
            "mascotId" => cfg.mascot_id = patch_field(key, value.clone())?,
            "lastAgentId" => cfg.last_agent_id = patch_field(key, value.clone())?,
            "threadIdByAgent" => {
                cfg.thread_id_by_agent = patch_field(key, value.clone())?;
            }
            "petX" => cfg.pet_x = patch_field(key, value.clone())?,
            "petY" => cfg.pet_y = patch_field(key, value.clone())?,
            "shortcutOpenPet" => cfg.shortcut_open_pet = patch_field(key, value.clone())?,
            "shortcutOpenHome" => cfg.shortcut_open_home = patch_field(key, value.clone())?,
            _ => return Err(format!("unsupported config field: {key}")),
        }
    }

    Ok(())
}

pub fn patch_at_path(path: &Path, patch: Value) -> Result<AppConfig, String> {
    let _guard = CONFIG_WRITE_LOCK
        .lock()
        .map_err(|_| "config write lock is poisoned".to_string())?;
    let mut cfg = load_from_path(path)?;
    merge_patch(&mut cfg, patch)?;
    save_to_path(path, &cfg)?;
    Ok(cfg)
}

fn config_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|path| path.join(CONFIG_FILE_NAME))
        .map_err(|error| format!("failed to resolve app config directory: {error}"))
}

#[tauri::command]
pub fn load_config(app: AppHandle) -> Result<AppConfig, String> {
    load_from_path(&config_path(&app)?)
}

#[tauri::command]
pub fn save_config(app: AppHandle, cfg: AppConfig) -> Result<(), String> {
    let _guard = CONFIG_WRITE_LOCK
        .lock()
        .map_err(|_| "config write lock is poisoned".to_string())?;
    save_to_path(&config_path(&app)?, &cfg)
}

#[tauri::command]
pub fn patch_config(app: AppHandle, patch: Value) -> Result<(), String> {
    patch_at_path(&config_path(&app)?, patch).map(|_| ())
}
