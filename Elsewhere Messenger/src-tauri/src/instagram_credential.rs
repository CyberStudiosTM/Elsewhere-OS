use crate::discord_credentials;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstagramCredential {
    token: String,
    account_id: String,
}

const NAME: &str = "instagram";

fn require_main(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() == "main" { Ok(()) }
    else { Err("Instagram credentials are available in the main window only.".into()) }
}

#[tauri::command]
pub fn load_instagram_credential(window: tauri::WebviewWindow) -> Result<Option<InstagramCredential>, String> {
    require_main(&window)?;
    discord_credentials::social_read(NAME)
        .map_err(|_| "Could not read the saved Instagram credential.".to_string())?
        .map(|value| serde_json::from_str(&value).map_err(|_| "Saved Instagram credential could not be read.".into()))
        .transpose()
}

#[tauri::command]
pub fn save_instagram_credential(window: tauri::WebviewWindow, credential: InstagramCredential) -> Result<(), String> {
    require_main(&window)?;
    if credential.token.trim().is_empty() || credential.account_id.is_empty() {
        return Err("Instagram credentials are incomplete.".into());
    }
    #[cfg(windows)]
    {
        let value = serde_json::to_string(&credential).map_err(|_| "Could not prepare Instagram credentials.")?;
        discord_credentials::social_save(NAME, &value)
    }
    #[cfg(not(windows))]
    Err("Remembered Instagram sign-in is available on Windows.".into())
}

#[tauri::command]
pub fn forget_instagram_credential(window: tauri::WebviewWindow) -> Result<(), String> {
    require_main(&window)?;
    discord_credentials::social_forget(NAME)
}
