use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::{Duration, Instant};
use tauri::Emitter;

// Callback port is loopback-only, temporary, and never stores an OAuth credential.
#[tauri::command]
pub async fn start_spotify_oauth_callback(app: tauri::AppHandle) -> Result<String, String> {
    start_callback(app, 8766, "/spotify/callback", "Spotify", "elsewhere:spotify:oauth-callback")
}

#[tauri::command]
pub async fn start_x_oauth_callback(app: tauri::AppHandle) -> Result<String, String> {
    start_callback(app, 8767, "/x/callback", "X", "elsewhere:x:oauth-callback")
}

fn start_callback(
    app: tauri::AppHandle, port: u16, route: &'static str, service: &'static str, event: &'static str,
) -> Result<String, String> {
    let callback = format!("http://127.0.0.1:{port}{route}");
    let expected = format!("{route}?");
    let listener = TcpListener::bind(("127.0.0.1", port))
        .map_err(|err| format!("{service} callback port {port} unavailable: {err}"))?;
    listener.set_nonblocking(true).map_err(|err| err.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        let started = Instant::now();
        while started.elapsed() < Duration::from_secs(180) {
            match listener.accept() {
                Ok((mut stream, _)) => {
                    let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
                    let mut bytes = [0u8; 4096];
                    let count = stream.read(&mut bytes).unwrap_or(0);
                    let request = String::from_utf8_lossy(&bytes[..count]);
                    let line = request.lines().next().unwrap_or("");
                    let path = line.split_whitespace().nth(1).unwrap_or("");
                    let accepted = line.starts_with("GET ") && path.starts_with(expected.as_str()) && path.len() < 4096;
                    let body = if accepted {
                        "Authorization received. Return to Elsewhere."
                    } else { "Elsewhere authorization callback only." };
                    let code = if accepted { "200 OK" } else { "404 Not Found" };
                    let response = format!(
                        "HTTP/1.1 {code}\r\nContent-Type: text/plain; charset=utf-8\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                        body.len()
                    );
                    let _ = stream.write_all(response.as_bytes());
                    if accepted {
                        let _ = app.emit_to("main", event, path.to_owned());
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
    Ok(callback.to_owned())
}
