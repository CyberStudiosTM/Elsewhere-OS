# Elsewhere SkinMapper: Architecture Audit

Read-only investigation of Elsewhere Messenger's source, prepared for the SkinMapper design work.
Audited on 2026-11-21 against the working tree at `elsewhere messenger/code` (app version 0.2.16 plus unbuilt
menu and Beta-label changes). No source code was changed for this report.

**Labels used throughout**

- **Verified**: read directly in source code or measured from asset files.
- **Inferred**: a reasonable reading of the code that still needs confirming in the running app.
- **Proposed**: possible future SkinMapper behaviour. Nothing marked Proposed exists today.

**Line numbers** are from the files as of this audit and will drift as the code changes. Treat them as "start
looking here".

**How CSS measurements were read.** Both skins' stylesheets are built up in layers ("batches"): a later rule often
overrides an earlier one for the same element. Where several rules apply, this report lists the **last** matching
rule found in the file, which is normally the one in effect. Runtime sizes were **not** measured in the app;
anything sized by flexbox or the window size is described by its rule, not a number.

---

## 1. Architecture overview

### 1.1 How the app starts (Verified)

- `src/main.tsx` picks what to render from the **Tauri window label** (and one URL flag):
  - `elsewhere-toast` → `ToastPopup` (corner notification window)
  - `?instagram-inbox` → standalone `InstagramInbox` (developer test window)
  - `classic-chat` or `classic-login` → `Classic` (`src/App.tsx`) directly
  - `dead-signal-login` or `dead-signal-chat` → `DeadSignal` directly
  - everything else (the `main` window) → `SkinHost`
- `src/SkinHost.tsx` is the main window's root. It owns the account/session start-up, social-service panels,
  the Accounts dialog, toolbar dialogs, Photo Studio, notifications, the nudge banner and the skin switch.

### 1.2 Skin registration and selection (Verified)

- There is **no skin registry**. The two skins are hard-wired in `SkinHost.tsx`:
  - `type Skin = "classic" | "dead-signal"` (`SkinHost.tsx`, near the top).
  - `readSkin()` reads `localStorage["elsewhere.messenger.skin"]`; anything other than `"dead-signal"` means Classic.
  - `changeSkin(next)` sets state and writes the same key.
  - Both skins are rendered as siblings, each wrapped in `<div style={{display: active ? "contents" : "none"}}>`,
    and only mounted after first use (`loaded` state). Each receives `active`, `onChangeSkin` and `buddies`.
- Each skin injects its whole stylesheet only while active:
  - Classic: `import classicStyles from './skins/classic/ClassicMessenger.css?inline'` (`App.tsx:57`), rendered as
    `{active && <style>{classicStyles}</style>}` in `ClassicSkin` (`App.tsx:1878`).
  - Dead Signal: `import deadSignalStyles from "./DeadSignal.css?inline"` (`DeadSignal.tsx:63`), same pattern in
    the default export (`DeadSignal.tsx:1999`).
- `src/skins/prism-pager/` exists but is **empty** (no files). It is not wired anywhere.

### 1.3 The two skins

| | Classic | Dead Signal |
|---|---|---|
| Entry | `ClassicSkin` → `App` (`src/App.tsx`, ~1,890 lines) | `DeadSignal` → `DeadSignalView` (`src/skins/dead-signal/DeadSignal.tsx`, ~2,020 lines) |
| Stylesheet | `src/skins/classic/ClassicMessenger.css` (~3,560 lines) | `src/skins/dead-signal/DeadSignal.css` (~2,200 lines) |
| Window frame | `WindowTitle` (`App.tsx:86`): title bar + min/max/close; dragging via `startDragging` | `WindowFrame` (`DeadSignal.tsx:202`): title bar, controls, content, decorative "hardware trim" |
| Native child windows | `classic-chat`, `classic-login` (`src/services/nativeWindows.ts`) | `dead-signal-chat`, `dead-signal-login` (`src/services/deadSignalWindows.ts`) |
| How children get state | Event snapshots: `CLASSIC_EVENTS.snapshot` / `LOGIN_EVENTS` (`App.tsx` ~490–700) | `publishSnapshot` / `sendCommand` (`DeadSignal.tsx:459–480`) |
| Icons | `<img src="/approved/classic-icons/…">` plus a large sprite sheet | `Icon` component → `/approved/dead-signal/icons/{name}.png` (`DeadSignal.tsx:138`) |
| Presence dots | Drawn entirely in CSS (`.em-presence::before/::after`, `ClassicMessenger.css:1730–1830`) | PNG images `presence-{online,away,busy,offline}.png` via `Status` (`DeadSignal.tsx:157`) |

### 1.4 What's shared vs. skin-specific (Verified)

**Shared (used by both skins, no skin-specific code inside):**

- Menu bar and its popups: `src/components/ClassicMenuBar.tsx` (takes a `skin` prop; Dead Signal gets class
  `ds-menu em-functional-menu`, Classic gets `em-menubar em-functional-menu`).
- Dialog shell: `ToolbarDialog` in `src/components/ToolbarDialogs.tsx` (skin passed as a class:
  `ew-toolbar-classic` / `ew-toolbar-dead-signal`). Used by New DM/Call, Photo Studio, the Accounts dialog.
- Contact-list helpers and widgets: `SocialServiceFilter`, `OwnProfilePhoto`, `InstagramAvatar`,
  `SpotifyProfileStatus`, `MediaPicker`, `AnchoredEmoticonPicker` / `SharedEmoticons`, `ExpressionLibraries`,
  `MediaAttachment`, `InstagramMessageContent`, `DiscordMessageContent`.
- All data and behaviour services in `src/services/`: local messaging (`messagingCore.ts`), sessions
  (`localSession.ts`, `mainAccount.ts`), Elsewhere accounts (`connectedClient.ts`, `elsewhereNativeBridge.ts`),
  Instagram (`instagramGraph.ts`, `instagramNativeBridge.ts`, `instagramContactPreferences.ts`), Discord
  (`discordBot.ts`, `discordConnection.ts`), sounds (`classicSounds.ts`, `soundPacks.ts`), notifications
  (`desktopNotifications.ts`, `toastWindow.ts`), media (`messengerMedia.ts`), toolbar actions (`toolbarActions.ts`).
- Main-window overlays rendered by `SkinHost` regardless of skin: Accounts (`ConnectedMessenger`), Discord,
  Spotify, X and Instagram panels, Instagram Contact Appearance, Web Treasures, Photo Studio, Desktop Notifications
  dialog, nudge banner.

**Duplicated in each skin (same behaviour written twice):**

- Contact list assembly (local + Elsewhere friends + Instagram threads + pinned Discord channels), grouping and
  filtering (`App.tsx` ~318–360; `DeadSignal.tsx` ~613–640).
- Sending (local / Elsewhere / Instagram / Discord branches), nudges, Enter-to-send, formatting toolbar,
  draft handling, typing sounds, history rendering per service.
- Sign-in form (email + password), sign-out/switch-account, window open/close and child-window syncing.
- Instagram 24-hour notice, previews, avatars; Elsewhere chat via `useElsewhereChat`.

---

## 2. Window and component inventory

Native window sizes are **Verified** from `new WebviewWindow(...)` options and `configureMainWindowForSkin`
(`src/services/nativeWindows.ts`, `src/services/deadSignalWindows.ts`, `src/services/toastWindow.ts`).

| Window | Tauri label | Skin | Size (W×H, logical px) | Min size | Source |
|---|---|---|---|---|---|
| Main – sign-in mode | `main` | Classic | 310×700 | 285×450 | `nativeWindows.ts` `configureMainWindowForSkin` (~175–220) |
| Main – sign-in mode | `main` | Dead Signal | 320×700 | 285×450 | same |
| Main – buddy list | `main` | Classic | 310×540 | 310×420 | same |
| Main – buddy list | `main` | Dead Signal | 320×570 | 310×420 | same |
| Conversation | `classic-chat` | Classic | 600×560, resizable, maximizable | 560×480 | `nativeWindows.ts:44` |
| Sign-in (separate) | `classic-login` | Classic | 310×700 | 285×450 | `nativeWindows.ts:117` |
| Conversation | `dead-signal-chat` | Dead Signal | 620×570 | 560×480 | `deadSignalWindows.ts` `openDeadSignalWindow` |
| Sign-in (separate) | `dead-signal-login` | Dead Signal | 320×700 | 290×450 | same |
| Corner notification | `elsewhere-toast` | both (reads skin from localStorage) | 330×120, transparent, always on top, not focusable | – | `toastWindow.ts` |
| Instagram developer inbox | `instagram-inbox` | own styles | not audited | – | `InstagramInbox.tsx` (non-integrated mode) |

All app windows use `decorations: false`; the title bars are drawn by the skins.

**In-window screens and overlays (Verified unless noted):**

| Screen / overlay | Where it renders | Component | Notes |
|---|---|---|---|
| Sign-in | main window, skin layout | Classic `App.tsx` ~1050–1260; Dead Signal `DeadSignal.tsx` ~1308–1450 | Email + password, presence, remember options, "Forgot your password?", "Create an account" |
| Buddy list | main window | Classic `App.tsx` ~1260–1420; Dead Signal ~1455–1595 | Profile, toolbar, service filter, groups, contacts |
| Conversation | chat window | Classic `App.tsx` ~1420–1850; Dead Signal ~1595–1940 | Menu, toolbar, recipient, history, composer, avatars, footer |
| Menu bar + popups | every skin window | `ClassicMenuBar.tsx` | Menus: File, Contacts/Edit, Actions, Web Treasures, Photo Studio, Skins, Tools, Help; About, Sound settings, Sound packs, Notification clips |
| Accounts dialog | main window overlay | `ConnectedMessenger.tsx` in `ToolbarDialog` | Sign in, reset/choose password, terms, handle, contacts and requests |
| New DM / Call | overlay | `ToolbarDialogs.tsx` | |
| Photo Studio | overlay | `PhotoStudio.tsx` in `ToolbarDialog` | Camera capture + file editing |
| Discord / Spotify / X / Instagram panels | overlays | `DiscordConnectionPanel.tsx`, `SpotifyConnectionPanel.tsx`, `XMessagesPanel.tsx`, `InstagramInbox.tsx` (integrated) | Each has its own CSS file |
| Instagram Contact Appearance | overlay | `InstagramContactSettings.tsx` | |
| Web Treasures | overlay | `WebTreasuresPanel.tsx` | |
| Desktop Notifications | overlay | inline in `SkinHost.tsx` | Enable, previews, pop-up style |
| Nudge banner | fixed bar in main window | inline in `SkinHost.tsx` (`.ew-nudge-banner`, `ToolbarDialogs.css`) | |
| In-window example toast | Classic only, off by default | `App.tsx` ~1853 (`.em-toast`) | Preview-only demo |
| Dead Signal in-window notification | Dead Signal | `DeadSignal.tsx:1944` (`.ds-notification`) | Used for status messages |
| Web preview chrome | browser only (not the desktop app) | Classic `.em-dev-strip`, Dead Signal `.ds-preview-header` / `.ds-preview-dock` | Not shown in the installed app |

---

## 3. Visual region inventory

**Region IDs are Proposed** stable SkinMap names. Everything else in the rows is Verified from the cited source
unless the Notes say Inferred. "Feasibility" means how practical it is to let a mapped skin restyle that region
in a *new* engine (not by editing Classic/Dead Signal).

### 3.1 Window chrome (all windows)

| Region ID | Actual component / class | Classic source & size | Dead Signal source & size | Sizing | States | Feasibility | Notes |
|---|---|---|---|---|---|---|---|
| `window.frame` | Classic `.em-window`; DS `.ds-window` | `ClassicMessenger.css:94`, 2px border, 9px radius | `DeadSignal.css:138`, 4px padding, 15px radius, scanline gradient | Fills native window | DS: `.ds-active`, `.ds-maximized` | Easy (colors/border/radius); Moderate (image frame) | No nine-slice support exists (see §4). |
| `window.titlebar` | `WindowTitle` `.em-titlebar`; `WindowFrame` `.ds-titlebar` | `:109` height 37px (buddy override `:1401` 35px) | `:190` height 31px | Stretch horizontally | – | Easy | Doubles as drag handle (`startDragging`); see §5. |
| `window.titlebar.icon` | `.em-brand-icon` (sprite); DS `Fish` `.ds-fish` | sprite 29×27 (`:140`), buddy 25×25 (`:1407`) | `skeletal-fish-48.png` 48×24 shown at 36×19 (`:216`) | Fixed | – | Easy | |
| `window.titlebar.text` | `.em-title`, `.ds-title` | 15px (buddy 14px) | 12px | Ellipsis | – | Easy | Shows "BETA" label for the app-name title. |
| `window.controls.*` (minimize, maximize, close) | `.em-window-controls button`, `.em-close`; `.ds-window-controls button`, `.ds-close` | 24×24 (buddy 23×23), close red gradient | 24×23, close red gradient | Fixed | hover, disabled (DS native) | Easy | Must stay clickable buttons. |
| `window.trim` | – | – | `.ds-hardware-trim` (`:311`) 20px tall, screws/signal light/hazard | Stretch | – | Easy | Purely decorative. |
| `menu.bar` | `ClassicMenuBar` `.em-menubar` / `.ds-menu` | `:1427` min-height 28px; wraps to 2 rows when narrow (`ClassicMenuBar.css`) | `:369` min-height 25px | Wraps | open item `.em-menu-selected` | Moderate | One component serves both skins via class names. |
| `menu.popup` | `.em-menu-popup` | `ClassicMenuBar.css` | DS overrides `DeadSignal.css:1164–1215` | Content-sized | hover | Moderate | Includes `<details>` submenus. |

### 3.2 Sign-in screen

| Region ID | Classic | Dead Signal | Sizing | States | Feasibility | Notes |
|---|---|---|---|---|---|---|
| `signin.header` | `.em-login-brand` (`:1922`) min-height 113px, gradient + `.em-login-header-wave` (`:1995`) | `.ds-brand` with fish image | Stretch | – | Easy | Classic wordmark is text (25px/22px Tahoma). |
| `signin.logo` | `.em-login-brand-icon` 65×65, `glass-butterfly.png` (1254×1254) `background-size: contain` | `skeletal-fish.png` (854×424) | Fixed | – | Easy | |
| `signin.picture` | `.em-login-photo` 112×112, `avatar-cloud-clean.png` (101×102) | `.ds-login-picture` + `Avatar` 120px | Fixed | – | Easy | |
| `signin.field.email`, `signin.field.password` | `.em-login-form input` | `.ds-field input` | Stretch | disabled while signing in | Moderate | Must remain real inputs with labels (§5). |
| `signin.presence` | `ClassicPresenceSelect` | `StatusSelect` (`DeadSignal.tsx:403`) | Content | – | Moderate | |
| `signin.checks` | `.em-login-checks` | `.ds-checkboxes` | Content | checked, disabled | Moderate | "Remember my password" is permanently disabled. |
| `signin.button` | `.em-signin-button` (`:321`, min-width 140px) | `.ds-red-button` (`:623`) | Content | hover, active, disabled | Easy | |
| `signin.links` | `.em-login-account-links` | `.ds-login-links` | Content | – | Easy | |
| `signin.error` | `.em-login-error` | `.ds-login-error` | Wraps | – | Easy | |
| `signin.footer` | `.em-login-wave` (`:349`, 30px) + `.em-login-footer-butterfly` | – | Stretch | – | Easy | Decorative. |

### 3.3 Buddy list

| Region ID | Classic | Dead Signal | Sizing | States | Feasibility | Notes |
|---|---|---|---|---|---|---|
| `buddy.profile` | `.em-profile` (`:1439`) min-height 90px, gradient | `.ds-profile` (`:687`) | Stretch | – | Easy | |
| `buddy.profile.avatar` | `OwnProfilePhoto` in `.em-avatar` 70×70, 3px white border | `OwnProfilePhoto` / `Avatar` | Fixed | – | Moderate | Avatar image comes from the user or a social account; skin only frames it. |
| `buddy.profile.name`, `.status`, `.music` | `.em-profile-heading strong` 15px, `select` max 110px, `.em-profile-info p` 12px | `.ds-profile-info`, `.ds-status-select`, `.ds-music` | Ellipsis | hover on select | Easy | "listening to" is `SpotifyProfileStatus`. |
| `buddy.toolbar` | `.em-buddy-tools` (`:1539`) min-height 46px | `Toolbar` `.ds-toolbar` (`:393`) | Equal-width buttons (`flex: 1 1 0`) | hover, `aria-disabled` | Easy | |
| `buddy.toolbar.icon.{add,mail,call,webcam,nudge,treasures}` | `/approved/classic-icons/toolbar-*.png` 32×32 shown 32×32 (`:1584`); nudge uses DS lightning icon | `/approved/dead-signal/icons/*.png` 24×24 or 32×32 | Fixed, `object-fit: contain` | – | Easy | Web Treasures uses a CSS/emoji shortcut, not an image. |
| `buddy.filter` | `SocialServiceFilter` (`.ew-social-service`) | same | Wraps | `.is-selected`, `.is-unavailable` | Moderate | Shared component; styles in `SocialServiceFilter.css`. |
| `buddy.list` | `.em-groups` (`:1597`) min-height 285px | `.ds-contact-panel` (`:718`) min-height 350px; native fills height | Fills remaining height, scrolls | – | Easy | |
| `buddy.group.heading` | `.em-group-heading` (`:1625`) min-height 29px | `.ds-group-heading` (`:732`) | Stretch | expanded/collapsed (arrow) | Easy | |
| `buddy.contact.row` | `.em-contact` (`:1665`) min-height 27px | `.ds-contact` (`:752`) min-height 27px | Stretch | hover, selected | Easy | |
| `buddy.contact.presence` | CSS-drawn person, 19×22 (`:1730–1830`) | PNG 16×16 | Fixed | online, away, busy, offline | Easy | Instagram contacts use a colored dot (`.ew-ig-contact-indicator`) instead. |
| `buddy.contact.avatar` | `InstagramAvatar` `.ew-ig-contact-avatar` | same | Fixed | – | Moderate | |
| `buddy.contact.name` | `.em-contact-name` 14px bold | bold (appended rule) | Ellipsis | – | Easy | |
| `buddy.contact.preview` | `.ew-contact-preview` 11px | same | Ellipsis | – | Easy | Shared style in `InstagramMessageContent.css`. |
| `buddy.contact.unread` | `.ew-unread` | same | Content | – | Easy | |

### 3.4 Conversation window

| Region ID | Classic | Dead Signal | Sizing | States | Feasibility | Notes |
|---|---|---|---|---|---|---|
| `chat.toolbar` | `.em-chat-tools` (`:985`) | `Toolbar` `.ds-toolbar` | Equal-width buttons | hover, active, `aria-disabled` | Easy | |
| `chat.toolbar.icon.{invite,sendFiles,webcam,audio,nudge,activities,emoticons,winks}` | `.em-tool-icon` final rule 32×32 (`:1319`); art in `classic-icons/` (32×32) and `classic-extracts-v2/` (45–49×37) | `Icon` 32px (24px compact) | Fixed, contain | – | Easy | Labels 10px under icons (Classic), 9–10px (DS). |
| `chat.recipient` | `.em-recipient` (`:614`) min-height 27px | `.ds-recipient` | Stretch | – | Easy | |
| `chat.history` | `.em-history` (`:626`) 260px tall in the web preview; native window lets it flex (Inferred) | `.ds-transcript` 220px, native `flex: 1` (`:1859`), CRT effect `.ds-crt` (`:455`) | Fills, scrolls | – | Easy | |
| `chat.message.sender` / `.text` | `.em-sender-me` / `.em-sender-them`, `.ew-core-message-text` | `.ds-sender-own` / `.ds-sender-other`, `.ds-message-text` | Wraps | own vs other | Easy | |
| `chat.notice` | `.ew-ig-window-notice`, `.ew-nudge-event` | same | Wraps | – | Easy | Shared styles. |
| `chat.composer.frame` | `.em-composer-frame` (`:1123`) | `.ds-composer` (`:876`) | Stretch | – | Easy | |
| `chat.composer.formatting` | `.em-formatting` buttons 28×27, icons 23×23 (`:1880`) | `.ds-formatting` buttons min 23×24, composer icons 16×16 | Fixed buttons | hover, active (`.em-format-active` / `.ds-format-active`), disabled | Easy | |
| `chat.composer.input` | `textarea` min 75px, max 160px (`:1231`) | `textarea` min 57px (`:939`) | Stretch | focus, disabled | Moderate | Must remain a real textarea (§5). |
| `chat.composer.send` | `button[type=submit]` 72×38 (`:1255`) | `.ds-red-button` style | Fixed | hover, disabled | Easy | |
| `chat.sidebar` / `chat.avatars` | `.em-chat-sidebar` 112px wide (`:935`), `.em-photo-frame` 106×107 (`:1331`) | `.ds-chat-avatars`, avatars max 96px (native) | Fixed column | – | Easy | Hidden under 640px width in Classic (`:879`, Inferred from media query). |
| `chat.footer` | `.em-chat-footer` (`:1282`) min-height 28px, 11px | `.ds-chat-footer` (`:958`) 11px | Stretch | – | Easy | Shows service note + "BETA". |

### 3.5 Shared overlays and notifications

| Region ID | Component / class | Source | Sizing | Feasibility | Notes |
|---|---|---|---|---|---|
| `dialog.frame` / `.header` / `.body` | `ToolbarDialog` `.ew-toolbar-dialog` | `ToolbarDialogs.css:1–60`, width `min(100%, 410px)`, 8px radius | Content, max 100% | Easy | Already skin-aware via one class; a good model for the mapped engine. |
| `toast.frame` / `.title` / `.avatar` / `.text` | `ToastPopup` `.ew-toast-*` | `ToastPopup.css`, window 330×120, avatar 50×50 | Fixed window | Easy | Already picks skin from localStorage. |
| `nudge.banner` | `.ew-nudge-banner` | `ToolbarDialogs.css` | Stretch | Easy | |
| `panel.discord` / `.spotify` / `.x` / `.instagram` / `.instagramAppearance` | per-component CSS | `DiscordConnectionPanel.css`, `SpotifyConnectionPanel.css`, `InstagramInbox.css`, `InstagramContactSettings.css` | Content | Moderate | Each has its own look, not tied to either skin (Inferred: worth unifying later). |
| `menu.sound`, `menu.about` | `.em-sound-settings`, `.em-menu-about` | `ClassicMenuBar.tsx:639`, `:891` | Content | Moderate | |

---

## 4. Existing asset specifications

### 4.1 Asset files (Verified by reading PNG headers)

All approved art is under `public/approved/` (146 files: 132 PNG, 4 GIF, 6 PSD, 2 PDF, 2 JSON). The Dead Signal
set appears twice: `public/approved/dead-signal/…` (used by the app) and an identical copy in
`public/approved/dead-signal/DeadSignal-Approved-Assets/…` (Inferred: the original approved package).

| Group | Path | Sizes | Used by |
|---|---|---|---|
| Classic sprite sheet | `approved/default-xp-messenger.png` | 1448×1086; CSS scales it to 1408×1056 and crops with `background-position` | Classic title icon, avatars, toast avatar (`ClassicMessenger.css:140–150, 262, 283, 393, 756, 833`) |
| Glass butterfly | `approved/glass-butterfly.png` | 1254×1254, scaled with `contain` | Classic sign-in logo, decorations |
| Classic toolbar icons | `approved/classic-icons/toolbar-*.png` (12 icons) | 32×32 each | Buddy and chat toolbars |
| Classic extracted art | `approved/classic-extracts/` and `classic-extracts-v2/` | avatars 61×63 to 115×116; toolbar art 30–49 × 33–38 | Avatars, earlier toolbar variants |
| Dead Signal icons | `approved/dead-signal/icons/*.png` | toolbar 24×24 or 32×32; composer 16×16; presence 16×16 | `Icon`, `Status` components |
| Dead Signal avatars | `approved/dead-signal/avatars/` | 96×96, plus 128×128 versions | `Avatar` component |
| Dead Signal branding | `approved/dead-signal/branding/` | wordmark 1404×342; fish 854×424 plus 16/24/32/48/64-wide sizes | Title bar, sign-in, toast |
| Dead Signal wallpaper | `approved/dead-signal/wallpaper/dead-signal-bg.png` | 1672×941, `cover` | Web preview background (`DeadSignal.css:5`) |
| Dead Signal manifest | `approved/dead-signal/asset-manifest.json` | – | Not read by code (Inferred: documentation) |
| GIPHY attribution | `approved/giphy-*` | various | Required GIPHY marks in the media picker |

### 4.2 How assets are drawn (Verified)

- **Images in `<img>` tags** with fixed `width`/`height` and `object-fit: contain` (toolbar icons, DS icons).
- **CSS backgrounds** with `background-size: contain` or `cover` (logos, avatars, wallpaper).
- **One large sprite sheet** for Classic, cropped by pixel offsets.
- **Pure CSS drawing** for Classic presence figures, gradients for every bar, button and frame.
- **Nine-slice scaling: not used anywhere** (no `border-image` in any stylesheet).
- **Tiling:** only Dead Signal's repeating scanline gradients (CSS, not images).
- **Transparency:** PNG alpha is used throughout; the toast window is a transparent native window.
- **SVG:** only inside `SharedEmoticons.tsx`; no skin artwork is SVG.
- **High-DPI:** no `image-set`, `devicePixelRatio` or resolution media queries. Images are single-resolution and
  the webview scales them (Inferred: small icons may look soft on 150%+ displays).
- **Fallbacks:** avatar components fall back to a default picture when a social photo is missing
  (`InstagramAvatar`, `OwnProfilePhoto`). No fallback exists for a missing skin image (it would simply not show).

### 4.3 Fonts and sounds (Verified)

- Skin fonts are system fonts: Tahoma/Arial (Classic, Dead Signal UI), Georgia (Dead Signal formatting buttons).
- Message fonts come from `src/services/bundledFontCatalog.ts`, which bundles pixel fonts through `@fontsource`
  packages (Press Start 2P, Pixelify Sans, Silkscreen, VT323, Tiny5, Jersey 10/15/20 and more).
- Sounds are mostly **synthesized** with the Web Audio API (`classicSounds.ts`, oscillators). Users can import
  sound packs and notification clips, stored in IndexedDB (`soundPacks.ts`). Sound settings can be shared or
  per-skin (`elsewhere.sound.profiles.v1`).

---

## 5. Functional and accessibility constraints

These parts must keep working in any mapped skin. A skin may restyle them, but should not be able to remove or
rewire them (Proposed rule, based on the Verified behaviour below).

| Area | Behaviour today (Verified) | Must stay fixed | Can be skinned |
|---|---|---|---|
| Sending | Enter sends, Shift+Enter adds a line; box clears instantly; per-service send paths (local, Elsewhere, Instagram, Discord) | The form, textarea, submit button and their event handlers | Colors, borders, fonts, button art |
| Formatting | Ctrl+B/I/U shortcuts, font/color pickers, per-conversation format | Buttons and keyboard shortcuts | Icon art, sizes within limits |
| Contacts | Click/double-click opens chat; groups collapse; filters by service | Click targets and ordering logic | Row height, colors, presence art |
| Accounts | Email/password sign-in, email codes, password setup, sign-out | All inputs, labels and buttons; no skin may add fields | Layout around the form |
| Social services | Connect/disconnect panels, tokens in Windows Credential Manager per account | Entirely; skins never touch credentials | Panel colors only |
| Webcam / Photo Studio | Webcam opens Windows Camera; Photo Studio captures or opens photos | Buttons and permissions | Dialog look |
| Window controls | Custom title bars: drag via `startDragging`, double-click maximize, min/max/close buttons | Drag area must exist; controls must stay buttons | Art, size within limits |
| Resizing | Native windows are resizable with minimum sizes (§2) | Minimum sizes | – |
| Notifications / nudges | Corner pop-up window, sounds, nudge banner | Timing and click-to-open | Pop-up art and colors |
| Keyboard and focus | Many controls are real `<button>`/`<input>` with `aria-label`s; dialogs close on Escape and focus their close button; presence state kept for screen readers via visually hidden text (`ClassicMessenger.css:1715`) | Semantic elements, labels, focus order | Focus ring color (must stay visible) |

---

## 6. Third-engine feasibility

**Approved plan:** Classic and Dead Signal stay hard-coded and untouched; mapped skins use a third shared engine.

### 6.1 What the mapped engine can reuse without touching either skin (Verified to exist)

- Every service in `src/services/` (data, accounts, social bridges, sounds, notifications, media).
- `ClassicMenuBar` (already skin-agnostic through a prop and class names; it would need a third class value).
- `ToolbarDialog` and all overlays rendered by `SkinHost` (they don't depend on the skin's layout).
- Shared widgets: `SocialServiceFilter`, `OwnProfilePhoto`, `InstagramAvatar`, `SpotifyProfileStatus`, `MediaPicker`,
  `AnchoredEmoticonPicker`, `ExpressionLibraries`, `MediaAttachment`, `InstagramMessageContent`,
  `DiscordMessageContent`, `ToastPopup`.
- Hooks: `useElsewhereChat`, `useNativeInstagram`, `useDiscordMessages`, `usePinnedDiscordChannels`,
  `useCoreHistory`, `useConversationDraft`, `useConversationFormat`, `useSoundPreferences`, `useLocalSession`.

### 6.2 What it can't reuse as-is

- The skins' own layout code. Contact-list building, sending, sign-in handling and child-window syncing live
  *inside* `App.tsx` and `DeadSignal.tsx`. The mapped engine would need its own copy, or that logic would need to
  move into shared hooks. (Moving it is optional and wouldn't require changing how the existing skins look; it's
  noted as a concern, not a prerequisite.)
- The skins' stylesheets. They are large, layered and use unscoped class names; reusing them would make mapped
  skins inherit Classic or Dead Signal quirks.

### 6.3 Risks of a third rendering path

1. **Feature drift (main risk).** Today every feature is written twice (examples from this week: instant send,
   Instagram previews and sorting, 24-hour notice, Beta labels). A third engine makes it three times unless the
   duplicated behaviour (§1.4) is gradually moved into shared hooks.
2. **CSS collisions.** Skin CSS is injected globally as a `<style>` tag while active. A mapped engine should scope
   its styles (one root class or CSS variables) so it can't leak into shared overlays.
3. **Child windows.** Each skin has its own window labels and syncing protocol (§1.3). The mapped engine needs its
   own labels (e.g. `mapped-chat`, Proposed) and capabilities entries in `src-tauri/capabilities/`.
4. **Hard-coded skin checks.** Several shared places assume exactly two skins: `type Skin` in `SkinHost`,
   `MenuProps.skin` in `ClassicMenuBar`, `ToolbarSkin` in `ToolbarDialogs`, `AudioSkin` in `classicSounds.ts`,
   the toast's skin detection, `localStorage["elsewhere.messenger.skin"]` checks in `InstagramInbox.tsx` and
   `classicSounds.ts`. Each needs a third value.
5. **User-supplied files.** Mapped skins would load user images and fonts. These must stay local (no remote URLs,
   to keep the app private and offline-safe) and be size-limited.

### 6.4 Compatibility with future Messenger updates (Inferred)

The more the mapped engine leans on shared hooks and components, the more new features reach it automatically.
Anything added directly inside `App.tsx` or `DeadSignal.tsx` will not.

---

## 7. Current skin switcher

| Topic | Finding (Verified) |
|---|---|
| Registration | None; two string values hard-coded in `SkinHost.tsx`. |
| Where users switch | Menu bar → **Skins** (moved out of Tools this week; source only, not yet in an installer). Each skin also has its own switch function: `switchToDeadSignal` (`App.tsx:568`), `switchToClassic` (`DeadSignal.tsx:937`). |
| What switching does | Closes the current skin's child windows (`closeNativeClassicLogin/Chat`, `closeDeadSignalWindows`), then `onChangeSkin` → `SkinHost.changeSkin` saves the choice and swaps which skin is visible. `configureMainWindowForSkin` resizes the main window to that skin's size. |
| What persists | Skin choice (`elsewhere.messenger.skin`), sound profiles (shared or per skin), local session and Elsewhere account, socials, drafts and formatting per conversation. |
| Open windows | Chat and sign-in windows from the old skin are closed, not converted. |
| Child windows | A Dead Signal child window asks the main window to switch (`sendCommand({kind: "classic"})`); Classic children don't switch skins themselves (Inferred). |
| Adding a mapped skin | Needs: a third skin value (or a skin ID list), a `loaded`/`active` slot in `SkinHost`, a main-window size in `configureMainWindowForSkin`, its own child windows, and entries in the Skins menu. Mapped skins could be listed by name, with each one's map file selecting the look (Proposed). |
| Constraints | Each skin keeps its React tree mounted after first use (`display: contents/none`), so state survives switching but memory grows with each skin used (Inferred). |

---

## 8. Unknowns needing verification

1. **Effective runtime sizes.** Sizes come from the last matching CSS rule; flexbox and window size change many of
   them. They should be measured in the running app before the map's slot sizes are final.
2. **Classic history height in native windows.** The 260px rule is from the shared layout. The chat window probably
   lets it flex, but this wasn't measured.
3. **High-DPI appearance** of 16–32px icons at 125%/150% scaling wasn't checked.
4. **Developer Instagram inbox window** (`?instagram-inbox`) wasn't audited in detail.
5. **`asset-manifest.json`** (Dead Signal) wasn't cross-checked against the files.
6. **`prism-pager` skin folder** is empty; its purpose is unknown.
7. **AdvancedPreferences** is imported by the menu bar; where and when it shows wasn't traced.
8. **Discord/Spotify/X panel styling** wasn't inventoried region by region.

---

## 9. Recommendations for Eid's design work

1. **Design the map around regions, not files.** The region IDs in §3 are stable across both skins (same jobs,
   different art), so they're a good starting list.
2. **Decide image support up front:** nine-slice frames, tiling and @2x art don't exist today. If mapped skins
   should have image-based window frames or crisp icons on high-DPI screens, the engine must add them.
3. **Give every icon slot a fixed box** (for example 32×32 for main toolbars, 24×24 compact, 16×16 composer and
   presence, matching today's art), with `contain` scaling, so user art can't break layouts.
4. **Keep structure out of the map.** Per §5, skins should control colors, fonts, images, sizes within limits and
   spacing, but not remove, reorder or rewire controls.
5. **Plan the third skin value early:** the shared places in §6.3 item 4 all need it, and a skin ID list would be
   easier to grow than more hard-coded checks.
6. **Reuse `ToolbarDialog` and `ToastPopup`'s approach** (one skin class on a shared component) for mapped dialogs
   and pop-ups.
7. **Decide what a skin file contains:** map (JSON), images, optional fonts and sounds, plus size limits and
   "local files only".
8. **Measure the running app** (§8 item 1) once the slot list is drafted, so final sizes are exact.
