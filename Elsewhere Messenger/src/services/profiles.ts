import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import type { SupabaseClient } from '@supabase/supabase-js'
import { borrowingClient, cloud } from './connectedClient'
import { borrowedAccessToken } from './sessionBridge'
import type { ProfileData, ProfileDoc } from '../profiles/profileRender'

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
async function call<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().rpc(name, args)
  if (error) {
    if (/function .* does not exist|Could not find the function/i.test(error.message)) throw new Error('Profiles aren’t switched on for Elsewhere Accounts yet.')
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
export type ProfileVersion = { id: string; created_at: string; size: number }
/** Published versions, newest first (needs supabase/12_profile_versions.sql). */
export const listProfileVersions = () => call<ProfileVersion[]>('list_my_elsewhere_profile_versions')
export const getProfileVersion = (id: string) => call<Partial<ProfileDoc>>('get_my_elsewhere_profile_version', { version_id: id })

/** The public web address of a profile (works in any browser, no install needed). */
export const PROFILE_WEB_BASE = 'https://cyberthreed.github.io/CyberStudios/elsewhere/profile.html'
export const profileWebUrl = (handle: string) => `${PROFILE_WEB_BASE}?u=${encodeURIComponent(handle)}`

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
