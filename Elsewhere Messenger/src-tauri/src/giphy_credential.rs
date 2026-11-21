fn require_media_window(window: &tauri::WebviewWindow) -> Result<(), String> {
    match window.label() {
        "main" | "classic-chat" | "dead-signal-chat" => Ok(()),
        _ => Err("GIPHY settings are available in Elsewhere's media picker.".into()),
    }
}

#[cfg(windows)]
static CREDENTIAL_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[cfg(windows)]
fn credential() -> Result<keyring::Entry, String> {
    keyring::Entry::new("com.cyberstudiostm.elsewhere", "giphy")
        .map_err(|_| "Could not open Windows Credential Manager for GIPHY.".into())
}

#[tauri::command]
pub fn load_giphy_key(
    window: tauri::WebviewWindow,
    legacy_key: Option<String>,
) -> Result<Option<String>, String> {
    require_media_window(&window)?;
    #[cfg(windows)]
    {
        let _guard = CREDENTIAL_LOCK.lock().map_err(|_| "GIPHY credential store is unavailable.")?;
        let entry = credential()?;
        match entry.get_password() {
            Ok(key) => Ok(Some(key)),
            Err(keyring::Error::NoEntry) => {
                let Some(key) = legacy_key.filter(|key| !key.is_empty() && key.len() <= 512) else {
                    return Ok(None);
                };
                entry.set_password(&key)
                    .map_err(|_| "Could not migrate the saved GIPHY key to Windows Credential Manager.")?;
                Ok(Some(key))
            }
            Err(_) => Err("Could not read the saved GIPHY key from Windows Credential Manager.".into()),
        }
    }
    #[cfg(not(windows))]
    Ok(legacy_key)
}

#[tauri::command]
pub fn save_giphy_key(window: tauri::WebviewWindow, key: String) -> Result<bool, String> {
    require_media_window(&window)?;
    let key = key.trim();
    if key.is_empty() || key.len() > 512 {
        return Err("Enter a valid GIPHY Web SDK key.".into());
    }
    #[cfg(windows)]
    {
        let _guard = CREDENTIAL_LOCK.lock().map_err(|_| "GIPHY credential store is unavailable.")?;
        credential()?.set_password(key)
            .map_err(|_| "Could not save the GIPHY key to Windows Credential Manager.")?;
        Ok(true)
    }
    #[cfg(not(windows))]
    Ok(false)
}

#[tauri::command]
pub fn remove_giphy_key(window: tauri::WebviewWindow) -> Result<(), String> {
    require_media_window(&window)?;
    #[cfg(windows)]
    {
        let _guard = CREDENTIAL_LOCK.lock().map_err(|_| "GIPHY credential store is unavailable.")?;
        match credential()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err("Could not remove the saved GIPHY key.".into()),
        }
    }
    #[cfg(not(windows))]
    Ok(())
}
