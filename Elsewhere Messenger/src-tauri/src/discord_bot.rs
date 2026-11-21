use crate::discord_credentials;
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Emitter, State};
use tokio::sync::watch;
use tokio_tungstenite::{connect_async, tungstenite::Message};

const SAVED_BOT: &str = "discord-bot";
const API: &str = "https://discord.com/api/v10";

pub struct DiscordBotState {
    token: Mutex<Option<String>>,
    cancel: Mutex<Option<watch::Sender<bool>>>,
    client: reqwest::Client,
    connection: tokio::sync::Mutex<()>,
}

impl Default for DiscordBotState {
    fn default() -> Self {
        Self { token: Mutex::new(None), cancel: Mutex::new(None), client: reqwest::Client::new(), connection: tokio::sync::Mutex::new(()) }
    }
}

fn credential(state: &DiscordBotState) -> Result<String, String> {
    state.token.lock().map_err(|_| "Discord state unavailable".to_string())?
        .clone().ok_or_else(|| "Connect the Elsewhere bot first".to_string())
}

async fn api(state: &DiscordBotState, path: &str, method: reqwest::Method, body: Option<Value>) -> Result<Value, String> {
    let sending = method == reqwest::Method::POST;
    let token = credential(state)?;
    let mut req = state.client.request(method, format!("{API}{path}"))
        .header("Authorization", format!("Bot {token}"))
        .header("User-Agent", "ElsewhereMessenger (Desktop, 0.1)");
    if let Some(value) = body { req = req.json(&value); }
    let result = req.send().await.map_err(|e| format!("Discord connection error: {e}"))?;
    let status = result.status();
    let retry = result.headers().get("retry-after").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    let payload: Value = result.json().await.unwrap_or(Value::Null);
    if !status.is_success() {
        if status.as_u16() == 429 { return Err(format!("Discord rate limited. Retry after {retry} seconds.")); }
        if sending && status.as_u16() == 403 {
            let code = payload.get("code").and_then(Value::as_u64);
            if code == Some(50013) || code == Some(50001) {
                return Err("Discord denied the send (403). In this channel, check the bot’s View Channel and Send Messages permissions and channel or category overrides. Replies also need Read Message History.".into());
            }
        }
        let message = payload.get("message").and_then(Value::as_str).unwrap_or("Request denied");
        return Err(format!("Discord HTTP {}: {}", status.as_u16(), message));
    }
    Ok(payload)
}

async fn connect(app: tauri::AppHandle, state: &DiscordBotState, token: &str, remember: Option<bool>) -> Result<Value, String> {
    if token.len() < 25 || token.len() > 512 || token.contains(char::is_whitespace) {
        return Err("Enter a valid bot token privately in Elsewhere.".into());
    }
    let result = state.client.get(format!("{API}/users/@me"))
        .header("Authorization", format!("Bot {token}"))
        .timeout(Duration::from_secs(15))
        .send().await.map_err(|_| "Could not reach Discord. Check the connection and retry.")?;
    if result.status().as_u16() == 401 {
        return Err("Discord rejected the bot token (401). If it was reset, connect with the new token.".into());
    }
    if !result.status().is_success() {
        return Err(format!("Discord bot login failed (HTTP {}). Retry when Discord is available.", result.status().as_u16()));
    }
    let bot: Value = result.json().await.map_err(|_| "Discord returned an unreadable bot identity.")?;
    if bot.get("bot").and_then(Value::as_bool) != Some(true) {
        return Err("Only official bot credentials are accepted.".into());
    }
    match remember {
        Some(true) => discord_credentials::social_save(SAVED_BOT, token)?,
        Some(false) => discord_credentials::social_forget(SAVED_BOT)?,
        None => {}
    }
    if let Some(cancel) = state.cancel.lock().map_err(|_| "Discord state unavailable.")?.take() {
        let _ = cancel.send(true);
    }
    *state.token.lock().map_err(|_| "Discord state unavailable.")? = Some(token.to_owned());
    let (tx, rx) = watch::channel(false);
    *state.cancel.lock().map_err(|_| "Discord state unavailable.")? = Some(tx);
    let gateway_token = token.to_owned();
    let _ = app.emit("elsewhere:discord:bot-connected", true);
    tauri::async_runtime::spawn(async move { gateway_loop(app, gateway_token, rx).await; });
    Ok(json!({"id": bot["id"], "username": bot["username"]}))
}

#[tauri::command]
pub async fn discord_bot_connect(window: tauri::WebviewWindow, app: tauri::AppHandle, state: State<'_, DiscordBotState>, bot_token: String, remember: bool) -> Result<Value, String> {
    discord_credentials::require_main(&window)?;
    let _guard = state.connection.lock().await;
    connect(app, &state, bot_token.trim(), Some(remember)).await
}

#[tauri::command]
pub async fn restore_discord_bot(window: tauri::WebviewWindow, app: tauri::AppHandle, state: State<'_, DiscordBotState>) -> Result<Option<Value>, String> {
    discord_credentials::require_main(&window)?;
    let _guard = state.connection.lock().await;
    let Some(token) = discord_credentials::social_read(SAVED_BOT)? else { return Ok(None); };
    connect(app, &state, &token, None).await.map(Some)
}

/// Chooses whose social connections are used, and stops the previous account's bot.
#[tauri::command]
pub async fn set_social_account(window: tauri::WebviewWindow, state: State<'_, DiscordBotState>, account: Option<String>) -> Result<(), String> {
    discord_credentials::require_main(&window)?;
    let _guard = state.connection.lock().await;
    if discord_credentials::set_social_account(account)? {
        if let Some(stop) = state.cancel.lock().map_err(|_| "Discord state unavailable.")?.take() {
            let _ = stop.send(true);
        }
        *state.token.lock().map_err(|_| "Discord state unavailable.")? = None;
    }
    Ok(())
}

#[tauri::command]
pub async fn discord_bot_disconnect(window: tauri::WebviewWindow, state: State<'_, DiscordBotState>) -> Result<(), String> {
    discord_credentials::require_main(&window)?;
    let _guard = state.connection.lock().await;
    discord_credentials::social_forget(SAVED_BOT)?;
    if let Some(stop) = state.cancel.lock().map_err(|_| "Discord state unavailable.")?.take() {
        let _ = stop.send(true);
    }
    *state.token.lock().map_err(|_| "Discord state unavailable.")? = None;
    Ok(())
}

#[tauri::command]
pub async fn discord_bot_guilds(state: State<'_, DiscordBotState>) -> Result<Value, String> {
    api(&state, "/users/@me/guilds", reqwest::Method::GET, None).await
}

#[tauri::command]
pub async fn discord_bot_channels(state: State<'_, DiscordBotState>, guild_id: String) -> Result<Value, String> {
    validate_id(&guild_id)?;
    api(&state, &format!("/guilds/{guild_id}/channels"), reqwest::Method::GET, None).await
}

#[tauri::command]
pub async fn discord_bot_messages(state: State<'_, DiscordBotState>, channel_id: String) -> Result<Value, String> {
    validate_id(&channel_id)?;
    api(&state, &format!("/channels/{channel_id}/messages?limit=40"), reqwest::Method::GET, None).await
}

#[tauri::command]
pub async fn discord_bot_send(state: State<'_, DiscordBotState>, channel_id: String, content: String, reply_id: Option<String>) -> Result<Value, String> {
    validate_id(&channel_id)?;
    if content.trim().is_empty() || content.chars().count() > 2000 { return Err("Message must be 1–2000 characters".into()); }
    let mut body = json!({"content":content,"allowed_mentions":{"parse":[]}});
    if let Some(id) = reply_id {
        validate_id(&id)?;
        body["message_reference"] = json!({"message_id":id, "channel_id":channel_id, "fail_if_not_exists":true});
    }
    api(&state, &format!("/channels/{channel_id}/messages"), reqwest::Method::POST, Some(body)).await
}

fn validate_id(id: &str) -> Result<(), String> {
    if id.len() < 15 || id.len() > 25 || !id.bytes().all(|c| c.is_ascii_digit()) { return Err("Invalid Discord snowflake ID".into()); }
    Ok(())
}

// One Gateway stream per active bot session. Never sends the bot token to webviews.
// Discord message events are emitted as sanitized data for the authorized desktop UI.
async fn gateway_loop(app: tauri::AppHandle, token: String, mut cancel: watch::Receiver<bool>) {
    let mut pause = 2u64;
    let mut reconnects = 0u32;
    loop {
        if *cancel.borrow() { break; }
        let url = "wss://gateway.discord.gg/?v=10&encoding=json";
        match connect_async(url).await {
            Ok((socket, _)) => {
                let (mut outgoing, mut incoming) = socket.split();
                let mut interval: Option<tokio::time::Interval> = None;
                let mut seq: Option<i64> = None;
                let mut alive = true;
                let _ = app.emit("elsewhere:discord:gateway-status", "connecting");
                loop {
                    tokio::select! {
                        _ = cancel.changed() => { if *cancel.borrow() { alive = false; break; } }
                        _ = async { if let Some(tick) = interval.as_mut() { tick.tick().await; } else { std::future::pending::<()>().await } } => {
                            if outgoing.send(Message::Text(json!({"op":1,"d":seq}).to_string().into())).await.is_err() { break; }
                        }
                        frame = incoming.next() => {
                            let text = match frame {
                                Some(Ok(Message::Text(text))) => text,
                                Some(Ok(Message::Ping(ping))) => { let _ = outgoing.send(Message::Pong(ping)).await; continue; }
                                Some(Ok(Message::Pong(_))) => continue,
                                Some(Ok(Message::Close(closed))) => {
                                    if let Some(c) = closed {
                                        if u16::from(c.code) == 4014 {
                                            let _ = app.emit("elsewhere:discord:gateway-status", "Message Content intent not authorized in Discord Developer Portal");
                                            return;
                                        }
                                    }
                                    break;
                                }
                                _ => break,
                            };
                            let Ok(data) = serde_json::from_str::<Value>(&text) else { continue; };
                            if let Some(s) = data.get("s").and_then(Value::as_i64) { seq = Some(s); }
                            match data.get("op").and_then(Value::as_i64) {
                                Some(10) => {
                                    let ms = data.pointer("/d/heartbeat_interval").and_then(Value::as_u64).unwrap_or(45000);
                                    let mut timer = tokio::time::interval(Duration::from_millis(ms.max(1000)));
                                    timer.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
                                    interval = Some(timer);
                                    let hello = json!({"op":2,"d":{"token":token,"intents":(1u64<<0)|(1u64<<9)|(1u64<<15),"properties":{"os":"windows","browser":"elsewhere","device":"elsewhere"}}});
                                    if outgoing.send(Message::Text(hello.to_string().into())).await.is_err() { break; }
                                }
                                Some(0) => {
                                    match data.get("t").and_then(Value::as_str).unwrap_or("") {
                                        "READY" => { let _ = app.emit("elsewhere:discord:gateway-status", "connected"); pause = 2; reconnects = 0; }
                                        "MESSAGE_CREATE" | "MESSAGE_UPDATE" | "MESSAGE_DELETE" => {
                                            let kind = data.get("t").and_then(Value::as_str).unwrap_or("");
                                            let _ = app.emit("elsewhere:discord:gateway-message", json!({"kind":kind,"message":data.get("d")}));
                                        }
                                        _ => {}
                                    }
                                }
                                Some(1) => { let _ = outgoing.send(Message::Text(json!({"op":1,"d":seq}).to_string().into())).await; }
                                Some(7) | Some(9) => break,
                                _ => {}
                            }
                        }
                    }
                }
                if !alive { break; }
            }
            Err(_) => {}
        }
        reconnects += 1;
        if reconnects > 12 {
            let _ = app.emit("elsewhere:discord:gateway-status", "Gateway unavailable; reconnect bot manually");
            break;
        }
        let _ = app.emit("elsewhere:discord:gateway-status", "reconnecting");
        tokio::select! { _ = tokio::time::sleep(Duration::from_secs(pause)) => {}, _ = cancel.changed() => { if *cancel.borrow() { break; } } }
        pause = (pause * 2).min(60);
    }
    let _ = app.emit("elsewhere:discord:gateway-status", "disconnected");
}
