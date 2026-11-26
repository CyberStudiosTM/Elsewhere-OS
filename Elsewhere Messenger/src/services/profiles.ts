import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import type { SupabaseClient } from '@supabase/supabase-js'
import { borrowingClient, cloud } from './connectedClient'
import { borrowedAccessToken } from './sessionBridge'
import type { PollData, ProfileData, ProfileDoc, WebringNav } from '../profiles/profileRender'

// Elsewhere Profiles: talks to the server functions in supabase/11_profiles.sql. The server decides what
// each viewer may see; nothing here filters privacy on the client.

export type MyProfile = {
  handle: string; display_name: string
  visibility: 'public' | 'friends' | 'private'; guestbook: 'everyone' | 'friends' | 'off'
  draft: Partial<ProfileDoc>; published: Partial<ProfileDoc> | null; published_at: string | null
  friends: { id: string; handle: string; display_name: string }[]
}

let borrowed: SupabaseClient | null = null
function client() {
  if (!cloud) throw new Error('Profiles need Elsewhere Accounts, which aren’t set up in this build.')
  // The Profile window has no sign-in of its own: it borrows the main window's.
  if (isProfileWindow()) return (borrowed ??= borrowingClient(borrowedAccessToken)) || cloud
  return cloud
}
/** Shared RPC helper for profile-related services (Exchange etc.). */
export const callProfiles = <T,>(name: string, args?: Record<string, unknown>) => call<T>(name, args)
async function call<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().rpc(name, args)
  if (error) {
    if (/function .* does not exist|Could not find the function/i.test(error.message)) throw new Error('This part of Profiles isn’t switched on yet (run the newest supabase/*.sql files).')
    throw new Error(error.message)
  }
  return data as T
}

export const getProfile = (handle: string) => call<ProfileData>('get_elsewhere_profile', { target_handle: handle.replace(/^@/, '') })
export const getMyProfile = () => call<MyProfile>('get_my_elsewhere_profile')
export const saveProfile = (doc: ProfileDoc, visibility: MyProfile['visibility'], guestbook: MyProfile['guestbook'], publish: boolean) =>
  call<{ saved: boolean; published: boolean }>('save_elsewhere_profile', { doc, page_visibility: visibility, guestbook_mode: guestbook, publish })
export const unpublishProfile = () => call<void>('unpublish_elsewhere_profile')
export const signGuestbook = (handle: string, body: string) => call<string>('sign_elsewhere_guestbook', { target_handle: handle, body })
export const removeGuestbookEntry = (id: string) => call<void>('remove_elsewhere_guestbook_entry', { entry: id })
export const postBulletin = (body: string) => call<string>('post_elsewhere_bulletin', { body })
export const deleteBulletin = (id: string) => call<void>('delete_elsewhere_bulletin', { entry: id })
/** Native widgets (needs supabase/13_profile_widgets.sql). */
export const createPoll = (question: string, options: string[]) => call<string>('create_elsewhere_poll', { question, options })
export const getPoll = (id: string) => call<PollData>('get_elsewhere_poll', { poll_id: id })
export const votePoll = (id: string, choice: number) => call<PollData>('vote_elsewhere_poll', { poll_id: id, choice })
export const countProfileView = (handle: string) => call<number | null>('count_elsewhere_profile_view', { target_handle: handle })
/** Home, discovery and webrings (needs supabase/14_profile_home.sql). */
export type HomeData = {
  bulletins: { id: string; body: string; created_at: string; handle: string; display_name: string }[]
  guestbook: { id: string; body: string; created_at: string; handle: string; display_name: string }[]
  saved: { handle: string; display_name: string }[]
  requests: number; views: number; discoverable: boolean; tags: string[]; more: boolean
}
export type Webring = { id: string; name: string; about: string; mine: boolean; status: 'pending' | 'member'; members: number; pending: string[] }
export const getHome = (before?: string) => call<HomeData>('get_elsewhere_home', before ? { before } : {})
export const setProfileSaved = (handle: string, keep: boolean) => call<void>('set_elsewhere_profile_saved', { target_handle: handle, keep })
export const setDiscovery = (discoverable: boolean, tags: string[]) => call<void>('set_elsewhere_profile_discovery', { discoverable, tags })
export const searchProfiles = (query: string, tag?: string) => call<{ handle: string; display_name: string; tags: string[] }[]>('search_elsewhere_profiles', { query, tag: tag || null })
export const randomProfile = () => call<string | null>('random_elsewhere_profile')
export const createWebring = (name: string, about: string) => call<string>('create_elsewhere_webring', { ring_name: name, ring_about: about })
export const joinWebring = (id: string) => call<string>('join_elsewhere_webring', { ring_id: id })
export const leaveWebring = (id: string) => call<void>('leave_elsewhere_webring', { ring_id: id })
export const manageWebring = (id: string, handle: string, approve: boolean) => call<void>('manage_elsewhere_webring', { ring_id: id, member_handle: handle, approve })
export const myWebrings = () => call<Webring[]>('my_elsewhere_webrings')
export const webringNav = (id: string, from: string) => call<WebringNav>('elsewhere_webring_nav', { ring_id: id, from_handle: from })
export type ProfileVersion = { id: string; created_at: string; size: number }
/** Published versions, newest first (needs supabase/12_profile_versions.sql). */
export const listProfileVersions = () => call<ProfileVersion[]>('list_my_elsewhere_profile_versions')
export const getProfileVersion = (id: string) => call<Partial<ProfileDoc>>('get_my_elsewhere_profile_version', { version_id: id })

/** The public web address of a profile (works in any browser, no install needed). */
export const PROFILE_WEB_BASE = 'https://cyberthreed.github.io/CyberStudios/elsewhere/profile.html'
export const profileWebUrl = (handle: string) => `${PROFILE_WEB_BASE}?u=${encodeURIComponent(handle)}`
/** The short free link every profile gets (served by the wiki's 404 router). */
export const profileShortUrl = (handle: string) => `https://cyberthreed.github.io/CyberStudios/@${encodeURIComponent(handle)}`
/** A tiny, free-to-host page that shows your Elsewhere profile on a domain you own. */
export function ownDomainKit(handle: string, name: string) {
  const url = profileWebUrl(handle)
  const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
  return `<!doctype html>
<!--
  Your Elsewhere profile on your own domain ♡
  1. Make a free site on GitHub Pages, Neocities or Cloudflare Pages and upload this file as index.html.
  2. In that host's settings, add your domain (for example mydigitalworld.com).
  3. At the place you bought your domain, add the DNS record the host tells you (usually a CNAME or A record).
  4. Turn on HTTPS in the host's settings. That's it: your domain now shows your Elsewhere profile,
     always up to date, because it loads the same published profile as ${url}
-->
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(name)} · Elsewhere</title>
  <link rel="canonical" href="${url}">
  <meta name="description" content="${esc(name)}'s Elsewhere profile">
  <style>html, body { margin: 0; height: 100%; background: #2f8fe0; } iframe { display: block; width: 100%; height: 100%; border: 0; }</style>
</head>
<body>
  <iframe src="${url}" title="${esc(name)}'s Elsewhere profile"></iframe>
</body>
</html>
`
}

// ---------- The Profile window ----------
export const PROFILE_LABEL = 'profile'
export function isProfileWindow() {
  if (isTauri()) return getCurrentWindow().label === PROFILE_LABEL
  return new URLSearchParams(window.location.search).has('profile')
}
/** Opens the Profile window: someone's profile (handle), or your own ('me'), optionally straight into editing. */
export async function openProfile(handle = 'me', edit = false) {
  const query = `profile=${encodeURIComponent(handle)}${edit ? '&edit=1' : ''}`
  if (!isTauri()) { window.open('/?' + query, '_blank', 'noopener'); return }
  const existing = await WebviewWindow.getByLabel(PROFILE_LABEL)
  if (existing) await existing.close().catch(() => {})
  const win = new WebviewWindow(PROFILE_LABEL, {
    url: 'index.html?' + query, title: 'Elsewhere Profile', width: 1120, height: 780, minWidth: 560, minHeight: 480,
    center: true, decorations: false, resizable: true, maximizable: true, minimizable: true, closable: true, focus: true,
  })
  await win.once('tauri://error', event => { console.error('Profile window error', event.payload) })
}
