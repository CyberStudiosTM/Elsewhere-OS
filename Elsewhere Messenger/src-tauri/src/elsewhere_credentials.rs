use crate::discord_credentials;

fn key(project: &str, account: &str) -> Result<String, String> {
    let id = account.as_bytes();
    if project.len() != 20 || !project.bytes().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        || id.len() != 36 || !id.iter().enumerate().all(|(index, byte)| {
            if [8, 13, 18, 23].contains(&index) { *byte == b'-' } else { byte.is_ascii_hexdigit() }
        })
    {
        return Err("Invalid Elsewhere account identifier.".into());
    }
    Ok(format!("elsewhere-account-{project}-{account}"))
}

#[tauri::command]
pub fn remember_elsewhere_account(window: tauri::WebviewWindow, project: &str, account: &str, refresh_token: &str) -> Result<(), String> {
    discord_credentials::require_main(&window)?;
    if refresh_token.is_empty() || refresh_token.len() > 1024 || refresh_token.contains(char::is_whitespace) {
        return Err("Invalid Elsewhere credential.".into());
    }
    discord_credentials::save(&key(project, account)?, refresh_token)
}

#[tauri::command]
pub fn read_elsewhere_account(window: tauri::WebviewWindow, project: &str, account: &str) -> Result<Option<String>, String> {
    discord_credentials::require_main(&window)?;
    discord_credentials::read(&key(project, account)?)
}

#[tauri::command]
pub fn forget_elsewhere_account(window: tauri::WebviewWindow, project: &str, account: &str) -> Result<(), String> {
    discord_credentials::require_main(&window)?;
    discord_credentials::forget(&key(project, account)?)
}
