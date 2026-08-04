use std::{collections::HashMap, fs, path::Path};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const CONFIG_FILE_NAME: &str = "config.json";

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
        }
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
    save_to_path(&config_path(&app)?, &cfg)
}
