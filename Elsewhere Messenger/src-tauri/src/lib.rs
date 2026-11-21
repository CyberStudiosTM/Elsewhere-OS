mod discord_bot;
mod discord_credentials;
mod elsewhere_credentials;
mod spotify_oauth;
mod instagram_credential;
mod giphy_credential;
#[cfg(windows)]
mod taskbar_icon;
use tauri_plugin_notification::NotificationExt;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::{Duration, Instant};
use tauri::Emitter;

// The ephemeral Discord OAuth code is only emitted to Elsewhere's main window.
// The bearer token and PKCE verifier never enter the callback URL.
#[tauri::command]
async fn start_discord_oauth_callback(app: tauri::AppHandle) -> Result<String, String> {
  let callback = "http://127.0.0.1:8765/discord/callback";
  let listener = TcpListener::bind("127.0.0.1:8765")
    .map_err(|err| format!("Discord callback port 8765 unavailable: {err}"))?;
  listener.set_nonblocking(true).map_err(|err| err.to_string())?;
  tauri::async_runtime::spawn_blocking(move || {
    let started = Instant::now();
    while started.elapsed() < Duration::from_secs(300) {
      match listener.accept() {
        Ok((mut stream, _)) => {
          let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
          let mut bytes = [0u8; 4096];
          let count = match stream.read(&mut bytes) { Ok(n) => n, Err(_) => 0 };
          let request = String::from_utf8_lossy(&bytes[..count]);
          let request_line = request.lines().next().unwrap_or("");
          let path = request_line.split_whitespace().nth(1).unwrap_or("");
          let permitted = request_line.starts_with("GET /discord/callback?")
            && path.starts_with("/discord/callback?")
            && path.len() < 2048;
          let body = if permitted {
            "Discord authorization received. You can close this tab and return to Elsewhere."
          } else {
            "This endpoint is for Elsewhere Discord authorization only."
          };
          let code = if permitted { "200 OK" } else { "404 Not Found" };
          let response = format!("HTTP/1.1 {code}\r\nContent-Type: text/plain; charset=utf-8\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
          let _ = stream.write_all(response.as_bytes());
          if permitted {
            let _ = app.emit_to("main", "elsewhere:discord:oauth-callback", path.to_string());
            break;
          }
        }
        Err(err) if err.kind() == std::io::ErrorKind::WouldBlock => {
          std::thread::sleep(Duration::from_millis(100));
        }
        Err(_) => break,
      }
    }
  });
  Ok(callback.to_string())
}

// Instagram returns the one-time code through Elsewhere's Supabase helper, which
// forwards it here. Only the main window receives it; no token passes this port.
static INSTAGRAM_LISTENING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

#[tauri::command]
async fn start_instagram_oauth_callback(app: tauri::AppHandle) -> Result<(), String> {
  use std::sync::atomic::Ordering;
  // A sign-in started earlier is still waiting: reuse it rather than failing to bind again.
  if INSTAGRAM_LISTENING.swap(true, Ordering::SeqCst) { return Ok(()); }
  let listener = match TcpListener::bind("127.0.0.1:8766") {
    Ok(listener) => listener,
    Err(err) => {
      INSTAGRAM_LISTENING.store(false, Ordering::SeqCst);
      return Err(format!("Elsewhere couldn't listen for Instagram's reply (port 8766 is busy): {err}"));
    }
  };
  if let Err(err) = listener.set_nonblocking(true) {
    INSTAGRAM_LISTENING.store(false, Ordering::SeqCst);
    return Err(err.to_string());
  }
  tauri::async_runtime::spawn_blocking(move || {
    struct Done;
    impl Drop for Done { fn drop(&mut self) { INSTAGRAM_LISTENING.store(false, std::sync::atomic::Ordering::SeqCst); } }
    let _done = Done;
    let started = Instant::now();
    while started.elapsed() < Duration::from_secs(300) {
      match listener.accept() {
        Ok((mut stream, _)) => {
          let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
          let mut bytes = [0u8; 4096];
          let count = match stream.read(&mut bytes) { Ok(n) => n, Err(_) => 0 };
          let request = String::from_utf8_lossy(&bytes[..count]);
          let request_line = request.lines().next().unwrap_or("");
          let path = request_line.split_whitespace().nth(1).unwrap_or("");
          let permitted = request_line.starts_with("GET /instagram/callback?")
            && path.starts_with("/instagram/callback?")
            && path.len() < 3000;
          let body = if permitted {
            "Instagram is connecting to Elsewhere. You can close this tab and return to Elsewhere Messenger."
          } else {
            "This address is only for connecting Instagram to Elsewhere."
          };
          let code = if permitted { "200 OK" } else { "404 Not Found" };
          let response = format!("HTTP/1.1 {code}\r\nContent-Type: text/plain; charset=utf-8\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
          let _ = stream.write_all(response.as_bytes());
          if permitted {
            let _ = app.emit_to("main", "elsewhere:instagram:oauth-callback", path.to_string());
            break;
          }
        }
        Err(err) if err.kind() == std::io::ErrorKind::WouldBlock => {
          std::thread::sleep(Duration::from_millis(100));
        }
        Err(_) => break,
      }
    }
  });
  Ok(())
}

fn notification_text(text: Option<String>, limit: usize) -> String {
  text.unwrap_or_default().chars()
    .filter(|ch| !ch.is_control() && !matches!(*ch, '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}'))
    .take(limit).collect::<String>().trim().to_owned()
}

#[tauri::command]
fn show_desktop_notification(window: tauri::WebviewWindow, source: &str, sender: Option<String>, preview: Option<String>) -> Result<(), String> {
  if window.label() != "main" { return Err("Desktop notifications use the main window.".into()); }
  let (service, fallback) = match source {
    "instagram" => ("Instagram", "New Instagram message"),
    "discord" => ("Discord", "New Discord channel message"),
    "x" => ("X", "New X direct message"),
    "elsewhere" => ("Elsewhere", "New Elsewhere direct message"),
    "test" => ("Elsewhere", "Desktop notifications are enabled."),
    _ => return Err("Unknown notification source.".into()),
  };
  let sender = notification_text(sender, 64);
  let preview = notification_text(preview, 180);
  let title = if sender.is_empty() { "Elsewhere Messenger".to_owned() } else { format!("{sender} · {service}") };
  let body = if preview.is_empty() { fallback } else { &preview };
  window.notification().builder().title(title).body(body).show().map_err(|error| error.to_string())
}

#[tauri::command]
fn reveal_elsewhere_executable() -> Result<(), String> {
  let executable = std::env::current_exe()
    .map_err(|error| format!("Could not locate the running Elsewhere executable: {error}"))?;
  tauri_plugin_opener::reveal_item_in_dir(executable)
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn apply_elsewhere_window_icon(window: tauri::WebviewWindow) -> Result<(), String> {
  #[cfg(windows)]
  { taskbar_icon::apply(&window) }
  #[cfg(not(windows))]
  { window.set_icon(tauri::include_image!("./icons/64x64.png")).map_err(|error| error.to_string()) }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .on_window_event(|window, event| {
      use tauri::Manager;

      if window.label() == "main"
        && matches!(event, tauri::WindowEvent::Destroyed)
      {
        window.app_handle().exit(0);
      }
    })
    .setup(|app| {
      use tauri::Manager;
      if let Some(window) = app.get_webview_window("main") {
        if let Err(error) = apply_elsewhere_window_icon(window) {
          log::warn!("Could not set Elsewhere window icon: {error}");
        }
      }
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .manage(discord_bot::DiscordBotState::default())
    .invoke_handler(tauri::generate_handler![
      apply_elsewhere_window_icon,
      reveal_elsewhere_executable,
      elsewhere_credentials::remember_elsewhere_account,
      elsewhere_credentials::read_elsewhere_account,
      elsewhere_credentials::forget_elsewhere_account,
      discord_credentials::load_discord_account,
      discord_credentials::save_discord_account,
      discord_credentials::forget_discord_account,
      discord_bot::restore_discord_bot,
      discord_bot::set_social_account,
      discord_credentials::adopt_legacy_social_connections,
      discord_credentials::has_legacy_social_connections,
      discord_credentials::forget_social_connections,
      giphy_credential::load_giphy_key,
      giphy_credential::save_giphy_key,
      giphy_credential::remove_giphy_key,
      show_desktop_notification, instagram_credential::load_instagram_credential, instagram_credential::save_instagram_credential, instagram_credential::forget_instagram_credential,spotify_oauth::start_spotify_oauth_callback, spotify_oauth::start_x_oauth_callback,start_discord_oauth_callback,start_instagram_oauth_callback,discord_bot::discord_bot_connect,discord_bot::discord_bot_disconnect,discord_bot::discord_bot_guilds,discord_bot::discord_bot_channels,discord_bot::discord_bot_messages,discord_bot::discord_bot_send])
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
