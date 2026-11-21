import { invoke, isTauri } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { fetch as nativeFetch } from '@tauri-apps/plugin-http'
import type { User } from '@supabase/supabase-js'
import {
  ACCOUNT_SIGNUP_URL, bootElsewhereAccounts, forgetElsewhereAccount, cloud, cloudAccountStatus, cloudReady, cloudSignOut, currentCloudUser,
  getMyCloudProfile, signInWithCloudPassword, skipAccountRestore,
} from './connectedClient'
import {
  completeLocalSignIn, endLocalSession, getLocalSession, type LocalPresence,
} from './localSession'

// The main window's sign-in is the Elsewhere account. Social connections are
// stored per account, so they load only after the account is known.

const RESUME_ONCE = 'elsewhere.resume-after-reload'
const SOCIAL_EVENT = 'elsewhere:social-account'
let socialAccount: string | null = null

export function getSocialAccount() { return socialAccount }
export function watchSocialAccount(action: () => void) {
  window.addEventListener(SOCIAL_EVENT, action)
  return () => window.removeEventListener(SOCIAL_EVENT, action)
}
async function setSocialAccount(account: string | null) {
  if (isTauri()) await invoke('set_social_account', { account })
  socialAccount = account
  window.dispatchEvent(new Event(SOCIAL_EVENT))
}

/** Finishes signing in the main window as this account, if its profile is ready. */
export async function completeMainSignIn(user: User, presence?: LocalPresence) {
  if (await cloudAccountStatus() !== 'ready') return false
  const profile = await getMyCloudProfile(user.id)
  if (!profile) return false
  if (socialAccount && socialAccount !== user.id) {
    // Another account's connections are live in this window; start clean.
    try { sessionStorage.setItem(RESUME_ONCE, 'yes') } catch { /* sign in again manually */ }
    window.location.reload()
    return true
  }
  await setSocialAccount(user.id)
  completeLocalSignIn(profile.handle, presence ?? getLocalSession().profile?.presence ?? 'Online')
  return true
}

export async function signInMain(email: string, password: string, presence: LocalPresence, remember: boolean) {
  if (!cloudReady) throw new Error('Elsewhere Accounts aren’t connected in this build.')
  const user = await signInWithCloudPassword(email, password, remember)
  if (!await completeMainSignIn(user, presence)) {
    throw new Error('Finish setting up this account (terms and handle) in Tools → Elsewhere Accounts & Messages, then sign in.')
  }
}

/** On startup, resume only a saved account sign-in, never a bare local name. */
export async function restoreMainAccount() {
  let resumeOnce = false
  try { resumeOnce = sessionStorage.getItem(RESUME_ONCE) === 'yes'; sessionStorage.removeItem(RESUME_ONCE) } catch { /* none */ }
  const local = getLocalSession()
  if (!cloudReady || (!local.signedIn && !resumeOnce)) {
    skipAccountRestore()
    if (local.signedIn) endLocalSession()
    await setSocialAccount(null)
    return
  }
  try {
    await bootElsewhereAccounts()
    const user = await currentCloudUser()
    if (user && await completeMainSignIn(user)) return
  } catch (error) {
    console.error('Elsewhere sign-in could not be restored:', error)
  }
  await setSocialAccount(null)
  if (getLocalSession().signedIn) endLocalSession()
}

/** Signs the main window out of its Elsewhere account and drops its social connections. */
export async function signOutMain(switchAccount = false) {
  try {
    const { data } = cloud ? await cloud.auth.getSession() : { data: { session: null } }
    if (data.session) await cloudSignOut()
  } finally {
    endLocalSession(switchAccount)
    await setSocialAccount(null).catch(console.error)
    window.location.reload()
  }
}

const DELETE_HELPER = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) || '').trim().replace(/\/$/, '') + '/functions/v1/elsewhere-account-delete'

/** Permanently deletes the signed-in Elsewhere account, its server data and this PC's saved connections. */
export async function deleteMainAccount(password: string) {
  if (!cloud || !isTauri()) throw new Error('Deleting an account only works in the Elsewhere Messenger app.')
  const session = (await cloud.auth.getSession()).data.session
  if (!session) throw new Error('Sign in to Elsewhere first.')
  const response = await nativeFetch(DELETE_HELPER, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  const body = await response.json().catch(() => ({})) as { deleted?: boolean; message?: string }
  if (!response.ok || !body.deleted) throw new Error(body.message || 'Your account couldn’t be deleted right now.')
  // The account is gone; clear what this PC kept for it.
  await invoke('forget_social_connections').catch(console.error)
  await cloud.auth.signOut({ scope: 'local' }).catch(() => {})
  await forgetElsewhereAccount(session.user.id).catch(() => {})
  endLocalSession()
  await setSocialAccount(null).catch(console.error)
  window.location.reload()
}

export function openSignupPage() {
  if (isTauri()) void openUrl(ACCOUNT_SIGNUP_URL).catch(error => window.alert(String(error)))
  else window.open(ACCOUNT_SIGNUP_URL, '_blank', 'noopener,noreferrer')
}

export function moveOldSocialConnections() {
  return invoke<string[]>('adopt_legacy_social_connections')
}
export function hasOldSocialConnections() {
  return isTauri() ? invoke<boolean>('has_legacy_social_connections') : Promise.resolve(false)
}
