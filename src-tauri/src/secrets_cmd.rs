use keyring::{Entry, Error};
use tauri::AppHandle;

use crate::config_cmd;

const KEYRING_SERVICE: &str = "com.octop.pet";

pub fn validate_secret_key(key: &str) -> Result<(), String> {
    match key {
        "password" | "access_token" => Ok(()),
        _ => Err(format!("unsupported secret key: {key}")),
    }
}

pub fn secret_account(username: &str, key: &str) -> Result<String, String> {
    validate_secret_key(key)?;
    if username.trim().is_empty() {
        return Err("username is not configured".into());
    }
    Ok(format!("{username}:{key}"))
}

fn entry_for_username(username: &str, key: &str) -> Result<Entry, String> {
    let account = secret_account(username, key)?;
    Entry::new(KEYRING_SERVICE, &account)
        .map_err(|error| format!("failed to access system keyring: {error}"))
}

fn entry_for(app: &AppHandle, key: &str) -> Result<Entry, String> {
    let username = config_cmd::load_config(app.clone())?.username;
    entry_for_username(&username, key)
}

#[tauri::command]
pub fn get_secret(app: AppHandle, key: String) -> Result<Option<String>, String> {
    validate_secret_key(&key)?;
    let username = config_cmd::load_config(app)?.username;
    if username.trim().is_empty() {
        return Ok(None);
    }

    match entry_for_username(&username, &key)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(Error::NoEntry) => Ok(None),
        Err(error) => Err(format!("failed to read secret: {error}")),
    }
}

#[tauri::command]
pub fn set_secret(app: AppHandle, key: String, value: String) -> Result<(), String> {
    entry_for(&app, &key)?
        .set_password(&value)
        .map_err(|error| format!("failed to store secret: {error}"))
}

#[tauri::command]
pub fn delete_secret(app: AppHandle, key: String) -> Result<(), String> {
    match entry_for(&app, &key)?.delete_credential() {
        Ok(()) | Err(Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("failed to delete secret: {error}")),
    }
}
