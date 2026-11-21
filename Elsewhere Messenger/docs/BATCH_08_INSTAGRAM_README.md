# Elsewhere Messenger · Instagram inbox test

What it does
- Opens a dedicated native Instagram window from the Tools menu in either skin, buddy list or chat.
- Talks only to official Meta Graph API hosts via a Tauri HTTP client.
- Uses a token pasted directly into the local desktop window and keeps it in memory only, never in a settings file.
- Loads Meta API-accessible conversations and the last 20 messages for a selected conversation.
- Offers manual refresh and opt-in refresh every 45 seconds while the window is open.
- No message sending, no automatic local-account merge, no Supabase/Gmail, no photo uploads.

How to connect
1. In Meta for Developers, select Elsewhere Messenger and ensure the Instagram account is assigned with messaging access. The professional account is @total.brainrot.
2. Get a suitable Instagram access token through your Meta app configuration or Graph API Explorer. Never share it in chat or screenshots.
3. Launch Tauri, sign into the existing local Messenger, open Tools > Instagram Inbox (read-only).
4. Choose 'Unified Login / Facebook Graph' for the new Unified Login setup. Paste the token inside the native Instagram window.
5. Leave numeric ID blank for auto discovery. If Meta denies /me/accounts, enter the numeric Instagram business account ID shown in Meta. The ID is not your @handle.
6. Click Connect & load inbox. Select a returned conversation. Click Refresh as needed.

If the UI opens but messages are empty
- Meta may not grant your app sufficient permissions or roles for conversations outside test users.
- Professional business messaging API does NOT provide an unrestricted export of all your personal Instagram DMs.
- Meta may expose at most the latest 20 messages of a conversation.
- If there are token errors, verify that the access token matches the host and its assigned Instagram account, and grants instagram_basic + instagram_manage_messages for this Unified Login configuration.
- You can switch to 'Instagram Login token' only if you actually have a token for the graph.instagram.com host.
- This version reads messages while the app is open; persistent live notifications require a future webhook/backend connection.

Safety
- Tokens remain in the native window's transient React memory. Closing the window clears them.
- Never put access tokens in Vite variables beginning VITE_ or your public source code. Never put a Meta App Secret here.
- No messages are stored locally by this component. They only appear while the window is connected.
- Do not promise all DMs, unlimited history, or end-to-end encryption.

QA
- Frontend builds, Tauri compiles and launches.
- The Tools > Instagram Inbox action opens exactly one native window from Classic and Dead Signal buddy and conversation windows.
- Closing the Instagram window leaves local chats intact.
- Token is not persisted when window is closed and reopened.
- Valid Meta token can retrieve the associated account or allow numeric ID entry.
- API-supported conversations and messages render, and manual refresh works.
- Optional polling updates visible messages while window is open.
- Existing skins, contacts, Web Treasures, sounds, GIPHY and local history are unchanged.
