# Elsewhere Messenger | Combined Batch 07C + 08

## Contents
- Batch 07C: local IndexedDB vault (`elsewhere-web-treasures-v1`) containing five empty stores: metadata, files, favorites, collections, and packs. Eight predefined graphic categories. No images, graphics, placeholders, or user-generated files added.
- Batch 08: Supabase-connected account login using email OTP, unique handles, profile discovery, direct-message history, and incoming Realtime updates. Reach from **Tools → Connected Accounts & Messages** on both Classic and Dead Signal. Local demo accounts remain untouched and entirely separate.

## What you do once to activate cross-device messaging
1. Create a project at https://supabase.com/dashboard (you control its billing, permissions, and region).
2. In SQL Editor, run `supabase/01_connected_messenger.sql` from this installed project directory.
3. In Authentication > Providers, enable email OTP. In the email template ensure it contains `{{ .Token }}` so a six-digit code is delivered, not just a clickable redirect link. Follow the current Supabase docs.
4. In Project Settings > API Keys, copy the **Project URL** and **publishable key**. Never copy the `service_role`, secret, or database password into the desktop app.
5. In the `code` folder create `.env.local` and add:
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
6. Relaunch Messenger, sign in with an email code in Tools → Connected Accounts & Messages. Register a unique handle. Try two separate emails on different devices.

## Notes on security and scope
- This is an MVP, not a production-ready public messaging platform. Server RLS restricts message access to their sender/recipient, but production release requires abuse throttling, blocking/reporting, moderation procedures, retention/account deletion, privacy policy, and threat modeling.
- Messages are stored on Supabase and transported over HTTPS. **They are not end-to-end encrypted.** Do not promise private or encrypted DMs beyond TLS in transit.
- **No automatic upload or migration** of existing local messages, contacts, passwords, drafts, images, sound packs, or Web Treasures.
- Connected Mode initially sends text messages; attachments, rich formatting, typing indicators, online presence, and in-window Classic/Dead Signal visual merging remain follow-up development.
- A message is inserted once with a UUID; both users independently query the same server record. Browser refresh and Tauri relaunch recover history.
- The current UI uses the existing shared Tools menu on both skins, presenting a shared connected conversation panel. The local messaging core and native windows stay functional.
- Internet access is needed for server features. The local demo still runs offline.

## QA
- Build passes; both skins launch.
- Tools opens Connected Accounts from Classic and Dead Signal.
- Vault is created and reports 0 metadata, 0 files, 0 favorites, 0 collections, 0 packs; all eight categories remain visible in existing picker.
- Without credentials, Connected Mode shows a useful setup screen; local chats still work.
- With Supabase set up, email OTP logs in; a distinct username profile is created.
- Two accounts on two computers can search each other's handles and send text in both directions.
- Incoming text appears live; history persists after restart; a third user cannot read other users' messages.
- Sign-out ends the cloud session only; existing local conversations are preserved.
