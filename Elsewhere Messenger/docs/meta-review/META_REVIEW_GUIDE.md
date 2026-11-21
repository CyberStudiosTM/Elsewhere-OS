# Meta review guide: Elsewhere Messenger

App ID 1206084318766084. Do these in order: links first, then business verification (its wait runs alongside everything else), then the screencast and submission.

## 1. Links Meta asks for

Open [App settings → Basic](https://developers.facebook.com/apps/1206084318766084/settings/basic/) and fill in:

| Field | Value |
| --- | --- |
| Privacy policy URL | `https://cyberthreed.github.io/CyberStudios/elsewhere-accounts/privacy.html` |
| Data deletion instructions URL | `https://cyberthreed.github.io/CyberStudios/elsewhere-accounts/data-deletion.html` |
| Terms of Service URL | `https://cyberthreed.github.io/CyberStudios/elsewhere-accounts/terms.html` |
| Contact email | `elsewhere.os.info@gmail.com` |
| App icon | 1024×1024 PNG of the Elsewhere icon |
| Category | Messaging |

Click **Save changes**.

## 2. Business verification

Start at [Meta Business Suite → Security Center](https://business.facebook.com/settings/security), then **Start verification**. Meta needs:

- **Legal business name:** exactly as it appears on your document (for example, CyberStudios).
- **Business address and phone:** the phone should be one that can receive a code.
- **Website:** `https://cyberthreed.github.io/CyberStudios/`
- **One official document showing that name.** Any of these works: an IRS EIN confirmation letter (CP 575, free from irs.gov), a DBA / assumed-name certificate, a business license, or a utility or phone bill in the business name.
- **Domain or email confirmation:** pick the email or phone option if it's offered. You can't add the DNS record on a github.io site.

The name on the document has to match what you type exactly, including "LLC" or "Inc." if it's there. This is the most common reason verification gets rejected.

## 3. Screencast script (one recording, about 3–4 minutes)

Record at 1080p with the Windows key + Alt + R (Xbox Game Bar) or OBS. No voice is needed; Meta reviewers prefer on-screen text captions. Turn off notifications from other apps. Use your test Instagram account (@total.brainrot) and a second account that DMs it.

**Before recording:** in Elsewhere Messenger, disconnect Instagram (Tools → Social Accounts & Settings → Instagram Connection → Disconnect). From the second account, send @total.brainrot a DM shortly before you start, so the 24-hour reply window is open.

| # | Show this | Caption to add |
| --- | --- | --- |
| 1 | Elsewhere Messenger open and signed in | "Elsewhere Messenger is a Windows desktop messenger. Users can read and reply to their Instagram DMs here." |
| 2 | Tools → Social Accounts & Settings → Instagram Connection | "The user chooses to connect their Instagram professional account." |
| 3 | Click **Connect Instagram**. The browser opens the Facebook login. Sign in. | "The user signs in with Facebook Login for Business." |
| 4 | **Slow down here:** the permissions screen. Pick the Instagram account and show each permission before clicking Continue / Allow. | "The user reviews and grants the requested permissions." |
| 5 | Back in the app, the Instagram Connection window shows it's connected | "The Instagram account is now connected." |
| 6 | The buddy list with the Instagram filter selected, showing the conversation list | "instagram_manage_messages: the app lists the user's Instagram conversations." |
| 7 | Open the conversation from the second account; the message history appears | "The user reads messages from this conversation." |
| 8 | Type a reply and press Enter; it appears in the chat | "The user replies. Elsewhere only sends when the user presses Send." |
| 9 | Phone or browser on the second account: the reply arrives in Instagram | "The reply arrives in Instagram." |
| 10 | Back in the app, show the profile name and picture on the contact | "instagram_basic: the app shows the user's and contacts' names and profile pictures." |
| 11 | Instagram Connection → Disconnect | "The user can disconnect at any time. Their sign-in is removed from the PC." |

If your permission list includes others (for example `pages_show_list`, `pages_manage_metadata` or `business_management`), add one caption where each gets used. The account picker in step 4 covers `pages_show_list` and `business_management`; instant updates (step 5's "Instant updates are on") cover `pages_manage_metadata`.

## 4. Submitting

Open [App Review → Permissions and features](https://developers.facebook.com/apps/1206084318766084/app-review/permissions/). For each permission, click **Request advanced access** and fill in the form:

- **How the app uses it:** one or two plain sentences. For example: "Elsewhere Messenger is a desktop app where a business or creator reads their Instagram DMs and replies to them. We only send a message when the user types it and presses Send."
- **Screencast:** upload the same video for each permission.
- **Testing instructions:** "Download the Windows app from https://github.com/CyberStudiosTM/Elsewhere-OS/releases/tag/messenger-v0.2.21. Create an account at https://cyberthreed.github.io/CyberStudios/elsewhere-accounts/, sign in, then go to Tools → Social Accounts & Settings → Instagram Connection → Connect Instagram."

If they reject it, the notice says which permission and why. Fix exactly that and resubmit.
