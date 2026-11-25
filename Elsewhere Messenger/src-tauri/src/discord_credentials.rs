use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscordAccountCredential {
    client_id: String,
    refresh_token: String,
}

pub fn require_main(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() == "main" { Ok(()) }
    else { Err("Discord connection settings are available in the main window.".into()) }
}

#[cfg(any(windows, target_os = "macos"))]
fn entry(name: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new("com.cyberstudiostm.elsewhere", name)
        .map_err(|_| "Could not open Windows Credential Manager for Discord.".into())
}

pub fn read(name: &str) -> Result<Option<String>, String> {
    #[cfg(any(windows, target_os = "macos"))]
    {
        match entry(name)?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err("Could not read the saved Discord credential.".into()),
        }
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    { let _ = name; Ok(None) }
}

pub fn save(name: &str, value: &str) -> Result<(), String> {
    #[cfg(any(windows, target_os = "macos"))]
    {
        entry(name)?.set_password(value)
            .map_err(|_| "Could not save the Discord credential in Windows Credential Manager.".into())
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    { let _ = (name, value); Err("Remembered Discord connections require Windows.".into()) }
}

pub fn forget(name: &str) -> Result<(), String> {
    #[cfg(any(windows, target_os = "macos"))]
    {
        match entry(name)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err("Could not remove the saved Discord credential.".into()),
        }
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    { let _ = name; Ok(()) }
}

// Social connections belong to the signed-in Elsewhere account. With no account
// signed in, nothing is read and nothing can be saved.
static SOCIAL_ACCOUNT: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

pub fn valid_account_id(id: &str) -> bool {
    let bytes = id.as_bytes();
    bytes.len() == 36 && bytes.iter().enumerate().all(|(index, byte)| {
        if [8, 13, 18, 23].contains(&index) { *byte == b'-' } else { byte.is_ascii_hexdigit() }
    })
}

/// Sets the account whose social credentials are used. Returns true when it changed.
pub fn set_social_account(account: Option<String>) -> Result<bool, String> {
    if let Some(id) = &account {
        if !valid_account_id(id) { return Err("Invalid Elsewhere account identifier.".into()); }
    }
    let account = account.map(|id| id.to_ascii_lowercase());
    let mut current = SOCIAL_ACCOUNT.lock().map_err(|_| "Social connection state is unavailable.")?;
    let changed = *current != account;
    *current = account;
    Ok(changed)
}

fn social_name(name: &str) -> Result<Option<String>, String> {
    Ok(SOCIAL_ACCOUNT.lock().map_err(|_| "Social connection state is unavailable.")?
        .as_ref().map(|id| format!("{name}-{id}")))
}

pub fn social_read(name: &str) -> Result<Option<String>, String> {
    match social_name(name)? { Some(scoped) => read(&scoped), None => Ok(None) }
}

pub fn social_save(name: &str, value: &str) -> Result<(), String> {
    match social_name(name)? {
        Some(scoped) => save(&scoped, value),
        None => Err("Sign in to your Elsewhere account before saving a connection.".into()),
    }
}

pub fn social_forget(name: &str) -> Result<(), String> {
    match social_name(name)? { Some(scoped) => forget(&scoped), None => Ok(()) }
}

/// Saved social connections from before they were tied to accounts.
pub const LEGACY_SOCIAL: [&str; 3] = ["discord-account", "discord-bot", "instagram"];

/// Moves connections saved before per-account storage into the signed-in account.
/// Never overwrites a connection the account already has.
#[tauri::command]
pub fn adopt_legacy_social_connections(window: tauri::WebviewWindow) -> Result<Vec<String>, String> {
    require_main(&window)?;
    if social_name("x")?.is_none() {
        return Err("Sign in to your Elsewhere account first.".into());
    }
    let mut moved = Vec::new();
    for name in LEGACY_SOCIAL {
        let Some(value) = read(name)? else { continue };
        if social_read(name)?.is_none() {
            social_save(name, &value)?;
            moved.push(name.to_owned());
        }
        forget(name)?;
    }
    Ok(moved)
}

#[tauri::command]
pub fn has_legacy_social_connections(window: tauri::WebviewWindow) -> Result<bool, String> {
    require_main(&window)?;
    for name in LEGACY_SOCIAL {
        if read(name)?.is_some() { return Ok(true); }
    }
    Ok(false)
}

/// Removes every social connection saved for the signed-in account (used when deleting the account).
#[tauri::command]
pub fn forget_social_connections(window: tauri::WebviewWindow) -> Result<(), String> {
    require_main(&window)?;
    for name in LEGACY_SOCIAL { social_forget(name)?; }
    Ok(())
}

const ACCOUNT: &str = "discord-account";

#[tauri::command]
pub fn load_discord_account(window: tauri::WebviewWindow) -> Result<Option<DiscordAccountCredential>, String> {
    require_main(&window)?;
    social_read(ACCOUNT)?.map(|value| {
        serde_json::from_str(&value).map_err(|_| "Could not read the saved Discord account.".into())
    }).transpose()
}

#[tauri::command]
pub fn save_discord_account(window: tauri::WebviewWindow, credential: DiscordAccountCredential) -> Result<(), String> {
    require_main(&window)?;
    if !(15..=25).contains(&credential.client_id.len()) ||
        !credential.client_id.bytes().all(|c| c.is_ascii_digit()) ||
        credential.refresh_token.is_empty() || credential.refresh_token.len() > 2000 ||
        credential.refresh_token.contains(char::is_whitespace)
    {
        return Err("Discord did not return a valid refresh credential.".into());
    }
    let value = serde_json::to_string(&credential).map_err(|_| "Could not prepare the Discord credential.")?;
    social_save(ACCOUNT, &value)
}

#[tauri::command]
pub fn forget_discord_account(window: tauri::WebviewWindow) -> Result<(), String> {
    require_main(&window)?;
    social_forget(ACCOUNT)
}
